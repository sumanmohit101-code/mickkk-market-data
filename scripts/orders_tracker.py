import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

IST = timezone(timedelta(hours=5, minutes=30))
KEEP_DAYS = 5 * 365  # 5 saal
API = "https://www.nseindia.com/api/corporate-announcements"
DIR = "data/orders"
SUMMARY = "data/orders-summary.json"

ORDER_TEXT = re.compile(
    r"\b(order|orders|loa|letter of award|letter of intent|work order|contract)\b", re.I
)
ACTION = re.compile(
    r"\b(receiv|bagg|secur|award|win|won|bag|emerged|l1|l-1|l 1)\w*", re.I
)

session = requests.Session()
session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
})


def warm_up():
    for u in ("https://www.nseindia.com/",
              "https://www.nseindia.com/companies-listing/corporate-filings-announcements"):
        try:
            session.get(u, timeout=30)
        except Exception as exc:
            print("Warm-up failed (continuing):", exc)


def fetch(from_d, to_d):
    params = {
        "index": "equities",
        "from_date": from_d.strftime("%d-%m-%Y"),
        "to_date": to_d.strftime("%d-%m-%Y"),
    }
    for a in range(1, 5):
        try:
            r = session.get(API, params=params, timeout=60)
            print("HTTP:", r.status_code, "Size:", len(r.content))
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            data = r.json()
            if not isinstance(data, list):
                raise RuntimeError("Unexpected response shape")
            return data
        except Exception as exc:
            print(f"Fetch failed {a}/4:", exc)
            time.sleep(4 * a)
    return None


# ---------- order value extraction ----------
AMT = re.compile(
    r"(?P<cur>₹|rs\.?|inr|usd|us\$|\$|eur|€|gbp|£)\s*(?P<num>\d[\d,]*\.?\d*)\s*"
    r"(?P<unit>crores?|crs?\.?|lakhs?|lacs?|million|mn|billion|bn)?",
    re.I,
)
AMT_SUFFIX = re.compile(
    r"(?P<num>\d[\d,]*\.?\d*)\s*(?P<unit>crores?|crs?\.?|lakhs?|lacs?)\b", re.I
)


def to_crore(num, unit):
    unit = (unit or "").lower()
    if unit.startswith(("crore", "cr")):
        return num
    if unit.startswith(("lakh", "lac")):
        return num / 100.0
    if unit in ("million", "mn"):
        return num / 10.0
    if unit in ("billion", "bn"):
        return num * 100.0
    return num / 1e7  # plain rupees


def extract_value(text):
    """(value_in_inr_crore, foreign_text). Pehla INR amount lete hain."""
    foreign = None
    for m in AMT.finditer(text):
        cur = m.group("cur").lower()
        try:
            n = float(m.group("num").replace(",", ""))
        except ValueError:
            continue
        unit = m.group("unit")
        if cur in ("₹", "rs", "rs.", "inr"):
            return round(to_crore(n, unit), 2), foreign
        foreign = foreign or f"{m.group('cur')} {m.group('num')} {unit or ''}".strip()
    m = AMT_SUFFIX.search(text)
    if m:
        try:
            return round(to_crore(float(m.group("num").replace(",", "")),
                                  m.group("unit")), 2), foreign
        except ValueError:
            pass
    return None, foreign


def is_order(desc, text):
    if re.search(r"bagging|receipt of order|award of order", desc, re.I):
        return True
    return bool(ORDER_TEXT.search(text) and ACTION.search(text)
                and re.search(r"order|loa|award|contract", desc + " " + text, re.I))


def parse_date(s):
    for fmt in ("%d-%b-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d-%b-%Y"):
        try:
            return datetime.strptime(str(s).strip(), fmt)
        except Exception:
            continue
    return None


def rec_key(r):
    """Har announcement ki apni pakki ID: company + date/time + PDF (ya text).
    NSE ka seq_id par bharosa nahi karte (wo din badalne par repeat ho sakta hai)."""
    basis = r.get("pdf") or str(r.get("text", ""))[:200]
    raw = f"{r.get('symbol', '')}|{r.get('date', '')} {r.get('time', '')}|{basis}"
    return hashlib.md5(raw.encode()).hexdigest()


def make_record(row):
    desc = str(row.get("desc", "")).strip()
    text = str(row.get("attchmntText", "")).strip()
    if not is_order(desc, text):
        return None
    dt = parse_date(row.get("an_dt") or row.get("sort_date"))
    if dt is None:
        return None
    symbol = str(row.get("symbol", "")).strip()
    value, foreign = extract_value(text)
    rec = {
        "date": dt.strftime("%Y-%m-%d"),
        "time": dt.strftime("%H:%M:%S"),
        "symbol": symbol,
        "company": str(row.get("sm_name", "")).strip(),
        "category": desc,
        "text": text[:600],
        "value_cr": value,
        "foreign_value": foreign,
        "pdf": row.get("attchmntFile"),
    }
    rec["id"] = rec_key(rec)
    return rec


