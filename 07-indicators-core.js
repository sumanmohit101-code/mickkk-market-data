/* ============ HELPER CALCULATIONS ============ */
function calculateEMAValues(data, period) {
  if (!data || !data.length) return [];
  const k = 2 / (period + 1);
  let ema = Number(data[0].close);
  const res = [];
  for (let i = 0; i < data.length; i++) {
    ema = (Number(data[i].close) * k) + (ema * (1 - k));
    res.push(ema);
  }
  return res;
}

function computeSMA(arr, period) {
  const out = []; let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += Number(arr[i] || 0);
    if (i >= period) sum -= Number(arr[i - period] || 0);
    out.push(i >= period - 1 ? sum / period : Number(arr[i] || 0));
  }
  return out;
}

function calculateATRValues(data, period) {
  if (!data || !data.length) return [];
  const trs = [];
  for (let i = 0; i < data.length; i++) {
    const h = Number(data[i].high), l = Number(data[i].low);
    const pc = i > 0 ? Number(data[i - 1].close) : Number(data[i].open);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = []; let trSum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period) { trSum += trs[i]; atr.push(trSum / (i + 1)); }
    else { atr.push((atr[i - 1] * (period - 1) + trs[i]) / period); }
  }
  return atr;
}

/* ============ RSI HELPER ============ */
function calculateRSIValues(data, period) {
  if (!data || !data.length) return [];
  const out = new Array(data.length).fill(0);
  if (data.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = Number(data[i].close) - Number(data[i - 1].close);
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < data.length; i++) {
    const diff = Number(data[i].close) - Number(data[i - 1].close);
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[i] = 100 - (100 / (1 + rs));
  }
  return out;
}

function refreshBandChangeMarkers(panel) {
  if (!panel?.candleSeries || !panel?.rawDailyCandles?.length) return;
  try {
    const data = aggregate(panel.rawDailyCandles, panel.interval || currentInterval);
    const base = processCandleColoringAndIB(data, panel, panel.interval || currentInterval);
    panel.candleSeries.setData(base);
  } catch(e) {}
}

function getBandChangeMarkers(data, symbol) {
  const changes = getBandChangesForSymbol(symbol);
  if (!changes.length || !data?.length) return [];
  const byDate = new Map();
  changes.forEach(ch => {
    const date = formatToDateOnly(ch.date);
    if (!date) return;
    const from = ch.from || '';
    const to = ch.to || '';
    const text = from && to ? `PB ${from}→${to}` : `PB ${to || from}`;
    byDate.set(date, { time: date, position: 'aboveBar', color: '#ffd54f', shape: 'square', text });
  });
  return data.filter(d => byDate.has(formatToDateOnly(d.time))).map(d => byDate.get(formatToDateOnly(d.time)));
}

