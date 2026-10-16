"""Sector / industry equal-weight indices, tumhari repo ke candle files se.

Input : data/sector-map.json, data/<A-Z|0-9>/<SYMBOL>.json, data/indices/NIFTY500.json
Output: data/sectors.json        (chart series, 100 par rebased)
        data/sector-stocks.json  (har stock ke returns + sector/industry)
"""
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 1300   # kitne trading days chart mein
OUTLIER = 0.25    # ek din mein |return| > 25% ho to us stock ka us din ka return ignore
              # (split/bonus ki wajah se unadjusted price girna pakadne ke liye)
LOOKBACKS = {"r1d": 1, "r1w": 5, "r1m": 21, "r3m": 63, "r6m": 126, "r1y": 252}


def load_candles(path):
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    arr = raw if isinstance(raw, list) else raw.get("candles", [])
    out = {}
    for c in arr:
        try:
            t = str(c["time"])[:10]
            v = float(c["close"])
        except Exception:
            continue
        if v > 0:
            out[t] = v
    return pd.Series(out).sort_index() if out else None


def stock_path(sym):
    first = sym[:1]
    folder = first if first.isalpha() and first.isupper() else "0-9"
    return os.path.join("data", folder, f"{sym}.json")


def main():
    with open("data/sector-map.json", encoding="utf-8") as f:
        smap = json.load(f)
    stocks = smap["stocks"]

    bench = None
    p = "data/indices/NIFTY500.json"
    if os.path.exists(p):
        bench = load_candles(p)

    series, missing = {}, []
    for sym in stocks:
        p = stock_path(sym)
        if not os.path.exists(p):
            missing.append(sym)
            continue
        try:
            s = load_candles(p)
        except Exception as exc:
            print("Bad file", p, exc)
            continue
        if s is not None and len(s) > 5:
            series[sym] = s
    print(f"Stocks with data: {len(series)} / {len(stocks)} (missing files: {len(missing)})")
    if not series:
        raise SystemExit("Koi stock file nahi mili. Path/format check karo (data/A/ABB.json).")

    if bench is not None and len(bench) > 50:
        dates = list(bench.index[-DAYS:])
    else:
        print("NIFTY500 nahi mila, stock dates se kaam chala rahe hain.")
        dates = sorted(set().union(*[set(s.index) for s in series.values()]))[-DAYS:]

    closes = pd.DataFrame(series).reindex(dates)
    closes = closes.ffill(limit=5)
    rets = closes.pct_change(fill_method=None)
    flagged = int((rets.abs() > OUTLIER).sum().sum())
    rets = rets.mask(rets.abs() > OUTLIER)
    print("Outlier returns ignored (split/bonus?):", flagged)

    def build(cols):
        m = rets[cols].mean(axis=1, skipna=True).fillna(0.0)
        m.iloc[0] = 0.0
        return 100 * (1 + m).cumprod()

    groups = {}
    sec_cols, ind_cols = {}, {}
    for sym in closes.columns:
        info = stocks[sym]
        sec_cols.setdefault(info["sector"], []).append(sym)
        ind_cols.setdefault(info["industry"], []).append(sym)

    last_r = rets.iloc[-1]
    for kind, cmap in (("sector", sec_cols), ("industry", ind_cols)):
        for name, cols in cmap.items():
            idx = build(cols)
            lr = last_r[cols].dropna()
            groups[f"{kind}:{name}"] = {
                "type": kind,
                "name": name,
                "parent": smap["industries"].get(name, {}).get("sector") if kind == "industry" else None,
                "stocks": len(cols),
                "up": int((lr > 0).sum()),
                "down": int((lr < 0).sum()),
                "series": [round(float(x), 2) for x in idx.values],
            }

    out = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "weighting": "equal",
        "asOf": str(dates[-1]),
        "dates": [str(d) for d in dates],
        "benchmark": ([round(float(x), 2) for x in (bench.reindex(dates).ffill() / bench.reindex(dates).ffill().iloc[0] * 100).values]
                      if bench is not None and len(bench) > 50 else None),
        "groups": groups,
    }
    with open("data/sectors.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    rows = {}
    for sym in closes.columns:
        c = closes[sym].dropna()
        if c.empty:
            continue
        row = {"name": stocks[sym]["name"], "sector": stocks[sym]["sector"],
               "industry": stocks[sym]["industry"], "close": round(float(c.iloc[-1]), 2)}
        for k, n in LOOKBACKS.items():
            if len(c) > n and c.iloc[-1 - n] > 0:
                row[k] = round(float(c.iloc[-1] / c.iloc[-1 - n] - 1) * 100, 2)
        rows[sym] = row
    with open("data/sector-stocks.json", "w", encoding="utf-8") as f:
        json.dump({"updatedAt": out["updatedAt"], "asOf": out["asOf"], "unit": "percent", "stocks": rows},
                  f, ensure_ascii=False, separators=(",", ":"))

    print(f"Groups: {len(groups)} | days: {len(dates)} | asOf {dates[-1]}")
    print("sectors.json KB:", os.path.getsize("data/sectors.json") // 1024)


if __name__ == "__main__":
    main()
