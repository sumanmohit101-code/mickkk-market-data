import io
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

IST = timezone(timedelta(hours=5, minutes=30))
KEEP_DAYS = 730
ARCH = "https://nsearchives.nseindia.com/content/"
CASH_API = "https://www.nseindia.com/api/fiidiiTradeReact"

PATHS = {
    "cash": "data/fii-dii-cash-history.json",
    "fo": "data/fii-stats-fo-history.json",
    "part": "data/participant-history.json",
}

HARD_FAILS = 0  # block/timeout count (404 isko count nahi karta)

session = requests.Session()
session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
    "Connection": "keep-alive",
})


def warm_up():
    for u in ("https://www.nseindia.com/", "https://www.nseindia.com/reports/fii-dii"):
        try:
            session.get(u, timeout=30)
        except Exception as exc:
            print("Warm-up failed (continuing):", exc)


def get(url, retries=2):
    """bytes return karta hai. 404 ya fail par None."""
    global HARD_FAILS
    for a in range(1, retries + 1):
        try:
            r = session.get(url, timeout=60)
            if r.status_code == 404:
                return None
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            ctype = r.headers.get("Content-Type", "").lower()
            if "html" in ctype or len(r.content) < 50:
                raise RuntimeError("blocked/empty response")
            return r.content
        except Exception as exc:
            print(f"  fail {a}/{retries}: {url} -> {exc}")
            time.sleep(3 * a)
    HARD_FAILS += 1
    return None


def num(v):
    try:
        f = float(str(v).replace(",", "").strip())
        return None if math.isnan(f) else f
    except Exception:
        return None


def snake(c):
    return str(c).strip().lower().replace(" ", "_").replace(".", "")


# ---------- storage ----------
def load(key):
    path = PATHS[key]
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return {r["date"]: r for r in json.load(f).get("records", [])}
        except Exception as exc:
            print("Could not read", path, exc)
    return {}