/* ============ DRAWING CROSSING ALERTS + TRENDLINE BREAKOUTS ============ */
function drawingTimeMs(t){const d=dateFromDrawingTime(t);return d?d.getTime():NaN;}
function linePriceAtTime(d,time){
  if(!d?.p1||!d?.p2)return null;
  const t=drawingTimeMs(time),t1=drawingTimeMs(d.p1.time),t2=drawingTimeMs(d.p2.time);
  if(!Number.isFinite(t)||!Number.isFinite(t1)||!Number.isFinite(t2)||t2===t1)return null;
  if(d.type==='ray'){
    const dir=t2>t1?1:-1;
    if((t-t1)*dir<0)return null;
  }
  const f=(t-t1)/(t2-t1);
  return Number(d.p1.price)+(Number(d.p2.price)-Number(d.p1.price))*f;
}
function getDrawingAlertLevels(d,time){
  if(!d)return [];
  if(d.type==='hline')return [{price:Number(d.price),label:'Horizontal line'}];
  if(d.type==='trendline'||d.type==='ray'||d.type==='arrowup'||d.type==='arrowdown'){
    const v=linePriceAtTime(d,time);return v==null?[]:[{price:v,label:d.type==='ray'?'Ray':'Trendline'}];
  }
  if(d.type==='fibonacci'&&d.p1&&d.p2){const out=[];[0,.236,.382,.5,.618,.786,1].forEach(l=>out.push({price:Number(d.p1.price)+(Number(d.p2.price)-Number(d.p1.price))*l,label:`Fib ${(l*100).toFixed(1)}%`}));return out;}
  if((d.type==='long'||d.type==='short')&&d.entry!=null){return [{price:Number(d.entry),label:'Entry'},{price:Number(d.target),label:'Target'},{price:Number(d.stop),label:'Stop'}];}
  return [];
}
function playDrawingAlert(symbol,price,label){
  try{const audioCtx=new(window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator();osc.connect(audioCtx.destination);osc.frequency.value=1046;osc.start();osc.stop(audioCtx.currentTime+.18);setTimeout(()=>{try{const o=audioCtx.createOscillator();o.connect(audioCtx.destination);o.frequency.value=784;o.start();o.stop(audioCtx.currentTime+.18);}catch(e){}},210);}catch(e){}
  try{if('Notification' in window&&Notification.permission==='granted')new Notification(`MICKKK • ${symbol}`,{body:`${label} crossed at ₹${Number(price).toFixed(2)}`});}catch(e){}
}
let drawingAlertLastPriceBySymbol={};
async function recordDrawingAlert(symbol,price,label,direction,drawingId){
  const record={id:'DRAW_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),symbol,targetPrice:Number(price),condition:'DRAWING_'+direction,label:String(label||'Drawing'),type:'DRAWING',status:'TRIGGERED',drawingId:drawingId||'',triggeredAt:new Date().toISOString()};
  activeAlerts.push(record);
  try{await fetch(`${CHARTS_API_URL}?action=recordDrawingAlert&symbol=${encodeURIComponent(symbol)}&price=${encodeURIComponent(price)}&condition=${encodeURIComponent('DRAWING_'+direction)}&label=${encodeURIComponent(label||'Drawing')}&drawingId=${encodeURIComponent(drawingId||'')}`);}catch(e){}
}


function checkDrawingAlerts(symbol,currentPrice,currentTime){
  const prev=drawingAlertLastPriceBySymbol[symbol];drawingAlertLastPriceBySymbol[symbol]=Number(currentPrice);
  if(prev==null||!Number.isFinite(prev))return;
  userDrawings.forEach(d=>{
    if(!d.alertEnabled)return;
    const levels=getDrawingAlertLevels(d,currentTime);levels.forEach(level=>{
      const lp=Number(level.price);if(!Number.isFinite(lp))return;
      const crossedUp=prev<lp&&currentPrice>=lp,crossedDown=prev>lp&&currentPrice<=lp;
      const dir=d.alertDirection||'both';
      if((crossedUp&&(dir==='both'||dir==='up'))||(crossedDown&&(dir==='both'||dir==='down'))){
        playDrawingAlert(symbol,currentPrice,`${level.label} ${crossedUp?'breakout':'breakdown'}`);
        showDrawingSaveStatus(`🔔 ${level.label} crossed`,true);
        recordDrawingAlert(symbol,currentPrice,level.label,crossedUp?'UP':'DOWN',d.id);
      }
    });
  });
}
/* ============ TRENDLINES WITH BREAKS — LUXALGO CALCULATION MODEL ============ */
const autoTrendlineCache=new Map();
function calculateTrendlineSlopeSeries(data,length,mult,method){
  const n=data.length, out=new Array(n).fill(0), tr=new Array(n).fill(0), closes=data.map(x=>Number(x.close)||0);
  const L=Math.max(1,Math.round(length||14)), M=Number(mult)||1;
  for(let i=0;i<n;i++){
    const h=Number(data[i].high)||0,l=Number(data[i].low)||0,c=Number(data[i].close)||0,pc=i?Number(data[i-1].close)||c:c;
    tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));
  }
  let atr=0;
  for(let i=0;i<n;i++){
    atr=i===0?tr[i]:(i<L?((atr*(i)+tr[i])/(i+1)):(atr+(tr[i]-atr)/L));
    if(method==='Atr') out[i]=(atr/L)*M;
    else if(method==='Stdev'){
      const a=Math.max(0,i-L+1),arr=closes.slice(a,i+1),mean=arr.reduce((x,y)=>x+y,0)/arr.length;
      const sd=Math.sqrt(arr.reduce((x,y)=>x+(y-mean)*(y-mean),0)/arr.length);
      out[i]=(sd/L)*M;
    }else{
      const a=Math.max(0,i-L+1),nn=i-a+1; if(nn<2){out[i]=0;continue;}
      let sx=0,sy=0,sxx=0,sxy=0;
      for(let j=a;j<=i;j++){const x=j,y=closes[j];sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
      const den=nn*sxx-sx*sx, slope=den?Math.abs((nn*sxy-sx*sy)/den):0;
      out[i]=(slope/2)*M;
    }
  }
  return out;
}
function findLuxPivot(data,idx,length,isHigh){
  const L=Math.max(1,Math.round(length||14));
  if(idx<L||idx+L>=data.length)return false;
  const p=Number(isHigh?data[idx].high:data[idx].low); if(!Number.isFinite(p))return false;
  for(let j=1;j<=L;j++){
    const left=Number(isHigh?data[idx-j].high:data[idx-j].low),right=Number(isHigh?data[idx+j].high:data[idx+j].low);
    if(isHigh ? !(p>=left&&p>=right) : !(p<=left&&p<=right)) return false;
  }
  return true;
}
function getLuxTrendlineState(data,panel){
  if(!trendlineBreakoutConfig.enabled||!Array.isArray(data)||data.length<35)return {upper:[],lower:[],upBreak:[],downBreak:[]};
  const L=Math.max(1,Math.round(trendlineBreakoutConfig.length||14)),M=Number(trendlineBreakoutConfig.mult)||1,method=trendlineBreakoutConfig.calcMethod||'Atr',bp=!!trendlineBreakoutConfig.backpaint;
  const key=`lux|${panel?.symbol||''}|${panel?.interval||''}|${data.length}|${data[0]?.time||''}|${data[data.length-1]?.time||''}|${L}|${M}|${method}|${bp}`;
  if(autoTrendlineCache.has(key))return autoTrendlineCache.get(key);
  const slope=calculateTrendlineSlopeSeries(data,L,M,method), upper=new Array(data.length).fill(null),lower=new Array(data.length).fill(null);
  let slopePH=0,slopePL=0,u=null,l=null,upPivot=-1,lowPivot=-1,upos=0,dnos=0;
  const upBreak=[],downBreak=[];
  for(let i=0;i<data.length;i++){
    const ph=findLuxPivot(data,i,L,true),pl=findLuxPivot(data,i,L,false);
    if(ph){const pivotIdx=i, pivot=Number(data[i].high);slopePH=slope[i];u=pivot;upPivot=pivotIdx;upos=0;}
    else if(u!=null) u-=slopePH;
    if(pl){const pivotIdx=i,pivot=Number(data[i].low);slopePL=slope[i];l=pivot;lowPivot=pivotIdx;dnos=0;}
    else if(l!=null) l+=slopePL;
    // Pine's plotted level with backpainting offset: in JS we keep the pivot anchor exact;
    // when backpaint is disabled the active line starts at the current bar-equivalent level.
    if(u!=null) upper[i]={value:u,pivot:upPivot,slope:slopePH};
    if(l!=null) lower[i]={value:l,pivot:lowPivot,slope:slopePL};
    const upThreshold=u!=null?u-slopePH*L:null;
    const dnThreshold=l!=null?l+slopePL*L:null;
    if(!ph && upThreshold!=null && Number(data[i].close)>upThreshold){
      if(upos===0)upBreak.push(i); upos=1;
    }
    if(!pl && dnThreshold!=null && Number(data[i].close)<dnThreshold){
      if(dnos===0)downBreak.push(i); dnos=1;
    }
  }
  const result={upper,lower,upBreak,downBreak,length:L,mult:M,method,backpaint:bp};
  if(autoTrendlineCache.size>100){const first=autoTrendlineCache.keys().next().value;if(first)autoTrendlineCache.delete(first);}
  autoTrendlineCache.set(key,result);return result;
}
function getAutoTrendlineSet(data,panel){
  const st=getLuxTrendlineState(data,panel);if(!st.upper.length)return {supports:[],resistances:[]};
  const lastU=st.upper.filter(Boolean).at(-1),lastL=st.lower.filter(Boolean).at(-1);
  return {supports:lastL?[{i1:lastL.pivot,i2:data.length-1,p1:Number(data[lastL.pivot]?.low),p2:lastL.value,days:Math.max(0,(dateFromDrawingTime(data[data.length-1]?.time)?.getTime()-dateFromDrawingTime(data[lastL.pivot]?.time)?.getTime())/86400000),touches:0,isSupport:true,slope:lastL.slope}]:[],resistances:lastU?[{i1:lastU.pivot,i2:data.length-1,p1:Number(data[lastU.pivot]?.high),p2:lastU.value,days:Math.max(0,(dateFromDrawingTime(data[data.length-1]?.time)?.getTime()-dateFromDrawingTime(data[lastU.pivot]?.time)?.getTime())/86400000),touches:0,isSupport:false,slope:lastU.slope}]:[]};
}
function autoTrendlinePriceAt(line,data,time){
  if(!line)return null;const t=dateFromDrawingTime(time)?.getTime(),t1=dateFromDrawingTime(data[line.i1]?.time)?.getTime(),t2=dateFromDrawingTime(data[line.i2]?.time)?.getTime();
  if(!Number.isFinite(t)||!Number.isFinite(t1)||!Number.isFinite(t2)||t2===t1)return null;
  return line.p1+(line.p2-line.p1)*((t-t1)/(t2-t1));
}
function getAutoTrendlineMarkers(data,panel,tf){
  if(!trendlineBreakoutConfig.enabled)return [];
  const st=getLuxTrendlineState(data,panel),out=[];
  st.upBreak.forEach(i=>out.push({time:data[i].time,position:'belowBar',color:trendlineBreakoutConfig.breakoutColor,shape:'arrowUp',text:'BO'}));
  st.downBreak.forEach(i=>out.push({time:data[i].time,position:'aboveBar',color:trendlineBreakoutConfig.breakdownColor,shape:'arrowDown',text:'BD'}));
  return out;
}
function drawAutoTrendlines(panel,data){
  if(!trendlineBreakoutConfig.enabled||!trendlineBreakoutConfig.showLines||!data?.length)return;
  const st=getLuxTrendlineState(data,panel),ctx=panel.overlayCanvas?.getContext('2d');if(!ctx)return;const rect=panel.overlayCanvas.parentElement.getBoundingClientRect();
  const drawSeries=(series,color,label)=>{let first=null;for(let i=0;i<series.length;i++)if(series[i]){first=i;break;}if(first==null)return;let prev=null;for(let i=first;i<series.length;i++){const cur=series[i];if(!cur)continue;const x=panel.priceChart.timeScale().timeToCoordinate(data[i].time),y=panel.candleSeries.priceToCoordinate(cur.value);if(x==null||y==null){prev=null;continue;}if(prev){ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.72;ctx.lineWidth=1.2;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(x,y);ctx.stroke();ctx.restore();}prev={x,y};} if(prev){ctx.save();ctx.fillStyle=color;ctx.font='600 8px JetBrains Mono, monospace';ctx.fillText(label,Math.max(4,prev.x-50),Math.max(11,prev.y-5));ctx.restore();}};
  drawSeries(st.upper,trendlineBreakoutConfig.breakoutColor,'Upper');drawSeries(st.lower,trendlineBreakoutConfig.breakdownColor,'Lower');
}
function updateTrendlineBreakoutConfig(){
  trendlineBreakoutConfig.enabled=document.getElementById('trendline-breakout-en')?.checked??true;
  trendlineBreakoutConfig.showLines=document.getElementById('trendline-show-en')?.checked??false;
  trendlineBreakoutConfig.length=Math.max(1,parseInt(document.getElementById('trendline-length')?.value)||14);
  trendlineBreakoutConfig.mult=Math.max(0,Number(document.getElementById('trendline-mult')?.value)||1);
  trendlineBreakoutConfig.calcMethod=document.getElementById('trendline-method')?.value||'Atr';
  trendlineBreakoutConfig.backpaint=document.getElementById('trendline-backpaint')?.checked??true;
  autoTrendlineCache.clear();if(currentSymbol)rebuildAllPanels();
}

/* ============ CANDLE COLORING & SIGNALS ============ */
function processCandleColoringAndIB(data, panel, tf) {
  const candles = [];
  const markers = getBandChangeMarkers(data, panel.symbol || currentSymbol);
  markers.push(...getAutoTrendlineMarkers(data, panel, tf));

  const ema55Vals = calculateEMAValues(data, 55);
  const ema9Vals = calculateEMAValues(data, 9);
  const ema21Vals = calculateEMAValues(data, 21);
  const ema50Vals = calculateEMAValues(data, 50);
  const ema200Vals = calculateEMAValues(data, 200);
  const volMA30 = computeSMA(data.map(d => Number(d.volume || 0)), 30);
  const volMA20 = computeSMA(data.map(d => Number(d.volume || 0)), 20);
  const atrVals = calculateATRValues(data, 14);
  const buyClimaxVolMA20 = volMA20;
  const sellClimaxVolMA20 = volMA20;
  const buyClimaxSma50 = computeSMA(data.map(d => Number(d.close)), atrExtConfig.maLength || 50);
  const atrExtAtrVals = calculateATRValues(data, atrExtConfig.atrLength || 14);
  const rsi14Vals = calculateRSIValues(data, 14);

  for (let i = 0; i < data.length; i++) {
    const open = Number(data[i].open), high = Number(data[i].high);
    const low = Number(data[i].low), close = Number(data[i].close);
    const volume = Number(data[i].volume || 0);

    const range = high - low;
    const rangePct = close ? (range / close) * 100 : 0;
    const bodyPct = open ? Math.abs(close - open) / open * 100 : 0;

    let isNR7 = false;
    if (i >= 6) {
      isNR7 = true;
      for (let j = 1; j <= 6; j++) {
        if (range >= (Number(data[i - j].high) - Number(data[i - j].low))) { isNR7 = false; break; }
      }
    }

    let customColor = null;
    if (smartBarConfig.enabled) {
      // NR7 has highest priority: if the candle is NR7, color it yellow first;
      // only non-NR7 candles are evaluated against the other bar-color rules.
      if (smartBarConfig.nr7Enabled && isNR7) customColor = smartBarConfig.nr7Color;
      else if (smartBarConfig.bodyEnabled && bodyPct > smartBarConfig.bodyThreshold && close > open) customColor = smartBarConfig.bodyColor;
      else if (smartBarConfig.rangeEnabled && rangePct < smartBarConfig.rangeThreshold) customColor = smartBarConfig.rangeColor;
    }

    const cObj = { time: data[i].time, open: open, high: high, low: low, close: close };
    if (customColor) { cObj.color = customColor; cObj.borderColor = customColor; cObj.wickColor = customColor; }
    candles.push(cObj);

    if (activeIndicators.ibLabel && i >= 1) {
      const prevHigh = Number(data[i - 1].high), prevLow = Number(data[i - 1].low);
      const motherBarRange = prevHigh ? ((prevHigh - prevLow) / prevHigh) * 100 : 0;
      const insideBar1 = (high < prevHigh && low > prevLow) && (close > ema55Vals[i]) && (motherBarRange <= ibMaxMotherBarRange);
      let insideBar2 = false;
      if (insideBar1 && i >= 2) insideBar2 = high < Number(data[i - 2].high) && low > Number(data[i - 2].low);

      if (insideBar1 || insideBar2) {
        markers.push({ time: data[i].time, position: 'belowBar', color: isNR7 ? smartBarConfig.nr7Color : smartBarConfig.bodyColor, shape: 'none', text: tf==='W'?'WIB':'IB' });
      }
    }

    if (activeIndicators.wtc && (tf === 'W' || panel.interval === 'W') && i >= 5) {
      const c0 = Number(data[i].close), c1 = Number(data[i-1].close), c2 = Number(data[i-2].close);
      const c3 = Number(data[i-3].close), c4 = Number(data[i-4].close), c5 = Number(data[i-5].close);
      const d1 = c1 ? Math.abs(c0-c1)/c1*100 : 99, d2 = c2 ? Math.abs(c1-c2)/c2*100 : 99;
      const d3 = c3 ? Math.abs(c2-c3)/c3*100 : 99, d4 = c4 ? Math.abs(c3-c4)/c4*100 : 99;
      const d5 = c5 ? Math.abs(c4-c5)/c5*100 : 99;
      const tight3 = d1 < 1.5 && d2 < 1.5 && d3 < 1.5;
      const tight4 = tight3 && d4 < 1.5, tight5 = tight4 && d5 < 1.5;

      if (tight5) markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'circle', text: '5WTC' });
      else if (tight4) markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff52e2', shape: 'circle', text: '4WTC' });
      else if (tight3) markers.push({ time: data[i].time, position: 'belowBar', color: '#52f9ff', shape: 'circle', text: '3WTC' });
    }

    if (activeIndicators.ema9Sell && tf === 'D' && i >= 1) {
      const prev = data[i - 1];
      const prevHigh = Number(prev.high);
      const prevLow = Number(prev.low);
      const prevEma9 = Number(ema9Vals[i - 1]);
      const currentEma50 = Number(ema50Vals[i]);
      const prevHighAboveEma9 = Number.isFinite(prevEma9) && prevHigh > prevEma9;
      const prevLowBelowEma9 = Number.isFinite(prevEma9) && prevLow < prevEma9;
      const currentBelowPrevLowByClose = close < prevLow;
      const currentAboveEma50 = Number.isFinite(currentEma50) && close > currentEma50;
      if (prevHighAboveEma9 && prevLowBelowEma9 && currentBelowPrevLowByClose && currentAboveEma50) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'none', text: '×' });
      }
    }

    const ema200Curr = ema200Vals[i] || close;
    const vMA = volMA30[i] || 1;
    const candleRangePct = open ? ((high - low) / open) * 100 : 0;
    const priceAbove200EMA = close > (ema200Curr * 1.4);
    const priceBelow200EMA = close < (ema200Curr * 0.7);

    // SELLING CLIMAX — all requested conditions must be true:
    // New 10-bar low + 3x Volume SMA20 + 2x ATR14 range + EMA50<EMA200 downtrend
    // + Close < EMA21*0.85 + strong close in upper 30% of candle.
    if (activeIndicators.sellClimax && i >= 20) {
      let lowestPrev9 = Infinity;
      for (let j = Math.max(0, i - 9); j < i; j++) {
        lowestPrev9 = Math.min(lowestPrev9, Number(data[j].low));
      }
      const isNewLow = Number.isFinite(lowestPrev9) && low < lowestPrev9;
      const volumeSpike = volume >= ((sellClimaxVolMA20[i] || volume) * 3);
      const wideRangeBar = atrVals[i] > 0 && (high - low) >= (atrVals[i] * 2.0);
      const downtrendActive = close < (ema50Vals[i] || close) && (ema50Vals[i] || close) < (ema200Vals[i] || close);
      const overExtended = close < ((ema21Vals[i] || close) * 0.85);
      const closedStrong = (high - low) > 0 && ((close - low) / (high - low)) > 0.7;

      if (isNewLow && volumeSpike && wideRangeBar && downtrendActive && overExtended && closedStrong) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#00e676', shape: 'none', text: '×' });
      }
    }

    // BUYING CLIMAX: all requested conditions must be true on the same candle.
    if (activeIndicators.buyClimax && i >= 20) {
      let highest10 = -Infinity;
      for (let j = Math.max(0, i - 9); j <= i; j++) highest10 = Math.max(highest10, Number(data[j].high));
      const overExtended = close > (ema200Curr * 1.4);
      const isNewHigh = high >= highest10;
      const volumeSpike = volume >= ((buyClimaxVolMA20[i] || volume) * 3);
      const wideRangeBar = (atrVals[i] || 0) > 0 && (high - low) >= ((atrVals[i] || 0) * 2.0);
      const overboughtRSI = (rsi14Vals[i] || 0) >= 70;
      const rangeOver8 = candleRangePct > 8;
      if (overExtended && isNewHigh && volumeSpike && wideRangeBar && overboughtRSI && rangeOver8) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'arrowDown', text: 'BC' });
      }
    }

    // ATR% Extension from SMA50:
    // atrPercent = ATR / Close
    // percentFromSMA = (Close - SMA50) / SMA50
    // atrMultiple = percentFromSMA / atrPercent
    // Weekly and Monthly charts are excluded.
    if (atrExtConfig.enabled && tf !== 'W' && tf !== 'M' && i >= Math.max(atrExtConfig.atrLength || 14, atrExtConfig.maLength || 50)) {
      const sma50Val = buyClimaxSma50[i] || close;
      const atrVal = atrExtAtrVals[i] || 0;
      const atrPercent = close > 0 ? (atrVal / close) : 0;
      const percentFromSMA = sma50Val > 0 ? ((close - sma50Val) / sma50Val) : 0;
      const atrMultiple = atrPercent > 0 ? (percentFromSMA / atrPercent) : 0;
      if (atrMultiple > (atrExtConfig.threshold || 10.0)) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'circle', text: '' });
      }
    }
  }

  markers.sort((a,b) => a.time < b.time ? -1 : (a.time > b.time ? 1 : 0));

  try { panel.candleSeries.setMarkers(markers); } catch(e){}
  return candles;
}

