/* MICKKK Charts enhancement layer: full symbol list, default indicators, weekly/monthly CPR. */
(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const asDate = value => {
    if (!value) return '';
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  };
  const periodKey = (value, kind) => {
    const iso = asDate(value);
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    if (kind === 'M') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };

  function getSymbols() {
    if (Array.isArray(window.symbols) && window.symbols.length) return window.symbols;
    try {
      const found = typeof symbols !== 'undefined' ? symbols : null;
      if (Array.isArray(found) && found.length) return found;
    } catch (e) {}
    return [];
  }

  async function ensureFullSymbols() {
    let list = getSymbols();
    try {
      const r = await fetch('../data/symbols.json?v=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const payload = await r.json();
        const source = Array.isArray(payload) ? payload : (payload.symbols || payload.data || []);
        const seen = new Set();
        list = source.map(x => ({
          symbol: String(x.symbol || '').trim().toUpperCase(),
          name: String(x.name || x.symbol || '').trim()
        })).filter(x => x.symbol && !seen.has(x.symbol) && seen.add(x.symbol))
          .sort((a, b) => a.symbol.localeCompare(b.symbol, undefined, { numeric: true, sensitivity: 'base' }));

        try { window.symbols = list; } catch (e) {}
        try { if (typeof symbols !== 'undefined') symbols.length = 0, symbols.push(...list); } catch (e) {}
      }
    } catch (e) {}

    if (!list.length) return;

    // Keep every symbol in the visible left list and native selector.
    const listEl = get('list');
    if (listEl && typeof window.renderList === 'function') {
      const q = (get('search')?.value || '').trim().toLowerCase();
      const filtered = q ? list.filter(x => `${x.symbol} ${x.name}`.toLowerCase().includes(q)) : list;
      window.renderList(filtered);
    }

    const select = get('symbolSelect');
    if (select) {
      select.innerHTML = list.map(x => `<option value="${escapeHtml(x.symbol)}">${escapeHtml(x.symbol)} — ${escapeHtml(x.name)}</option>`).join('');
      if (window.currentSymbol) select.value = window.currentSymbol;
    }

    // Remove any artificial result cap in typeahead/search overlays.
    const direct = get('direct');
    if (direct) {
      direct.addEventListener('focus', () => refreshTypeahead(), { once: false });
      direct.addEventListener('input', () => refreshTypeahead());
      direct.setAttribute('autocomplete', 'off');
    }

    const modalInput = get('modal-search-input');
    if (modalInput) {
      modalInput.addEventListener('input', () => refreshModalSearch(), { passive: true });
    }

    const count = get('count');
    if (count) count.textContent = `${list.length.toLocaleString()} symbols`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  }

  function chooseSymbol(symbol) {
    const list = getSymbols();
    const x = list.find(v => String(v.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!x) return;
    if (typeof window.openSymbol === 'function') return window.openSymbol(x.symbol);
    if (typeof window.loadSymbol === 'function') return window.loadSymbol(x.symbol, x.name, -1);
  }

  function refreshTypeahead() {
    const input = get('direct'), box = get('typeahead');
    if (!input || !box) return;
    const q = input.value.trim().toLowerCase();
    if (!q) { box.classList.remove('open'); return; }
    const matches = getSymbols().filter(x => `${x.symbol} ${x.name}`.toLowerCase().includes(q));
    box.innerHTML = matches.map(x => `<div class="sr" data-s="${escapeHtml(x.symbol)}"><span>${escapeHtml(x.name)}</span><b>${escapeHtml(x.symbol)}</b></div>`).join('');
    box.classList.toggle('open', matches.length > 0);
    box.querySelectorAll('[data-s]').forEach(el => el.onclick = () => { box.classList.remove('open'); chooseSymbol(el.dataset.s); });
  }

  function refreshModalSearch() {
    const input = get('modal-search-input');
    const target = get('modal-search-results');
    if (!input || !target) return;
    const q = input.value.trim().toLowerCase();
    const matches = getSymbols().filter(x => !q || `${x.symbol} ${x.name}`.toLowerCase().includes(q));
    target.innerHTML = matches.map(x => `<div class="search-row-item" data-sym="${escapeHtml(x.symbol)}"><span class="s-name">${escapeHtml(x.name)}</span><span class="s-sym">${escapeHtml(x.symbol)}</span></div>`).join('');
    target.style.maxHeight = '70vh';
    target.style.overflowY = 'auto';
    target.querySelectorAll('[data-sym]').forEach(el => el.onclick = () => { chooseSymbol(el.dataset.sym); if (typeof window.closeSearchModal === 'function') window.closeSearchModal(); });
  }

  function enableAllIndicators() {
    // Native indicator settings from the supplied MICKKK chart.
    const ids = ['ema1-en','ema2-en','ema3-en','ema4-en','ema-env-en','candle-clr-en','smart-body-en','smart-range-en','smart-nr7-en','ib-label-en','mcp-en','ind-ppv','volma-en','rsi-en','rsima-en','rsi-thresh-en','gap-en','wtc-en','ema9sell-en','sellclimax-en','buyclimax-en','atr-ext-en','ind-tables','cpr-weekly-en','cpr-monthly-en'];
    ids.forEach(id => { const el = get(id); if (el && el.type === 'checkbox') el.checked = true; });
    try { if (typeof updateEMAConfig === 'function') updateEMAConfig(); } catch (e) {}
    try { if (typeof updateSmartBarConfig === 'function') updateSmartBarConfig(); } catch (e) {}
    try { if (typeof updateMCPConfig === 'function') updateMCPConfig(); } catch (e) {}
    try { if (typeof updateVolMAConfig === 'function') updateVolMAConfig(); } catch (e) {}
    try { if (typeof updateRSIConfig === 'function') updateRSIConfig(); } catch (e) {}
    try { if (typeof updateGapConfig === 'function') updateGapConfig(); } catch (e) {}
    try { if (typeof updateATRExtConfig === 'function') updateATRExtConfig(); } catch (e) {}
    try { if (typeof toggleIndicator === 'function') ['ibLabel','wtc','ema9Sell','sellClimax','buyClimax','ppv','tables'].forEach(k => { try { toggleIndicator(k); } catch (e) {} }); } catch (e) {}
    try { if (typeof window.indicatorState === 'object') Object.keys(window.indicatorState).forEach(k => window.indicatorState[k] = true); } catch (e) {}
  }

  function cprMap(rawDaily, kind) {
    const groups = new Map();
    (rawDaily || []).forEach(c => {
      const key = periodKey(c.time, kind); if (!key) return;
      const z = groups.get(key) || { high: -Infinity, low: Infinity, close: 0 };
      z.high = Math.max(z.high, Number(c.high));
      z.low = Math.min(z.low, Number(c.low));
      z.close = Number(c.close);
      groups.set(key, z);
    });
    const keys = [...groups.keys()].sort();
    const out = new Map();
    for (let i = 1; i < keys.length; i++) {
      const p = groups.get(keys[i - 1]);
      if (!p || !Number.isFinite(p.high) || !Number.isFinite(p.low)) continue;
      const pivot = (p.high + p.low + p.close) / 3;
      const bc = (p.high + p.low) / 2;
      const tc = 2 * pivot - bc;
      out.set(keys[i], { tc, pivot, bc });
    }
    return out;
  }

  function addCPRSeries(chartObj, data, kind, prefix, palette, store) {
    if (!chartObj || !data || !data.length || !window.LightweightCharts) return;
    const map = cprMap(typeof raw !== 'undefined' ? raw : window.raw, kind);
    const tc = [], pp = [], bc = [];
    data.forEach(c => {
      const l = map.get(periodKey(c.time, kind));
      if (!l) return;
      tc.push({ time: c.time, value: +l.tc.toFixed(2) });
      pp.push({ time: c.time, value: +l.pivot.toFixed(2) });
      bc.push({ time: c.time, value: +l.bc.toFixed(2) });
    });
    if (!tc.length) return;
    [[tc,palette.tc,2,`${prefix} TC`],[pp,palette.p,1,`${prefix} Pivot`],[bc,palette.bc,2,`${prefix} BC`]].forEach(([rows,color,width,title]) => {
      const s = chartObj.addLineSeries({ color, lineWidth: width, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false, title });
      s.setData(rows); store.push(s);
    });
  }

  function renderCPR() {
    try {
      const chartObj = (typeof chart !== 'undefined') ? chart : window.chart;
      const daily = (typeof raw !== 'undefined') ? raw : window.raw;
      const interval = (typeof tf !== 'undefined') ? tf : (typeof window.tf !== 'undefined' ? window.tf : 'D');
      if (!chartObj || !Array.isArray(daily) || !daily.length) return;
      window.__mickkkCPR = window.__mickkkCPR || [];
      window.__mickkkCPR.forEach(s => { try { chartObj.removeSeries(s); } catch (e) {} });
      window.__mickkkCPR = [];
      const data = (typeof window.aggregate === 'function') ? window.aggregate(daily, interval) : daily;
      addCPRSeries(chartObj, data, 'W', 'W-CPR', {tc:'#22c55e',p:'#00d4ff',bc:'#ef4444'}, window.__mickkkCPR);
      addCPRSeries(chartObj, data, 'M', 'M-CPR', {tc:'#a78bfa',p:'#ffab00',bc:'#f97316'}, window.__mickkkCPR);
    } catch (e) { console.warn('CPR enhancement error', e); }
  }

  function installCPRHooks() {
    const originalDraw = window.draw;
    if (typeof originalDraw === 'function' && !originalDraw.__mickkkEnhanced) {
      const wrapped = function(...args) {
        const out = originalDraw.apply(this, args);
        setTimeout(renderCPR, 0);
        return out;
      };
      wrapped.__mickkkEnhanced = true;
      window.draw = wrapped;
    }

    const originalOpen = window.openSymbol;
    if (typeof originalOpen === 'function' && !originalOpen.__mickkkEnhanced) {
      const wrapped = async function(...args) {
        const out = await originalOpen.apply(this, args);
        setTimeout(renderCPR, 0);
        return out;
      };
      wrapped.__mickkkEnhanced = true;
      window.openSymbol = wrapped;
    }
  }

  function addCPRUI() {
    if (get('cpr-enhanced-badge')) return;
    const box = document.querySelector('.controls, .toolbar-controls');
    if (!box) return;
    const badge = document.createElement('span');
    badge.id = 'cpr-enhanced-badge';
    badge.style.cssText = 'font:10px var(--mono);color:var(--muted);padding:0 4px;';
    badge.textContent = 'W/M CPR ON';
    box.appendChild(badge);
  }

  async function init() {
    await ensureFullSymbols();
    installCPRHooks();
    enableAllIndicators();
    addCPRUI();
    setTimeout(renderCPR, 500);
    setTimeout(renderCPR, 1800);
  }

  // Run after the base chart script and keep working if the page initializes late.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  setInterval(() => { try { refreshTypeahead(); } catch (e) {} }, 2000);
})();
