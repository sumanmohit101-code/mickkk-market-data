/* ============ PROFESSIONAL DRAWINGS ENGINE ============ */
const DRAW_DEFAULTS={color:'#00d4ff',width:1,style:'solid',fill:'#00d4ff',opacity:12,rr:2};
let drawingDragState={active:false,idx:-1,startX:0,startY:0,lastTime:null,lastPrice:null,moved:false};
let selectedDrawingIcon='↑';

function toggleIconPalette(e, btn){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  const wrap=document.getElementById('icon-tool-wrap'); if(!wrap)return;
  const willOpen=!wrap.classList.contains('palette-open');
  document.querySelectorAll('.icon-tool-wrap.palette-open').forEach(x=>x.classList.remove('palette-open'));
  if(!willOpen)return;
  const pal=wrap.querySelector('.icon-palette'); if(!pal||!btn)return;
  wrap.classList.add('palette-open');
  requestAnimationFrame(()=>{
    const r=btn.getBoundingClientRect();
    const pw=pal.getBoundingClientRect().width||142, ph=pal.getBoundingClientRect().height||170;
    let left=r.right+6, top=r.top;
    if(left+pw>window.innerWidth-6) left=Math.max(6,r.left-pw-6);
    if(top+ph>window.innerHeight-6) top=Math.max(6,window.innerHeight-ph-6);
    pal.style.left=Math.round(left)+'px'; pal.style.top=Math.round(top)+'px';
  });
  setTool('icon',btn);
}

document.addEventListener('mousedown', function(e){
  const wrap=document.getElementById('icon-tool-wrap');
  if(wrap && !wrap.contains(e.target)) wrap.classList.remove('palette-open');
}, true);

function setDrawingIcon(icon){
  selectedDrawingIcon=String(icon||'↑');
  const b=document.getElementById('tool-icons');
  const wrap=document.getElementById('icon-tool-wrap');
  if(wrap) wrap.classList.remove('palette-open');
  setTool('icon',b);
}

