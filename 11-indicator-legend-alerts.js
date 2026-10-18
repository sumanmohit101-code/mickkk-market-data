/* ============================================================
   MICKKK: Indicator legend (TradingView style), single-indicator settings popup,
   aur indicator alerts (browser mein, daily candle data par).
   ============================================================ */
const $id = (x) => document.getElementById(x);
const chk = (id) => !!$id(id)?.checked;
const setChk = (id, v) => { const el = $id(id); if (!el) return; el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
const savedOn = {};

/* ---------- 1) Indicator registry ---------- */
const IND_REG = [
  { key: 'volume', sec: 'Pocket Pivot', label: () => 'MICKKK Volume', on: () => volVisible, ids: [] },
  { key: 'ema', sec: 'Exponential', ids: ['ema1-en', 'ema2-en', 'ema3-en', 'ema4-en', 'ema5-en'],
    label: () => 'EMA ' + [1, 2, 3, 4, 5].filter(n => chk('ema' + n + '-en')).map(n => $id('ema' + n + '-len')?.value).join(' ') },
  { key: 'rsi', sec: 'RSI &', ids: ['rsi-en'], label: () => 'RSI ' + ($id('rsi-len')?.value || 14), alert: true },
  { key: 'rs', sec: 'Relative Strength', ids: ['rs-en'], label: () => 'RS vs ' + (relativeStrengthConfig.benchmarkSymbol || '') },
  { key: 'macd', sec: 'MACD', ids: ['macd-en'], label: () => `MACD ${macdConfig.fast} ${macdConfig.slow} ${macdConfig.signal}`, alert: true },
  { key: 'st', sec: 'Supertrend', ids: ['st1-en', 'st2-en'], label: () => 'Supertrend' },
  { key: 'tl', sec: 'Trendlines', ids: ['trendline-breakout-en', 'trendline-show-en'], label: () => 'Trendlines with Breaks' },
  { key: 'cpr', sec: 'CPR', ids: ['cpr-weekly-en', 'cpr-monthly-en'], label: () => 'CPR' },
  { key: 'vp', sec: 'Pocket Pivot', ids: ['vp-en'], label: () => 'Volume Profile' },
  { key: 'gap', sec: 'Gap Detector', ids: ['gap-en'], label: () => 'Gap Detector' },
  { key: 'mcp', sec: 'Mini Coil', ids: ['mcp-en'], label: () => 'Mini Coil Pattern' },
  { key: 'w52', sec: '52-Week', ids: ['52wl-en'], label: () => '52W High / Low' },
  { key: 'bar', sec: 'Smart Bar', ids: ['candle-clr-en'], label: () => 'Smart Bar Colors' },
];
IND_REG.forEach(r => { if (!r.on) r.on = () => r.ids.some(chk); });
const legendHidden = new Set();
let legendCollapsed = false, legendSig = '';

function setIndicatorOn(r, on) {
  if (r.key === 'volume') { if (volVisible !== on) toggleVolume($id('btn-vol')); return; }
  if (on) (savedOn[r.key] || [r.ids[0]]).forEach(id => setChk(id, true));
  else { savedOn[r.key] = r.ids.filter(chk); r.ids.forEach(id => setChk(id, false)); }
}
function legendEye(key) { const r = IND_REG.find(x => x.key === key); if (!r) return; if (r.on()) { setIndicatorOn(r, false); legendHidden.add(key); } else { setIndicatorOn(r, true); legendHidden.delete(key); } renderIndicatorLegend(true); }
function legendRemove(key) { const r = IND_REG.find(x => x.key === key); if (!r) return; setIndicatorOn(r, false); legendHidden.delete(key); renderIndicatorLegend(true); }
function legendToggleList() { legendCollapsed = !legendCollapsed; renderIndicatorLegend(true); }

function renderIndicatorLegend(force) {
  const pane = $id('pane-price-0'); if (!pane) return;
  const rows = IND_REG.filter(r => r.on() || legendHidden.has(r.key));
  const sig = rows.map(r => r.key + r.on() + r.label()).join('|') + legendCollapsed;
  if (!force && sig === legendSig && $id('ind-legend-0')) return;
  legendSig = sig;
  let el = $id('ind-legend-0');
  if (!el || el.parentNode !== pane) { el?.remove(); el = document.createElement('div'); el.id = 'ind-legend-0'; el.className = 'ind-legend'; pane.appendChild(el); }
  el.innerHTML = `<div class="il-head" onclick="legendToggleList()" title="Show / hide indicator list">${legendCollapsed ? '▸' : '▾'} Indicators (${rows.filter(r => r.on()).length})
      <span class="il-btn" title="Add / manage indicators" onclick="event.stopPropagation();openIndicatorsModal()">＋</span></div>` +
    (legendCollapsed ? '' : rows.map(r => `<div class="il-row ${r.on() ? '' : 'off'}"><span class="il-name">${r.label()}</span>
      <span class="il-btns">
        <button class="il-btn" title="${r.on() ? 'Hide' : 'Show'}" onclick="legendEye('${r.key}')">${r.on() ? '👁' : '🚫'}</button>
        <button class="il-btn" title="Settings" onclick="openIndicatorSettings('${r.key}')">⚙</button>
        ${r.alert || r.key === 'ema' || r.key === 'volume' ? `<button class="il-btn" title="Create alert" onclick="openIndicatorAlert('${r.key}')">🔔</button>` : ''}
        <button class="il-btn" title="Remove" onclick="legendRemove('${r.key}')">✕</button></span></div>`).join(''));
}
setInterval(renderIndicatorLegend, 1000);   // config badalte hi legend apne aap update

/* ---------- 2) Single-indicator settings popup ---------- */
function openIndicatorSettings(key) {
  const r = IND_REG.find(x => x.key === key); if (!r) return;
  openIndicatorsModal();
  const modal = $id('ind-modal'); modal.classList.add('single');
  modal.querySelectorAll('.ind-section').forEach(s => {
    const t = s.querySelector('.ind-section-title')?.textContent || '';
    s.classList.toggle('show', t.includes(r.sec));
  });
  const h = modal.querySelector('h3'); if (h) { h.dataset.orig = h.dataset.orig || h.textContent; h.textContent = '⚙ ' + r.label() + ' — Settings'; }
  if (!$id('ind-single-bar')) {
    const bar = document.createElement('div'); bar.id = 'ind-single-bar';
    bar.innerHTML = `<span>Change the values below; the chart updates instantly.</span><button class="tbtn" onclick="showAllIndicatorSettings()">All indicators</button>`;
    h.insertAdjacentElement('afterend', bar);
  }
}
function showAllIndicatorSettings() {
  const m = $id('ind-modal'); m.classList.remove('single');
  const h = m.querySelector('h3'); if (h && h.dataset.orig) h.textContent = h.dataset.orig;
}
(function () { const c = window.closeIndicatorsModal; window.closeIndicatorsModal = function () { c(); showAllIndicatorSettings(); }; })();

/* ---------- 3) Indicator alerts ---------- */
const IND_ALERT_KEY = 'MICKKK_IND_ALERTS';
let indAlerts = [];
try { indAlerts = JSON.parse(localStorage.getItem(IND_ALERT_KEY) || '[]'); } catch (e) { }
const saveIndAlerts = () => { try { localStorage.setItem(IND_ALERT_KEY, JSON.stringify(indAlerts)); } catch (e) { } };
const IND_TYPES = {
  RSI_ABOVE: 'RSI crosses ABOVE level', RSI_BELOW: 'RSI crosses BELOW level',
  EMA_ABOVE: 'Close crosses ABOVE EMA', EMA_BELOW: 'Close crosses BELOW EMA',
  VOL_SPIKE: 'MICKKK Volume spike (x average)', MACD_UP: 'MACD crosses ABOVE signal', MACD_DOWN: 'MACD crosses BELOW signal',
};
function describeIndAlert(a) {
  const t = a.type;
  if (t.startsWith('RSI')) return `RSI(${a.len}) crosses ${t.endsWith('ABOVE') ? 'above' : 'below'} ${a.level}`;
  if (t.startsWith('EMA')) return `Close crosses ${t.endsWith('ABOVE') ? 'above' : 'below'} EMA ${a.len}`;
  if (t === 'VOL_SPIKE') return `Volume ≥ ${a.mult}× ${a.len}-day average`;
  return `MACD crosses ${t.endsWith('UP') ? 'above' : 'below'} signal`;
}
function toast(msg) {
  let box = document.querySelector('.mk-toast'); if (!box) { box = document.createElement('div'); box.className = 'mk-toast'; document.body.appendChild(box); }
  const d = document.createElement('div'); d.textContent = msg; d.onclick = () => d.remove(); box.appendChild(d); setTimeout(() => d.remove(), 12000);
  try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + 0.5); } catch (e) { }
}

