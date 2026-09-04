const CHARTS_API_URL = 'https://script.google.com/macros/s/AKfycbx65jssEWWjfjj53X6x8twwZ83kGoEwVOVA6ms_OHS7u9FDRn56U2sYbfW1SvisibwI/exec';

let allSymbols = [
  { symbol: "20MICRONS", name: "20 Microns Limited", type: "stock" },
  { symbol: "ABCAPITAL", name: "Aditya Birla Capital Limited", type: "stock" },
  { symbol: "RELIANCE", name: "Reliance Industries Limited", type: "stock" },
  { symbol: "TCS", name: "Tata Consultancy Services Limited", type: "stock" },
  { symbol: "INFY", name: "Infosys Limited", type: "stock" }
];

let allIndices = [
  { name: "NIFTY 50", symbol: "NIFTY50", type: "index" },
  { name: "NIFTY BANK", symbol: "NIFTYBANK", type: "index" },
  { name: "NIFTY SMALLCAP 250", symbol: "NIFTYSMALLCAP250", type: "index" }
];

let searchMode = 'stock', priceBandsMap = {}, watchlists = [], activeWatchlistName = '';
let collapsedWatchSections = {}, symbolCandleCache = {}, symbolCandlePromiseCache = {};
let symbolCandleCacheMeta = {}, symbolCandleRefreshPromise = {};
const CANDLE_DB_NAME = 'MICKKK_LOCAL_V7', CANDLE_DB_STORE = 'candles', CANDLE_CACHE_TTL_MS = 15 * 60 * 1000;
let aggregateCache = new WeakMap(), gridFormat = '1x1', panelsArray = [], searchTargetPanelIndex = -1;
let currentInterval = 'D', currentChartType = 'candle', currentScaleMode = 'log', currentTheme = 'dark';

let emaConfigs = [
  { id: 1, enabled: true, len: 9, color: '#ffffff', width: 1 },
  { id: 2, enabled: true, len: 21, color: '#c58b1b', width: 1 },
  { id: 3, enabled: true, len: 55, color: '#4b55a2', width: 1 },
  { id: 4, enabled: true, len: 200, color: '#f87171', width: 1 }
];
let emaEnvelopeEnabled = true;
let volMAConfig = { enabled: false, len: 30, color: '#ff9800', width: 1 };
let rsiConfig = { enabled: true, len: 14, color: '#9c27b0', width: 2, showThresholds: true, upperVal: 60, lowerVal: 40 };
let rsiMAConfig = { enabled: true, len: 9, color: '#ffab00', width: 1 };
let relativeStrengthConfig = { enabled: true, benchmarkSymbol: 'NIFTYSMALLCAP250', maLen: 20, color: '#ff9800', width: 1 };

// CPR: Lines are drawn always, calculation labels hidden by default
let cprConfig = { weekly: true, monthly: true, showLabels: false };
let activeIndicators = { ppv: true, tables: true };

let userDrawings = [], activeTool = 'cursor', drawingState = { isDrawing: false, startPoint: null, currentPoint: null };
let selectedDrawingIdx = -1, modalHighlightIdx = -1, volVisible = true, currentRange = '1Y';
let currentSymbol = 'ABCAPITAL', currentName = 'Aditya Birla Capital Limited', currentInstrumentType = 'stock';
let isLiveActive = false, livePollTimer = null; const LIVE_POLL_MS = 45000;

/* ANTI-SPIKE CANDLE SANITIZER */
function sanitizeCandles(candles) {
  if (!candles || !candles.length) return [];
  const clean = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c || !c.time) continue;
    let close = Number(c.close);
    if (isNaN(close) || close <= 0) continue;
    let open = Number(c.open ?? close), high = Number(c.high ?? Math.max(open, close)), low = Number(c.low ?? Math.min(open, close));
    const base = (open + close) / 2;
    if (base > 0) {
      if (high > base * 3.0) high = Math.max(open, close) * 1.05;
      if (low < base * 0.3) low = Math.min(open, close) * 0.95;
    }
    clean.push({ time: formatToDateOnly(c.time), open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2), volume: Number(c.volume || 0) });
  }
  return clean;
}

function formatToDateOnly(dateStr) {
  if (!dateStr) return '';
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatXAxisDate(time) {
  let y, m, d;
  if (time && typeof time === 'object' && !Array.isArray(time)) { y = Number(time.year); m = Number(time.month); d = Number(time.day); }
  else if (typeof time === 'string') { const mt = time.match(/^(\d{4})-(\d{2})-(\d{2})/); if (mt) { y = Number(mt[1]); m = Number(mt[2]); d = Number(mt[3]); } }
  else if (typeof time === 'number') { const dt = new Date(time * 1000); y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate(); }
  if (!y || !m || !d) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2,'0')} ${months[m - 1]} '${String(y).slice(-2)}`;
}

function fmtVol(v){ if (!v) return '0'; return v>=1e7?(v/1e7).toFixed(2)+'Cr':v>=1e5?(v/1e5).toFixed(2)+'L':v>=1e3?(v/1e3).toFixed(1)+'K':String(v); }
