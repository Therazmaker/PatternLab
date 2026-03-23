/**
 * sessionChart.js — TradingView-style Canvas 2D chart  v2
 *
 * NEW:
 *  - Fullscreen mode (F key or ⛶ button)
 *  - Manual S/R drawing: click ✏ S/R button → click chart to place lines
 *  - Click the ✕ label on a manual line to remove it
 *  - Esc exits draw mode or fullscreen
 *  - onSRChange(lines, eventMeta) callback + setManualSR(lines) for persistence
 */

import { createChartDrawingToolbar } from "./chartDrawingToolbar.js";
import { createChartDrawingController } from "./chartDrawingController.js";
import { renderDrawings, renderDrawingDraft } from "./drawingRenderLayer.js";

const C = {
  bg:"#0b1118",gridLine:"rgba(148,163,184,0.065)",gridBold:"rgba(148,163,184,0.14)",
  axisBg:"#0d1621",axisText:"#56687a",axisTick:"rgba(148,163,184,0.18)",
  crosshair:"rgba(148,163,184,0.40)",crossLabel:"#cbd5e1",crossLabelBg:"#1a2535",
  tooltip:"rgba(9,16,28,0.94)",tooltipBorder:"rgba(148,163,184,0.20)",
  bullBody:"#26a65b",bullBodyLight:"#2ecc71",bullWick:"#1e8449",
  bearBody:"#c0392b",bearBodyLight:"#e74c3c",bearWick:"#922b21",
  dojiBody:"#4a5568",dojiWick:"#3d4a5c",
  emaFast:"#f59e0b",emaSlow:"#60a5fa",
  support:"rgba(34,197,94,0.80)",supportFill:"rgba(34,197,94,0.06)",
  resistance:"rgba(239,68,68,0.80)",resistanceFill:"rgba(239,68,68,0.06)",
  manualSupport:"#4ade80",manualResistance:"#f87171",
  rangeHigh:"rgba(239,68,68,0.25)",rangeLow:"rgba(16,185,129,0.25)",
  entryLong:"#38bdf8",entryShort:"#fb923c",sl:"#ef4444",tp:"#22c55e",
  selectedBg:"rgba(147,197,253,0.07)",selectedBorder:"rgba(147,197,253,0.50)",
  contextBand:"rgba(96,165,250,0.055)",contextBorder:"rgba(147,197,253,0.30)",
  callDot:"#22c55e",putDot:"#ef4444",nearCallDot:"#16a34a",nearPutDot:"#dc2626",
  swingHigh:"#fb7185",swingLow:"#34d399",openBorder:"#fbbf24",
  priceTagBg:"#1e3a5f",priceTagText:"#93c5fd",
  drawModeBg:"rgba(250,204,21,0.10)",drawModeText:"#fbbf24",
};

const PRICE_AXIS_W=80, TIME_AXIS_H=26, PAD_TOP=16, MIN_HEIGHT=360;

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function niceStep(range,ticks=6){if(!range||!isFinite(range))return 1;const rough=range/ticks,mag=Math.pow(10,Math.floor(Math.log10(rough))),norm=rough/mag;return(norm<1.5?1:norm<3.5?2:norm<7.5?5:10)*mag;}
function inferDecimals(candles){const s=candles.map(c=>c.close).filter(Number.isFinite).slice(0,10);if(!s.length)return 4;const a=s.reduce((a,b)=>a+b,0)/s.length;return a>5000?1:a>100?2:a>1?4:5;}
function fmt(p,dec){return Number.isFinite(p)?p.toFixed(dec):"—";}

export class SessionChart {
  constructor(container,{onCandleClick,onCandleHover,onSRChange,onSRSelect}={}){
    this.container=container;
    this.onCandleClick=onCandleClick||((x)=>{});
    this.onCandleHover=onCandleHover||((x)=>{});
    this.onSRChange=onSRChange||((x)=>{});
    this.onSRSelect=onSRSelect||((x)=>{});
    this.candles=[];this.overlays={};this.livePlan=null;
    this.explanations=[];this.selectedIdx=null;this.prefs={};this.decimals=4;
    this._manualSR=[];
    this._candleW=10;this._offsetX=0;this._zoomed=false;
    this._fullscreen=false;
    this._mouse=null;this._hovIdx=null;
    this._dragging=false;this._dragX0=0;this._dragOff0=0;this._lastPinchD=0;
    this._dirty=true;this._raf=null;
    this._build();
  }

  _build(){
    const el=this.container;
    el.style.cssText+=";position:relative;background:"+C.bg+";border-radius:8px;overflow:hidden;";
    this.canvas=document.createElement("canvas");
    this.canvas.style.cssText="display:block;width:100%;cursor:crosshair;pointer-events:auto;position:relative;z-index:2;";
    el.appendChild(this.canvas);
    this.ctx=this.canvas.getContext("2d");
    this._buildToolbar();
    this._buildDebugPanel();
    this._buildDrawingController();
    this._bindEvents();
    this._startLoop();
  }

