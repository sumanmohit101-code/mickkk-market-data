(() => {
  'use strict';

  const DATA_BASE = './data/';
  const SYMBOLS_URL = `${DATA_BASE}symbols.json`;
  const EVENTS_URL = `${DATA_BASE}events.json`;
  const RESULTS_URL = `${DATA_BASE}results.json`;
  const FIIDII_URL = `${DATA_BASE}fii_dii.json`;
  const SENTIMENT_URL = `${DATA_BASE}market_sentiment.json`;
  const PRICE_BANDS_URL = `${DATA_BASE}price-bands.json`;

  const WATCH_KEY = 'MICKKK_GITHUB_WATCHLISTS_V1';
  const ALERT_KEY = 'MICKKK_GITHUB_ALERTS_V1';

  let ghEvents = null;
  let ghResults = null;
  let ghFiiDii = null;
  let ghSentiment = null;
  let ghEventMarkersEnabled = true;
  let ghCurrentTab = 'EVENTS';

  window.GITHUB_DATA_BASE = DATA_BASE;

  function ghEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ghBucket(symbol) {
    const first = String(symbol || '').trim().slice(0, 1).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : '0-9';
  }

  function ghJson(url) {
    return fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  function ghDate(value) {
    if (!value) return '';
    const text = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function ghPrettyDate(value) {
    const date = ghDate(value);
    if (!date) return '—';
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function ghReadWatchlists() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function ghWriteWatchlists(value) {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(value)); } catch (e) {}
  }

  function ghReadAlerts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function ghWriteAlerts(value) {
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(value)); } catch (e) {}
  }

  function ghEnsureWatchlist() {
    let lists = ghReadWatchlists();
    if (!lists.length) {
      lists = [{
        name: 'My Watchlist',
        symbols: []
      }];
      ghWriteWatchlists(lists);
    }
    return lists;
  }

  function ghCurrentListName() {
    const select = document.getElementById('ghfx-watch-select');
    return select && select.value ? select.value : 'My Watchlist';
  }

  function ghAddToolbarButton(id, text, title, handler) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const group = document.querySelector('.toolbar-controls');
    if (!group) return null;
    const button = document.createElement('button');
    button.className = 'tbtn';
    button.id = id;
    button.title = title || '';
    button.textContent = text;
    button.onclick = handler;
    group.appendChild(button);
    return button;
  }

  function ghAddStatusBadge() {
    const existing = document.getElementById('ghfx-toolbar-status');
    if (existing) return;
    const group = document.querySelector('.toolbar-controls');
    if (!group) return;
    const badge = document.createElement('span');
    badge.id = 'ghfx-toolbar-status';
    badge.innerHTML = '<span class="ghfx-dot"></span> GitHub DATA';
    group.appendChild(badge);
  }

  function ghBuildWatchDock() {
    if (document.getElementById('ghfx-watch-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'ghfx-watch-wrap';
    wrap.className = 'ghfx-watch-wrap';
    wrap.innerHTML = `
      <div class="ghfx-watch-head">
        <select id="ghfx-watch-select" class="ghfx-watch-select"></select>
        <button class="ghfx-close" onclick="ghToggleWatchlist(false)" title="Close">×</button>
      </div>
      <div class="ghfx-watch-actions">
        <button class="ghfx-small-btn" id="ghfx-watch-add-list">＋ List</button>
        <button class="ghfx-small-btn" id="ghfx-watch-add-stock">＋ Stock</button>
        <button class="ghfx-small-btn" id="ghfx-watch-rename">✎</button>
        <button class="ghfx-small-btn" id="ghfx-watch-delete-list">🗑</button>
      </div>
      <div class="ghfx-watch-body" id="ghfx-watch-body"></div>
    `;
    document.body.appendChild(wrap);

    document.getElementById('ghfx-watch-select').addEventListener('change', ghRenderWatchlists);
    document.getElementById('ghfx-watch-add-list').onclick = ghAddWatchlist;
    document.getElementById('ghfx-watch-add-stock').onclick = ghAddWatchStock;
    document.getElementById('ghfx-watch-rename').onclick = ghRenameWatchlist;
    document.getElementById('ghfx-watch-delete-list').onclick = ghDeleteWatchlist;

    ghRenderWatchlists();
  }

  function ghRenderWatchlists() {
    const select = document.getElementById('ghfx-watch-select');
    const body = document.getElementById('ghfx-watch-body');
    if (!select || !body) return;

    const lists = ghEnsureWatchlist();
    const current = select.value;
    select.innerHTML = lists.map(l => `<option value="${ghEscape(l.name)}">${ghEscape(l.name)}</option>`).join('');
    if (lists.some(l => l.name === current)) select.value = current;

    const active = lists.find(l => l.name === select.value) || lists[0];
    body.innerHTML = '';

    if (!active.symbols.length) {
      body.innerHTML = `<div class="ghfx-empty">No stocks in this watchlist.<br>Use <b>＋ Stock</b> to add symbols.</div>`;
      return;
    }

    active.symbols.forEach(symbol => {
      const stock = (window.allSymbols || []).find(s => s.symbol === symbol) || { symbol, name: '' };
      const item = document.createElement('div');
      item.className = `ghfx-watch-item${window.currentSymbol === symbol ? ' active' : ''}`;
      item.innerHTML = `
        <span class="ghfx-watch-sym">${ghEscape(symbol)}</span>
        <span class="ghfx-watch-name">${ghEscape(stock.name || '')}</span>
        <button class="ghfx-watch-del" title="Remove">×</button>
      `;
      item.onclick = e => {
        if (e.target.closest('.ghfx-watch-del')) return;
        if (typeof window.loadSymbol === 'function') window.loadSymbol(symbol, stock.name || symbol);
      };
      item.querySelector('.ghfx-watch-del').onclick = e => {
        e.stopPropagation();
        active.symbols = active.symbols.filter(x => x !== symbol);
        ghWriteWatchlists(lists);
        ghRenderWatchlists();
      };
      body.appendChild(item);
    });
  }

  function ghAddWatchlist() {
    const name = prompt('Watchlist name:', `List ${ghReadWatchlists().length + 1}`);
    if (!name || !name.trim()) return;
    const lists = ghReadWatchlists();
    if (lists.some(l => l.name.toLowerCase() === name.trim().toLowerCase())) {
      alert('Watchlist already exists.');
      return;
    }
    lists.push({ name: name.trim(), symbols: [] });
    ghWriteWatchlists(lists);
    ghBuildWatchDock();
    const select = document.getElementById('ghfx-watch-select');
    if (select) select.value = name.trim();
    ghRenderWatchlists();
  }

  function ghRenameWatchlist() {
    const select = document.getElementById('ghfx-watch-select');
    if (!select || !select.value) return;
    const next = prompt('Rename watchlist:', select.value);
    if (!next || !next.trim() || next.trim() === select.value) return;
    const lists = ghReadWatchlists();
    const item = lists.find(l => l.name === select.value);
    if (!item) return;
    item.name = next.trim();
    ghWriteWatchlists(lists);
    ghRenderWatchlists();
  }

  function ghDeleteWatchlist() {
    const select = document.getElementById('ghfx-watch-select');
    if (!select || !select.value) return;
    const lists = ghReadWatchlists();
    if (lists.length <= 1) {
      lists[0].symbols = [];
      ghWriteWatchlists(lists);
      ghRenderWatchlists();
      return;
    }
    if (!confirm(`Delete ${select.value}?`)) return;
    ghWriteWatchlists(lists.filter(l => l.name !== select.value));
    ghRenderWatchlists();
  }

  function ghAddWatchStock() {
    const lists = ghEnsureWatchlist();
    const select = document.getElementById('ghfx-watch-select');
    if (!select) return;
    const active = lists.find(l => l.name === select.value) || lists[0];
    const q = prompt('Stock symbol to add:', window.currentSymbol || 'RELIANCE');
    if (!q || !q.trim()) return;
    const raw = q.trim().toUpperCase();
    const found = (window.allSymbols || []).find(s => s.symbol.toUpperCase() === raw);
    if (!found) {
      alert('Symbol not found in GitHub symbol list.');
      return;
    }
    if (!active.symbols.includes(found.symbol)) active.symbols.push(found.symbol);
    ghWriteWatchlists(lists);
    ghRenderWatchlists();
  }

  window.ghToggleWatchlist = function(force) {
    ghBuildWatchDock();
    const wrap = document.getElementById('ghfx-watch-wrap');
    const open = typeof force === 'boolean' ? force : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    if (open) ghRenderWatchlists();
  };

  function ghBuildEventDock() {
    if (document.getElementById('ghfx-dock')) return;

    const dock = document.createElement('div');
    dock.id = 'ghfx-dock';
    dock.className = 'ghfx-dock';
    dock.innerHTML = `
      <div class="ghfx-head">
        <div class="ghfx-title" id="ghfx-dock-title">Market Events</div>
        <button class="ghfx-close" onclick="ghToggleEvents(false)">×</button>
      </div>
      <div class="ghfx-tabs">
        <button class="ghfx-tab active" data-tab="EVENTS">Events</button>
        <button class="ghfx-tab" data-tab="RESULTS">Results</button>
        <button class="ghfx-tab" data-tab="FII">FII/DII</button>
        <button class="ghfx-tab" data-tab="SENTIMENT">Sentiment</button>
      </div>
      <div class="ghfx-body" id="ghfx-dock-body"></div>
    `;
    document.body.appendChild(dock);

    dock.querySelectorAll('.ghfx-tab').forEach(btn => {
      btn.onclick = () => {
        ghCurrentTab = btn.dataset.tab;
        dock.querySelectorAll('.ghfx-tab').forEach(x => x.classList.toggle('active', x === btn));
        ghRenderEventDock();
      };
    });
  }

  function ghEventDataForSymbol(symbol) {
    const data = (ghEvents && ghEvents.bySymbol && ghEvents.bySymbol[symbol]) || {};
    return {
      corporateActions: Array.isArray(data.corporateActions) ? data.corporateActions : [],
      boardMeetings: Array.isArray(data.boardMeetings) ? data.boardMeetings : [],
      bulkDeals: Array.isArray(data.bulkDeals) ? data.bulkDeals : [],
      blockDeals: Array.isArray(data.blockDeals) ? data.blockDeals : []
    };
  }

  function ghResultsForSymbol(symbol) {
    const list = (ghResults && Array.isArray(ghResults.symbolWise)) ? ghResults.symbolWise : [];
    return list.find(x => String(x.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()) || {
      symbol,
      company: '',
      lastResult: null,
      upcomingResults: []
    };
  }

  function ghRenderRows(rows, fields) {
    if (!rows || !rows.length) return '<div class="ghfx-empty">No data available for this symbol.</div>';
    return rows.slice(0, 12).map(r => {
      const bits = fields.map(([label, key]) => {
        const value = key === 'eventDate' || key === 'date' ? ghPrettyDate(r[key]) : (r[key] ?? '—');
        return `<div class="ghfx-row"><span class="ghfx-key">${ghEscape(label)}</span><span class="ghfx-val">${ghEscape(value)}</span></div>`;
      }).join('');
      return `<div class="ghfx-card"><div class="ghfx-card-top"><span class="ghfx-card-title">${ghEscape(r.symbol || window.currentSymbol || '')}</span><span class="ghfx-badge">${ghEscape(r.eventType || '')}</span></div>${bits}</div>`;
    }).join('');
  }

  function ghRenderEventDock() {
    const body = document.getElementById('ghfx-dock-body');
    const title = document.getElementById('ghfx-dock-title');
    if (!body) return;

    const symbol = window.currentSymbol || '—';
    if (title) title.textContent = `${symbol} · ${ghCurrentTab}`;

    if (ghCurrentTab === 'FII') {
      const rows = ghFiiDii && (ghFiiDii.history || ghFiiDii.data || ghFiiDii) || [];
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) {
        body.innerHTML = '<div class="ghfx-empty">FII/DII history is not available yet.</div>';
        return;
      }
      const keys = Object.keys(list[0] || {}).slice(0, 8);
      body.innerHTML = `
        <div class="ghfx-section">
          <div class="ghfx-section-head">Latest FII / DII history</div>
          ${list.slice(0, 15).map(row => `
            <div class="ghfx-card">
              ${keys.map(key => `<div class="ghfx-row"><span class="ghfx-key">${ghEscape(key)}</span><span class="ghfx-val">${ghEscape(row[key])}</span></div>`).join('')}
            </div>
          `).join('')}
        </div>
      `;
      return;
    }

    if (ghCurrentTab === 'SENTIMENT') {
      const s = (ghSentiment && ghSentiment.sentiment) || {};
      body.innerHTML = Object.keys(s).length ? Object.entries(s).map(([name, row]) => `
        <div class="ghfx-section">
          <div class="ghfx-section-head">${ghEscape(name)}</div>
          <div class="ghfx-row"><span class="ghfx-key">Last</span><span class="ghfx-val">${ghEscape(row.lastPrice)}</span></div>
          <div class="ghfx-row"><span class="ghfx-key">Change</span><span class="ghfx-val">${ghEscape(row.change)} (${ghEscape(row.pChange)}%)</span></div>
        </div>
      `).join('') : '<div class="ghfx-empty">Market sentiment unavailable.</div>';
      return;
    }

    if (ghCurrentTab === 'RESULTS') {
      const result = ghResultsForSymbol(symbol);
      body.innerHTML = `
        <div class="ghfx-section">
          <div class="ghfx-section-head">Last Result</div>
          ${result.lastResult ? ghRenderRows([result.lastResult], [
            ['Result date', 'resultDate'],
            ['Period', 'period'],
            ['Relating to', 'relatingTo'],
            ['Financial year', 'financialYear']
          ]) : '<div class="ghfx-empty">No last-result record available.</div>'}
        </div>
        <div class="ghfx-section">
          <div class="ghfx-section-head">Upcoming Results</div>
          ${result.upcomingResults && result.upcomingResults.length ? ghRenderRows(result.upcomingResults, [
            ['Date', 'date'],
            ['Purpose', 'purpose'],
            ['Description', 'description']
          ]) : '<div class="ghfx-empty">No upcoming result date currently published by NSE.</div>'}
        </div>
      `;
      return;
    }

    const data = ghEventDataForSymbol(symbol);
    const nextAction = data.corporateActions.find(x => ghDate(x.eventDate) >= new Date().toISOString().slice(0, 10));
    const nextBoard = data.boardMeetings.find(x => ghDate(x.eventDate) >= new Date().toISOString().slice(0, 10));

    body.innerHTML = `
      <div class="ghfx-section">
        <div class="ghfx-section-head">Next Events</div>
        <div class="ghfx-row"><span class="ghfx-key">Next corporate action</span><span class="ghfx-val">${nextAction ? `${ghEscape(nextAction.eventType)} · ${ghEscape(ghPrettyDate(nextAction.eventDate))}` : '—'}</span></div>
        <div class="ghfx-row"><span class="ghfx-key">Next board meeting</span><span class="ghfx-val">${nextBoard ? ghEscape(ghPrettyDate(nextBoard.eventDate)) : '—'}</span></div>
      </div>
      <div class="ghfx-section">
        <div class="ghfx-section-head">Dividend / Bonus / Split / Rights</div>
        ${ghRenderRows(data.corporateActions.filter(x => ['DIVIDEND','BONUS','SPLIT','RIGHTS'].includes(x.eventType)), [['Date','eventDate'],['Purpose','purpose']])}
      </div>
      <div class="ghfx-section">
        <div class="ghfx-section-head">Board Meetings</div>
        ${ghRenderRows(data.boardMeetings, [['Date','eventDate'],['Purpose','purpose']])}
      </div>
      <div class="ghfx-section">
        <div class="ghfx-section-head">Bulk Deals</div>
        ${ghRenderRows(data.bulkDeals, [['Date','eventDate'],['Client','clientName'],['Quantity','quantity'],['Price','price'],['Buy/Sell','buySell']])}
      </div>
      <div class="ghfx-section">
        <div class="ghfx-section-head">Block Deals</div>
        ${ghRenderRows(data.blockDeals, [['Date','eventDate'],['Client','clientName'],['Quantity','quantity'],['Price','price'],['Buy/Sell','buySell']])}
      </div>
    `;
  }

  window.ghToggleEvents = function(force) {
    ghBuildEventDock();
    const dock = document.getElementById('ghfx-dock');
    const open = typeof force === 'boolean' ? force : !dock.classList.contains('open');
    dock.classList.toggle('open', open);
    if (open) ghRenderEventDock();
  };

  function ghBuildAlertModal() {
    if (document.getElementById('ghfx-alert-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'ghfx-alert-modal';
    modal.className = 'ghfx-alert-modal';
    modal.innerHTML = `
      <div class="ghfx-alert-box">
        <div class="ghfx-alert-head">
          <div class="ghfx-alert-title">🔔 Price Alerts</div>
          <button class="ghfx-close" id="ghfx-alert-close">×</button>
        </div>
        <div class="ghfx-alert-list" id="ghfx-alert-list"></div>
        <div class="ghfx-alert-actions">
          <button class="ghfx-mini-btn" id="ghfx-alert-new">＋ New Alert</button>
          <button class="ghfx-mini-btn" id="ghfx-alert-clear">Clear All</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) ghToggleAlerts(false); });
    document.getElementById('ghfx-alert-close').onclick = () => ghToggleAlerts(false);
    document.getElementById('ghfx-alert-new').onclick = ghCreateAlert;
    document.getElementById('ghfx-alert-clear').onclick = () => {
      if (!confirm('Delete all price alerts?')) return;
      ghWriteAlerts([]);
      ghRenderAlerts();
    };
  }

  function ghRenderAlerts() {
    const list = document.getElementById('ghfx-alert-list');
    if (!list) return;
    const alerts = ghReadAlerts();
    if (!alerts.length) {
      list.innerHTML = '<div class="ghfx-empty">No price alerts set.</div>';
      return;
    }
    list.innerHTML = alerts.map((a, i) => `
      <div class="ghfx-alert-row">
        <div><div class="ghfx-alert-symbol">${ghEscape(a.symbol)}</div><div class="ghfx-alert-meta">${a.condition === 'ABOVE' ? '≥' : '≤'} ₹${Number(a.targetPrice).toFixed(2)} · ${a.triggered ? 'Triggered' : 'Active'}</div></div>
        <button class="ghfx-mini-btn" data-i="${i}">Delete</button>
      </div>
    `).join('');
    list.querySelectorAll('.ghfx-mini-btn').forEach(btn => {
      btn.onclick = () => {
        const alerts2 = ghReadAlerts();
        alerts2.splice(Number(btn.dataset.i), 1);
        ghWriteAlerts(alerts2);
        ghRenderAlerts();
      };
    });
  }

  function ghCreateAlert() {
    const symbol = window.currentSymbol || prompt('Symbol:', 'RELIANCE');
    if (!symbol) return;
    const price = parseFloat(prompt(`Target price for ${symbol}:`, ''));
    if (!Number.isFinite(price) || price <= 0) return;
    const condition = (prompt('Condition: ABOVE or BELOW', 'ABOVE') || 'ABOVE').toUpperCase() === 'BELOW' ? 'BELOW' : 'ABOVE';
    const alerts = ghReadAlerts();
    alerts.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      symbol: String(symbol).toUpperCase(),
      targetPrice: price,
      condition,
      triggered: false,
      createdAt: new Date().toISOString()
    });
    ghWriteAlerts(alerts);
    ghRenderAlerts();
  }

  window.ghToggleAlerts = function(force) {
    ghBuildAlertModal();
    const modal = document.getElementById('ghfx-alert-modal');
    const open = typeof force === 'boolean' ? force : !modal.classList.contains('open');
    modal.classList.toggle('open', open);
    if (open) ghRenderAlerts();
  };

  function ghCheckAlerts(symbol, price) {
    const alerts = ghReadAlerts();
    let changed = false;
    alerts.forEach(a => {
      if (a.triggered || String(a.symbol).toUpperCase() !== String(symbol).toUpperCase()) return;
      const ok = a.condition === 'ABOVE' ? price >= Number(a.targetPrice) : price <= Number(a.targetPrice);
      if (!ok) return;
      a.triggered = true;
      changed = true;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
      } catch (e) {}
      alert(`🚨 ${symbol} price alert: ₹${Number(price).toFixed(2)} (${a.condition} ₹${Number(a.targetPrice).toFixed(2)})`);
    });
    if (changed) ghWriteAlerts(alerts);
  }

  function ghMarkerText(type) {
    const map = {
      RESULT: 'R',
      DIVIDEND: 'D',
      BONUS: 'B',
      SPLIT: 'S',
      RIGHTS: 'RT',
      BOARD_MEETING: 'BM',
      BULK_DEAL: 'BLK',
      BLOCK_DEAL: 'BLK'
    };
    return map[type] || 'E';
  }

  function ghEventMarkersForCurrentSymbol() {
    if (!ghEventMarkersEnabled || !window.candleSeries || !window.chart || !window.currentSymbol) return [];
    const rows = [];
    const symbol = window.currentSymbol;
    const eventData = ghEventDataForSymbol(symbol);
    const result = ghResultsForSymbol(symbol);

    if (result.lastResult && result.lastResult.resultDate) {
      rows.push({ time: ghDate(result.lastResult.resultDate), position: 'aboveBar', color: '#00d4ff', shape: 'circle', text: 'R' });
    }

    (result.upcomingResults || []).forEach(r => {
      const t = ghDate(r.date);
      if (t) rows.push({ time: t, position: 'aboveBar', color: '#00d4ff', shape: 'circle', text: 'R' });
    });

    [...eventData.corporateActions, ...eventData.boardMeetings, ...eventData.bulkDeals, ...eventData.blockDeals].forEach(row => {
      const t = ghDate(row.eventDate);
      if (!t) return;
      const type = row.eventType || 'OTHER';
      let position = 'belowBar';
      let color = '#ffab00';
      let shape = 'arrowUp';
      if (type === 'BOARD_MEETING') { color = '#a78bfa'; shape = 'square'; position = 'aboveBar'; }
      if (type === 'BULK_DEAL' || type === 'BLOCK_DEAL') { color = '#ff3d5a'; shape = 'circle'; position = 'aboveBar'; }
      if (type === 'DIVIDEND') color = '#00e676';
      if (type === 'BONUS') color = '#00d4ff';
      if (type === 'SPLIT') color = '#a78bfa';
      if (type === 'RIGHTS') color = '#ffab00';
      rows.push({ time: t, position, color, shape, text: ghMarkerText(type) });
    });

    const seen = new Set();
    return rows.filter(m => {
      const key = `${m.time}|${m.text}|${m.position}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  function ghApplyMarkers() {
    try {
      if (!window.candleSeries || typeof window.candleSeries.setMarkers !== 'function') return;
      window.candleSeries.setMarkers(ghEventMarkersForCurrentSymbol());
    } catch (e) {}
    ghRenderEventSummary();
  }

  function ghRenderEventSummary() {
    const info = document.getElementById('widget-combined-info');
    if (!info) return;
    const symbol = window.currentSymbol;
    if (!symbol) return;

    const result = ghResultsForSymbol(symbol);
    const data = ghEventDataForSymbol(symbol);
    const today = new Date().toISOString().slice(0, 10);
    const nextResult = (result.upcomingResults || []).find(r => ghDate(r.date) >= today);
    const nextAction = data.corporateActions.find(r => ghDate(r.eventDate) >= today);
    const nextBoard = data.boardMeetings.find(r => ghDate(r.eventDate) >= today);

    info.style.display = 'flex';
    info.innerHTML = `
      <div class="info-card-section">
        <div class="info-card-section">
          <div class="info-row"><span>Last Result</span><span class="widget-badge bg-pos">${result.lastResult ? ghPrettyDate(result.lastResult.resultDate) : '—'}</span></div>
          <div class="info-row"><span>Next Result</span><span class="widget-badge bg-amber">${nextResult ? ghPrettyDate(nextResult.date) : '—'}</span></div>
          <div class="info-row"><span>Next Action</span><span>${nextAction ? `${ghEscape(nextAction.eventType)} · ${ghEscape(ghPrettyDate(nextAction.eventDate))}` : '—'}</span></div>
          <div class="info-row"><span>Next Board</span><span>${nextBoard ? ghEscape(ghPrettyDate(nextBoard.eventDate)) : '—'}</span></div>
        </div>
        <div class="info-card-divider"></div>
        <div class="info-card-footer">Events: ${ghEventMarkersEnabled ? 'ON' : 'OFF'} · GitHub data</div>
      </div>
    `;
  }

  function ghInjectControls() {
    ghAddToolbarButton('ghfx-events-btn', '📌 Events', 'Results, corporate actions, board meetings, bulk/block deals', () => ghToggleEvents(true));
    ghAddToolbarButton('ghfx-watch-btn', '☷ Lists', 'Watchlists', () => ghToggleWatchlist(true));
    ghAddToolbarButton('ghfx-alert-btn', '🔔 Alerts', 'Local GitHub-data price alerts', () => ghToggleAlerts(true));
    ghAddToolbarButton('ghfx-events-toggle', 'Markers', 'Toggle event markers on chart', btn => {
      ghEventMarkersEnabled = !ghEventMarkersEnabled;
      btn.classList.toggle('active', ghEventMarkersEnabled);
      ghApplyMarkers();
    });
    const markerBtn = document.getElementById('ghfx-events-toggle');
    if (markerBtn) markerBtn.classList.add('active');
    ghAddStatusBadge();
    ghBuildWatchDock();
    ghBuildEventDock();
    ghBuildAlertModal();
  }

  async function ghLoadAllData() {
    const tasks = [
      ghJson(EVENTS_URL).then(x => { ghEvents = x; }).catch(e => console.warn('events load failed', e)),
      ghJson(RESULTS_URL).then(x => { ghResults = x; }).catch(e => console.warn('results load failed', e)),
      ghJson(FIIDII_URL).then(x => { ghFiiDii = x; }).catch(e => console.warn('fii/dii load failed', e)),
      ghJson(SENTIMENT_URL).then(x => { ghSentiment = x; }).catch(e => console.warn('sentiment load failed', e))
    ];
    await Promise.all(tasks);
    ghRenderEventDock();
    ghApplyMarkers();
  }

  async function fetchSymbolCandles(symbol) {
    const cleanSymbol = String(symbol || '').trim().toUpperCase();
    if (!cleanSymbol) throw new Error('Invalid symbol');

    if (window.symbolCandleCache && window.symbolCandleCache[cleanSymbol]) {
      return window.symbolCandleCache[cleanSymbol];
    }

    const url = `${DATA_BASE}${ghBucket(cleanSymbol)}/${encodeURIComponent(cleanSymbol)}.json`;
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub data unavailable for ${cleanSymbol} (HTTP ${response.status})`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : (payload.candles || payload.data || []);

    const candles = rows.filter(x => x && x.time && Number.isFinite(Number(x.close))).map(x => ({
      time: ghDate(x.time),
      open: Number(x.open ?? x.close),
      high: Number(x.high ?? x.close),
      low: Number(x.low ?? x.close),
      close: Number(x.close),
      volume: Number(x.volume || 0)
    })).filter(x => x.time).sort((a, b) => String(a.time).localeCompare(String(b.time)));

    if (!candles.length) throw new Error(`No candles found for ${cleanSymbol}`);
    window.symbolCandleCache = window.symbolCandleCache || {};
    window.symbolCandleCache[cleanSymbol] = candles;
    ghCheckAlerts(cleanSymbol, candles[candles.length - 1].close);
    return candles;
  }

  async function loadSymbolList() {
    try {
      const payload = await ghJson(SYMBOLS_URL);
      const symbols = Array.isArray(payload) ? payload : (payload.symbols || []);
      if (!symbols.length) throw new Error('No symbols returned from GitHub');
      window.allSymbols = symbols;

      if (typeof window.currentSymbol === 'string' && window.currentSymbol) {
        const found = symbols.find(x => x.symbol === window.currentSymbol);
        if (found && typeof window.loadSymbol === 'function') {
          await window.loadSymbol(found.symbol, found.name);
        }
      } else if (typeof window.loadSymbol === 'function') {
        await window.loadSymbol(symbols[0].symbol, symbols[0].name);
      }
    } catch (e) {
      console.error('GitHub symbol list failed', e);
      if (typeof window.showChartError === 'function') window.showChartError(e.message);
    }
  }

  async function fetchPriceBandsData() {
    try {
      const payload = await ghJson(PRICE_BANDS_URL);
      const rows = Array.isArray(payload) ? payload : (payload.records || payload.data || []);
      const map = {};
      rows.forEach(row => {
        const symbol = String(row.symbol || row.Symbol || row.SYMBOL || '').trim().toUpperCase();
        if (symbol) map[symbol] = row;
      });
      window.priceBandsMap = map;
    } catch (e) {
      console.warn('Price bands unavailable', e);
    }
  }

  function ghRefreshChartArtifacts() {
    ghApplyMarkers();
    try { if (typeof window.drawCanvasOverlays === 'function') window.drawCanvasOverlays(); } catch (e) {}
    try { if (typeof window.updateHeader === 'function') window.updateHeader(); } catch (e) {}
  }

  function ghPatchLivePolling() {
    try { if (typeof window.stopLivePoll === 'function') window.stopLivePoll(); } catch (e) {}
    window.startLivePoll = function() {};
    window.pollLiveOnce = async function() {
      if (!window.currentSymbol) return;
      try {
        const candles = await fetchSymbolCandles(window.currentSymbol);
        if (candles.length) ghCheckAlerts(window.currentSymbol, candles[candles.length - 1].close);
      } catch (e) {}
    };
    window.applyLivePrice = function() {};
  }

  function ghPatchLoadSymbol() {
    if (typeof window.loadSymbol !== 'function' || window.loadSymbol.__ghfxWrapped) return;
    const original = window.loadSymbol;
    const wrapped = async function(symbol, name, targetIdx) {
      const result = await original.call(this, symbol, name, targetIdx);
      try {
        await ghLoadAllData();
        ghRefreshChartArtifacts();
      } catch (e) {}
      return result;
    };
    wrapped.__ghfxWrapped = true;
    window.loadSymbol = wrapped;
  }

  function ghPatchDataFunctions() {
    window.fetchSymbolCandles = fetchSymbolCandles;
    window.loadSymbolList = loadSymbolList;
    window.fetchPriceBandsData = fetchPriceBandsData;
  }

  async function ghBoot() {
    ghPatchDataFunctions();
    ghPatchLivePolling();
    ghInjectControls();
    ghBuildEventDock();
    ghPatchLoadSymbol();

    await Promise.all([
      ghLoadAllData(),
      fetchPriceBandsData(),
      loadSymbolList()
    ]);

    ghBuildWatchDock();
    ghRenderWatchlists();
    ghRenderAlerts();
    ghRefreshChartArtifacts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ghBoot, { once: true });
  } else {
    ghBoot();
  }
})();
