/* ============ GOOGLE SHEET WATCHLISTS ============ */
async function watchlistApi(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${CHARTS_API_URL}?${qs.toString()}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

function setWatchlistStatus(msg, ok=false) {
  const el = document.getElementById('watchlist-status');
  if (el) { el.textContent = msg || ''; el.style.color = ok ? 'var(--green)' : 'var(--muted)'; }
}

function toggleWatchlistPanel(force) {
  const panel = document.getElementById('watchlist-panel');
  const dock = document.getElementById('watchlist-dock');
  if (!panel) return;
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  const shell = document.querySelector('.shell');
  if (shell) shell.classList.toggle('watchlist-open', open);
  if (dock) dock.classList.toggle('open', open);
  const sleek=document.getElementById('watchlist-sleek-toggle'); if(sleek){sleek.textContent=open?'›':'‹';sleek.title=open?'Hide Watchlist':'Show Watchlist';sleek.onclick=()=>toggleWatchlistPanel(!open);}
  if (open) renderWatchlists();
}

function escapeWatchText(s){ return escapeHtml(s == null ? '' : String(s)); }

function renderWatchlists(){
  const select = document.getElementById('watchlist-select');
  const body = document.getElementById('watchlist-body');
  if (!select || !body) return;
  if (!watchlists.length) {
    select.innerHTML = '<option value="">No watchlists</option>';
    body.innerHTML = '<div class="watch-empty">No watchlist yet.<br>Use <b>＋ Watchlist</b> to create one.</div>';
    return;
  }
  if (!watchlists.some(w => w.name === activeWatchlistName)) activeWatchlistName = watchlists[0].name;
  select.innerHTML = watchlists.map(w => `<option value="${escapeWatchText(w.name)}" ${w.name===activeWatchlistName?'selected':''}>${escapeWatchText(w.name)}</option>`).join('');
  const wl = watchlists.find(w => w.name === activeWatchlistName) || watchlists[0];
  body.innerHTML = '';
  (wl.sections || []).forEach(section => {
    const key = `${wl.name}::${section.name}`;
    const collapsed = !!collapsedWatchSections[key];
    const wrap = document.createElement('div');
    wrap.className = 'watch-section';
    const head = document.createElement('div');
    head.className = 'watch-section-head';
    head.innerHTML = `<span class="watch-chevron">${collapsed?'▶':'▼'}</span><span class="watch-section-name">${escapeWatchText(section.name)}</span><button type="button" class="watch-section-menu" title="Edit / Delete section">⋮</button>`;
    head.onclick = () => { collapsedWatchSections[key] = !collapsedWatchSections[key]; renderWatchlists(); };
    head.querySelector('.watch-section-menu').onclick = (e) => {
      e.stopPropagation();
      sectionMenuUI(section.name);
    };
    head.oncontextmenu = (e) => { e.preventDefault(); sectionMenuUI(section.name); };
    wrap.appendChild(head);
    if (!collapsed) {
      const items = document.createElement('div');
      items.className = 'watch-items';
      (section.items || []).forEach(item => {
        const row = document.createElement('div');
        row.className = 'watch-item' + (item.symbol === currentSymbol ? ' active' : '');
        row.innerHTML = `<span class="watch-sym">${escapeWatchText(item.symbol)}</span><span class="watch-name">${escapeWatchText(item.name || '')}</span><span class="watch-quote" data-watch-quote="${escapeWatchText(item.symbol)}"><span class="watch-price">—</span><span class="watch-change na">—</span></span><button class="watch-remove" title="Remove from section">×</button>`;
        row.onclick = () => loadSymbol(item.symbol, item.name || item.symbol, -1);
        row.querySelector('.watch-remove').onclick = async (e) => {
          e.stopPropagation();
          await mutateWatchlist('removeSymbol', {watchlist: wl.name, section: section.name, symbol: item.symbol});
        };
        items.appendChild(row);
      });
      if (!(section.items || []).length) {
        items.innerHTML = '<div class="watch-empty" style="padding:8px 4px;text-align:left;">Empty section</div>';
      }
      wrap.appendChild(items);
    }
    body.appendChild(wrap);
  });
  refreshWatchlistQuotes();
}

async function refreshWatchlistQuotes(){
  const nodes=[...document.querySelectorAll('#watchlist-body [data-watch-quote]')];
  const items=nodes.map(n=>({node:n,symbol:n.getAttribute('data-watch-quote')}));
  let cursor=0;
  const worker=async()=>{
    while(cursor<items.length){
      const idx=cursor++,it=items[idx];
      try{
        const raw=await fetchSymbolCandles(it.symbol,'stock');
        const d=aggregate(raw||[],'D')||[];
        const last=d[d.length-1],prev=d[d.length-2];
        if(last){
          const close=Number(last.close),pclose=prev?Number(prev.close):close;
          const chg=pclose?((close-pclose)/pclose*100):0;
          const pe=it.node.querySelector('.watch-price'),ce=it.node.querySelector('.watch-change');
          if(pe)pe.textContent=Number.isFinite(close)?`₹${close.toFixed(2)}`:'—';
          if(ce){ce.textContent=Number.isFinite(chg)?`${chg>=0?'+':''}${chg.toFixed(2)}%`:'—';ce.className=`watch-change ${chg>=0?'pos':'neg'}`;}
        }
      }catch(e){}
    }
  };
  await Promise.all(Array.from({length:Math.min(5,items.length)},worker));
}

function selectWatchlist(name){ activeWatchlistName = name; renderWatchlists(); }

async function refreshWatchlists(open=false){
  try {
    const data = await watchlistApi('getWatchlists');
    watchlists = Array.isArray(data.watchlists) ? data.watchlists : [];
    if (!activeWatchlistName && watchlists.length) activeWatchlistName = watchlists[0].name;
    renderWatchlists();
    if (open) toggleWatchlistPanel(true);
  } catch(e) { setWatchlistStatus('Watchlists unavailable: ' + e.message); }
}

async function mutateWatchlist(action, params){
  try {
    setWatchlistStatus('Saving…');
    await watchlistApi(action, params);
    await refreshWatchlists(false);
    setWatchlistStatus('Saved', true);
    setTimeout(() => setWatchlistStatus(''), 1200);
  } catch(e) { setWatchlistStatus('Error: ' + e.message); }
}

async function addWatchlistUI(){
  const name = prompt('New watchlist name:');
  if (!name || !name.trim()) return;
  await mutateWatchlist('addWatchlist', {name: name.trim()});
  activeWatchlistName = name.trim();
  renderWatchlists();
}

async function renameCurrentWatchlist(){
  if (!activeWatchlistName) return;
  const name = prompt('Rename watchlist:', activeWatchlistName);
  if (!name || !name.trim() || name.trim() === activeWatchlistName) return;
  const old = activeWatchlistName;
  await mutateWatchlist('renameWatchlist', {oldName: old, newName: name.trim()});
  activeWatchlistName = name.trim();
  renderWatchlists();
}

async function deleteCurrentWatchlist(){
  if (!activeWatchlistName) return;
  if (!confirm(`Delete watchlist “${activeWatchlistName}”?`)) return;
  const old = activeWatchlistName;
  await mutateWatchlist('deleteWatchlist', {name: old});
  activeWatchlistName = watchlists[0] ? watchlists[0].name : '';
  renderWatchlists();
}

async function addSectionUI(){
  if (!activeWatchlistName) { await addWatchlistUI(); if (!activeWatchlistName) return; }
  const name = prompt('New section name:');
  if (!name || !name.trim()) return;
  await mutateWatchlist('addSection', {watchlist: activeWatchlistName, section: name.trim()});
}

async function renameSectionUI(section){
  const name = prompt('Rename section:', section);
  if (!name || !name.trim() || name.trim() === section) return;
  await mutateWatchlist('renameSection', {watchlist: activeWatchlistName, oldSection: section, newSection: name.trim()});
}

async function deleteSectionUI(section){
  if (!confirm(`Delete section “${section}”?`)) return;
  await mutateWatchlist('deleteSection', {watchlist: activeWatchlistName, section});
}

function sectionMenuUI(section){
  const action = prompt(`Section: ${section}
Type R to rename or D to delete:`, 'R');
  if (!action) return;
  if (action.toUpperCase() === 'R') renameSectionUI(section);
  else if (action.toUpperCase() === 'D') deleteSectionUI(section);
}

async function addStockUI(){
  if (!activeWatchlistName) {
    await addWatchlistUI();
    if (!activeWatchlistName) return;
  }

  if (!allSymbols || !allSymbols.length) await loadSymbolList();
  if (!allSymbols || !allSymbols.length) {
    alert('Stock list could not be loaded.');
    return;
  }

  let wl = watchlists.find(w => w.name === activeWatchlistName);
  let sections = wl && Array.isArray(wl.sections) ? wl.sections : [];

  if (!sections.length) {
    await mutateWatchlist('addSection', {watchlist: activeWatchlistName, section:'General'});
    wl = watchlists.find(w => w.name === activeWatchlistName);
    sections = wl && Array.isArray(wl.sections) ? wl.sections : [];
  }

  const selectHtml = allSymbols.map((x,i)=>
    `<option value="${i}">${escapeWatchText(String(x.symbol))} — ${escapeWatchText(String(x.name||''))}</option>`
  ).join('');
  const sectionHtml = sections.map(s=>
    `<option value="${escapeWatchText(String(s.name))}">${escapeWatchText(String(s.name))}</option>`
  ).join('');

  const picker=document.createElement('div');
  picker.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;';
  picker.innerHTML=`
    <div style="width:min(500px,92vw);background:var(--surface,#111827);border:1px solid var(--border,#334155);border-radius:10px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45);">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;">Add Stock</div>
      <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:5px;">Section</label>
      <select id="watch-section-picker" style="width:100%;box-sizing:border-box;background:var(--card,#0f172a);color:var(--text,#fff);border:1px solid var(--border,#334155);border-radius:6px;padding:8px;font-size:12px;margin-bottom:12px;">${sectionHtml}</select>
      <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:5px;">Stock</label>
      <input id="watch-stock-search" type="text" placeholder="Search symbol or company name..." autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--card,#0f172a);color:var(--text,#fff);border:1px solid var(--border,#334155);border-radius:6px;padding:8px;font-size:12px;margin-bottom:8px;">
      <select id="watch-stock-picker" size="10" style="width:100%;background:var(--card,#0f172a);color:var(--text,#fff);border:1px solid var(--border,#334155);border-radius:6px;padding:7px;font-family:var(--mono,monospace);font-size:12px;">${selectHtml}</select>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button id="watch-stock-cancel" style="padding:7px 12px;">Cancel</button>
        <button id="watch-stock-add" style="padding:7px 14px;">Add Stock</button>
      </div>
    </div>`;
  document.body.appendChild(picker);

  const stockPicker=picker.querySelector('#watch-stock-picker');
  const searchInput=picker.querySelector('#watch-stock-search');
  searchInput.oninput=()=>{
    const q=searchInput.value.trim().toLowerCase();
    [...stockPicker.options].forEach(opt=>{
      const st=allSymbols[Number(opt.value)]||{};
      opt.hidden=!!q&&!`${st.symbol||''} ${st.name||''}`.toLowerCase().includes(q);
    });
    const first=[...stockPicker.options].find(o=>!o.hidden);
    if(first) stockPicker.value=first.value;
  };

  const close=()=>picker.remove();
  picker.querySelector('#watch-stock-cancel').onclick=close;
  picker.onclick=e=>{if(e.target===picker)close();};

  picker.querySelector('#watch-stock-add').onclick=async()=>{
    const found=allSymbols[Number(stockPicker.value)];
    const section=String(picker.querySelector('#watch-section-picker').value||'').trim();
    if(!found){alert('Please select a stock.');return;}
    if(!section){alert('Please select a section.');return;}
    close();
    await mutateWatchlist('addSymbol',{
      watchlist:activeWatchlistName,
      section,
      symbol:String(found.symbol).trim().toUpperCase(),
      name:String(found.name||found.symbol).trim()
    });
  };
}

function getDataBaseCandidates(){
  const candidates = [];
  try {
    candidates.push(new URL('../data/', location.href).href);
    candidates.push(new URL('data/', location.href).href);
  } catch(e) {}
  candidates.push('/data/');
  candidates.push('https://raw.githubusercontent.com/sumanmohit101-code/mickkk-market-data/main/data/');
  return [...new Set(candidates)];
}

let _dataBase = null; // jo base ek baar chal gaya use yaad rakho (404 par baar-baar 4 jagah try na ho)
async function fetchJsonFromCandidates(relativePath){
  const all = getDataBaseCandidates();
  const raw = all[all.length - 1]; // raw.githubusercontent.com
  const order = _dataBase ? [_dataBase, ...(raw !== _dataBase ? [raw] : [])] : all;
  let lastError = null;
  for (const base of order) {
    try {
      // no-cache = har baar server se poochta hai (ETag), par file badli na ho to download nahi hoti
      const res = await fetch(base + relativePath, {cache:'no-cache'});
      if (!res.ok) { lastError = new Error(`${res.status} ${res.statusText}`); continue; }
      if (base !== raw) _dataBase = base;
      return await res.json();
    } catch(e) { lastError = e; }
  }
  throw lastError || new Error('Unable to load repository data');
}

function normalizeStockList(raw){
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.symbols)) arr = raw.symbols;
  else if (raw && Array.isArray(raw.data)) arr = raw.data;
  else if (raw && Array.isArray(raw.stocks)) arr = raw.stocks;
  else if (raw && typeof raw === 'object') {
    // Accept catalogue objects keyed by symbol as a final fallback.
    arr = Object.entries(raw).map(([k,v]) => {
      if (v && typeof v === 'object') return {...v, symbol:v.symbol || v.Symbol || k};
      return {symbol:k,name:String(v||k)};
    });
  }
  return arr.map(x => ({
    symbol: String(x.symbol || x.Symbol || x.ticker || x.code || '').trim().toUpperCase(),
    name: String(x.name || x.companyName || x.company || x.company_name || x.Name || x.symbol || x.Symbol || '').trim(),
    type: 'stock'
  })).filter(x => x.symbol);
}

