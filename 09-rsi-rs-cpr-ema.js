/* ============ EDITABLE RSI ENGINE ============ */
function renderRSIPane(data, panel) {
  if (!data || !data.length) return;

  if (rsiConfig.enabled) {
    const period = rsiConfig.len || 14, rsiData = [], rsiValuesArr = [];
    let gains = 0, losses = 0;

    for (let i = 0; i < Math.min(period, data.length); i++) {
      rsiData.push({ time: data[i].time });
    }

    for (let i = 1; i <= period && i < data.length; i++) {
      const diff = Number(data[i].close) - Number(data[i - 1].close);
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;

    for (let i = period; i < data.length; i++) {
      if (i > period) {
        const diff = Number(data[i].close) - Number(data[i - 1].close);
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsiVal = +(100 - (100 / (1 + rs))).toFixed(2);
      rsiData.push({ time: data[i].time, value: rsiVal });
      rsiValuesArr.push({ time: data[i].time, val: rsiVal });
    }

    if (!panel.rsiSeries) {
      panel.rsiSeries = panel.rsiChart.addLineSeries({
        color: rsiConfig.color, lineWidth: rsiConfig.width, priceLineVisible: false, lastValueVisible: true
      });
    } else {
      panel.rsiSeries.applyOptions({ color: rsiConfig.color, lineWidth: rsiConfig.width });
    }
    panel.rsiSeries.setData(rsiData);
    panel.rsiValueByTime = rsiData.filter(d => typeof d.value === 'number');

    if (rsiMAConfig.enabled && rsiValuesArr.length) {
      const maLen = rsiMAConfig.len || 9, maData = []; let sum = 0;
      for (let i = 0; i < rsiValuesArr.length; i++) {
        sum += rsiValuesArr[i].val;
        if (i >= maLen) sum -= rsiValuesArr[i - maLen].val;
        if (i >= maLen - 1) maData.push({ time: rsiValuesArr[i].time, value: +(sum / maLen).toFixed(2) });
      }
      if (!panel.rsiMASeries) {
        panel.rsiMASeries = panel.rsiChart.addLineSeries({
          color: rsiMAConfig.color, lineWidth: rsiMAConfig.width, priceLineVisible: false, lastValueVisible: false
        });
      } else {
        panel.rsiMASeries.applyOptions({ color: rsiMAConfig.color, lineWidth: rsiMAConfig.width });
      }
      panel.rsiMASeries.setData(maData);
    } else if (panel.rsiMASeries) {
      panel.rsiChart.removeSeries(panel.rsiMASeries); panel.rsiMASeries = null;
    }

    clearRSIThresholds(panel);
    if (rsiConfig.showThresholds && panel.rsiSeries) {
      try {
        const uLine = panel.rsiSeries.createPriceLine({
          price: rsiConfig.upperVal || 60, color: '#ff3d5a88', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false
        });
        const lLine = panel.rsiSeries.createPriceLine({
          price: rsiConfig.lowerVal || 40, color: '#00e67688', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false
        });
        panel.rsiThresholdLines = [uLine, lLine];
      } catch(e){}
    }

  } else {
    if (panel.rsiSeries) { panel.rsiChart.removeSeries(panel.rsiSeries); panel.rsiSeries = null; }
    if (panel.rsiMASeries) { panel.rsiChart.removeSeries(panel.rsiMASeries); panel.rsiMASeries = null; }
    clearRSIThresholds(panel);
  }
}

function clearRSIThresholds(panel) {
  if (panel.rsiSeries && panel.rsiThresholdLines && panel.rsiThresholdLines.length) {
    panel.rsiThresholdLines.forEach(l => { try { panel.rsiSeries.removePriceLine(l); } catch(e){} });
  }
  panel.rsiThresholdLines = [];
}

function updateRSIConfig(){
  rsiConfig.enabled = document.getElementById('rsi-en').checked;
  rsiConfig.len = parseInt(document.getElementById('rsi-len').value) || 14;
  rsiConfig.color = document.getElementById('rsi-color').value;
  rsiConfig.width = parseInt(document.getElementById('rsi-width').value) || 2;
  rsiMAConfig.enabled = document.getElementById('rsima-en').checked;
  rsiMAConfig.len = parseInt(document.getElementById('rsima-len').value) || 9;
  rsiMAConfig.color = document.getElementById('rsima-color').value;
  rsiMAConfig.width = parseInt(document.getElementById('rsima-width').value) || 1;
  rsiConfig.showThresholds = document.getElementById('rsi-thresh-en').checked;
  rsiConfig.upperVal = parseFloat(document.getElementById('rsi-upper').value) || 60;
  rsiConfig.lowerVal = parseFloat(document.getElementById('rsi-lower').value) || 40;
  if (currentSymbol) rebuildAllPanels();
}

  /* MACD CALCULATION ENGINE */
function renderMACDPane(data, panel) {
  if (!data || !data.length || !panel.macdChart) return;
  if (!macdConfig.enabled) {
    if (panel.macdLineSeries) { try { panel.macdChart.removeSeries(panel.macdLineSeries); } catch(e){} panel.macdLineSeries = null; }
    if (panel.macdSignalSeries) { try { panel.macdChart.removeSeries(panel.macdSignalSeries); } catch(e){} panel.macdSignalSeries = null; }
    if (panel.macdHistSeries) { try { panel.macdChart.removeSeries(panel.macdHistSeries); } catch(e){} panel.macdHistSeries = null; }
    return;
  }

  const fastLen = macdConfig.fast || 12, slowLen = macdConfig.slow || 26, sigLen = macdConfig.signal || 9;
  const fastEma = calculateEMAValues(data, fastLen), slowEma = calculateEMAValues(data, slowLen);
  const macdLineData = [], macdRaw = [];

  for (let i = 0; i < data.length; i++) {
    const val = fastEma[i] - slowEma[i];
    macdRaw.push(val);
    macdLineData.push({ time: data[i].time, value: +val.toFixed(2) });
  }

  const k = 2 / (sigLen + 1);
  let sig = macdRaw[0];
  const signalData = [], histData = [];

  for (let i = 0; i < data.length; i++) {
    sig = (macdRaw[i] * k) + (sig * (1 - k));
    const sVal = +sig.toFixed(2);
    signalData.push({ time: data[i].time, value: sVal });

    const hist = +(macdLineData[i].value - sVal).toFixed(2);
    const prevHist = i > 0 ? (histData[i - 1] ? histData[i - 1].value : 0) : 0;
    const color = hist >= 0 ? (hist >= prevHist ? '#089981' : '#08998188') : (hist <= prevHist ? '#f23645' : '#f2364588');
    histData.push({ time: data[i].time, value: hist, color });
  }

  if (!panel.macdHistSeries) panel.macdHistSeries = panel.macdChart.addHistogramSeries({ priceFormat: { type: 'price', precision: 2 } });
  panel.macdHistSeries.setData(histData);

  if (!panel.macdLineSeries) panel.macdLineSeries = panel.macdChart.addLineSeries({ color: macdConfig.lineColor, lineWidth: 2, priceLineVisible: false });
  panel.macdLineSeries.setData(macdLineData);

  if (!panel.macdSignalSeries) panel.macdSignalSeries = panel.macdChart.addLineSeries({ color: '#ff6d00', lineWidth: 1, priceLineVisible: false });
  panel.macdSignalSeries.setData(signalData);
}

function updateMACDConfig() {
  macdConfig.enabled = document.getElementById('macd-en')?.checked ?? false;
  macdConfig.fast = parseInt(document.getElementById('macd-fast')?.value) || 12;
  macdConfig.slow = parseInt(document.getElementById('macd-slow')?.value) || 26;
  macdConfig.signal = parseInt(document.getElementById('macd-signal')?.value) || 9;
  macdConfig.lineColor = document.getElementById('macd-color')?.value || '#2962ff';
  if (currentSymbol) rebuildAllPanels();
}
  
/* ============ RELATIVE STRENGTH ENGINE ============ */
function populateRelativeStrengthIndexOptions(){
  const sel=document.getElementById('rs-benchmark');
  if(!sel) return;
  const current=relativeStrengthConfig.benchmarkSymbol || 'NIFTYSMALLCAP250';
  const list = allIndices && allIndices.length ? allIndices : [{symbol:'NIFTYSMALLCAP250',name:'NIFTY SMALLCAP 250'}];
  sel.innerHTML=list.map(x=>`<option value="${escapeHtml(x.symbol)}">${escapeHtml(x.name)} (${escapeHtml(x.symbol)})</option>`).join('');
  sel.value=list.some(x=>x.symbol===current)?current:(list.find(x=>x.symbol==='NIFTYSMALLCAP250')?.symbol || list[0].symbol);
}

function drawRelativeStrengthFill(panel,rsData,maData){
  const canvas=panel?.rsFillCanvas;if(!canvas||!panel?.rsChart||!panel?.rsSeries||!panel?.rsMASeries)return;
  const pane=document.getElementById(`pane-rs-${panel.index}`);if(!pane)return;
  const w=Math.max(1,pane.clientWidth),h=Math.max(1,pane.clientHeight);const dpr=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const n=Math.min(rsData?.length||0,maData?.length||0);if(n<2)return;
  let segment=[];
  const flush=(seg,positive)=>{if(seg.length<2)return;ctx.beginPath();ctx.moveTo(seg[0].x,seg[0].yRs);seg.forEach(pt=>ctx.lineTo(pt.x,pt.yRs));for(let i=seg.length-1;i>=0;i--)ctx.lineTo(seg[i].x,seg[i].yMa);ctx.closePath();ctx.fillStyle=positive?'rgba(0,230,118,.13)':'rgba(255,61,90,.13)';ctx.fill();};
  let currentPos=null;
  for(let i=0;i<n;i++){
    if(rsData[i]?.value===undefined||maData[i]?.value===undefined){flush(segment,currentPos!==false);segment=[];currentPos=null;continue;}
    const x=panel.rsChart.timeScale().timeToCoordinate(rsData[i].time);const yRs=panel.rsSeries.priceToCoordinate(rsData[i].value);const yMa=panel.rsMASeries.priceToCoordinate(maData[i].value);if(x==null||yRs==null||yMa==null){continue;}
    const pos=Number(rsData[i].value)>=Number(maData[i].value);if(currentPos===null)currentPos=pos;if(pos!==currentPos){flush(segment,currentPos);segment=[];segment.push({x,yRs,yMa});currentPos=pos;}else segment.push({x,yRs,yMa});
  }
  flush(segment,currentPos!==false);
}

async function renderRelativeStrengthPane(data,panel){
  if(!panel || !panel.rsChart) return;
  if(!relativeStrengthConfig.enabled){
    if(panel.rsSeries){try{panel.rsChart.removeSeries(panel.rsSeries);}catch(e){} panel.rsSeries=null;}
    if(panel.rsMASeries){try{panel.rsChart.removeSeries(panel.rsMASeries);}catch(e){} panel.rsMASeries=null;}
    if(panel.rsBaseline){try{panel.rsSeries && panel.rsSeries.removePriceLine(panel.rsBaseline);}catch(e){} panel.rsBaseline=null;}
    panel.rsValueByTime=[]; panel.rsMAData=[]; if(panel.rsFillCanvas){const c=panel.rsFillCanvas.getContext('2d');if(c)c.clearRect(0,0,panel.rsFillCanvas.width,panel.rsFillCanvas.height);} updateTimeScaleVisibility(panel); return;
  }
  try{
    const benchmarkSymbol=relativeStrengthConfig.benchmarkSymbol || 'NIFTYSMALLCAP250';
    const benchRaw=await fetchSymbolCandles(benchmarkSymbol,'index');
    panel.benchmarkCandles=benchRaw||[];

    // RS must use the EXACT SAME aggregated candle timestamps as the main chart.
    // The series is padded with whitespace points before the first valid benchmark
    // observation, so its logical indexes remain one-to-one with the price candles.
    const stockData=aggregate(panel.rawDailyCandles || data, panel.interval) || data || [];
    const benchData=aggregate(benchRaw || [], panel.interval) || [];
    if(!stockData.length || !benchData.length){
      if(panel.rsSeries) panel.rsSeries.setData([]);
      if(panel.rsMASeries) panel.rsMASeries.setData([]);
      panel.rsValueByTime=[];
      return;
    }

    const benchMap=new Map(benchData.map(c=>[String(c.time),Number(c.close)]));
    let lastBenchClose=null;
    let benchIdx=0;
    const ratios=[];
    let firstValidRatio=null;

    for(const c of stockData){
      const t=String(c.time);
      while(benchIdx < benchData.length && String(benchData[benchIdx].time) <= t){
        const v=Number(benchData[benchIdx].close);
        if(Number.isFinite(v) && v>0) lastBenchClose=v;
        benchIdx++;
      }
      const exact=benchMap.get(t);
      const b=(Number.isFinite(exact) && exact>0) ? exact : lastBenchClose;
      const close=Number(c.close);
      const ratio=(Number.isFinite(close) && close>0 && Number.isFinite(b) && b>0) ? close/b : null;
      ratios.push(ratio);
      if(firstValidRatio===null && ratio!==null) firstValidRatio=ratio;
    }

    if(firstValidRatio===null) return;
    const base=firstValidRatio;
    const rsData=stockData.map((c,i)=>{
      const ratio=ratios[i];
      return ratio===null ? {time:c.time} : {time:c.time,value:+(ratio/base*100).toFixed(4)};
    });
    panel.rsValueByTime=rsData.filter(x=>x.value!==undefined);

    if(!panel.rsSeries){
      panel.rsSeries=panel.rsChart.addLineSeries({color:'#00d4ff',lineWidth:2,priceLineVisible:false,lastValueVisible:true,title:'RS'});
    }else panel.rsSeries.applyOptions({color:'#00d4ff',lineWidth:2,title:'RS'});
    panel.rsSeries.setData(rsData);

    const maLen=Math.max(1,Number(relativeStrengthConfig.maLen)||20);
    const maData=[];
    let sum=0, count=0;
    const validRs=[];
    for(let i=0;i<rsData.length;i++){
      if(rsData[i].value===undefined){
        maData.push({time:rsData[i].time});
        continue;
      }
      validRs.push({index:i,value:rsData[i].value});
      sum+=rsData[i].value; count++;
      if(validRs.length>maLen){ sum-=validRs[validRs.length-maLen-1].value; count--; }
      if(count===maLen) maData.push({time:rsData[i].time,value:+(sum/maLen).toFixed(4)});
      else maData.push({time:rsData[i].time});
    }

    if(!panel.rsMASeries) panel.rsMASeries=panel.rsChart.addLineSeries({color:'#ff9800',lineWidth:1,priceLineVisible:false,lastValueVisible:true,title:`RS MA ${maLen}`});
    else panel.rsMASeries.applyOptions({color:'#ff9800',lineWidth:1,title:`RS MA ${maLen}`});
    panel.rsMAData=maData; panel.rsMASeries.setData(maData);
    requestAnimationFrame(()=>drawRelativeStrengthFill(panel,rsData,maData));
    try{panel.priceChart.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(()=>drawRelativeStrengthFill(panel,panel.rsValueByTime||[],panel.rsMAData||[])));}catch(e){}

    if(!panel.rsBaseline) panel.rsBaseline=panel.rsSeries.createPriceLine({price:100,color:'#7f8c8d',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,axisLabelVisible:false,title:'100'});

    // Keep RS on the exact main-chart logical range after the async benchmark load.
    try{
      const range=panel.priceChart.timeScale().getVisibleLogicalRange();
      if(range){
        panel.rsChart.timeScale().setVisibleLogicalRange(range);
        panel.axisChart && panel.axisChart.timeScale().setVisibleLogicalRange(range);
      }
    }catch(e){}
  }catch(e){console.warn('Relative strength error:',e);}
}

function updateRelativeStrengthConfig(){
  relativeStrengthConfig.enabled=document.getElementById('rs-en')?.checked ?? true;
  relativeStrengthConfig.benchmarkSymbol=document.getElementById('rs-benchmark')?.value || 'NIFTYSMALLCAP250';
  relativeStrengthConfig.maLen=parseInt(document.getElementById('rs-ma-len')?.value)||20;
  relativeStrengthConfig.color=document.getElementById('rs-color')?.value||'#ff9800';
  relativeStrengthConfig.width=parseInt(document.getElementById('rs-width')?.value)||1;
  if(currentSymbol) rebuildAllPanels();
}

/* ============ CPR OVERLAY ENGINE ============ */
function getCPRLevels(rawDaily, mode){
  if(!rawDaily || !rawDaily.length) return null;
  const groups={};
  rawDaily.forEach(c=>{
    const d=new Date(c.time+'T00:00:00');
    let key;
    if(mode==='W'){
      const day=d.getDay(); const monday=new Date(d); monday.setDate(d.getDate()-((day+6)%7));
      key=formatToDateOnly(monday);
    }else key=c.time.slice(0,7)+'-01';
    if(!groups[key]) groups[key]={key,high:Number(c.high),low:Number(c.low),close:Number(c.close)};
    else {groups[key].high=Math.max(groups[key].high,Number(c.high));groups[key].low=Math.min(groups[key].low,Number(c.low));groups[key].close=Number(c.close);}
  });
  const keys=Object.keys(groups).sort();
  if(keys.length<2) return null;
  const prev=groups[keys[keys.length-2]], currentKey=keys[keys.length-1];
  const p=(prev.high+prev.low+prev.close)/3, bc=(prev.high+prev.low)/2, tc=2*p-bc;
  return {periodStart:currentKey,p,bc,tc};
}

function drawCPRLine(ctx,x1,x2,y,label,value,color,dash=false){
  if(y===null || !Number.isFinite(y)) return;
  const safeColor = color || '#ff9800';
  ctx.save(); ctx.strokeStyle=safeColor; ctx.globalAlpha=.9; ctx.lineWidth=1; if(dash)ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();ctx.setLineDash([]);
  if(cprConfig.showLabels){
    ctx.globalAlpha=1; ctx.fillStyle=safeColor;ctx.font='600 9px JetBrains Mono, monospace';ctx.textAlign='right';ctx.fillText(`${label} ${value.toFixed(2)}`,Math.max(x1+55,x2-6),y-3);
  }
  ctx.restore();
}

function drawCPROverlay(panel,data){
  if(!panel || !panel.overlayCanvas || (!cprConfig.weekly && !cprConfig.monthly)) return;
  const canvas=panel.overlayCanvas,parent=canvas.parentElement;if(!parent)return;
  const rect=parent.getBoundingClientRect(); const ctx=canvas.getContext('2d');
  const chartData=aggregate(panel.rawDailyCandles || data, panel.interval) || data || [];
  if(!chartData.length) return;

  // User requested CPR only over the latest 20 chart candles.
  const visibleCandles=chartData.slice(Math.max(0,chartData.length-20));
  const firstTime=visibleCandles[0]?.time;
  const lastTime=visibleCandles[visibleCandles.length-1]?.time;
  const x1raw=firstTime!=null ? panel.priceChart.timeScale().timeToCoordinate(firstTime) : null;
  const x2raw=lastTime!=null ? panel.priceChart.timeScale().timeToCoordinate(lastTime) : null;
  const x1=x1raw==null?0:Math.max(0,x1raw-6);
  const x2=x2raw==null?rect.width:Math.min(rect.width,x2raw+8);

  const modes=[]; if(cprConfig.weekly)modes.push('W'); if(cprConfig.monthly)modes.push('M');
  modes.forEach(mode=>{
    const levels=getCPRLevels(panel.rawDailyCandles,mode); if(!levels)return;
    const vals=[['TC',levels.tc],['P',levels.p],['BC',levels.bc]];
    vals.forEach((item,idx)=>{
      const y=panel.candleSeries.priceToCoordinate(item[1]);
      drawCPRLine(ctx,x1,x2,y,`${mode==='W'?'W':'M'} ${item[0]}`,item[1],mode==='W'?cprConfig.weeklyColor:cprConfig.monthlyColor,idx===1);
    });
  });
}

function updateCPRConfig(){
  cprConfig.weekly=document.getElementById('cpr-weekly-en')?.checked ?? true;
  cprConfig.monthly=document.getElementById('cpr-monthly-en')?.checked ?? true;
  cprConfig.weeklyColor=document.getElementById('cpr-weekly-color')?.value || '#00d4ff';
  cprConfig.monthlyColor=document.getElementById('cpr-monthly-color')?.value || '#ff9800';
  cprConfig.showLabels=document.getElementById('cpr-labels-en')?.checked ?? false;
  if(currentSymbol) rebuildAllPanels();
}

/* ============ EDITABLE EMAs ============ */
function renderEditableEMAs(data, panel) {
  if (!data || !data.length) return;

  if (panel.emaSeriesList && panel.emaSeriesList.length) {
    panel.emaSeriesList.forEach(s => { try { panel.priceChart.removeSeries(s); } catch(e){} });
  }
  panel.emaSeriesList = [];

  emaConfigs.forEach(cfg => {
    if (cfg.enabled) {
      const p = cfg.len, k = 2 / (p + 1);
      let ema = Number(data[0].close);
      const emaData = [];
      for (let i = 0; i < data.length; i++) {
        ema = (Number(data[i].close) * k) + (ema * (1 - k));
        emaData.push({ time: data[i].time, value: +ema.toFixed(2) });
      }

      const s = panel.priceChart.addLineSeries({
        color: cfg.color, lineWidth: cfg.width, priceLineVisible: false, lastValueVisible: false
      });
      s.setData(emaData);
      panel.emaSeriesList.push(s);
    }
  });
}

function updateEMAConfig(){
  emaConfigs[0].enabled = document.getElementById('ema1-en').checked;
  emaConfigs[0].len = parseInt(document.getElementById('ema1-len').value) || 9;
  emaConfigs[0].color = document.getElementById('ema1-color').value;
  emaConfigs[0].width = parseInt(document.getElementById('ema1-width').value) || 1;

  emaConfigs[1].enabled = document.getElementById('ema2-en').checked;
  emaConfigs[1].len = parseInt(document.getElementById('ema2-len').value) || 21;
  emaConfigs[1].color = document.getElementById('ema2-color').value;
  emaConfigs[1].width = parseInt(document.getElementById('ema2-width').value) || 1;

  emaConfigs[2].enabled = document.getElementById('ema3-en').checked;
  emaConfigs[2].len = parseInt(document.getElementById('ema3-len').value) || 55;
  emaConfigs[2].color = document.getElementById('ema3-color').value;
  emaConfigs[2].width = parseInt(document.getElementById('ema3-width').value) || 1;

  emaConfigs[3].enabled = document.getElementById('ema4-en').checked;
  emaConfigs[3].len = parseInt(document.getElementById('ema4-len').value) || 200;
  emaConfigs[3].color = document.getElementById('ema4-color').value;
  emaConfigs[3].width = parseInt(document.getElementById('ema4-width').value) || 1;

  emaEnvelopeEnabled = document.getElementById('ema-env-en').checked;
  if (currentSymbol) rebuildAllPanels();
}

function resetToDefaults(){
  document.getElementById('ema1-en').checked = true; document.getElementById('ema1-len').value = 9;
  document.getElementById('ema2-en').checked = true; document.getElementById('ema2-len').value = 21;
  document.getElementById('ema3-en').checked = true; document.getElementById('ema3-len').value = 55;
  document.getElementById('ema4-en').checked = true; document.getElementById('ema4-len').value = 200;
  document.getElementById('candle-clr-en').checked = false;
  document.getElementById('ib-label-en').checked = false;
  document.getElementById('mcp-en').checked = false;
  document.getElementById('rsi-en').checked = true;
  document.getElementById('rsima-en').checked = true;
  document.getElementById('rsi-thresh-en').checked = true;
  document.getElementById('rs-en').checked = true;
  document.getElementById('rs-ma-len').value = 20;
  document.getElementById('cpr-weekly-en').checked = true;
  document.getElementById('cpr-monthly-en').checked = true;
  document.getElementById('cpr-weekly-color').value = '#00d4ff';
  document.getElementById('cpr-monthly-color').value = '#ff9800';
  document.getElementById('cpr-labels-en').checked = false;
  populateRelativeStrengthIndexOptions();
  const rsSel = document.getElementById('rs-benchmark'); if(rsSel) rsSel.value = 'NIFTYSMALLCAP250';
  document.getElementById('ind-ppv').checked = true;
  document.getElementById('ind-tables').checked = true;

  document.getElementById('wtc-en').checked = false;
  document.getElementById('ema9sell-en').checked = false;
  document.getElementById('sellclimax-en').checked = false;
  document.getElementById('buyclimax-en').checked = false;
  document.getElementById('atr-ext-en').checked = false;
  document.getElementById('atr-ext-len').value = 14;
  document.getElementById('atr-ext-ma-len').value = 50;
  document.getElementById('atr-ext-thresh').value = 10.0;
  const trendShow=document.getElementById('trendline-show-en'); if(trendShow) trendShow.checked=false;
  const wl52=document.getElementById('52wl-en'); if(wl52) wl52.checked=true;
  const infoAtrSel=document.getElementById('info-atr-len'); if(infoAtrSel) infoAtrSel.value='14'; infoAtrLength=14;

  currentScaleMode = 'log';
  const logBtn = document.getElementById('btn-scale-log'); const regBtn = document.getElementById('btn-scale-reg'); const pctBtn = document.getElementById('btn-scale-pct');
  if (logBtn) logBtn.classList.add('active'); if (regBtn) regBtn.classList.remove('active'); if (pctBtn) pctBtn.classList.remove('active');
  const ea=document.getElementById('ema-align-en'); if(ea)ea.checked=true; const ear=document.getElementById('ema-align-range'); if(ear)ear.value='2.0';
  const rh=document.getElementById('rsi-highlight-en'); if(rh)rh.checked=true; const rht=document.getElementById('rsi-highlight-thresh'); if(rht)rht.value='60';
  updateEMAConfig(); updateSmartBarConfig(); updateVolMAConfig(); updateRSIConfig(); updateRelativeStrengthConfig(); updateCPRConfig(); updateGapConfig(); updateMCPConfig(); updateATRExtConfig(); updateTrendlineBreakoutConfig(); update52WLinesConfig();
}

function updateInfoAtrLength(){
  infoAtrLength=Math.max(1,parseInt(document.getElementById('info-atr-len')?.value)||14);
  if(currentSymbol) rebuildAllPanels();
}

