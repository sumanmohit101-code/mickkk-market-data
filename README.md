# MICKKK Market Data & Charts

TradingView-style market chart frontend backed by the repository's own NSE/BSE end-of-day data.

## Current chart features

- Candlestick, OHLC Bar and Line charts
- 1D / 1W / 1M chart intervals
- 1M / 3M / 6M / 1Y / 3Y / 5Y / All ranges
- Volume toggle
- Crosshair, zoom, pan and reset
- Stock and index search
- Popular stocks and index shortcuts
- URL hash for shareable symbols, e.g. `#RELIANCE`
- NSE price-band badge from `data/price-bands.json`
- Responsive dark trading-terminal layout

## Data paths used by the frontend

- Stocks: `data/<A-Z or 0-9>/<SYMBOL>.json`
- Indices: `data/indices/<SYMBOL>.json`
- Stock names: `data/symbols.json`
- Indices metadata: `data/indices.json`
- NSE price bands: `data/price-bands.json`

The repository currently stores daily OHLCV data. Therefore 1W and 1M candles are aggregated from daily candles in the browser; true intraday 1m/5m/15m data is not available until an intraday data source is added.

## Cloudflare Pages

Deploy this repository with:

- Framework preset: **None**
- Root directory: **/**
- Build command: **leave blank**
- Build output directory: **/**
- Production branch: **main**

The site entry point is `index.html`.

## Chart engine

The frontend uses TradingView's open-source Lightweight Charts library. It provides the chart rendering and interaction; the repository remains the source of the market data.

## Important

This is an EOD market-data viewer, not an order execution or brokerage terminal. No broker API key or trading token is required for the chart frontend.