function updateSmartBarConfig() {
  smartBarConfig.enabled = document.getElementById('candle-clr-en').checked;
  smartBarConfig.bodyEnabled = document.getElementById('smart-body-en').checked;
  smartBarConfig.bodyThreshold = parseFloat(document.getElementById('smart-body-pct').value) || 4.0;
  smartBarConfig.bodyColor = document.getElementById('smart-body-color').value;
  smartBarConfig.rangeEnabled = document.getElementById('smart-range-en').checked;
  smartBarConfig.rangeThreshold = parseFloat(document.getElementById('smart-range-pct').value) || 3.0;
  smartBarConfig.rangeColor = document.getElementById('smart-range-color').value;
  smartBarConfig.nr7Enabled = document.getElementById('smart-nr7-en').checked;
  smartBarConfig.nr7Color = document.getElementById('smart-nr7-color').value;
  activeIndicators.candleClr = smartBarConfig.enabled;
  if (currentSymbol) rebuildAllPanels();
}

function updateIBConfig() {
  ibMaxMotherBarRange = parseFloat(document.getElementById('ib-mother-range').value) || 8.0;
  if (currentSymbol) rebuildAllPanels();
}

function updateATRExtConfig() {
  atrExtConfig.enabled = document.getElementById('atr-ext-en').checked;
  atrExtConfig.atrLength = parseInt(document.getElementById('atr-ext-len').value) || 14;
  atrExtConfig.maLength = parseInt(document.getElementById('atr-ext-ma-len').value) || 50;
  atrExtConfig.threshold = parseFloat(document.getElementById('atr-ext-thresh').value) || 10.0;
  if (currentSymbol) rebuildAllPanels();
}

