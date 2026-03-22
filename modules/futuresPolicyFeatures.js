import { calculateEMA } from "./indicators.js";
import { getSessionTag } from "./neuronEngine.js";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input = "") {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash)}`;
}

function buildActivationIndex(activations = []) {
  const byIndex = new Map();
  const byTimestamp = new Map();
  (Array.isArray(activations) ? activations : []).forEach((row) => {
    if (!row?.active) return;
    const idx = Number.isInteger(row.index) ? row.index : null;
    if (idx !== null) {
      if (!byIndex.has(idx)) byIndex.set(idx, []);
      byIndex.get(idx).push(row.neuronId);
    }
    if (row.timestamp) {
      if (!byTimestamp.has(row.timestamp)) byTimestamp.set(row.timestamp, []);
      byTimestamp.get(row.timestamp).push(row.neuronId);
    }
  });
  return { byIndex, byTimestamp };
}

function classifyNeuronCluster(activeIds = []) {
  const summary = { bullish: 0, bearish: 0, neutral: 0 };
  activeIds.forEach((id) => {
    const key = String(id || "").toLowerCase();
    if (["bull", "higher_high", "push_up", "support"].some((token) => key.includes(token))) summary.bullish += 1;
    else if (["bear", "lower_low", "push_down", "resistance"].some((token) => key.includes(token))) summary.bearish += 1;
    else summary.neutral += 1;
  });
  return summary;
}

function computeAtrProxy(candles = [], index = -1, period = 14) {
  if (!Array.isArray(candles) || index < 1) return null;
  const start = Math.max(1, index - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= index; i += 1) {
    const c = candles[i] || {};
    const prev = candles[i - 1] || {};
    const high = toNumber(c.high, null);
    const low = toNumber(c.low, null);
    const prevClose = toNumber(prev.close, null);
    if ([high, low, prevClose].some((v) => v === null)) continue;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
    count += 1;
  }
  return count ? sum / count : null;
}

function findCandleIndex(candles = [], timestamp) {
  if (!Array.isArray(candles) || !timestamp) return -1;
  const exact = candles.findIndex((c) => c?.timestamp === timestamp);
  if (exact >= 0) return exact;
  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return -1;
  let best = -1;
  let bestDelta = Infinity;
  candles.forEach((candle, index) => {
    const rowTs = new Date(candle?.timestamp || 0).getTime();
    if (!Number.isFinite(rowTs) || rowTs > ts) return;
    const delta = ts - rowTs;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = index;
    }
  });
  return best;
}

function seededMatch(activeNeurons = [], seededPatterns = []) {
  const activeSet = new Set(activeNeurons);
  const matches = (Array.isArray(seededPatterns) ? seededPatterns : [])
    .map((row) => {
      const neurons = Array.isArray(row?.neurons) ? row.neurons : [];
      const overlap = neurons.filter((id) => activeSet.has(id));
      const overlapScore = neurons.length ? overlap.length / neurons.length : 0;
      return {
        patternId: row.patternId,
        overlap,
        overlapScore,
        winRate: toNumber(row.winRate, 0),
        consistencyScore: toNumber(row.consistencyScore, 0),
        direction: row.direction || "neutral",
      };
    })
    .filter((row) => row.overlap.length > 0)
    .sort((a, b) => (b.overlapScore + b.winRate) - (a.overlapScore + a.winRate));
  return matches.slice(0, 3);
}

export function buildFuturesPolicyFeatures(input = {}, options = {}) {
  const signal = input.signal || {};
  const candles = Array.isArray(input.candles) ? input.candles : [];
  const activations = Array.isArray(input.neuronActivations) ? input.neuronActivations : [];
  const seededPatterns = Array.isArray(input.seededPatterns) ? input.seededPatterns : [];
  const candleIndex = Number.isInteger(input.candleIndex) ? input.candleIndex : findCandleIndex(candles, signal.timestamp);
  const candle = candles[candleIndex] || {};

  const activationIndex = buildActivationIndex(activations);
  const activeNeuronIds = Array.from(new Set(
    activationIndex.byIndex.get(candleIndex)
    || activationIndex.byTimestamp.get(signal.timestamp)
    || signal.features?.activeNeurons
    || []
  ));

  const clusterSummary = classifyNeuronCluster(activeNeuronIds);
  const activeCount = activeNeuronIds.length;

  const seededMatches = seededMatch(activeNeuronIds, seededPatterns);
  const seededBias = seededMatches.reduce((acc, row) => {
    if (row.direction === "bullish") return acc + row.overlapScore * 0.25;
    if (row.direction === "bearish") return acc - row.overlapScore * 0.25;
    return acc;
  }, 0);

  const contextScore = toNumber(signal.contextScore, 50) ?? 50;
  const radarScore = toNumber(signal.radarScore, 50) ?? 50;
  const freshnessScore = toNumber(signal.freshnessScore, 0) ?? 0;
  const robustnessScore = toNumber(signal.patternMeta?.robustness?.robustnessScore, 50) ?? 50;
  const adaptiveScore = toNumber(signal.patternMeta?.adaptiveScore, 0) ?? 0;
  const stability = toNumber(signal.patternMeta?.stability, 0) ?? 0;

  const emaFast = calculateEMA(candles, 9);
  const emaSlow = calculateEMA(candles, 21);
  const emaFastNow = toNumber(emaFast[candleIndex], null);
  const emaFastPrev = toNumber(emaFast[candleIndex - 1], null);
  const emaSlowNow = toNumber(emaSlow[candleIndex], null);
  const emaSlope = (emaFastNow !== null && emaFastPrev !== null) ? (emaFastNow - emaFastPrev) : 0;

  const priceRef = toNumber(signal.entryPrice, toNumber(candle.close, null));
  const atr14 = computeAtrProxy(candles, candleIndex, 14);
  const range = toNumber(candle.high, 0) - toNumber(candle.low, 0);
  const candleSpreadPct = priceRef ? range / priceRef : 0;
  const sessionTag = signal.session || getSessionTag(signal.timestamp);
  const sessionQuality = ["overlap", "london", "newyork"].includes(sessionTag) ? "prime" : "offpeak";

  const neuronBias = activeCount ? (clusterSummary.bullish - clusterSummary.bearish) / activeCount : 0;
  const regimeBias = ["bull", "trend", "breakout"].some((k) => String(signal.marketRegime || "").toLowerCase().includes(k)) ? 0.25
    : ["bear", "riskoff"].some((k) => String(signal.marketRegime || "").toLowerCase().includes(k)) ? -0.25
      : 0;
  const patternBias = signal.direction === "CALL" ? 0.2 : signal.direction === "PUT" ? -0.2 : 0;
  const directionBias = clamp(neuronBias + regimeBias + patternBias + seededBias, -1, 1);

  const sr = signal.srContext || {};
  const srProximity = {
    nearSupport: Boolean(sr.nearSupport),
    nearResistance: Boolean(sr.nearResistance),
  };

  const conflictFlags = [];
  if (directionBias > 0.25 && srProximity.nearResistance) conflictFlags.push("bullish-bias-near-resistance");
  if (directionBias < -0.25 && srProximity.nearSupport) conflictFlags.push("bearish-bias-near-support");
  if (Math.abs(directionBias) > 0.35 && robustnessScore < 45) conflictFlags.push("strong-bias-low-robustness");
  if (contextScore < 42 && Math.abs(directionBias) > 0.3) conflictFlags.push("bias-vs-weak-context");

  const state = {
    symbol: signal.asset || candle.asset || "",
    timeframe: signal.timeframe || candle.timeframe || "5m",
    timestamp: signal.timestamp || candle.timestamp || null,
    candleIndex,
    marketRegime: signal.marketRegime || "unclear",
    activeNeuronIds,
    neuronCount: activeCount,
    neuronCluster: clusterSummary,
    sessionTag,
    sessionQuality,
    directionBias,
    contextScore,
    radarScore,
    freshnessScore,
    linkedPatternName: signal.patternName || null,
    linkedPatternVersion: signal.patternVersion || null,
    seededMatches,
    adaptiveScore,
    stability,
    srProximity,
    volatility: {
      atr14,
      candleRange: range,
      candleSpreadPct,
    },
    trend: {
      emaFast: emaFastNow,
      emaSlow: emaSlowNow,
      emaSlope,
      structure: emaFastNow !== null && emaSlowNow !== null
        ? (emaFastNow > emaSlowNow ? "up" : emaFastNow < emaSlowNow ? "down" : "flat")
        : "flat",
    },
    mfe: toNumber(signal.excursion?.mfe, null),
    mae: toNumber(signal.excursion?.mae, null),
    robustness: {
      robustnessScore,
      overfitRisk: signal.patternMeta?.robustness?.overfitRisk || "low",
    },
    conflictFlags,
    priceRef,
  };

  const explanation = {
    summary: `Bias ${directionBias.toFixed(2)} with ${activeCount} active neurons and ${seededMatches.length} seeded overlaps.`,
    drivers: {
      neuronBias: Number(neuronBias.toFixed(3)),
      regimeBias,
      patternBias,
      seededBias: Number(seededBias.toFixed(3)),
    },
    warnings: conflictFlags,
    seededReadiness: seededMatches.map((m) => `${m.patternId}: overlap ${(m.overlapScore * 100).toFixed(0)}% · win ${(m.winRate * 100).toFixed(1)}%`),
    volatilityRead: `ATR14 ${atr14?.toFixed?.(5) || "n/a"} · spread ${(candleSpreadPct * 100).toFixed(2)}%`,
  };

  const stateHash = hashString(JSON.stringify({
    t: state.timestamp,
    n: state.activeNeuronIds,
    d: state.directionBias,
    c: state.contextScore,
    r: state.radarScore,
    rg: state.marketRegime,
    cf: state.conflictFlags,
  }));

  return { state, explanation, stateHash };
}
