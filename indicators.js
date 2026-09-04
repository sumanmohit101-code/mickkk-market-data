function calculateEMA(data, p) {
  const k = 2 / (p + 1); let ema = Number(data[0].close), out = [];
  for (let i = 0; i < data.length; i++) { ema = Number(data[i].close) * k + ema * (1 - k); out.push({ time: data[i].time, value: +ema.toFixed(2) }); }
  return out;
}

function renderEditableEMAs(data, panel) {
  if (panel.emaSeriesList) panel.emaSeriesList.forEach(s => { try { panel.priceChart.removeSeries(s); } catch(e){} });
  panel.emaSeriesList = [];
  emaConfigs.forEach(cfg => {
    if (cfg.enabled) {
      const s = panel.priceChart.addLineSeries({ color: cfg.color, lineWidth: cfg.width, priceLineVisible: false, lastValueVisible: false });
      s.setData(calculateEMA(data, cfg.len));
      panel.emaSeriesList.push(s);
    }
  });
}

function renderRSIPane(data, panel) {
  if (!rsiConfig.enabled) { if (panel.rsiSeries) { try { panel.rsiChart.removeSeries(panel.rsiSeries); } catch(e){} panel.rsiSeries = null; } return; }
  const period = rsiConfig.len || 14, rsiData = []; let g = 0, l = 0;
  for (let i = 1; i <= period && i < data.length; i++) { const diff = data[i].close - data[i-1].close; if (diff >= 0) g += diff; else l -= diff; }
  let avgG = g / period, avgL = l / period;
  for (let i = period; i < data.length; i++) {
    if (i > period) { const diff = data[i].close - data[i-1].close; avgG = (avgG * (period - 1) + (diff > 0 ? diff : 0)) / period; avgL = (avgL * (period - 1) + (diff < 0 ? -diff : 0)) / period; }
    const rs = avgL === 0 ? 100 : avgG / avgL;
    rsiData.push({ time: data[i].time, value: +(100 - (100 / (1 + rs))).toFixed(2) });
  }
  if (!panel.rsiSeries) panel.rsiSeries = panel.rsiChart.addLineSeries({ color: rsiConfig.color, lineWidth: rsiConfig.width, priceLineVisible: false });
  panel.rsiSeries.setData(rsiData);
}

async function renderRelativeStrengthPane(data, panel) {
  if (!relativeStrengthConfig.enabled) { if (panel.rsSeries) { try { panel.rsChart.removeSeries(panel.rsSeries); } catch(e){} panel.rsSeries = null; } return; }
  try {
    const rawB = await fetchFreshCandles(relativeStrengthConfig.benchmarkSymbol || 'NIFTYSMALLCAP250', 'index');
    const bMap = new Map(rawB.map(x => [x.time, x.close]));
    const common = [];
    data.forEach(c => { const bc = bMap.get(c.time); if (bc) common.push({ time: c.time, ratio: c.close / bc }); });
    if (!common.length) return;
    const base = common[0].ratio || 1;
    const rsData = common.map(x => ({ time: x.time, value: +(x.ratio / base * 100).toFixed(2) }));
    if (!panel.rsSeries) panel.rsSeries = panel.rsChart.addLineSeries({ color: '#00d4ff', lineWidth: 2, priceLineVisible: false });
    panel.rsSeries.setData(rsData);
  } catch(e){}
}

/* CPR CALCULATION WITH LABELS HIDE/SHOW LOGIC */
function getCPRLevels(rawDaily, mode){
  if(!rawDaily || !rawDaily.length) return null;
  const groups={};
  rawDaily.forEach(c=>{
    const d=new Date(c.time+'T00:00:00');
    let key = mode==='W' ? formatToDateOnly(new Date(d.setDate(d.getDate()-((d.getDay()+6)%7)))) : c.time.slice(0,7)+'-01';
    if(!groups[key]) groups[key]={high:Number(c.high),low:Number(c.low),close:Number(c.close)};
    else {groups[key].high=Math.max(groups[key].high,Number(c.high));groups[key].low=Math.min(groups[key].low,Number(c.low));groups[key].close=Number(c.close);}
  });
  const keys=Object.keys(groups).sort();
  if(keys.length<2) return null;
  const prev=groups[keys[keys.length-2]], p=(prev.high+prev.low+prev.close)/3, bc=(prev.high+prev.low)/2, tc=2*p-bc;
  return {p,bc,tc};
}