  _buildToolbar(){
    this._toolbar=createChartDrawingToolbar(this.container,{
      onToolSelect:(tool)=>this._drawingController?.setTool(tool),
      onClear:()=>this._handleClearDrawings(),
      onFullscreen:()=>this.toggleFullscreen(),
    });
  }

  _buildDrawingController(){
    this._drawingStateVersion=0;
    this._drawingController=createChartDrawingController({
      getContext:()=>({
        symbol:this.overlays?.symbol||"UNKNOWN",
        timeframe:this.overlays?.timeframe||"UNKNOWN",
      }),
      chartToScreen:(point)=>this.chartToScreenCoords(point.time,point.price),
      onStateChange:(drawingState={})=>{
        this._dirty=true;
        this._drawingStateVersion+=1;
        this._updateDebugPanel(drawingState);
        console.debug("Drawing render triggered",{
          version:this._drawingStateVersion,
          totalDrawings:Array.isArray(drawingState.drawings)?drawingState.drawings.length:0,
          isDrawingInProgress:Boolean(drawingState.isDrawingInProgress),
          activeTool:drawingState.activeTool||"select",
        });
      },
      onToolChange:(tool)=>{this._toolbar?.setActiveTool(tool);},
      onDrawingCreated:(drawing,rows)=>{
        this._manualSR=[...rows];
        this.onSRChange([...this._manualSR],{type:"created",line:drawing});
        console.debug("Drawing persisted",{drawingId:drawing.id,type:drawing.type,points:drawing.points,symbol:drawing.metadata?.symbol,timeframe:drawing.metadata?.timeframe});
        console.debug("Latest drawing after commit",{
          drawingId:drawing.id,
          type:drawing.type,
          points:drawing.points||[],
          hasInvalidPoint:(drawing.points||[]).some((point)=>!Number.isFinite(Number(point?.time))||!Number.isFinite(Number(point?.price))),
          drawingsCount:Array.isArray(rows)?rows.length:0,
        });
      },
      onDrawingDeleted:(drawing,rows)=>{
        this._manualSR=[...rows];
        this.onSRChange([...this._manualSR],{type:"removed",lineId:drawing.id,line:drawing});
      },
      onDrawingsCleared:(removedIds,rows)=>{
        this._manualSR=[...rows];
        this.onSRChange([...this._manualSR],{type:"cleared",lineIds:removedIds});
      },
      onDrawingSelected:(drawing)=>this.onSRSelect(drawing),
    });
  }

  _buildDebugPanel(){
    this._debugPanel=document.createElement("div");
    this._debugPanel.style.cssText="position:absolute;left:8px;bottom:34px;z-index:11;background:rgba(2,6,23,.85);border:1px solid rgba(148,163,184,.35);border-radius:6px;padding:6px 8px;color:#cbd5e1;font:500 10px/1.35 'JetBrains Mono',monospace;pointer-events:none;max-width:330px;white-space:pre-wrap;";
    this.container.appendChild(this._debugPanel);
    this._updateDebugPanel(this._drawingController?.state||{});
  }