# ---------- storage (monthly files) ----------
def month_path(ym):
    return os.path.join(DIR, f"{ym}.json")


def load_month(ym):
    """Purani ID wali records ko nayi pakki ID par le aata hai (migration).
    File padhne mein dikkat ho to ruk jaata hai, kabhi khaali se overwrite nahi karta."""
    p = month_path(ym)
    if not os.path.exists(p):
        return {}
    try:
        with open(p, encoding="utf-8") as f:
            recs = json.load(f).get("records", [])
    except Exception as exc:
        raise SystemExit(f"STOP: {p} padh nahi paaya ({exc}). Overwrite nahi karunga.")
    out = {}
    for r in recs:
        r["id"] = rec_key(r)
        out[r["id"]] = r
    return out


def save_month(ym, store):
    records = sorted(store.values(), key=lambda r: (r["date"], r["time"]), reverse=True)
    p = month_path(ym)
    if os.path.exists(p):
        try:
            with open(p, encoding="utf-8") as f:
                if json.load(f).get("records") == records:
                    return False
        except Exception:
            pass
    os.makedirs(DIR, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump({"month": ym, "source": "NSE", "unit": "INR crore",
                   "recordCount": len(records), "records": records},
                  f, ensure_ascii=False, separators=(",", ":"))
    return True


def cleanup(today):
    cutoff = today - timedelta(days=KEEP_DAYS)
    cutoff_ym = cutoff.strftime("%Y-%m")
    removed = 0
    if not os.path.isdir(DIR):
        return
    for name in sorted(os.listdir(DIR)):
        m = re.fullmatch(r"(\d{4}-\d{2})\.json", name)
        if not m:
            continue
        ym = m.group(1)
        if ym < cutoff_ym:
            os.remove(os.path.join(DIR, name))
            removed += 1
            print("Deleted old file:", name)
        elif ym == cutoff_ym:
            store = load_month(ym)
            kept = {k: v for k, v in store.items() if v["date"] >= cutoff.strftime("%Y-%m-%d")}
            if len(kept) != len(store):
                if kept:
                    save_month(ym, kept)
                else:
                    os.remove(os.path.join(DIR, name))
                print("Trimmed", name)
    print("Old files removed:", removed)


def build_summary(today):
    """Pichhle 90 din ka ranking."""
    recs = []
    for i in range(4):
        d = (today.replace(day=1) - timedelta(days=30 * i))
        recs.extend(load_month(d.strftime("%Y-%m")).values())
    recs = {r["id"]: r for r in recs}.values()

    def window(days):
        c = (today - timedelta(days=days)).strftime("%Y-%m-%d")
        agg = {}
        for r in recs:
            if r["date"] < c:
                continue
            a = agg.setdefault(r["symbol"], {
                "symbol": r["symbol"], "company": r["company"],
                "orders": 0, "orders_with_value": 0, "total_value_cr": 0.0})
            a["orders"] += 1
            if r["value_cr"] is not None:
                a["orders_with_value"] += 1
                a["total_value_cr"] = round(a["total_value_cr"] + r["value_cr"], 2)
        return sorted(agg.values(),
                      key=lambda x: (x["total_value_cr"], x["orders"]), reverse=True)[:100]

    out = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "unit": "INR crore",
        "note": "total_value_cr sirf un orders ka hai jinme INR value text mein mili",
        "last30days": window(30),
        "last90days": window(90),
        "latest": sorted(recs, key=lambda r: (r["date"], r["time"]), reverse=True)[:50],
    }
    os.makedirs("data", exist_ok=True)
    with open(SUMMARY, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


def main():
    lookback = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    today = datetime.now(IST).date()
    warm_up()

    rows = fetch(today - timedelta(days=lookback), today)
    if rows is None:
        raise SystemExit("Could not fetch announcements from NSE.")
    print("Announcements fetched:", len(rows))

    by_month = {}
    kept = 0
    for row in rows:
        rec = make_record(row)
        if not rec:
            continue
        kept += 1
        by_month.setdefault(rec["date"][:7], []).append(rec)
    print("Order announcements:", kept)

    changed = 0
    for ym, recs in by_month.items():
        store = load_month(ym)
        before = len(store)
        for r in recs:
            store.setdefault(r["id"], r)   # purani (AI se bhari) record ko overwrite nahi karte
        if len(store) < before:
            raise SystemExit(f"STOP: {ym} mein records kam ho rahe hain ({before} -> {len(store)}).")
        if save_month(ym, store):
            changed += 1
        print(f"{ym}: {before} -> {len(store)} records")
    print("Month files updated:", changed)

    cleanup(today)
    build_summary(today)
    print("Done.")


if __name__ == "__main__":
    main()
