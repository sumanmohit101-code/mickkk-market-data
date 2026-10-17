// ============================================================
// MICKKK.com Charts — Professional Terminal Engine
// ============================================================

const CHARTS_API_URL = 'https://script.google.com/macros/s/AKfycbx65jssEWWjfjj53X6x8twwZ83kGoEwVOVA6ms_OHS7u9FDRn56U2sYbfW1SvisibwI/exec';

// LOCAL STATIC INSTRUMENT CATALOGUE — sourced from the repository data files.
const FALLBACK_SYMBOLS = [
  { symbol: "20MICRONS", name: "20 Microns Limited", type: "stock" },
  { symbol: "RELIANCE", name: "Reliance Industries Limited", type: "stock" },
  { symbol: "TCS", name: "Tata Consultancy Services Limited", type: "stock" },
  { symbol: "INFY", name: "Infosys Limited", type: "stock" },
  { symbol: "HDFCBANK", name: "HDFC Bank Limited", type: "stock" },
  { symbol: "ICICIBANK", name: "ICICI Bank Limited", type: "stock" }
];

const FALLBACK_INDICES = [
  { name: "NIFTY 50", symbol: "NIFTY50", type: "index" },
  { name: "NIFTY BANK", symbol: "NIFTYBANK", type: "index" },
  { name: "SENSEX", symbol: "SENSEX", type: "index" }
];

let allSymbols = [...FALLBACK_SYMBOLS];
let allIndices = [...FALLBACK_INDICES];
let searchMode = 'stock';

// PRICE BANDS, PRICE-BAND CHANGES & RESULTS — loaded directly from GitHub data/
let priceBandsMap = {};
let priceBandChangesMap = {};
let resultsMap = {};
let priceBandDataLoaded = false;
let resultDataLoaded = false;
const REPO_DATA_BASE = 'https://raw.githubusercontent.com/sumanmohit101-code/mickkk-market-data/main/data/';

// WATCHLIST STATE
let watchlists = [];
let activeWatchlistName = '';
let collapsedWatchSections = {};
let symbolCandleCache = {};
let symbolCandlePromiseCache = {};
let symbolCandleCacheMeta = {};
let symbolCandleRefreshPromise = {};
const CANDLE_DB_NAME = 'MICKKK_CHART_LOCAL_CACHE_V1';
const CANDLE_DB_STORE = 'candles';
const APP_CACHE_STORE = 'appData';
// Candle data is served from local IndexedDB first. Fresh repository data is
// pulled in the background so opening a chart never waits for GitHub.
const CANDLE_CACHE_TTL_MS = 30 * 60 * 1000;
// Catalogues / bands / results change much less often than candles. Keep them
// on disk for a few hours and refresh stale entries in the background.
const REPO_DATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let repoDataRefreshPromise = {};
let persistentStorageRequested = false;
let aggregateCache = new WeakMap();
let gridFormat = '1x1'; 
let panelsArray = [];
let searchTargetPanelIndex = -1;
let compareSearchPanelIndex = -1;

let currentInterval = 'D';
let currentChartType = 'candle'; 
let currentScaleMode = 'log'; 
let currentTheme = 'dark';

// PROFESSIONAL DEFAULT INDICATORS
const DEFAULT_EMA_CONFIGS = [
  { id: 1, enabled: true, len: 9, color: '#ffffff', width: 1 },
  { id: 2, enabled: true, len: 21, color: '#c58b1b', width: 1 },
  { id: 3, enabled: true, len: 55, color: '#4b55a2', width: 1 },
  { id: 4, enabled: true, len: 200, color: '#f87171', width: 1 }
];

let emaConfigs = JSON.parse(JSON.stringify(DEFAULT_EMA_CONFIGS));
emaConfigs.push({ id: 5, enabled: false, len: 10, color: '#00d4ff', width: 1 });
let emaEnvelopeEnabled = true;

/* --- START: ALL INDICATORS ON BY DEFAULT (EXCEPT MACD & CPR) --- */
let volMAConfig = { enabled: true, len: 30, color: '#ff9800', width: 1 };

