const $ = (id) => document.getElementById(id);

const state = {
  instruments: [],
  indices: [],
  stocks: [],
  priceBands: new Map(),
  selected: null,
  rawData: [],
  viewData: [],
  timeframe: "1D",
  chartType: "candle",
  range: "1Y",
  volume: true,
  chart: null,
  priceSeries: null,
  volumeSeries: null,
  searchIndex: -1,
  cache: new Map()
};

const POPULAR = ["RELIANCE","HDFCBANK","ICICIBANK","TCS","INFY","SBIN","ITC","BHARTIARTL","LT","AXISBANK","MARUTI","SUNPHARMA"];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setupChart();
  bindUI();
  await loadCatalog();
  await loadPriceBands();
  await selectInstrument("NIFTY50");
}

function setupChart() {
  state.chart = LightweightCharts.createChart($("chart"), {
    layout: { background: { type: "solid", color: "#0b1320" }, textColor: "#8290a4" },
    grid: { vertLines: { color: "#172235" }, horzLines: { color: "#172235" } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: "#26344a", scaleMargins: { top: 0.08, bottom: 0.22 } },
    timeScale: { borderColor: "#26344a", timeVisible: false, secondsVisible: false, rightOffset: 5, barSpacing: 7 },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true }
  });
  window.addEventListener("resize", resizeChart);
  resizeChart();
}

function resizeChart() {
  const el = $("chart");
  if (state.chart && el.clientWidth && el.clientHeight) state.chart.resize(el.clientWidth, el.clientHeight);
}

function bindUI() {
  $("refreshBtn").addEventListener("click", async () => {
    state.cache.clear();
    setStatus("Refreshing", "loading");
    await loadCatalog();
    await loadPriceBands();
    if (state.selected) await selectInstrument(state.selected.symbol, true);
  });

  $("volumeToggle").addEventListener("click", () => {
    state.volume = !state.volume;
    $("volumeToggle").classList.toggle("active", state.volume);
    renderSeries();
  });

  $("fitBtn").addEventListener("click", () => state.chart.timeScale().fitContent());

  document.querySelectorAll(".tf").forEach(btn => btn.addEventListener("click", () => {
    state.timeframe = btn.dataset.tf;
    document.querySelectorAll(".tf").forEach(x => x.classList.toggle("active", x === btn));
    renderSeries();
  }));

  document.querySelectorAll(".range").forEach(btn => btn.addEventListener("click", () => {
    state.range = btn.dataset.range;
    document.querySelectorAll(".range").forEach(x => x.classList.toggle("active", x === btn));
    renderSeries();
  }));

  document.querySelectorAll(".chart-type").forEach(btn => btn.addEventListener("click", () => {
    state.chartType = btn.dataset.chart;
    document.querySelectorAll(".chart-type").forEach(x => x.classList.toggle("active", x === btn));
    renderSeries();
  }));

  const input = $("symbolSearch");
  input.addEventListener("input", () => showSearch(input.value));
  input.addEventListener("focus", () => { if (input.value.trim()) showSearch(input.value); });
  input.addEventListener("keydown", handleSearchKeys);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-area")) $("searchResults").classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); input.focus(); input.select();
    }
  });
}

async function loadCatalog() {
  try {
    const [symbols, indices] = await Promise.all([
      fetchJson("data/symbols.json"),
      fetchJson("data/indices.json")
    ]);
    state.stocks = Array.isArray(symbols) ? symbols.map(x => ({ ...x, kind: "stock" })) : [];
    state.indices = Array.isArray(indices) ? indices.map(x => ({ ...x, kind: "index" })) : [];
    state.instruments = [...state.indices, ...state.stocks];
    renderWatchlist();
    setStatus(`${state.instruments.length.toLocaleString()} symbols`, "ok");
  } catch (err) {
    console.error(err);
    setStatus("Catalog error", "error");
  }
}

async function loadPriceBands() {
  try {
    const payload = await fetchJson("data/price-bands.json");
    const records = Array.isArray(payload) ? payload : (payload.records || []);
    state.priceBands = new Map(records.map(r => [String(r.Symbol || "").toUpperCase(), r]));
  } catch (err) {
    console.warn("Price bands unavailable", err);
  }
}

function renderWatchlist() {
  const indexBox = $("indexList");
  indexBox.innerHTML = state.indices.map(item => watchItem(item)).join("");

  const present = new Set(state.stocks.map(x => x.symbol));
  const popular = POPULAR.filter(x => present.has(x));
  const fallback = state.stocks.slice(0, 12).map(x => x.symbol);
  const chosen = [...new Set([...popular, ...fallback])].slice(0, 18);
  $("stockList").innerHTML = chosen.map(symbol => watchItem(state.stocks.find(x => x.symbol === symbol))).join("");
  $("watchCount").textContent = state.indices.length + chosen.length;

  document.querySelectorAll(".watch-item").forEach(el => {
    el.addEventListener("click", () => selectInstrument(el.dataset.symbol));
  });
}

