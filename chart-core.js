// ============================================================
// MICKKK.com Charts — Chart Core Engine & UI Event Controller
// ============================================================

function changeGridFormat(fmt) {
  gridFormat = fmt;
  const container = document.getElementById('chart-grid-container');
  if (container) container.className = `chart-grid grid-${fmt}`;
  rebuildGridSystem();
  if (currentSymbol) rebuildAllPanels();
}

function getPanelCountForFormat(fmt) {
  return fmt === '1x2' ? 2 : fmt === '2x2' ? 4 : fmt === '3x2' ? 6 : fmt === '4x2' ? 8 : 1;
}

function rebuildGridSystem() {
  destroyPanels();
  const container = document.getElementById('chart-grid-container');
  if (!container) return;
  container.innerHTML = '';
  const count = getPanelCountForFormat(gridFormat);
  const tfDefaults = ['D', 'W', 'M', 'D', 'W', 'M', 'D', 'W'];

  for (let i = 0; i < count; i++) {
    const panelElem = document.createElement('div');
    panelElem.className = 'chart-panel';
    panelElem.id = `panel-elem-${i}`;
    const initialTf = count === 1 ? currentInterval : tfDefaults[i];

    const topBar = document.createElement('div');
    topBar.className = 'panel-top-bar';
    topBar.innerHTML = `
      <button class="panel-stock-btn" onclick="openSearchModal(${i})">
        <span style="font-size:9px;color:var(--accent);">${currentInstrumentType==='index'?'IDX':'EQ'}</span> 🔍 <span id="panel-sym-label-${i}">${currentSymbol}</span> ▼
      </button>
      <div class="panel-tf-group">
        <button class="panel-tf-btn ${initialTf==='D'?'active':''}" onclick="setPanelInterval(${i},'D',this)">D</button>
        <button class="panel-tf-btn ${initialTf==='W'?'active':''}" onclick="setPanelInterval(${i},'W',this)">W</button>
        <button class="panel-tf-btn ${initialTf==='M'?'active':''}" onclick="setPanelInterval(${i},'M',this)">M</button>
      </div>`;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'panel-chart-container';
    chartContainer.id = `panel-chart-${i}`;
    chartContainer.innerHTML = `
      <div class="pane-box pane-price" id="pane-price-${i}"><canvas class="panel-overlay-canvas" id="panel-canvas-${i}"></canvas></div>
      <div class="pane-splitter" id="splitter-1-${i}"></div>
      <div class="pane-box pane-rsi" id="pane-rsi-${i}"></div>
      <div class="pane-splitter" id="splitter-2-${i}"></div>
      <div class="pane-box pane-rs" id="pane-rs-${i}"><div class="rs-pane-title">Relative Strength</div></div>
      <div class="pane-box pane-axis" id="pane-axis-${i}"></div>
      <div class="unified-crosshair-v" id="unified-crosshair-${i}"><div class="unified-crosshair-date" id="unified-crosshair-date-${i}"></div></div>`;

    panelElem.appendChild(topBar);
    panelElem.appendChild(chartContainer);
    container.appendChild(panelElem);

    const inst = createPanelChartInstance(i, initialTf);
    inst.instrumentType = currentInstrumentType || 'stock';
    panelsArray.push(inst);
    initPaneSplitterDrag(i);
    setupUnifiedCrosshairEngine(inst);
  }
}

function destroyPanels() {
  panelsArray.forEach(p => {
    ['priceChart','rsiChart','rsChart','axisChart'].forEach(k => { if (p[k]) { try { p[k].remove(); } catch(e){} } });
  });
  panelsArray = [];
}

