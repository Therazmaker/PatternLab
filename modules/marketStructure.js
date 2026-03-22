function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function pctDistance(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.abs((a - b) / b) * 100;
}

function trueRange(candle = {}, prevClose = null) {
  const high = toNumber(candle.high, null);
  const low = toNumber(candle.low, null);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return 0;
  if (!Number.isFinite(prevClose)) return Math.max(0, high - low);
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

function computeAtr(candles = [], index = -1, period = 14) {
  if (!Array.isArray(candles) || index < 1) return 0;
  const start = Math.max(1, index - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= index; i += 1) {
    const prevClose = toNumber(candles[i - 1]?.close, null);
    sum += trueRange(candles[i], prevClose);
    count += 1;
  }
  return count ? sum / count : 0;
}

function detectPivots(candles = [], left = 2, right = 2) {
  const highs = [];
  const lows = [];
  for (let i = left; i < candles.length - right; i += 1) {
    const center = candles[i] || {};
    const centerHigh = toNumber(center.high, -Infinity);
    const centerLow = toNumber(center.low, Infinity);
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) continue;
      const row = candles[j] || {};
      if (toNumber(row.high, -Infinity) >= centerHigh) isHigh = false;
      if (toNumber(row.low, Infinity) <= centerLow) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ type: "pivot-high", index: i, timestamp: center.timestamp, price: centerHigh });
    if (isLow) lows.push({ type: "pivot-low", index: i, timestamp: center.timestamp, price: centerLow });
  }
  return { highs, lows };
}

function bucketLevels(candidates = [], atr = 0, priceRef = 0) {
  const tolerance = Math.max(priceRef * 0.0012, atr * 0.35, 1e-8);
  const levels = [];

  candidates.forEach((row) => {
    const price = toNumber(row.price, null);
    if (!Number.isFinite(price)) return;
    const existing = levels.find((lvl) => Math.abs(lvl.price - price) <= tolerance);
    if (!existing) {
      levels.push({
        side: row.side,
        type: row.type,
        price,
        firstIndex: row.index,
        lastIndex: row.index,
        touchCount: 1,
        rejectionStrength: Number(row.rejectionStrength || 0),
        reactionMagnitude: Number(row.reactionMagnitude || 0),
        pivots: row.type.includes("pivot") ? 1 : 0,
      });
      return;
    }
    const total = existing.touchCount + 1;
    existing.price = ((existing.price * existing.touchCount) + price) / total;
    existing.touchCount = total;
    existing.lastIndex = Math.max(existing.lastIndex, row.index);
    existing.firstIndex = Math.min(existing.firstIndex, row.index);
    existing.rejectionStrength += Number(row.rejectionStrength || 0);
    existing.reactionMagnitude += Number(row.reactionMagnitude || 0);
    if (row.type.includes("pivot")) existing.pivots += 1;
  });

  return levels;
}

function scoreLevel(level, nowIndex, span = 60) {
  const touches = Math.min(level.touchCount, 6) / 6;
  const pivotFactor = Math.min(level.pivots, 3) / 3;
  const recency = clamp(1 - ((nowIndex - level.lastIndex) / Math.max(15, span)), 0, 1);
  const rej = clamp(level.rejectionStrength / Math.max(1, level.touchCount), 0, 2) / 2;
  const react = clamp(level.reactionMagnitude / Math.max(1, level.touchCount), 0, 3) / 3;
  const noise = clamp((level.touchCount - level.pivots) / Math.max(1, level.touchCount), 0, 1);
  const cleanliness = 1 - noise * 0.7;
  const quality = clamp((touches * 0.28) + (pivotFactor * 0.16) + (recency * 0.2) + (rej * 0.2) + (react * 0.1) + (cleanliness * 0.06), 0, 1);
  return {
    ...level,
    recencyScore: recency,
    cleanlinessScore: cleanliness,
    qualityScore: Number((quality * 100).toFixed(2)),
    zone: {
      low: level.price * (1 - 0.0007),
      high: level.price * (1 + 0.0007),
    },
  };
}

function detectRejections(candles = [], start = 1, end = 0) {
  const rows = [];
  for (let i = start; i < candles.length - end; i += 1) {
    const c = candles[i] || {};
    const open = toNumber(c.open, null);
    const close = toNumber(c.close, null);
    const high = toNumber(c.high, null);
    const low = toNumber(c.low, null);
    if ([open, close, high, low].some((v) => !Number.isFinite(v))) continue;
    const body = Math.max(1e-8, Math.abs(close - open));
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const range = Math.max(1e-8, high - low);

    if (upperWick > body * 1.35) {
      rows.push({ side: "resistance", type: "rejection-high", index: i, price: high, rejectionStrength: upperWick / range, reactionMagnitude: body / range });
    }
    if (lowerWick > body * 1.35) {
      rows.push({ side: "support", type: "rejection-low", index: i, price: low, rejectionStrength: lowerWick / range, reactionMagnitude: body / range });
    }
  }
  return rows;
}

