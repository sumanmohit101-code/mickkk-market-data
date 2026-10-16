"""Company ka total ORDER BOOK (pending orders) nikalta hai: NSE ke Investor Presentation /
Press Release / Result announcements ke PDF se, Gemini ki madad se.
Output: data/orderbook.json (har company ki order-book history)."""
import base64
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

IST = timezone(timedelta(hours=5, minutes=30))
LOOKBACK = int(sys.argv[1]) if len(sys.argv) > 1 else 3
MAX_RUN = int(sys.argv[2]) if len(sys.argv) > 2 else 30
OUT = "data/orderbook.json"
API = "https://www.nseindia.com/api/corporate-announcements"
KEY = os.environ.get("GEMINI_API_KEY", "")
MODELS = [m for m in [os.environ.get("GEMINI_MODEL"), "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] if m]
MIDX = 0
WANT = re.compile(r"investor presentation|press release|earnings call|analyst|financial result|outcome of board", re.I)
MAX_PDF = 12 * 1024 * 1024
KEEP_DAYS = 5 * 365

PROMPT = """This is an Indian listed company's investor presentation / press release / results document.
Return ONLY JSON:
- has_order_book: true only if the document states the company's TOTAL outstanding order book / order backlog / unexecuted orders (not a single new order).
- order_book_cr: that total in INR crore as a number (1 lakh crore = 100000; USD/other currency -> null)
- as_of: date the order book is stated as of, YYYY-MM-DD (use quarter-end date if only quarter is given), else null
Never guess. Use null if not clearly stated."""

s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                  "Accept": "application/json, text/plain, */*", "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements"})


def fetch_range(a, b):
    for i in range(1, 4):
        try:
            r = s.get(API, params={"index": "equities", "from_date": a.strftime("%d-%m-%Y"), "to_date": b.strftime("%d-%m-%Y")}, timeout=60)
            if r.status_code == 200 and isinstance(r.json(), list):
                return r.json()
            print("  HTTP", r.status_code)
        except Exception as exc:
            print("  fetch fail", exc)
        time.sleep(4 * i)
    return []


def pdf_bytes(url):
    try:
        r = s.get(url, timeout=60)
        if r.status_code == 200 and "pdf" in r.headers.get("Content-Type", "").lower() and len(r.content) <= MAX_PDF:
            return r.content
    except Exception as exc:
        print("  pdf fail", exc)
    return None


def ask(pdf):
    global MIDX
    body = {"contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(pdf).decode()}}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
    while MIDX < len(MODELS):
        r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{MODELS[MIDX]}:generateContent", json=body, timeout=120,
                          headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
        if r.status_code == 404:
            MIDX += 1
            continue
        if r.status_code == 429:
            return "RATE"
        if r.status_code != 200:
            print("  HTTP", r.status_code, r.text[:150])
            return None
        try:
            o = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
            return o[0] if isinstance(o, list) and o else o
        except Exception as exc:
            print("  bad response", exc)
            return None
    return "NOMODEL"


def main():
    if not KEY:
        raise SystemExit("GEMINI_API_KEY missing")
    db = {"companies": {}, "done": {}, "tries": {}}
    if os.path.exists(OUT):
        try:
            db.update(json.load(open(OUT, encoding="utf-8")))
        except Exception as exc:
            print("old file unreadable:", exc)
    s.get("https://www.nseindia.com/", timeout=30)
    today = datetime.now(IST).date()
    rows, d = [], today
    while d > today - timedelta(days=LOOKBACK):
        a = max(d - timedelta(days=6), today - timedelta(days=LOOKBACK))
        rows += fetch_range(a, d)
        d = a - timedelta(days=1)
    todo = []
    for r in rows:
        f = str(r.get("attchmntFile") or "")
        if not f.lower().endswith(".pdf") or not WANT.search(str(r.get("desc", ""))):
            continue
        uid = str(r.get("seq_id") or hashlib.md5(f.encode()).hexdigest())
        if uid in db["done"] or db["tries"].get(uid, 0) >= 3:
            continue
        todo.append((uid, r))
    todo.sort(key=lambda x: str(x[1].get("an_dt", "")), reverse=True)
    print("Announcements:", len(rows), "| pending PDFs:", len(todo), "| this run:", min(len(todo), MAX_RUN))
    found = 0
    for uid, r in todo[:MAX_RUN]:
        sym = str(r.get("symbol", "")).strip().upper()
        pdf = pdf_bytes(r["attchmntFile"])
        if pdf is None:
            db["tries"][uid] = db["tries"].get(uid, 0) + 1
            continue
        res = ask(pdf)
        if res in ("RATE", "NOMODEL"):
            print("Stopping:", res)
            break
        if not isinstance(res, dict):
            db["tries"][uid] = db["tries"].get(uid, 0) + 1
            time.sleep(6)
            continue
        db["done"][uid] = 1
        v, asof = res.get("order_book_cr"), res.get("as_of")
        if res.get("has_order_book") and isinstance(v, (int, float)) and v > 0 and asof:
            c = db["companies"].setdefault(sym, {"name": r.get("sm_name", sym), "points": []})
            pts = [p for p in c["points"] if p["asOf"] != asof]
            pts.append({"asOf": str(asof)[:10], "value_cr": round(float(v), 2), "announced": str(r.get("an_dt", ""))[:11], "pdf": r["attchmntFile"]})
            c["points"] = sorted(pts, key=lambda p: p["asOf"])
            found += 1
            print(sym, asof, v)
        time.sleep(6)
    cut = (today - timedelta(days=KEEP_DAYS)).isoformat()
    for c in db["companies"].values():
        c["points"] = [p for p in c["points"] if p["asOf"] >= cut]
    db["updatedAt"] = datetime.now(timezone.utc).isoformat()
    db["unit"] = "INR crore"
    os.makedirs("data", exist_ok=True)
    json.dump(db, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Done. order books found={found} companies={len(db['companies'])}")


if __name__ == "__main__":
    main()