/* DEDICATED SOLE BOTTOM DATE AXIS BAR */
function updateTimeScaleVisibility(panel) {
  const showRsi = rsiConfig.enabled, showRs = relativeStrengthConfig.enabled;
  const pRsi = document.getElementById(`pane-rsi-${panel.index}`);
  const pRs = document.getElementById(`pane-rs-${panel.index}`);
  const s1 = document.getElementById(`splitter-1-${panel.index}`);
  const s2 = document.getElementById(`splitter-2-${panel.index}`);

  if (pRsi) pRsi.style.display = showRsi ? 'block' : 'none';
  if (pRs) pRs.style.display = showRs ? 'block' : 'none';
  if (s1) s1.style.display = showRsi ? 'block' : 'none';
  if (s2) s2.style.display = showRs ? 'block' : 'none';

  [panel.priceChart, panel.rsiChart, panel.rsChart].forEach(c => {
    if (c) c.timeScale().applyOptions({ visible: false, height: 0, ticksVisible: false });
  });

  if (panel.axisChart) {
    const isDark = currentTheme === 'dark';
    panel.axisChart.timeScale().applyOptions({
      visible: true, height: 26, ticksVisible: true, borderVisible: true,
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      tickMarkFormatter: (t) => formatXAxisDate(t)
    });
  }
}