let rsiConfig = {
  enabled: true, len: 14, color: '#9c27b0', width: 2,
  showThresholds: true, upperVal: 60, lowerVal: 40
};
let rsiMAConfig = { enabled: true, len: 9, color: '#ffab00', width: 1 };
let relativeStrengthConfig = { enabled: true, benchmarkSymbol: 'NIFTYSMALLCAP250', maLen: 20, color: '#ff9800', width: 1 };
let trendlineBreakoutConfig = { enabled: true, showLines: false, length: 14, mult: 1.0, calcMethod: 'Atr', backpaint: true, breakoutColor: '#00e676', breakdownColor: '#ff3d5a' };

// CPR & MACD are strictly OFF by default
let cprConfig = { weekly: false, monthly: false, weeklyColor: '#00d4ff', monthlyColor: '#ff9800', showLabels: false };
let macdConfig = { enabled: false, fast: 12, slow: 26, signal: 9, lineColor: '#2962ff', signalColor: '#ff6d00' };

let smartBarConfig = {
  enabled: true, bodyEnabled: true, bodyThreshold: 4.0, bodyColor: '#2196f3',
  rangeEnabled: true, rangeThreshold: 3.0, rangeColor: '#ffffff',
  nr7Enabled: true, nr7Color: '#ff9900'
};

let ibMaxMotherBarRange = 8.0;
let mcpConfig = { enabled: true, r1: 8.0, lastOnly: false };
let gapConfig = { enabled: true, minGapPct: 1.0, maxGaps: 5 };
let atrExtConfig = { enabled: true, atrLength: 14, maLength: 50, threshold: 10.0 };
let infoAtrLength = 14;
let w52Config = { enabled:true, highColor:'#ff9800', lowColor:'#00d4ff' };
let emaAlignmentConfig = { enabled:true, rangePct:2.0, color:'#00e676', opacity:0.01, fill:'rgba(0,230,118,0.01)' };
let rsiHighlightConfig = { enabled:true, threshold:60, color:'#ffc107', opacity:0.01, fill:'rgba(255,193,7,0.01)' };
let volumeProfileConfig = { enabled:false, pocEnabled:true, rows:24, valueArea:70, widthPct:28, opacity:55, pocColor:'#ff3d5a', vaColor:'#00d4ff', profileColor:'#607d8b' };
let supertrendConfigs = [{enabled:false,atr:10,factor:3,up:'#00e676',down:'#ff3d5a'},{enabled:false,atr:14,factor:2,up:'#26a69a',down:'#ef5350'}];
let replayState = { active:false, index:0, playing:false, timer:null };

let activeIndicators = {
  ppv: true, tables: true, tablesEmaDist: false,
  candleClr: true, ibLabel: true, wtc: true, ema9Sell: true,
  sellClimax: true, buyClimax: true
};
/* --- END: ALL INDICATORS ON BY DEFAULT (EXCEPT MACD & CPR) --- */

let userDrawings = [];
let activeTool = 'cursor';
let drawingState = { isDrawing: false, startPoint: null, currentPoint: null };
let selectedDrawingIdx = -1;
let modalHighlightIdx = -1;

let volVisible = true;
let currentRange = '1Y';
let currentSymbol = '20MICRONS', currentName = '20 Microns Limited';
let currentInstrumentType = 'stock';
let isLiveActive = false;
let livePollTimer = null;
const LIVE_POLL_MS = 45000;

/* ============ FETCH PRICE BANDS / CHANGES / RESULTS DIRECTLY FROM GITHUB ============ */
function unwrapArray(raw, keys=[]) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function normalizeBandValue(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v).trim();
}

function extractSymbol(obj) {
  return String(obj?.symbol ?? obj?.Symbol ?? obj?.ticker ?? obj?.Ticker ?? obj?.scrip ?? '').trim().toUpperCase();
}

function extractDate(obj) {
  return formatToDateOnly(obj?.date ?? obj?.Date ?? obj?.time ?? obj?.timestamp ?? obj?.effectiveDate ?? obj?.changeDate ?? obj?.resultDate ?? '');
}