(function injectAlertUI() {
  const box = document.querySelector('#alert-modal .ind-modal > div[style*="flex-direction"]'); if (!box) return;
  box.children[1].id = 'alert-price-row'; box.children[2].id = 'alert-cond-row';
  const st = 'width:100%;margin-top:4px;background:var(--card);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:6px;font-family:var(--mono);';
  const w = document.createElement('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  w.innerHTML = `<div>Alert on:<select id="alert-mode" style="${st}" onchange="setAlertMode(this.value)"><option value="PRICE">Price level</option><option value="IND">Indicator</option></select></div>
   <div id="alert-ind-box" style="display:none;flex-direction:column;gap:10px">
    <div>Condition:<select id="ind-alert-type" style="${st}" onchange="syncIndAlertFields()">${Object.entries(IND_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div id="ia-level-row">Level:<input id="ind-alert-level" type="number" value="70" style="${st}"></div>
    <div id="ia-len-row"><span id="ia-len-lbl">Length:</span><input id="ind-alert-len" type="number" value="14" min="1" style="${st}"></div>
    <div id="ia-mult-row">Volume multiple (x average):<input id="ind-alert-mult" type="number" value="2" step="0.1" min="1" style="${st}"></div>
    <div style="font-size:10.5px;color:var(--muted);line-height:1.4">* Indicator alerts are checked on daily candle data whenever this site is open (sound + pop-up). They do not send Telegram messages yet.</div></div>`;
  box.insertBefore(w, box.children[1]);
})();
let alertMode = 'PRICE';
function setAlertMode(m) {
  alertMode = m; $id('alert-mode').value = m;
  $id('alert-ind-box').style.display = m === 'IND' ? 'flex' : 'none';
  $id('alert-price-row').style.display = m === 'IND' ? 'none' : ''; $id('alert-cond-row').style.display = m === 'IND' ? 'none' : '';
  if (m === 'IND') syncIndAlertFields();
}
function syncIndAlertFields() {
  const t = $id('ind-alert-type').value, rsi = t.startsWith('RSI'), ema = t.startsWith('EMA'), vol = t === 'VOL_SPIKE';
  $id('ia-level-row').style.display = rsi ? '' : 'none'; $id('ia-len-row').style.display = (rsi || ema || vol) ? '' : 'none';
  $id('ia-mult-row').style.display = vol ? '' : 'none'; $id('ia-len-lbl').textContent = rsi ? 'RSI length:' : ema ? 'EMA length:' : 'Average volume days:';
  const d = { RSI_ABOVE: [70, 14], RSI_BELOW: [30, 14], EMA_ABOVE: [null, 50], EMA_BELOW: [null, 50], VOL_SPIKE: [null, 20] }[t];
  if (d) { if (d[0] != null) $id('ind-alert-level').value = d[0]; $id('ind-alert-len').value = d[1]; }
}
function openIndicatorAlert(key) {
  openPriceAlertModal(); setAlertMode('IND');
  const t = { rsi: 'RSI_ABOVE', ema: 'EMA_ABOVE', macd: 'MACD_UP', volume: 'VOL_SPIKE' }[key] || 'RSI_ABOVE';
  $id('ind-alert-type').value = t; syncIndAlertFields();
  if (key === 'rsi') $id('ind-alert-len').value = $id('rsi-len')?.value || 14;
}
(function () {
  const sp = window.savePriceAlert, op = window.openPriceAlertModal;
  window.openPriceAlertModal = function () { setAlertMode('PRICE'); return op.apply(this, arguments); };
  window.savePriceAlert = async function () { if (alertMode !== 'IND') return sp.apply(this, arguments); saveIndicatorAlert(); };
})();
function saveIndicatorAlert() {
  const st = $id('alert-save-status'), type = $id('ind-alert-type').value;
  const a = { id: 'ia' + Date.now(), symbol: currentSymbol, instType: (typeof currentInstrumentType !== 'undefined' ? currentInstrumentType : 'stock'), type,
    level: parseFloat($id('ind-alert-level').value), len: parseInt($id('ind-alert-len').value) || 14, mult: parseFloat($id('ind-alert-mult').value) || 2,
    created: Date.now(), status: 'ACTIVE' };
  if (type.startsWith('RSI') && isNaN(a.level)) { st.textContent = 'Valid level enter karein.'; return; }
  indAlerts.push(a); saveIndAlerts();
  st.style.color = 'var(--green)'; st.textContent = '✓ Indicator alert set.'; setTimeout(closePriceAlertModal, 800);
  setTimeout(checkIndicatorAlerts, 300);
}

/* indicator maths (daily closes) */
const emaArr = (v, n) => { const k = 2 / (n + 1); let e = v[0]; return v.map((x, i) => i ? (e = x * k + e * (1 - k)) : e); };
function rsiArr(c, n) {
  const out = new Array(c.length).fill(NaN); if (c.length <= n) return out;
  let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d >= 0 ? g += d : l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}
function evalIndAlert(a, candles) {
  const c = candles.map(x => +x.close), v = candles.map(x => +x.volume || 0);
  const start = new Date(a.created).setHours(0, 0, 0, 0), tms = x => dateFromDrawingTime(x.time)?.getTime() ?? 0;
  let r1, r2;
  if (a.type.startsWith('RSI')) { const r = rsiArr(c, a.len); r1 = i => r[i]; r2 = null; }
  const e = a.type.startsWith('EMA') ? emaArr(c, a.len) : null;
  let macd, sig; if (a.type.startsWith('MACD')) { const f = emaArr(c, macdConfig.fast), s = emaArr(c, macdConfig.slow); macd = f.map((x, i) => x - s[i]); sig = emaArr(macd, macdConfig.signal); }
  for (let i = Math.max(1, a.len || 1); i < candles.length; i++) {
    if (tms(candles[i]) < start) continue;
    let hit = false;
    switch (a.type) {
      case 'RSI_ABOVE': hit = r1(i - 1) < a.level && r1(i) >= a.level; break;
      case 'RSI_BELOW': hit = r1(i - 1) > a.level && r1(i) <= a.level; break;
      case 'EMA_ABOVE': hit = c[i - 1] <= e[i - 1] && c[i] > e[i]; break;
      case 'EMA_BELOW': hit = c[i - 1] >= e[i - 1] && c[i] < e[i]; break;
      case 'VOL_SPIKE': { let s = 0; for (let k = i - a.len; k < i; k++) s += v[k] || 0; hit = s > 0 && v[i] >= a.mult * (s / a.len); break; }
      case 'MACD_UP': hit = macd[i - 1] <= sig[i - 1] && macd[i] > sig[i]; break;
      case 'MACD_DOWN': hit = macd[i - 1] >= sig[i - 1] && macd[i] < sig[i]; break;
    }
    if (hit) return String(candles[i].time).slice(0, 10);
  }
  return null;
}
let indCheckBusy = false;
async function checkIndicatorAlerts() {
  if (indCheckBusy) return; indCheckBusy = true;
  try {
    const active = indAlerts.filter(a => a.status === 'ACTIVE'); const by = {};
    active.forEach(a => (by[a.symbol + '|' + a.instType] ||= []).push(a));
    for (const k of Object.keys(by)) {
      const [sym, type] = k.split('|'); let candles = [];
      try { candles = await fetchSymbolCandles(sym, type) || []; } catch (e) { }
      if (candles.length < 30) continue;
      by[k].forEach(a => { const day = evalIndAlert(a, candles); if (day) { a.status = 'TRIGGERED'; a.triggeredOn = day; toast(`🚨 ${sym}: ${describeIndAlert(a)} (${day})`); } });
    }
    saveIndAlerts();
    if ($id('my-alerts-modal')?.classList.contains('open')) appendIndAlertsToList();
  } finally { indCheckBusy = false; }
}
function deleteIndAlert(id) { indAlerts = indAlerts.filter(a => a.id !== id); saveIndAlerts(); appendIndAlertsToList(); }
function rearmIndAlert(id) { const a = indAlerts.find(x => x.id === id); if (a) { a.status = 'ACTIVE'; a.created = Date.now(); delete a.triggeredOn; saveIndAlerts(); appendIndAlertsToList(); checkIndicatorAlerts(); } }

/* My Alerts list mein indicator alerts bhi dikhao */
function appendIndAlertsToList() {
  const list = $id('my-alerts-list'); if (!list) return; list.querySelector('#ind-alerts-sec')?.remove();
  const sec = document.createElement('div'); sec.id = 'ind-alerts-sec';
  sec.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px;font-size:12px;color:var(--muted)">
      <b style="color:var(--text)">📊 Indicator alerts (${indAlerts.length})</b><button class="tbtn" style="padding:3px 10px;font-size:11px" onclick="checkIndicatorAlerts()">↻ Check now</button></div>` +
    (indAlerts.length ? indAlerts.map(a => `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;gap:8px">
        <div><b style="color:var(--accent)">${escapeHtml(a.symbol)}</b> <span style="color:var(--muted)">${escapeHtml(describeIndAlert(a))}${a.status === 'TRIGGERED' ? ` • <span style="color:var(--green)">Triggered ${a.triggeredOn}</span>` : ' • Active'}</span></div>
        <div style="display:flex;gap:4px">${a.status === 'TRIGGERED' ? `<button class="tbtn" style="padding:4px 8px;font-size:11px" onclick="rearmIndAlert('${a.id}')">↻ Re-arm</button>` : ''}<button class="tbtn" style="padding:4px 8px;font-size:11px" onclick="deleteIndAlert('${a.id}')">🗑</button></div></div>`).join('')
      : '<div style="color:var(--muted);text-align:center;padding:10px;font-size:12px">Koi indicator alert nahi. Chart ke indicator legend mein 🔔 dabao.</div>');
  list.appendChild(sec);
}
(function () { const r = window.renderMyAlerts; window.renderMyAlerts = function () { r.apply(this, arguments); appendIndAlertsToList(); }; })();
setTimeout(checkIndicatorAlerts, 6000); setInterval(checkIndicatorAlerts, 10 * 60 * 1000);
