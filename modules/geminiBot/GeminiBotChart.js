const COLORS = {
  bg0: "#0d1421",
  bg1: "#090e18",
  grid: "rgba(42, 54, 72, 0.65)",
  gridVert: "rgba(42, 54, 72, 0.35)",
  bullish: "#26a69a",
  bearish: "#ef5350",
  ema9: "#f5a623",
  ema21: "#4f8df6",
  axis: "#787b86",
  text: "#d1d4dc",
  rsiLine: "#9575cd",
  rsiNeutral: "#787b86",
  rsiLow: "#26a69a",
  rsiHigh: "#ef5350",
  crosshair: "rgba(168, 180, 200, 0.55)",
  entry: "#f0b90b",
  tp: "#26a69a",
  sl: "#ef5350",
  currentPrice: "#2196F3",
  volumeBull: "rgba(38, 166, 154, 0.42)",
  volumeBear: "rgba(239, 83, 80, 0.42)",
};

const PATTERN_COLORS = {
  bullish_consecutive_candles: "#26a69a",
  bearish_consecutive_candles: "#ef5350",
  bullish_engulfing: "#22c55e",
  bearish_engulfing: "#ef4444",
  doji: "#facc15",
  volume_spike: "#a855f7",
  momentum_acceleration: "#38bdf8",
};

