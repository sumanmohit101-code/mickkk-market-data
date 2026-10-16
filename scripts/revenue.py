import glob
import json
import math
import os
import time
from datetime import datetime, timezone

import yfinance as yf

OUT = "data/revenue.json"
MAX_FAILS_IN_ROW = 25


def symbols():
    s = set()
    for p in glob.glob("data/orders/*.json"):
        try:
            with open(p, encoding="utf-8") as f:
                for r in json.load(f).get("records", []):
                    if r.get("symbol"):
                        s.add(r["symbol"].strip().upper())
        except Exception as exc:
            print("Skip", p, exc)
    return sorted(s)


def get_revenue_cr(sym):
    """Latest annual Total Revenue in INR crore, ya None."""
    for suffix in (".NS", ".BO"):
        try:
            inc = yf.Ticker(sym + suffix).income_stmt
            if inc is None or inc.empty or "Total Revenue" not in inc.index:
                continue
            row = inc.loc["Total Revenue"].dropna()
            if row.empty:
                continue
            val = float(row.iloc[0])
            if math.isnan(val) or val <= 0:
                continue
            return round(val / 1e7, 2), str(row.index[0])[:10]
        except Exception as exc:
            print(f"  {sym}{suffix}: {exc}")
    return None


def get_mcap_cr(sym):
    for suffix in (".NS", ".BO"):
        try:
            v = yf.Ticker(sym + suffix).fast_info["market_cap"]
            if v and v > 0:
                return round(float(v) / 1e7, 1)
        except Exception:
            pass
    return None


def main():
    old = {}
    meta = {}
    mcap = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as f:
                j = json.load(f)
            old = j.get("revenue", {})
            meta = j.get("fiscalYearEnd", {})
            mcap = j.get("marketCap", {})
        except Exception as exc:
            print("Could not read old file:", exc)

    syms = symbols()
    print("Symbols to check:", len(syms))
    if not syms:
        raise SystemExit("No symbols found in data/orders/. Run the orders workflow first.")

    revenue = dict(old)
    ok = miss = row_fail = 0
    for i, sym in enumerate(syms, 1):
        res = get_revenue_cr(sym)
        if res:
            revenue[sym], meta[sym] = res
            ok += 1
            row_fail = 0
            m = get_mcap_cr(sym)
            if m:
                mcap[sym] = m
        else:
            miss += 1
            row_fail += 1
            print("No revenue:", sym)
        if row_fail >= MAX_FAILS_IN_ROW:
            print("Too many failures in a row (Yahoo may be blocking). Stopping.")
            break
        if i % 25 == 0:
            print(f"Progress {i}/{len(syms)}  ok={ok} miss={miss}")
        time.sleep(1.2)

    if ok == 0:
        raise SystemExit("No revenue fetched. Old file kept.")

    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "Yahoo Finance (yfinance)",
            "unit": "INR crore, annual",
            "revenue": dict(sorted(revenue.items())),
            "fiscalYearEnd": dict(sorted(meta.items())),
            "marketCap": dict(sorted(mcap.items())),
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Done. fetched={ok} missing={miss} total_in_file={len(revenue)}")


if __name__ == "__main__":
    main()
