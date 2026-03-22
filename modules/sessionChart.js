/**
 * sessionChart.js — TradingView-style Canvas 2D chart for Session Candles
 *
 * Features:
 *  - Pixel-perfect candlesticks with wick + body
 *  - Price grid + right-side price axis with live price tag
 *  - Time axis at the bottom
 *  - Crosshair (mouse tracking, snaps to candle)
 *  - Floating OHLC tooltip (top-left)
 *  - EMA fast/slow overlays
 *  - Support / Resistance horizontal lines
 *  - Entry / SL / TP plan lines
 *  - Swing high/low dots
 *  - Signal state markers (dots below candle low)
 *  - Selected candle vertical highlight
 *  - Context band
 *  - Zoom: ctrl+scroll / pinch
 *  - Pan: click-drag
 *  - Click → onCandleClick(candleIndex)
 *  - Hover → onCandleHover(candleIndex)
 */

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:             "#0b1118",
  gridLine:       "rgba(148,163,184,0.065)",
  gridBold:       "rgba(148,163,184,0.14)",
  axisBg:         "#0d1621",
  axisText:       "#56687a",
  axisTick:       "rgba(148,163,184,0.18)",
  crosshair:      "rgba(148,163,184,0.40)",
  crossLabel:     "#cbd5e1",
  crossLabelBg:   "#1a2535",
  tooltip:        "rgba(9,16,28,0.94)",
  tooltipBorder:  "rgba(148,163,184,0.20)",
  bullBody:       "#26a65b",
  bullBodyLight:  "#2ecc71",
  bullWick:       "#1e8449",
  bearBody:       "#c0392b",
  bearBodyLight:  "#e74c3c",
  bearWick:       "#922b21",
  dojiBody:       "#4a5568",
  dojiWick:       "#3d4a5c",
  emaFast:        "#f59e0b",
  emaSlow:        "#60a5fa",
  support:        "rgba(34,197,94,0.80)",
  supportFill:    "rgba(34,197,94,0.06)",
  resistance:     "rgba(239,68,68,0.80)",
  resistanceFill: "rgba(239,68,68,0.06)",
  rangeHigh:      "rgba(239,68,68,0.25)",
  rangeLow:       "rgba(16,185,129,0.25)",
  entryLong:      "#38bdf8",
  entryShort:     "#fb923c",
  sl:             "#ef4444",
  tp:             "#22c55e",
  selectedBg:     "rgba(147,197,253,0.07)",
  selectedBorder: "rgba(147,197,253,0.50)",
  contextBand:    "rgba(96,165,250,0.055)",
  contextBorder:  "rgba(147,197,253,0.30)",
  callDot:        "#22c55e",
  putDot:         "#ef4444",
  nearCallDot:    "#16a34a",
  nearPutDot:     "#dc2626",
  swingHigh:      "#fb7185",
  swingLow:       "#34d399",
  openBorder:     "#fbbf24",
  priceTagBg:     "#1e3a5f",
  priceTagText:   "#93c5fd",
};

const PRICE_AXIS_W = 80;
const TIME_AXIS_H  = 26;
const PAD_TOP      = 16;
const MIN_HEIGHT   = 360;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function niceStep(range, ticks = 6) {
  if (!range || !isFinite(range)) return 1;
  const rough = range / ticks;
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm  = rough / mag;
  const nice  = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * mag;
}

function inferDecimals(candles) {
  const sample = candles.map(c => c.close).filter(Number.isFinite).slice(0, 10);
  if (!sample.length) return 4;
  const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
  if (avg > 5000) return 1;
  if (avg > 100)  return 2;
  if (avg > 1)    return 4;
  return 5;
}

function fmt(p, dec) {
  return Number.isFinite(p) ? p.toFixed(dec) : "—";
}

