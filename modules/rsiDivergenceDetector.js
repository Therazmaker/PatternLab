function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function rsi(closes = [], period = 14) {
  if (!closes.length) return [];
  const out = Array(closes.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (i <= period) {
      gains += Math.max(delta, 0);
      losses += Math.max(-delta, 0);
      if (i === period) {
        const rs = gains / Math.max(losses, 1e-9);
        out[i] = 100 - (100 / (1 + rs));
      }
      continue;
    }
    gains = ((gains * (period - 1)) + Math.max(delta, 0)) / period;
    losses = ((losses * (period - 1)) + Math.max(-delta, 0)) / period;
    const rs = gains / Math.max(losses, 1e-9);
    out[i] = 100 - (100 / (1 + rs));
  }
  return out;
}

function pivotPoints(values = [], type = "high", span = 2) {
  const pts = [];
  for (let i = span; i < values.length - span; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    let ok = true;
    for (let j = i - span; j <= i + span; j += 1) {
      if (j === i || !Number.isFinite(values[j])) continue;
      if (type === "high" && values[j] > v) ok = false;
      if (type === "low" && values[j] < v) ok = false;
    }
    if (ok) pts.push({ index: i, value: v });
  }
  return pts.slice(-5);
}

export function detectRsiDivergence(candles = [], threshold = 22) {
  const rows = Array.isArray(candles) ? candles : [];
  if (rows.length < 8) return null;
  const closes = rows.map((c) => num(c.close, NaN));
  const highs = rows.map((c) => num(c.high, NaN));
  const lows = rows.map((c) => num(c.low, NaN));
  const rsiSeries = rsi(closes, 14);

  const highPivots = pivotPoints(highs, "high", 2);
  const lowPivots = pivotPoints(lows, "low", 2);

  if (lowPivots.length >= 2) {
    const a = lowPivots[lowPivots.length - 2];
    const b = lowPivots[lowPivots.length - 1];
    const rsiA = rsiSeries[a.index];
    const rsiB = rsiSeries[b.index];
    if (Number.isFinite(rsiA) && Number.isFinite(rsiB) && b.value < a.value && rsiB > rsiA) {
      const priceDelta = Math.abs((a.value - b.value) / Math.max(Math.abs(a.value), 1e-9));
      const rsiDelta = Math.abs(rsiB - rsiA) / 100;
      const strength = clamp((priceDelta * 380) + (rsiDelta * 140), 0, 100);
      if (strength >= threshold) return { type: "bullish", strength: Math.round(strength) };
    }
  }

  if (highPivots.length >= 2) {
    const a = highPivots[highPivots.length - 2];
    const b = highPivots[highPivots.length - 1];
    const rsiA = rsiSeries[a.index];
    const rsiB = rsiSeries[b.index];
    if (Number.isFinite(rsiA) && Number.isFinite(rsiB) && b.value > a.value && rsiB < rsiA) {
      const priceDelta = Math.abs((b.value - a.value) / Math.max(Math.abs(a.value), 1e-9));
      const rsiDelta = Math.abs(rsiA - rsiB) / 100;
      const strength = clamp((priceDelta * 380) + (rsiDelta * 140), 0, 100);
      if (strength >= threshold) return { type: "bearish", strength: Math.round(strength) };
    }
  }

  return null;
}

export function computeRsi(candles = [], period = 14) {
  const closes = (candles || []).map((c) => Number(c.close)).filter(Number.isFinite);
  if (!closes.length) return null;
  const series = rsi(closes, period);
  return series[series.length - 1] ?? null;
}