function watchItem(item) {
  return `<div class="watch-item" data-symbol="${escapeHtml(item.symbol)}">
    <div style="min-width:0"><div class="watch-symbol">${escapeHtml(item.symbol)}</div>
    <div class="watch-name">${escapeHtml(item.name || item.symbol)}</div></div>
    <span class="watch-meta">${item.kind === "index" ? "IDX" : "EQ"}</span>
  </div>`;
}

async function selectInstrument(symbol, force = false) {
  const item = state.instruments.find(x => x.symbol === symbol);
  if (!item) return;
  state.selected = item;
  document.querySelectorAll(".watch-item").forEach(el => el.classList.toggle("active", el.dataset.symbol === symbol));
  $("instrumentSymbol").textContent = item.symbol;
  $("instrumentName").textContent = item.name || item.symbol;
  $("instrumentType").textContent = item.kind === "index" ? "INDEX" : "EQUITY";
  $("footerInstrument").textContent = item.name || item.symbol;
  $("chartLoading").classList.remove("hidden");
  $("emptyState").classList.add("hidden");

  try {
    const data = await getInstrumentData(item, force);
    state.rawData = normaliseCandles(data);
    if (!state.rawData.length) throw new Error("No usable candles");
    updateQuote();
    renderSeries();
    setStatus(`${state.instruments.length.toLocaleString()} symbols`, "ok");
  } catch (err) {
    console.error(err);
    state.rawData = [];
    clearSeries();
    $("emptyState").classList.remove("hidden");
    setStatus("Chart data error", "error");
  } finally {
    $("chartLoading").classList.add("hidden");
  }
}

async function getInstrumentData(item, force = false) {
  const key = `${item.kind}:${item.symbol}`;
  if (!force && state.cache.has(key)) return state.cache.get(key);
  const first = (item.symbol || "").slice(0, 1).toUpperCase();
  const path = item.kind === "index"
    ? `data/indices/${encodeURIComponent(item.symbol)}.json`
    : `data/${/^[A-Z]$/.test(first) ? first : "0-9"}/${encodeURIComponent(item.symbol)}.json`;
  const data = await fetchJson(path);
  state.cache.set(key, data);
  return data;
}

function normaliseCandles(data) {
  const rows = Array.isArray(data) ? data : (data.records || data.data || []);
  return rows.map(r => ({
    time: r.time || r.date || r.Date,
    open: num(r.open ?? r.Open),
    high: num(r.high ?? r.High),
    low: num(r.low ?? r.Low),
    close: num(r.close ?? r.Close),
    volume: num(r.volume ?? r.Volume) || 0
  })).filter(r => r.time && [r.open,r.high,r.low,r.close].every(Number.isFinite))
    .sort((a,b) => String(a.time).localeCompare(String(b.time)));
}