// ── SessionChart class ────────────────────────────────────────────────────────
export class SessionChart {
  /**
   * @param {HTMLElement} container
   * @param {{ onCandleClick, onCandleHover }} callbacks
   */
  constructor(container, { onCandleClick, onCandleHover } = {}) {
    this.container      = container;
    this.onCandleClick  = onCandleClick  || (() => {});
    this.onCandleHover  = onCandleHover  || (() => {});

    // Data
    this.candles      = [];
    this.overlays     = {};
    this.livePlan     = null;
    this.explanations = [];
    this.selectedIdx  = null;
    this.prefs        = {};
    this.decimals     = 4;

    // View state
    this._candleW   = 10;   // body width in px
    this._offsetX   = 0;    // pan: how many candles are shifted right from natural anchor
    this._zoomed    = false;

    // Interaction
    this._mouse     = null;    // {x,y} in logical px
    this._hovIdx    = null;
    this._dragging  = false;
    this._dragX0    = 0;
    this._dragOff0  = 0;
    this._lastPinchD = 0;
    this._dirty     = true;
    this._raf       = null;

    this._build();
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  _build() {
    const el = this.container;
    el.style.cssText += ";position:relative;background:" + C.bg + ";border-radius:8px;overflow:hidden;";

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;cursor:crosshair;";
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this._bindEvents();
    this._startLoop();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  setData({ candles = [], overlays = {}, livePlan = null, explanations = [], selectedIdx = null, prefs = {} }) {
    const prev = this.candles.length;
    this.candles      = candles;
    this.overlays     = overlays;
    this.livePlan     = livePlan;
    this.explanations = explanations;
    this.selectedIdx  = selectedIdx;
    this.prefs        = prefs;
    this.decimals     = inferDecimals(candles);
    // Auto-fit candle width when data changes length significantly
    if (!this._zoomed || Math.abs(candles.length - prev) > 5) {
      this._autoFit();
    }
    this._clampOffset();
    this._dirty = true;
  }

  setSelected(idx) {
    if (this.selectedIdx === idx) return;
    this.selectedIdx = idx;
    this._dirty = true;
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._unbindEvents();
    this.canvas.remove();
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  get _W() { return this.canvas.width  / (window.devicePixelRatio || 1); }
  get _H() { return this.canvas.height / (window.devicePixelRatio || 1); }
  get _chartW() { return this._W - PRICE_AXIS_W; }
  get _chartH() { return this._H - TIME_AXIS_H - PAD_TOP; }
  get _spacing() { return Math.ceil(this._candleW * 1.6); }

  _autoFit() {
    const n = this.candles.length || 40;
    this._candleW = clamp(Math.floor(this._chartW / n * 0.62), 4, 20);
    this._zoomed  = false;
  }

  _clampOffset() {
    const n = this.candles.length;
    if (!n) { this._offsetX = 0; return; }
    const vis = Math.floor(this._chartW / this._spacing);
    const maxRight = Math.max(0, n - vis + 2);
    this._offsetX = clamp(this._offsetX, -2, maxRight);
  }

  // px-x for candle at array index i
  _xForIdx(i) {
    const n = this.candles.length;
    const anchor = this._chartW - this._spacing * 1.5;
    return anchor - (n - 1 - i + this._offsetX) * this._spacing;
  }

  // array index (float) under px-x
  _idxAtX(px) {
    const n = this.candles.length;
    const anchor = this._chartW - this._spacing * 1.5;
    return n - 1 + this._offsetX - (anchor - px) / this._spacing;
  }

  // price range of currently visible candles (with padding)
  _priceRange() {
    const n = this.candles.length;
    if (!n) return { min: 0, max: 1 };
    const lo = clamp(Math.floor(this._idxAtX(0)) - 1, 0, n - 1);
    const hi = clamp(Math.ceil(this._idxAtX(this._chartW)) + 1, 0, n - 1);
    let min = Infinity, max = -Infinity;
    for (let i = lo; i <= hi; i++) {
      const c = this.candles[i];
      if (!c) continue;
      if (c.low  < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    // include overlay lines
    const ovl = this.overlays;
    const lp  = this.livePlan?.plan;
    [ovl.nearestSupport, ovl.nearestResistance, ovl.recentHigh, ovl.recentLow,
     lp?.referencePrice, lp?.stopLoss, lp?.takeProfit]
      .forEach(p => { if (Number.isFinite(p)) { min = Math.min(min, p); max = Math.max(max, p); } });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    const pad = (max - min) * 0.1 || 0.001;
    return { min: min - pad, max: max + pad };
  }

  _yForPrice(p) {
    const { min, max } = this._priceRange();
    return PAD_TOP + this._chartH * (1 - (p - min) / (max - min));
  }

  _priceAtY(py) {
    const { min, max } = this._priceRange();
    return max - (py - PAD_TOP) / this._chartH * (max - min);
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  _startLoop() {
    const frame = () => {
      this._raf = requestAnimationFrame(frame);
      this._syncSize();
      if (this._dirty) { this._draw(); this._dirty = false; }
    };
    frame();
  }

  _syncSize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    const w    = Math.floor(rect.width)  || 800;
    const h    = Math.max(MIN_HEIGHT, Math.floor(rect.height) || MIN_HEIGHT);
    if (this.canvas.width  !== Math.round(w * dpr) ||
        this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width  = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.height = h + "px";
      this.ctx.scale(dpr, dpr);
      if (!this._zoomed) this._autoFit();
      this._dirty = true;
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this._W, H = this._H;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (!this.candles.length) {
      ctx.fillStyle = C.axisText;
      ctx.font = "13px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("Agrega velas para visualizarlas.", W / 2, H / 2);
      this._drawPriceAxis(ctx);
      this._drawTimeAxis(ctx);
      return;
    }

    // Chart clip region
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, PAD_TOP - 2, this._chartW, this._chartH + TIME_AXIS_H + 4);
    ctx.clip();

    this._drawGrid(ctx);
    this._drawContextBand(ctx);
    this._drawRangeLines(ctx);
    this._drawEmas(ctx);
    this._drawSRLines(ctx);
    this._drawLivePlanLines(ctx);
    this._drawCandles(ctx);
    this._drawSwings(ctx);
    this._drawSignalDots(ctx);
    this._drawTimeAxis(ctx);

    ctx.restore();

    this._drawPriceAxis(ctx);
    this._drawLiveBadge(ctx);
    if (this._mouse) this._drawCrosshair(ctx);
    if (this._mouse) this._drawTooltip(ctx);
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  _drawGrid(ctx) {
    const { min, max } = this._priceRange();
    const step = niceStep(max - min, 7);
    const first = Math.ceil(min / step) * step;

    ctx.lineWidth = 0.5;
    for (let p = first; p < max + step * 0.01; p += step) {
      const y = this._yForPrice(p);
      if (y < PAD_TOP || y > PAD_TOP + this._chartH) continue;
      ctx.strokeStyle = C.gridLine;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._chartW, y); ctx.stroke();
    }
  }

  // ── Price axis ────────────────────────────────────────────────────────────
  _drawPriceAxis(ctx) {
    const W = this._W;
    ctx.fillStyle = C.axisBg;
    ctx.fillRect(this._chartW, 0, PRICE_AXIS_W, this._H);

    // Border line
    ctx.strokeStyle = C.gridBold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this._chartW, PAD_TOP);
    ctx.lineTo(this._chartW, this._H);
    ctx.stroke();

    if (!this.candles.length) return;

    const { min, max } = this._priceRange();
    const step  = niceStep(max - min, 7);
    const first = Math.ceil(min / step) * step;

    ctx.font      = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = C.axisText;

    for (let p = first; p < max + step * 0.01; p += step) {
      const y = this._yForPrice(p);
      if (y < PAD_TOP || y > PAD_TOP + this._chartH) continue;
      // tick
      ctx.strokeStyle = C.axisTick;
      ctx.lineWidth   = 0.5;
      ctx.beginPath(); ctx.moveTo(this._chartW, y); ctx.lineTo(this._chartW + 5, y); ctx.stroke();
      ctx.fillStyle = C.axisText;
      ctx.fillText(fmt(p, this.decimals), this._chartW + 8, y + 3.5);
    }

    // Live price tag (last candle close)
    const last = this.candles[this.candles.length - 1];
    if (last && Number.isFinite(last.close)) {
      const y = this._yForPrice(last.close);
      const label = fmt(last.close, this.decimals);
      const tw = ctx.measureText(label).width + 14;
      ctx.fillStyle = C.priceTagBg;
      ctx.beginPath();
      ctx.roundRect(this._chartW + 2, y - 9, tw, 18, 3);
      ctx.fill();
      ctx.fillStyle = C.priceTagText;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillText(label, this._chartW + 9, y + 3.5);
    }
  }

  // ── Time axis ─────────────────────────────────────────────────────────────
  _drawTimeAxis(ctx) {
    const yBase = PAD_TOP + this._chartH;
    ctx.fillStyle = C.axisBg;
    ctx.fillRect(0, yBase, this._chartW, TIME_AXIS_H);

    ctx.strokeStyle = C.gridBold;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, yBase); ctx.lineTo(this._chartW, yBase); ctx.stroke();

    ctx.font      = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = C.axisText;

    const step = Math.max(1, Math.ceil(56 / this._spacing));
    this.candles.forEach((c, i) => {
      if (i % step !== 0) return;
      const x = this._xForIdx(i);
      if (x < 8 || x > this._chartW - 8) return;
      const label = c.timeLabel ||
        (c.timestamp ? new Date(c.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : `${c.index}`);
      ctx.strokeStyle = C.axisTick;
      ctx.lineWidth   = 0.5;
      ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yBase + 3); ctx.stroke();
      ctx.fillStyle = C.axisText;
      ctx.fillText(label, x, yBase + 17);
    });
  }

  // ── Context band ──────────────────────────────────────────────────────────
  _drawContextBand(ctx) {
    const selExp = this.explanations.find(e => e.candleIndex === this.selectedIdx)
      || this.explanations[this.explanations.length - 1];
    const context = selExp?.structureContext;
    if (!context) return;
    const x0 = this._xForIdx(context.startCandleIndex - 1) - this._candleW;
    const x1 = this._xForIdx(context.endCandleIndex) + this._candleW;
    const y0 = PAD_TOP;
    const h  = this._chartH;
    ctx.fillStyle   = C.contextBand;
    ctx.strokeStyle = C.contextBorder;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, h, 4);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Range lines ───────────────────────────────────────────────────────────
  _drawRangeLines(ctx) {
    if (!this.prefs.showStructure) return;
    const ovl = this.overlays;
    const pairs = [
      [ovl.recentHigh, C.rangeHigh, [3, 5]],
      [ovl.recentLow,  C.rangeLow,  [3, 5]],
    ];
    pairs.forEach(([p, color, dash]) => {
      if (!Number.isFinite(p)) return;
      const y = this._yForPrice(p);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._chartW, y); ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  // ── EMA lines ─────────────────────────────────────────────────────────────
  _drawEmas(ctx) {
    if (!this.prefs.showMa) return;
    const ovl = this.overlays;
    [[ovl.emaSlow, C.emaSlow, 1.4, 0.75], [ovl.emaFast, C.emaFast, 1.4, 0.85]].forEach(([arr, color, lw, alpha]) => {
      if (!Array.isArray(arr)) return;
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let started = false;
      arr.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x = this._xForIdx(i);
        const y = this._yForPrice(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // ── S/R lines ─────────────────────────────────────────────────────────────
  _drawSRLines(ctx) {
    if (!this.prefs.showStructure) return;
    const ovl = this.overlays;
    const lines = [
      { p: ovl.nearestSupport,    color: C.support,    fill: C.supportFill,    label: "Support"    },
      { p: ovl.nearestResistance, color: C.resistance, fill: C.resistanceFill, label: "Resistance" },
    ];
    ctx.font = "9px 'JetBrains Mono', monospace";
    lines.forEach(({ p, color, fill, label }) => {
      if (!Number.isFinite(p)) return;
      const y = this._yForPrice(p);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._chartW, y); ctx.stroke();
      // label pill
      const text = `${label}  ${fmt(p, this.decimals)}`;
      const tw   = ctx.measureText(text).width + 12;
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.roundRect(6, y - 9, tw, 16, 3); ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(text, 12, y + 3.5);
    });
  }

  // ── Live plan lines (Entry / SL / TP) ─────────────────────────────────────
  _drawLivePlanLines(ctx) {
    const lp = this.livePlan?.plan;
    if (!lp) return;
    const isLong = this.livePlan?.policy?.action === "LONG";
    const entryColor = isLong ? C.entryLong : C.entryShort;

    const lines = [
      { p: lp.referencePrice, color: entryColor, dash: [],     lw: 1.8, label: "Entry" },
      { p: lp.stopLoss,       color: C.sl,       dash: [6, 4], lw: 1.2, label: "SL"    },
      { p: lp.takeProfit,     color: C.tp,       dash: [6, 4], lw: 1.2, label: "TP"    },
    ];

    ctx.font = "9px 'JetBrains Mono', monospace";
    lines.forEach(({ p, color, dash, lw, label }) => {
      if (!Number.isFinite(p)) return;
      const y = this._yForPrice(p);
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._chartW, y); ctx.stroke();
      ctx.setLineDash([]);
      // right-side label
      const text = `${label}  ${fmt(p, this.decimals)}`;
      const tw   = ctx.measureText(text).width + 12;
      const lx   = this._chartW - tw - 6;
      ctx.fillStyle = "rgba(9,16,28,0.75)";
      ctx.beginPath(); ctx.roundRect(lx, y - 9, tw, 16, 3); ctx.fill();
      ctx.fillStyle   = color;
      ctx.textAlign   = "left";
      ctx.fillText(text, lx + 6, y + 3.5);
    });
  }

  // ── Candles ───────────────────────────────────────────────────────────────
  _drawCandles(ctx) {
    const cw = this._candleW;
    const hw = Math.max(1, Math.floor(cw / 2));

    this.candles.forEach((c, i) => {
      if ([c.open, c.high, c.low, c.close].some(v => !Number.isFinite(v))) return;
      const x  = this._xForIdx(i);
      if (x < -cw * 2 || x > this._chartW + cw * 2) return;

      const oY  = this._yForPrice(c.open);
      const cY  = this._yForPrice(c.close);
      const hY  = this._yForPrice(c.high);
      const lY  = this._yForPrice(c.low);
      const bull  = c.close >= c.open;
      const doji  = Math.abs(c.close - c.open) < (c.high - c.low) * 0.08;
      const isOpen = c.closed === false;

      const wickCol = doji ? C.dojiWick : bull ? C.bullWick : C.bearWick;
      const bodyCol = doji ? C.dojiBody : bull ? C.bullBody : C.bearBody;

      const bodyTop = Math.min(oY, cY);
      const bodyH   = Math.max(1.5, Math.abs(cY - oY));

      ctx.globalAlpha = isOpen ? 0.5 : 1;

      // Selection highlight
      if (this.selectedIdx === c.index) {
        ctx.fillStyle = C.selectedBg;
        ctx.fillRect(x - hw - 3, PAD_TOP, cw + 6, this._chartH);
        ctx.strokeStyle = C.selectedBorder;
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(x - hw - 3.5, PAD_TOP + 0.5, cw + 7, this._chartH - 1);
      }

      // Wick
      ctx.strokeStyle = wickCol;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();

      // Body
      if (doji) {
        ctx.strokeStyle = bodyCol;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(x - hw, oY); ctx.lineTo(x + hw, oY); ctx.stroke();
      } else {
        ctx.fillStyle = bodyCol;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - hw, bodyTop, cw, bodyH, 1.5);
        else ctx.rect(x - hw, bodyTop, cw, bodyH);
        ctx.fill();
        if (isOpen) {
          ctx.strokeStyle = C.openBorder;
          ctx.lineWidth   = 1;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    });
  }

  // ── Swing dots ────────────────────────────────────────────────────────────
  _drawSwings(ctx) {
    if (!this.prefs.showStructure) return;
    const swings = this.overlays.swings || {};
    const r = 3;
    const draw = (items, color) => {
      if (!Array.isArray(items)) return;
      ctx.fillStyle = color;
      items.forEach(item => {
        const x = this._xForIdx(item.index - 1);
        const y = this._yForPrice(item.price);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      });
    };
    draw(swings.highs, C.swingHigh);
    draw(swings.lows,  C.swingLow);
  }

  // ── Signal dots (CALL/PUT below candle) ───────────────────────────────────
  _drawSignalDots(ctx) {
    if (!this.prefs.showOverlay) return;
    const dotColor = {
      "call":      C.callDot,
      "put":       C.putDot,
      "near-call": C.nearCallDot,
      "near-put":  C.nearPutDot,
    };
    this.explanations.forEach(exp => {
      const state = exp.signalState;
      if (!state || state === "none") return;
      if (!this.prefs.showNear && state.startsWith("near")) return;
      const color = dotColor[state];
      if (!color) return;
      const c = this.candles.find(c => c.index === exp.candleIndex);
      if (!c || !Number.isFinite(c.low)) return;
      const x  = this._xForIdx(this.candles.indexOf(c));
      const y  = this._yForPrice(c.low) + 8;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      // glow ring
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // ── Live badge (top-left) ──────────────────────────────────────────────────
  _drawLiveBadge(ctx) {
    const lp = this.livePlan;
    if (!lp) return;
    const status    = this._resolvePlanStatus(lp);
    const statusCol = status === "win" ? C.tp : status === "loss" ? C.sl : status === "skipped" ? "#94a3b8" : "#a78bfa";
    const isLong    = lp.policy?.action === "LONG";
    const sideCol   = isLong ? C.entryLong : C.entryShort;

    const text = `${lp.policy?.action || "?"} · ${status.toUpperCase()}`;
    ctx.font = "11px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(text).width;

    ctx.fillStyle   = "rgba(9,16,28,0.82)";
    ctx.strokeStyle = statusCol;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.roundRect(10, PAD_TOP + 6, tw + 28, 22, 5);
    ctx.fill(); ctx.stroke();

    // Side indicator
    ctx.fillStyle = sideCol;
    ctx.fillRect(14, PAD_TOP + 10, 4, 14);

    ctx.fillStyle = statusCol;
    ctx.textAlign = "left";
    ctx.fillText(text, 24, PAD_TOP + 21);
  }

  _resolvePlanStatus(record) {
    if (!record) return "pending";
    const s = record.outcome?.status;
    if (s) return s;
    if (record.skipped) return "skipped";
    return "pending";
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────
  _drawCrosshair(ctx) {
    const { x, y } = this._mouse;
    if (x < 0 || x > this._chartW || y < PAD_TOP || y > PAD_TOP + this._chartH) return;

    ctx.strokeStyle = C.crosshair;
    ctx.lineWidth   = 0.7;
    ctx.setLineDash([4, 4]);

    // vertical
    ctx.beginPath(); ctx.moveTo(x, PAD_TOP); ctx.lineTo(x, PAD_TOP + this._chartH); ctx.stroke();
    // horizontal
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._chartW, y); ctx.stroke();
    ctx.setLineDash([]);

    // Price label on axis
    const price = this._priceAtY(y);
    const label = fmt(price, this.decimals);
    ctx.font = "10px 'JetBrains Mono', monospace";
    const tw  = ctx.measureText(label).width + 14;
    ctx.fillStyle = C.crossLabelBg;
    ctx.strokeStyle = C.crosshair;
    ctx.lineWidth   = 0.5;
    ctx.beginPath(); ctx.roundRect(this._chartW + 1, y - 9, tw, 18, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.crossLabel;
    ctx.textAlign = "left";
    ctx.fillText(label, this._chartW + 8, y + 3.5);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  _drawTooltip(ctx) {
    const { x } = this._mouse;
    const rawIdx = this._idxAtX(x);
    const i = clamp(Math.round(rawIdx), 0, this.candles.length - 1);
    const c = this.candles[i];
    if (!c || !Number.isFinite(c.open)) return;

    const bull = c.close >= c.open;
    const exp  = this.explanations.find(e => e.candleIndex === c.index);

    const lines = [
      { label: "O", val: fmt(c.open,  this.decimals), color: "#cbd5e1" },
      { label: "H", val: fmt(c.high,  this.decimals), color: C.tp      },
      { label: "L", val: fmt(c.low,   this.decimals), color: C.sl      },
      { label: "C", val: fmt(c.close, this.decimals), color: bull ? C.bullBodyLight : C.bearBodyLight },
    ];
    if (exp?.signalState && exp.signalState !== "none") {
      lines.push({ label: "Signal", val: exp.signalState, color: "#a78bfa" });
    }

    const pad  = 10;
    const lh   = 16;
    const tw   = 150;
    const th   = pad * 2 + lines.length * lh + 4;
    let tx = x + 14;
    let ty = PAD_TOP + 10;
    if (tx + tw > this._chartW - 4) tx = x - tw - 14;

    ctx.fillStyle   = C.tooltip;
    ctx.strokeStyle = C.tooltipBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 6); ctx.fill(); ctx.stroke();

    ctx.font      = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    lines.forEach(({ label, val, color }, li) => {
      const yl = ty + pad + li * lh + 11;
      ctx.fillStyle = C.axisText;
      ctx.fillText(label, tx + pad, yl);
      ctx.fillStyle = color;
      ctx.textAlign = "right";
      ctx.fillText(val, tx + tw - pad, yl);
      ctx.textAlign = "left";
    });

    // Candle index
    ctx.fillStyle = C.axisText;
    ctx.font      = "9px 'JetBrains Mono', monospace";
    ctx.fillText(`#${c.index}${c.timeLabel ? "  " + c.timeLabel : ""}`, tx + pad, ty + pad + 5);
  }

  // ── Events ────────────────────────────────────────────────────────────────
  _logicalXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _bindEvents() {
    const el = this.canvas;
    this._onMouseMove  = e => this._handleMouseMove(e);
    this._onMouseLeave = () => { this._mouse = null; this._dirty = true; };
    this._onMouseDown  = e => this._handleMouseDown(e);
    this._onMouseUp    = e => this._handleMouseUp(e);
    this._onWheel      = e => this._handleWheel(e);
    this._onTouchStart = e => this._handleTouchStart(e);
    this._onTouchMove  = e => this._handleTouchMove(e);
    this._onTouchEnd   = e => { this._dragging = false; };
    this._onClick      = e => this._handleClick(e);

    el.addEventListener("mousemove",  this._onMouseMove);
    el.addEventListener("mouseleave", this._onMouseLeave);
    el.addEventListener("mousedown",  this._onMouseDown);
    el.addEventListener("mouseup",    this._onMouseUp);
    el.addEventListener("wheel",      this._onWheel, { passive: false });
    el.addEventListener("touchstart", this._onTouchStart, { passive: true });
    el.addEventListener("touchmove",  this._onTouchMove,  { passive: false });
    el.addEventListener("touchend",   this._onTouchEnd);
    el.addEventListener("click",      this._onClick);
  }

  _unbindEvents() {
    const el = this.canvas;
    el.removeEventListener("mousemove",  this._onMouseMove);
    el.removeEventListener("mouseleave", this._onMouseLeave);
    el.removeEventListener("mousedown",  this._onMouseDown);
    el.removeEventListener("mouseup",    this._onMouseUp);
    el.removeEventListener("wheel",      this._onWheel);
    el.removeEventListener("touchstart", this._onTouchStart);
    el.removeEventListener("touchmove",  this._onTouchMove);
    el.removeEventListener("touchend",   this._onTouchEnd);
    el.removeEventListener("click",      this._onClick);
  }

  _handleMouseMove(e) {
    const { x, y } = this._logicalXY(e);
    this._mouse = { x, y };
    this._dirty = true;

    if (this._dragging) {
      const dx = x - this._dragX0;
      this._offsetX = this._dragOff0 - dx / this._spacing;
      this._clampOffset();
    }

    // Hover callback
    const i = clamp(Math.round(this._idxAtX(x)), 0, this.candles.length - 1);
    if (i !== this._hovIdx) {
      this._hovIdx = i;
      const c = this.candles[i];
      if (c) this.onCandleHover(c.index);
    }
  }

  _handleMouseDown(e) {
    if (e.button !== 0) return;
    const { x } = this._logicalXY(e);
    this._dragging  = true;
    this._dragX0    = x;
    this._dragOff0  = this._offsetX;
    this.canvas.style.cursor = "grabbing";
  }

  _handleMouseUp(e) {
    this._dragging = false;
    this.canvas.style.cursor = "crosshair";
  }

  _handleWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      this._candleW = clamp(Math.round(this._candleW * factor), 3, 48);
      this._zoomed  = true;
    } else {
      // Pan
      this._offsetX += e.deltaY > 0 ? 3 : -3;
    }
    this._clampOffset();
    this._dirty = true;
  }

  _handleTouchStart(e) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this._lastPinchD = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      this._dragging  = true;
      this._dragX0    = e.touches[0].clientX;
      this._dragOff0  = this._offsetX;
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const factor = d / (this._lastPinchD || d);
      this._candleW = clamp(Math.round(this._candleW * factor), 3, 48);
      this._zoomed  = true;
      this._lastPinchD = d;
      this._clampOffset();
      this._dirty = true;
    } else if (e.touches.length === 1 && this._dragging) {
      const dx = e.touches[0].clientX - this._dragX0;
      this._offsetX = this._dragOff0 - dx / this._spacing;
      this._clampOffset();
      this._dirty = true;
    }
  }

  _handleClick(e) {
    if (Math.abs(e.clientX - (this._dragX0 || e.clientX)) > 5) return; // was a drag
    const { x } = this._logicalXY(e);
    const i = clamp(Math.round(this._idxAtX(x)), 0, this.candles.length - 1);
    const c = this.candles[i];
    if (c) this.onCandleClick(c.index);
  }
}