function normalizeIndexList(raw){
  const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.indices) ? raw.indices : []);
  return arr.map(x => ({
    symbol: String(x.symbol || x.Symbol || '').trim().toUpperCase(),
    name: String(x.name || x.indexName || x.symbol || '').trim(),
    yahoo: x.yahoo || '',
    type: 'index'
  })).filter(x => x.symbol);
}

function updateInstrumentCounts(){
  const s = document.getElementById('stock-count-badge');
  const i = document.getElementById('index-count-badge');
  if (s) s.textContent = allSymbols.length;
  if (i) i.textContent = allIndices.length;
}

async function loadSymbolList(){
  const applyStocks=(raw)=>{
    const stocks=normalizeStockList(raw);
    if(stocks.length) allSymbols=stocks;
    updateInstrumentCounts();
    populateRelativeStrengthIndexOptions();
  };
  const applyIndices=(raw)=>{
    const indices=normalizeIndexList(raw);
    if(indices.length) allIndices=indices;
    updateInstrumentCounts();
    populateRelativeStrengthIndexOptions();
  };

  try {
    // Disk cache first: the symbol/search UI becomes usable without waiting for GitHub.
    const [stockRaw,indexRaw]=await Promise.all([
      fetchGithubDataJsonCached(['symbols.json'],'catalog:symbols',applyStocks),
      fetchGithubDataJsonCached(['indices.json'],'catalog:indices',applyIndices)
    ]);
    if(stockRaw) applyStocks(stockRaw);
    if(indexRaw) applyIndices(indexRaw);

    // If this is a cold cache, the calls above fetched from GitHub. On a warm cache
    // stale entries are refreshed in the background by fetchGithubDataJsonCached().
    if(allSymbols.length && !currentSymbol) {
      loadSymbol(allSymbols[0].symbol,allSymbols[0].name,-1,'stock');
    }
    refreshWatchlists(false);
  } catch(e) {
    updateInstrumentCounts();
    refreshWatchlists(false);
    console.warn('Static instrument catalogue load failed:',e);
  }
}

