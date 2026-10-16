"""Bade industry buckets (Engineering, Miscellaneous...) ko Gemini se chhote themes mein todta hai.
Output: data/sector-themes.json  {"themes": {"SYMBOL": "Ship Building", ...}}"""
import glob
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

import requests

MIN_BUCKET = int(sys.argv[1]) if len(sys.argv) > 1 else 25   # itne ya zyada stocks wali industry todo
MAX_CALLS = int(sys.argv[2]) if len(sys.argv) > 2 else 12    # ek run mein max Gemini calls
CHUNK = 40
KEY = os.environ.get("GEMINI_API_KEY", "")
MODELS = [m for m in [os.environ.get("GEMINI_MODEL"), "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] if m]
MIDX = 0
OUT = "data/sector-themes.json"


def find(name):
    for p in [os.path.join("data", name)] + sorted(glob.glob(os.path.join("data", "*", name))):
        if os.path.exists(p):
            return p
    raise SystemExit(name + " nahi mili")


def ask(prompt):
    global MIDX
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
    while MIDX < len(MODELS):
        r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{MODELS[MIDX]}:generateContent",
                          json=body, timeout=120, headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
        if r.status_code == 404:
            MIDX += 1
            continue
        if r.status_code == 429:
            return "RATE"
        if r.status_code != 200:
            print("  HTTP", r.status_code, r.text[:150])
            return None
        try:
            return json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
        except Exception as exc:
            print("  bad response", exc)
            return None
    return "NOMODEL"


def main():
    if not KEY:
        raise SystemExit("GEMINI_API_KEY missing")
    stocks = json.load(open(find("sector-map.json"), encoding="utf-8"))["stocks"]
    themes = {}
    if os.path.exists(OUT):
        themes = json.load(open(OUT, encoding="utf-8")).get("themes", {})
    by_ind = defaultdict(list)
    for sym, v in stocks.items():
        by_ind[v["industry"]].append(sym)
    big = {k: v for k, v in by_ind.items() if len(v) >= MIN_BUCKET}
    print("Big industries:", len(big), "| stocks:", sum(len(v) for v in big.values()))
    calls = 0
    for ind, syms in sorted(big.items(), key=lambda x: -len(x[1])):
        pending = [s for s in syms if s not in themes]
        for i in range(0, len(pending), CHUNK):
            if calls >= MAX_CALLS:
                break
            part = pending[i:i + CHUNK]
            known = sorted({themes[s] for s in syms if s in themes and themes[s] != "Other"})[:80]
            lines = "\n".join(f"{s} | {stocks[s]['name']}" for s in part)
            prompt = (f"Indian listed companies currently grouped under the broad industry '{ind}'.\n"
                      "Assign each company a SPECIFIC business theme of 1-3 words (examples: Ship Building, Heat Exchangers, "
                      "Transformers, Defence Electronics, Cables, Pumps, Railway Wagons). Themes must describe what the company mainly does.\n"
                      f"Reuse these existing theme names exactly when they fit: {known}\n"
                      "If you are not sure what the company does, use \"Other\". Never guess.\n"
                      'Return ONLY a JSON object {"SYMBOL": "Theme"} with every symbol below.\n\n' + lines)
            res = ask(prompt)
            calls += 1
            if res in ("RATE", "NOMODEL"):
                print("Stopping:", res)
                calls = MAX_CALLS
                break
            if isinstance(res, dict):
                for s in part:
                    t = str(res.get(s) or "Other").strip()[:40]
                    themes[s] = t if t else "Other"
                print(ind, "->", len(part), "stocks done")
            time.sleep(6)
    os.makedirs("data", exist_ok=True)
    json.dump({"updatedAt": datetime.now(timezone.utc).isoformat(), "source": "Gemini (name-based, verify)",
               "themes": dict(sorted(themes.items()))}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    todo = sum(1 for v in big.values() for s in v if s not in themes)
    print(f"Done. themed={len(themes)} remaining={todo} calls={calls}")


if __name__ == "__main__":
    main()