function computeStructureBias(recent = [], pivots = { highs: [], lows: [] }, priceRef = 0) {
  if (recent.length < 5) return "neutral";
  const closes = recent.map((c) => toNumber(c.close, priceRef));
  const first = closes[0];
  const last = closes[closes.length - 1];
  const movePct = first ? ((last - first) / first) * 100 : 0;

  const recentHighs = pivots.highs.slice(-3).map((p) => p.price);
  const recentLows = pivots.lows.slice(-3).map((p) => p.price);

  const hh = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1] > recentHighs[0];
  const hl = recentLows.length >= 2 && recentLows[recentLows.length - 1] > recentLows[0];
  const lh = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1] < recentHighs[0];
  const ll = recentLows.length >= 2 && recentLows[recentLows.length - 1] < recentLows[0];

  if (hh && hl && movePct > 0.12) return "bullish";
  if (lh && ll && movePct < -0.12) return "bearish";
  if ((hh && ll) || (lh && hl)) return "mixed";
  if (Math.abs(movePct) < 0.08) return "neutral";
  return movePct > 0 ? "bullish" : "bearish";
}

function computeBreakState({ bias, priceRef, nearestSupport, nearestResistance, atr, candles = [] }) {
  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};
  const close = toNumber(last.close, priceRef);
  const prevClose = toNumber(prev.close, close);
  const decay = atr > 0 ? (Math.abs(close - prevClose) / atr) : 0;

  if (bias === "bullish" && nearestSupport?.price && close < nearestSupport.price - (atr * 0.25)) return "broken";
  if (bias === "bearish" && nearestResistance?.price && close > nearestResistance.price + (atr * 0.25)) return "broken";
  if (decay > 1.1) return "weakening";
  if (bias === "mixed" || bias === "neutral") return "weakening";
  return "intact";
}

export function analyzeMarketStructure(candles = [], options = {}) {
  const rows = Array.isArray(candles) ? candles.filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(Number(v)))) : [];
  const candleIndex = Number.isInteger(options.candleIndex) ? options.candleIndex : rows.length - 1;
  const start = Math.max(0, candleIndex - Math.max(40, Number(options.lookback || 120)) + 1);
  const scope = rows.slice(start, candleIndex + 1);
  const current = scope[scope.length - 1] || {};
  const priceRef = toNumber(options.priceRef, toNumber(current.close, null));
  if (!scope.length || !Number.isFinite(priceRef)) {
    return {
      bias: "neutral",
      breakState: "weakening",
      supportLevels: [],
      resistanceLevels: [],
      nearestSupport: null,
      nearestResistance: null,
      range: { high: null, low: null },
      swings: { highs: [], lows: [] },
    };
  }

  const atr = computeAtr(scope, scope.length - 1, 14);
  const pivots = detectPivots(scope, 2, 2);
  const rejections = detectRejections(scope, 1, 0);

  const rangeWindow = scope.slice(-Math.min(30, scope.length));
  const recentHigh = Math.max(...rangeWindow.map((r) => toNumber(r.high, -Infinity)));
  const recentLow = Math.min(...rangeWindow.map((r) => toNumber(r.low, Infinity)));

  const candidates = [
    ...pivots.highs.map((row) => ({ ...row, side: "resistance", rejectionStrength: 0.5, reactionMagnitude: 0.6 })),
    ...pivots.lows.map((row) => ({ ...row, side: "support", rejectionStrength: 0.5, reactionMagnitude: 0.6 })),
    ...rejections,
    { side: "resistance", type: "range-high", index: scope.length - 1, price: recentHigh, rejectionStrength: 0.4, reactionMagnitude: 0.3 },
    { side: "support", type: "range-low", index: scope.length - 1, price: recentLow, rejectionStrength: 0.4, reactionMagnitude: 0.3 },
  ];

  const supportLevels = bucketLevels(candidates.filter((c) => c.side === "support"), atr, priceRef)
    .map((row) => scoreLevel(row, scope.length - 1, scope.length))
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const resistanceLevels = bucketLevels(candidates.filter((c) => c.side === "resistance"), atr, priceRef)
    .map((row) => scoreLevel(row, scope.length - 1, scope.length))
    .sort((a, b) => b.qualityScore - a.qualityScore);

  const nearestSupport = supportLevels
    .filter((row) => row.price <= priceRef)
    .sort((a, b) => (Math.abs(priceRef - a.price) - Math.abs(priceRef - b.price)) || (b.qualityScore - a.qualityScore))[0] || null;
  const nearestResistance = resistanceLevels
    .filter((row) => row.price >= priceRef)
    .sort((a, b) => (Math.abs(priceRef - a.price) - Math.abs(priceRef - b.price)) || (b.qualityScore - a.qualityScore))[0] || null;

  const bias = computeStructureBias(scope.slice(-12), pivots, priceRef);
  const breakState = computeBreakState({ bias, priceRef, nearestSupport, nearestResistance, atr, candles: scope.slice(-6) });

  return {
    bias,
    breakState,
    atr,
    range: { high: recentHigh, low: recentLow },
    swings: {
      highs: pivots.highs.slice(-10).map((row) => ({ ...row, index: start + row.index + 1 })),
      lows: pivots.lows.slice(-10).map((row) => ({ ...row, index: start + row.index + 1 })),
    },
    supportLevels,
    resistanceLevels,
    nearestSupport,
    nearestResistance,
    nearestSupportDistancePct: pctDistance(priceRef, nearestSupport?.price ?? NaN),
    nearestResistanceDistancePct: pctDistance(priceRef, nearestResistance?.price ?? NaN),
  };
}
