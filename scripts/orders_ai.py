import base64
import glob
import json
import os
import sys
import time

import requests

MODEL = "gemini-2.5-flash-lite"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
KEY = os.environ.get("GEMINI_API_KEY", "")
MAX_PER_RUN = int(sys.argv[1]) if len(sys.argv) > 1 else 40
PAUSE = 6  # seconds between calls (~10 per minute, free tier ke liye safe)
MAX_PDF_BYTES = 4 * 1024 * 1024

PROMPT = """You read a stock exchange announcement from an Indian listed company.
Return ONLY JSON with these keys:
- is_order: true only if the company received, won or was awarded a business order/contract/LOA. false for results, dividends, meetings, appointments, etc.
- customer: name or description of the customer, or null
- value_inr_crore: total order value converted to INR crore as a number, ONLY if an INR amount is stated (1 crore = 10 million, 1 lakh = 0.01 crore). null if not stated or if only a foreign currency is given.
- foreign_value: e.g. "USD 50 million" if the amount is in a foreign currency, else null
- duration_months: execution period in months as a number, or null
- order_type: short label like "Supply", "EPC", "Service", "Export", or null
Never guess. Use null when the text does not say it.

Announcement:
"""

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://www.nseindia.com/",
})


def get_pdf(url):
    if not url or not str(url).lower().endswith(".pdf"):
        return None
    try:
        r = session.get(url, timeout=30)
        ctype = r.headers.get("Content-Type", "").lower()
        if r.status_code == 200 and "pdf" in ctype and len(r.content) <= MAX_PDF_BYTES:
            return r.content
    except Exception as exc:
        print("  PDF fetch failed:", exc)
    return None


def ask(rec):
    parts = [{"text": PROMPT + (rec.get("text") or "")}]
    # Text mein value nahi hai to PDF bhi try karo
    if rec.get("value_cr") is None:
        pdf = get_pdf(rec.get("pdf"))
        if pdf:
            parts.append({"inline_data": {"mime_type": "application/pdf",
                                          "data": base64.b64encode(pdf).decode()}})
    body = {"contents": [{"parts": parts}],
            "generationConfig": {"responseMimeType": "application/json",
                                 "temperature": 0}}
    r = session.post(URL, json=body, timeout=90,
                     headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    if r.status_code == 429:
        return "RATE_LIMIT"
    if r.status_code != 200:
        print("  HTTP", r.status_code, r.text[:200])
        return None
    try:
        txt = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        out = json.loads(txt)
        return out[0] if isinstance(out, list) and out else out
    except Exception as exc:
        print("  Bad response:", exc)
        return None


def num(v):
    try:
        f = float(v)
        return f if f >= 0 else None
    except Exception:
        return None


def main():
    if not KEY:
        raise SystemExit("GEMINI_API_KEY missing (GitHub Secret check karo).")

    files = sorted(glob.glob("data/orders/*.json"), reverse=True)
    data = {}
    todo = []
    for p in files:
        try:
            with open(p, encoding="utf-8") as f:
                j = json.load(f)
        except Exception as exc:
            print("Skip", p, exc)
            continue
        data[p] = j
        for r in j.get("records", []):
            if not r.get("ai_done"):
                todo.append((p, r))
    todo.sort(key=lambda x: (x[1]["date"], x[1].get("time", "")), reverse=True)
    print("Pending:", len(todo), "| this run:", min(len(todo), MAX_PER_RUN))

    done = failed = 0
    touched = set()
    for p, rec in todo[:MAX_PER_RUN]:
        res = ask(rec)
        if res == "RATE_LIMIT":
            print("Rate limit hit, stopping. Baaki kal.")
            break
        if not isinstance(res, dict):
            failed += 1
            time.sleep(PAUSE)
            continue

        rec["ai_done"] = True
        rec["ai_is_order"] = bool(res.get("is_order"))
        rec["customer"] = (res.get("customer") or None)
        rec["duration_months"] = num(res.get("duration_months"))
        rec["order_type"] = res.get("order_type") or None
        v = num(res.get("value_inr_crore"))
        if v is not None and rec.get("value_cr") is None:
            rec["value_cr"] = round(v, 2)
            rec["value_source"] = "ai"
        if res.get("foreign_value") and not rec.get("foreign_value"):
            rec["foreign_value"] = str(res["foreign_value"])[:60]
        touched.add(p)
        done += 1
        print(rec["date"], rec["symbol"], "->", rec["customer"], rec["value_cr"], rec["duration_months"])
        time.sleep(PAUSE)

    for p in touched:
        j = data[p]
        j["recordCount"] = len(j["records"])
        with open(p, "w", encoding="utf-8") as f:
            json.dump(j, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Done. processed={done} failed={failed} files_updated={len(touched)}")


if __name__ == "__main__":
    main()