function setTool(tool, btn){
  activeTool=tool;
  document.querySelectorAll('.draw-btn').forEach(b=>b.classList.remove('active'));
  if(btn && tool!=='cursor') btn.classList.add('active');
  if(tool==='cursor' && btn) btn.classList.add('active');
  drawingState={isDrawing:false,startPoint:null,currentPoint:null,midPoint:null};
  drawingDragState={active:false,idx:-1,startX:0,startY:0,lastTime:null,lastPrice:null,moved:false};
  closeDrawingStyle();
  const wrap=document.querySelector('.chart-wrap');
  if(wrap){wrap.classList.toggle('drawing-move-mode',tool==='move');wrap.classList.remove('drawing-dragging');}
}
function finalizeDrawing(){
  drawingState={isDrawing:false,startPoint:null,currentPoint:null,midPoint:null};
  saveDrawingsToLocalStorage();
  rebuildAllPanels();
  // Every drawing tool is one-shot: after one completed object it returns to Cursor.
  setTool('cursor',document.getElementById('tool-cursor'));
  showDrawingSaveStatus('Drawing added',true);
}
function makeDrawingBase(type){ return {id:Date.now()+Math.random(),type,color:DRAW_DEFAULTS.color,width:DRAW_DEFAULTS.width,style:DRAW_DEFAULTS.style,fill:DRAW_DEFAULTS.fill,opacity:DRAW_DEFAULTS.opacity}; }
function getDrawingPointFromEvent(e,p){
  const paneEl=document.getElementById(`pane-price-${p.index}`) || e.currentTarget;
  const rect=paneEl.getBoundingClientRect();
  const x=e.clientX-rect.left,y=e.clientY-rect.top;
  if(x<0||x>rect.width||y<0||y>rect.height)return null;
  const price=p.candleSeries.coordinateToPrice(y),time=getTimeFromXCoordinate(x,p);
  if(price==null||!time)return null;
  return {x,y,price,time};
}
function cloneDrawingPoint(pt){return pt?{time:pt.time,price:Number(pt.price),x:pt.x,y:pt.y}:null;}
function getDrawingPanelFromEvent(e){
  const target=e.target?.closest?.('.pane-price');
  if(target){
    const m=target.id.match(/pane-price-(\d+)/);if(m){const idx=Number(m[1]);return panelsArray.find(x=>x.index===idx)||null;}
  }
  const rects=panelsArray.map(p=>({p,el:document.getElementById(`pane-price-${p.index}`)}));
  return rects.find(r=>{if(!r.el)return false;const b=r.el.getBoundingClientRect();return e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;})?.p||null;
}
function handleChartMouseDown(e){
  const p=getDrawingPanelFromEvent(e); if(!p?.candleSeries||!p?.priceChart)return;
  const point=getDrawingPointFromEvent(e,p); if(!point)return;
  const {x,y,price,time}=point;

  if(activeTool==='eraser'){
    const idx=findDrawingAtPoint(x,y,p);
    if(idx!==-1){userDrawings.splice(idx,1);selectedDrawingIdx=-1;saveDrawingsToLocalStorage();rebuildAllPanels();}
    setTool('cursor',document.getElementById('tool-cursor')); e.preventDefault(); e.stopPropagation(); return;
  }

  if(activeTool==='cursor'||activeTool==='move'){
    const idx=findDrawingAtPoint(x,y,p);
    if(idx!==-1){
      selectedDrawingIdx=idx;
      drawingDragState={active:true,idx,startX:x,startY:y,lastTime:time,lastPrice:price,moved:false,panelIndex:p.index};
      const wrap=document.querySelector('.chart-wrap'); if(wrap)wrap.classList.add('drawing-dragging');
      e.preventDefault(); e.stopPropagation();
    } else { selectedDrawingIdx=-1; closeDrawingStyle(); }
    return;
  }

  if(activeTool==='hline'||activeTool==='vline'){
    const d=makeDrawingBase(activeTool);
    if(activeTool==='hline')d.price=price; else d.time=time;
    userDrawings.push(d); finalizeDrawing(); e.preventDefault(); e.stopPropagation(); return;
  }

  if(activeTool==='arrowup'||activeTool==='arrowdown'){
    if(!drawingState.isDrawing){drawingState={isDrawing:true,startPoint:{time,price,x,y},currentPoint:{time,price,x,y},midPoint:null};e.preventDefault();e.stopPropagation();return;}
    const d=makeDrawingBase(activeTool); d.p1=drawingState.startPoint; d.p2={time,price,x,y};
    d.color=activeTool==='arrowup'?'#00e676':'#ff3d5a';
    userDrawings.push(d); finalizeDrawing(); e.preventDefault(); e.stopPropagation(); return;
  }

  if(activeTool==='icon'){
    const d=makeDrawingBase('icon');
    Object.assign(d,{time,price,icon:selectedDrawingIcon,iconPosition:'center'});
    d.color = selectedDrawingIcon==='↓'||selectedDrawingIcon==='▼'||selectedDrawingIcon==='✕' ? '#ff3d5a' : '#00e676';
    userDrawings.push(d); finalizeDrawing(); e.preventDefault(); e.stopPropagation(); return;
  }

  if(activeTool==='text'){
    const text=prompt('Enter Text Note:','Support / Resistance');
    if(text){const d=makeDrawingBase('text');Object.assign(d,{time,price,text});userDrawings.push(d);finalizeDrawing();}
    e.preventDefault(); e.stopPropagation(); return;
  }

  if(!drawingState.isDrawing){drawingState.isDrawing=true;drawingState.startPoint={time,price,x,y};drawingState.currentPoint={time,price,x,y};e.preventDefault();e.stopPropagation();return;}
  const p2={time,price,x,y};
  if(activeTool==='curve'){
    if(!drawingState.midPoint){drawingState.midPoint=p2;drawingState.currentPoint=p2;e.preventDefault();e.stopPropagation();return;}
    const d=makeDrawingBase('curve');Object.assign(d,{p1:drawingState.startPoint,p2:drawingState.midPoint,p3:p2});userDrawings.push(d);finalizeDrawing();e.preventDefault();e.stopPropagation();return;
  }
  const d=makeDrawingBase(activeTool);d.p1=drawingState.startPoint;d.p2=p2;
  if(activeTool==='measure')d.color='#ffab00';
  if(activeTool==='long'||activeTool==='short'){
    const entry=d.p1.price,target=d.p2.price,rr=DRAW_DEFAULTS.rr||2,risk=Math.abs(target-entry)/(rr||2);
    d.entry=entry;d.target=target;d.rr=rr;d.stop=activeTool==='long'?entry-risk:entry+risk;
  }
  userDrawings.push(d);finalizeDrawing();e.preventDefault();e.stopPropagation();
}
function shiftDrawingByDelta(d,dt,dp){
  const shiftPoint=pt=>{if(!pt)return;pt.time=dt(pt.time);pt.price=Number(pt.price)+dp;};
  if(d.type==='hline'){d.price=Number(d.price)+dp;return;}
  if(d.type==='vline'){d.time=dt(d.time);return;}
  if(d.type==='text'||d.type==='icon'){d.time=dt(d.time);d.price=Number(d.price)+dp;return;}
  ['p1','p2','p3'].forEach(k=>shiftPoint(d[k]));
  if(d.type==='long'||d.type==='short'){
    d.entry=Number(d.entry)+dp;d.target=Number(d.target)+dp;d.stop=Number(d.stop)+dp;
  }
}
function timeKey(t){
  if(t==null)return '';
  if(typeof t==='object'&&t.year){return `${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`;}
  const s=String(t);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  if(/^\d{4}-\d{2}-\d{2}T/.test(s))return s.slice(0,10);
  const n=Number(t);
  if(Number.isFinite(n)){const ms=n<10000000000?n*1000:n;const d=new Date(ms);if(!isNaN(d.getTime()))return d.toISOString().slice(0,10);}
  const d=new Date(s);return isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}