  _updateDebugPanel(drawingState={}){
    if(!this._debugPanel)return;
    const screen=drawingState?.lastClickScreenCoords||{};
    const chart=drawingState?.lastClickChartCoords||{};
    const latestDrawing=Array.isArray(drawingState?.drawings)&&drawingState.drawings.length?drawingState.drawings[drawingState.drawings.length-1]:null;
    const pointAChart=latestDrawing?.points?.[0]||null;
    const pointBChart=latestDrawing?.points?.[1]||null;
    const pointAScreen=pointAChart?this.chartToScreenCoords(pointAChart.time,pointAChart.price):null;
    const pointBScreen=pointBChart?this.chartToScreenCoords(pointBChart.time,pointBChart.price):null;
    const inViewport=[pointAScreen,pointBScreen].filter(Boolean).some((point)=>point.x>=0&&point.x<=this._chartW&&point.y>=PAD_TOP&&point.y<=PAD_TOP+this._chartH);
    this._debugPanel.textContent=[
      `activeTool: ${drawingState?.activeTool||"select"}`,
      `lastClickScreenCoords: ${Number.isFinite(screen.x)?`${Math.round(screen.x)}, ${Math.round(screen.y)}`:"-"}`,
      `lastClickChartCoords: ${Number.isFinite(chart.time)&&Number.isFinite(chart.price)?`${chart.time}, ${Number(chart.price).toFixed(this.decimals||4)}`:"-"}`,
      `isDrawingInProgress: ${Boolean(drawingState?.isDrawingInProgress)}`,
      `drawings.length: ${Array.isArray(drawingState?.drawings)?drawingState.drawings.length:0}`,
      `latest.id: ${latestDrawing?.id||"-"}`,
      `latest.type: ${latestDrawing?.type||"-"}`,
      `pointA chart: ${pointAChart&&Number.isFinite(pointAChart.time)&&Number.isFinite(pointAChart.price)?`${pointAChart.time}, ${Number(pointAChart.price).toFixed(this.decimals||4)}`:"-"}`,
      `pointB chart: ${pointBChart&&Number.isFinite(pointBChart.time)&&Number.isFinite(pointBChart.price)?`${pointBChart.time}, ${Number(pointBChart.price).toFixed(this.decimals||4)}`:"-"}`,
      `pointA screen: ${pointAScreen&&Number.isFinite(pointAScreen.x)&&Number.isFinite(pointAScreen.y)?`${Math.round(pointAScreen.x)}, ${Math.round(pointAScreen.y)}`:"-"}`,
      `pointB screen: ${pointBScreen&&Number.isFinite(pointBScreen.x)&&Number.isFinite(pointBScreen.y)?`${Math.round(pointBScreen.x)}, ${Math.round(pointBScreen.y)}`:"-"}`,
      `inViewport: ${inViewport}`,
    ].join("\n");
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  setData({candles=[],overlays={},livePlan=null,explanations=[],selectedIdx=null,prefs={}}){
    const prev=this.candles.length;
    this.candles=candles;this.overlays=overlays;this.livePlan=livePlan;
    this.explanations=explanations;this.selectedIdx=selectedIdx;this.prefs=prefs;
    this.decimals=inferDecimals(candles);
    if(!this._zoomed||Math.abs(candles.length-prev)>5)this._autoFit();
    this._clampOffset();this._dirty=true;
  }

  setSelected(idx){if(this.selectedIdx===idx)return;this.selectedIdx=idx;this._dirty=true;}

  setManualSR(lines=[]){
    this._manualSR=lines.map(l=>({...l}));
    this._drawingController?.setDrawings(this._manualSR);
    this._dirty=true;
  }

  toggleFullscreen(){
    this._fullscreen=!this._fullscreen;
    this._toolbar?.setFullscreen(this._fullscreen);
    if(this._fullscreen){
      this._savedParent=this.container.parentElement;
      this._savedNext=this.container.nextSibling;
      this._savedStyle=this.container.getAttribute("style")||"";
      this._overlay=document.createElement("div");
      this._overlay.style.cssText="position:fixed;inset:0;z-index:9999;background:#0b1118;display:flex;flex-direction:column;";
      document.body.appendChild(this._overlay);
      this._overlay.appendChild(this.container);
      this.container.style.cssText="width:100%;height:100vh;border-radius:0;flex:1;";
    } else {
      this.container.style.cssText=this._savedStyle;
      if(this._savedParent){
        if(this._savedNext)this._savedParent.insertBefore(this.container,this._savedNext);
        else this._savedParent.appendChild(this.container);
      }
      if(this._overlay){this._overlay.remove();this._overlay=null;}
    }
    this._zoomed=false;this._autoFit();this._dirty=true;
  }

  destroy(){
    if(this._fullscreen)this.toggleFullscreen();
    cancelAnimationFrame(this._raf);
    this._unbindEvents();
    this._toolbar?.destroy();
    this._debugPanel?.remove();
    this.canvas.remove();
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  get _W(){return this.canvas.width/(window.devicePixelRatio||1);}
  get _H(){return this.canvas.height/(window.devicePixelRatio||1);}
  get _chartW(){return this._W-PRICE_AXIS_W;}
  get _chartH(){return this._H-TIME_AXIS_H-PAD_TOP;}
  get _spacing(){return Math.ceil(this._candleW*1.6);}

  _autoFit(){const n=this.candles.length||40;this._candleW=clamp(Math.floor(this._chartW/n*0.62),4,20);this._zoomed=false;}
  _clampOffset(){const n=this.candles.length;if(!n){this._offsetX=0;return;}const vis=Math.floor(this._chartW/this._spacing);this._offsetX=clamp(this._offsetX,-2,Math.max(0,n-vis+2));}
  _xForIdx(i){const anchor=this._chartW-this._spacing*1.5;return anchor-(this.candles.length-1-i+this._offsetX)*this._spacing;}
  _idxAtX(px){const anchor=this._chartW-this._spacing*1.5;return this.candles.length-1+this._offsetX-(anchor-px)/this._spacing;}

  _priceRange(){
    const n=this.candles.length;if(!n)return{min:0,max:1};
    const lo=clamp(Math.floor(this._idxAtX(0))-1,0,n-1),hi=clamp(Math.ceil(this._idxAtX(this._chartW))+1,0,n-1);
    let min=Infinity,max=-Infinity;
    for(let i=lo;i<=hi;i++){const c=this.candles[i];if(!c)continue;if(c.low<min)min=c.low;if(c.high>max)max=c.high;}
    const ovl=this.overlays,lp=this.livePlan?.plan;
    [...this._manualSR.map(l=>l.price),ovl.nearestSupport,ovl.nearestResistance,ovl.recentHigh,ovl.recentLow,lp?.referencePrice,lp?.stopLoss,lp?.takeProfit]
      .forEach(p=>{if(Number.isFinite(p)){min=Math.min(min,p);max=Math.max(max,p);}});
    if(!Number.isFinite(min)||!Number.isFinite(max))return{min:0,max:1};
    const pad=(max-min)*0.1||0.001;return{min:min-pad,max:max+pad};
  }

  _yForPrice(p){const{min,max}=this._priceRange();return PAD_TOP+this._chartH*(1-(p-min)/(max-min));}
  _priceAtY(py){const{min,max}=this._priceRange();return max-(py-PAD_TOP)/this._chartH*(max-min);}
  screenToChartCoords(x,y){
    const idx=clamp(this._idxAtX(x),0,Math.max(0,this.candles.length-1));
    const nearest=this.candles[Math.round(idx)];
    return{time:Number(nearest?.timestamp??nearest?.index??Math.round(idx)),price:this._priceAtY(y)};
  }
  chartToScreenCoords(time,price){
    const ts=Number(time);
    let idx=this.candles.findIndex((c)=>Number(c.timestamp)===ts||Number(c.index)===ts);
    if(idx<0)idx=clamp(Math.round(ts),0,Math.max(0,this.candles.length-1));
    return{x:this._xForIdx(idx),y:this._yForPrice(Number(price))};
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  _startLoop(){
    const frame=()=>{this._raf=requestAnimationFrame(frame);this._syncSize();if(this._dirty){this._draw();this._dirty=false;}};
    frame();
  }

  _syncSize(){
    const dpr=window.devicePixelRatio||1,rect=this.container.getBoundingClientRect();
    const w=Math.floor(rect.width)||800,h=Math.max(MIN_HEIGHT,Math.floor(rect.height)||MIN_HEIGHT);
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){
      this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
      this.canvas.style.height=h+"px";this.ctx.scale(dpr,dpr);
      if(!this._zoomed)this._autoFit();this._dirty=true;
    }
  }

  _draw(){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this._W,this._H);
    ctx.fillStyle=C.bg;ctx.fillRect(0,0,this._W,this._H);
    if(!this.candles.length){
      ctx.fillStyle=C.axisText;ctx.font="13px 'JetBrains Mono',monospace";ctx.textAlign="center";
      ctx.fillText("Agrega velas para visualizarlas.",this._W/2,this._H/2);
      this._drawPriceAxis(ctx);this._drawTimeAxis(ctx);return;
    }
    ctx.save();ctx.beginPath();ctx.rect(0,PAD_TOP-2,this._chartW,this._chartH+TIME_AXIS_H+4);ctx.clip();
    this._drawGrid(ctx);this._drawContextBand(ctx);this._drawRangeLines(ctx);
    this._drawEmas(ctx);this._drawSRLines(ctx);
    this._drawLivePlanLines(ctx);this._drawCandles(ctx);this._drawSwings(ctx);this._drawSignalDots(ctx);
    this._drawManualSRLines(ctx);
    this._drawTimeAxis(ctx);
    renderDrawingDraft(ctx,this._drawingController?.state||{},{
      chartToScreen:(point)=>this.chartToScreenCoords(point.time,point.price),
      chartW:this._chartW,
    });
    ctx.restore();
    this._drawPriceAxis(ctx);this._drawLiveBadge(ctx);
    if(this._drawingController?.state?.activeTool!=="select")this._drawDrawHint(ctx);
    if(this._mouse)this._drawCrosshair(ctx);
    if(this._mouse)this._drawTooltip(ctx);
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  _drawGrid(ctx){
    const{min,max}=this._priceRange(),step=niceStep(max-min,7),first=Math.ceil(min/step)*step;
    ctx.lineWidth=0.5;
    for(let p=first;p<max+step*0.01;p+=step){
      const y=this._yForPrice(p);if(y<PAD_TOP||y>PAD_TOP+this._chartH)continue;
      ctx.strokeStyle=C.gridLine;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this._chartW,y);ctx.stroke();
    }
  }

  // ── Price axis ────────────────────────────────────────────────────────────
  _drawPriceAxis(ctx){
    ctx.fillStyle=C.axisBg;ctx.fillRect(this._chartW,0,PRICE_AXIS_W,this._H);
    ctx.strokeStyle=C.gridBold;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(this._chartW,PAD_TOP);ctx.lineTo(this._chartW,this._H);ctx.stroke();
    if(!this.candles.length)return;
    const{min,max}=this._priceRange(),step=niceStep(max-min,7),first=Math.ceil(min/step)*step;
    ctx.font="10px 'JetBrains Mono',monospace";ctx.textAlign="left";
    for(let p=first;p<max+step*0.01;p+=step){
      const y=this._yForPrice(p);if(y<PAD_TOP||y>PAD_TOP+this._chartH)continue;
      ctx.strokeStyle=C.axisTick;ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(this._chartW,y);ctx.lineTo(this._chartW+5,y);ctx.stroke();
      ctx.fillStyle=C.axisText;ctx.fillText(fmt(p,this.decimals),this._chartW+8,y+3.5);
    }
    const last=this.candles[this.candles.length-1];
    if(last&&Number.isFinite(last.close)){
      const y=this._yForPrice(last.close),label=fmt(last.close,this.decimals);
      ctx.font="10px 'JetBrains Mono',monospace";
      const tw=ctx.measureText(label).width+14;
      ctx.fillStyle=C.priceTagBg;ctx.beginPath();ctx.roundRect(this._chartW+2,y-9,tw,18,3);ctx.fill();
      ctx.fillStyle=C.priceTagText;ctx.fillText(label,this._chartW+9,y+3.5);
    }
  }

  // ── Time axis ─────────────────────────────────────────────────────────────
  _drawTimeAxis(ctx){
    const yBase=PAD_TOP+this._chartH;
    ctx.fillStyle=C.axisBg;ctx.fillRect(0,yBase,this._chartW,TIME_AXIS_H);
    ctx.strokeStyle=C.gridBold;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,yBase);ctx.lineTo(this._chartW,yBase);ctx.stroke();
    ctx.font="9px 'JetBrains Mono',monospace";ctx.textAlign="center";
    const step=Math.max(1,Math.ceil(56/this._spacing));
    this.candles.forEach((c,i)=>{
      if(i%step!==0)return;const x=this._xForIdx(i);if(x<8||x>this._chartW-8)return;
      const label=c.timeLabel||(c.timestamp?new Date(c.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):`${c.index}`);
      ctx.strokeStyle=C.axisTick;ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(x,yBase);ctx.lineTo(x,yBase+3);ctx.stroke();
      ctx.fillStyle=C.axisText;ctx.fillText(label,x,yBase+17);
    });
  }

