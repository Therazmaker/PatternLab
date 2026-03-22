import { computeStructureFeatures } from "./structureFilter.js";
import { computeFeatureSnapshot } from "./featureEngine.js";
import { classifyMarketRegime } from "./marketRegime.js";
import { computeProbabilityScores } from "./probabilityEngine.js";

function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ema(values = [], period = 9) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  values.forEach((value, index) => {
    const n = asNumber(value);
    if (n === null) return;
    if (prev === null) {
      prev = n;
      out[index] = n;
      return;
    }
    prev = n * k + prev * (1 - k);
    out[index] = prev;
  });
  return out;
}

function timeframeMs(tf = "5m") {
  const match = String(tf).match(/^(\d+)([mhd])$/i);
  if (!match) return 5 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function describeLastCandle(candle) {
  if (!candle) return "No last candle available.";
  const open = asNumber(candle.open, 0);
  const close = asNumber(candle.close, 0);
  const high = asNumber(candle.high, 0);
  const low = asNumber(candle.low, 0);
  const body = Math.abs(close - open);
  const range = Math.max(high - low, 1e-9);
  const bodyPct = (body / range) * 100;
  const direction = close > open ? "bullish" : close < open ? "bearish" : "doji";
  const wickTop = high - Math.max(open, close);
  const wickBottom = Math.min(open, close) - low;
  const rejection = wickTop > body * 1.3 ? "upper rejection" : wickBottom > body * 1.3 ? "lower rejection" : "balanced wick profile";
  return `${direction} candle · range ${range.toFixed(4)} · body ${bodyPct.toFixed(1)}% · ${rejection}`;
}

function getLocalSwings(candles = [], span = 2) {
  const highs = [];
  const lows = [];
  for (let i = span; i < candles.length - span; i += 1) {
    const center = candles[i];
    const isHigh = candles.slice(i - span, i + span + 1).every((row) => asNumber(center.high, -Infinity) >= asNumber(row.high, -Infinity));
    const isLow = candles.slice(i - span, i + span + 1).every((row) => asNumber(center.low, Infinity) <= asNumber(row.low, Infinity));
    if (isHigh) highs.push({ index: center.index, price: center.high });
    if (isLow) lows.push({ index: center.index, price: center.low });
  }
  return { highs: highs.slice(-8), lows: lows.slice(-8) };
}

export function buildSessionCandleAnalysis(candles = [], context = {}) {
  const rows = Array.isArray(candles) ? candles.filter((row) => [row.open, row.high, row.low, row.close].every((v) => Number.isFinite(Number(v)))) : [];
  const closes = rows.map((row) => asNumber(row.close, 0));
  const ranges = rows.map((row) => Math.max(asNumber(row.high, 0) - asNumber(row.low, 0), 0));
  const last = rows[rows.length - 1] || null;
  const prev = rows[rows.length - 2] || null;
  const lookback = rows.slice(-8);
  const upCloses = lookback.filter((row) => asNumber(row.close, 0) > asNumber(row.open, 0)).length;
  const downCloses = lookback.filter((row) => asNumber(row.close, 0) < asNumber(row.open, 0)).length;
  const avgRange = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
  const recentRange = ranges.slice(-4);
  const recentAvgRange = recentRange.length ? recentRange.reduce((a, b) => a + b, 0) / recentRange.length : avgRange;
  const volCondition = recentAvgRange > avgRange * 1.18 ? "expanding" : recentAvgRange < avgRange * 0.82 ? "compressed" : "normal";
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const fastNow = fast[fast.length - 1];
  const fastPrev = fast[fast.length - 3] ?? fast[fast.length - 2] ?? fastNow;
  const slowNow = slow[slow.length - 1];
  const momentum = fastNow !== null && fastPrev !== null ? (fastNow > fastPrev ? "rising" : fastNow < fastPrev ? "fading" : "flat") : "flat";
  const bias = upCloses >= downCloses + 2 && fastNow !== null && slowNow !== null && fastNow >= slowNow ? "bullish" : downCloses >= upCloses + 2 && fastNow !== null && slowNow !== null && fastNow <= slowNow ? "bearish" : "neutral";

  const sequenceFlags = [];
  if (lookback.length >= 3) {
    const c1 = lookback[lookback.length - 1];
    const c2 = lookback[lookback.length - 2];
    const c3 = lookback[lookback.length - 3];
    if (asNumber(c1.high, 0) <= asNumber(c2.high, 0) && asNumber(c1.low, 0) >= asNumber(c2.low, 0)) sequenceFlags.push("inside bar compression");
    const r1 = Math.abs(asNumber(c1.high, 0) - asNumber(c1.low, 0));
    const r2 = Math.abs(asNumber(c2.high, 0) - asNumber(c2.low, 0));
    if (r1 > r2 * 1.35) sequenceFlags.push("range expansion candle");
    if (asNumber(c1.close, 0) > asNumber(c2.close, 0) && asNumber(c2.close, 0) > asNumber(c3.close, 0)) sequenceFlags.push("bullish follow-through");
    if (asNumber(c1.close, 0) < asNumber(c2.close, 0) && asNumber(c2.close, 0) < asNumber(c3.close, 0)) sequenceFlags.push("bearish follow-through");
    const body = Math.abs(asNumber(c1.close, 0) - asNumber(c1.open, 0));
    const wickTop = asNumber(c1.high, 0) - Math.max(asNumber(c1.open, 0), asNumber(c1.close, 0));
    const wickBottom = Math.min(asNumber(c1.open, 0), asNumber(c1.close, 0)) - asNumber(c1.low, 0);
    if (wickTop > body * 1.4) sequenceFlags.push("rejection near highs");
    if (wickBottom > body * 1.4) sequenceFlags.push("rejection near lows");
  }

  const pushState = !last || !prev ? "stalling" : asNumber(last.close, 0) > asNumber(prev.high, 0) ? "pushing" : asNumber(last.close, 0) < asNumber(prev.low, 0) ? "rejecting" : "stalling";
  const confirmsMove = lookback.length >= 2
    ? ((bias === "bullish" && asNumber(last?.close, 0) >= asNumber(prev?.close, 0)) || (bias === "bearish" && asNumber(last?.close, 0) <= asNumber(prev?.close, 0)))
    : false;
  const continuation = bias === "neutral" ? "mixed" : confirmsMove && volCondition !== "compressed" ? "favorable" : "weak";

  const swings = getLocalSwings(rows);
  const recentHigh = rows.length ? Math.max(...rows.slice(-20).map((row) => asNumber(row.high, -Infinity))) : null;
  const recentLow = rows.length ? Math.min(...rows.slice(-20).map((row) => asNumber(row.low, Infinity))) : null;
  const structure = computeStructureFeatures({
    candles: rows,
    candleIndex: rows.length - 1,
    action: bias === "bearish" ? "SHORT" : "LONG",
    entryPrice: asNumber(last?.close, null),
    targetPrice: bias === "bearish" ? asNumber(last?.close, 0) - Math.max(avgRange, 0) : asNumber(last?.close, 0) + Math.max(avgRange, 0),
  });
  const pseudoMlFeature = computeFeatureSnapshot(rows, rows.length - 1);
  const regime = classifyMarketRegime(pseudoMlFeature);
  const probability = computeProbabilityScores({ feature: pseudoMlFeature, regime });

  const observations = [];
  if (bias === "bullish") observations.push("Recent structure leans bullish with higher close pressure.");
  if (bias === "bearish") observations.push("Recent structure leans bearish with lower close pressure.");
  if (volCondition === "compressed") observations.push("Volatility is compressing after recent movement.");
  if (volCondition === "expanding") observations.push("Range is expanding; movement has broadened.");
  if (momentum === "fading") observations.push("Momentum is fading versus the recent impulse.");
  if (sequenceFlags.length) observations.push(`Sequence notes: ${sequenceFlags.slice(0, 3).join(", ")}.`);
  observations.push(`Structure ${structure.structureBias}/${structure.structureBreakState} · supportQ ${structure.supportQualityScore.toFixed(0)} · resistanceQ ${structure.resistanceQualityScore.toFixed(0)}.`);
  observations.push(`Pseudo-ML regime ${regime.regime} (${regime.strength.toFixed(0)}): ${regime.explanation}`);
  observations.push(`Bullish ${probability.bullishScore.toFixed(1)} · Bearish ${probability.bearishScore.toFixed(1)} · Neutral ${probability.neutralScore.toFixed(1)} · confidence ${probability.confidence.toFixed(1)}.`);
  observations.push(probability.explanation);
  if (!observations.length) observations.push("Recent structure is mixed with no dominant sequence.");

  const events = [];
  const tfMs = timeframeMs(context.timeframe || "5m");
  if (rows.length >= 2) {
    const prevRow = rows[rows.length - 2];
    if (asNumber(last?.high, 0) > asNumber(prevRow?.high, 0) && asNumber(last?.close, 0) < asNumber(prevRow?.high, 0)) events.push({ type: "rejection", label: "Breakout attempt rejected", timestamp: last?.timestamp });
    if (asNumber(last?.close, 0) > asNumber(prevRow?.high, 0)) events.push({ type: "breakout", label: "Local upside breakout", timestamp: last?.timestamp });
    if (asNumber(last?.close, 0) < asNumber(prevRow?.low, 0)) events.push({ type: "breakdown", label: "Local downside breakdown", timestamp: last?.timestamp });
    if (recentAvgRange > avgRange * 1.2) events.push({ type: "volatility", label: "Volatility expansion", timestamp: last?.timestamp });
  }

  if (context.policy?.action) {
    events.unshift({ type: "policy", label: `Policy ${context.policy.action} (${Math.round((context.policy.confidence || 0) * 100)}%)`, timestamp: context.policy.timestamp });
  }
  if (context.shadow?.status === "pending") {
    events.unshift({ type: "shadow", label: `Shadow ${context.shadow.action} pending`, timestamp: context.shadow.timestamp });
  }

  return {
    symbol: context.symbol || "-",
    timeframe: context.timeframe || "-",
    source: context.source || "-",
    candleCount: rows.length,
    lastCandleSummary: describeLastCandle(last),
    bias,
    volatilityCondition: volCondition,
    momentumCondition: momentum,
    pushState,
    latestConfirmsMove: confirmsMove,
    continuationContext: continuation,
    pseudoMl: {
      feature: pseudoMlFeature,
      regime,
      probability,
    },
    observations,
    sequenceFlags,
    overlays: {
      emaFast: fast,
      emaSlow: slow,
      swings,
      recentHigh,
      recentLow,
      currentPrice: asNumber(last?.close),
      nearestSupport: structure.nearestSupportPrice,
      nearestResistance: structure.nearestResistancePrice,
      structureSummary: {
        bias: structure.structureBias,
        breakState: structure.structureBreakState,
        supportQuality: structure.supportQualityScore,
        resistanceQuality: structure.resistanceQualityScore,
        roomForTp: structure.spaceToTargetScore,
        entryQuality: structure.entryLocationScore,
      },
      supportZones: (structure.levels?.supportCandidates || []).slice(0, 3),
      resistanceZones: (structure.levels?.resistanceCandidates || []).slice(0, 3),
      currentOpenPrice: !last?.closed ? asNumber(last?.open) : null,
      isLastOpen: Boolean(last && last.closed === false),
      timeframeMs: tfMs,
    },
    events: events.slice(0, 8),
  };
}
