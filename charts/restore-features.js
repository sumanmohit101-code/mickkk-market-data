/* MICKKK_CHART_RESTORE_V1 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const L = window.LightweightCharts;
  if (!L) return;

  const css = document.createElement('style');
  css.textContent = `
  .mcr-tools{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-left:4px}
  .mcr-tools .btn{white-space:nowrap}
  .mcr-hidden{display:none!important}
  .mcr-side-hide .side{display:none!important}.mcr-side-hide .main{width:100%}
  .mcr-nav{display:flex;gap:3px}.mcr-nav button{min-width:28px}
  .mcr-ind-panel{position:absolute;right:8px;top:46px;z-index:80;width:250px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px;box-shadow:0 12px 35px rgba(0,0,0,.35)}
  .mcr-ind-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}.mcr-ind-grid label{font-size:10px;color:var(--muted);display:flex;gap:5px;align-items:center}
  .mcr-pick{max-height:240px;overflow:auto;margin-top:6px;border-top:1px solid var(--border)}
  .mcr-pick div{padding:5px 6px;font-size:10px;cursor:pointer;border-bottom:1px solid var(--border)}.mcr-pick div:hover{background:var(--card2)}
  .mcr-direct{position:relative;display:flex;gap:4px;align-items:center}.mcr-direct input{width:150px}.mcr-count{font-size:9px;color:var(--muted)}
  .mcr-pane{position:absolute;left:0;right:0;bottom:0;height:170px;border-top:1px solid var(--border);display:none;background:var(--bg)}.mcr-pane.open{display:block}.mcr-pane-chart{position:absolute;inset:0}
  `;
  document.head.appendChild(css);

  let baseReady = false;
  let originalDraw = null;
  let paneChart = null, paneSeries = null;
  let overlayLines = {};
  let indicatorState = JSON.parse(localStorage.getItem('MICKKK_INDICATORS_V1') || 'null') || {
    EMA9:false, EMA20:false, EMA50:false, EMA100:false, EMA200:false,
    SMA20:false, SMA50:false, SMA200:false, BB20:false, VWAP:false, RSI:false, MACD:false
  };

  const fmt = v => Number(v).toFixed(2);
  function seriesCalc(a, n, kind){
    if (!a.length) return [];
    if (kind === 'SMA') {
      let sum=0; const q=[]; return a.map(c => { sum += Number(c.close); q.push(Number(c.close)); if(q.length>n) sum-=q.shift(); return {time:c.time,value:q.length===n?sum/n:NaN}; }).filter(x=>Number.isFinite(x.value));
    }
    let k=2/(n+1), v=Number(a[0].close);
    return a.map(c => ({time:c.time,value:(v=v*k+Number(c.close)*(1-k))}));
  }
  function bb(a,n=20,m=2){
    const outU=[],outL=[];
    for(let i=n-1;i<a.length;i++){
      const vals=a.slice(i-n+1,i+1).map(x=>Number(x.close)); const mean=vals.reduce((s,x)=>s+x,0)/n;
      const sd=Math.sqrt(vals.reduce((s,x)=>s+(x-mean)**2,0)/n); outU.push({time:a[i].time,value:mean+m*sd}); outL.push({time:a[i].time,value:mean-m*sd});
    }
    return [outU,outL];
  }
  function vwap(a){
    let pv=0, vv=0; return a.map(c=>{const vol=Number(c.volume||0);const tp=(Number(c.high)+Number(c.low)+Number(c.close))/3; pv+=tp*vol; vv+=vol; return {time:c.time,value:vv?pv/vv:tp};});
  }
  function rsi(a,n=14){
    if(a.length<=n)return [];
    let gain=0,loss=0; for(let i=1;i<=n;i++){const d=a[i].close-a[i-1].close; if(d>=0)gain+=d;else loss-=d;}
    gain/=n;loss/=n; const out=[]; const firstLoss=loss; let rs=firstLoss?gain/firstLoss:100; out.push({time:a[n].time,value:100-(100/(1+rs))});
    for(let i=n+1;i<a.length;i++){const d=a[i].close-a[i-1].close,g=Math.max(d,0),l=Math.max(-d,0);gain=(gain*(n-1)+g)/n;loss=(loss*(n-1)+l)/n;rs=loss?gain/loss:100;out.push({time:a[i].time,value:100-(100/(1+rs))});}
    return out;
  }
  function macd(a){
    const e12=seriesCalc(a,12,'EMA'), e26=seriesCalc(a,26,'EMA'), map12=new Map(e12.map(x=>[x.time,x.value])), map26=new Map(e26.map(x=>[x.time,x.value]));
    const line=[]; e26.forEach(x=>{if(map12.has(x.time))line.push({time:x.time,value:map12.get(x.time)-x.value});});
    let s=0,k=2/(9+1); const sig=[]; line.forEach((x,i)=>{s=i===0?x.value:s*k+x.value*(1-k);sig.push({time:x.time,value:s});}); return [line,sig];
  }

  function ensureControls(){
    if (document.getElementById('mcr-tools')) return;
    const toolbar=document.querySelector('.toolbar'); if(!toolbar)return;
    const tools=document.createElement('div'); tools.id='mcr-tools'; tools.className='mcr-tools';
    tools.innerHTML=`
      <div class="mcr-nav"><button class="btn" id="mcr-prev">◀</button><button class="btn" id="mcr-next">▶</button></div>
      <button class="btn" id="mcr-watch-hide">Hide Watchlist</button>
      <button class="btn" id="mcr-ind">Indicators</button>
      <button class="btn" id="mcr-bar">Bar</button>
      <span class="mcr-count" id="mcr-count"></span>
      <div class="mcr-direct"><input class="inp" id="mcr-direct-input" list="mcr-symbol-list" placeholder="Type symbol…"><button class="btn" id="mcr-go">Go</button><datalist id="mcr-symbol-list"></datalist></div>
    `;
    toolbar.appendChild(tools);
    const pane=document.createElement('div'); pane.id='mcr-pane'; pane.className='mcr-pane'; pane.innerHTML='<div id="mcr-pane-chart" class="mcr-pane-chart"></div>'; document.querySelector('.chartArea').appendChild(pane);

    const ind=document.createElement('div'); ind.id='mcr-ind-panel'; ind.className='mcr-ind-panel mcr-hidden';
    const names=['EMA9','EMA20','EMA50','EMA100','EMA200','SMA20','SMA50','SMA200','BB20','VWAP','RSI','MACD'];
    ind.innerHTML='<div style="font:700 11px var(--mono);color:var(--accent);margin-bottom:6px">Indicators</div><div class="mcr-ind-grid">'+names.map(n=>`<label><input type="checkbox" data-ind="${n}" ${indicatorState[n]?'checked':''}>${n}</label>`).join('')+'</div>';
    document.querySelector('.chartArea').appendChild(ind);

    $('mcr-ind').onclick=()=>ind.classList.toggle('mcr-hidden');
    ind.querySelectorAll('input[data-ind]').forEach(x=>x.onchange=()=>{indicatorState[x.dataset.ind]=x.checked;localStorage.setItem('MICKKK_INDICATORS_V1',JSON.stringify(indicatorState));refreshIndicators();});
    $('mcr-prev').onclick=()=>nav(-1); $('mcr-next').onclick=()=>nav(1);
    $('mcr-go').onclick=directGo; $('mcr-direct-input').addEventListener('keydown',e=>{if(e.key==='Enter')directGo();});
    $('mcr-watch-hide').onclick=toggleWatch;
    $('mcr-bar').onclick=()=>window.setChartType('bar',$('mcr-bar'));
  }
  function toggleWatch(){document.body.classList.toggle('mcr-side-hide');$('mcr-watch-hide').textContent=document.body.classList.contains('mcr-side-hide')?'Show Watchlist':'Hide Watchlist';}
  function nav(dir){ if(!Array.isArray(window.symbols)||!window.symbols.length)return; let i=window.symbols.findIndex(x=>x.symbol===window.currentSymbol); if(i<0)i=0; i=(i+dir+window.symbols.length)%window.symbols.length; const x=window.symbols[i]; window.loadSymbol(x.symbol,x.name); }
  function directGo(){
    const q=String($('mcr-direct-input').value||'').trim().toUpperCase(); if(!q)return;
    const exact=window.symbols.find(x=>x.symbol.toUpperCase()===q); const part=window.symbols.find(x=>x.symbol.toUpperCase().includes(q)||String(x.name).toUpperCase().includes(q));
    const x=exact||part; if(x)window.loadSymbol(x.symbol,x.name); else alert('Symbol not found in full NSE symbol list: '+q);
  }
  function patchSearch(){
    window.renderSearch=function(){
      const q=String($('search').value||'').toLowerCase();
      const matches=window.symbols.filter(s=>(s.symbol+' '+s.name).toLowerCase().includes(q));
      $('symbolSelect').innerHTML=window.symbols.map(x=>`<option value="${String(x.symbol).replace(/"/g,'&quot;')}" ${x.symbol===window.currentSymbol?'selected':''}>${x.symbol} — ${x.name}</option>`).join('');
      $('mcr-symbol-list').innerHTML=window.symbols.map(x=>`<option value="${String(x.symbol).replace(/"/g,'&quot;')}">${String(x.name).replace(/"/g,'&quot;')}</option>`).join('');
      $('mcr-count').textContent=`${window.symbols.length.toLocaleString()} symbols · ${matches.length} match`;
    };
  }
  function patchChartType(){
    window.setChartType=function(v,b){
      window.chartType=v; document.querySelectorAll('.toolbar .btn').forEach(x=>{if(['Candle','Line','Bar'].includes(x.textContent))x.classList.remove('active')}); if(b)b.classList.add('active');
      try{ if(window.series) window.chart.removeSeries(window.series); }catch(e){}
      if(v==='line') window.series=window.chart.addLineSeries({color:'#00d4ff',lineWidth:2});
      else if(v==='bar') window.series=window.chart.addBarSeries({upColor:'#00e676',downColor:'#ff3d5a',openVisible:true,thinBars:false});
      else window.series=window.chart.addCandlestickSeries({upColor:'#00e676',downColor:'#ff3d5a',borderUpColor:'#00e676',borderDownColor:'#ff3d5a',wickUpColor:'#00e676',wickDownColor:'#ff3d5a'});
      refreshMain();
    };
  }
  function refreshMain(){ if(typeof window.draw==='function')window.draw(); refreshIndicators(); }
  function refreshIndicators(){
    if(!window.chart||!window.raw||!window.raw.length)return; const data=window.aggregate(window.raw,window.tf); const active=[];
    Object.values(overlayLines).forEach(s=>{try{window.chart.removeSeries(s)}catch(e){}}); overlayLines={};
    const add=(name,rows, color)=>{overlayLines[name]=window.chart.addLineSeries({color,lineWidth:1,priceLineVisible:false,lastValueVisible:false});overlayLines[name].setData(rows);};
    if(indicatorState.EMA9)add('EMA9',seriesCalc(data,9,'EMA'),'#ff52e2');
    if(indicatorState.EMA20)add('EMA20',seriesCalc(data,20,'EMA'),'#00d4ff');
    if(indicatorState.EMA50)add('EMA50',seriesCalc(data,50,'EMA'),'#ffab00');
    if(indicatorState.EMA100)add('EMA100',seriesCalc(data,100,'EMA'),'#7dd3fc');
    if(indicatorState.EMA200)add('EMA200',seriesCalc(data,200,'EMA'),'#a78bfa');
    if(indicatorState.SMA20)add('SMA20',seriesCalc(data,20,'SMA'),'#22c55e');
    if(indicatorState.SMA50)add('SMA50',seriesCalc(data,50,'SMA'),'#f97316');
    if(indicatorState.SMA200)add('SMA200',seriesCalc(data,200,'SMA'),'#ef4444');
    if(indicatorState.BB20){const [u,l]=bb(data);add('BBU',u,'#38bdf8');add('BBL',l,'#38bdf8');}
    if(indicatorState.VWAP)add('VWAP',vwap(data),'#e879f9');
    const needPane=indicatorState.RSI||indicatorState.MACD; const pane=$('mcr-pane'), area=document.querySelector('.chartArea'); if(!needPane){pane.classList.remove('open'); if(window.chart)document.getElementById('chart').style.bottom='0'; if(paneChart){paneChart.remove();paneChart=null;paneSeries=null;}return;}
    pane.classList.add('open'); document.getElementById('chart').style.bottom='170px';
    if(!paneChart) paneChart=L.createChart($('mcr-pane-chart'),{layout:{background:{color:'transparent'},textColor:'#8a9ab0'},grid:{vertLines:{color:'#18212c'},horzLines:{color:'#18212c'}},rightPriceScale:{borderColor:'#1e2d3d'},timeScale:{borderColor:'#1e2d3d'},autoSize:true});
    try{if(paneSeries)paneChart.removeSeries(paneSeries)}catch(e){} paneSeries=paneChart.addLineSeries({color:indicatorState.MACD?'#00d4ff':'#ffab00',lineWidth:2});
    let paneData=[]; if(indicatorState.MACD)paneData=macd(data)[0]; else paneData=rsi(data); paneSeries.setData(paneData); if(indicatorState.MACD){const sig=paneSeries._mcrSig; try{if(sig)paneChart.removeSeries(sig)}catch(e){} paneSeries._mcrSig=paneChart.addLineSeries({color:'#ffab00',lineWidth:1}); paneSeries._mcrSig.setData(macd(data)[1]);}
    paneChart.timeScale().fitContent();
  }
  function patchDraw(){
    if(window.__mcrDrawPatched)return; window.__mcrDrawPatched=true; originalDraw=window.draw;
    window.draw=function(){
      if(!window.raw||!window.raw.length)return; let data=window.aggregate(window.raw,window.tf); const days=window.range==='1M'?31:window.range==='3M'?93:window.range==='6M'?186:window.range==='1Y'?365:Infinity; if(isFinite(days))data=data.slice(-days);
      if(window.chartType==='line')window.series.setData(data.map(x=>({time:x.time,value:Number(x.close)})));
      else window.series.setData(data.map(x=>({time:x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close})));
      if(window.volumeSeries)window.volumeSeries.setData(data.map(x=>({time:x.time,value:+x.volume||0,color:x.close>=x.open?'#00e67655':'#ff3d5a55'})));
      if(typeof window.updateHeader==='function')window.updateHeader(data[data.length-1],data[data.length-2]||data[data.length-1]);
      try{window.series.setMarkers(window.eventMarkers(data))}catch(e){}
      try{window.chart.timeScale().fitContent()}catch(e){}
      refreshIndicators();
    };
  }
  function patchSelect(){
    window.selectSymbol=function(s){const x=window.symbols.find(z=>z.symbol===s)||{symbol:s,name:s};window.loadSymbol(x.symbol,x.name);};
  }
  function patchLoad(){
    if(window.loadSymbol.__mcrWrapped)return; const orig=window.loadSymbol;
    window.loadSymbol=async function(s,n){const r=await orig.call(this,s,n); try{window.renderSearch();}catch(e){} try{refreshIndicators();}catch(e){} return r;}; window.loadSymbol.__mcrWrapped=true;
  }
  function boot(){
    if(!window.chart||!window.symbols||!window.symbols.length){setTimeout(boot,300);return;} ensureControls(); patchSearch(); patchSelect(); patchChartType(); patchDraw(); patchLoad(); window.renderSearch(); refreshIndicators();
    $('mcr-direct-input').value=window.currentSymbol||'';
  }
  setTimeout(boot,700);
})();
