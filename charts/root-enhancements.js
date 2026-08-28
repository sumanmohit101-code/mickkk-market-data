/* Root MICKKK Charts enhancement layer.
   - Always load the complete GitHub symbol catalogue.
   - Keep search modal tall and fully scrollable.
   - Enable every existing indicator by default.
   - Keep weekly/monthly CPR enabled and re-render after chart rebuilds.
*/
(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
  }[m]));

  function normaliseSymbols(payload) {
    const source = Array.isArray(payload)
      ? payload
      : (payload?.symbols || payload?.data || []);
    const seen = new Set();
    return source
      .map(x => ({
        symbol: String(x?.symbol || '').trim().toUpperCase(),
        name: String(x?.name || x?.symbol || '').trim()
      }))
      .filter(x => x.symbol && !seen.has(x.symbol) && seen.add(x.symbol))
      .sort((a,b) => a.symbol.localeCompare(b.symbol, undefined, {numeric:true, sensitivity:'base'}));
  }

  async function loadCompleteSymbolCatalogue() {
    const res = await fetch('/data/symbols.json?v=' + Date.now(), {cache:'no-store'});
    if (!res.ok) throw new Error('symbols.json HTTP ' + res.status);
    const list = normaliseSymbols(await res.json());
    if (!list.length) throw new Error('symbols.json is empty');

    try { allSymbols.splice(0, allSymbols.length, ...list); } catch (_) {}

    const count = document.getElementById('modal-symbol-count');
    if (count) count.textContent = list.length.toLocaleString();

    const watchPicker = document.getElementById('watch-stock-picker');
    if (watchPicker) {
      watchPicker.innerHTML = list.map((x,i) =>
        `<option value="${i}">${esc(x.symbol)} — ${esc(x.name)}</option>`
      ).join('');
    }

    const searchBox = document.getElementById('modal-search-results');
    if (searchBox && typeof renderSearchModalResults === 'function') {
      renderSearchModalResults(list);
    }
  }

  function makeSearchModalFullyScrollable() {
    const box = document.getElementById('search-modal');
    const results = document.getElementById('modal-search-results');
    if (!box || !results) return;
    results.style.maxHeight = 'calc(100vh - 170px)';
    results.style.minHeight = '120px';
    results.style.overflowY = 'auto';
    results.style.overscrollBehavior = 'contain';
    box.style.maxHeight = 'calc(100vh - 40px)';
    box.style.overflow = 'hidden';
  }

  function enableAllNativeIndicators() {
    const ids = [
      'ema1-en','ema2-en','ema3-en','ema4-en','ema-env-en',
      'candle-clr-en','smart-body-en','smart-range-en','smart-nr7-en',
      'ib-label-en','mcp-en','ind-ppv','volma-en','rsi-en','rsima-en',
      'rsi-thresh-en','gap-en','wtc-en','ema9sell-en','sellclimax-en',
      'buyclimax-en','atr-ext-en','ind-tables','cpr-weekly-en','cpr-monthly-en'
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.type === 'checkbox') el.checked = true;
    });

    // Sync the existing chart state with the switches.
    try { updateEMAConfig(); } catch (_) {}
    try { updateSmartBarConfig(); } catch (_) {}
    try { updateMCPConfig(); } catch (_) {}
    try { updateVolMAConfig(); } catch (_) {}
    try { updateRSIConfig(); } catch (_) {}
    try { updateGapConfig(); } catch (_) {}
    try { updateATRExtConfig(); } catch (_) {}
    try {
      if (typeof window.activeIndicators === 'object') {
        Object.keys(window.activeIndicators).forEach(k => window.activeIndicators[k] = true);
      }
    } catch (_) {}
  }

  function forceCPROn() {
    try {
      if (typeof cprConfig === 'object') {
        cprConfig.weeklyEnabled = true;
        cprConfig.monthlyEnabled = true;
      }
      ['cpr-weekly-en','cpr-monthly-en'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
      });
      if (typeof rebuildAllPanels === 'function' && typeof currentSymbol !== 'undefined' && currentSymbol) {
        rebuildAllPanels();
      }
    } catch (_) {}
  }

  function patchGlobalSearchAfterOpen() {
    if (typeof renderSearchModalResults !== 'function') return;
    const original = renderSearchModalResults;
    if (original.__mickkkRootPatch) return;
    const wrapped = function(list) {
      return original.call(this, list || (typeof allSymbols !== 'undefined' ? allSymbols : []));
    };
    wrapped.__mickkkRootPatch = true;
    try { window.renderSearchModalResults = wrapped; } catch (_) {}
  }

  async function init() {
    makeSearchModalFullyScrollable();
    patchGlobalSearchAfterOpen();
    try { await loadCompleteSymbolCatalogue(); } catch (e) { console.warn('Complete symbol catalogue:', e); }
    enableAllNativeIndicators();
    forceCPROn();
    setTimeout(() => { makeSearchModalFullyScrollable(); enableAllNativeIndicators(); forceCPROn(); }, 800);
    setTimeout(() => { makeSearchModalFullyScrollable(); enableAllNativeIndicators(); }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