function drawCPRLine(ctx,x1,x2,y,label,value,dash=false){
  if(y===null || !Number.isFinite(y)) return;
  ctx.save();
  ctx.strokeStyle='rgba(255,171,0,.88)'; ctx.lineWidth=1;
  if(dash) ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke(); ctx.setLineDash([]);
  
  // LABELS ARE HIDDEN BY DEFAULT (ONLY LINES DRAWN)
  if (cprConfig.showLabels) {
    ctx.fillStyle='rgba(255,171,0,.95)'; ctx.font='600 9px JetBrains Mono, monospace'; ctx.textAlign='right';
    ctx.fillText(`${label} ${value.toFixed(2)}`,Math.max(x1+55,x2-6),y-3);
  }
  ctx.restore();
}

function drawCPROverlay(panel,data){
  if(!panel || !panel.overlayCanvas || (!cprConfig.weekly && !cprConfig.monthly)) return;
  const canvas=panel.overlayCanvas, ctx=canvas.getContext('2d');
  const chartData=aggregate(panel.rawDailyCandles || data, panel.interval) || data || [];
  if(!chartData.length) return;
  const visibleCandles=chartData.slice(Math.max(0,chartData.length-20));
  const x1raw=visibleCandles[0]?.time!=null?panel.priceChart.timeScale().timeToCoordinate(visibleCandles[0].time):null;
  const x2raw=visibleCandles[visibleCandles.length-1]?.time!=null?panel.priceChart.timeScale().timeToCoordinate(visibleCandles[visibleCandles.length-1].time):null;
  const x1=x1raw==null?0:Math.max(0,x1raw-6), x2=x2raw==null?canvas.width:Math.min(canvas.width,x2raw+8);

  const modes=[]; if(cprConfig.weekly)modes.push('W'); if(cprConfig.monthly)modes.push('M');
  modes.forEach(m=>{
    const lv=getCPRLevels(panel.rawDailyCandles,m); if(!lv)return;
    [['TC',lv.tc],['P',lv.p],['BC',lv.bc]].forEach((it,idx)=>{
      const y=panel.candleSeries.priceToCoordinate(it[1]);
      drawCPRLine(ctx,x1,x2,y,`${m} ${it[0]}`,it[1],idx===1);
    });
  });
}

function drawPanelOverlays(panel) {
  if (!panel || !panel.overlayCanvas || !panel.priceChart || !panel.candleSeries) return;
  const canvas = panel.overlayCanvas, parent = canvas.parentElement; if (!parent) return;
  const dpr = window.devicePixelRatio || 1, rect = parent.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
  const data = aggregate(panel.rawDailyCandles, panel.interval);
  if (!data || !data.length) return;
  drawCPROverlay(panel, data);
}

function renderCombinedInfoCard(data){
  const card = document.getElementById('widget-combined-info');
  if (!card || !data.length || !activeIndicators.tables) { if(card) card.style.display = 'none'; return; }
  card.style.display = 'flex';
  const last = data[data.length-1], c = Number(last.close);
  let h52 = 0, l52 = Infinity, len = Math.min(data.length, 252);
  for (let i = data.length - len; i < data.length; i++) { if (data[i].high > h52) h52 = data[i].high; if (data[i].low < l52) l52 = data[i].low; }
  const pH = h52 ? ((c - h52) / h52 * 100) : 0, pL = l52 !== Infinity ? ((c - l52) / l52 * 100) : 0;
  card.innerHTML = `
    <div class="info-row"><span>52W High:</span><span class="widget-badge ${pH>=0?'bg-pos':'bg-neg'}">${pH.toFixed(2)}%</span></div>
    <div class="info-row"><span>52W Low:</span><span class="widget-badge ${pL>=0?'bg-pos':'bg-neg'}">${pL>=0?'+':''}${pL.toFixed(2)}%</span></div>
    <div class="info-card-divider"></div>
    <div class="info-row"><span>Circuit:</span><span class="widget-badge bg-pos">20%</span></div>`;
}
