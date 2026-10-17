/* ============ MERGED INFO CARD (52W + EMAs + ATR + CIRCUIT BANDS + GSM SURVEILLANCE) ============ */
function renderCombinedInfoCard(data){
  return renderCombinedInfoCardForPanel(data, panelsArray[0]);
}

function formatCompactResultDate(dateStr){
  const d=formatToDateOnly(dateStr); if(!d)return '—';
  try{return d.slice(0,10).split('-').reverse().slice(0,2).join(' ');}catch(e){return d;}
}

function getResultDateSummary(symbol){
  const rows=(getResultsForSymbol(symbol)||[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  if(!rows.length)return {next:'—',last:'—'};
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  const future=rows.find(r=>String(r.date)>today);
  const past=rows.filter(r=>String(r.date)<=today);
  return {next:future?formatCompactResultDate(future.date):'—',last:past.length?formatCompactResultDate(past[past.length-1].date):'—'};
}

/* ============ MERGED INFO CARD (COMPACT) ============ */
function renderCombinedInfoCard(data){ return renderCombinedInfoCardForPanel(data, panelsArray[0]); }

function renderCombinedInfoCardForPanel(data, panel){
  if(!data||!data.length)return;
  const infoCard=document.getElementById('widget-combined-info');if(!infoCard)return;
  if(!activeIndicators.tables){infoCard.style.display='none';return;}
  infoCard.style.display='flex';
  try{
    const last=data[data.length-1],close=Number(last.close);
    let high52=0,low52=Infinity;const len52=Math.min(data.length,252);
    for(let i=Math.max(0,data.length-len52);i<data.length;i++){high52=Math.max(high52,Number(data[i].high));low52=Math.min(low52,Number(data[i].low));}
    const pHigh52=high52?((close-high52)/high52)*100:0,pLow52=low52!==Infinity?((close-low52)/low52)*100:0;
    const getEMAVal=p=>calculateEMAValues(data,p).at(-1)||0;
    const e10=getEMAVal(10),e20=getEMAVal(20),e50=getEMAVal(50),e200=getEMAVal(200);
    const d10=e10?((close-e10)/e10)*100:0,d20=e20?((close-e20)/e20)*100:0,d50=e50?((close-e50)/e50)*100:0,d200=e200?((close-e200)/e200)*100:0;
    const atrPeriod=Math.max(1,Number(infoAtrLength)||14),atr=Number((calculateATRValues(data,atrPeriod)||[]).at(-1)||0),atrPct=close?(atr/close)*100:0;
    const bandInfo=getPriceBandForSymbol(panel?.symbol||currentSymbol),bandChanges=getBandChangesForSymbol(panel?.symbol||currentSymbol),latestBandChange=bandChanges.length?bandChanges[bandChanges.length-1]:null;
    const rawBand=bandInfo?bandInfo.band:'20',bandDisplay=(rawBand==='NO BAND'||rawBand==='20')?'20%':`${rawBand}%`,bandBadgeColor=(rawBand==='2'||rawBand==='5'||rawBand==='10')?'bg-amber':'bg-pos';
    const remarks=bandInfo?(bandInfo.remarks||'').trim():'';const isSurveillance=remarks&&remarks!=='-'&&remarks.toUpperCase()!=='NONE';
    const result=getResultDateSummary(panel?.symbol||currentSymbol);
    infoCard.innerHTML=`
      <div class="info-card-group">
        <div class="info-row"><span>52W H</span><span class="widget-badge ${pHigh52>=0?'bg-pos':'bg-neg'}">${pHigh52>=0?'+':''}${pHigh52.toFixed(1)}%</span></div>
        <div class="info-row"><span>52W L</span><span class="widget-badge ${pLow52>=0?'bg-pos':'bg-neg'}">${pLow52>=0?'+':''}${pLow52.toFixed(1)}%</span></div>
      </div>
      <div class="info-card-group">
        <div class="info-row"><span>EMA10</span><span class="widget-badge ${d10>=0?'bg-pos':'bg-neg'}">${d10>=0?'+':''}${d10.toFixed(1)}%</span></div>
        <div class="info-row"><span>EMA20</span><span class="widget-badge ${d20>=0?'bg-pos':'bg-neg'}">${d20>=0?'+':''}${d20.toFixed(1)}%</span></div>
        <div class="info-row"><span>EMA50</span><span class="widget-badge ${d50>=0?'bg-pos':'bg-neg'}">${d50>=0?'+':''}${d50.toFixed(1)}%</span></div>
        <div class="info-row"><span>EMA200</span><span class="widget-badge ${d200>=0?'bg-pos':'bg-neg'}">${d200>=0?'+':''}${d200.toFixed(1)}%</span></div>
      </div>
      <div class="info-card-group">
        <div class="info-row"><span>Circuit</span><span class="widget-badge ${bandBadgeColor}">${bandDisplay}</span></div>
        ${latestBandChange?`<div class="info-row"><span>Band</span><span class="widget-badge bg-amber">${escapeHtml((latestBandChange.from&&latestBandChange.to)?`${latestBandChange.from}→${latestBandChange.to}`:(latestBandChange.to||latestBandChange.from||'—'))}</span></div>`:''}
      </div>
      <div class="info-card-group">
        <div class="info-card-result"><b>Result date:</b> ${result.next}</div>
        <div class="info-card-result"><b>Last result:</b> ${result.last}</div>
        ${isSurveillance?`<div class="info-card-result"><b>GSM:</b> ${escapeHtml(remarks)}</div>`:''}
      </div>
      <div class="info-card-group">
        <div class="info-card-footer">ATR(${atrPeriod}) = ${atr.toFixed(2)} (${atrPct.toFixed(1)}%)</div>
      </div>`;
  }catch(e){console.warn('Info card render error',e);}
}

/* ============ VIEWPORT ZOOMING ============ */
function applyRangeToPanel(panel, data) {
  if (!panel || !data || !data.length) return;
  if (currentRange === 'ALL') {
    [panel.priceChart, panel.rsiChart, panel.rsChart, panel.macdChart, panel.axisChart].forEach(c => { try { c.timeScale().fitContent(); } catch(e){} });
    return;
  }

  let bars = data.length;
  if (currentRange === '1M') bars = 22;
  else if (currentRange === '3M') bars = 65;
  else if (currentRange === '6M') bars = 130;
  else if (currentRange === '1Y') bars = 252;

  // Screenshot ki tarah Y-axis se 65 bars ka clean space/gap dega
  const rightMarginBars = 65;

  try {
    const range = { 
      from: Math.max(0, data.length - bars), 
      to: (data.length - 1) + rightMarginBars 
    };
    [panel.priceChart, panel.rsiChart, panel.rsChart, panel.macdChart, panel.axisChart].forEach(c => {
      if (c) {
        try { 
          c.timeScale().applyOptions({ rightOffset: rightMarginBars });
          c.timeScale().setVisibleLogicalRange(range); 
        } catch(e){}
      }
    });
  } catch(e) {
    [panel.priceChart, panel.rsiChart, panel.rsChart, panel.macdChart, panel.axisChart].forEach(c => { try { c.timeScale().fitContent(); } catch(e){} });
  }
}

function setRange(range, btn){
  currentRange = range;
  btn.parentElement.querySelectorAll('.tbtn').forEach(b=>{ if(['1M','3M','6M','1Y','All'].includes(b.textContent)) b.classList.remove('active'); });
  btn.classList.add('active');
  panelsArray.forEach(p => {
    applyRangeToPanel(p, (replayState.active ? aggregate(p.rawDailyCandles,p.interval).filter(d=>!replayState.indexTime||dateFromDrawingTime(d.time)?.getTime()<=dateFromDrawingTime(replayState.indexTime)?.getTime()) : aggregate(p.rawDailyCandles,p.interval)));
  });
}

function toggleVolume(btn){
  volVisible = !volVisible; btn.classList.toggle('active');
  if (currentSymbol) rebuildAllPanels();
}

function openIndicatorsModal(){
  populateRelativeStrengthIndexOptions(); document.getElementById('ind-modal').classList.add('open'); }
function closeIndicatorsModal(){ document.getElementById('ind-modal').classList.remove('open'); }

function toggleIndicator(key){
  if (key === 'candleClr') activeIndicators.candleClr = document.getElementById('candle-clr-en').checked;
  else if (key === 'ibLabel') activeIndicators.ibLabel = document.getElementById('ib-label-en').checked;
  else if (key === 'ema9Sell') activeIndicators.ema9Sell = document.getElementById('ema9sell-en').checked;
  else if (key === 'sellClimax') activeIndicators.sellClimax = document.getElementById('sellclimax-en').checked;
  else if (key === 'buyClimax') activeIndicators.buyClimax = document.getElementById('buyclimax-en').checked;
  else if (key === 'wtc') activeIndicators.wtc = document.getElementById('wtc-en').checked;
  else if (key === 'ppv') activeIndicators.ppv = document.getElementById('ind-ppv').checked;
  else if (key === 'tables') activeIndicators.tables = document.getElementById('ind-tables').checked;
  else activeIndicators[key] = !activeIndicators[key];

  if (currentSymbol) rebuildAllPanels();
}

/* ============ LIVE PRICE POLLING & ALERTS CHECK ============ */
function isLikelyMarketHours(){
  const now = new Date(); const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const ist = new Date(istString); const mins = ist.getHours()*60 + ist.getMinutes();
  return mins >= (9*60+15) && mins <= (15*60+30);
}

function startLivePoll(){
  if (!isLikelyMarketHours()) { isLiveActive = false; return; }
  isLiveActive = true; updateHeader(); pollLiveOnce();
  livePollTimer = setInterval(pollLiveOnce, LIVE_POLL_MS);
}

function stopLivePoll(){
  isLiveActive = false;
  if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
}

async function pollLiveOnce(){
  if (!currentSymbol) return;
  if (!isLikelyMarketHours()){ stopLivePoll(); updateHeader(); return; }
  try{
    const res = await fetch(`${CHARTS_API_URL}?action=getLive&symbol=${encodeURIComponent(currentSymbol)}`);
    const data = await res.json();
    if (data.error || typeof data.price !== 'number') return;
    applyLivePrice(data.price);
  }catch(e){}
}

function applyLivePrice(price){
  const primary = panelsArray[0];
  if (!primary || !primary.rawDailyCandles || !primary.rawDailyCandles.length) return;
  const p = Number(price); 
  if (isNaN(p) || p <= 0) return;

  const last = primary.rawDailyCandles[primary.rawDailyCandles.length - 1];
  const prevClose = Number(last.close);

  // 1. SPIKE GUARD: 20% se zyada abnormal jump reject hoga (Scale extend nahi hoga)
  if (prevClose > 0 && Math.abs(p - prevClose) / prevClose > 0.20) {
    console.warn(`[Live Spike Guard] Ignored abnormal tick: ₹${p} (Prev: ₹${prevClose})`);
    return;
  }

  // 2. Indian Market Date (IST YYYY-MM-DD)
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  if (last.time === today || last.time >= today){
    last.close = p; 
    last.high = Math.max(last.open, last.high, p); 
    last.low = Math.min(last.open, last.low, p);
  } else {
    primary.rawDailyCandles.push({ 
      time: today, 
      open: last.close, 
      high: Math.max(last.close, p), 
      low: Math.min(last.close, p), 
      close: p, 
      volume: 0 
    });
  }

  checkPriceAlerts(currentSymbol, p);
  checkDrawingAlerts(currentSymbol, p, today);
  updateHeader();

  // 3. Update Candlestick, Volume aur BOTTOM DATE AXIS SERIES
  panelsArray.forEach(panel => {
    const d = aggregate(primary.rawDailyCandles, panel.interval);
    if (!d.length) return;
    const lastBar = d[d.length - 1];

    if (panel.candleSeries) {
      if (currentChartType === 'line') {
        panel.candleSeries.update({ time: lastBar.time, value: lastBar.close });
      } else {
        panel.candleSeries.update(lastBar);
      }
    }

    // YEH LINE BOTTOM DATE AXIS KO AAJ KI DATE DEGI (04 Sep '26)
    if (panel.axisSeries) {
      try {
        panel.axisSeries.update({ time: lastBar.time, value: d.length });
      } catch(e){}
    }

    if (panel.volumeSeries && volVisible) {
      try {
        panel.volumeSeries.update({
          time: lastBar.time,
          value: lastBar.volume || 0,
          color: lastBar.close >= lastBar.open ? '#00e67688' : '#ff3d5a88'
        });
      } catch(e){}
    }
  });

  const dailyData = aggregate(primary.rawDailyCandles, 'D');
  renderCombinedInfoCard(dailyData);
  renderPocketPivotStatsWidget(dailyData);
}
  

/* ============ CANDLE BAR REPLAY MODE ============ */
function getReplaySource(){const p=panelsArray[0];return p?.rawDailyCandles||[];}

function updateReplayUI(){const d=getReplaySource();if(!d.length)return;const sl=document.getElementById('replay-slider');if(sl){sl.max=String(d.length-1);sl.value=String(replayState.index);}const dt=document.getElementById('replay-date');if(dt)dt.textContent=String(d[replayState.index]?.time||'—');const pb=document.getElementById('replay-play-btn');if(pb)pb.textContent=replayState.playing?'⏸':'▶';const rb=document.getElementById('replay-btn');if(rb){rb.textContent=replayState.active?'■ Replay':'▶ Replay';rb.classList.toggle('active',replayState.active);}}
async function setReplayIndex(v){const d=getReplaySource();if(!d.length)return;replayState.index=Math.max(0,Math.min(d.length-1,Number(v)||0));replayState.indexTime=d[replayState.index].time;updateReplayUI();await rebuildAllPanels();}
function replayStart(){const d=getReplaySource();if(!d.length)return;replayState.index=0;replayState.indexTime=d[0].time;replayState.playing=false;clearInterval(replayState.timer);updateReplayUI();rebuildAllPanels();}
function replayStep(dir){const d=getReplaySource();if(!d.length)return;replayState.index=Math.max(0,Math.min(d.length-1,replayState.index+(dir||1)));replayState.indexTime=d[replayState.index].time;updateReplayUI();rebuildAllPanels();}
function toggleReplayPlay(){if(!replayState.active)return;replayState.playing=!replayState.playing;clearInterval(replayState.timer);if(replayState.playing){replayState.timer=setInterval(()=>{const d=getReplaySource();if(replayState.index>=d.length-1){replayState.playing=false;clearInterval(replayState.timer);updateReplayUI();return;}replayStep(1);},650);}updateReplayUI();}
function exitReplayMode(){replayState.active=false;replayState.playing=false;clearInterval(replayState.timer);replayState.timer=null;replayState.indexTime=null;const bar=document.getElementById('replay-bar');if(bar)bar.classList.remove('open');updateReplayUI();rebuildAllPanels();startLivePoll();}

/* ============ INIT START ============ */
initSystem();
loadSymbolList();

/* ===== V6 RUNTIME FEATURES ===== */
function updateEMAConfig(){
  const ids=[1,2,3,4,5];
  ids.forEach((n,idx)=>{if(!emaConfigs[idx])emaConfigs[idx]={id:n,enabled:false,len:n===5?10:9,color:'#00d4ff',width:1};const en=document.getElementById(`ema${n}-en`),ln=document.getElementById(`ema${n}-len`),co=document.getElementById(`ema${n}-color`),wi=document.getElementById(`ema${n}-width`);if(en)emaConfigs[idx].enabled=en.checked;if(ln)emaConfigs[idx].len=Math.max(1,parseInt(ln.value)||emaConfigs[idx].len);if(co)emaConfigs[idx].color=co.value;if(wi)emaConfigs[idx].width=parseInt(wi.value)||1;});
  emaEnvelopeEnabled=document.getElementById('ema-env-en')?.checked??true;if(currentSymbol)rebuildAllPanels();
}
function renderEditableEMAs(data,panel){if(!data?.length)return;if(panel.emaSeriesList?.length)panel.emaSeriesList.forEach(s=>{try{panel.priceChart.removeSeries(s);}catch(e){}});panel.emaSeriesList=[];emaConfigs.forEach(cfg=>{if(!cfg?.enabled)return;const vals=calculateEMAValues(data,cfg.len||9),series=panel.priceChart.addLineSeries({color:cfg.color,lineWidth:cfg.width||1,priceLineVisible:false,lastValueVisible:false});series.setData(data.map((d,i)=>({time:d.time,value:+Number(vals[i]).toFixed(2)})));panel.emaSeriesList.push(series);});}
function buildTrueRange(data){
  const tr=Array(data.length).fill(0);
  for(let i=0;i<data.length;i++){
    const h=Number(data[i].high),l=Number(data[i].low);
    const pc=i?Number(data[i-1].close):Number(data[i].open);
    tr[i]=Math.max(0,h-l,Math.abs(h-pc),Math.abs(l-pc));
  }
  return tr;
}
function computeSupertrend(data,atrPeriod,factor){
  const out=Array(data.length).fill(null);
  if(!Array.isArray(data)||!data.length)return out;
  atrPeriod=Math.max(1,Math.round(Number(atrPeriod)||10));
  factor=Math.max(.1,Number(factor)||3);
  const tr=buildTrueRange(data),atr=Array(data.length).fill(null);
  let seed=0;
  for(let i=0;i<tr.length;i++){
    seed+=tr[i];
    if(i===atrPeriod-1)atr[i]=seed/atrPeriod;
    else if(i>=atrPeriod)atr[i]=((atr[i-1]*(atrPeriod-1))+tr[i])/atrPeriod;
  }
  let finalUpper=null,finalLower=null,trend=1;
  for(let i=0;i<data.length;i++){
    if(i<atrPeriod-1)continue;
    const h=Number(data[i].high),l=Number(data[i].low),c=Number(data[i].close);
    const hl2=(h+l)/2;
    const basicUpper=hl2+factor*atr[i],basicLower=hl2-factor*atr[i];
    if(i===atrPeriod-1){
      finalUpper=basicUpper;finalLower=basicLower;trend=c>=hl2?1:-1;
    }else{
      const pc=Number(data[i-1].close);
      finalUpper=(basicUpper<finalUpper||pc>finalUpper)?basicUpper:finalUpper;
      finalLower=(basicLower>finalLower||pc<finalLower)?basicLower:finalLower;
      if(trend<0&&c>finalUpper)trend=1;
      else if(trend>0&&c<finalLower)trend=-1;
    }
    out[i]={time:data[i].time,value:+(trend>0?finalLower:finalUpper).toFixed(2),trend};
  }
  return out;
}
function renderSupertrends(data,panel){if(!panel?.priceChart)return;if(panel.supertrendSeriesList?.length)panel.supertrendSeriesList.forEach(s=>{try{panel.priceChart.removeSeries(s);}catch(e){}});panel.supertrendSeriesList=[];supertrendConfigs.forEach(cfg=>{if(!cfg.enabled)return;const vals=computeSupertrend(data,cfg.atr,cfg.factor),up=[],down=[];vals.forEach(v=>{if(!v)return;(v.trend>0?up:down).push({time:v.time,value:v.value});});const su=panel.priceChart.addLineSeries({color:cfg.up,lineWidth:2,priceLineVisible:false,lastValueVisible:false}),sd=panel.priceChart.addLineSeries({color:cfg.down,lineWidth:2,priceLineVisible:false,lastValueVisible:false});su.setData(up);sd.setData(down);panel.supertrendSeriesList.push(su,sd);});}
function updateSupertrendConfig(){supertrendConfigs[0]={enabled:!!document.getElementById('st1-en')?.checked,atr:Math.max(1,parseInt(document.getElementById('st1-atr')?.value)||10),factor:Math.max(.1,Number(document.getElementById('st1-factor')?.value)||3),up:document.getElementById('st1-up')?.value||'#00e676',down:document.getElementById('st1-down')?.value||'#ff3d5a'};supertrendConfigs[1]={enabled:!!document.getElementById('st2-en')?.checked,atr:Math.max(1,parseInt(document.getElementById('st2-atr')?.value)||14),factor:Math.max(.1,Number(document.getElementById('st2-factor')?.value)||2),up:document.getElementById('st2-up')?.value||'#26a69a',down:document.getElementById('st2-down')?.value||'#ef5350'};if(currentSymbol)rebuildAllPanels();}
function getPanelDisplayData(panel){
  if(!panel || !Array.isArray(panel.rawDailyCandles) || !panel.rawDailyCandles.length) return [];
  let data=aggregate(panel.rawDailyCandles,panel.interval||'D')||[];
  if(replayState?.active && replayState.indexTime){
    const cut=dateFromDrawingTime(replayState.indexTime)?.getTime();
    if(Number.isFinite(cut)) data=data.filter(d=>{
      const t=dateFromDrawingTime(d.time)?.getTime();
      return Number.isFinite(t)&&t<=cut;
    });
  }
  return data;
}
function formatOhlcvVolume(v){v=Number(v)||0;if(v>=1e7)return(v/1e7).toFixed(2)+'Cr';if(v>=1e6)return(v/1e6).toFixed(2)+'M';if(v>=1e3)return(v/1e3).toFixed(1)+'K';return String(Math.round(v));}
function updateOhlcvStrip(panel,time){const el=panel?.ohlcvStrip||document.getElementById(`ohlcv-strip-${panel?.index}`);if(!el)return;const data=getPanelDisplayData(panel);if(!data.length){el.textContent='O —  H —  L —  C —  V —  Δ —';return;}let d=data[data.length-1];if(time){const t=dateFromDrawingTime(time)?.getTime();let best=Infinity;for(const x of data){const dt=dateFromDrawingTime(x.time)?.getTime();if(dt==null||t==null)continue;const dif=Math.abs(dt-t);if(dif<best){best=dif;d=x;}}}const idx=data.indexOf(d),prev=idx>0?data[idx-1]:null,chg=prev&&Number(prev.close)?((Number(d.close)-Number(prev.close))/Number(prev.close))*100:0;el.innerHTML=`O <b>${Number(d.open).toFixed(2)}</b> &nbsp; H <b>${Number(d.high).toFixed(2)}</b> &nbsp; L <b>${Number(d.low).toFixed(2)}</b> &nbsp; C <b>${Number(d.close).toFixed(2)}</b> &nbsp; V <b>${formatOhlcvVolume(d.volume)}</b> &nbsp; Δ <b style="color:${chg>=0?'var(--green)':'var(--red)'}">${chg>=0?'+':''}${chg.toFixed(2)}%</b>`;}
function toggleCompareSettings(i){const el=document.getElementById(`compare-settings-${i}`);if(el)el.style.display=el.style.display==='none'?'block':'none';}
function jumpIndicatorSection(keyword){const modal=document.getElementById('ind-modal');if(!modal)return;const key=String(keyword).toLowerCase();const sec=[...modal.querySelectorAll('.ind-section')].find(x=>(x.querySelector('.ind-section-title')?.textContent||'').toLowerCase().includes(key));if(sec){sec.scrollIntoView({behavior:'smooth',block:'start'});sec.style.boxShadow='0 0 0 1px var(--accent) inset';setTimeout(()=>sec.style.boxShadow='',900);}}
function syncRequestedDefaults(){const ea=document.getElementById('ema-align-en');if(ea)ea.checked=true;const rh=document.getElementById('rsi-highlight-en');if(rh)rh.checked=true;const ge=document.getElementById('gap-en');if(ge)ge.checked=true;const me=document.getElementById('mcp-en');if(me)me.checked=true;const es=document.getElementById('ema9sell-en');if(es)es.checked=true;activeIndicators.ema9Sell=true;activeIndicators.ppv=true;const vm=document.getElementById('volma-en');if(vm)vm.checked=true;volMAConfig.enabled=true;const wl=document.getElementById('52wl-en');if(wl)wl.checked=true;const vp=document.getElementById('vp-en');if(vp)vp.checked=false;const poc=document.getElementById('vp-poc-en');if(poc)poc.checked=true;const ts=document.getElementById('trendline-show-en');if(ts)ts.checked=false;const e5=document.getElementById('ema5-en');if(e5)e5.checked=false;const eao=document.getElementById('ema-align-opacity');if(eao)eao.value='1';const rao=document.getElementById('rsi-highlight-opacity');if(rao)rao.value='1';syncHighlightControlValues();}
async function toggleReplayMode(){if(replayState.active){exitReplayMode();return;}let d=getReplaySource(),p=panelsArray[0];if(!d.length&&p?.symbol){try{d=await fetchSymbolCandles(p.symbol,p.instrumentType||'stock');p.rawDailyCandles=d||[];}catch(e){}}if(!d.length){alert('Load a stock/index first.');return;}replayState.active=true;replayState.playing=false;clearInterval(replayState.timer);replayState.index=Math.max(20,Math.floor(d.length*.60));replayState.index=Math.min(d.length-1,replayState.index);replayState.indexTime=d[replayState.index].time;const bar=document.getElementById('replay-bar');if(bar)bar.classList.add('open');const sl=document.getElementById('replay-slider');if(sl){sl.min='0';sl.max=String(d.length-1);sl.value=String(replayState.index);}updateReplayUI();stopLivePoll();await rebuildAllPanels();}
const __mickkkBaseRebuildPanelChartV6=rebuildPanelChart;rebuildPanelChart=async function(panel){await __mickkkBaseRebuildPanelChartV6(panel);try{const data=getPanelDisplayData(panel);renderSupertrends(data,panel);updateOhlcvStrip(panel);drawPanelOverlays(panel);}catch(e){}};
setTimeout(()=>{try{syncRequestedDefaults();updateEMAAlignmentConfig();updateRSIHighlightConfig();update52WLinesConfig();updateVolumeProfileConfig();updateSupertrendConfig();}catch(e){}},100);