def save(key, store, unit="INR crore"):
    if not store:
        return
    path = PATHS[key]
    latest = max(store)
    cutoff = (
        datetime.strptime(latest, "%Y-%m-%d") - timedelta(days=KEEP_DAYS)
    ).strftime("%Y-%m-%d")
    records = [store[k] for k in sorted(store, reverse=True) if k >= cutoff]

    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                if json.load(f).get("records") == records:
                    print(f"[{key}] already up to date")
                    return
        except Exception:
            pass

    os.makedirs("data", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "NSE",
            "unit": unit,
            "keepDays": KEEP_DAYS,
            "recordCount": len(records),
            "records": records,
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[{key}] saved {len(records)} records (latest {latest})")


# ---------- cash (equity) FII/DII ----------
def update_cash():
    store = load("cash")
    raw = None
    for a in range(1, 5):
        try:
            r = session.get(
                CASH_API, timeout=60,
                headers={"Accept": "application/json, text/plain, */*",
                         "Referer": "https://www.nseindia.com/reports/fii-dii"},
            )
            print("Cash API HTTP:", r.status_code)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            raw = r.json()
            if not isinstance(raw, list) or not raw:
                raise RuntimeError("Unexpected response shape")
            break
        except Exception as exc:
            print("Cash fetch failed:", exc)
            raw = None
            time.sleep(4 * a)
    if raw is None:
        print("Cash data skipped (fetch failed)")
        return

    days = {}
    for row in raw:
        cat = str(row.get("category", "")).upper()
        if "FII" in cat or "FPI" in cat:
            k = "fii"
        elif "DII" in cat:
            k = "dii"
        else:
            continue
        try:
            d = datetime.strptime(str(row["date"]).strip(), "%d-%b-%Y")
        except Exception:
            continue
        days.setdefault(d.strftime("%Y-%m-%d"), {})[k] = {
            "buy": num(row.get("buyValue")),
            "sell": num(row.get("sellValue")),
            "net": num(row.get("netValue")),
        }
    for iso, v in days.items():
        if "fii" in v and "dii" in v:
            store[iso] = {"date": iso, "fii": v["fii"], "dii": v["dii"]}
    save("cash", store)


# ---------- FII F&O stats (xls) ----------
SEGMENTS = [
    ("INDEX FUTURES", "index_futures"),
    ("INDEX OPTIONS", "index_options"),
    ("STOCK FUTURES", "stock_futures"),
    ("STOCK OPTIONS", "stock_options"),
]
FO_COLS = ["buy_contracts", "buy_value", "sell_contracts", "sell_value",
           "oi_contracts", "oi_value"]


def parse_fii_stats(content):
    df = pd.read_excel(io.BytesIO(content), header=None)
    out = {}
    for _, row in df.iterrows():
        cells = list(row)
        label_idx = next(
            (i for i, c in enumerate(cells) if isinstance(c, str) and c.strip()),
            None,
        )
        if label_idx is None:
            continue
        label = cells[label_idx].strip().upper()
        for name, key in SEGMENTS:
            if label.startswith(name):
                nums = [num(c) for c in cells[label_idx + 1:] if num(c) is not None]
                if len(nums) >= 6:
                    out[key] = dict(zip(FO_COLS, nums[:6]))
    return out or None


# ---------- Participant-wise OI / Volume (csv) ----------
def parse_participant(content):
    lines = content.decode("utf-8-sig", errors="ignore").splitlines()
    idx = next((i for i, l in enumerate(lines) if "client type" in l.lower()), None)
    if idx is None:
        return None
    df = pd.read_csv(io.StringIO("\n".join(lines[idx:])))
    df.columns = [snake(c) for c in df.columns]
    df = df[[c for c in df.columns if not c.startswith("unnamed")]]
    out = {}
    for _, row in df.iterrows():
        name = str(row["client_type"]).strip().lower()
        if not name or name == "nan":
            continue
        out[name] = {c: num(row[c]) for c in df.columns if c != "client_type"}
    return out or None


def fetch_day(d, fo, part):
    iso = d.strftime("%Y-%m-%d")
    ddmmyyyy = d.strftime("%d%m%Y")

    if iso not in fo:
        url = f"{ARCH}fo/fii_stats_{d.strftime('%d-%b-%Y')}.xls"
        content = get(url)
        if content:
            try:
                parsed = parse_fii_stats(content)
                if parsed:
                    fo[iso] = {"date": iso, **parsed}
                    print(iso, "FII F&O stats OK")
                else:
                    print(iso, "FII F&O stats: parse failed (format check karo)")
            except Exception as exc:
                print(iso, "FII F&O stats error:", exc)
        time.sleep(0.7)

    if iso not in part:
        oi = get(f"{ARCH}nsccl/fao_participant_oi_{ddmmyyyy}.csv")
        time.sleep(0.7)
        if oi:
            try:
                oi_data = parse_participant(oi)
            except Exception as exc:
                print(iso, "participant OI error:", exc)
                oi_data = None
            if oi_data:
                vol_data = None
                vol = get(f"{ARCH}nsccl/fao_participant_vol_{ddmmyyyy}.csv")
                time.sleep(0.7)
                if vol:
                    try:
                        vol_data = parse_participant(vol)
                    except Exception as exc:
                        print(iso, "participant volume error:", exc)
                part[iso] = {"date": iso, "oi": oi_data, "volume": vol_data}
                print(iso, "Participant data OK")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "daily"
    days_back = int(sys.argv[2]) if len(sys.argv) > 2 else KEEP_DAYS

    warm_up()

    if mode == "daily":
        update_cash()
        lookback = 5  # pichle 5 din ke gaps bhi bhar do
    else:
        lookback = min(days_back, KEEP_DAYS)

    fo = load("fo")
    part = load("part")
    today = datetime.now(IST).date()

    processed = 0
    for off in range(lookback + 1):
        d = today - timedelta(days=off)
        if d.weekday() >= 5:
            continue
        fetch_day(d, fo, part)
        processed += 1

        if mode == "backfill" and processed % 30 == 0:
            save("fo", fo)
            save("part", part)
            print(f"Progress: {processed} trading days checked")

        if HARD_FAILS > 40:
            print("Too many blocked/failed requests, stopping early.")
            break

    save("fo", fo)
    save("part", part)
    print("Done. Hard fails:", HARD_FAILS)


if __name__ == "__main__":
    main()