function createPanelChartInstance(index, tf) {
  const isDark = currentTheme === 'dark';
  let scaleMode = LightweightCharts.PriceScaleMode.Normal;
  if (currentScaleMode === 'log') scaleMode = LightweightCharts.PriceScaleMode.Logarithmic;
  else if (currentScaleMode === 'pct') scaleMode = LightweightCharts.PriceScaleMode.Percentage;

  const baseOpts = {
    layout: { background: { color: 'transparent' }, textColor: isDark ? '#8a9ab0' : '#707a8a', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    rightPriceScale: { borderColor: isDark ? '#1e2d3d' : '#e0e3eb', minimumWidth: 68 },
    timeScale: { visible: false, timeVisible: false, secondsVisible: false, ticksVisible: false, uniformDistribution: true, rightOffset: 0 },
    localization: { dateFormat: 'dd MMM yy' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { visible: false, labelVisible: false }, horzLine: { visible: true, labelVisible: true } },
    autoSize: true,
  };

  const priceC = LightweightCharts.createChart(document.getElementById(`pane-price-${index}`), { ...baseOpts, rightPriceScale: { borderColor: isDark ? '#1e2d3d' : '#e0e3eb', mode: scaleMode, minimumWidth: 68 } });
  const volS = priceC.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
  priceC.priceScale('vol').applyOptions({ scaleMargins: { top: 0.72, bottom: 0.02 }, autoScale: true });

  const rsiC = LightweightCharts.createChart(document.getElementById(`pane-rsi-${index}`), { ...baseOpts });
  const rsC = LightweightCharts.createChart(document.getElementById(`pane-rs-${index}`), { ...baseOpts });

  // DEDICATED SOLE BOTTOM DATE AXIS CHART
  const axisC = LightweightCharts.createChart(document.getElementById(`pane-axis-${index}`), {
    layout: { background: { color: 'transparent' }, textColor: isDark ? '#8a9ab0' : '#707a8a', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    leftPriceScale: { visible: false },
    rightPriceScale: { visible: true, minimumWidth: 68, borderVisible: false, borderColor: 'transparent', textColor: 'transparent' },
    timeScale: {
      visible: true,
      timeVisible: false,
      secondsVisible: false,
      ticksVisible: true,
      borderVisible: true,
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      tickMarkFormatter: (t) => formatXAxisDate(t),
      uniformDistribution: true,
      rightOffset: 0
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { visible: false, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
    autoSize: true
  });
  const axisSeries = axisC.addLineSeries({ color: 'rgba(0,0,0,0)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

  const canvas = document.getElementById(`panel-canvas-${index}`);

  const instObj = {
    index: index, priceChart: priceC, rsiChart: rsiC, rsChart: rsC, axisChart: axisC, axisSeries: axisSeries,
    chart: priceC, candleSeries: null, seriesType: null, volumeSeries: volS, interval: tf,
    symbol: currentSymbol, symbolName: currentName, instrumentType: currentInstrumentType,
    rawDailyCandles: [], overlayCanvas: canvas, emaSeriesList: [], volMASeries: null,
    rsiSeries: null, rsiMASeries: null, rsiThresholdLines: [], rsSeries: null, rsMASeries: null,
    rsValueByTime: [], benchmarkCandles: []
  };

  ensureSeriesType(instObj);

  let isSyncing = false;
  const syncPanes = (source) => {
    source.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      [priceC, rsiC, rsC, axisC].forEach(c => {
        if (c && c !== source) { try { c.timeScale().setVisibleLogicalRange(range); } catch(e){} }
      });
      isSyncing = false;
      requestAnimationFrame(() => drawPanelOverlays(instObj));
    });
  };

  [priceC, rsiC, rsC, axisC].forEach(c => syncPanes(c));
  updateTimeScaleVisibility(instObj);
  return instObj;
}

/* UNIFIED FULL-HEIGHT CROSSHAIR ENGINE */
function setupUnifiedCrosshairEngine(instObj) {
  const container = document.getElementById(`panel-chart-${instObj.index}`);
  const crosshair = document.getElementById(`unified-crosshair-${instObj.index}`);
  const dateBadge = document.getElementById(`unified-crosshair-date-${instObj.index}`);
  if (!container || !crosshair || !dateBadge) return;

  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const time = instObj.priceChart.timeScale().coordinateToTime(mouseX);
    if (!time) {
      crosshair.style.display = 'none';
      if (instObj.index === 0) {
        const box = document.getElementById('ohlc-box');
        if (box) box.style.display = 'none';
      }
      return;
    }

    const snapX = instObj.priceChart.timeScale().timeToCoordinate(time);
    const finalX = (snapX !== null && Number.isFinite(snapX)) ? snapX : mouseX;

    crosshair.style.left = `${Math.round(finalX)}px`;
    crosshair.style.display = 'block';
    dateBadge.textContent = formatXAxisDate(time);

    if (instObj.index === 0) {
      const data = aggregate(instObj.rawDailyCandles, instObj.interval);
      const candle = data.find(c => String(c.time) === String(time));
      if (candle) updateOHLCBox(candle);
    }
  });

  container.addEventListener('mouseleave', () => {
    crosshair.style.display = 'none';
    if (instObj.index === 0) {
      const box = document.getElementById('ohlc-box');
      if (box) box.style.display = 'none';
    }
  });
}

function updateOHLCBox(bar) {
  const box = document.getElementById('ohlc-box');
  if (!box || !bar) return;

  const open = Number(bar.open), high = Number(bar.high), low = Number(bar.low), close = Number(bar.close);
  const chg = close - open;
  const chgPct = open ? (chg / open * 100) : 0;
  const cls = chg >= 0 ? 'lg' : 'lr';

  box.style.display = 'flex';
  box.innerHTML = `
    <b style="color:var(--text);">${currentSymbol || ''}</b>
    <span style="color:var(--border);">|</span>
    <span>O <b style="color:var(--text);">${open.toFixed(2)}</b></span>
    <span>H <b style="color:var(--text);">${high.toFixed(2)}</b></span>
    <span>L <b style="color:var(--text);">${low.toFixed(2)}</b></span>
    <span>C <b style="color:var(--text);">${close.toFixed(2)}</b></span>
    <span class="${cls}">${chg>=0?'+':''}${chg.toFixed(2)} (${chgPct>=0?'+':''}${chgPct.toFixed(2)}%)</span>
    ${bar.volume !== undefined ? '<span style="color:var(--border);">|</span> Vol <b style="color:var(--text);">' + fmtVol(bar.volume) + '</b>' : ''}
  `;
}

async function loadSymbol(symbol, name, targetIdx, instrumentType='stock'){
  stopLivePoll();
  const type = instrumentType === 'index' ? 'index' : 'stock';
  if (targetIdx === -1 || targetIdx === undefined) {
    currentSymbol = symbol; currentName = name; currentInstrumentType = type;
    const l = document.getElementById('top-stock-btn-label'); 
    if (l) l.innerText = `${type==='index'?'📊':'🔍'} ${symbol}`;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';

  try {
    panelsArray.forEach(p => { 
      p.symbol = symbol; p.symbolName = name; p.instrumentType = type; 
      const lbl = document.getElementById(`panel-sym-label-${p.index}`);
      if (lbl) lbl.innerText = symbol;
    });
    await rebuildAllPanels();
    updateHeader();
    startLivePoll();
  } catch(e){ 
    showChartError(e.message); 
  } finally { 
    document.getElementById('loading').style.display = 'none'; 
    closeSearchModal(); 
  }
}

async function rebuildAllPanels() {
  await Promise.all(panelsArray.map(p => rebuildPanelChart(p)));
  const primary = panelsArray[0];
  if (primary && primary.rawDailyCandles && primary.rawDailyCandles.length) {
    const dailyData = aggregate(primary.rawDailyCandles, 'D');
    renderCombinedInfoCard(dailyData);
    if (typeof renderPocketPivotStatsWidget === 'function') {
      renderPocketPivotStatsWidget(dailyData);
    }
  }
}

async function rebuildPanelChart(panel) {
  if (!panel || !panel.symbol) return;
  try {
    const raw = await fetchFreshCandles(panel.symbol, panel.instrumentType);
    panel.rawDailyCandles = raw;
    if (!raw.length) return;

    const data = aggregate(raw, panel.interval);
    if (!data.length) return;

    if (panel.axisSeries) {
      panel.axisSeries.setData(data.map(d => ({ time: d.time, value: 0 })));
    }

    ensureSeriesType(panel);

    if (currentChartType === 'line') {
      panel.candleSeries.setData(data.map(d => ({ time: d.time, value: d.close })));
    } else {
      panel.candleSeries.setData(data);
    }

    if (volVisible) {
      panel.volumeSeries.setData(data.map(c => ({ time: c.time, value: c.volume||0, color: c.close>=c.open?'#00e67688':'#ff3d5a88' })));
    } else {
      panel.volumeSeries.setData([]);
    }

    renderEditableEMAs(data, panel);
    renderRSIPane(data, panel);
    await renderRelativeStrengthPane(data, panel);

    updateTimeScaleVisibility(panel);
    applyRangeToPanel(panel, data);
    drawPanelOverlays(panel);
  } catch(err){ 
    console.error(err); 
  }
}

function ensureSeriesType(panel) {
  if (panel.candleSeries) { try { panel.priceChart.removeSeries(panel.candleSeries); } catch(e){} }
  if (currentChartType === 'bar') {
    panel.candleSeries = panel.priceChart.addBarSeries({ upColor: '#26a69a', downColor: '#ef5350' });
  } else if (currentChartType === 'line') {
    panel.candleSeries = panel.priceChart.addLineSeries({ color: '#00d4ff', lineWidth: 2 });
  } else {
    panel.candleSeries = panel.priceChart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a', borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
  }
}

function updateHeader(){
  const p = panelsArray[0]; 
  if (!p || !p.rawDailyCandles || !p.rawDailyCandles.length) return;
  const last = p.rawDailyCandles[p.rawDailyCandles.length - 1];
  const prev = p.rawDailyCandles.length > 1 ? p.rawDailyCandles[p.rawDailyCandles.length - 2] : last;
  const chg = last.close - prev.close, pct = prev.close ? (chg / prev.close * 100) : 0, cls = chg >= 0 ? 'pos' : 'neg';
  document.getElementById('symbol-header').innerHTML = `
    <div class="sym-top-line">
      <span class="sym-name">${currentSymbol}</span>
      <span class="sym-price">₹${Number(last.close).toFixed(2)}</span>
      <span class="sym-chg ${cls}">${chg>=0?'+':''}${chg.toFixed(2)} (${pct>=0?'+':''}${pct.toFixed(2)}%)</span>
    </div>
    <div class="sym-full">${currentName}</div>`;
}

function applyRangeToPanel(panel, data) {
  if (!panel || !data || !data.length) return;
  if (currentRange === 'ALL') { 
    [panel.priceChart, panel.rsiChart, panel.rsChart, panel.axisChart].forEach(c => c && c.timeScale().fitContent()); 
    return; 
  }
  let bars = currentRange === '1M' ? 22 : currentRange === '3M' ? 65 : currentRange === '6M' ? 130 : 252;
  const range = { from: Math.max(0, data.length - bars), to: data.length - 1 };
  [panel.priceChart, panel.rsiChart, panel.rsChart, panel.axisChart].forEach(c => { 
    if(c) try { c.timeScale().setVisibleLogicalRange(range); } catch(e){} 
  });
}

function setRange(r, btn){ 
  currentRange = r; 
  btn.parentElement.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active')); 
  btn.classList.add('active'); 
  panelsArray.forEach(p => applyRangeToPanel(p, aggregate(p.rawDailyCandles, p.interval))); 
}

function setInterval_(i, btn){ 
  currentInterval = i; 
  btn.parentElement.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active')); 
  btn.classList.add('active'); 
  panelsArray.forEach(p => p.interval = i); 
  rebuildAllPanels(); 
}

function setChartType(t, btn){ 
  currentChartType = t; 
  btn.parentElement.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active')); 
  btn.classList.add('active'); 
  panelsArray.forEach(p => ensureSeriesType(p));
  rebuildAllPanels(); 
}

function setPriceScaleMode(m, btn){ 
  currentScaleMode = m; 
  btn.parentElement.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active')); 
  btn.classList.add('active'); 
  rebuildGridSystem(); 
  rebuildAllPanels();
}

function toggleVolume(btn){ 
  volVisible = !volVisible; 
  btn.classList.toggle('active'); 
  rebuildAllPanels(); 
}

function toggleTheme(){ 
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; 
  document.body.classList.toggle('light-theme', currentTheme === 'light'); 
  rebuildGridSystem(); 
  rebuildAllPanels();
}

function toggleDrawingToolbar(){ 
  document.getElementById('drawing-toolbar')?.classList.toggle('collapsed'); 
  document.querySelector('.main')?.classList.toggle('tools-collapsed'); 
}

function setTool(t, btn){ 
  activeTool = t; 
  document.querySelectorAll('.draw-btn').forEach(b => b.classList.remove('active')); 
  if (btn) btn.classList.add('active'); 
}

function zoomChart(m){ 
  panelsArray.forEach(p => { 
    const ts = p.priceChart.timeScale(), r = ts.getVisibleLogicalRange(); 
    if (r) { 
      const half = Math.max(3, (r.to - r.from) * m / 2), mid = (r.from + r.to) / 2; 
      ts.setVisibleLogicalRange({ from: mid - half, to: mid + half }); 
    } 
  }); 
}

function resetChartView(){ 
  panelsArray.forEach(p => applyRangeToPanel(p, aggregate(p.rawDailyCandles, p.interval))); 
}

function toggleFullScreen(){ 
  if (!document.fullscreenElement) document.documentElement.requestFullscreen(); 
  else document.exitFullscreen(); 
}

function captureChartScreenshot(){ 
  if (panelsArray[0]) { 
    const c = panelsArray[0].priceChart.takeScreenshot(); 
    const a = document.createElement('a'); 
    a.download = `${currentSymbol}_Chart.png`; 
    a.href = c.toDataURL(); 
    a.click(); 
  } 
}

function openSearchModal(idx){ 
  searchTargetPanelIndex = idx; 
  document.getElementById('search-modal').classList.add('open'); 
  filterSearchModal(); 
}

function closeSearchModal(){ 
  document.getElementById('search-modal').classList.remove('open'); 
}

function setSearchMode(m){ 
  searchMode = m; 
  document.getElementById('tab-stocks').classList.toggle('active', m==='stock'); 
  document.getElementById('tab-indices').classList.toggle('active', m==='index'); 
  filterSearchModal(); 
}

function filterSearchModal(){
  const q = document.getElementById('modal-search-input').value.toLowerCase().trim();
  const list = (searchMode === 'index' ? allIndices : allSymbols).filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  const el = document.getElementById('modal-search-results');
  el.innerHTML = list.slice(0, 150).map(s => `<div class="search-row-item" onclick="loadSymbol('${s.symbol}','${s.name}',searchTargetPanelIndex,'${searchMode}')"><span class="s-name">${s.name}</span><span class="s-sym">${s.symbol}</span></div>`).join('');
}

function openIndicatorsModal(){ document.getElementById('ind-modal').classList.add('open'); }
function closeIndicatorsModal(){ document.getElementById('ind-modal').classList.remove('open'); }
function openPriceAlertModal(){ document.getElementById('alert-stock-name').innerText = currentSymbol; document.getElementById('alert-modal').classList.add('open'); }
function closePriceAlertModal(){ document.getElementById('alert-modal').classList.remove('open'); }
function openMyAlertsModal(){ document.getElementById('my-alerts-modal').classList.add('open'); }
function closeMyAlertsModal(){ document.getElementById('my-alerts-modal').classList.remove('open'); }
function toggleWatchlistPanel(force){ 
  const p = document.getElementById('watchlist-panel'); 
  p.classList.toggle('open', force !== undefined ? force : !p.classList.contains('open')); 
}

function initPaneSplitterDrag(index) {
  const container = document.getElementById(`panel-chart-${index}`), panePrice = document.getElementById(`pane-price-${index}`), sp = document.getElementById(`splitter-1-${index}`);
  if (!container || !panePrice || !sp) return;
  let drag = false; 
  sp.onmousedown = () => drag = true; 
  window.onmouseup = () => drag = false;
  window.addEventListener('mousemove', e => { 
    if (!drag) return; 
    panePrice.style.flex = `0 0 ${Math.max(100, e.clientY - container.getBoundingClientRect().top)}px`; 
  });
}

function updateEMAConfig(){
  [1,2,3,4].forEach((n, i) => {
    emaConfigs[i].enabled = document.getElementById(`ema${n}-en`).checked;
    emaConfigs[i].len = parseInt(document.getElementById(`ema${n}-len`).value) || 9;
    emaConfigs[i].color = document.getElementById(`ema${n}-color`).value;
  });
  if (currentSymbol) rebuildAllPanels();
}

function updateRSIConfig(){
  rsiConfig.enabled = document.getElementById('rsi-en').checked;
  rsiConfig.len = parseInt(document.getElementById('rsi-len').value) || 14;
  rsiConfig.color = document.getElementById('rsi-color').value;
  if (currentSymbol) rebuildAllPanels();
}

function updateRelativeStrengthConfig(){
  relativeStrengthConfig.enabled = document.getElementById('rs-en').checked;
  relativeStrengthConfig.benchmarkSymbol = document.getElementById('rs-benchmark').value;
  if (currentSymbol) rebuildAllPanels();
}

function toggleIndicator(k){ 
  activeIndicators[k] = !activeIndicators[k]; 
  rebuildAllPanels(); 
}

function resetToDefaults(){
  cprConfig = { weekly: true, monthly: true, showLabels: false };
  document.getElementById('cpr-weekly-en').checked = true;
  document.getElementById('cpr-monthly-en').checked = true;
  if (document.getElementById('cpr-labels-en')) document.getElementById('cpr-labels-en').checked = false;
  rebuildAllPanels();
}

function showChartError(msg){
  document.getElementById('loading').style.display = 'none';
  const es = document.getElementById('empty-state');
  es.style.display = 'flex'; 
  es.innerHTML = `<div style="font-size:32px;">⚠️</div><div>${msg}</div>`;
}

function setPanelInterval(idx, tf, btn) {
  const panel = panelsArray[idx];
  if (!panel) return;
  panel.interval = tf;
  btn.parentElement.querySelectorAll('.panel-tf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  rebuildPanelChart(panel);
}

function clearDrawings(){ 
  userDrawings = []; 
  rebuildAllPanels(); 
}

function navigateStock(dir) {
  const list = searchMode === 'index' ? allIndices : allSymbols;
  let idx = list.findIndex(s => s.symbol === currentSymbol);
  if (idx === -1) idx = 0;
  idx = (idx + dir + list.length) % list.length;
  loadSymbol(list[idx].symbol, list[idx].name, -1, searchMode);
}

/* ============================================================
   STARTUP & AUTO-INITIALIZATION TRIGGER
   ============================================================ */
function initSystem() {
  rebuildGridSystem();
  fetchPriceBandsData();
  loadSymbol(currentSymbol, currentName, -1, currentInstrumentType);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowUp') { e.preventDefault(); navigateStock(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateStock(1); }
  });

  window.addEventListener('resize', () => {
    panelsArray.forEach(p => {
      const elem = document.getElementById(`panel-chart-${p.index}`);
      if (elem) {
        [p.priceChart, p.rsiChart, p.rsChart, p.axisChart].forEach(c => {
          if (c) c.applyOptions({ width: elem.clientWidth });
        });
        drawPanelOverlays(p);
      }
    });
  });
}

// AUTO-START AS SOON AS PAGE LOADS
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSystem);
} else {
  initSystem();
}