/* ============ MINI COIL PATTERN CALCULATOR ============ */
function calculateMCPForData(data) {
  if (!mcpConfig.enabled || !data || data.length < 4) return [];
  try {
    const r1 = mcpConfig.r1 || 8.0, coils = []; let activeCoil = null;
    for (let i = 3; i < data.length; i++) {
      const h3 = Number(data[i - 3].high), l3 = Number(data[i - 3].low);
      const barRange = h3 ? ((h3 - l3) / h3) * 100 : 999;
      const c1 = h3 >= Number(data[i].high) && h3 >= Number(data[i - 1].high) && h3 >= Number(data[i - 2].high);
      const c2 = l3 <= Number(data[i].low) && l3 <= Number(data[i - 1].low) && l3 <= Number(data[i - 2].low);
      if (!activeCoil && c1 && c2 && barRange <= r1) {
        activeCoil = { startTime: data[i - 3].time, high: h3, low: l3, endTime: null }; coils.push(activeCoil);
      }
      if (activeCoil) {
        if (Number(data[i].high) <= activeCoil.high && Number(data[i].low) >= activeCoil.low) activeCoil.endTime = data[i].time;
        else activeCoil = null;
      }
    }
    return mcpConfig.lastOnly ? coils.slice(-1) : coils;
  } catch(e){ return []; }
}