function dateFromDrawingTime(t){
  const k=timeKey(t); if(!k)return null;
  const d=new Date(k+'T00:00:00Z'); return isNaN(d.getTime())?null:d;
}
function tradingDaysBetween(t1,t2){
  const a=dateFromDrawingTime(t1),b=dateFromDrawingTime(t2); if(!a||!b)return 0;
  let lo=a<=b?a:b,hi=a<=b?b:a,n=0;
  for(let d=new Date(lo);d<=hi;d.setUTCDate(d.getUTCDate()+1)){const day=d.getUTCDay();if(day!==0&&day!==6)n++;}
  return Math.max(0,n-1);
}
function formatDurationLabel(t1,t2){
  const a=dateFromDrawingTime(t1),b=dateFromDrawingTime(t2);if(!a||!b)return '—';
  return Math.round(Math.abs(b-a)/86400000)+' calendar day'+(Math.round(Math.abs(b-a)/86400000)===1?'':'s');
}
function getBarIndexForTime(time){
  if(!panelsArray[0])return 0;
  const data=aggregate(panelsArray[0].rawDailyCandles,panelsArray[0].interval)||[];let idx=0,min=Infinity;const target=timeKey(time);
  data.forEach((d,i)=>{const k=timeKey(d.time);const x=k===target?0:Math.abs((dateFromDrawingTime(k)?.getTime()||0)-(dateFromDrawingTime(target)?.getTime()||0));if(x<min){min=x;idx=i;}});return idx;
}
function getTimeFromXCoordinate(x,p){
  const data=aggregate(p.rawDailyCandles,p.interval);if(!data?.length)return null;let closest=data[0].time,min=Infinity;
  for(const d of data){const cx=p.priceChart.timeScale().timeToCoordinate(d.time);if(cx!=null){const diff=Math.abs(cx-x);if(diff<min){min=diff;closest=d.time;}}}
  return closest;
}
function findDrawingAtPoint(x,y,p){
  for(let i=userDrawings.length-1;i>=0;i--){const d=userDrawings[i];
    if(d.type==='hline'){const ly=p.candleSeries.priceToCoordinate(d.price);if(ly!=null&&Math.abs(y-ly)<10)return i;}
    else if(d.type==='vline'){const lx=p.priceChart.timeScale().timeToCoordinate(d.time);if(lx!=null&&Math.abs(x-lx)<10)return i;}
    else if(d.type==='text'||d.type==='icon'){const lx=p.priceChart.timeScale().timeToCoordinate(d.time),ly=p.candleSeries.priceToCoordinate(d.price);if(lx!=null&&ly!=null&&Math.hypot(x-lx,y-ly)<35)return i;}
    else if(d.p1&&d.p2&&['trendline','ray','arrowup','arrowdown','measure','fibonacci','long','short','circle','rectangle'].includes(d.type)){
      const x1=p.priceChart.timeScale().timeToCoordinate(d.p1.time),y1=p.candleSeries.priceToCoordinate(d.p1.price),x2=p.priceChart.timeScale().timeToCoordinate(d.p2.time),y2=p.candleSeries.priceToCoordinate(d.p2.price);if(x1==null||y1==null||x2==null||y2==null)continue;
      if(d.type==='rectangle'||d.type==='circle'||d.type==='measure'||d.type==='fibonacci'||d.type==='long'||d.type==='short'){const bx=Math.min(x1,x2),by=Math.min(y1,y2),bw=Math.abs(x2-x1),bh=Math.abs(y2-y1);if(x>=bx-10&&x<=bx+bw+10&&y>=by-10&&y<=by+bh+10)return i;}
      else if(distToSegment({x,y},{x:x1,y:y1},{x:x2,y:y2})<10)return i;
    }
    else if(d.type==='curve'&&d.p1&&d.p2&&d.p3){
      const x1=p.priceChart.timeScale().timeToCoordinate(d.p1.time),y1=p.candleSeries.priceToCoordinate(d.p1.price),xc=p.priceChart.timeScale().timeToCoordinate(d.p2.time),yc=p.candleSeries.priceToCoordinate(d.p2.price),x2=p.priceChart.timeScale().timeToCoordinate(d.p3.time),y2=p.candleSeries.priceToCoordinate(d.p3.price);if([x1,y1,xc,yc,x2,y2].every(v=>v!=null)){let prev={x:x1,y:y1};for(let q=1;q<=20;q++){const t=q/20,u=1-t,cur={x:u*u*x1+2*u*t*xc+t*t*x2,y:u*u*y1+2*u*t*yc+t*t*y2};if(distToSegment({x,y},prev,cur)<10)return i;prev=cur;}}
    }
  }
  return -1;
}
function distToSegment(p,v,w){const l2=(w.x-v.x)**2+(w.y-v.y)**2;if(l2===0)return Math.hypot(p.x-v.x,p.y-v.y);let t=((p.x-v.x)*(w.x-v.x)+(p.y-v.y)*(w.y-v.y))/l2;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(v.x+t*(w.x-v.x)),p.y-(v.y+t*(w.y-v.y)));}
function showSelectiveDeleteBtn(){ /* legacy no-op: compact popup is used */ }
function hideSelectiveDeleteBtn(){ selectedDrawingIdx=-1; }
function deleteSelectedDrawing(){
  if(selectedDrawingIdx!==-1&&selectedDrawingIdx<userDrawings.length){
    userDrawings.splice(selectedDrawingIdx,1);
    selectedDrawingIdx=-1;
    saveDrawingsToLocalStorage();
    closeDrawingStyle();
    rebuildAllPanels();
  }
}
function openDrawingStyle(x,y){
  const pop=document.getElementById('drawing-style-pop');
  if(!pop||selectedDrawingIdx<0||selectedDrawingIdx>=userDrawings.length)return;
  const d=userDrawings[selectedDrawingIdx];
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val;};
  set('ds-color',d.color||DRAW_DEFAULTS.color);
  set('ds-width',String(d.width||1));
  set('ds-style',d.style||'solid');
  set('ds-fill',d.fill||d.color||DRAW_DEFAULTS.fill);
  set('ds-opacity',String(d.opacity??12));
  const op=document.getElementById('ds-opacity-val');if(op)op.textContent=(d.opacity??12)+'%';
  set('ds-rr',d.rr||2);
  const rr=document.getElementById('ds-rr-wrap');if(rr)rr.style.display=(d.type==='long'||d.type==='short')?'block':'none';
  set('ds-alert-direction',d.alertDirection||'both');
  const ab=document.getElementById('ds-alert-btn');if(ab)ab.classList.toggle('active',!!d.alertEnabled);
  renderDrawingStats(d);
  pop.classList.remove('expanded');
  const left=Math.min(window.innerWidth-228,Math.max(46,(x||70)+14));
  const top=Math.min(window.innerHeight-52,Math.max(38,(y||70)-14));
  pop.style.left=left+'px';pop.style.top=top+'px';pop.classList.add('open');
}
function closeDrawingStyle(){const p=document.getElementById('drawing-style-pop');if(p)p.classList.remove('open');}
function toggleDrawingStyleMore(){const p=document.getElementById('drawing-style-pop');if(p)p.classList.toggle('expanded');}
function toggleDrawingAlert(){
  if(selectedDrawingIdx<0||selectedDrawingIdx>=userDrawings.length)return;
  const d=userDrawings[selectedDrawingIdx];
  d.alertEnabled=!d.alertEnabled;
  d.alertDirection=document.getElementById('ds-alert-direction')?.value||d.alertDirection||'both';
  if(d.alertEnabled&&'Notification' in window&&Notification.permission==='default'){try{Notification.requestPermission();}catch(e){}}
  saveDrawingsToLocalStorage();
  const b=document.getElementById('ds-alert-btn');if(b)b.classList.toggle('active',!!d.alertEnabled);
  showDrawingSaveStatus(d.alertEnabled?'Crossing alert ON':'Crossing alert OFF',true);
}
function editSelectedDrawing(){
  if(selectedDrawingIdx<0&&userDrawings.length)selectedDrawingIdx=userDrawings.length-1;
  if(selectedDrawingIdx>=0)openDrawingStyle(window.innerWidth/2-110,80);
}
function applyDrawingStyle(){
  if(selectedDrawingIdx<0||selectedDrawingIdx>=userDrawings.length)return;
  const d=userDrawings[selectedDrawingIdx];
  d.color=document.getElementById('ds-color')?.value||DRAW_DEFAULTS.color;
  d.width=Number(document.getElementById('ds-width')?.value)||1;
  d.style=document.getElementById('ds-style')?.value||'solid';
  d.fill=document.getElementById('ds-fill')?.value||d.color;
  d.opacity=Number(document.getElementById('ds-opacity')?.value)||0;
  d.alertDirection=document.getElementById('ds-alert-direction')?.value||d.alertDirection||'both';
  if(d.type==='long'||d.type==='short'){
    d.rr=Math.max(.25,Number(document.getElementById('ds-rr')?.value)||2);
    const risk=Math.abs((d.target??d.p2.price)-(d.entry??d.p1.price))/d.rr;
    d.stop=d.type==='long'?(d.entry??d.p1.price)-risk:(d.entry??d.p1.price)+risk;
  }
  saveDrawingsToLocalStorage();rebuildAllPanels();renderDrawingStats(d);showDrawingSaveStatus('Drawing updated',true);
}
function renderDrawingStats(d){
  const el=document.getElementById('ds-stats');if(!el)return;
  if(d.type==='measure'&&d.p1&&d.p2){
    const days=tradingDaysBetween(d.p1.time,d.p2.time);
    const bars=Math.abs(getBarIndexForTime(d.p2.time)-getBarIndexForTime(d.p1.time));
    const pct=d.p1.price?((d.p2.price-d.p1.price)/d.p1.price*100):0;
    el.style.display='block';
    el.innerHTML=`<b>RULER</b><br>Price: ₹${(d.p2.price-d.p1.price).toFixed(2)}<br>Change: ${pct>=0?'+':''}${pct.toFixed(2)}%<br>Bars: ${bars}<br>Trading days: ${days}<br>Δ: ${formatDurationLabel(d.p1.time,d.p2.time)}`;
  }else if((d.type==='long'||d.type==='short')&&d.entry!=null){
    const rr=Math.abs((d.target-d.entry)/(d.entry-d.stop||1));
    const targetPct=Math.abs((d.target-d.entry)/d.entry*100);
    el.style.display='block';
    el.innerHTML=`<b>${d.type==='long'?'LONG':'SHORT'} POSITION</b><br>Entry: ₹${d.entry.toFixed(2)}<br>Stop: ₹${d.stop.toFixed(2)}<br>Target: ₹${d.target.toFixed(2)}<br>Risk/Reward: 1:${rr.toFixed(2)}<br>Target: ${targetPct.toFixed(2)}%`;
  }else el.style.display='none';
}