const SL_TP_DASH = [4, 3];

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export class GeminiBotChart {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.("2d") || null;
    this.config = {
      maxCandles: Number(config.maxCandles) > 10 ? Number(config.maxCandles) : 60,
      countdownEl: config.countdownEl || null,
      ...config,
    };
    this.timeframe = "5m";
    this.candles = [];
    this.patterns = [];
    this.indicators = [];
    this.trades = [];
    this.hoverMarkers = [];
    this.tooltip = null;
    this._mouse = { x: -1, y: -1, inChart: false };
    this._animPhase = 0;
    this._animInterval = null;
    this._layout = null;
    this._prevCandleCount = 0;
    this._newCandleFlash = 0;

    this.boundMouseMove = this.#onMouseMove.bind(this);
    this.boundMouseLeave = this.#onMouseLeave.bind(this);
    this.countdownTimer = setInterval(() => this.#updateCountdownLabel(), 1000);

    if (this.canvas) {
      this.canvas.addEventListener("mousemove", this.boundMouseMove);
      this.canvas.addEventListener("mouseleave", this.boundMouseLeave);
      this.canvas.style.cursor = "crosshair";
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() => {
          this.#syncSize();
          this.#render();
        });
        this._resizeObserver.observe(this.canvas);
      }
    }

    // Animation loop for live candle pulse
    this._animInterval = setInterval(() => {
      this._animPhase = (this._animPhase + 0.18) % (Math.PI * 2);
      if (this._newCandleFlash > 0) this._newCandleFlash -= 1;
      if (this.candles.length) this.#render();
    }, 80);
  }

  #syncSize() {
    if (!this.canvas) return;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW > 0 && cssH > 0) {
      this.canvas.width = cssW;
      this.canvas.height = cssH;
    }
  }

  setTimeframe(tf) {
    this.timeframe = tf || "5m";
    this.#updateCountdownLabel();
  }

  update(candles, patterns = [], indicators = [], trades = []) {
    const incoming = (candles || []).slice(-this.config.maxCandles);
    if (incoming.length > this._prevCandleCount) this._newCandleFlash = 8;
    this._prevCandleCount = incoming.length;
    this.candles = incoming;
    this.patterns = patterns || [];
    this.indicators = indicators || [];
    this.trades = trades || [];
    this.#render();
  }

  destroy() {
    if (this.canvas) {
      this.canvas.removeEventListener("mousemove", this.boundMouseMove);
      this.canvas.removeEventListener("mouseleave", this.boundMouseLeave);
    }
    this._resizeObserver?.disconnect();
    this.tooltip?.remove();
    this.tooltip = null;
    this.hoverMarkers = [];
    clearInterval(this.countdownTimer);
    clearInterval(this._animInterval);
  }

  // ─── Layout ──────────────────────────────────────────────────────────────────

  #computeLayout() {
    const { width, height } = this.canvas;
    const hudH = 28;
    const timeAxisH = 20;
    const gapH = 5;
    const padLeft = 8;
    const padRight = 72;
    const available = height - hudH - timeAxisH;
    const volH = Math.max(30, Math.floor(available * 0.11));
    const rsiH = Math.max(36, Math.floor(available * 0.17));
    const priceH = available - volH - rsiH - gapH * 2;

    const priceTop = hudH;
    const volTop = priceTop + priceH + gapH;
    const rsiTop = volTop + volH + gapH;
    const timeTop = rsiTop + rsiH;
    const chartRight = width - padRight;
    const chartWidth = chartRight - padLeft;

    return {
      width, height, hudH, timeAxisH, padLeft, padRight, gapH,
      priceH, volH, rsiH, priceTop, volTop, rsiTop, timeTop,
      chartRight, chartWidth,
    };
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  #render() {
    if (!this.ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    if (width <= 0 || height <= 0) return;

    const L = this.#computeLayout();
    this._layout = L;

    this.ctx.clearRect(0, 0, width, height);
    this.#drawBackground(L);

    if (!this.candles.length) {
      this.#drawEmptyState(L);
      this.#updateCountdownLabel();
      return;
    }

    // Price range (padded so candles don't touch borders)
    const prices = this.candles.flatMap((c) => [toNum(c.low), toNum(c.high)]);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const pad = Math.max(1e-9, rawMax - rawMin) * 0.06;
    const minPrice = rawMin - pad;
    const maxPrice = rawMax + pad;
    const priceRange = Math.max(1e-9, maxPrice - minPrice);

    // Volume range
    const volumes = this.candles.map((c) => toNum(c.volume));
    const maxVol = Math.max(...volumes, 1);

    const xStep = L.chartWidth / Math.max(1, this.candles.length);
    const xAt = (idx) => L.padLeft + (idx + 0.5) * xStep;
    const yPrice = (p) => L.priceTop + ((maxPrice - p) / priceRange) * L.priceH;
    const yVol = (v) => L.volTop + L.volH - (v / maxVol) * L.volH;
    const yRsi = (r) => L.rsiTop + ((100 - r) / 100) * L.rsiH;

    const lastCandle = this.candles[this.candles.length - 1];

    this.#drawGrid(L, xAt, yPrice, minPrice, maxPrice);
    this.#drawHud(L, lastCandle);
    this.#drawPriceAxis(L, minPrice, maxPrice, yPrice);
    this.#drawTradeLevels(L, yPrice);
    this.#drawCurrentCandleGlow(L, xAt, xStep);
    this.#drawVolume(L, xAt, xStep, yVol);
    this.#drawCandles(L, xAt, xStep, yPrice);
    this.#drawCandleSlTp(L, xAt, xStep, yPrice);
    this.#drawEma(L, xAt, yPrice, "ema9", COLORS.ema9);
    this.#drawEma(L, xAt, yPrice, "ema21", COLORS.ema21);
    this.#drawPatternMarkers(L, xAt, yPrice);
    this.#drawTimeAxis(L, xAt);
    this.#drawRsi(L, xAt, yRsi);
    this.#drawCurrentPriceLine(L, yPrice, lastCandle);

    if (this._mouse.inChart) {
      this.#drawCrosshair(L, xAt, xStep, yPrice, minPrice, maxPrice);
    }

    this.#updateCountdownLabel(lastCandle);
  }

  // ─── Background ──────────────────────────────────────────────────────────────

  #drawBackground(L) {
    const grad = this.ctx.createLinearGradient(0, 0, 0, L.height);
    grad.addColorStop(0, COLORS.bg0);
    grad.addColorStop(1, COLORS.bg1);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, L.width, L.height);

    // Panel separator lines
    this.ctx.strokeStyle = "rgba(42, 54, 72, 0.5)";
    this.ctx.lineWidth = 1;
    [[L.volTop - 2, L.chartRight], [L.rsiTop - 2, L.chartRight]].forEach(([y, r]) => {
      this.ctx.beginPath();
      this.ctx.moveTo(L.padLeft, y);
      this.ctx.lineTo(r, y);
      this.ctx.stroke();
    });
  }

  #drawEmptyState(L) {
    this.ctx.fillStyle = COLORS.axis;
    this.ctx.font = "13px 'Courier New', monospace";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Esperando datos en vivo…", L.width / 2, L.height / 2);
    this.ctx.textAlign = "left";
  }

  // ─── Grid ────────────────────────────────────────────────────────────────────

  #drawGrid(L, xAt, yPrice, minPrice, maxPrice) {
    // Horizontal price grid
    const levels = 6;
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i <= levels; i++) {
      const p = maxPrice - ((maxPrice - minPrice) / levels) * i;
      const y = yPrice(p);
      if (y < L.priceTop - 1 || y > L.priceTop + L.priceH + 1) continue;
      this.ctx.strokeStyle = COLORS.grid;
      this.ctx.beginPath();
      this.ctx.moveTo(L.padLeft, y);
      this.ctx.lineTo(L.chartRight, y);
      this.ctx.stroke();
    }

    // Vertical time grid
    const step = Math.max(1, Math.floor(this.candles.length / 8));
    this.ctx.strokeStyle = COLORS.gridVert;
    for (let i = 0; i < this.candles.length; i += step) {
      const x = xAt(i);
      this.ctx.beginPath();
      this.ctx.moveTo(x, L.priceTop);
      this.ctx.lineTo(x, L.rsiTop + L.rsiH);
      this.ctx.stroke();
    }

    // Right axis border
    this.ctx.strokeStyle = COLORS.grid;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(L.chartRight, L.priceTop);
    this.ctx.lineTo(L.chartRight, L.priceTop + L.priceH);
    this.ctx.stroke();
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────

  #drawHud(L, lastCandle) {
    const open = toNum(lastCandle?.open, NaN);
    const close = toNum(lastCandle?.close, NaN);
    const high = toNum(lastCandle?.high, NaN);
    const low = toNum(lastCandle?.low, NaN);
    const vol = toNum(lastCandle?.volume, NaN);
    const isBull = close >= open;
    const pct = Number.isFinite(open) && open ? ((close - open) / open) * 100 : NaN;
    const pctText = Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(3)}%` : "—";
    const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "—");
    const fmtVol = (v) => {
      if (!Number.isFinite(v)) return "—";
      if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
      return v.toFixed(0);
    };

    this.ctx.fillStyle = "rgba(9, 14, 24, 0.88)";
    this.ctx.fillRect(0, 0, L.width, L.hudH);

    this.ctx.font = "bold 11px 'Courier New', monospace";
    let xOff = 10;
    const y = 18;

    // TF badge
    this.ctx.fillStyle = "#4f8df6";
    this.ctx.fillText(`${this.timeframe}`, xOff, y);
    xOff += 32;

    // OHLCV
    const parts = [
      ["O", fmt2(open)],
      ["H", fmt2(high)],
      ["L", fmt2(low)],
      ["C", fmt2(close)],
      ["V", fmtVol(vol)],
    ];
    parts.forEach(([lbl, val]) => {
      this.ctx.fillStyle = COLORS.axis;
      this.ctx.fillText(lbl, xOff, y);
      xOff += 10;
      this.ctx.fillStyle = COLORS.text;
      this.ctx.fillText(`${val}  `, xOff, y);
      xOff += val.length * 7 + 6;
    });

    // % change (right-aligned)
    this.ctx.fillStyle = isBull ? COLORS.bullish : COLORS.bearish;
    this.ctx.textAlign = "right";
    this.ctx.fillText(pctText, L.chartRight - 4, y);
    this.ctx.textAlign = "left";

    // Bottom border
    this.ctx.strokeStyle = "rgba(42, 54, 72, 0.8)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, L.hudH - 0.5);
    this.ctx.lineTo(L.width, L.hudH - 0.5);
    this.ctx.stroke();
  }

  // ─── Price axis ──────────────────────────────────────────────────────────────

  #drawPriceAxis(L, minPrice, maxPrice, yPrice) {
    const levels = 6;
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.fillStyle = COLORS.axis;
    this.ctx.textAlign = "left";
    for (let i = 0; i <= levels; i++) {
      const p = maxPrice - ((maxPrice - minPrice) / levels) * i;
      const y = yPrice(p);
      if (y < L.priceTop - 1 || y > L.priceTop + L.priceH + 1) continue;
      this.ctx.fillText(p.toFixed(2), L.chartRight + 4, y + 4);
    }
  }

  // ─── TP / SL / Entry ─────────────────────────────────────────────────────────

  #drawTradeLevels(L, yPrice) {
    if (!this.trades?.length) return;
    // Most recent trade on top with full opacity; older ones dimmed
    const recent = this.trades.slice(-3);
    recent.forEach((trade, i) => {
      if (!trade.entry) return;
      const alpha = i === recent.length - 1 ? 1 : 0.45;
      if (trade.tp) this.#drawLevelLine(L, yPrice, trade.tp, COLORS.tp, alpha, "TP", trade.tp.toFixed(2));
      if (trade.sl) this.#drawLevelLine(L, yPrice, trade.sl, COLORS.sl, alpha, "SL", trade.sl.toFixed(2));
      this.#drawLevelLine(L, yPrice, trade.entry, COLORS.entry, alpha, "ENTRY", trade.entry.toFixed(2));
    });
  }

  #drawLevelLine(L, yPrice, price, color, alpha, label, valueText) {
    const y = yPrice(price);
    if (y < L.priceTop - 2 || y > L.priceTop + L.priceH + 2) return;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.setLineDash([6, 3]);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.3;
    this.ctx.beginPath();
    this.ctx.moveTo(L.padLeft, y);
    this.ctx.lineTo(L.chartRight, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Label badge on right axis
    const badgeText = `${label} ${valueText}`;
    this.ctx.font = "bold 9px 'Courier New', monospace";
    const bw = this.ctx.measureText(badgeText).width + 8;
    const bh = 14;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(L.chartRight + 2, y - bh / 2, bw, bh);
    this.ctx.fillStyle = "#0d1421";
    this.ctx.fillText(badgeText, L.chartRight + 5, y + 4);
    this.ctx.restore();
  }

  // ─── Candles ─────────────────────────────────────────────────────────────────

  #drawCandles(L, xAt, xStep, yPrice) {
    const bodyWidth = Math.max(2, xStep * 0.62);
    const lastIdx = this.candles.length - 1;
    this.ctx.save();

    this.candles.forEach((candle, idx) => {
      const open = toNum(candle.open);
      const close = toNum(candle.close);
      const high = toNum(candle.high);
      const low = toNum(candle.low);
      const bullish = close >= open;
      const x = xAt(idx);
      const yO = yPrice(open);
      const yC = yPrice(close);
      const yH = yPrice(high);
      const yL = yPrice(low);
      const isLast = idx === lastIdx;

      // Wick
      this.ctx.strokeStyle = bullish ? COLORS.bullish : COLORS.bearish;
      this.ctx.lineWidth = isLast ? 1.5 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, yH);
      this.ctx.lineTo(x, yL);
      this.ctx.stroke();

      const top = Math.min(yO, yC);
      const h = Math.max(1.5, Math.abs(yC - yO));

      if (isLast) {
        // Pulse glow on latest (live) candle
        const glow = 4 + 3 * Math.sin(this._animPhase);
        this.ctx.shadowColor = bullish ? COLORS.bullish : COLORS.bearish;
        this.ctx.shadowBlur = glow;
      }

      const grad = this.ctx.createLinearGradient(0, top, 0, top + h + 1);
      if (bullish) {
        grad.addColorStop(0, "#33c5a0");
        grad.addColorStop(1, "#1a8c6e");
      } else {
        grad.addColorStop(0, "#f47174");
        grad.addColorStop(1, "#c9414b");
      }
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, h);
      this.ctx.shadowBlur = 0;
    });

    this.ctx.restore();
    this.ctx.lineWidth = 1;
  }

  // ─── Per-candle SL / TP ticks ────────────────────────────────────────────────

  #drawCandleSlTp(L, xAt, xStep, yPrice) {
    if (!this.patterns?.length) return;

    const byCloseTime = new Map();
    this.candles.forEach((c, idx) => byCloseTime.set(c.closeTime, { idx, candle: c }));

    const tickHalfWidth = Math.max(4, xStep * 0.8);
    const inPrice = (y) => y >= L.priceTop - 2 && y <= L.priceTop + L.priceH + 2;

    this.patterns.forEach((pattern) => {
      const closeTime = pattern?.candles?.[pattern.candles.length - 1]?.closeTime;
      const found = byCloseTime.get(closeTime);
      if (!found) return;

      const { idx } = found;
      const entry = toNum(pattern.candles?.[pattern.candles.length - 1]?.close, 0);
      const atr = toNum(pattern.indicators?.atr14, 0);
      if (!entry || !atr) return;

      const isBullish = (pattern.prediction?.direction || "up") === "up";
      const tp = isBullish ? entry + atr * 2 : entry - atr * 2;
      const sl = isBullish ? entry - atr : entry + atr;
      const x = xAt(idx);

      const outcome = pattern.outcome?.result ?? "pending";
      // Pending trades are fully opaque; settled ones are dimmed
      const alpha = outcome === "pending" ? 0.85 : 0.45;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash(SL_TP_DASH);

      const yEntry = yPrice(entry);
      const yTp = yPrice(tp);
      const ySl = yPrice(sl);

      // Thin vertical connector from entry to TP and SL (only within chart area)
      if (inPrice(yEntry)) {
        this.ctx.strokeStyle = "rgba(168, 180, 200, 0.25)";
        this.ctx.lineWidth = 1;
        if (inPrice(yTp)) {
          this.ctx.beginPath();
          this.ctx.moveTo(x, Math.min(yEntry, yTp));
          this.ctx.lineTo(x, Math.max(yEntry, yTp));
          this.ctx.stroke();
        }
        if (inPrice(ySl)) {
          this.ctx.beginPath();
          this.ctx.moveTo(x, Math.min(yEntry, ySl));
          this.ctx.lineTo(x, Math.max(yEntry, ySl));
          this.ctx.stroke();
        }
      }

      this.ctx.lineWidth = 1.5;

      // TP tick (green)
      if (inPrice(yTp)) {
        this.ctx.strokeStyle = COLORS.tp;
        this.ctx.setLineDash(SL_TP_DASH);
        this.ctx.beginPath();
        this.ctx.moveTo(x - tickHalfWidth, yTp);
        this.ctx.lineTo(x + tickHalfWidth, yTp);
        this.ctx.stroke();
        // "T" label
        this.ctx.setLineDash([]);
        this.ctx.font = "bold 8px 'Courier New', monospace";
        this.ctx.fillStyle = COLORS.tp;
        this.ctx.textAlign = "center";
        this.ctx.fillText("T", x, yTp - 3);
      }

      // SL tick (red)
      if (inPrice(ySl)) {
        this.ctx.setLineDash(SL_TP_DASH);
        this.ctx.strokeStyle = COLORS.sl;
        this.ctx.beginPath();
        this.ctx.moveTo(x - tickHalfWidth, ySl);
        this.ctx.lineTo(x + tickHalfWidth, ySl);
        this.ctx.stroke();
        // "S" label
        this.ctx.setLineDash([]);
        this.ctx.font = "bold 8px 'Courier New', monospace";
        this.ctx.fillStyle = COLORS.sl;
        this.ctx.textAlign = "center";
        this.ctx.fillText("S", x, ySl + 9);
      }

      this.ctx.setLineDash([]);
      this.ctx.restore();
    });
  }

  // ─── EMA lines ───────────────────────────────────────────────────────────────

  #drawEma(L, xAt, yPrice, key, color) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.4;
    this.ctx.beginPath();
    let started = false;
    this.candles.forEach((_, idx) => {
      const value = toNum(this.indicators[idx]?.[key], NaN);
      if (!Number.isFinite(value)) return;
      const x = xAt(idx);
      const y = yPrice(value);
      if (!started) { this.ctx.moveTo(x, y); started = true; }
      else this.ctx.lineTo(x, y);
    });
    if (started) this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  // ─── Pattern markers ─────────────────────────────────────────────────────────

  #drawPatternMarkers(L, xAt, yPrice) {
    this.hoverMarkers = [];
    const byCloseTime = new Map();
    this.candles.forEach((c, idx) => byCloseTime.set(c.closeTime, { idx, candle: c }));

    this.patterns.forEach((pattern) => {
      const closeTime = pattern?.candles?.[pattern.candles.length - 1]?.closeTime;
      const found = byCloseTime.get(closeTime);
      if (!found) return;
      const { idx, candle } = found;
      const x = xAt(idx);
      const bullish = ["bullish_consecutive_candles", "bullish_engulfing", "momentum_acceleration"].includes(pattern.type);
      const y = bullish ? yPrice(toNum(candle.high)) - 11 : yPrice(toNum(candle.low)) + 11;
      const size = 5;
      const color = PATTERN_COLORS[pattern.type] || "#ddd";

      this.ctx.save();
      this.ctx.fillStyle = color;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 5;
      this.ctx.beginPath();
      if (bullish) {
        this.ctx.moveTo(x, y - size);
        this.ctx.lineTo(x - size, y + size);
        this.ctx.lineTo(x + size, y + size);
      } else {
        this.ctx.moveTo(x, y + size);
        this.ctx.lineTo(x - size, y - size);
        this.ctx.lineTo(x + size, y - size);
      }
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();

      this.hoverMarkers.push({
        x, y, size: 10,
        data: {
          type: pattern.type,
          confidence: pattern.prediction?.confidence ?? "—",
          direction: pattern.prediction?.direction ?? "—",
          outcome: pattern.outcome?.result ?? "pending",
        },
      });
    });
  }

  // ─── Volume bars ─────────────────────────────────────────────────────────────

  #drawVolume(L, xAt, xStep, yVol) {
    const bodyWidth = Math.max(2, xStep * 0.62);
    this.candles.forEach((candle, idx) => {
      const vol = toNum(candle.volume);
      if (!vol) return;
      const bullish = toNum(candle.close) >= toNum(candle.open);
      const x = xAt(idx);
      const y = yVol(vol);
      const h = Math.max(1, L.volTop + L.volH - y);
      this.ctx.fillStyle = bullish ? COLORS.volumeBull : COLORS.volumeBear;
      this.ctx.fillRect(x - bodyWidth / 2, y, bodyWidth, h);
    });

    // VOL label
    this.ctx.fillStyle = "rgba(120,130,150,0.5)";
    this.ctx.font = "9px monospace";
    this.ctx.fillText("VOL", L.padLeft + 3, L.volTop + 11);
  }

  // ─── Time axis ───────────────────────────────────────────────────────────────

  #drawTimeAxis(L, xAt) {
    this.ctx.fillStyle = COLORS.axis;
    this.ctx.font = "9px 'Courier New', monospace";
    this.ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(this.candles.length / 8));
    for (let i = 0; i < this.candles.length; i += step) {
      const candle = this.candles[i];
      const d = new Date(candle.closeTime || candle.timestamp || Date.now());
      const label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      this.ctx.fillText(label, xAt(i), L.timeTop + 13);
    }
    this.ctx.textAlign = "left";

    // Bottom border
    this.ctx.strokeStyle = COLORS.grid;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(L.padLeft, L.rsiTop + L.rsiH);
    this.ctx.lineTo(L.chartRight, L.rsiTop + L.rsiH);
    this.ctx.stroke();
  }

  // ─── RSI ─────────────────────────────────────────────────────────────────────

  #drawRsi(L, xAt, yRsi) {
    // Background
    this.ctx.fillStyle = "rgba(13, 20, 33, 0.25)";
    this.ctx.fillRect(L.padLeft, L.rsiTop, L.chartWidth, L.rsiH);

    // Levels 30, 50, 70
    [30, 50, 70].forEach((level) => {
      const y = yRsi(level);
      this.ctx.setLineDash(level === 50 ? [2, 4] : [4, 3]);
      this.ctx.strokeStyle = level === 50
        ? "rgba(120, 123, 134, 0.28)"
        : "rgba(120, 123, 134, 0.48)";
      this.ctx.lineWidth = 0.7;
      this.ctx.beginPath();
      this.ctx.moveTo(L.padLeft, y);
      this.ctx.lineTo(L.chartRight, y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      if (level !== 50) {
        this.ctx.fillStyle = "rgba(120, 123, 134, 0.55)";
        this.ctx.font = "9px monospace";
        this.ctx.fillText(String(level), L.chartRight + 4, y + 3);
      }
    });

    // RSI line
    this.ctx.lineWidth = 1.2;
    let prevX = null;
    let prevY = null;
    this.candles.forEach((_, idx) => {
      const rsi = toNum(this.indicators[idx]?.rsi14, NaN);
      if (!Number.isFinite(rsi)) { prevX = null; return; }
      const x = xAt(idx);
      const y = yRsi(rsi);
      const color = rsi < 30 ? COLORS.rsiLow : rsi > 70 ? COLORS.rsiHigh : COLORS.rsiLine;
      this.ctx.strokeStyle = color;
      if (prevX !== null) {
        this.ctx.beginPath();
        this.ctx.moveTo(prevX, prevY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      }
      prevX = x;
      prevY = y;
    });

    // Current RSI label
    const lastRsi = toNum(this.indicators[this.indicators.length - 1]?.rsi14, NaN);
    if (Number.isFinite(lastRsi)) {
      const col = lastRsi < 30 ? COLORS.rsiLow : lastRsi > 70 ? COLORS.rsiHigh : COLORS.rsiLine;
      this.ctx.fillStyle = col;
      this.ctx.font = "bold 9px 'Courier New', monospace";
      this.ctx.fillText(`RSI ${lastRsi.toFixed(1)}`, L.chartRight + 4, L.rsiTop + 10);
    }
    this.ctx.lineWidth = 1;
  }

  // ─── Current price line ──────────────────────────────────────────────────────

  #drawCurrentPriceLine(L, yPrice, lastCandle) {
    const close = toNum(lastCandle?.close, NaN);
    if (!Number.isFinite(close)) return;
    const y = yPrice(close);
    if (y < L.priceTop || y > L.priceTop + L.priceH) return;

    this.ctx.setLineDash([5, 3]);
    this.ctx.strokeStyle = "rgba(33, 150, 243, 0.85)";
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.moveTo(L.padLeft, y);
    this.ctx.lineTo(L.chartRight, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Price badge
    const label = close.toFixed(2);
    this.ctx.font = "bold 10px 'Courier New', monospace";
    const bw = this.ctx.measureText(label).width + 8;
    this.ctx.fillStyle = "#2196F3";
    this.ctx.fillRect(L.chartRight + 2, y - 8, bw, 16);
    this.ctx.fillStyle = "#fff";
    this.ctx.fillText(label, L.chartRight + 5, y + 5);
  }

  // ─── Live candle glow / highlight ────────────────────────────────────────────

  #drawCurrentCandleGlow(L, xAt, xStep) {
    if (!this.candles.length) return;
    const idx = this.candles.length - 1;
    const x = xAt(idx);
    const w = Math.max(8, xStep * 1.1);
    const baseAlpha = 0.035 + 0.025 * Math.sin(this._animPhase);
    const flashAlpha = this._newCandleFlash > 0
      ? baseAlpha + 0.06 * (this._newCandleFlash / 8)
      : baseAlpha;
    this.ctx.fillStyle = `rgba(59, 130, 246, ${flashAlpha.toFixed(3)})`;
    this.ctx.fillRect(x - w / 2, L.priceTop, w, L.priceH + L.volH + L.gapH);
  }

  // ─── Crosshair ───────────────────────────────────────────────────────────────

  #drawCrosshair(L, xAt, xStep, yPrice, minPrice, maxPrice) {
    const mx = this._mouse.x;
    const my = this._mouse.y;
    if (mx < L.padLeft || mx > L.chartRight || my < L.priceTop || my > L.priceTop + L.priceH) return;

    // Snap to nearest candle
    const candleIdx = Math.min(
      this.candles.length - 1,
      Math.max(0, Math.floor((mx - L.padLeft) / xStep)),
    );
    const snapX = xAt(candleIdx);

    this.ctx.save();
    this.ctx.strokeStyle = COLORS.crosshair;
    this.ctx.lineWidth = 0.8;
    this.ctx.setLineDash([4, 4]);

    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(snapX, L.priceTop);
    this.ctx.lineTo(snapX, L.rsiTop + L.rsiH);
    this.ctx.stroke();

    // Horizontal line
    this.ctx.beginPath();
    this.ctx.moveTo(L.padLeft, my);
    this.ctx.lineTo(L.chartRight, my);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Price badge on right axis
    const priceAtMouse = maxPrice - ((my - L.priceTop) / L.priceH) * (maxPrice - minPrice);
    this.ctx.font = "10px 'Courier New', monospace";
    const pLabel = priceAtMouse.toFixed(2);
    const pBw = this.ctx.measureText(pLabel).width + 8;
    this.ctx.fillStyle = "rgba(140, 155, 180, 0.88)";
    this.ctx.fillRect(L.chartRight + 2, my - 8, pBw, 16);
    this.ctx.fillStyle = "#0d1421";
    this.ctx.fillText(pLabel, L.chartRight + 5, my + 5);

    // Time badge on time axis
    const candle = this.candles[candleIdx];
    if (candle) {
      const d = new Date(candle.closeTime || candle.timestamp || Date.now());
      const tLabel = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const tBw = this.ctx.measureText(tLabel).width + 8;
      this.ctx.fillStyle = "rgba(140, 155, 180, 0.88)";
      this.ctx.fillRect(snapX - tBw / 2, L.timeTop + 2, tBw, 14);
      this.ctx.fillStyle = "#0d1421";
      this.ctx.textAlign = "center";
      this.ctx.fillText(tLabel, snapX, L.timeTop + 13);
      this.ctx.textAlign = "left";
    }

    this.ctx.restore();
  }

  // ─── Countdown ───────────────────────────────────────────────────────────────

  #updateCountdownLabel(lastCandle = this.candles[this.candles.length - 1]) {
    const el = this.config.countdownEl;
    if (!el) return;
    const ms = this.#getRemainingMs(lastCandle);
    if (!Number.isFinite(ms)) { el.textContent = "Candle: --:--"; return; }
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    el.textContent = `Candle: ${mm}:${ss}`;
  }

  #getRemainingMs(lastCandle) {
    const mins = Number(String(this.timeframe || "5m").replace(/[^\d]/g, "")) || 5;
    const frameMs = mins * 60 * 1000;
    const closeTs = new Date(lastCandle?.closeTime || lastCandle?.timestamp || 0).getTime();
    if (!Number.isFinite(closeTs) || closeTs <= 0) return NaN;
    return Math.max(0, closeTs + frameMs - Date.now());
  }

  // ─── Mouse events ────────────────────────────────────────────────────────────

  #onMouseMove(event) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this._mouse = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      inChart: true,
    };

    const marker = this.hoverMarkers.find(
      (m) => Math.abs(m.x - this._mouse.x) <= m.size && Math.abs(m.y - this._mouse.y) <= m.size,
    );

    if (!marker) {
      this.tooltip?.remove();
      this.tooltip = null;
    } else {
      if (!this.tooltip) {
        this.tooltip = document.createElement("div");
        this.tooltip.style.cssText = [
          "position:fixed", "pointer-events:none",
          "background:rgba(9,14,24,.96)", "border:1px solid #2a3648",
          "color:#d1d4dc", "padding:6px 10px", "font-size:11px",
          "border-radius:5px", "z-index:9999",
          "font-family:'Courier New',monospace", "line-height:1.6",
        ].join(";");
        document.body.appendChild(this.tooltip);
      }
      const confTxt = typeof marker.data.confidence === "number"
        ? `${(marker.data.confidence * 100).toFixed(1)}%`
        : marker.data.confidence;
      this.tooltip.innerHTML = `<strong>${marker.data.type}</strong><br>Dir: ${marker.data.direction} · Conf: ${confTxt}<br>Outcome: ${marker.data.outcome}`;
      this.tooltip.style.left = `${event.clientX + 14}px`;
      this.tooltip.style.top = `${event.clientY + 14}px`;
    }
  }

  #onMouseLeave() {
    this._mouse.inChart = false;
    this.tooltip?.remove();
    this.tooltip = null;
  }
}
