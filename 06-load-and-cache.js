/* ============ FAST FETCH WITH LOCAL INDEXEDDB CACHE ============ */
let candleDbPromise = null;

function candleCacheKey(symbol, type){ return `${type || 'stock'}:${symbol}`; }

function requestPersistentStorage(){
  if (persistentStorageRequested) return;
  persistentStorageRequested = true;
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(ok => {
        if (ok) console.info('MICKKK local chart cache: persistent storage enabled');
      }).catch(()=>{});
    }
  } catch(e) {}
}

function openCandleCacheDB(){
  if (candleDbPromise) return candleDbPromise;
  candleDbPromise = new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) { resolve(null); return; }
      // V2 adds a generic appData store while keeping the existing candle store
      // intact, so existing cached candles survive the upgrade.
      const req = indexedDB.open(CANDLE_DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CANDLE_DB_STORE)) {
          db.createObjectStore(CANDLE_DB_STORE, { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains(APP_CACHE_STORE)) {
          db.createObjectStore(APP_CACHE_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db=req.result;
        db.onversionchange=()=>{ try{db.close();}catch(e){} };
        requestPersistentStorage();
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch(e) { resolve(null); }
  });
  return candleDbPromise;
}

async function readRepoDataCache(key){
  try {
    const db=await openCandleCacheDB();
    if(!db || !db.objectStoreNames.contains(APP_CACHE_STORE)) return null;
    return await new Promise(resolve=>{
      const tx=db.transaction(APP_CACHE_STORE,'readonly');
      const req=tx.objectStore(APP_CACHE_STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>resolve(null);
    });
  } catch(e){ return null; }
}

async function writeRepoDataCache(key,data){
  try {
    const db=await openCandleCacheDB();
    if(!db || !db.objectStoreNames.contains(APP_CACHE_STORE)) return;
    await new Promise(resolve=>{
      const tx=db.transaction(APP_CACHE_STORE,'readwrite');
      tx.objectStore(APP_CACHE_STORE).put({key,data,savedAt:Date.now()});
      tx.oncomplete=()=>resolve(); tx.onerror=()=>resolve(); tx.onabort=()=>resolve();
    });
  } catch(e) {}
}

async function refreshRepoDataInBackground(cacheKey, paths, applyFresh){
  if(repoDataRefreshPromise[cacheKey]) return repoDataRefreshPromise[cacheKey];
  repoDataRefreshPromise[cacheKey]=(async()=>{
    try{
      const data=await fetchGithubDataJson(paths);
      await writeRepoDataCache(cacheKey,data);
      if(typeof applyFresh==='function') applyFresh(data);
      return data;
    }catch(e){
      return null;
    }finally{
      delete repoDataRefreshPromise[cacheKey];
    }
  })();
  return repoDataRefreshPromise[cacheKey];
}

async function fetchGithubDataJsonCached(paths, cacheKey, applyFresh, ttl=REPO_DATA_CACHE_TTL_MS){
  const local=await readRepoDataCache(cacheKey);
  if(local && Object.prototype.hasOwnProperty.call(local,'data')){
    const age=Date.now()-Number(local.savedAt||0);
    if(age>ttl) refreshRepoDataInBackground(cacheKey,paths,applyFresh);
    return local.data;
  }
  try{
    const fresh=await fetchGithubDataJson(paths);
    // Do not block chart rendering on the disk write.
    writeRepoDataCache(cacheKey,fresh);
    return fresh;
  }catch(e){
    return null;
  }
}

async function readCandleCache(symbol, type){
  try {
    const db = await openCandleCacheDB();
    if (!db) return null;
    return await new Promise(resolve => {
      const tx = db.transaction(CANDLE_DB_STORE, 'readonly');
      const req = tx.objectStore(CANDLE_DB_STORE).get(candleCacheKey(symbol, type));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch(e) { return null; }
}

async function writeCandleCache(symbol, type, candles){
  try {
    const db = await openCandleCacheDB();
    if (!db) return;
    await new Promise(resolve => {
      const tx = db.transaction(CANDLE_DB_STORE, 'readwrite');
      tx.objectStore(CANDLE_DB_STORE).put({
        symbol: candleCacheKey(symbol, type),
        candles,
        savedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch(e) {}
}

async function fetchFreshCandlesFromStatic(symbol, type='stock'){
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) throw new Error('Missing symbol');
  const relative = type === 'index' ? `indices/${encodeURIComponent(clean)}.json` : `${clean.slice(0,1).match(/[A-Z]/) ? clean.slice(0,1) : '0-9'}/${encodeURIComponent(clean)}.json`;
  const raw = await fetchJsonFromCandidates(relative);
  const candles = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.candles) ? raw.candles : []);
  return candles
    .filter(c => c && c.time && !isNaN(Number(c.close)) && Number(c.close) > 0)
    .map(c => ({
      time: formatToDateOnly(c.time),
      open: Number(c.open ?? c.close),
      high: Number(c.high ?? c.close),
      low: Number(c.low ?? c.close),
      close: Number(c.close),
      volume: Number(c.volume || 0)
    }))
    .sort((a,b)=>a.time < b.time ? -1 : 1);
}

async function fetchFreshCandlesFromServer(symbol){
  const res = await fetch(`${CHARTS_API_URL}?action=getOHLC&symbol=${encodeURIComponent(symbol)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.candles || [])
    .filter(c => c && c.time && !isNaN(Number(c.close)) && Number(c.close) > 0)
    .map(c => ({time:formatToDateOnly(c.time),open:Number(c.open ?? c.close),high:Number(c.high ?? c.close),low:Number(c.low ?? c.close),close:Number(c.close),volume:Number(c.volume||0)}))
    .sort((a,b)=>a.time < b.time ? -1 : 1);
}

async function refreshSymbolCandlesInBackground(symbol, type='stock'){
  const key = candleCacheKey(symbol,type);
  if (symbolCandleRefreshPromise[key]) return symbolCandleRefreshPromise[key];
  symbolCandleRefreshPromise[key] = (async () => {
    try {
      const candles = await fetchFreshCandlesFromStatic(symbol,type);
      if (!candles.length) return;
      symbolCandleCache[key] = candles;
      symbolCandleCacheMeta[key] = Date.now();
      try { sessionStorage.setItem(`MICKKK_CANDLES_${key}`, JSON.stringify(candles)); } catch(e){}
      writeCandleCache(symbol,type,candles);
    } catch(e) {
      // Static repository data is authoritative for historical charting.
    } finally {
      delete symbolCandleRefreshPromise[key];
    }
  })();
  return symbolCandleRefreshPromise[key];
}

async function fetchSymbolCandles(symbol, type='stock') {
  const key = candleCacheKey(symbol,type);
  if (symbolCandleCache[key]) {
    const savedAt = symbolCandleCacheMeta[key] || 0;
    if (Date.now() - savedAt > CANDLE_CACHE_TTL_MS) refreshSymbolCandlesInBackground(symbol,type);
    return symbolCandleCache[key];
  }
  if (symbolCandlePromiseCache[key]) return symbolCandlePromiseCache[key];

  try {
    const local = await readCandleCache(symbol,type);
    if (local && Array.isArray(local.candles) && local.candles.length) {
      symbolCandleCache[key] = local.candles;
      symbolCandleCacheMeta[key] = Number(local.savedAt || 0);
      if (Date.now() - symbolCandleCacheMeta[key] > CANDLE_CACHE_TTL_MS) refreshSymbolCandlesInBackground(symbol,type);
      return local.candles;
    }
  } catch(e) {}

  try {
    const cached = sessionStorage.getItem(`MICKKK_CANDLES_${key}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) {
        symbolCandleCache[key] = parsed;
        symbolCandleCacheMeta[key] = Date.now();
        writeCandleCache(symbol,type,parsed);
        return parsed;
      }
    }
  } catch(e) {}

  symbolCandlePromiseCache[key] = (async () => {
    try {
      return await fetchFreshCandlesFromStatic(symbol,type);
    } catch(staticErr) {
      // Keep the existing API as a safety fallback if a static file is unavailable.
      if (type === 'stock') return await fetchFreshCandlesFromServer(symbol);
      throw staticErr;
    }
  })();

  try {
    const candles = await symbolCandlePromiseCache[key];
    symbolCandleCache[key] = candles;
    symbolCandleCacheMeta[key] = Date.now();
    try { sessionStorage.setItem(`MICKKK_CANDLES_${key}`, JSON.stringify(candles)); } catch(e){}
    writeCandleCache(symbol,type,candles);
    return candles;
  } finally {
    delete symbolCandlePromiseCache[key];
  }
}

/* ============ LOAD SYMBOL ============ */
async function loadSymbol(symbol, name, targetIdx, instrumentType='stock'){
  stopLivePoll();
  const type = instrumentType === 'index' ? 'index' : 'stock';
  if (targetIdx === -1 || targetIdx === undefined) {
    currentSymbol = symbol; currentName = name; currentInstrumentType = type;
    const btnLbl = document.getElementById('top-stock-btn-label');
    if (btnLbl) btnLbl.innerText = `${type === 'index' ? '📊' : '🔍'} ${symbol}`;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';

  await loadDrawingsForSymbol(symbol);
  try { await ensureResultsForSymbol(symbol); } catch(e) {}

  try{
    if (targetIdx >= 0 && panelsArray[targetIdx]) {
      panelsArray[targetIdx].symbol = symbol;
      panelsArray[targetIdx].symbolName = name;
      panelsArray[targetIdx].instrumentType = type;
      const label = document.getElementById(`panel-sym-label-${targetIdx}`);
      if (label) label.innerText = symbol;
      const badge = document.getElementById(`panel-type-badge-${targetIdx}`);
      if (badge) badge.innerText = type === 'index' ? 'IDX' : 'EQ';
      await rebuildPanelChart(panelsArray[targetIdx]);
    } else {
      panelsArray.forEach(p => {
        p.symbol = symbol; p.symbolName = name; p.instrumentType = type;
        const label = document.getElementById(`panel-sym-label-${p.index}`);
        if (label) label.innerText = symbol;
        const badge = document.getElementById(`panel-type-badge-${p.index}`);
        if (badge) badge.innerText = type === 'index' ? 'IDX' : 'EQ';
      });
      await rebuildAllPanels();
    }
    updateHeader();
    renderWatchlists();
    startLivePoll();
  }catch(e){ showChartError(e.message); }
  finally{
    document.getElementById('loading').style.display = 'none';
    closeSearchModal();
  }
}

function showChartError(msg){
  document.getElementById('loading').style.display = 'none';
  const es = document.getElementById('empty-state');
  es.style.display = 'flex'; es.innerHTML = `<div class="big">⚠️</div><div>${msg}</div>`;
}

function updateHeader(){
  const primary = panelsArray[0];
  if (!primary || !primary.rawDailyCandles || !primary.rawDailyCandles.length) return;
  const last = primary.rawDailyCandles[primary.rawDailyCandles.length-1];
  const prev = primary.rawDailyCandles.length>1 ? primary.rawDailyCandles[primary.rawDailyCandles.length-2] : last;
  const displayClose = (typeof last.close === 'number') ? last.close : prev.close;
  const chg = displayClose - prev.close;
  const chgPct = prev.close ? (chg/prev.close*100) : 0;
  const cls = chg>=0?'pos':'neg';
  const liveTag = isLiveActive ? `<span style="font-size:10px;font-weight:700;color:var(--red);border:1px solid var(--red);padding:2px 7px;border-radius:20px;">● LIVE</span>` : '';
  
  document.getElementById('symbol-header').innerHTML = `
    <div class="sym-top-line">
      <span class="sym-name">${currentSymbol || '—'}</span>
      <span class="sym-price">₹${displayClose.toFixed(2)}</span>
      <span class="sym-chg ${cls}">${chg>=0?'+':''}${chg.toFixed(2)} (${chgPct>=0?'+':''}${chgPct.toFixed(2)}%)</span>
      ${liveTag}
    </div>
    <div class="sym-full">${currentName||''}</div>
  `;
}

/* ============ AGGREGATION ============ */
function aggregate(candles, interval){
  if (!candles || !candles.length) return [];
  if (interval === 'D') return candles;
  let byInterval = aggregateCache.get(candles);
  if (!byInterval) { byInterval = new Map(); aggregateCache.set(candles, byInterval); }
  const cached = byInterval.get(interval);
  if (cached) return cached;
  const groups = {}, order = [];
  candles.forEach(c => {
    const d = new Date(c.time);
    let key;
    if (interval === 'W'){
      const day = d.getDay();
      const monday = new Date(d); monday.setDate(d.getDate() - ((day+6)%7));
      key = formatToDateOnly(monday);
    } else { key = c.time.slice(0,7)+'-01'; }
    if (!groups[key]){ groups[key] = { time:key, open:c.open, high:c.high, low:c.low, close:c.close, volume:0 }; order.push(key); }
    const g = groups[key];
    g.high = Math.max(g.high, c.high);
    g.low = Math.min(g.low, c.low);
    g.close = c.close;
    g.volume += (c.volume||0);
  });
  const result = order.map(k => groups[k]);
  byInterval.set(interval, result);
  return result;
}

function updateResultAxisMarkers(panel, data) {
  if (!panel?.axisSeries) return;
  const rows = getResultsForSymbol(panel.symbol || currentSymbol);
  if (!rows.length || !data?.length) {
    try { panel.axisSeries.setMarkers([]); } catch(e) {}
    return;
  }
  const validTimes = new Set(data.map(d => formatToDateOnly(d.time)));
  const markers = rows
    .filter(r => validTimes.has(formatToDateOnly(r.date)))
    .map(r => ({
      time: formatToDateOnly(r.date),
      position: 'aboveBar',
      color: '#42a5f5',
      shape: 'square',
      text: r.label || 'RESULT'
    }));
  try { panel.axisSeries.setMarkers(markers); } catch(e) {}
}

/* ============ PARALLEL ASYNC REBUILD ALL PANELS ============ */
async function rebuildAllPanels() {
  await Promise.all(panelsArray.map(p => rebuildPanelChart(p)));
  const primary = panelsArray[0];
  if (primary && primary.rawDailyCandles && primary.rawDailyCandles.length) {
    let dailyData = aggregate(primary.rawDailyCandles, 'D');
    if(replayState.active && replayState.indexTime){
      const cut=dateFromDrawingTime(replayState.indexTime)?.getTime();
      dailyData=dailyData.filter(d=>dateFromDrawingTime(d.time)?.getTime()<=cut);
    }
    renderCombinedInfoCard(dailyData);
    renderPocketPivotStatsWidget(dailyData);
  }
}

async function rebuildPanelChart(panel) {
  if (!panel || !panel.symbol) return;
  try {
    const rawCandles = await fetchSymbolCandles(panel.symbol, panel.instrumentType || 'stock');
    panel.rawDailyCandles = rawCandles;
    if (!rawCandles || !rawCandles.length) return;

    const fullData = aggregate(rawCandles, panel.interval);
    if (!fullData || !fullData.length) return;
    const data = replayState.active ? fullData.filter(d => {
      const cut = replayState.indexTime;
      return !cut || dateFromDrawingTime(d.time)?.getTime() <= dateFromDrawingTime(cut)?.getTime();
    }) : fullData;
    if (!data || !data.length) return;

    // Feed the same candle timestamps to the dedicated bottom X-axis.
    if (panel.axisSeries) {
      panel.axisSeries.setData(data.map((d,i) => ({ time:d.time, value:i + 1 })));
      updateResultAxisMarkers(panel, data);
      try { panel.axisChart.timeScale().fitContent(); } catch(e) {}
    }

    ensureSeriesType(panel);

    if (currentChartType === 'line') {
      const lineData = data.map(d => ({ time: d.time, value: d.close }));
      panel.candleSeries.setData(lineData);
    } else {
      const formatted = processCandleColoringAndIB(data, panel, panel.interval);
      panel.candleSeries.setData(formatted);
    }

    if (volVisible) {
      renderPocketPivotVolume(data, panel);
    } else {
      panel.volumeSeries.setData([]);
    }

    renderEditableEMAs(data, panel);
    renderRSIPane(data, panel);
    renderMACDPane(data, panel);
    await renderRelativeStrengthPane(data, panel);
    if(panel.compareSymbol && panel.compareRawCandles?.length) renderComparePane(panel);

    updateTimeScaleVisibility(panel);
    if(panel.compareSymbol && panel.compareChart){
      try {
        const cr=panel.priceChart.timeScale().getVisibleLogicalRange();
        if(cr) panel.compareChart.timeScale().setVisibleLogicalRange(cr);
      } catch(e) {}
    }
    applyRangeToPanel(panel, data);
    // Re-apply the exact main logical range after async RS rendering so RS and
    // the common bottom axis always end on the same candle as the price chart.
    try {
      const range = panel.priceChart.timeScale().getVisibleLogicalRange();
      if (range) {
        panel.rsiChart.timeScale().setVisibleLogicalRange(range);
        panel.rsChart.timeScale().setVisibleLogicalRange(range);
        panel.axisChart.timeScale().setVisibleLogicalRange(range);
      }
    } catch(e) {}
    drawPanelOverlays(panel);
    updateOhlcvStrip(panel);
    if(panel.compareSymbol) updateCompareOhlcvStrip(panel);
  } catch (err) {
    console.error("Panel rebuild error:", err);
  }
}

