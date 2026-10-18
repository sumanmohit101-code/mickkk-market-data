/* ============ DUAL PRICE ALERTS ENGINE ============ */
let activeAlerts = [];

function openPriceAlertModal() {
  if (!currentSymbol) return;
  document.getElementById('alert-stock-name').innerText = currentSymbol;
  const statusEl = document.getElementById('alert-save-status');
  if (statusEl) statusEl.textContent = '';
  const primary = panelsArray[0];
  if (primary && primary.rawDailyCandles && primary.rawDailyCandles.length) {
    const last = primary.rawDailyCandles[primary.rawDailyCandles.length - 1];
    document.getElementById('alert-price-input').value = last.close ? last.close.toFixed(2) : '';
  }
  document.getElementById('alert-modal').classList.add('open');
}

function closePriceAlertModal() {
  document.getElementById('alert-modal').classList.remove('open');
}

async function savePriceAlert() {
  const price = parseFloat(document.getElementById('alert-price-input').value);
  const condition = document.getElementById('alert-condition-input').value;
  const statusEl = document.getElementById('alert-save-status');
  const btn = document.getElementById('alert-save-btn');
  if (!price || isNaN(price)) { if(statusEl) statusEl.textContent = 'Valid price enter karein.'; return; }

  activeAlerts.push({ symbol: currentSymbol, targetPrice: price, condition: condition, triggered: false });

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  if (statusEl) { statusEl.style.color = 'var(--muted)'; statusEl.textContent = 'Saving to Server & Telegram…'; }

  try {
    const url = `${CHARTS_API_URL}?action=addAlert&symbol=${encodeURIComponent(currentSymbol)}&price=${price}&condition=${condition}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (statusEl) { statusEl.style.color = 'var(--green)'; statusEl.textContent = '✓ Alert set! Sound + Telegram ready.'; }
    setTimeout(closePriceAlertModal, 900);
  } catch (e) {
    if (statusEl) { statusEl.style.color = 'var(--amber)'; statusEl.textContent = '✓ Saved locally (Sound Alert active).'; }
    setTimeout(closePriceAlertModal, 1200);
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Set Alert'; }
}

function checkPriceAlerts(symbol, currentPrice) {
  activeAlerts.forEach(alt => {
    if (alt.symbol === symbol && !alt.triggered) {
      let isTriggered = false;
      if (alt.condition === 'ABOVE' && currentPrice >= alt.targetPrice) isTriggered = true;
      if (alt.condition === 'BELOW' && currentPrice <= alt.targetPrice) isTriggered = true;

      if (isTriggered) {
        alt.triggered = true;
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          osc.connect(audioCtx.destination);
          osc.frequency.value = 880;
          osc.start(); osc.stop(audioCtx.currentTime + 0.6);
        } catch(e){}
        toast(`🚨 PRICE ALERT: ${symbol} has reached ₹${currentPrice.toFixed(2)} (Target: ₹${alt.targetPrice.toFixed(2)})`);
      }
    }
  });
}

async function openMyAlertsModal() {
  document.getElementById('my-alerts-modal').classList.add('open');
  const listEl = document.getElementById('my-alerts-list');
  if (!listEl) return;
  listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:16px;">Loading…</div>`;

  try {
    const res = await fetch(`${CHARTS_API_URL}?action=getAlertHistory`);
    const data = await res.json();
    if (data.alerts) {
      renderMyAlerts(data.alerts);
      return;
    }
  } catch (e){}
  renderMyAlerts(activeAlerts);
}

function closeMyAlertsModal() {
  document.getElementById('my-alerts-modal').classList.remove('open');
}

function renderMyAlerts(alerts) {
  const listEl = document.getElementById('my-alerts-list');
  if (!listEl) return;
  if (!alerts || !alerts.length) {
    listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:16px;">Koi active alert nahi hai.</div>`;
    return;
  }
  listEl.innerHTML = alerts.map((a, idx) => {
    const isDrawing=a.type==='DRAWING'||String(a.condition||'').startsWith('DRAWING_');
    const text=isDrawing ? `🔔 ${escapeHtml(a.label||'Drawing crossed')} • ₹${Number(a.targetPrice||0).toFixed(2)} • ${String(a.condition||'').endsWith('UP')?'UP':'DOWN'}` : `${a.condition === 'ABOVE' ? '≥' : '≤'} ₹${Number(a.targetPrice).toFixed(2)}`;
    const status=a.status==='TRIGGERED'?' • Triggered':'';
    return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">
      <div><b style="color:var(--accent)">${escapeHtml(a.symbol)}</b><span style="color:var(--muted)"> ${text}${status}</span></div>
      <button class="tbtn" style="padding:4px 10px;font-size:11px;" onclick="deleteMyAlert('${a.id || idx}', this)">🗑 Delete</button>
    </div>`;
  }).join('');
}

async function deleteMyAlert(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await fetch(`${CHARTS_API_URL}?action=deleteAlert&id=${encodeURIComponent(id)}`);
  } catch (e){}
  activeAlerts = activeAlerts.filter(a => a.id !== id);
  openMyAlertsModal();
}

/* ============ LOCALSTORAGE PERSISTENCE ============ */
let drawingSaveTimer = null;
let drawingServerBusy = false;

function showDrawingSaveStatus(text, good=true){
  const el=document.getElementById('drawing-save-status'); if(!el)return;
  el.textContent=text; el.style.color=good?'var(--green)':'var(--amber)'; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1600);
}

function saveDrawingsToLocalStorage() {
  if (!currentSymbol) return;
  try { localStorage.setItem(`MICKKK_DRAWINGS_${currentSymbol}`, JSON.stringify(userDrawings)); } catch(e){}
  clearTimeout(drawingSaveTimer);
  drawingSaveTimer=setTimeout(()=>saveDrawingsToServer(currentSymbol,userDrawings),250);
  showDrawingSaveStatus('Saving drawings…',true);
}

async function saveDrawingsToServer(symbol, drawings){
  if(!symbol) return;
  drawingServerBusy=true;
  const payload={action:'saveDrawings',symbol:String(symbol).toUpperCase(),drawings:drawings||[]};
  try{
    // Preferred: Apps Script doPost endpoint. The existing API URL is already used by alerts/watchlists.
    const res=await fetch(CHARTS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    if(res.ok){ showDrawingSaveStatus('Drawings saved to cloud',true); drawingServerBusy=false; return; }
  }catch(e){}
  // Compatibility fallback for an Apps Script doGet implementation.
  try{
    const packed=encodeURIComponent(JSON.stringify(drawings||[]));
    const url=`${CHARTS_API_URL}?action=saveDrawings&symbol=${encodeURIComponent(symbol)}&drawings=${packed}`;
    const res=await fetch(url,{method:'GET'});
    if(res.ok){ showDrawingSaveStatus('Drawings saved to cloud',true); drawingServerBusy=false; return; }
  }catch(e){}
  showDrawingSaveStatus('Saved on this browser (cloud API not enabled)',false);
  drawingServerBusy=false;
}

async function loadDrawingsForSymbol(symbol){
  if(!symbol)return;
  // Immediate local copy keeps chart responsive.
  loadDrawingsFromLocalStorage(symbol);
  try{
    const res=await fetch(`${CHARTS_API_URL}?action=getDrawings&symbol=${encodeURIComponent(symbol)}`);
    if(res.ok){
      const raw=await res.json();
      const arr=Array.isArray(raw)?raw:(raw?.drawings||raw?.data||[]);
      if(Array.isArray(arr)){
        userDrawings=arr.map(d=>({...d,alertEnabled:!!d.alertEnabled,alertDirection:d.alertDirection||'both'})); try{localStorage.setItem(`MICKKK_DRAWINGS_${symbol}`,JSON.stringify(userDrawings));}catch(e){}
        panelsArray.forEach(drawPanelOverlays);
        return;
      }
    }
  }catch(e){}
}

function loadDrawingsFromLocalStorage(symbol) {
  if (!symbol) return;
  try {
    const saved = localStorage.getItem(`MICKKK_DRAWINGS_${symbol}`);
    userDrawings = saved ? JSON.parse(saved).map(d=>({...d,alertEnabled:!!d.alertEnabled,alertDirection:d.alertDirection||'both'})) : [];
  } catch(e) { userDrawings = []; }
}

/* ============ TOOLBAR COLLAPSE TOGGLE ============ */
function toggleDrawingToolbar() {
  const bar=document.getElementById('drawing-toolbar'),main=document.querySelector('.main'),toggleBtn=document.getElementById('floating-draw-toggle');
  if(!bar||!toggleBtn)return;
  const collapsed=bar.classList.toggle('collapsed');
  if(main)main.classList.toggle('tools-collapsed',collapsed);
  toggleBtn.style.display=collapsed?'flex':'none';
  toggleBtn.textContent=collapsed?'›':'';
  toggleBtn.title=collapsed?'Show Drawing Toolbar':'Hide Drawing Toolbar';
}

/* ============ PROFESSIONAL VIEW CONTROLS ============ */
function zoomChart(multiplier){
  panelsArray.forEach(panel => {
    try {
      const ts = panel.priceChart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const center = (range.from + range.to) / 2;
      const half = Math.max(3, (range.to - range.from) * multiplier / 2);
      ts.setVisibleLogicalRange({ from: center - half, to: center + half });
    } catch(e){}
  });
}

function resetChartView(){
  panelsArray.forEach(panel => {
    try {
      const data = aggregate(panel.rawDailyCandles || [], panel.interval);
      applyRangeToPanel(panel, data);
    } catch(e){}
  });
}

/* ============ CHART TYPE SWITCHER ============ */
function setChartType(type, btn) {
  currentChartType = type;
  ['btn-type-candle', 'btn-type-bar', 'btn-type-line'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  
  panelsArray.forEach(p => ensureSeriesType(p));
  if (currentSymbol) rebuildAllPanels();
}

function ensureSeriesType(panel) {
  if (panel.seriesType === currentChartType && panel.candleSeries) return;

  if (panel.candleSeries) {
    try { panel.priceChart.removeSeries(panel.candleSeries); } catch(e){}
    panel.candleSeries = null;
  }

  if (currentChartType === 'bar') {
    panel.candleSeries = panel.priceChart.addBarSeries({
      upColor: '#26a69a', downColor: '#ef5350',
      thinBars: false
    });
  } else if (currentChartType === 'line') {
    panel.candleSeries = panel.priceChart.addLineSeries({ color: '#00d4ff', lineWidth: 2 });
  } else {
    panel.candleSeries = panel.priceChart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350',
      borderUpColor: '#26a69a', borderDownColor: '#ef5350',
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });
  }

  panel.seriesType = currentChartType;
  panel.candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.02, bottom: 0.28 }, autoScale: true });
}

/* ============ PRICE SCALE MODE SWITCHER ============ */
function setPriceScaleMode(mode, btn) {
  currentScaleMode = mode;
  ['btn-scale-reg', 'btn-scale-log', 'btn-scale-pct'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('active');
  });
  if (btn) btn.classList.add('active');

  let scaleMode = LightweightCharts.PriceScaleMode.Normal;
  if (mode === 'log') scaleMode = LightweightCharts.PriceScaleMode.Logarithmic;
  else if (mode === 'pct') scaleMode = LightweightCharts.PriceScaleMode.Percentage;

  panelsArray.forEach(p => {
    if (p.priceChart) {
      p.priceChart.priceScale('right').applyOptions({ mode: scaleMode });
    }
  });
}

/* ============ FULLSCREEN & SCREENSHOT CAPTURE ============ */
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.error(err));
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function captureChartScreenshot() {
  if (!panelsArray.length || !panelsArray[0].priceChart) return;
  try {
    const canvas = panelsArray[0].priceChart.takeScreenshot();
    const link = document.createElement('a');
    link.download = `MICKKK_${currentSymbol || 'Chart'}_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(e) {}
}

/* ============ MAIN TOOLBAR INTERVAL SWITCHER ============ */
function setInterval_(interval, btn){
  currentInterval = interval;
  ['btn-daily','btn-weekly','btn-monthly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  if (btn) btn.classList.add('active');

  panelsArray.forEach(p => {
    p.interval = interval;
  });
  if (currentSymbol) rebuildAllPanels();
}
