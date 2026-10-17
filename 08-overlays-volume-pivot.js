/* ============ DYNAMIC PANEL CANVAS OVERLAYS ============ */
function hexToRgba(hex, alpha){
  const h=String(hex||'').replace('#','');
  if(!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(0,230,118,${alpha})`;
  const n=parseInt(h,16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function syncHighlightControlValues(){
  const ea=document.getElementById('ema-align-opacity'); if(ea)ea.value=String(Math.round((emaAlignmentConfig.opacity||0.01)*100));
  const ev=document.getElementById('ema-align-opacity-val'); if(ev)ev.textContent=Math.round((emaAlignmentConfig.opacity||0.01)*100)+'%';
  const ra=document.getElementById('rsi-highlight-opacity'); if(ra)ra.value=String(Math.round((rsiHighlightConfig.opacity||0.01)*100));
  const rv=document.getElementById('rsi-highlight-opacity-val'); if(rv)rv.textContent=Math.round((rsiHighlightConfig.opacity||0.01)*100)+'%';
}

function updateEMAAlignmentConfig(){
  emaAlignmentConfig.enabled=document.getElementById('ema-align-en')?.checked??false;
  emaAlignmentConfig.rangePct=Math.max(0.1,Number(document.getElementById('ema-align-range')?.value)||2);
  emaAlignmentConfig.color=document.getElementById('ema-align-color')?.value||'#00e676';
  const opPct=Math.max(1,Math.min(35,Number(document.getElementById('ema-align-opacity')?.value)||1));
  emaAlignmentConfig.opacity=opPct/100;
  emaAlignmentConfig.fill=hexToRgba(emaAlignmentConfig.color,emaAlignmentConfig.opacity);
  const opLabel=document.getElementById('ema-align-opacity-val'); if(opLabel)opLabel.textContent=opPct+'%';
  if(currentSymbol)rebuildAllPanels();
}

function drawEMAAlignmentBackground(panel,data){
  if(!emaAlignmentConfig.enabled||!panel?.overlayCanvas||!panel?.candleSeries||!data?.length)return;
  const ctx=panel.overlayCanvas.getContext('2d'),rect=panel.overlayCanvas.parentElement.getBoundingClientRect();
  const e10=calculateEMAValues(data,10),e20=calculateEMAValues(data,20),e50=calculateEMAValues(data,50),e200=calculateEMAValues(data,200);
  let seg=null;
  const flush=(a,b)=>{if(a==null||b==null||b<=a)return;ctx.save();ctx.fillStyle=emaAlignmentConfig.fill;ctx.fillRect(a,0,b-a,rect.height);ctx.restore();};
  for(let i=0;i<data.length;i++){
    const vals=[e10[i],e20[i],e50[i],e200[i]].map(Number); if(vals.some(v=>!Number.isFinite(v)||v<=0))continue;
    const min=Math.min(...vals),max=Math.max(...vals),spread=(max-min)/min*100;
    const x=panel.priceChart.timeScale().timeToCoordinate(data[i].time); if(x==null)continue;
    if(spread<=emaAlignmentConfig.rangePct){if(seg==null)seg=Math.max(0,x-3);}
    else if(seg!=null){flush(seg,x+1);seg=null;}
  }
  if(seg!=null)flush(seg,rect.width);
}

function drawRSIHighlightBackground(panel){
  const canvas=panel?.rsiHighlightCanvas; if(!canvas)return;
  const pane=document.getElementById(`pane-rsi-${panel.index}`);if(!pane)return;
  const w=Math.max(1,pane.clientWidth),h=Math.max(1,pane.clientHeight),dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!rsiHighlightConfig.enabled||!rsiConfig.enabled||!panel.rsiSeries||!panel.rsiValueByTime?.length)return;
  let seg=null;
  const flush=(a,b)=>{if(a==null||b==null||b<=a)return;ctx.fillStyle=rsiHighlightConfig.fill;ctx.fillRect(a,0,b-a,h);};
  for(const pt of panel.rsiValueByTime){
    const x=panel.rsiChart.timeScale().timeToCoordinate(pt.time);if(x==null)continue;
    if(Number(pt.value)>rsiHighlightConfig.threshold){if(seg==null)seg=Math.max(0,x-2);}
    else if(seg!=null){flush(seg,x+1);seg=null;}
  }
  if(seg!=null)flush(seg,w);
}

function updateRSIHighlightConfig(){
  rsiHighlightConfig.enabled=document.getElementById('rsi-highlight-en')?.checked??false;
  rsiHighlightConfig.threshold=Math.max(50,Math.min(95,Number(document.getElementById('rsi-highlight-thresh')?.value)||60));
  rsiHighlightConfig.color=document.getElementById('rsi-highlight-color')?.value||'#ffc107';
  const opPct=Math.max(1,Math.min(35,Number(document.getElementById('rsi-highlight-opacity')?.value)||1));
  rsiHighlightConfig.opacity=opPct/100;
  rsiHighlightConfig.fill=hexToRgba(rsiHighlightConfig.color,rsiHighlightConfig.opacity);
  const opLabel=document.getElementById('rsi-highlight-opacity-val'); if(opLabel)opLabel.textContent=opPct+'%';
  if(currentSymbol)rebuildAllPanels();
}

function updateVolumeProfileConfig(){
  volumeProfileConfig.enabled=document.getElementById('vp-en')?.checked??false;
  volumeProfileConfig.pocEnabled=document.getElementById('vp-poc-en')?.checked??true;
  volumeProfileConfig.rows=Math.max(8,Math.min(100,Number(document.getElementById('vp-rows')?.value)||24));
  volumeProfileConfig.valueArea=Math.max(50,Math.min(90,Number(document.getElementById('vp-va')?.value)||70));
  volumeProfileConfig.widthPct=Math.max(10,Math.min(50,Number(document.getElementById('vp-width')?.value)||28));
  volumeProfileConfig.opacity=Math.max(10,Math.min(100,Number(document.getElementById('vp-opacity')?.value)||55));
  requestAnimationFrame(()=>panelsArray.forEach(p=>{try{drawVolumeProfile(p);}catch(e){}}));
}
function drawVolumeProfile(panel){
  const canvas=panel?.volumeProfileCanvas,pane=document.getElementById(`pane-price-${panel?.index}`);if(!canvas||!pane||!panel?.priceChart||!panel?.candleSeries)return;
  const w=Math.max(1,pane.clientWidth),h=Math.max(1,pane.clientHeight),dpr=window.devicePixelRatio||1;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const all=getPanelDisplayData(panel);if(!all.length)return;
  const range=panel.priceChart.timeScale().getVisibleLogicalRange();let a=0,b=all.length-1;if(range){a=Math.max(0,Math.floor(range.from));b=Math.min(all.length-1,Math.ceil(range.to));}if(b<=a)return;
  const slice=all.slice(a,b+1);let lo=Infinity,hi=-Infinity;slice.forEach(c=>{lo=Math.min(lo,Number(c.low));hi=Math.max(hi,Number(c.high));});if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=lo)return;
  const rows=volumeProfileConfig.rows,bins=Array(rows).fill(0),step=(hi-lo)/rows;slice.forEach(c=>{const vol=Math.max(0,Number(c.volume)||0),typ=(Number(c.high)+Number(c.low)+Number(c.close))/3;let idx=Math.floor((typ-lo)/step);idx=Math.max(0,Math.min(rows-1,idx));bins[idx]+=vol;});
  const maxVol=Math.max(...bins,1),poc=bins.indexOf(maxVol);
  if(volumeProfileConfig.enabled){let target=maxVol*volumeProfileConfig.valueArea/100,acc=bins[poc],left=poc,right=poc;while(acc<target&&(left>0||right<rows-1)){const lv=left>0?bins[left-1]:-1,rv=right<rows-1?bins[right+1]:-1;if(rv>=lv&&right<rows-1){right++;acc+=bins[right];}else if(left>0){left--;acc+=bins[left];}else break;}const profileW=w*volumeProfileConfig.widthPct/100,x0=w-profileW-8;for(let i=0;i<rows;i++){const yTop=panel.candleSeries.priceToCoordinate(hi-i*step),yBot=panel.candleSeries.priceToCoordinate(hi-(i+1)*step);if(yTop==null||yBot==null)continue;const bh=Math.max(1,Math.abs(yBot-yTop)-.5),bw=profileW*(bins[i]/maxVol);ctx.fillStyle=(i>=left&&i<=right)?`rgba(0,212,255,${volumeProfileConfig.opacity/100*.65})`:`rgba(96,125,139,${volumeProfileConfig.opacity/100*.55})`;ctx.fillRect(x0+profileW-bw,Math.min(yTop,yBot),bw,bh);}}
  if(volumeProfileConfig.pocEnabled){const pocPrice=lo+(poc+.5)*step,yPoc=panel.candleSeries.priceToCoordinate(pocPrice);if(yPoc!=null){ctx.save();ctx.strokeStyle='#ff3d5a';ctx.globalAlpha=.95;ctx.lineWidth=1;ctx.setLineDash([2,8]);ctx.beginPath();ctx.moveTo(0,yPoc);ctx.lineTo(w,yPoc);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ff3d5a';ctx.font='700 8px JetBrains Mono,monospace';ctx.fillText(`POC ${pocPrice.toFixed(2)}`,Math.max(4,w-72),yPoc-4);ctx.restore();}}
}

function drawPanelOverlays(panel) {
  if (!panel || !panel.overlayCanvas || !panel.priceChart || !panel.candleSeries) return;
  const canvas = panel.overlayCanvas;
  const parent = canvas.parentElement;
  if (!parent) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = parent.getBoundingClientRect();

  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);

  const data = aggregate(panel.rawDailyCandles, panel.interval);
  if (!data || !data.length) return;

  drawEMAAlignmentBackground(panel,data);
  drawCPROverlay(panel, data);
  draw52WLines(panel, data);
  drawAutoTrendlines(panel, data);
  drawRSIHighlightBackground(panel);
  drawVolumeProfile(panel);

  if (emaEnvelopeEnabled && emaConfigs[0].enabled && emaConfigs[1].enabled) {
    try {
      const e9Val = calculateEMAValues(data, emaConfigs[0].len);
      const e21Val = calculateEMAValues(data, emaConfigs[1].len);

      for (let i = 1; i < data.length; i++) {
        const x1 = panel.priceChart.timeScale().timeToCoordinate(data[i - 1].time);
        const x2 = panel.priceChart.timeScale().timeToCoordinate(data[i].time);
        if (x1 === null || x2 === null) continue;

        const y9_1 = panel.candleSeries.priceToCoordinate(e9Val[i - 1]);
        const y21_1 = panel.candleSeries.priceToCoordinate(e21Val[i - 1]);
        const y9_2 = panel.candleSeries.priceToCoordinate(e9Val[i]);
        const y21_2 = panel.candleSeries.priceToCoordinate(e21Val[i]);

        if (y9_1 === null || y21_1 === null || y9_2 === null || y21_2 === null) continue;

        const isBullish = e9Val[i] >= e21Val[i];
        ctx.fillStyle = isBullish ? 'rgba(8, 153, 129, 0.18)' : 'rgba(242, 54, 69, 0.18)';

        ctx.beginPath();
        ctx.moveTo(x1, y9_1);
        ctx.lineTo(x2, y9_2);
        ctx.lineTo(x2, y21_2);
        ctx.lineTo(x1, y21_1);
        ctx.closePath();
        ctx.fill();
      }
    } catch(e){}
  }

  if (gapConfig.enabled) {
    try {
      const gaps = calculateGapsForData(data);
      gaps.forEach(gap => {
        const x1 = panel.priceChart.timeScale().timeToCoordinate(gap.startTime);
        let x2;
        if (gap.fillTime) {
          x2 = panel.priceChart.timeScale().timeToCoordinate(gap.fillTime);
        } else {
          const lastX = panel.priceChart.timeScale().timeToCoordinate(data[data.length - 1].time);
          x2 = lastX !== null ? (lastX + 15) : rect.width;
        }

        const yTop = panel.candleSeries.priceToCoordinate(gap.top);
        const yBottom = panel.candleSeries.priceToCoordinate(gap.bottom);

        if (x1 === null || yTop === null || yBottom === null) return;

        const boxLeft = Math.min(x1, x2 || rect.width);
        const boxRight = Math.max(x1, x2 || rect.width);
        const boxWidth = Math.max(boxRight - boxLeft, 2);
        const boxY = Math.min(yTop, yBottom);
        const boxHeight = Math.abs(yBottom - yTop);

        ctx.fillStyle = gap.isUp ? 'rgba(76, 175, 80, 0.16)' : 'rgba(255, 82, 82, 0.16)';
        ctx.strokeStyle = gap.isUp ? 'rgba(76, 175, 80, 0.7)' : 'rgba(255, 82, 82, 0.7)';
        ctx.lineWidth = 1;
        ctx.fillRect(boxLeft, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxLeft, boxY, boxWidth, boxHeight);
      });
    } catch(e){}
  }

  if (mcpConfig.enabled) {
    try {
      const coils = calculateMCPForData(data);
      coils.forEach(mcp => {
        const x1 = panel.priceChart.timeScale().timeToCoordinate(mcp.startTime);
        let x2;
        if (mcp.endTime) {
          const nextX = panel.priceChart.timeScale().timeToCoordinate(mcp.endTime);
          x2 = nextX !== null ? nextX : rect.width;
        } else {
          const lastX = panel.priceChart.timeScale().timeToCoordinate(data[data.length - 1].time);
          x2 = lastX !== null ? Math.max(lastX + 40, rect.width) : rect.width;
        }

        const yTop = panel.candleSeries.priceToCoordinate(mcp.high);
        const yBottom = panel.candleSeries.priceToCoordinate(mcp.low);

        if (x1 === null || yTop === null || yBottom === null) return;

        const boxLeft = Math.min(x1, x2);
        const boxRight = Math.max(x1, x2);
        const boxWidth = Math.max(boxRight - boxLeft, 2);
        const boxY = Math.min(yTop, yBottom);
        const boxHeight = Math.abs(yBottom - yTop);

        ctx.fillStyle = 'rgba(245, 240, 220, 0.22)';
        ctx.strokeStyle = 'rgba(200, 190, 140, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);

        ctx.fillRect(boxLeft, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxLeft, boxY, boxWidth, boxHeight);
        ctx.setLineDash([]);
      });
    } catch(e){}
  }

  if (panel.index === 0) {
    const setDash=(ctx,style)=>ctx.setLineDash(style==='dashed'?[6,4]:style==='dotted'?[2,4]:[]);
    const rgba=(hex,a)=>{const h=(hex||'#00d4ff').replace('#','');const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;};
    const drawArrow=(ctx,x1,y1,x2,y2,color,width,dir=1)=>{const ang=Math.atan2(y2-y1,x2-x1);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();const ah=9+width*2;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-ah*Math.cos(ang-.55),y2-ah*Math.sin(ang-.55));ctx.moveTo(x2,y2);ctx.lineTo(x2-ah*Math.cos(ang+.55),y2-ah*Math.sin(ang+.55));ctx.stroke();};
    userDrawings.forEach(d=>{try{
      const col=d.color||'#00d4ff',w=Number(d.width||1);ctx.strokeStyle=col;ctx.lineWidth=w;setDash(ctx,d.style||'solid');
      if(d.type==='hline'){const y=panel.candleSeries.priceToCoordinate(d.price);if(y!=null){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(rect.width,y);ctx.stroke();}}
      else if(d.type==='vline'){const x=panel.priceChart.timeScale().timeToCoordinate(d.time);if(x!=null){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,rect.height);ctx.stroke();}}
      else if(d.type==='trendline'||d.type==='ray'||d.type==='arrowup'||d.type==='arrowdown'){const x1=panel.priceChart.timeScale().timeToCoordinate(d.p1?.time),y1=panel.candleSeries.priceToCoordinate(d.p1?.price),x2=panel.priceChart.timeScale().timeToCoordinate(d.p2?.time),y2=panel.candleSeries.priceToCoordinate(d.p2?.price);if(x1!=null&&y1!=null&&x2!=null&&y2!=null){let ex=x2,ey=y2;if(d.type==='ray'){const dx=x2-x1,dy=y2-y1;if(Math.abs(dx)>0.001){ex=dx>0?rect.width:0;ey=y1+(ex-x1)*(dy/dx);}}if(d.type==='arrowup'||d.type==='arrowdown')drawArrow(ctx,x1,y1,x2,y2,col,w,d.type==='arrowup'?1:-1);else{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(ex,ey);ctx.stroke();}}}
      else if(d.type==='rectangle'||d.type==='measure'||d.type==='fibonacci'||d.type==='long'||d.type==='short'||d.type==='circle'){const x1=panel.priceChart.timeScale().timeToCoordinate(d.p1?.time),y1=panel.candleSeries.priceToCoordinate(d.p1?.price),x2=panel.priceChart.timeScale().timeToCoordinate(d.p2?.time),y2=panel.candleSeries.priceToCoordinate(d.p2?.price);if(x1==null||y1==null||x2==null||y2==null)return;const bx=Math.min(x1,x2),by=Math.min(y1,y2),bw=Math.abs(x2-x1),bh=Math.abs(y2-y1);
        if(d.type==='rectangle'){ctx.fillStyle=rgba(d.fill||col,(Number(d.opacity??12)/100));ctx.fillRect(bx,by,bw,bh);ctx.strokeRect(bx,by,bw,bh);}
        if(d.type==='circle'){ctx.beginPath();ctx.ellipse(bx+bw/2,by+bh/2,Math.max(2,bw/2),Math.max(2,bh/2),0,0,Math.PI*2);ctx.stroke();}
        if(d.type==='measure'){ctx.fillStyle=rgba(d.fill||'#ffab00',(Number(d.opacity??12)/100));ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle=col;ctx.strokeRect(bx,by,bw,bh);const pct=d.p1.price?((d.p2.price-d.p1.price)/d.p1.price*100):0;const days=tradingDaysBetween(d.p1.time,d.p2.time);ctx.fillStyle=col;ctx.font='11px JetBrains Mono, monospace';ctx.fillText(`₹${(d.p2.price-d.p1.price).toFixed(2)}  ${pct>=0?'+':''}${pct.toFixed(2)}%  • ${days}D`,bx+6,Math.max(14,by+15));}
        if(d.type==='fibonacci'){const levels=[0,.236,.382,.5,.618,.786,1];levels.forEach(l=>{const py=panel.candleSeries.priceToCoordinate(d.p1.price+(d.p2.price-d.p1.price)*l);if(py!=null){ctx.strokeStyle=col;ctx.globalAlpha=.75;ctx.beginPath();ctx.moveTo(bx,py);ctx.lineTo(bx+bw,py);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=col;ctx.font='10px JetBrains Mono, monospace';ctx.fillText(`${(l*100).toFixed(1)}%`,bx+bw+4,py+3);}});}
        if(d.type==='long'||d.type==='short'){const entry=d.entry??d.p1.price,target=d.target??d.p2.price,stop=d.stop??entry;const ye=panel.candleSeries.priceToCoordinate(entry),yt=panel.candleSeries.priceToCoordinate(target),ys=panel.candleSeries.priceToCoordinate(stop);const right=Math.min(rect.width-5,Math.max(x1,x2)+40);if(ye!=null&&yt!=null&&ys!=null){ctx.fillStyle=rgba('#00e676',.13);ctx.fillRect(bx,Math.min(ye,yt),Math.max(20,right-bx),Math.abs(yt-ye));ctx.fillStyle=rgba('#ff3d5a',.13);ctx.fillRect(bx,Math.min(ye,ys),Math.max(20,right-bx),Math.abs(ys-ye));ctx.strokeStyle='#00e676';ctx.beginPath();ctx.moveTo(bx,ye);ctx.lineTo(right,ye);ctx.stroke();ctx.strokeStyle='#ff3d5a';ctx.beginPath();ctx.moveTo(bx,ys);ctx.lineTo(right,ys);ctx.stroke();ctx.fillStyle=col;ctx.font='10px JetBrains Mono, monospace';ctx.fillText(`${d.type==='long'?'LONG':'SHORT'}  RR 1:${Number(d.rr||2).toFixed(2)}`,bx+5,Math.min(rect.height-5,Math.max(12,Math.min(ye,yt,ys)-4)));}}
      }
      else if(d.type==='curve'&&d.p1&&d.p2&&d.p3){const x1=panel.priceChart.timeScale().timeToCoordinate(d.p1.time),y1=panel.candleSeries.priceToCoordinate(d.p1.price),xc=panel.priceChart.timeScale().timeToCoordinate(d.p2.time),yc=panel.candleSeries.priceToCoordinate(d.p2.price),x2=panel.priceChart.timeScale().timeToCoordinate(d.p3.time),y2=panel.candleSeries.priceToCoordinate(d.p3.price);if([x1,y1,xc,yc,x2,y2].every(v=>v!=null)){ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(xc,yc,x2,y2);ctx.stroke();}}
      else if(d.type==='icon'){const x=panel.priceChart.timeScale().timeToCoordinate(d.time),y=panel.candleSeries.priceToCoordinate(d.price);if(x!=null&&y!=null){ctx.fillStyle=col;ctx.font='700 16px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(d.icon||'↑',x,y);ctx.textAlign='start';ctx.textBaseline='alphabetic';}}
      else if(d.type==='text'){const x=panel.priceChart.timeScale().timeToCoordinate(d.time),y=panel.candleSeries.priceToCoordinate(d.price);if(x!=null&&y!=null){ctx.fillStyle=col;ctx.font='12px JetBrains Mono, monospace';ctx.fillText(d.text||'',x,y);}}
      ctx.setLineDash([]);
    }catch(e){ctx.setLineDash([]);}});
    if(drawingState.isDrawing&&drawingState.startPoint&&drawingState.currentPoint){try{const p1=drawingState.startPoint,p2=drawingState.currentPoint,x1=panel.priceChart.timeScale().timeToCoordinate(p1.time),y1=panel.candleSeries.priceToCoordinate(p1.price),x2=panel.priceChart.timeScale().timeToCoordinate(p2.time),y2=panel.candleSeries.priceToCoordinate(p2.price);if([x1,y1,x2,y2].every(v=>v!=null)){ctx.strokeStyle='#00d4ff';ctx.lineWidth=1;ctx.setLineDash([4,3]);if(activeTool==='trendline'||activeTool==='ray'||activeTool==='arrowup'||activeTool==='arrowdown'){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}else if(activeTool==='rectangle'||activeTool==='measure'||activeTool==='circle'||activeTool==='long'||activeTool==='short'){const bx=Math.min(x1,x2),by=Math.min(y1,y2),bw=Math.abs(x2-x1),bh=Math.abs(y2-y1);if(activeTool==='circle'){ctx.beginPath();ctx.ellipse(bx+bw/2,by+bh/2,Math.max(2,bw/2),Math.max(2,bh/2),0,0,Math.PI*2);ctx.stroke();}else{ctx.strokeRect(bx,by,bw,bh);}}else if(activeTool==='curve'&&drawingState.midPoint){const xc=panel.priceChart.timeScale().timeToCoordinate(drawingState.midPoint.time),yc=panel.candleSeries.priceToCoordinate(drawingState.midPoint.price);if(xc!=null&&yc!=null){ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(xc,yc,x2,y2);ctx.stroke();}}ctx.setLineDash([]);}}catch(e){}}
  }
}

/* ============ POCKET PIVOT VOLUME ENGINE ============ */
function renderPocketPivotVolume(data, panel) {
  if (!data || !data.length) return;
  if (!activeIndicators.ppv) {
    panel.volumeSeries.setData(data.map(c => ({ time: c.time, value: Number(c.volume||0), color: (c.close>=c.open?'#00e67655':'#ff3d5a55') })));
    try { panel.volumeSeries.setMarkers([]); } catch(e){}
    renderVolumeMALine(data, panel, []);
    return;
  }

  try {
    let highestEver = 0; const volData = [], markers = [];
    const volSMA = computeSMA(data.map(d=>Number(d.volume||0)), volMAConfig.len || 30);

    for(let i=0; i<data.length; i++){
      const v = Number(data[i].volume || 0), close = Number(data[i].close || 0);
      const prevClose = i>0 ? Number(data[i-1].close || close) : close;
      if (v > highestEver) highestEver = v;

      let max252 = 0, max63 = 0, min252 = Infinity, min63 = Infinity, max10P = 0, max5P = 0;
      for(let j = Math.max(0, i-251); j <= i; j++){ const jv = Number(data[j].volume || 0); if (jv > max252) max252 = jv; if (jv < min252) min252 = jv; }
      for(let j = Math.max(0, i-62); j <= i; j++){ const jv = Number(data[j].volume || 0); if (jv > max63) max63 = jv; if (jv < min63) min63 = jv; }
      for(let j = Math.max(0, i-9); j < i; j++){ const jv = Number(data[j].volume || 0); if (jv > max10P) max10P = jv; }
      for(let j = Math.max(0, i-4); j < i; j++){ const jv = Number(data[j].volume || 0); if (jv > max5P) max5P = jv; }

      const ma = volSMA[i] || v;
      const isHighVol = v > (ma * 5), is10P = v > max10P, is5P = v > max5P;
      let color = close >= prevClose ? '#00e67688' : '#ff3d5a88', tagText = null;
      const vM = (v / 1000000).toFixed(2);

      if (v === highestEver && v > 0) { color = '#00e676'; tagText = 'HEV: ' + vM; }
      else if (v < ma * 0.5) { color = '#1e2d3d'; }
      else if (v === max252 && v > 0) { color = '#ffab00'; tagText = 'HVY: ' + vM; }
      else if (v === max63 && v > 0) { color = '#ffab00'; tagText = 'HVQ: ' + vM; }
      else if (v === min252 && min252 !== Infinity) { color = '#800000'; tagText = 'Y'; }
      else if (v === min63 && min63 !== Infinity) { color = '#800000'; tagText = 'Q'; }
      else if (isHighVol) { color = '#00d4ff'; tagText = '>5x: ' + vM; }
      else if (is10P) { color = '#00bcd4'; tagText = '10P'; }
      else if (is5P) { color = '#00bcd4'; tagText = '5P'; }

      volData.push({ time: data[i].time, value: v, color: color });
      if(tagText && i >= data.length - 80){
        markers.push({ time: data[i].time, position: 'aboveBar', color: close >= prevClose ? '#00d4ff' : '#ff3d5a', shape: 'none', text: tagText });
      }
    }

    panel.volumeSeries.setData(volData);
    try { panel.volumeSeries.setMarkers(markers); } catch(me){}
    renderVolumeMALine(data, panel, volSMA);
  } catch(e){}
}

/* ============ POCKET PIVOT STATS WIDGET ============ */
function renderPocketPivotStatsWidget(data){
  const statsWidget = document.getElementById('ppv-stats-widget');
  if (!activeIndicators.ppv || !data || !data.length) {
    if (statsWidget) statsWidget.style.display = 'none';
    return;
  }
  statsWidget.style.display = 'flex';

  try {
    const last = data[data.length - 1];
    let upVolSum = 0, downVolSum = 0;
    const len21 = Math.min(data.length, 21);
    let volSum21 = 0, priceSum21 = 0;

    for(let i = data.length - len21; i < data.length; i++){
      const v = Number(data[i].volume || 0);
      volSum21 += v; priceSum21 += Number(data[i].close);
      if(data[i].close > data[i].open) upVolSum += v;
      else if(data[i].close < data[i].open) downVolSum += v;
    }

    const udRatio = downVolSum !== 0 ? (upVolSum / downVolSum) : 1;
    const avgVolMA = volSum21 / len21;
    const avgPriceMA = priceSum21 / len21;
    const avgVolCr = (avgVolMA * avgPriceMA) / 10000000;
    const relVol = avgVolMA ? (((Number(last.volume||0)) / avgVolMA) - 1) * 100 : 0;

    statsWidget.innerHTML = `
      <div class="ppv-table-row">
        <div class="ppv-cell ${udRatio >= 1 ? 'bg-green' : 'bg-red'}">
          U/D Volume Ratio: ${udRatio.toFixed(2)}
        </div>
        <div class="ppv-cell bg-neutral">
          Avg Volume (Cr): ${avgVolCr.toFixed(1)}
        </div>
        <div class="ppv-cell ${relVol >= 0 ? 'bg-green' : 'bg-red'}">
          Rel Volume: ${relVol >= 0 ? '+' : ''}${relVol.toFixed(2)}%
        </div>
      </div>
    `;
  } catch(e){}
  requestAnimationFrame(() => positionPocketPivotStatsWidget(panelsArray[0]));
}

function renderVolumeMALine(data, panel, volSMA) {
  if (!data || !data.length) return;
  if (volMAConfig.enabled && activeIndicators.ppv && volSMA && volSMA.length) {
    const maData = [];
    for (let i = 0; i < data.length; i++) {
      if (volSMA[i] !== undefined) maData.push({ time: data[i].time, value: +volSMA[i].toFixed(2) });
    }
    if (!panel.volMASeries) {
      panel.volMASeries = panel.priceChart.addLineSeries({
        priceScaleId: 'vol', color: volMAConfig.color, lineWidth: volMAConfig.width, priceLineVisible: false, lastValueVisible: false
      });
    } else {
      panel.volMASeries.applyOptions({ color: volMAConfig.color, lineWidth: volMAConfig.width });
    }
    panel.volMASeries.setData(maData);
  } else if (panel.volMASeries) {
    panel.priceChart.removeSeries(panel.volMASeries);
    panel.volMASeries = null;
  }
}

function updateVolMAConfig(){
  volMAConfig.enabled = document.getElementById('volma-en').checked;
  volMAConfig.len = parseInt(document.getElementById('volma-len').value) || 30;
  volMAConfig.color = document.getElementById('volma-color').value;
  volMAConfig.width = parseInt(document.getElementById('volma-width').value) || 1;
  if (currentSymbol) rebuildAllPanels();
  requestAnimationFrame(() => positionPocketPivotStatsWidget(panelsArray[0]));
}