  // ── Context band ──────────────────────────────────────────────────────────
  _drawContextBand(ctx){
    const selExp=this.explanations.find(e=>e.candleIndex===this.selectedIdx)||this.explanations[this.explanations.length-1];
    const context=selExp?.structureContext;if(!context)return;
    const x0=this._xForIdx(context.startCandleIndex-1)-this._candleW,x1=this._xForIdx(context.endCandleIndex)+this._candleW;
    ctx.fillStyle=C.contextBand;ctx.strokeStyle=C.contextBorder;ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.roundRect(x0,PAD_TOP,x1-x0,this._chartH,4);ctx.fill();ctx.stroke();ctx.setLineDash([]);
  }

  // ── Range lines ───────────────────────────────────────────────────────────
  _drawRangeLines(ctx){
    if(!this.prefs.showStructure)return;
    [[this.overlays.recentHigh,C.rangeHigh],[this.overlays.recentLow,C.rangeLow]].forEach(([p,color])=>{
      if(!Number.isFinite(p))return;const y=this._yForPrice(p);
      ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash([3,5]);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this._chartW,y);ctx.stroke();ctx.setLineDash([]);
    });
  }

  // ── EMAs ──────────────────────────────────────────────────────────────────
  _drawEmas(ctx){
    if(!this.prefs.showMa)return;
    [[this.overlays.emaSlow,C.emaSlow,1.4,0.75],[this.overlays.emaFast,C.emaFast,1.4,0.85]].forEach(([arr,color,lw,alpha])=>{
      if(!Array.isArray(arr))return;
      ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.globalAlpha=alpha;ctx.beginPath();
      let started=false;
      arr.forEach((v,i)=>{if(!Number.isFinite(v))return;const x=this._xForIdx(i),y=this._yForPrice(v);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);});
      ctx.stroke();ctx.globalAlpha=1;
    });
  }

  // ── Auto S/R (overlays) ───────────────────────────────────────────────────
  _drawSRLines(ctx){
    if(!this.prefs.showStructure)return;
    [{p:this.overlays.nearestSupport,color:C.support,fill:C.supportFill,label:"Support"},
     {p:this.overlays.nearestResistance,color:C.resistance,fill:C.resistanceFill,label:"Resistance"}].forEach(({p,color,fill,label})=>{
      if(!Number.isFinite(p))return;const y=this._yForPrice(p);
      ctx.strokeStyle=color;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this._chartW,y);ctx.stroke();
      ctx.font="9px 'JetBrains Mono',monospace";
      const text=`${label}  ${fmt(p,this.decimals)}`,tw=ctx.measureText(text).width+12;
      ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(6,y-9,tw,16,3);ctx.fill();
      ctx.fillStyle=color;ctx.textAlign="left";ctx.fillText(text,12,y+3.5);
    });
  }

  // ── Manual S/R ────────────────────────────────────────────────────────────
  _drawManualSRLines(ctx){
    const drawingState=this._drawingController?.state||{};
    const layerDrawings=Array.isArray(drawingState.drawings)&&drawingState.drawings.length?drawingState.drawings:this._manualSR;
    renderDrawings(ctx,layerDrawings,drawingState,{
      chartW:this._chartW,
      chartH:this._chartH,
      padTop:PAD_TOP,
      chartToScreen:(point)=>this.chartToScreenCoords(point.time,point.price),
      debug:true,
    });
  }

  _drawDrawHint(ctx){
    ctx.font="10px 'JetBrains Mono',monospace";
    const tool=this._drawingController?.state?.activeTool||"select";
    const text=`Drawing mode (${tool}) — click to place points · Esc to cancel`;
    const tw=ctx.measureText(text).width+24,tx=(this._chartW-tw)/2;
    ctx.fillStyle=C.drawModeBg;ctx.beginPath();ctx.roundRect(tx,6,tw,20,4);ctx.fill();
    ctx.fillStyle=C.drawModeText;ctx.textAlign="left";ctx.fillText(text,tx+12,20);
  }

  // ── Live plan lines ────────────────────────────────────────────────────────
  _drawLivePlanLines(ctx){
    const lp=this.livePlan?.plan;if(!lp)return;
    const isLong=this.livePlan?.policy?.action==="LONG",ec=isLong?C.entryLong:C.entryShort;
    [{p:lp.referencePrice,color:ec,dash:[],lw:1.8,label:"Entry"},
     {p:lp.stopLoss,color:C.sl,dash:[6,4],lw:1.2,label:"SL"},
     {p:lp.takeProfit,color:C.tp,dash:[6,4],lw:1.2,label:"TP"}].forEach(({p,color,dash,lw,label})=>{
      if(!Number.isFinite(p))return;const y=this._yForPrice(p);
      ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.setLineDash(dash);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this._chartW,y);ctx.stroke();ctx.setLineDash([]);
      ctx.font="9px 'JetBrains Mono',monospace";
      const text=`${label}  ${fmt(p,this.decimals)}`,tw=ctx.measureText(text).width+12,lx=this._chartW-tw-6;
      ctx.fillStyle="rgba(9,16,28,0.75)";ctx.beginPath();ctx.roundRect(lx,y-9,tw,16,3);ctx.fill();
      ctx.fillStyle=color;ctx.textAlign="left";ctx.fillText(text,lx+6,y+3.5);
    });
  }

  // ── Candles ───────────────────────────────────────────────────────────────
  _drawCandles(ctx){
    const cw=this._candleW,hw=Math.max(1,Math.floor(cw/2));
    this.candles.forEach((c,i)=>{
      if([c.open,c.high,c.low,c.close].some(v=>!Number.isFinite(v)))return;
      const x=this._xForIdx(i);if(x<-cw*2||x>this._chartW+cw*2)return;
      const oY=this._yForPrice(c.open),cY=this._yForPrice(c.close),hY=this._yForPrice(c.high),lY=this._yForPrice(c.low);
      const bull=c.close>=c.open,doji=Math.abs(c.close-c.open)<(c.high-c.low)*0.08,isOpen=c.closed===false;
      const wickCol=doji?C.dojiWick:bull?C.bullWick:C.bearWick,bodyCol=doji?C.dojiBody:bull?C.bullBody:C.bearBody;
      const bodyTop=Math.min(oY,cY),bodyH=Math.max(1.5,Math.abs(cY-oY));
      ctx.globalAlpha=isOpen?0.5:1;
      if(this.selectedIdx===c.index){
        ctx.fillStyle=C.selectedBg;ctx.fillRect(x-hw-3,PAD_TOP,cw+6,this._chartH);
        ctx.strokeStyle=C.selectedBorder;ctx.lineWidth=1;ctx.setLineDash([]);
        ctx.strokeRect(x-hw-3.5,PAD_TOP+0.5,cw+7,this._chartH-1);
      }
      ctx.strokeStyle=wickCol;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,hY);ctx.lineTo(x,lY);ctx.stroke();
      if(doji){ctx.strokeStyle=bodyCol;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-hw,oY);ctx.lineTo(x+hw,oY);ctx.stroke();}
      else{
        ctx.fillStyle=bodyCol;ctx.beginPath();
        if(ctx.roundRect)ctx.roundRect(x-hw,bodyTop,cw,bodyH,1.5);else ctx.rect(x-hw,bodyTop,cw,bodyH);
        ctx.fill();
        if(isOpen){ctx.strokeStyle=C.openBorder;ctx.lineWidth=1;ctx.stroke();}
      }
      ctx.globalAlpha=1;
    });
  }

  // ── Swings ────────────────────────────────────────────────────────────────
  _drawSwings(ctx){
    if(!this.prefs.showStructure)return;
    const sw=this.overlays.swings||{};
    const draw=(items,color)=>{if(!Array.isArray(items))return;ctx.fillStyle=color;items.forEach(item=>{const x=this._xForIdx(item.index-1),y=this._yForPrice(item.price);ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();});};
    draw(sw.highs,C.swingHigh);draw(sw.lows,C.swingLow);
  }

  // ── Signal dots ───────────────────────────────────────────────────────────
  _drawSignalDots(ctx){
    if(!this.prefs.showOverlay)return;
    const dc={"call":C.callDot,"put":C.putDot,"near-call":C.nearCallDot,"near-put":C.nearPutDot};
    this.explanations.forEach(exp=>{
      const state=exp.signalState;if(!state||state==="none")return;
      if(!this.prefs.showNear&&state.startsWith("near"))return;
      const color=dc[state];if(!color)return;
      const c=this.candles.find(c=>c.index===exp.candleIndex);if(!c||!Number.isFinite(c.low))return;
      const x=this._xForIdx(this.candles.indexOf(c)),y=this._yForPrice(c.low)+8;
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=color;ctx.globalAlpha=0.3;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    });
  }

  // ── Live badge ────────────────────────────────────────────────────────────
  _drawLiveBadge(ctx){
    const lp=this.livePlan;if(!lp)return;
    const status=lp.outcome?.status||(lp.skipped?"skipped":"pending");
    const sc=status==="win"?C.tp:status==="loss"?C.sl:status==="skipped"?"#94a3b8":"#a78bfa";
    const sideC=lp.policy?.action==="LONG"?C.entryLong:C.entryShort;
    const text=`${lp.policy?.action||"?"} · ${status.toUpperCase()}`;
    ctx.font="11px 'JetBrains Mono',monospace";const tw=ctx.measureText(text).width;
    ctx.fillStyle="rgba(9,16,28,0.82)";ctx.strokeStyle=sc;ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(10,PAD_TOP+6,tw+28,22,5);ctx.fill();ctx.stroke();
    ctx.fillStyle=sideC;ctx.fillRect(14,PAD_TOP+10,4,14);
    ctx.fillStyle=sc;ctx.textAlign="left";ctx.fillText(text,24,PAD_TOP+21);
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────
  _drawCrosshair(ctx){
    const{x,y}=this._mouse;if(x<0||x>this._chartW||y<PAD_TOP||y>PAD_TOP+this._chartH)return;
    ctx.strokeStyle=C.crosshair;ctx.lineWidth=0.7;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(x,PAD_TOP);ctx.lineTo(x,PAD_TOP+this._chartH);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this._chartW,y);ctx.stroke();ctx.setLineDash([]);
    const price=this._priceAtY(y),label=fmt(price,this.decimals);
    ctx.font="10px 'JetBrains Mono',monospace";const tw=ctx.measureText(label).width+14;
    ctx.fillStyle=C.crossLabelBg;ctx.strokeStyle=C.crosshair;ctx.lineWidth=0.5;
    ctx.beginPath();ctx.roundRect(this._chartW+1,y-9,tw,18,3);ctx.fill();ctx.stroke();
    ctx.fillStyle=C.crossLabel;ctx.textAlign="left";ctx.fillText(label,this._chartW+8,y+3.5);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  _drawTooltip(ctx){
    const{x}=this._mouse,i=clamp(Math.round(this._idxAtX(x)),0,this.candles.length-1);
    const c=this.candles[i];if(!c||!Number.isFinite(c.open))return;
    const bull=c.close>=c.open,exp=this.explanations.find(e=>e.candleIndex===c.index);
    const lines=[
      {label:"O",val:fmt(c.open,this.decimals),color:"#cbd5e1"},
      {label:"H",val:fmt(c.high,this.decimals),color:C.tp},
      {label:"L",val:fmt(c.low,this.decimals),color:C.sl},
      {label:"C",val:fmt(c.close,this.decimals),color:bull?C.bullBodyLight:C.bearBodyLight},
    ];
    if(exp?.signalState&&exp.signalState!=="none")lines.push({label:"Signal",val:exp.signalState,color:"#a78bfa"});
    const pad=10,lh=16,tw=154,th=pad*2+lines.length*lh+4;
    let tx=x+14,ty=PAD_TOP+10;if(tx+tw>this._chartW-4)tx=x-tw-14;
    ctx.fillStyle=C.tooltip;ctx.strokeStyle=C.tooltipBorder;ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(tx,ty,tw,th,6);ctx.fill();ctx.stroke();
    ctx.font="10px 'JetBrains Mono',monospace";ctx.textAlign="left";
    lines.forEach(({label,val,color},li)=>{
      const yl=ty+pad+li*lh+11;ctx.fillStyle=C.axisText;ctx.fillText(label,tx+pad,yl);
      ctx.fillStyle=color;ctx.textAlign="right";ctx.fillText(val,tx+tw-pad,yl);ctx.textAlign="left";
    });
    ctx.fillStyle=C.axisText;ctx.font="9px 'JetBrains Mono',monospace";
    ctx.fillText(`#${c.index}${c.timeLabel?"  "+c.timeLabel:""}`,tx+pad,ty+pad+5);
  }

  _handleClearDrawings(){
    if(!this._manualSR.length)return;
    if(window.confirm("Clear all manual drawings for this session?")){
      this._drawingController?.clearDrawings();
      this._dirty=true;
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  _logicalXY(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}

  _bindEvents(){
    const el=this.canvas;
    this._onMM=e=>this._handleMouseMove(e);
    this._onML=()=>{this._mouse=null;this._dirty=true;};
    this._onMD=e=>this._handleMouseDown(e);
    this._onMU=e=>this._handleMouseUp(e);
    this._onW=e=>this._handleWheel(e);
    this._onTS=e=>this._handleTouchStart(e);
    this._onTM=e=>this._handleTouchMove(e);
    this._onTE=()=>{this._dragging=false;};
    this._onPD=e=>this._handlePointerDown(e);
    this._onC=e=>this._handleClick(e);
    this._onCM=e=>this._handleContextMenu(e);
    this._onKD=e=>this._handleKeyDown(e);
    el.addEventListener("mousemove",this._onMM);el.addEventListener("mouseleave",this._onML);
    el.addEventListener("mousedown",this._onMD);el.addEventListener("mouseup",this._onMU);
    el.addEventListener("wheel",this._onW,{passive:false});
    el.addEventListener("pointerdown",this._onPD);
    el.addEventListener("touchstart",this._onTS,{passive:true});
    el.addEventListener("touchmove",this._onTM,{passive:false});
    el.addEventListener("touchend",this._onTE);el.addEventListener("click",this._onC);
    el.addEventListener("contextmenu",this._onCM);
    window.addEventListener("keydown",this._onKD);
  }

  _unbindEvents(){
    const el=this.canvas;
    el.removeEventListener("mousemove",this._onMM);el.removeEventListener("mouseleave",this._onML);
    el.removeEventListener("mousedown",this._onMD);el.removeEventListener("mouseup",this._onMU);
    el.removeEventListener("wheel",this._onW);
    el.removeEventListener("pointerdown",this._onPD);
    el.removeEventListener("touchstart",this._onTS);el.removeEventListener("touchmove",this._onTM);
    el.removeEventListener("touchend",this._onTE);el.removeEventListener("click",this._onC);
    el.removeEventListener("contextmenu",this._onCM);
    window.removeEventListener("keydown",this._onKD);
  }

  _handleKeyDown(e){
    if(e.key==="Escape"){
      const canceled=this._drawingController?.cancelDraft();
      if(canceled)return;
      if(this._fullscreen){this.toggleFullscreen();return;}
    }
    if((e.key==="f"||e.key==="F")&&!e.ctrlKey&&!e.metaKey&&(this._fullscreen||document.activeElement===this.canvas)){this.toggleFullscreen();}
  }

  _handleMouseMove(e){
    const{x,y}=this._logicalXY(e);this._mouse={x,y};this._dirty=true;
    this._drawingController?.pointerMove({chartPoint:this.screenToChartCoords(x,y)});
    if(this._dragging&&this._drawingController?.state?.activeTool==="select"){const dx=x-this._dragX0;this._offsetX=this._dragOff0-dx/this._spacing;this._clampOffset();}
    const i=clamp(Math.round(this._idxAtX(x)),0,this.candles.length-1);
    if(i!==this._hovIdx){this._hovIdx=i;const c=this.candles[i];if(c)this.onCandleHover(c.index);}
  }

  _handleMouseDown(e){
    if(e.button!==0||this._drawingController?.state?.activeTool!=="select")return;
    const{x}=this._logicalXY(e);this._dragging=true;this._dragX0=x;this._dragOff0=this._offsetX;
    this.canvas.style.cursor="grabbing";
  }

  _handleMouseUp(){this._dragging=false;this.canvas.style.cursor="crosshair";}

  _handleWheel(e){
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){this._candleW=clamp(Math.round(this._candleW*(e.deltaY>0?0.85:1.18)),3,48);this._zoomed=true;}
    else{this._offsetX+=e.deltaY>0?3:-3;}
    this._clampOffset();this._dirty=true;
  }

  _handleTouchStart(e){
    if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;this._lastPinchD=Math.sqrt(dx*dx+dy*dy);}
    else if(e.touches.length===1){this._dragging=true;this._dragX0=e.touches[0].clientX;this._dragOff0=this._offsetX;}
  }

  _handleTouchMove(e){
    e.preventDefault();
    if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;const d=Math.sqrt(dx*dx+dy*dy);this._candleW=clamp(Math.round(this._candleW*(d/(this._lastPinchD||d))),3,48);this._zoomed=true;this._lastPinchD=d;this._clampOffset();this._dirty=true;}
    else if(e.touches.length===1&&this._dragging){const dx=e.touches[0].clientX-this._dragX0;this._offsetX=this._dragOff0-dx/this._spacing;this._clampOffset();this._dirty=true;}
  }

  _handlePointerDown(e){
    const{x,y}=this._logicalXY(e);
    if(y<=PAD_TOP||y>=PAD_TOP+this._chartH)return;
    const button=Number.isFinite(e.button)?e.button:0;
    const result=this._drawingController?.pointerDown({
      chartPoint:this.screenToChartCoords(x,y),
      screenPoint:{x,y},
      button,
    });
    if(result?.consumed){
      this._skipNextClick=true;
      this._dirty=true;
    }
  }

  _handleClick(e){
    if(this._skipNextClick){this._skipNextClick=false;return;}
    if(this._drawingController?.state?.activeTool!=="select")return;
    const{x,y}=this._logicalXY(e);
    if(Math.abs(e.clientX-(this._dragX0||e.clientX))>5)return;
    const i=clamp(Math.round(this._idxAtX(x)),0,this.candles.length-1);
    const c=this.candles[i];if(c)this.onCandleClick(c.index);
  }

  _handleContextMenu(e){
    e.preventDefault();
    this._drawingController?.cancelDraft();
    this._dirty=true;
  }
}