function extractBandChange(obj) {
  const from = obj?.oldBand ?? obj?.previousBand ?? obj?.fromBand ?? obj?.bandFrom ?? obj?.old_band ?? obj?.from ?? obj?.previous ?? obj?.old;
  const to = obj?.newBand ?? obj?.currentBand ?? obj?.toBand ?? obj?.bandTo ?? obj?.new_band ?? obj?.to ?? obj?.current ?? obj?.new;
  return { from: normalizeBandValue(from), to: normalizeBandValue(to) };
}

function compactResultLabel(obj) {
  const raw = obj?.label ?? obj?.result ?? obj?.type ?? obj?.event ?? obj?.quarter ?? obj?.period ?? obj?.title ?? '';
  if (raw !== '' && raw !== null && raw !== undefined) {
    const text = String(raw).trim();
    if (text) return text.length > 10 ? text.slice(0, 10) : text;
  }
  const q = obj?.quarter ?? obj?.period;
  if (q) return String(q).slice(0, 10);
  return 'RESULT';
}

async function fetchGithubDataJson(paths) {
  let lastErr = null;
  for (const rel of paths) {
    try {
      const raw = await fetchJsonFromCandidates(rel);
      return raw;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('GitHub data file not found');
}

async function fetchPriceBandsData() {
  try {
    const raw = await fetchGithubDataJsonCached(['price-bands.json','price_bands.json','pricebands.json'],'repo:price-bands', (fresh)=>{ try { const arr=unwrapArray(fresh,['priceBands','bands','data']); priceBandsMap={}; arr.forEach(b=>{const symbol=extractSymbol(b); if(symbol) priceBandsMap[symbol]=b;}); priceBandDataLoaded=true; refreshBandChangeMarkers?.(); } catch(e){} });
    const arr = unwrapArray(raw, ['priceBands','bands','data']);
    priceBandsMap = {};
    arr.forEach(b => {
      const symbol = extractSymbol(b);
      if (symbol) priceBandsMap[symbol] = b;
    });
    priceBandDataLoaded = true;
  } catch(e) {
    console.warn('GitHub price bands fetch error:', e);
  }

  try {
    const raw = await fetchGithubDataJsonCached(['price-band-changes.json','price_band_changes.json','price-band-change.json','price_band_change.json'],'repo:price-band-changes', (fresh)=>{ try { const arr=unwrapArray(fresh,['priceBandChanges','bandChanges','changes','data']); priceBandChangesMap={}; arr.forEach(ch=>{const symbol=extractSymbol(ch); const date=extractDate(ch); if(!symbol||!date)return; const change=extractBandChange(ch); if(!priceBandChangesMap[symbol]) priceBandChangesMap[symbol]=[]; priceBandChangesMap[symbol].push({...ch,date,from:change.from,to:change.to});}); Object.keys(priceBandChangesMap).forEach(sym=>priceBandChangesMap[sym].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)); panelsArray.forEach(p=>{if(p?.rawDailyCandles?.length) refreshBandChangeMarkers(p);}); } catch(e){} });
    const arr = unwrapArray(raw, ['priceBandChanges','bandChanges','changes','data']);
    priceBandChangesMap = {};
    arr.forEach(ch => {
      const symbol = extractSymbol(ch);
      const date = extractDate(ch);
      if (!symbol || !date) return;
      const change = extractBandChange(ch);
      if (!priceBandChangesMap[symbol]) priceBandChangesMap[symbol] = [];
      priceBandChangesMap[symbol].push({ ...ch, date, from: change.from, to: change.to });
    });
    Object.keys(priceBandChangesMap).forEach(sym => priceBandChangesMap[sym].sort((a,b)=>a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } catch(e) {
    console.warn('GitHub price band changes fetch error:', e);
    priceBandChangesMap = {};
  }

  try {
    const raw = await fetchGithubDataJsonCached(['results.json','result.json','results/results.json','result/result.json'],'repo:results', (fresh)=>{ try { const arr=unwrapArray(fresh,['results','result','data','events']); resultsMap={}; arr.forEach(r=>{const symbol=extractSymbol(r); const date=extractDate(r); if(!symbol||!date)return; if(!resultsMap[symbol])resultsMap[symbol]=[]; resultsMap[symbol].push({...r,date,label:compactResultLabel(r)});}); Object.keys(resultsMap).forEach(sym=>resultsMap[sym].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)); resultDataLoaded=true; panelsArray.forEach(p=>{if(p?.rawDailyCandles?.length){const d=aggregate(p.rawDailyCandles,'D'); renderCombinedInfoCardForPanel(d,p); updateResultAxisMarkers(p,d);}}); } catch(e){} });
    const arr = unwrapArray(raw, ['results','result','data','events']);
    resultsMap = {};
    arr.forEach(r => {
      const symbol = extractSymbol(r);
      const date = extractDate(r);
      if (!symbol || !date) return;
      if (!resultsMap[symbol]) resultsMap[symbol] = [];
      resultsMap[symbol].push({ ...r, date, label: compactResultLabel(r) });
    });
    Object.keys(resultsMap).forEach(sym => resultsMap[sym].sort((a,b)=>a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    resultDataLoaded = true;
  } catch(e) {
    // Some repos keep result events one JSON file per symbol. Try that lazily per selected symbol.
    resultDataLoaded = false;
    resultsMap = {};
  }

  // Refresh current panel/table/axis after the GitHub datasets arrive.
  try {
    panelsArray.forEach(panel => {
      if (panel?.rawDailyCandles?.length) {
        const d = aggregate(panel.rawDailyCandles, 'D');
        renderCombinedInfoCardForPanel(d, panel);
        refreshBandChangeMarkers(panel);
        updateResultAxisMarkers(panel, d);
      }
    });
  } catch(e) {}
}

async function ensureResultsForSymbol(symbol) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean || resultsMap[clean]) return;
  const candidates = [`results/${encodeURIComponent(clean)}.json`,`result/${encodeURIComponent(clean)}.json`,`results/${encodeURIComponent(clean.toLowerCase())}.json`,`result/${encodeURIComponent(clean.toLowerCase())}.json`];
  try {
    const raw = await fetchGithubDataJsonCached(candidates,`repo:result:${clean}`, null, REPO_DATA_CACHE_TTL_MS);
    const arr = unwrapArray(raw, ['results','result','data','events']);
    const rows = [];
    arr.forEach(r => {
      const date = extractDate(r);
      if (date) rows.push({ ...r, date, label: compactResultLabel(r) });
    });
    rows.sort((a,b)=>a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    resultsMap[clean] = rows;
  } catch(e) {
    resultsMap[clean] = [];
  }
}

function getPriceBandForSymbol(symbol) {
  return priceBandsMap[String(symbol || '').toUpperCase()] || null;
}

function getBandChangesForSymbol(symbol) {
  return priceBandChangesMap[String(symbol || '').toUpperCase()] || [];
}

function getResultsForSymbol(symbol) {
  return resultsMap[String(symbol || '').toUpperCase()] || [];
}

/* ============ DATE FORMATTER UTILITY ============ */
function formatToDateOnly(dateStr) {
  if (!dateStr) return '';
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatXAxisDate(time) {
  let year, month, day;

  if (time && typeof time === 'object' && !Array.isArray(time)) {
    if (Number.isFinite(Number(time.year)) && Number.isFinite(Number(time.month)) && Number.isFinite(Number(time.day))) {
      year = Number(time.year);
      month = Number(time.month);
      day = Number(time.day);
    }
  } else if (typeof time === 'string') {
    const m = time.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    }
  } else if (typeof time === 'number') {
    const d = new Date(time * 1000);
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  }

  if (!year || !month || !day) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(day).padStart(2,'0')} ${months[month - 1]} '${String(year).slice(-2)}`;
}

function positionPocketPivotStatsWidget(panel) {
  const widget = document.getElementById('ppv-stats-widget');
  const wrap = document.querySelector('.chart-wrap');
  const pane = panel && document.getElementById(`pane-price-${panel.index}`);
  if (!widget || !wrap || !pane || widget.style.display === 'none') return;
  const wrapRect = wrap.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  const volumeStart = paneRect.top + paneRect.height * 0.70;
  const widgetHeight = widget.offsetHeight || 22;
  const top = Math.max(4, volumeStart - wrapRect.top - widgetHeight + 2);
  widget.style.top = `${Math.round(top)}px`;
}