function updateQuote() {
  const d = state.rawData;
  const last = d[d.length - 1];
  const prev = d.length > 1 ? d[d.length - 2] : null;
  const diff = prev ? last.close - prev.close : 0;
  const pct = prev && prev.close ? (diff / prev.close) * 100 : 0;
  $("lastPrice").textContent = fmt(last.close);
  $("priceChange").textContent = `${diff >= 0 ? "+" : ""}${fmt(diff)} (${diff >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
  $("priceChange").className = `change ${diff > 0 ? "up" : diff < 0 ? "down" : "neutral"}`;
  $("qOpen").textContent = fmt(last.open);
  $("qHigh").textContent = fmt(last.high);
  $("qLow").textContent = fmt(last.low);
  $("qClose").textContent = fmt(last.close);
  $("qVolume").textContent = fmtVolume(last.volume);
  $("dataDate").textContent = `Data date: ${prettyDate(last.time)}`;

  const band = state.selected.kind === "stock" ? state.priceBands.get(state.selected.symbol.toUpperCase()) : null;
  $("priceBand").textContent = band?.Band ? `${band.Band}%` : "—";
  $("seriesInfo").textContent = band ? `${band.Series || "EQ"}${band.Remarks && band.Remarks !== "-" ? " • " + band.Remarks : ""}` : "Index";
}

function renderSeries() {
  if (!state.rawData.length) return;
  clearSeries();
  const data = state.timeframe === "1D" ? state.rawData : aggregate(state.rawData, state.timeframe);
  state.viewData = applyRange(data, state.range);

  if (!state.viewData.length) return;

  const common = {
    upColor: "#26a97b", downColor: "#e45663", borderVisible: false,
    wickUpColor: "#26a97b", wickDownColor: "#e45663"
  };

  if (state.chartType === "candle") {
    state.priceSeries = state.chart.addCandlestickSeries(common);
  } else if (state.chartType === "bar") {
    state.priceSeries = state.chart.addBarSeries({
      upColor: "#26a97b", downColor: "#e45663", thinBars: false
    });
  } else {
    state.priceSeries = state.chart.addLineSeries({
      color: "#7187ff", lineWidth: 2, crosshairMarkerVisible: true,
      lastValueVisible: true, priceLineVisible: true
    });
  }

  if (state.chartType === "line") {
    state.priceSeries.setData(state.viewData.map(x => ({ time: x.time, value: x.close })));
  } else {
    state.priceSeries.setData(state.viewData.map(x => ({
      time: x.time, open: x.open, high: x.high, low: x.low, close: x.close
    })));
  }

  if (state.volume) {
    state.volumeSeries = state.chart.addHistogramSeries({
      priceFormat: { type: "volume" }, priceScaleId: "", color: "#334a6b",
      scaleMargins: { top: 0.82, bottom: 0 }
    });
    state.volumeSeries.setData(state.viewData.map(x => ({
      time: x.time, value: x.volume, color: x.close >= x.open ? "#275d4d" : "#63313a"
    })));
  }

  state.chart.timeScale().fitContent();
}

function clearSeries() {
  if (state.priceSeries) { try { state.chart.removeSeries(state.priceSeries); } catch (_) {} }
  if (state.volumeSeries) { try { state.chart.removeSeries(state.volumeSeries); } catch (_) {} }
  state.priceSeries = null;
  state.volumeSeries = null;
}

function aggregate(data, tf) {
  const groups = new Map();
  for (const d of data) {
    const date = new Date(`${d.time}T00:00:00Z`);
    let key;
    if (tf === "1W") {
      const day = date.getUTCDay();
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
      key = monday.toISOString().slice(0,10);
    } else {
      key = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-01`;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.entries()].map(([time, rows]) => ({
    time,
    open: rows[0].open,
    high: Math.max(...rows.map(x => x.high)),
    low: Math.min(...rows.map(x => x.low)),
    close: rows[rows.length - 1].close,
    volume: rows.reduce((s,x) => s + (x.volume || 0), 0)
  }));
}

function applyRange(data, range) {
  if (range === "ALL") return data;
  const days = { "1M": 31, "3M": 93, "6M": 186, "1Y": 366, "5Y": 1826 }[range] || 366;
  const end = new Date(`${data[data.length - 1].time}T00:00:00Z`);
  const cutoff = new Date(end);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return data.filter(x => new Date(`${x.time}T00:00:00Z`) >= cutoff);
}

function showSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) { $("searchResults").classList.add("hidden"); return; }
  const results = state.instruments.filter(x =>
    x.symbol.toLowerCase().includes(q) || (x.name || "").toLowerCase().includes(q)
  ).slice(0, 14);
  state.searchIndex = -1;
  $("searchResults").innerHTML = results.length
    ? results.map((x,i) => `<div class="search-item" data-symbol="${escapeHtml(x.symbol)}" data-index="${i}">
        <div class="search-main"><span class="search-symbol">${escapeHtml(x.symbol)}</span><span class="search-name">${escapeHtml(x.name || "")}</span></div>
        <span class="search-kind">${x.kind === "index" ? "Index" : "NSE Equity"}</span>
      </div>`).join("")
    : `<div class="search-item"><div class="search-main"><span class="search-name">No matching symbols</span></div></div>`;
  $("searchResults").classList.remove("hidden");
  document.querySelectorAll(".search-item[data-symbol]").forEach(el => {
    el.addEventListener("click", () => {
      $("symbolSearch").value = "";
      $("searchResults").classList.add("hidden");
      selectInstrument(el.dataset.symbol);
    });
  });
}

function handleSearchKeys(e) {
  const items = [...document.querySelectorAll(".search-item[data-symbol]")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!items.length) return;
    state.searchIndex = e.key === "ArrowDown"
      ? Math.min(state.searchIndex + 1, items.length - 1)
      : Math.max(state.searchIndex - 1, 0);
    items.forEach((x,i) => x.classList.toggle("active", i === state.searchIndex));
  }
  if (e.key === "Enter" && state.searchIndex >= 0 && items[state.searchIndex]) {
    items[state.searchIndex].click();
  }
  if (e.key === "Escape") $("searchResults").classList.add("hidden");
}

async function fetchJson(path) {
  const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
  return res.json();
}

function setStatus(text, kind) {
  const el = $("dataStatus");
  el.textContent = "";
  const dot = document.createElement("span");
  dot.className = "status-dot";
  el.append(dot, document.createTextNode(` ${text}`));
  el.className = `status-pill ${kind === "ok" ? "ok" : kind === "error" ? "error" : ""}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fmt(v) {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVolume(v) {
  if (!Number.isFinite(v) || v === 0) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v/1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${(v/1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${(v/1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString("en-IN");
}

function prettyDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric", timeZone:"UTC" });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}
