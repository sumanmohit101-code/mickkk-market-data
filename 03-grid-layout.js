/* ============ MULTI-GRID SWITCHER ============ */
function changeGridFormat(fmt) {
  gridFormat = fmt;
  const container = document.getElementById('chart-grid-container');
  if (container) container.className = `chart-grid grid-${fmt}`;
  rebuildGridSystem();
}

function getPanelCountForFormat(fmt) {
  if (fmt === '1x1') return 1;
  if (fmt === '1x2' || fmt === '2x1' || fmt === 'stock-index') return 2;
  if (fmt === '2x2') return 4;
  if (fmt === '3x2') return 6;
  if (fmt === '4x2') return 8;
  return 1;
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
        <span id="panel-type-badge-${i}" style="font-size:9px;color:var(--accent);font-family:var(--mono);font-weight:700;">${gridFormat === 'stock-index' ? (i===0 ? 'EQ' : 'IDX') : (currentInstrumentType==='index'?'IDX':'EQ')}</span>
        🔍 <span id="panel-sym-label-${i}">${gridFormat === 'stock-index' ? (i===0 ? (currentSymbol || 'Select Instrument') : 'NIFTYSMALLCAP250') : (currentSymbol || 'Select Instrument')}</span> ▼
      </button>
      <button class="compare-add-btn" title="Add comparison pane" onclick="openCompareSearch(${i});event.stopPropagation();">＋</button>
      <div class="panel-tf-group">
        <button class="panel-tf-btn ${initialTf==='D'?'active':''}" onclick="setPanelInterval(${i}, 'D', this)">D</button>
        <button class="panel-tf-btn ${initialTf==='W'?'active':''}" onclick="setPanelInterval(${i}, 'W', this)">W</button>
        <button class="panel-tf-btn ${initialTf==='M'?'active':''}" onclick="setPanelInterval(${i}, 'M', this)">M</button>
      </div>
    `;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'panel-chart-container';
    chartContainer.id = `panel-chart-${i}`;

 chartContainer.innerHTML = `
      <div class="pane-box pane-price" id="pane-price-${i}"><canvas class="panel-overlay-canvas" id="panel-canvas-${i}"></canvas><canvas class="vp-fill" id="vp-fill-${i}"></canvas><div class="ohlc-box" id="ohlc-box-${i}">O — &nbsp; H — &nbsp; L — &nbsp; C — &nbsp; V — &nbsp; Δ —</div></div>
      <div class="pane-splitter" id="splitter-rsi-${i}"></div>
      <div class="pane-box pane-rsi" id="pane-rsi-${i}">
        <canvas class="rsi-bg-canvas" id="rsi-bg-canvas-${i}"></canvas>
        <div class="pane-legend">
          <span class="legend-title" id="title-rsi-${i}">RSI (14)</span>
          <button class="pane-legend-btn" title="Move Up" onclick="moveIndicatorPane(${i}, 'rsi', -1)">▲</button>
          <button class="pane-legend-btn" title="Move Down" onclick="moveIndicatorPane(${i}, 'rsi', 1)">▼</button>
          <button class="pane-legend-btn" title="Settings" onclick="openSingleIndicatorSettings('rsi')">⚙️</button>
          <button class="pane-legend-btn" title="Hide" onclick="toggleIndicatorFromLegend('rsi')">✕</button>
        </div>
      </div>
      <div class="pane-splitter" id="splitter-macd-${i}"></div>
      <div class="pane-box pane-macd" id="pane-macd-${i}">
        <div class="pane-legend">
          <span class="legend-title" id="title-macd-${i}">MACD (12, 26, 9)</span>
          <button class="pane-legend-btn" title="Move Up" onclick="moveIndicatorPane(${i}, 'macd', -1)">▲</button>
          <button class="pane-legend-btn" title="Move Down" onclick="moveIndicatorPane(${i}, 'macd', 1)">▼</button>
          <button class="pane-legend-btn" title="Settings" onclick="openSingleIndicatorSettings('macd')">⚙️</button>
          <button class="pane-legend-btn" title="Hide" onclick="toggleIndicatorFromLegend('macd')">✕</button>
        </div>
      </div>
      <div class="pane-splitter" id="splitter-rs-${i}"></div>
      <div class="pane-box pane-rs" id="pane-rs-${i}">
        <canvas class="rs-fill-canvas" id="rs-fill-canvas-${i}"></canvas>
        <div class="pane-legend">
          <span class="legend-title" id="title-rs-${i}">RS</span>
          <button class="pane-legend-btn" title="Move Up" onclick="moveIndicatorPane(${i}, 'rs', -1)">▲</button>
          <button class="pane-legend-btn" title="Move Down" onclick="moveIndicatorPane(${i}, 'rs', 1)">▼</button>
          <button class="pane-legend-btn" title="Settings" onclick="openSingleIndicatorSettings('rs')">⚙️</button>
          <button class="pane-legend-btn" title="Hide" onclick="toggleIndicatorFromLegend('rs')">✕</button>
        </div>
      </div>
      <div class="pane-splitter" id="splitter-compare-${i}" style="display:none"></div>
      <div class="pane-box pane-compare" id="pane-compare-${i}">
        <canvas class="compare-fill-canvas" id="compare-fill-canvas-${i}"></canvas>
        <div class="pane-legend">
          <span class="legend-title" id="title-compare-${i}">Compare —</span>
          <select class="compare-type-select" id="compare-type-${i}" onchange="updateCompareChartType(${i},this.value)">
            <option value="candle">Candle</option><option value="bar">Bar</option><option value="line">Line</option>
          </select>
          <button class="pane-legend-btn" title="Move Up" onclick="moveIndicatorPane(${i}, 'compare', -1);event.stopPropagation();">▲</button>
          <button class="pane-legend-btn" title="Move Down" onclick="moveIndicatorPane(${i}, 'compare', 1);event.stopPropagation();">▼</button>
          <button class="pane-legend-btn" title="Change symbol" onclick="openCompareSearch(${i})">＋</button>
          <span class="compare-ohlcv-strip" id="compare-ohlcv-strip-${i}">O — &nbsp; H — &nbsp; L — &nbsp; C — &nbsp; V — &nbsp; Δ —</span>
          <button class="pane-legend-btn" title="Hide compare" onclick="hideComparePane(${i})">✕</button>
        </div>
      </div>
      <div class="pane-box pane-axis" id="pane-axis-${i}"></div>
      <div class="shared-crosshair-v" id="shared-crosshair-${i}"></div>
    `;
    panelElem.appendChild(topBar);
    panelElem.appendChild(chartContainer);
    container.appendChild(panelElem);

    const inst = createPanelChartInstance(i, initialTf);
    if (gridFormat === 'stock-index') {
      if (i === 0) {
        inst.symbol = currentSymbol || '20MICRONS';
        inst.symbolName = currentName || '20 Microns Limited';
        inst.instrumentType = 'stock';
      } else {
        inst.symbol = 'NIFTYSMALLCAP250';
        inst.symbolName = 'NIFTY Smallcap 250';
        inst.instrumentType = 'index';
      }
    } else {
      inst.instrumentType = currentInstrumentType || 'stock';
    }
    panelsArray.push(inst);

    initPaneSplitterDrag(i);
  }

  if (currentSymbol) {
    rebuildAllPanels();
  }
}

function destroyPanels() {
  panelsArray.forEach(p => {
    if (p.priceChart) { try { p.priceChart.remove(); } catch(e){} }
    if (p.rsiChart) { try { p.rsiChart.remove(); } catch(e){} }
    if (p.rsChart) { try { p.rsChart.remove(); } catch(e){} }
    if (p.compareChart) { try { p.compareChart.remove(); } catch(e){} }
    if (p.axisChart) { try { p.axisChart.remove(); } catch(e){} }
  });
  panelsArray = [];
}

 
/* TRADINGVIEW INDICATOR CONTROLS: REORDER, SETTINGS & QUICK-CLOSE */
let indicatorOrder = ['rsi', 'macd', 'rs', 'compare'];

function moveIndicatorPane(panelIndex, indKey, dir) {
  const idx = indicatorOrder.indexOf(indKey);
  if (idx === -1) return;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= indicatorOrder.length) return;

  // Swap position in order
  const temp = indicatorOrder[idx];
  indicatorOrder[idx] = indicatorOrder[targetIdx];
  indicatorOrder[targetIdx] = temp;

  const container = document.getElementById(`panel-chart-${panelIndex}`);
  const axisPane = document.getElementById(`pane-axis-${panelIndex}`);
  if (!container || !axisPane) return;

  // Reorder physically in DOM
  indicatorOrder.forEach(key => {
    const sp = document.getElementById(`splitter-${key}-${panelIndex}`);
    const pane = document.getElementById(`pane-${key}-${panelIndex}`);
    if (sp && pane) {
      container.insertBefore(sp, axisPane);
      container.insertBefore(pane, axisPane);
    }
  });

  if (panelsArray[panelIndex]) {
    updateTimeScaleVisibility(panelsArray[panelIndex]);
  }
}

function toggleIndicatorFromLegend(key) {
  if (key === 'rsi') {
    rsiConfig.enabled = false;
    const chk = document.getElementById('rsi-en'); if (chk) chk.checked = false;
  } else if (key === 'macd') {
    macdConfig.enabled = false;
    const chk = document.getElementById('macd-en'); if (chk) chk.checked = false;
  } else if (key === 'rs') {
    relativeStrengthConfig.enabled = false;
    const chk = document.getElementById('rs-en'); if (chk) chk.checked = false;
  }
  if (currentSymbol) rebuildAllPanels();
}

function openSingleIndicatorSettings(key) {
  openIndicatorsModal();
  const targetId = key === 'rsi' ? 'rsi-len' : key === 'macd' ? 'macd-en' : 'rs-benchmark';
  const el = document.getElementById(targetId);
  if (el) {
    const section = el.closest('.ind-section');
    if (section) {
      setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        section.style.transition = 'background 0.3s';
        section.style.background = 'rgba(0, 212, 255, 0.12)';
        section.style.borderRadius = '6px';
        setTimeout(() => { section.style.background = 'transparent'; }, 1200);
      }, 100);
    }
  }
}
  
/* UNIVERSAL MULTI-PANE AUTO-RESET MANAGER */
function updateTimeScaleVisibility(panel) {
  const showRsi  = rsiConfig.enabled;
  const showMacd = macdConfig.enabled;
  const showRs   = relativeStrengthConfig.enabled;
  const showCompare = !!panel.compareSymbol;

  const panePrice = document.getElementById(`pane-price-${panel.index}`);
  const paneRsi   = document.getElementById(`pane-rsi-${panel.index}`);
  const paneMacd  = document.getElementById(`pane-macd-${panel.index}`);
  const paneRs    = document.getElementById(`pane-rs-${panel.index}`);
  const paneCompare = document.getElementById(`pane-compare-${panel.index}`);

  const sRsi  = document.getElementById(`splitter-rsi-${panel.index}`);
  const sMacd = document.getElementById(`splitter-macd-${panel.index}`);
  const sRs   = document.getElementById(`splitter-rs-${panel.index}`);
  const sCompare = document.getElementById(`splitter-compare-${panel.index}`);

  if (paneRsi)  paneRsi.style.display  = showRsi  ? 'block' : 'none';
  if (paneMacd) paneMacd.style.display = showMacd ? 'block' : 'none';
  if (paneRs)   paneRs.style.display   = showRs   ? 'block' : 'none';
  if (paneCompare) { paneCompare.style.display = showCompare ? 'flex' : 'none'; paneCompare.style.flex = showCompare ? '0.55 1 0px' : ''; paneCompare.style.minHeight = showCompare ? '70px' : ''; }

  const visibleIndicators = [];
  if (showRsi)  visibleIndicators.push(paneRsi);
  if (showMacd) visibleIndicators.push(paneMacd);
  if (showRs)   visibleIndicators.push(paneRs);
  if (showCompare) visibleIndicators.push(paneCompare);

  // Splitters hide/show
  if (sRsi)  sRsi.style.display  = showRsi ? 'block' : 'none';
  if (sMacd) sMacd.style.display = (showMacd && (showRsi || panePrice)) ? 'block' : 'none';
  if (sRs)   sRs.style.display   = (showRs && (showMacd || showRsi || panePrice)) ? 'block' : 'none';
  if (sCompare) sCompare.style.display = showCompare ? 'block' : 'none';

 // --- AUTO PROPORTIONAL RESET: NO FIXED PIXELS LEFTOVER ---
  if (visibleIndicators.length === 0) {
    if (panePrice) {
      panePrice.style.flex = '1 1 auto';
      panePrice.style.height = '';
    }
  } else {
    // Price pane ko zyada space (7.0) aur indicators ko compact (0.8) kiya
    if (panePrice) panePrice.style.flex = '7.0 1 0px';
    visibleIndicators.forEach(p => { if (p) p.style.flex = '0.8 1 0px'; });
  }

  // Upper indicator panes hide their time scale
  [panel.priceChart, panel.rsiChart, panel.macdChart, panel.rsChart, panel.compareChart].forEach(c => {
    if (!c) return;
    c.timeScale().applyOptions({ visible: false, height: 0, ticksVisible: false });
  });

  // Dedicated bottom axis chart always remains permanently pinned at the bottom
  if (panel.axisChart) {
    const isDark = currentTheme === 'dark';
    try { panel.axisChart.applyOptions({ height: 26 }); } catch(e) {}
    panel.axisChart.timeScale().applyOptions({
      visible: true, height: 26, ticksVisible: true, borderVisible: true,
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      tickMarkFormatter: (t) => formatXAxisDate(t)
    });
  }

  const container = document.getElementById(`panel-chart-${panel.index}`);
  if (container) {
    setTimeout(() => {
      [panel.priceChart, panel.rsiChart, panel.macdChart, panel.rsChart, panel.compareChart, panel.axisChart].forEach(c => {
        if (c) try { c.applyOptions({ width: container.clientWidth }); } catch(err){}
      });
      drawPanelOverlays(panel);
      if (panel.compareChart) { try { panel.compareChart.applyOptions({ width: container.clientWidth, height: Math.max(70, document.getElementById(`pane-compare-${panel.index}`)?.clientHeight || 80) }); } catch(e) {} }
      if (typeof positionPocketPivotStatsWidget === 'function') positionPocketPivotStatsWidget(panel);
    }, 25);
  }
}
  
function createPanelChartInstance(index, tf) {
  const isDark = currentTheme === 'dark';
  let scaleMode = LightweightCharts.PriceScaleMode.Normal;
  if (currentScaleMode === 'log') scaleMode = LightweightCharts.PriceScaleMode.Logarithmic;
  else if (currentScaleMode === 'pct') scaleMode = LightweightCharts.PriceScaleMode.Percentage;

  const baseChartOpts = {
    layout: { background: { color: 'transparent' }, textColor: isDark ? '#8a9ab0' : '#707a8a', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    rightPriceScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      minimumWidth: 68
    },
    timeScale: {
      visible: true,
      timeVisible: false,
      secondsVisible: false,
      ticksVisible: true,
      uniformDistribution: true,
      rightOffset: 0,
      tickMarkFormatter: (time) => formatXAxisDate(time),
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb'
    },
    localization: { dateFormat: 'dd MMM yy' },
    autoSize: true,
  };

  const priceContainer = document.getElementById(`pane-price-${index}`);
  const priceC = LightweightCharts.createChart(priceContainer, {
    ...baseChartOpts,
    rightPriceScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      mode: scaleMode,
      minimumWidth: 68
    }
  });

  const volS = priceC.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
  });
  priceC.priceScale('vol').applyOptions({ scaleMargins: { top: 0.90, bottom: 0.001 }, autoScale: true });

  const rsiContainer = document.getElementById(`pane-rsi-${index}`);
  const rsiC = LightweightCharts.createChart(rsiContainer, {
    ...baseChartOpts,
    timeScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      timeVisible: false,
      secondsVisible: false,
      ticksVisible: false,
      visible: false,
      rightOffset: 0,
      barSpacing: 6,
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true,
      uniformDistribution: true,
      tickMarkFormatter: (time) => formatXAxisDate(time)
    },
    localization: { dateFormat: 'dd MMM yy' }
  });

  const rsContainer = document.getElementById(`pane-rs-${index}`);
  const rsC = LightweightCharts.createChart(rsContainer, {
    ...baseChartOpts,
    timeScale: { borderColor:isDark?'#1e2d3d':'#e0e3eb', timeVisible:false, secondsVisible:false, ticksVisible:false, visible:false, rightOffset:0, barSpacing:6, fixLeftEdge:false, lockVisibleTimeRangeOnResize:true, uniformDistribution:true, tickMarkFormatter:(time)=>formatXAxisDate(time) },
    localization:{dateFormat:'dd MMM yy'}
  });

  const macdContainer = document.getElementById(`pane-macd-${index}`);
  const macdC = LightweightCharts.createChart(macdContainer, {
    ...baseChartOpts,
    timeScale: { borderColor:isDark?'#1e2d3d':'#e0e3eb', timeVisible:false, secondsVisible:false, ticksVisible:false, visible:false, rightOffset:0, barSpacing:6, fixLeftEdge:false, lockVisibleTimeRangeOnResize:true, uniformDistribution:true, tickMarkFormatter:(time)=>formatXAxisDate(time) },
    localization:{dateFormat:'dd MMM yy'}
  });
  
  const compareContainer = document.getElementById(`pane-compare-${index}`);
  const compareC = LightweightCharts.createChart(compareContainer, {
    ...baseChartOpts,
    timeScale: { borderColor:isDark?'#1e2d3d':'#e0e3eb', timeVisible:false, secondsVisible:false, ticksVisible:false, visible:false, rightOffset:0, barSpacing:6, fixLeftEdge:false, lockVisibleTimeRangeOnResize:true, uniformDistribution:true, tickMarkFormatter:(time)=>formatXAxisDate(time) },
    localization:{dateFormat:'dd MMM yy'}
  });

  // Dedicated common time-axis chart. It is rendered AFTER all indicator panes,
  // so the X-axis is physically the bottom-most element of the panel. The right
  // price-scale width matches the main chart, keeping the date ticks pixel-aligned
  // with the candle/RS plots.
  const axisContainer = document.getElementById(`pane-axis-${index}`);
  const axisC = LightweightCharts.createChart(axisContainer, {
    layout: { background: { color: 'transparent' }, textColor: isDark ? '#8a9ab0' : '#707a8a', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    leftPriceScale: { visible: false },
    rightPriceScale: { visible: true, borderVisible: false, drawTicks: false, minimumWidth: 68 },
    timeScale: { visible:true, timeVisible:false, secondsVisible:false, ticksVisible:true, uniformDistribution:true, rightOffset:0, borderColor:isDark?'#1e2d3d':'#e0e3eb', tickMarkFormatter:(time)=>formatXAxisDate(time) },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { visible: true, labelVisible: true, style: LightweightCharts.LineStyle.Dashed, width: 1, color: isDark ? 'rgba(212, 228, 240, 0.45)' : 'rgba(19, 23, 34, 0.45)' },
      horzLine: { visible: false, labelVisible: false } // YEH HORIZONTAL DOTTED LINE KO HIDE KAREGA
    },
    autoSize: true
  });
  const axisSeries = axisC.addLineSeries({ color:'rgba(0,0,0,0)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, visible:true, priceFormat:{type:'custom', formatter:()=>''} });


  const canvas = document.getElementById(`panel-canvas-${index}`);

  const instObj = {
    index: index,
    priceChart: priceC,
    rsiChart: rsiC,
    rsChart: rsC,
    axisChart: axisC,
    axisSeries: axisSeries,
    chart: priceC,
    candleSeries: null,
    seriesType: null,
    volumeSeries: volS,
    interval: tf,
    symbol: currentSymbol,
    symbolName: currentName,
    instrumentType: currentInstrumentType || 'stock',
    rawDailyCandles: [],
    overlayCanvas: canvas, volumeProfileCanvas: document.getElementById(`vp-fill-${index}`),
    emaSeriesList: [],
    volMASeries: null,
    rsiSeries: null, rsiMASeries: null, rsiThresholdLines: [],
    rsSeries: null, rsMASeries: null, rsValueByTime: [], benchmarkCandles: [], rsFillCanvas: document.getElementById(`rs-fill-canvas-${index}`),
    rsiHighlightCanvas: document.getElementById(`rsi-bg-canvas-${index}`),
    macdChart: macdC, macdLineSeries: null, macdSignalSeries: null, macdHistSeries: null, macdValueByTime: [],
    compareChart: compareC, compareSeries: null, compareSymbol: null, compareName: null, compareType: 'candle', compareInstrumentType: 'stock', compareRawCandles: [], compareBase: 100, supertrendSeriesList: [], ohlcvStrip: document.getElementById(`ohlc-box-${index}`)
  };

  ensureSeriesType(instObj);
  if (instObj.rsFillCanvas) { instObj.rsFillCanvas.width = Math.max(1, document.getElementById(`pane-rs-${index}`)?.clientWidth || 1); instObj.rsFillCanvas.height = Math.max(1, document.getElementById(`pane-rs-${index}`)?.clientHeight || 1); }

  // Native chart ki vertical line off karein taaki double line na bane
  priceC.applyOptions({ crosshair: { vertLine: { visible: false } } });
  rsiC.applyOptions({ crosshair: { vertLine: { visible: false } } });
  rsC.applyOptions({ crosshair: { vertLine: { visible: false } } });
  compareC.applyOptions({ crosshair: { vertLine: { visible: false } } });
  axisC.applyOptions({ crosshair: { vertLine: { visible: false } } });

  // Keep price, RS and bottom axis locked to the same logical range while the user pans/zooms.
  let syncingRanges=false;
  const syncPanelRanges=(source)=>{
    if(syncingRanges)return; const range=source?.timeScale?.().getVisibleLogicalRange?.(); if(!range)return;
    syncingRanges=true;
    try{[priceC,rsiC,rsC,macdC,axisC].forEach(c=>{if(c&&c!==source){try{c.timeScale().setVisibleLogicalRange(range);}catch(e){}}});}
    catch(e){} finally{syncingRanges=false;}
    requestAnimationFrame(()=>{try{drawRelativeStrengthFill(instObj,instObj.rsValueByTime||[],instObj.rsMAData||[]);}catch(e){} try{drawVolumeProfile(instObj);}catch(e){}});
  };
  priceC.timeScale().subscribeVisibleLogicalRangeChange(()=>syncPanelRanges(priceC));
  rsC.timeScale().subscribeVisibleLogicalRangeChange(()=>syncPanelRanges(rsC));
  axisC.timeScale().subscribeVisibleLogicalRangeChange(()=>syncPanelRanges(axisC));
  // Compare uses the SAME timestamp range as the main candle chart.
  // Keep it outside the logical-range sync above; compare may have a different bar count.
  let syncingCompareTime=false;
  const syncCompareTimeRange=(source)=>{
    if(syncingCompareTime || !compareC || !instObj.compareSymbol) return;
    try{
      const vr=source.timeScale().getVisibleRange();
      if(!vr) return;
      syncingCompareTime=true;
      if(source===priceC){
        compareC.timeScale().setVisibleRange(vr);
      }else{
        priceC.timeScale().setVisibleRange(vr);
        rsiC.timeScale().setVisibleRange(vr);
        rsC.timeScale().setVisibleRange(vr);
        macdC.timeScale().setVisibleRange(vr);
        axisC.timeScale().setVisibleRange(vr);
      }
    }catch(e){} finally { syncingCompareTime=false; }
  };
  priceC.timeScale().subscribeVisibleLogicalRangeChange(()=>syncCompareTimeRange(priceC));
  compareC.timeScale().subscribeVisibleLogicalRangeChange(()=>syncCompareTimeRange(compareC));

  const sharedCrosshair = document.getElementById(`shared-crosshair-${index}`);
  const panelContainer = document.getElementById(`panel-chart-${index}`);

  const hideSharedCrosshair = () => {
    if (sharedCrosshair) sharedCrosshair.style.display = 'none';
    const ohlc=document.getElementById(`ohlc-box-${index}`); if(ohlc) ohlc.style.display='none';
    if (instObj.axisChart) try { instObj.axisChart.clearCrosshairPosition(); } catch(e){}
  };

  const showSharedCrosshair = (event) => {
    if (!panelContainer || !instObj.rawDailyCandles?.length) return;
    try {
      const ohlc=document.getElementById(`ohlc-box-${index}`);
      const d=aggregate(instObj.rawDailyCandles,instObj.interval)||[];
      const rr=panelContainer.getBoundingClientRect(), xx=event.clientX-rr.left;
      const tm=instObj.priceChart.timeScale().coordinateToTime(xx);
      if(ohlc && tm && d.length){
        let best=d[0],bd=Infinity;
        for(const c of d){const cc=instObj.priceChart.timeScale().timeToCoordinate(c.time);if(cc==null)continue;const dd=Math.abs(cc-xx);if(dd<bd){bd=dd;best=c;}}
        const ch=Number(best.close),op=Number(best.open),cl=ch-op;
        const cls=cl>=0?'lg':'lr';
        const pct=op?((cl/op)*100):0;
        ohlc.innerHTML=`<span>O ${op.toFixed(2)}</span> <span>H ${Number(best.high).toFixed(2)}</span> <span>L ${Number(best.low).toFixed(2)}</span> <span>C <span class="${cls}">${ch.toFixed(2)}</span></span> <span>V ${fmtVol(Number(best.volume||0))}</span> <span class="${cls}">${pct>=0?'+':''}${pct.toFixed(2)}%</span>`;
        ohlc.style.display='flex';
      }
    }catch(e){}
    const rect = panelContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < 0 || x > rect.width) { hideSharedCrosshair(); return; }

    const time = instObj.priceChart.timeScale().coordinateToTime(x);
    if (!time) { hideSharedCrosshair(); return; }

    const snapX = instObj.priceChart.timeScale().timeToCoordinate(time);
    const finalX = (snapX !== null && isFinite(snapX)) ? snapX : x;

    // Single dashed line crosses top price, RSI, RS and touches the date axis
    if (sharedCrosshair) {
      sharedCrosshair.style.left = `${finalX}px`;
      sharedCrosshair.style.display = 'block';
    }

    // Bottom timescale par date ko highlight karein
    if (instObj.axisChart && instObj.axisSeries) {
      try { instObj.axisChart.setCrosshairPosition(0, time, instObj.axisSeries); } catch(e){}
    }

    // Dedicated OHLCV separator pane follows the same crosshair candle.
    try { updateOhlcvStrip(instObj, time); } catch(e) {}
    try { if(instObj.compareSymbol) updateCompareOhlcvStrip(instObj, time); } catch(e) {}
  };

  if (panelContainer) {
    panelContainer.addEventListener('mousemove', showSharedCrosshair, {passive:true});
    panelContainer.addEventListener('mouseleave', hideSharedCrosshair);
  }
  let isSyncing = false;
  const syncPanes = (source) => {
    source.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      [priceC, rsiC, rsC, compareC, axisC].forEach(c => {
        if (c !== source) { try { c.timeScale().setVisibleLogicalRange(range); } catch(e){} }
      });
      isSyncing = false;
      requestAnimationFrame(() => { drawPanelOverlays(instObj); try{drawVolumeProfile(instObj);}catch(e){} });
    });
  };

  syncPanes(priceC); syncPanes(rsiC); syncPanes(rsC); syncPanes(axisC);
  updateTimeScaleVisibility(instObj);

  return instObj;
}

/* TRADINGVIEW 1:1 DELTA SPLITTER ENGINE: HAR PANE SMOOTH RESIZE HOGA */

function initPaneSplitterDrag(index) {
  const container = document.getElementById(`panel-chart-${index}`);
  const panePrice = document.getElementById(`pane-price-${index}`);
  const sRsi  = document.getElementById(`splitter-rsi-${index}`);
  const sMacd = document.getElementById(`splitter-macd-${index}`);
  const sRs   = document.getElementById(`splitter-rs-${index}`);
  const sCompare = document.getElementById(`splitter-compare-${index}`);

  if (!container || !panePrice) return;

  let dragData = null;

  function getVisibleAbove(sp) {
    let el = sp.previousElementSibling;
    while (el) {
      if (el.classList.contains('pane-box') && el.style.display !== 'none') return el;
      el = el.previousElementSibling;
    }
    return panePrice;
  }

  function getVisibleBelow(sp) {
    let el = sp.nextElementSibling;
    while (el) {
      if (el.classList.contains('pane-box') && el.style.display !== 'none' && !el.classList.contains('pane-axis')) return el;
      el = el.nextElementSibling;
    }
    return null;
  }

  function startDrag(e, splitter) {
    const above = getVisibleAbove(splitter);
    const below = getVisibleBelow(splitter);
    if (!above || !below) return;

    e.preventDefault();
    splitter.classList.add('dragging');

    const hA = above.getBoundingClientRect().height;
    const hB = below.getBoundingClientRect().height;

    dragData = {
      splitter: splitter,
      above: above,
      below: below,
      startY: e.clientY,
      startHA: hA,
      startHB: hB,
      totalH: hA + hB,
      minA: above === panePrice ? 80 : 35,
      minB: 35
    };
  }

  [sRsi, sMacd, sRs, sCompare].forEach(sp => {
    if (!sp) return;
    sp.onmousedown = (e) => startDrag(e, sp);
  });

  window.addEventListener('mouseup', () => {
    if (!dragData) return;
    if (dragData.splitter) dragData.splitter.classList.remove('dragging');
    dragData = null;
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragData) return;
    const delta = e.clientY - dragData.startY;

    let newHA = dragData.startHA + delta;
    let newHB = dragData.startHB - delta;

    if (newHA < dragData.minA) {
      newHA = dragData.minA;
      newHB = dragData.totalH - newHA;
    }
    if (newHB < dragData.minB) {
      newHB = dragData.minB;
      newHA = dragData.totalH - newHB;
    }

    dragData.above.style.height = `${newHA}px`;
    dragData.above.style.flex = 'none';

    dragData.below.style.height = `${newHB}px`;
    dragData.below.style.flex = 'none';

    const inst = panelsArray[index];
    if (inst) {
      [inst.priceChart, inst.rsiChart, inst.macdChart, inst.rsChart, inst.axisChart].forEach(c => {
        if (c) try { c.applyOptions({ width: container.clientWidth }); } catch(err){}
      });
      drawPanelOverlays(inst);
      if (typeof positionPocketPivotStatsWidget === 'function') positionPocketPivotStatsWidget(inst);
    }
  });
}
/* END: SMOOTH 1:1 SPLITTER RESIZE ENGINE */
  
function setPanelInterval(idx, tf, btn) {
  const panel = panelsArray[idx];
  if (!panel) return;
  panel.interval = tf;
  const parent = btn.parentElement;
  parent.querySelectorAll('.panel-tf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  rebuildPanelChart(panel);
}

function applyThemeIndicatorDefaults(isDark){
  const colorMap={
    '#ffffff':isDark?'#ffffff':'#131722',
    '#c58b1b':isDark?'#c58b1b':'#b7791f',
    '#4b55a2':isDark?'#4b55a2':'#4c51bf',
    '#f87171':isDark?'#f87171':'#d32f2f'
  };
  emaConfigs.forEach(cfg=>{const key=String(cfg.color||'').toLowerCase();if(Object.prototype.hasOwnProperty.call(colorMap,key))cfg.color=colorMap[key];});
  const syncInput=(id,dark,light)=>{const el=document.getElementById(id);if(!el)return;const v=String(el.value||'').toLowerCase();if(v===dark.toLowerCase()||v===light.toLowerCase())el.value=isDark?dark:light;};
  syncInput('ema1-color','#ffffff','#131722');
  syncInput('ema2-color','#c58b1b','#b7791f');
  syncInput('ema3-color','#4b55a2','#4c51bf');
  syncInput('ema4-color','#f87171','#d32f2f');
  syncInput('rs-color','#00d4ff','#1565c0');
  syncInput('rsima-color','#ffab00','#ef6c00');
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  const btn = document.getElementById('theme-btn');
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme'); if (btn) btn.innerText = '🌙 Dark';
  } else {
    document.body.classList.remove('light-theme'); if (btn) btn.innerText = '☀️ Light';
  }

  const isDark = currentTheme === 'dark';
  applyThemeIndicatorDefaults(isDark);
  panelsArray.forEach(p => {
    [p.priceChart, p.rsiChart, p.rsChart, p.macdChart, p.compareChart, p.axisChart].forEach(c => {
      if (c) {
        c.applyOptions({
          layout: { textColor: isDark ? '#8a9ab0' : '#707a8a' },
          rightPriceScale: { borderColor: isDark ? '#1e2d3d' : '#e0e3eb' },
          timeScale: { borderColor: isDark ? '#1e2d3d' : '#e0e3eb' }
        });
        updateTimeScaleVisibility(p);
      }
    });
  });

  if (currentSymbol) rebuildAllPanels();
}

async function addCompareSymbol(panelIndex, symbol, name, instrumentType='stock'){
  const panel=panelsArray[Number(panelIndex)]; if(!panel)return;
  // Preserve the user's current main-chart viewport. Adding a pane must never zoom/expand the price chart.
  let preservedRange=null;
  try{ preservedRange=panel.priceChart?.timeScale().getVisibleLogicalRange?.() || null; }catch(e){}
  panel.compareSymbol=String(symbol||'').toUpperCase(); panel.compareName=name||panel.compareSymbol; panel.compareInstrumentType=(instrumentType==='index'?'index':'stock');
  panel.compareType=document.getElementById(`compare-type-${panel.index}`)?.value||'candle';
  const title=document.getElementById(`title-compare-${panel.index}`); if(title)title.textContent=`Compare — ${panel.compareSymbol}`;
  updateTimeScaleVisibility(panel);
  const comparePane=document.getElementById(`pane-compare-${panel.index}`); if(comparePane){comparePane.style.display='flex';comparePane.style.flex='0.55 1 0px';comparePane.style.minHeight='90px';}
  const compareSplitter=document.getElementById(`splitter-compare-${panel.index}`); if(compareSplitter)compareSplitter.style.display='block';
  try{
    panel.compareRawCandles=await fetchSymbolCandles(panel.compareSymbol,panel.compareInstrumentType);
    if(!panel.compareRawCandles?.length){const fallback=panel.compareInstrumentType==='index'?'stock':'index';panel.compareRawCandles=await fetchSymbolCandles(panel.compareSymbol,fallback);if(panel.compareRawCandles?.length)panel.compareInstrumentType=fallback;}
    renderComparePane(panel);
    try{const pane=document.getElementById(`pane-compare-${panel.index}`);panel.compareChart.applyOptions({width:pane?.clientWidth||600,height:Math.max(90,pane?.clientHeight||90)});}catch(e){}
  }catch(e){console.warn('Compare chart load failed',e);panel.compareRawCandles=[];renderComparePane(panel);}
  try{
    if(preservedRange) panel.priceChart.timeScale().setVisibleLogicalRange(preservedRange);
    const vr=panel.priceChart.timeScale().getVisibleRange();
    if(vr) panel.compareChart.timeScale().setVisibleRange(vr);
  }catch(e){}
  try{ if(preservedRange) [panel.priceChart,panel.rsiChart,panel.rsChart,panel.macdChart,panel.axisChart].forEach(c=>{if(c)c.timeScale().setVisibleLogicalRange(preservedRange);}); }catch(e){}
}

function hideComparePane(panelIndex){
  const panel=panelsArray[Number(panelIndex)]; if(!panel)return;
  panel.compareSymbol=null; panel.compareName=null; panel.compareRawCandles=[];
  if(panel.compareSeries){try{panel.compareChart.removeSeries(panel.compareSeries);}catch(e){} panel.compareSeries=null;}
  updateTimeScaleVisibility(panel);
  const c=document.getElementById(`compare-fill-canvas-${panel.index}`); if(c){const x=c.getContext('2d');if(x)x.clearRect(0,0,c.width,c.height);}
}

function updateCompareChartType(panelIndex,type){
  const panel=panelsArray[Number(panelIndex)]; if(!panel)return;
  panel.compareType=['candle','bar','line'].includes(type)?type:'candle';
  renderComparePane(panel);
}

function normalizeCompareData(raw){
  if(!Array.isArray(raw)||!raw.length)return [];
  const base=Number(raw.find(x=>Number(x.close)>0)?.close)||1;
  return raw.map(c=>{
    const f=v=>Number(v)/base*100;
    return {time:c.time,open:f(c.open),high:f(c.high),low:f(c.low),close:f(c.close),volume:Number(c.volume||0)};
  });
}

function updateCompareOhlcvStrip(panel,time){
  const el=document.getElementById(`compare-ohlcv-strip-${panel?.index}`);
  if(!el)return;
  const raw=panel?.compareRawCandles||[];
  const data=aggregate(raw,panel?.interval||'D')||[];
  if(!data.length){el.textContent='O —  H —  L —  C —  V —  Δ —';return;}
  let d=data[data.length-1];
  if(time){
    const t=dateFromDrawingTime(time)?.getTime(); let best=Infinity;
    for(const x of data){const xt=dateFromDrawingTime(x.time)?.getTime(); if(xt==null||t==null)continue; const dif=Math.abs(xt-t); if(dif<best){best=dif;d=x;}}
  }
  const idx=data.indexOf(d),prev=idx>0?data[idx-1]:null;
  const close=Number(d.close)||0, prevClose=Number(prev?.close)||0;
  const chg=prevClose?((close-prevClose)/prevClose)*100:0;
  const fmt=v=>{v=Number(v)||0;if(v>=1e7)return(v/1e7).toFixed(2)+'Cr';if(v>=1e6)return(v/1e6).toFixed(2)+'M';if(v>=1e3)return(v/1e3).toFixed(1)+'K';return String(Math.round(v));};
  el.innerHTML=`O <b>${Number(d.open).toFixed(2)}</b> &nbsp; H <b>${Number(d.high).toFixed(2)}</b> &nbsp; L <b>${Number(d.low).toFixed(2)}</b> &nbsp; C <b>${close.toFixed(2)}</b> &nbsp; V <b>${fmt(d.volume)}</b> &nbsp; Δ <b style="color:${chg>=0?'var(--green)':'var(--red)'}">${chg>=0?'+':''}${chg.toFixed(2)}%</b>`;
}

function renderComparePane(panel){
  if(!panel?.compareChart||!panel.compareSymbol||!panel.compareRawCandles?.length)return;
  try{
    if(panel.compareSeries){try{panel.compareChart.removeSeries(panel.compareSeries);}catch(e){} panel.compareSeries=null;}
    const data=aggregate(panel.compareRawCandles,panel.interval)||[];
    const norm=normalizeCompareData(data); if(!norm.length)return;
    const type=panel.compareType||'candle';
    if(type==='line'){
      panel.compareSeries=panel.compareChart.addLineSeries({color:'#ff9800',lineWidth:2,priceLineVisible:false,lastValueVisible:true,title:panel.compareSymbol});
      panel.compareSeries.setData(norm.map(x=>({time:x.time,value:+x.close.toFixed(2)})));
    }else if(type==='bar'){
      panel.compareSeries=panel.compareChart.addBarSeries({upColor:'#26a69a',downColor:'#ef5350',borderUpColor:'#26a69a',borderDownColor:'#ef5350',wickUpColor:'#26a69a',wickDownColor:'#ef5350',priceLineVisible:false,lastValueVisible:false});
      panel.compareSeries.setData(norm.map(x=>({time:x.time,open:+x.open.toFixed(2),high:+x.high.toFixed(2),low:+x.low.toFixed(2),close:+x.close.toFixed(2)})));
    }else{
      panel.compareSeries=panel.compareChart.addCandlestickSeries({upColor:'#26a69a',downColor:'#ef5350',borderUpColor:'#26a69a',borderDownColor:'#ef5350',wickUpColor:'#26a69a',wickDownColor:'#ef5350',priceLineVisible:false,lastValueVisible:false});
      panel.compareSeries.setData(norm.map(x=>({time:x.time,open:+x.open.toFixed(2),high:+x.high.toFixed(2),low:+x.low.toFixed(2),close:+x.close.toFixed(2)})));
    }
    try{const vr=panel.priceChart.timeScale().getVisibleRange();if(vr)panel.compareChart.timeScale().setVisibleRange(vr);}catch(e){}
    const t=document.getElementById(`title-compare-${panel.index}`);if(t)t.textContent=`Compare — ${panel.compareSymbol} (Base 100)`;
    updateCompareOhlcvStrip(panel);
  }catch(e){console.warn('Compare pane render error',e);}
}

function navigateStockKeyboard(direction) {
  const list = currentInstrumentType === 'index' ? allIndices : allSymbols;
  if (!list || !list.length) return;
  let currentIdx = list.findIndex(s => s.symbol === currentSymbol);
  if (currentIdx === -1) currentIdx = 0;

  let newIdx = currentIdx + direction;
  if (newIdx < 0) newIdx = list.length - 1;
  if (newIdx >= list.length) newIdx = 0;

  const target = list[newIdx];
  if (target) {
    loadSymbol(target.symbol, target.name, -1, currentInstrumentType);
  }
}

function initSystem(){
  requestPersistentStorage();
  rebuildGridSystem();
  fetchPriceBandsData(); // FETCH PRICE BANDS, BAND CHANGES & RESULTS FROM GITHUB DATA
  updateTrendlineBreakoutConfig();
  const tlL=document.getElementById('trendline-length'); if(tlL) tlL.value=String(trendlineBreakoutConfig.length);
  const tlM=document.getElementById('trendline-mult'); if(tlM) tlM.value=String(trendlineBreakoutConfig.mult);
  const tlMethod=document.getElementById('trendline-method'); if(tlMethod) tlMethod.value=trendlineBreakoutConfig.calcMethod;
  const tlBP=document.getElementById('trendline-backpaint'); if(tlBP) tlBP.checked=trendlineBreakoutConfig.backpaint;
  update52WLinesConfig();
  syncHighlightControlValues();
  updateEMAAlignmentConfig();
  updateVolumeProfileConfig();
  updateRSIHighlightConfig();
  const ea=document.getElementById('ema-align-en'); if(ea) ea.checked=emaAlignmentConfig.enabled;
  const ear=document.getElementById('ema-align-range'); if(ear) ear.value=String(emaAlignmentConfig.rangePct);
  const rh=document.getElementById('rsi-highlight-en'); if(rh) rh.checked=rsiHighlightConfig.enabled;
  const rht=document.getElementById('rsi-highlight-thresh'); if(rht) rht.value=String(rsiHighlightConfig.threshold);
  const infoAtrSel=document.getElementById('info-atr-len'); if(infoAtrSel) infoAtrSel.value=String(infoAtrLength||14);

  const container = document.getElementById('chart-grid-container');
  if (container) {
    container.addEventListener('mousedown', handleChartMouseDown, true);
    container.addEventListener('mousemove', handleChartMouseMove, true);
    container.addEventListener('mouseup', handleChartMouseUp, true);
    container.addEventListener('mouseleave', handleChartMouseUp, true);
  }

  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('resize', () => {
    if (panelsArray[0]) requestAnimationFrame(() => positionPocketPivotStatsWidget(panelsArray[0]));
  });

  window.addEventListener('resize', () => {
    panelsArray.forEach(p => {
      const elem = document.getElementById(`panel-chart-${p.index}`);
      if (elem) {
        [p.priceChart, p.rsiChart, p.rsChart, p.macdChart, p.compareChart, p.axisChart].forEach(c => {
          if (c) c.applyOptions({ width: elem.clientWidth });
        });
        if(p.compareChart){const cp=document.getElementById(`pane-compare-${p.index}`);try{p.compareChart.applyOptions({width:cp?.clientWidth||elem.clientWidth,height:cp?.clientHeight||80});}catch(e){}}
        drawPanelOverlays(p);
        if (typeof drawRelativeStrengthFill === 'function' && p.rsValueByTime?.length) requestAnimationFrame(()=>drawRelativeStrengthFill(p, p.rsValueByTime, p.rsMAData || []));
      }
    });
  });
}

function handleGlobalKeyDown(e) {
  const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
    if (document.activeElement.id === 'modal-search-input') handleModalKeyboardNav(e);
    return;
  }

  // Agar search modal pehle se khula hai toh input par hi focus rakhein
  const modal = document.getElementById('search-modal');
  if (modal && modal.classList.contains('open')) {
    const input = document.getElementById('modal-search-input');
    if (input && document.activeElement !== input) input.focus();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault(); navigateStockKeyboard(-1); return;
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); navigateStockKeyboard(1); return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); openSearchModal(-1, ''); return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  // Screen par direct type karte hi naya fresh search shuru karega
  if (e.key && e.key.length === 1 && !e.repeat && /^[a-zA-Z0-9]$/.test(e.key)) {
    e.preventDefault();
    const firstChar = e.key;
    openSearchModal(-1, firstChar);
  }
}

function handleModalKeyboardNav(e) {
  const modal = document.getElementById('search-modal');
  if (!modal || !modal.classList.contains('open')) return;
  const results = document.querySelectorAll('#modal-search-results .search-row-item');
  if (!results.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault(); modalHighlightIdx = Math.min(modalHighlightIdx + 1, results.length - 1);
    updateModalHighlight(results);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); modalHighlightIdx = Math.max(modalHighlightIdx - 1, 0);
    updateModalHighlight(results);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (modalHighlightIdx >= 0 && modalHighlightIdx < results.length) results[modalHighlightIdx].click();
    else if (results.length > 0) results[0].click();
  } else if (e.key === 'Escape') {
    e.preventDefault(); closeSearchModal();
  }
}

function updateModalHighlight(results) {
  results.forEach((el, i) => {
    if (i === modalHighlightIdx) { el.classList.add('highlighted'); el.scrollIntoView({ block: 'nearest' }); }
    else el.classList.remove('highlighted');
  });
}

