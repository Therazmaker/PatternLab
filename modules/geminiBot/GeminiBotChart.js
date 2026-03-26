const COLORS = {
  bg: "#0b1118",
  grid: "#273241",
  bullish: "#33c58d",
  bearish: "#ff6b7a",
  ema9: "#f2b84b",
  ema21: "#4f8df6",
  axis: "#94a3b8",
  text: "#e8edf5",
  rsiNeutral: "#9ca3af",
  rsiLow: "#33c58d",
  rsiHigh: "#ff6b7a",
};

const PATTERN_COLORS = {
  bullish_consecutive_candles: "#33c58d",
  bearish_consecutive_candles: "#ff6b7a",
  bullish_engulfing: "#22c55e",
  bearish_engulfing: "#ef4444",
  doji: "#facc15",
  volume_spike: "#a855f7",
  momentum_acceleration: "#38bdf8",
};

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
      ...config,
    };
    this.timeframe = "5m";
    this.candles = [];
    this.patterns = [];
    this.indicators = [];
    this.hoverMarkers = [];
    this.tooltip = null;
    this.boundMouseMove = this.#onMouseMove.bind(this);
    this.boundMouseLeave = this.#onMouseLeave.bind(this);
    if (this.canvas) {
      this.canvas.addEventListener("mousemove", this.boundMouseMove);
      this.canvas.addEventListener("mouseleave", this.boundMouseLeave);
    }
  }

  setTimeframe(tf) {
    this.timeframe = tf || "5m";
  }

  update(candles, patterns = [], indicators = []) {
    this.candles = (candles || []).slice(-this.config.maxCandles);
    this.patterns = patterns || [];
    this.indicators = indicators || [];
    this.#render();
  }

  destroy() {
    if (this.canvas) {
      this.canvas.removeEventListener("mousemove", this.boundMouseMove);
      this.canvas.removeEventListener("mouseleave", this.boundMouseLeave);
    }
    this.tooltip?.remove();
    this.tooltip = null;
    this.hoverMarkers = [];
  }

  #render() {
    if (!this.ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    const rsiHeight = Math.floor(height * 0.2);
    const priceHeight = height - rsiHeight - 30;

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = COLORS.bg;
    this.ctx.fillRect(0, 0, width, height);

    if (!this.candles.length) return;

    const prices = this.candles.flatMap((row) => [toNum(row.low), toNum(row.high)]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = Math.max(1e-9, maxPrice - minPrice);
    const padTop = 10;
    const padLeft = 10;
    const padRight = 60;
    const chartWidth = width - padLeft - padRight;

    const xStep = chartWidth / Math.max(1, this.candles.length);
    const xAt = (idx) => padLeft + (idx + 0.5) * xStep;
    const yPrice = (price) => padTop + ((maxPrice - price) / priceRange) * (priceHeight - padTop);

    this.#drawPriceAxis({ minPrice, maxPrice, width, padRight, yPrice, priceHeight });
    this.#drawCandles({ xAt, xStep, yPrice });
    this.#drawEma({ xAt, yPrice, key: "ema9", color: COLORS.ema9 });
    this.#drawEma({ xAt, yPrice, key: "ema21", color: COLORS.ema21 });
    this.#drawPatternMarkers({ xAt, yPrice });
    this.#drawTimeAxis({ xAt, priceHeight, height });
    this.#drawRsi({ xAt, top: priceHeight + 10, height: rsiHeight - 12, width, padRight });
  }

  #drawPriceAxis({ minPrice, maxPrice, width, padRight, yPrice, priceHeight }) {
    const labels = 5;
    this.ctx.strokeStyle = COLORS.grid;
    this.ctx.fillStyle = COLORS.axis;
    this.ctx.font = "11px sans-serif";
    for (let i = 0; i < labels; i += 1) {
      const t = i / (labels - 1);
      const price = maxPrice - (maxPrice - minPrice) * t;
      const y = yPrice(price);
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width - padRight, y);
      this.ctx.stroke();
      this.ctx.fillText(price.toFixed(2), width - padRight + 4, y + 4);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(width - padRight, 0);
    this.ctx.lineTo(width - padRight, priceHeight);
    this.ctx.stroke();
  }

  #drawCandles({ xAt, xStep, yPrice }) {
    const bodyWidth = Math.max(3, xStep * 0.55);
    this.candles.forEach((candle, idx) => {
      const open = toNum(candle.open);
      const close = toNum(candle.close);
      const high = toNum(candle.high);
      const low = toNum(candle.low);
      const bullish = close >= open;
      const x = xAt(idx);
      const yOpen = yPrice(open);
      const yClose = yPrice(close);
      const yHigh = yPrice(high);
      const yLow = yPrice(low);

      this.ctx.strokeStyle = bullish ? COLORS.bullish : COLORS.bearish;
      this.ctx.beginPath();
      this.ctx.moveTo(x, yHigh);
      this.ctx.lineTo(x, yLow);
      this.ctx.stroke();

      this.ctx.fillStyle = bullish ? COLORS.bullish : COLORS.bearish;
      const top = Math.min(yOpen, yClose);
      const h = Math.max(1, Math.abs(yClose - yOpen));
      this.ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, h);
    });
  }

  #drawEma({ xAt, yPrice, key, color }) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    let started = false;
    this.candles.forEach((_, idx) => {
      const row = this.indicators[idx];
      const value = toNum(row?.[key], NaN);
      if (!Number.isFinite(value)) return;
      const x = xAt(idx);
      const y = yPrice(value);
      if (!started) {
        this.ctx.moveTo(x, y);
        started = true;
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    if (started) this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  #drawPatternMarkers({ xAt, yPrice }) {
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
      const y = bullish ? yPrice(toNum(candle.high)) - 8 : yPrice(toNum(candle.low)) + 8;
      const size = 5;
      const color = PATTERN_COLORS[pattern.type] || "#ddd";

      this.ctx.fillStyle = color;
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

      this.hoverMarkers.push({
        x,
        y,
        size: 8,
        data: {
          type: pattern.type,
          confidence: pattern.prediction?.confidence ?? "—",
          direction: pattern.prediction?.direction ?? "—",
        },
      });
    });
  }

  #drawTimeAxis({ xAt, priceHeight, height }) {
    this.ctx.fillStyle = COLORS.axis;
    this.ctx.font = "10px sans-serif";
    const step = Math.max(1, Math.floor(this.candles.length / 6));
    for (let i = 0; i < this.candles.length; i += step) {
      const candle = this.candles[i];
      const date = new Date(candle.closeTime || candle.timestamp || Date.now());
      const label = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      this.ctx.fillText(label, xAt(i) - 14, Math.min(height - 2, priceHeight + 10));
    }
  }

  #drawRsi({ xAt, top, height, width, padRight }) {
    const left = 10;
    const right = width - padRight;
    const yAt = (rsi) => top + ((100 - rsi) / 100) * height;

    this.ctx.strokeStyle = COLORS.grid;
    this.ctx.strokeRect(left, top, right - left, height);

    [30, 70].forEach((level) => {
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeStyle = COLORS.axis;
      this.ctx.beginPath();
      this.ctx.moveTo(left, yAt(level));
      this.ctx.lineTo(right, yAt(level));
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    });

    this.ctx.lineWidth = 1.2;
    this.candles.forEach((_, idx) => {
      const rsi = toNum(this.indicators[idx]?.rsi14, NaN);
      if (!Number.isFinite(rsi)) return;
      const x = xAt(idx);
      const y = yAt(rsi);
      this.ctx.strokeStyle = rsi < 30 ? COLORS.rsiLow : rsi > 70 ? COLORS.rsiHigh : COLORS.rsiNeutral;
      if (idx === 0) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
      }
    });
    this.ctx.lineWidth = 1;
  }

  #onMouseMove(event) {
    if (!this.hoverMarkers.length || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const marker = this.hoverMarkers.find((item) => Math.abs(item.x - x) <= item.size && Math.abs(item.y - y) <= item.size);
    if (!marker) {
      this.tooltip?.remove();
      this.tooltip = null;
      return;
    }
    if (!this.tooltip) {
      this.tooltip = document.createElement("div");
      this.tooltip.style.position = "fixed";
      this.tooltip.style.pointerEvents = "none";
      this.tooltip.style.background = "rgba(6,10,15,.94)";
      this.tooltip.style.border = "1px solid #273241";
      this.tooltip.style.color = "#e8edf5";
      this.tooltip.style.padding = "4px 6px";
      this.tooltip.style.fontSize = "11px";
      this.tooltip.style.borderRadius = "4px";
      document.body.appendChild(this.tooltip);
    }
    this.tooltip.textContent = `${marker.data.type} | conf: ${marker.data.confidence} | dir: ${marker.data.direction}`;
    this.tooltip.style.left = `${event.clientX + 10}px`;
    this.tooltip.style.top = `${event.clientY + 10}px`;
  }

  #onMouseLeave() {
    this.tooltip?.remove();
    this.tooltip = null;
  }
}