function handleChartMouseMove(e){
  if(drawingDragState.active){
    const p=panelsArray.find(x=>x.index===drawingDragState.panelIndex)||panelsArray[0],point=getDrawingPointFromEvent(e,p);if(point){
      const idx=drawingDragState.idx,d=userDrawings[idx];
      if(d){
        const prevTime=drawingDragState.lastTime,prevPrice=drawingDragState.lastPrice;
        const prevDate=dateFromDrawingTime(prevTime),newDate=dateFromDrawingTime(point.time);
        const daysDelta=prevDate&&newDate?Math.round((newDate-prevDate)/86400000):0;
        const shiftTime=(t)=>{const base=dateFromDrawingTime(t);if(!base||!daysDelta)return t;base.setUTCDate(base.getUTCDate()+daysDelta);return base.toISOString().slice(0,10);};
        const dp=Number(point.price)-Number(prevPrice??point.price);
        shiftDrawingByDelta(d,shiftTime,dp);
        drawingDragState.lastTime=point.time;drawingDragState.lastPrice=point.price;
        drawingDragState.moved=drawingDragState.moved||Math.hypot(point.x-drawingDragState.startX,point.y-drawingDragState.startY)>3;
        saveDrawingsToLocalStorage();panelsArray.forEach(drawPanelOverlays);
        e.preventDefault(); e.stopPropagation();
      }
    }
    return;
  }
  if(!drawingState.isDrawing||!panelsArray.length)return;
  const p=getDrawingPanelFromEvent(e);if(!p)return;const point=getDrawingPointFromEvent(e,p);if(!point)return;
  drawingState.currentPoint=point;drawPanelOverlays(p);e.preventDefault();e.stopPropagation();
}
function handleChartMouseUp(e){
  if(!drawingDragState.active)return;
  const moved=drawingDragState.moved, dragPanelIndex=drawingDragState.panelIndex;
  drawingDragState={active:false,idx:-1,startX:0,startY:0,lastTime:null,lastPrice:null,moved:false,panelIndex:0};
  const wrap=document.querySelector('.chart-wrap');if(wrap)wrap.classList.remove('drawing-dragging');
  if(moved){saveDrawingsToLocalStorage();rebuildAllPanels();showDrawingSaveStatus('Drawing moved & saved',true);}
  else if(selectedDrawingIdx>=0){
    openDrawingStyle(e.clientX,e.clientY);
  }
  e.preventDefault();e.stopPropagation();
}

function clearDrawings(){if(!confirm('Clear all drawings for this symbol?'))return;userDrawings=[];drawingState={isDrawing:false,startPoint:null,currentPoint:null,midPoint:null};drawingDragState={active:false,idx:-1,startX:0,startY:0,lastTime:null,lastPrice:null,moved:false};saveDrawingsToLocalStorage();selectedDrawingIdx=-1;closeDrawingStyle();rebuildAllPanels();}

function fmtVol(v){
  if (!v) return '0';
  if (v >= 1e7) return (v/1e7).toFixed(2)+'Cr';
  if (v >= 1e5) return (v/1e5).toFixed(2)+'L';
  if (v >= 1e3) return (v/1e3).toFixed(1)+'K';
  return String(v);
}

