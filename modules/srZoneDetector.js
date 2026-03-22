function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function buildCandidates(candles = []) {
  const out = [];
  candles.forEach((candle, idx) => {
    const open = num(candle.open, 0);
    const close = num(candle.close, 0);
    const high = num(candle.high, close);
    const low = num(candle.low, close);
    const range = Math.max(high - low, 1e-9);
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    out.push({ type: "resistance", price: high, index: idx, rejection: clamp((upperWick / range) * 100, 0, 100) });
    out.push({ type: "support", price: low, index: idx, rejection: clamp((lowerWick / range) * 100, 0, 100) });
  });
  return out;
}

function clusterByPrice(rows, toleranceAbs) {
  const sorted = [...rows].sort((a, b) => a.price - b.price);
  const clusters = [];
  sorted.forEach((row) => {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(last.center - row.price) > toleranceAbs) {
      clusters.push({ points: [row], center: row.price });
      return;
    }
    last.points.push(row);
    last.center = last.points.reduce((acc, point) => acc + point.price, 0) / last.points.length;
  });
  return clusters;
}

export function detectSrZones(candles = [], options = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  if (rows.length < 3) return [];
  const lookback = rows.slice(-(options.lookback || 40));
  const allHighs = lookback.map((c) => num(c.high, NaN)).filter(Number.isFinite);
  const allLows = lookback.map((c) => num(c.low, NaN)).filter(Number.isFinite);
  const avgRange = lookback.reduce((acc, c) => acc + Math.max(num(c.high, 0) - num(c.low, 0), 0), 0) / Math.max(lookback.length, 1);
  const priceRef = num(lookback[lookback.length - 1]?.close, 1) || 1;
  const spread = (Math.max(...allHighs, priceRef) - Math.min(...allLows, priceRef));
  const toleranceAbs = options.toleranceAbs || Math.max(avgRange * 0.28, spread * 0.0025, priceRef * 0.0015);
  const minTouches = options.minTouches || 2;

  const candidates = buildCandidates(lookback);
  const zones = ["support", "resistance"].flatMap((type) => {
    const group = candidates.filter((row) => row.type === type);
    const clusters = clusterByPrice(group, toleranceAbs);
    return clusters
      .filter((cluster) => cluster.points.length >= minTouches)
      .map((cluster) => {
        const touches = cluster.points.length;
        const latest = Math.max(...cluster.points.map((p) => p.index));
        const recency = (latest + 1) / lookback.length;
        const rejection = cluster.points.reduce((acc, p) => acc + p.rejection, 0) / touches;
        const strength = clamp((touches * 22) + (recency * 28) + (rejection * 0.5), 0, 100);
        return {
          price: Number(cluster.center.toFixed(6)),
          type,
          touches,
          strength: Number(strength.toFixed(0)),
        };
      });
  });

  return zones
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8);
}