function updateMCPConfig() {
  mcpConfig.enabled = document.getElementById('mcp-en').checked;
  mcpConfig.r1 = parseFloat(document.getElementById('mcp-r1').value) || 8.0;
  mcpConfig.lastOnly = document.getElementById('mcp-last-only').checked;
  if (currentSymbol) rebuildAllPanels();
}

/* ============ GAP DETECTOR CALCULATOR ============ */
function calculateGapsForData(data) {
  if (!gapConfig.enabled || !data || data.length < 2) return [];
  try {
    const minGapPct = gapConfig.minGapPct || 1.0, maxGaps = gapConfig.maxGaps || 5, gaps = [];
    for (let i = 1; i < data.length; i++) {
      const pHigh = Number(data[i - 1].high), pLow = Number(data[i - 1].low);
      const high = Number(data[i].high), low = Number(data[i].low);
      const gapUpPct = low > pHigh ? ((low - pHigh) / pHigh) * 100 : 0;
      const gapDownPct = high < pLow ? ((pLow - high) / pLow) * 100 : 0;

      if (gapUpPct >= minGapPct) gaps.push({ isUp: true, top: low, bottom: pHigh, startTime: data[i - 1].time, fillTime: null });
      else if (gapDownPct >= minGapPct) gaps.push({ isUp: false, top: pLow, bottom: high, startTime: data[i - 1].time, fillTime: null });

      for (let g = 0; g < gaps.length; g++) {
        if (!gaps[g].fillTime) {
          const justFilled = gaps[g].isUp ? (low <= gaps[g].bottom) : (high >= gaps[g].top);
          if (justFilled) gaps[g].fillTime = data[i].time;
        }
      }
    }
    return gaps.slice(-maxGaps);
  } catch(e){ return []; }
}

