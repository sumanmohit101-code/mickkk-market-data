(() => {
  'use strict';

  const DATA_URL = './data/results.json';
  let resultData = null;
  let resultTab = 'today';

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
  })[m]);

  const prettyDate = value => {
    if (!value) return '—';
    const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  function rowsForTab(tab) {
    if (!resultData) return [];
    if (tab === 'today') return Array.isArray(resultData.today) ? resultData.today : [];
    if (tab === 'tomorrow') return Array.isArray(resultData.tomorrow) ? resultData.tomorrow : [];
    if (tab === 'week') return Array.isArray(resultData.thisWeek) ? resultData.thisWeek : [];
    return Array.isArray(resultData.allUpcoming) ? resultData.allUpcoming : [];
  }

  function sortRows(rows) {
    return rows.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.symbol || '').localeCompare(String(b.symbol || '')));
  }

  function buildUI() {
    if (document.getElementById('mickkk-results-btn')) return;

    const style = document.createElement('style');
    style.id = 'mickkk-results-view-style';
    style.textContent = `
      #mickkk-results-btn{margin-left:6px}
      #mickkk-results-modal{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.68);display:none;align-items:center;justify-content:center;padding:20px}
      #mickkk-results-modal.open{display:flex}
      .mrv-box{width:min(900px,96vw);max-height:88vh;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column}
      .mrv-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);font-family:var(--mono)}
      .mrv-title{font-size:14px;font-weight:700;color:var(--accent)}
      .mrv-tabs{display:flex;gap:5px;padding:8px 10px;border-bottom:1px solid var(--border);overflow:auto}
      .mrv-tab{background:var(--card);color:var(--muted);border:1px solid var(--border);border-radius:5px;padding:5px 10px;font:700 10px var(--mono);cursor:pointer;white-space:nowrap}
      .mrv-tab.active,.mrv-tab:hover{color:var(--accent);border-color:var(--accent);background:rgba(0,212,255,.08)}
      .mrv-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:9px;border-bottom:1px solid var(--border)}
      .mrv-card{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:7px}.mrv-card .k{font-size:9px;color:var(--muted)}.mrv-card .v{font:700 13px var(--mono);margin-top:3px;color:var(--text)}
      .mrv-body{overflow:auto;padding:10px}
      .mrv-row{display:grid;grid-template-columns:90px 120px 1fr;gap:10px;align-items:center;padding:7px 8px;border-bottom:1px solid var(--border);font-size:10px}
      .mrv-row .date{font-family:var(--mono);color:var(--accent)}.mrv-row .sym{font-family:var(--mono);font-weight:700;color:var(--text)}.mrv-row .purpose{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mrv-empty{text-align:center;color:var(--muted);padding:30px 10px;font-size:11px}
      .mrv-filter{margin-left:auto;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:5px 8px;font-size:10px;outline:none;min-width:150px}
      @media(max-width:700px){.mrv-summary{grid-template-columns:repeat(2,1fr)}.mrv-row{grid-template-columns:82px 96px 1fr}.mrv-filter{min-width:120px}}
    `;
    document.head.appendChild(style);

    const topRight = document.querySelector('.topRight') || document.querySelector('.toolbar');
    if (topRight) {
      const btn = document.createElement('button');
      btn.id = 'mickkk-results-btn';
      btn.className = 'btn';
      btn.textContent = '📊 Results';
      btn.title = 'Daily / Tomorrow / This Week / Upcoming results';
      btn.onclick = () => openResultsViewer();
      topRight.appendChild(btn);
    }

    const modal = document.createElement('div');
    modal.id = 'mickkk-results-modal';
    modal.innerHTML = `
      <div class="mrv-box">
        <div class="mrv-head">
          <div class="mrv-title">📊 NSE RESULTS CALENDAR</div>
          <button class="btn" id="mrv-close">Close</button>
        </div>
        <div class="mrv-tabs">
          <button class="mrv-tab active" data-tab="today">Today</button>
          <button class="mrv-tab" data-tab="tomorrow">Tomorrow</button>
          <button class="mrv-tab" data-tab="week">This Week</button>
          <button class="mrv-tab" data-tab="all">All Upcoming</button>
          <input id="mrv-filter" class="mrv-filter" placeholder="Filter symbol / company">
        </div>
        <div id="mrv-summary" class="mrv-summary"></div>
        <div id="mrv-body" class="mrv-body"></div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('mrv-close').onclick = closeResultsViewer;
    modal.addEventListener('click', e => { if (e.target === modal) closeResultsViewer(); });
    modal.querySelectorAll('.mrv-tab').forEach(btn => {
      btn.onclick = () => {
        resultTab = btn.dataset.tab;
        modal.querySelectorAll('.mrv-tab').forEach(x => x.classList.toggle('active', x === btn));
        renderResultsViewer();
      };
    });
    document.getElementById('mrv-filter').addEventListener('input', renderResultsViewer);
  }

  async function loadResults() {
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`results.json HTTP ${response.status}`);
      resultData = await response.json();
      renderResultsViewer();
    } catch (error) {
      const body = document.getElementById('mrv-body');
      if (body) body.innerHTML = `<div class="mrv-empty">Results data unavailable right now.<br>${esc(error.message)}</div>`;
    }
  }

  function renderResultsViewer() {
    if (!resultData) return;

    const rows = sortRows(rowsForTab(resultTab));
    const filter = (document.getElementById('mrv-filter')?.value || '').trim().toLowerCase();
    const filtered = filter ? rows.filter(r => `${r.symbol || ''} ${r.company || ''} ${r.purpose || ''} ${r.description || ''}`.toLowerCase().includes(filter)) : rows;

    const summary = document.getElementById('mrv-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="mrv-card"><div class="k">Today</div><div class="v">${Array.isArray(resultData.today) ? resultData.today.length : 0}</div></div>
        <div class="mrv-card"><div class="k">Tomorrow</div><div class="v">${Array.isArray(resultData.tomorrow) ? resultData.tomorrow.length : 0}</div></div>
        <div class="mrv-card"><div class="k">This Week</div><div class="v">${Array.isArray(resultData.thisWeek) ? resultData.thisWeek.length : 0}</div></div>
        <div class="mrv-card"><div class="k">All Upcoming</div><div class="v">${Array.isArray(resultData.allUpcoming) ? resultData.allUpcoming.length : 0}</div></div>
      `;
    }

    const body = document.getElementById('mrv-body');
    if (!body) return;
    if (!filtered.length) {
      body.innerHTML = '<div class="mrv-empty">No results found for this period.</div>';
      return;
    }

    body.innerHTML = filtered.map(r => `
      <div class="mrv-row" title="${esc(r.description || r.purpose || '')}">
        <div class="date">${prettyDate(r.date)}</div>
        <div class="sym">${esc(r.symbol)}</div>
        <div class="purpose">${esc(r.company || '')}${r.purpose ? ' · ' + esc(r.purpose) : ''}</div>
      </div>
    `).join('');
  }

  function openResultsViewer() {
    buildUI();
    document.getElementById('mickkk-results-modal').classList.add('open');
    if (resultData) renderResultsViewer();
    else loadResults();
  }

  function closeResultsViewer() {
    document.getElementById('mickkk-results-modal')?.classList.remove('open');
  }

  buildUI();
  loadResults();
})();