function setSearchMode(mode){
  searchMode = mode === 'index' ? 'index' : 'stock';
  document.getElementById('tab-stocks')?.classList.toggle('active', searchMode === 'stock');
  document.getElementById('tab-indices')?.classList.toggle('active', searchMode === 'index');
  const input = document.getElementById('modal-search-input');
  if (input) input.placeholder = searchMode === 'index' ? '🔍 Search index (e.g. NIFTY 50)...' : '🔍 Search stock symbol or company name...';
  filterSearchModal();
}

function openCompareSearch(panelIndex, preferredType){
  compareSearchPanelIndex=Number(panelIndex);
  const panel=panelsArray[compareSearchPanelIndex] || panelsArray[0];
  if(!panel){compareSearchPanelIndex=-1;return;}
  searchTargetPanelIndex=-1;
  openSearchModal(-1,'');
  setSearchMode(preferredType === 'index' ? 'index' : 'stock');
  const input=document.getElementById('modal-search-input');
  if(input){input.placeholder=searchMode==='index'?'🔍 Search index to compare...':'🔍 Search stock to compare...'; input.value=''; input.focus();}
  renderSearchModalResults(searchMode === 'index' ? allIndices : allSymbols);
}

function openSearchModal(targetPanelIdx, initialChar = ''){
  searchTargetPanelIndex = targetPanelIdx !== undefined ? targetPanelIdx : -1;
  const modal = document.getElementById('search-modal');
  if (modal) modal.classList.add('open');
  modalHighlightIdx = -1;
  
  const input = document.getElementById('modal-search-input');
  if (compareSearchPanelIndex >= 0 && panelsArray[compareSearchPanelIndex]) {
    if (searchMode !== 'index') setSearchMode('stock');
  } else {
    setSearchMode(searchTargetPanelIndex >= 0 && panelsArray[searchTargetPanelIndex] ? (panelsArray[searchTargetPanelIndex].instrumentType || 'stock') : currentInstrumentType);
  }
  
  // Puraani query ko poora saaf karke naye letter se start karega
  if (input) {
    input.value = initialChar || '';
    setTimeout(() => {
      input.focus();
      if (input.value) {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 25);
  }

  updateInstrumentCounts();
  if (initialChar) {
    filterSearchModal();
  } else {
    renderSearchModalResults(searchMode === 'index' ? allIndices : allSymbols);
  }
}

function closeSearchModal(){ 
  const modal = document.getElementById('search-modal');
  if (modal) modal.classList.remove('open');
  modalHighlightIdx = -1;
  compareSearchPanelIndex = -1;
  
  // Modal band hote hi input box aur focus dono reset ho jayenge
  const input = document.getElementById('modal-search-input');
  if (input) {
    input.value = '';
    input.blur();
  }
}
function filterSearchModal(){
  modalHighlightIdx = -1;
  const input = document.getElementById('modal-search-input');
  const q = input ? input.value.toLowerCase().trim() : '';
  const source = searchMode === 'index' ? allIndices : allSymbols;
  let list = source;
  if (q) {
    list = list.filter(s => (s.name && s.name.toLowerCase().includes(q)) || (s.symbol && s.symbol.toLowerCase().includes(q)));
  }
  renderSearchModalResults(list);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderSearchModalResults(list) {
  const el = document.getElementById('modal-search-results');
  if (!el) return;
  if (!list || !list.length) { el.innerHTML = `<div class="symbol-empty">No ${searchMode === 'index' ? 'indices' : 'stocks'} found</div>`; return; }

  el.innerHTML = list.map(s => `
    <div class="search-row-item" data-sym="${escapeHtml(s.symbol)}">
      <span class="s-name"><span style="font-size:9px;color:var(--accent);font-family:var(--mono);margin-right:6px;">${searchMode === 'index' ? 'IDX' : 'EQ'}</span>${escapeHtml(s.name)}</span>
      <span class="s-sym">${escapeHtml(s.symbol)}</span>
    </div>
  `).join('');

  el.querySelectorAll('.search-row-item').forEach(item => {
    item.addEventListener('click', () => {
      const sym = item.getAttribute('data-sym');
      const source = searchMode === 'index' ? allIndices : allSymbols;
      const found = source.find(x => x.symbol === sym);
      if (found) {
        if (compareSearchPanelIndex >= 0) {
          const targetCompare=compareSearchPanelIndex;
          compareSearchPanelIndex=-1;
          closeSearchModal();
          addCompareSymbol(targetCompare, found.symbol, found.name, searchMode);
        } else {
          loadSymbol(found.symbol, found.name, searchTargetPanelIndex, searchMode);
        }
      }
    });
  });
}