function updateGapConfig() {
  gapConfig.enabled = document.getElementById('gap-en').checked;
  gapConfig.minGapPct = parseFloat(document.getElementById('gap-min-pct').value) || 1.0;
  gapConfig.maxGaps = parseInt(document.getElementById('gap-max-count').value) || 5;
  if (currentSymbol) rebuildAllPanels();
}

function draw52WLines(panel,data){
  if(!w52Config.enabled||!panel?.overlayCanvas||!data?.length)return;
  const ctx=panel.overlayCanvas.getContext('2d'),rect=panel.overlayCanvas.parentElement.getBoundingClientRect();
  const src=Array.isArray(panel.rawDailyCandles)&&panel.rawDailyCandles.length?panel.rawDailyCandles:data;
  const len=Math.min(src.length,252); if(!len)return;
  let hi=-Infinity,lo=Infinity;
  for(let i=Math.max(0,src.length-len);i<src.length;i++){hi=Math.max(hi,Number(src[i].high));lo=Math.min(lo,Number(src[i].low));}
  const yh=panel.candleSeries.priceToCoordinate(hi),yl=panel.candleSeries.priceToCoordinate(lo);
  const line=(y,c,label,value)=>{
    if(y==null||!Number.isFinite(value))return;
    ctx.save();ctx.strokeStyle=c;ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.globalAlpha=.9;
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(rect.width,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=c;ctx.font='600 9px JetBrains Mono, monospace';ctx.textAlign='right';
    ctx.fillText(`${label} ₹${value.toFixed(2)}`,Math.max(90,rect.width-7),y-4);
    ctx.restore();
  };
  line(yh,w52Config.highColor,'52W H',hi);
  line(yl,w52Config.lowColor,'52W L',lo);
}
function update52WLinesConfig(){
  w52Config.enabled=document.getElementById('52wl-en')?.checked??false;
  w52Config.highColor=document.getElementById('52w-high-color')?.value||'#ff9800';
  w52Config.lowColor=document.getElementById('52w-low-color')?.value||'#00d4ff';
  if(currentSymbol)rebuildAllPanels();
}

