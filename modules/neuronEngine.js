import { calculateEMA, calculateRSI } from "./indicators.js";

/**
 * modules/neuronEngine.js
 * Deterministic and explainable neuron activations over candle data.
 *
 * This module is intentionally rule-based so future patternDiscovery can mine
 * combinations and later translate selected rules to PineScript.
 */

export const DEFAULT_NEURON_OPTIONS = {
  dojiBodyPercentMax: 0.15,
  bigBodyPercentMin: 0.6,
  smallBodyPercentMax: 0.2,
  longWickPercentMin: 0.4,
  fullBodyPercentMin: 0.8,
  compressionLookback: 5,
  expansionMultiplier: 1.3,
  rejectionWickPercentMin: 0.45,
  rejectionBodyPercentMax: 0.35,
  localPushLookback: 3,
  swingWindow: 2,
  emaFastPeriod: 9,
  emaSlowPeriod: 21,
  emaSlopeLookback: 2,
  rsiPeriod: 14,
  momentumLookback: 3,
  pullbackPercent: 0.001,
  binaryNeutralAsLoss: true,
};

export function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function toTimestampMs(isoString) {
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getPreviousCandle(candles, index) {
  if (!Array.isArray(candles) || index <= 0) return null;
  return candles[index - 1] || null;
}

export function getNextCandle(candles, index) {
  if (!Array.isArray(candles)) return null;
  return candles[index + 1] || null;
}

export function getCandleWindow(candles, index, left = 0, right = 0) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const start = Math.max(0, index - Math.max(0, left));
  const end = Math.min(candles.length - 1, index + Math.max(0, right));
  return candles.slice(start, end + 1);
}

function normalizeRangeValue(value, range) {
  if (range <= 0) return 0;
  return Math.max(0, value / range);
}

export function calculateCandleFeatures(candle, options = DEFAULT_NEURON_OPTIONS) {
  const open = safeNumber(candle?.open);
  const high = safeNumber(candle?.high);
  const low = safeNumber(candle?.low);
  const close = safeNumber(candle?.close);

  const range = Math.max(0, high - low);
  const bodySize = Math.abs(close - open);
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);

  const closePositionInRange = range > 0 ? (close - low) / range : null;
  const openPositionInRange = range > 0 ? (open - low) / range : null;
  const bodyPercentOfRange = normalizeRangeValue(bodySize, range);
  const upperWickPercentOfRange = normalizeRangeValue(upperWick, range);
  const lowerWickPercentOfRange = normalizeRangeValue(lowerWick, range);

  return {
    range,
    bodySize,
    upperWick,
    lowerWick,
    bullish: close > open,
    bearish: close < open,
    dojiLike: bodyPercentOfRange <= (options.dojiBodyPercentMax ?? DEFAULT_NEURON_OPTIONS.dojiBodyPercentMax),
    midPrice: (high + low) / 2,
    closePositionInRange,
    openPositionInRange,
    bodyPercentOfRange,
    upperWickPercentOfRange,
    lowerWickPercentOfRange,
  };
}

/**
 * Session tags based on UTC time. Easy to adjust for future research.
 * - asia: 00:00-06:59 UTC
 * - london: 07:00-11:59 UTC
 * - overlap: 12:00-15:59 UTC (London + New York overlap)
 * - newyork: 16:00-20:59 UTC
 * - offhours: 21:00-23:59 UTC
 */
export function getSessionTag(timestamp) {
  const ts = toTimestampMs(timestamp);
  if (ts === null) return "offhours";
  const utcHour = new Date(ts).getUTCHours();

  if (utcHour >= 0 && utcHour < 7) return "asia";
  if (utcHour >= 7 && utcHour < 12) return "london";
  if (utcHour >= 12 && utcHour < 16) return "overlap";
  if (utcHour >= 16 && utcHour < 21) return "newyork";
  return "offhours";
}

function getAverageRange(candles, index, lookback) {
  const from = Math.max(0, index - lookback);
  const window = candles.slice(from, index);
  if (!window.length) return null;
  const total = window.reduce((sum, c) => sum + calculateCandleFeatures(c).range, 0);
  return total / window.length;
}

export function calculateWindowFeatures(candles, index, options = DEFAULT_NEURON_OPTIONS) {
  const candle = candles?.[index];
  const previous = getPreviousCandle(candles, index);
  const next = getNextCandle(candles, index);

  const currentFeatures = calculateCandleFeatures(candle, options);
  const previousFeatures = previous ? calculateCandleFeatures(previous, options) : null;
  const nextFeatures = next ? calculateCandleFeatures(next, options) : null;

  const averageRange = getAverageRange(candles, index, options.compressionLookback ?? DEFAULT_NEURON_OPTIONS.compressionLookback);
  const expansionThreshold = (averageRange ?? 0) * (options.expansionMultiplier ?? DEFAULT_NEURON_OPTIONS.expansionMultiplier);
  const isExpansion = averageRange !== null && currentFeatures.range >= expansionThreshold;
  const isCompression = averageRange !== null && currentFeatures.range <= averageRange / (options.expansionMultiplier ?? DEFAULT_NEURON_OPTIONS.expansionMultiplier);

  const localWindow = getCandleWindow(candles, index, options.swingWindow ?? DEFAULT_NEURON_OPTIONS.swingWindow, options.swingWindow ?? DEFAULT_NEURON_OPTIONS.swingWindow);
  const localHigh = localWindow.length ? Math.max(...localWindow.map((c) => safeNumber(c.high))) : null;
  const localLow = localWindow.length ? Math.min(...localWindow.map((c) => safeNumber(c.low))) : null;

  return {
    previousBullish: Boolean(previousFeatures?.bullish),
    previousBearish: Boolean(previousFeatures?.bearish),
    nextBullish: Boolean(nextFeatures?.bullish),
    nextBearish: Boolean(nextFeatures?.bearish),
    highBreaksPreviousHigh: Boolean(previous && safeNumber(candle.high) > safeNumber(previous.high)),
    lowBreaksPreviousLow: Boolean(previous && safeNumber(candle.low) < safeNumber(previous.low)),
    insideBarLike: Boolean(previous && safeNumber(candle.high) <= safeNumber(previous.high) && safeNumber(candle.low) >= safeNumber(previous.low)),
    outsideBarLike: Boolean(previous && safeNumber(candle.high) >= safeNumber(previous.high) && safeNumber(candle.low) <= safeNumber(previous.low)),
    bullishFollowthrough: Boolean(previousFeatures?.bullish && currentFeatures.bullish && safeNumber(candle.close) > safeNumber(previous.close)),
    bearishFollowthrough: Boolean(previousFeatures?.bearish && currentFeatures.bearish && safeNumber(candle.close) < safeNumber(previous.close)),
    localCompression: isCompression,
    localExpansion: isExpansion,
    localHigh,
    localLow,
    localSwingHighLike: localHigh !== null ? safeNumber(candle.high) >= localHigh : false,
    localSwingLowLike: localLow !== null ? safeNumber(candle.low) <= localLow : false,
    sessionTag: getSessionTag(candle?.timestamp),
    averageRange,
  };
}

function buildActivation({ neuronId, category, timestamp, index, active, score, pineCompatible, explanation, inputs }) {
  return {
    neuronId,
    category,
    timestamp,
    index,
    active: Boolean(active),
    score: active ? Number(score) : 0,
    pineCompatible: Boolean(pineCompatible),
    explanation,
    inputs: inputs || {},
  };
}

function computeSingleCandleContext(candles, index, options) {
  const current = candles[index];
  const features = calculateCandleFeatures(current, options);
  const windowFeatures = calculateWindowFeatures(candles, index, options);
  return { current, features, windowFeatures };
}


function getSeriesCache(options) {
  if (!options.__seriesCache) options.__seriesCache = {};
  return options.__seriesCache;
}

function getEmaSeries(candles, options, period, sourceKey = "close") {
  const cache = getSeriesCache(options);
  const key = `ema:${period}:${sourceKey}`;
  if (!cache[key]) cache[key] = calculateEMA(candles, period, sourceKey);
  return cache[key];
}

function getRsiSeries(candles, options, period, sourceKey = "close") {
  const cache = getSeriesCache(options);
  const key = `rsi:${period}:${sourceKey}`;
  if (!cache[key]) cache[key] = calculateRSI(candles, period, sourceKey);
  return cache[key];
}

function getSeriesValue(series, index) {
  const value = Array.isArray(series) ? series[index] : null;
  return Number.isFinite(value) ? value : null;
}

export const NEURON_DEFINITIONS = [
  {
    id: "bullish_candle",
    category: "single_candle",
    description: "Close is above open.",
    pineCompatible: true,
    compute: (candles, index, options) => {
      const { current, features } = computeSingleCandleContext(candles, index, options);
      return buildActivation({
        neuronId: "bullish_candle",
        category: "single_candle",
        timestamp: current?.timestamp,
        index,
        active: features.bullish,
        score: 1,
        pineCompatible: true,
        explanation: features.bullish ? "Close is above open." : "Close is not above open.",
        inputs: { open: safeNumber(current?.open), close: safeNumber(current?.close) },
      });
    },
  },
  {
    id: "bearish_candle",
    category: "single_candle",
    description: "Close is below open.",
    pineCompatible: true,
    compute: (candles, index, options) => {
      const { current, features } = computeSingleCandleContext(candles, index, options);
      return buildActivation({ neuronId: "bearish_candle", category: "single_candle", timestamp: current?.timestamp, index, active: features.bearish, score: 1, pineCompatible: true, explanation: features.bearish ? "Close is below open." : "Close is not below open.", inputs: { open: safeNumber(current?.open), close: safeNumber(current?.close) } });
    },
  },
  {
    id: "doji_like", category: "single_candle", description: "Body is small relative to range.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const active = features.dojiLike; return buildActivation({ neuronId: "doji_like", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? `Body is ${(features.bodyPercentOfRange * 100).toFixed(1)}% of range.` : "Body not small enough for doji-like.", inputs: { bodyPercentOfRange: features.bodyPercentOfRange } }); },
  },
  {
    id: "big_body", category: "single_candle", description: "Body percent exceeds configured minimum.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const threshold = options.bigBodyPercentMin ?? DEFAULT_NEURON_OPTIONS.bigBodyPercentMin; const active = features.bodyPercentOfRange >= threshold; return buildActivation({ neuronId: "big_body", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? `Body ${(features.bodyPercentOfRange * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(1)}%.` : "Body does not reach big-body threshold.", inputs: { bodyPercentOfRange: features.bodyPercentOfRange, threshold } }); },
  },
  {
    id: "small_body", category: "single_candle", description: "Body percent is below configured maximum.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const threshold = options.smallBodyPercentMax ?? DEFAULT_NEURON_OPTIONS.smallBodyPercentMax; const active = features.bodyPercentOfRange <= threshold; return buildActivation({ neuronId: "small_body", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? `Body ${(features.bodyPercentOfRange * 100).toFixed(1)}% <= ${(threshold * 100).toFixed(1)}%.` : "Body too large for small-body neuron.", inputs: { bodyPercentOfRange: features.bodyPercentOfRange, threshold } }); },
  },
  {
    id: "long_upper_wick", category: "single_candle", description: "Upper wick is large relative to range.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const threshold = options.longWickPercentMin ?? DEFAULT_NEURON_OPTIONS.longWickPercentMin; const active = features.upperWickPercentOfRange >= threshold; const score = active ? (features.upperWickPercentOfRange >= threshold + 0.15 ? 1 : 0.8) : 0; return buildActivation({ neuronId: "long_upper_wick", category: "single_candle", timestamp: current?.timestamp, index, active, score, pineCompatible: true, explanation: active ? `Upper wick ${(features.upperWickPercentOfRange * 100).toFixed(1)}% of range.` : "Upper wick not long enough.", inputs: { upperWickPercentOfRange: features.upperWickPercentOfRange, threshold } }); },
  },
  {
    id: "long_lower_wick", category: "single_candle", description: "Lower wick is large relative to range.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const threshold = options.longWickPercentMin ?? DEFAULT_NEURON_OPTIONS.longWickPercentMin; const active = features.lowerWickPercentOfRange >= threshold; const score = active ? (features.lowerWickPercentOfRange >= threshold + 0.15 ? 1 : 0.8) : 0; return buildActivation({ neuronId: "long_lower_wick", category: "single_candle", timestamp: current?.timestamp, index, active, score, pineCompatible: true, explanation: active ? `Lower wick ${(features.lowerWickPercentOfRange * 100).toFixed(1)}% of range.` : "Lower wick not long enough.", inputs: { lowerWickPercentOfRange: features.lowerWickPercentOfRange, threshold } }); },
  },
  {
    id: "full_body_bull", category: "single_candle", description: "Bull candle with body occupying most of range.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const threshold = options.fullBodyPercentMin ?? DEFAULT_NEURON_OPTIONS.fullBodyPercentMin; const active = features.bullish && features.bodyPercentOfRange >= threshold; return buildActivation({ neuronId: "full_body_bull", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Bull body dominates candle range." : "Not a full-body bullish candle.", inputs: { bullish: features.bullish, bodyPercentOfRange: features.bodyPercentOfRange, threshold } }); },
  },
  {
    id: "full_body_bear", category: "single_candle", description: "Bear candle with body occupying most of range.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const threshold = options.fullBodyPercentMin ?? DEFAULT_NEURON_OPTIONS.fullBodyPercentMin; const active = features.bearish && features.bodyPercentOfRange >= threshold; return buildActivation({ neuronId: "full_body_bear", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Bear body dominates candle range." : "Not a full-body bearish candle.", inputs: { bearish: features.bearish, bodyPercentOfRange: features.bodyPercentOfRange, threshold } }); },
  },
  {
    id: "range_expansion", category: "single_candle", description: "Current range exceeds local average by multiplier.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features, windowFeatures } = computeSingleCandleContext(candles, index, options); const active = windowFeatures.localExpansion; return buildActivation({ neuronId: "range_expansion", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Range is expanded versus local average." : "Range is not expanded.", inputs: { range: features.range, averageRange: windowFeatures.averageRange, expansionMultiplier: options.expansionMultiplier ?? DEFAULT_NEURON_OPTIONS.expansionMultiplier } }); },
  },
  {
    id: "range_compression", category: "single_candle", description: "Current range is compressed versus local average.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features, windowFeatures } = computeSingleCandleContext(candles, index, options); const active = windowFeatures.localCompression; return buildActivation({ neuronId: "range_compression", category: "single_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Range is compressed versus local average." : "Range is not compressed.", inputs: { range: features.range, averageRange: windowFeatures.averageRange, expansionMultiplier: options.expansionMultiplier ?? DEFAULT_NEURON_OPTIONS.expansionMultiplier } }); },
  },
  {
    id: "bullish_followthrough", category: "two_candle", description: "Two bullish candles with higher close.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const windowFeatures = calculateWindowFeatures(candles, index, options); const active = windowFeatures.bullishFollowthrough; return buildActivation({ neuronId: "bullish_followthrough", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Bull candle continues prior bullish close." : "No bullish followthrough.", inputs: { previousBullish: windowFeatures.previousBullish, bullishFollowthrough: windowFeatures.bullishFollowthrough } }); },
  },
  {
    id: "bearish_followthrough", category: "two_candle", description: "Two bearish candles with lower close.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const windowFeatures = calculateWindowFeatures(candles, index, options); const active = windowFeatures.bearishFollowthrough; return buildActivation({ neuronId: "bearish_followthrough", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Bear candle continues prior bearish close." : "No bearish followthrough.", inputs: { previousBearish: windowFeatures.previousBearish, bearishFollowthrough: windowFeatures.bearishFollowthrough } }); },
  },
  {
    id: "bullish_engulfing_like", category: "two_candle", description: "Bull body engulfs prior body zone.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const previous = getPreviousCandle(candles, index); const active = Boolean(previous && safeNumber(current.close) > safeNumber(previous.open) && safeNumber(current.open) < safeNumber(previous.close) && safeNumber(current.close) > safeNumber(current.open)); return buildActivation({ neuronId: "bullish_engulfing_like", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Bull candle body engulfs prior body area." : "No bullish engulfing-like setup.", inputs: { currentOpen: safeNumber(current?.open), currentClose: safeNumber(current?.close), previousOpen: safeNumber(previous?.open), previousClose: safeNumber(previous?.close) } }); },
  },
  {
    id: "bearish_engulfing_like", category: "two_candle", description: "Bear body engulfs prior body zone.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const previous = getPreviousCandle(candles, index); const active = Boolean(previous && safeNumber(current.open) > safeNumber(previous.close) && safeNumber(current.close) < safeNumber(previous.open) && safeNumber(current.close) < safeNumber(current.open)); return buildActivation({ neuronId: "bearish_engulfing_like", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Bear candle body engulfs prior body area." : "No bearish engulfing-like setup.", inputs: { currentOpen: safeNumber(current?.open), currentClose: safeNumber(current?.close), previousOpen: safeNumber(previous?.open), previousClose: safeNumber(previous?.close) } }); },
  },
  {
    id: "inside_bar_like", category: "two_candle", description: "Current candle is inside prior high/low.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const windowFeatures = calculateWindowFeatures(candles, index, options); const active = windowFeatures.insideBarLike; return buildActivation({ neuronId: "inside_bar_like", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Current range is contained by previous range." : "Not an inside-bar-like candle.", inputs: { insideBarLike: windowFeatures.insideBarLike } }); },
  },
  {
    id: "outside_bar_like", category: "two_candle", description: "Current candle expands outside prior high/low.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const windowFeatures = calculateWindowFeatures(candles, index, options); const active = windowFeatures.outsideBarLike; return buildActivation({ neuronId: "outside_bar_like", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Current range fully covers previous range." : "Not an outside-bar-like candle.", inputs: { outsideBarLike: windowFeatures.outsideBarLike } }); },
  },
  {
    id: "higher_high_break", category: "two_candle", description: "Current high exceeds previous high.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const windowFeatures = calculateWindowFeatures(candles, index, options); const active = windowFeatures.highBreaksPreviousHigh; return buildActivation({ neuronId: "higher_high_break", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Current high broke previous high." : "No higher-high break.", inputs: { highBreaksPreviousHigh: windowFeatures.highBreaksPreviousHigh } }); },
  },
  {
    id: "lower_low_break", category: "two_candle", description: "Current low falls below previous low.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const windowFeatures = calculateWindowFeatures(candles, index, options); const active = windowFeatures.lowBreaksPreviousLow; return buildActivation({ neuronId: "lower_low_break", category: "two_candle", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Current low broke previous low." : "No lower-low break.", inputs: { lowBreaksPreviousLow: windowFeatures.lowBreaksPreviousLow } }); },
  },
  {
    id: "asia_session", category: "context_session", description: "Candle timestamp falls in Asia session window.", pineCompatible: true,
    compute: (candles, index) => { const current = candles[index]; const sessionTag = getSessionTag(current?.timestamp); const active = sessionTag === "asia"; return buildActivation({ neuronId: "asia_session", category: "context_session", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "UTC hour is in Asia session range." : "Not in Asia session.", inputs: { sessionTag } }); },
  },
  {
    id: "london_session", category: "context_session", description: "Candle timestamp falls in London session window.", pineCompatible: true,
    compute: (candles, index) => { const current = candles[index]; const sessionTag = getSessionTag(current?.timestamp); const active = sessionTag === "london"; return buildActivation({ neuronId: "london_session", category: "context_session", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "UTC hour is in London session range." : "Not in London session.", inputs: { sessionTag } }); },
  },
  {
    id: "newyork_session", category: "context_session", description: "Candle timestamp falls in New York session window.", pineCompatible: true,
    compute: (candles, index) => { const current = candles[index]; const sessionTag = getSessionTag(current?.timestamp); const active = sessionTag === "newyork"; return buildActivation({ neuronId: "newyork_session", category: "context_session", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "UTC hour is in New York session range." : "Not in New York session.", inputs: { sessionTag } }); },
  },
  {
    id: "overlap_session", category: "context_session", description: "Candle timestamp falls in London/New York overlap.", pineCompatible: true,
    compute: (candles, index) => { const current = candles[index]; const sessionTag = getSessionTag(current?.timestamp); const active = sessionTag === "overlap"; return buildActivation({ neuronId: "overlap_session", category: "context_session", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "UTC hour is in session overlap range." : "Not in overlap session.", inputs: { sessionTag } }); },
  },
  {
    id: "local_push_up", category: "local_structure", description: "Recent closes show upward push.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const lookback = options.localPushLookback ?? DEFAULT_NEURON_OPTIONS.localPushLookback; const window = getCandleWindow(candles, index, lookback, 0); let higherCloses = 0; for (let i = 1; i < window.length; i++) { if (safeNumber(window[i].close) >= safeNumber(window[i - 1].close)) higherCloses += 1; } const active = window.length > 1 && higherCloses >= Math.ceil((window.length - 1) * 0.67); return buildActivation({ neuronId: "local_push_up", category: "local_structure", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Most recent closes are stepping upward." : "No sustained upward local push.", inputs: { lookback, higherCloses, comparisons: Math.max(0, window.length - 1) } }); },
  },
  {
    id: "local_push_down", category: "local_structure", description: "Recent closes show downward push.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const lookback = options.localPushLookback ?? DEFAULT_NEURON_OPTIONS.localPushLookback; const window = getCandleWindow(candles, index, lookback, 0); let lowerCloses = 0; for (let i = 1; i < window.length; i++) { if (safeNumber(window[i].close) <= safeNumber(window[i - 1].close)) lowerCloses += 1; } const active = window.length > 1 && lowerCloses >= Math.ceil((window.length - 1) * 0.67); return buildActivation({ neuronId: "local_push_down", category: "local_structure", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Most recent closes are stepping downward." : "No sustained downward local push.", inputs: { lookback, lowerCloses, comparisons: Math.max(0, window.length - 1) } }); },
  },
  {
    id: "possible_rejection_up", category: "local_structure", description: "Long upper wick with modest body suggests upside rejection.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const wickThreshold = options.rejectionWickPercentMin ?? DEFAULT_NEURON_OPTIONS.rejectionWickPercentMin; const bodyThreshold = options.rejectionBodyPercentMax ?? DEFAULT_NEURON_OPTIONS.rejectionBodyPercentMax; const active = features.upperWickPercentOfRange >= wickThreshold && features.bodyPercentOfRange <= bodyThreshold; return buildActivation({ neuronId: "possible_rejection_up", category: "local_structure", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Upper wick dominates while body remains contained." : "No clear upside rejection shape.", inputs: { upperWickPercentOfRange: features.upperWickPercentOfRange, bodyPercentOfRange: features.bodyPercentOfRange, wickThreshold, bodyThreshold } }); },
  },
  {
    id: "possible_rejection_down", category: "local_structure", description: "Long lower wick with modest body suggests downside rejection.", pineCompatible: true,
    compute: (candles, index, options) => { const { current, features } = computeSingleCandleContext(candles, index, options); const wickThreshold = options.rejectionWickPercentMin ?? DEFAULT_NEURON_OPTIONS.rejectionWickPercentMin; const bodyThreshold = options.rejectionBodyPercentMax ?? DEFAULT_NEURON_OPTIONS.rejectionBodyPercentMax; const active = features.lowerWickPercentOfRange >= wickThreshold && features.bodyPercentOfRange <= bodyThreshold; return buildActivation({ neuronId: "possible_rejection_down", category: "local_structure", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Lower wick dominates while body remains contained." : "No clear downside rejection shape.", inputs: { lowerWickPercentOfRange: features.lowerWickPercentOfRange, bodyPercentOfRange: features.bodyPercentOfRange, wickThreshold, bodyThreshold } }); },
  },

  {
    id: "price_above_ema", category: "binary_ema", description: "Close is above fast EMA for short-horizon CALL bias.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const ema = getSeriesValue(getEmaSeries(candles, options, period), index); const close = safeNumber(current?.close); const active = ema !== null && close > ema; return buildActivation({ neuronId: "price_above_ema", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Close is above fast EMA." : "Close is not above fast EMA.", inputs: { close, ema, period } }); },
  },
  {
    id: "price_below_ema", category: "binary_ema", description: "Close is below fast EMA for short-horizon PUT bias.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const ema = getSeriesValue(getEmaSeries(candles, options, period), index); const close = safeNumber(current?.close); const active = ema !== null && close < ema; return buildActivation({ neuronId: "price_below_ema", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Close is below fast EMA." : "Close is not below fast EMA.", inputs: { close, ema, period } }); },
  },
  {
    id: "ema_fast_above_slow", category: "binary_ema", description: "Fast EMA sits above slow EMA.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const fastPeriod = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const slowPeriod = options.emaSlowPeriod ?? DEFAULT_NEURON_OPTIONS.emaSlowPeriod; const fast = getSeriesValue(getEmaSeries(candles, options, fastPeriod), index); const slow = getSeriesValue(getEmaSeries(candles, options, slowPeriod), index); const active = fast !== null && slow !== null && fast > slow; return buildActivation({ neuronId: "ema_fast_above_slow", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Fast EMA is above slow EMA." : "Fast EMA is not above slow EMA.", inputs: { fast, slow, fastPeriod, slowPeriod } }); },
  },
  {
    id: "ema_fast_below_slow", category: "binary_ema", description: "Fast EMA sits below slow EMA.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const fastPeriod = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const slowPeriod = options.emaSlowPeriod ?? DEFAULT_NEURON_OPTIONS.emaSlowPeriod; const fast = getSeriesValue(getEmaSeries(candles, options, fastPeriod), index); const slow = getSeriesValue(getEmaSeries(candles, options, slowPeriod), index); const active = fast !== null && slow !== null && fast < slow; return buildActivation({ neuronId: "ema_fast_below_slow", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 1 : 0, pineCompatible: true, explanation: active ? "Fast EMA is below slow EMA." : "Fast EMA is not below slow EMA.", inputs: { fast, slow, fastPeriod, slowPeriod } }); },
  },
  {
    id: "ema_slope_up", category: "binary_ema", description: "Fast EMA slope is upward over short lookback.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const lookback = options.emaSlopeLookback ?? DEFAULT_NEURON_OPTIONS.emaSlopeLookback; const series = getEmaSeries(candles, options, period); const now = getSeriesValue(series, index); const then = getSeriesValue(series, index - lookback); const active = now !== null && then !== null && now > then; return buildActivation({ neuronId: "ema_slope_up", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Fast EMA slope points up." : "Fast EMA slope is not up.", inputs: { now, then, lookback, period } }); },
  },
  {
    id: "ema_slope_down", category: "binary_ema", description: "Fast EMA slope is downward over short lookback.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const lookback = options.emaSlopeLookback ?? DEFAULT_NEURON_OPTIONS.emaSlopeLookback; const series = getEmaSeries(candles, options, period); const now = getSeriesValue(series, index); const then = getSeriesValue(series, index - lookback); const active = now !== null && then !== null && now < then; return buildActivation({ neuronId: "ema_slope_down", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Fast EMA slope points down." : "Fast EMA slope is not down.", inputs: { now, then, lookback, period } }); },
  },
  {
    id: "ema_pullback_above", category: "binary_ema", description: "Price pulled back to EMA while staying in bullish side.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const previous = getPreviousCandle(candles, index); const period = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const pullbackPercent = options.pullbackPercent ?? DEFAULT_NEURON_OPTIONS.pullbackPercent; const ema = getSeriesValue(getEmaSeries(candles, options, period), index); const close = safeNumber(current?.close); const low = safeNumber(current?.low); const prevClose = safeNumber(previous?.close); const active = ema !== null && close > ema && low <= ema && prevClose > ema * (1 + pullbackPercent); return buildActivation({ neuronId: "ema_pullback_above", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 0.85 : 0, pineCompatible: true, explanation: active ? "Bullish pullback into EMA was absorbed." : "No bullish EMA pullback structure.", inputs: { close, low, prevClose, ema, period, pullbackPercent } }); },
  },
  {
    id: "ema_pullback_below", category: "binary_ema", description: "Price pulled back to EMA while staying in bearish side.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const previous = getPreviousCandle(candles, index); const period = options.emaFastPeriod ?? DEFAULT_NEURON_OPTIONS.emaFastPeriod; const pullbackPercent = options.pullbackPercent ?? DEFAULT_NEURON_OPTIONS.pullbackPercent; const ema = getSeriesValue(getEmaSeries(candles, options, period), index); const close = safeNumber(current?.close); const high = safeNumber(current?.high); const prevClose = safeNumber(previous?.close); const active = ema !== null && close < ema && high >= ema && prevClose < ema * (1 - pullbackPercent); return buildActivation({ neuronId: "ema_pullback_below", category: "binary_ema", timestamp: current?.timestamp, index, active, score: active ? 0.85 : 0, pineCompatible: true, explanation: active ? "Bearish pullback into EMA was rejected." : "No bearish EMA pullback structure.", inputs: { close, high, prevClose, ema, period, pullbackPercent } }); },
  },
  {
    id: "rsi_overbought", category: "binary_rsi", description: "RSI is in overbought zone.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const rsi = getSeriesValue(getRsiSeries(candles, options, period), index); const active = rsi !== null && rsi >= 70; return buildActivation({ neuronId: "rsi_overbought", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.75 : 0, pineCompatible: true, explanation: active ? "RSI is overbought (>=70)." : "RSI is not overbought.", inputs: { rsi, period } }); },
  },
  {
    id: "rsi_oversold", category: "binary_rsi", description: "RSI is in oversold zone.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const rsi = getSeriesValue(getRsiSeries(candles, options, period), index); const active = rsi !== null && rsi <= 30; return buildActivation({ neuronId: "rsi_oversold", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.75 : 0, pineCompatible: true, explanation: active ? "RSI is oversold (<=30)." : "RSI is not oversold.", inputs: { rsi, period } }); },
  },
  {
    id: "rsi_rebound_up", category: "binary_rsi", description: "RSI rebounds upward from oversold neighborhood.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const series = getRsiSeries(candles, options, period); const now = getSeriesValue(series, index); const prev = getSeriesValue(series, index - 1); const active = now !== null && prev !== null && prev <= 35 && now > prev; return buildActivation({ neuronId: "rsi_rebound_up", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.85 : 0, pineCompatible: true, explanation: active ? "RSI is rebounding up from weak zone." : "No RSI rebound-up structure.", inputs: { now, prev, period } }); },
  },
  {
    id: "rsi_rebound_down", category: "binary_rsi", description: "RSI rebounds downward from overbought neighborhood.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const series = getRsiSeries(candles, options, period); const now = getSeriesValue(series, index); const prev = getSeriesValue(series, index - 1); const active = now !== null && prev !== null && prev >= 65 && now < prev; return buildActivation({ neuronId: "rsi_rebound_down", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.85 : 0, pineCompatible: true, explanation: active ? "RSI is rebounding down from strong zone." : "No RSI rebound-down structure.", inputs: { now, prev, period } }); },
  },
  {
    id: "rsi_cross_50_up", category: "binary_rsi", description: "RSI crossed upward through 50.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const series = getRsiSeries(candles, options, period); const now = getSeriesValue(series, index); const prev = getSeriesValue(series, index - 1); const active = now !== null && prev !== null && prev <= 50 && now > 50; return buildActivation({ neuronId: "rsi_cross_50_up", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.9 : 0, pineCompatible: true, explanation: active ? "RSI crossed above 50." : "No RSI cross above 50.", inputs: { now, prev, period } }); },
  },
  {
    id: "rsi_cross_50_down", category: "binary_rsi", description: "RSI crossed downward through 50.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const series = getRsiSeries(candles, options, period); const now = getSeriesValue(series, index); const prev = getSeriesValue(series, index - 1); const active = now !== null && prev !== null && prev >= 50 && now < 50; return buildActivation({ neuronId: "rsi_cross_50_down", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.9 : 0, pineCompatible: true, explanation: active ? "RSI crossed below 50." : "No RSI cross below 50.", inputs: { now, prev, period } }); },
  },
  {
    id: "rsi_bullish_zone", category: "binary_rsi", description: "RSI is in bullish control zone (>55).", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const rsi = getSeriesValue(getRsiSeries(candles, options, period), index); const active = rsi !== null && rsi > 55; return buildActivation({ neuronId: "rsi_bullish_zone", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.7 : 0, pineCompatible: true, explanation: active ? "RSI is in bullish zone (>55)." : "RSI is not in bullish zone.", inputs: { rsi, period } }); },
  },
  {
    id: "rsi_bearish_zone", category: "binary_rsi", description: "RSI is in bearish control zone (<45).", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const period = options.rsiPeriod ?? DEFAULT_NEURON_OPTIONS.rsiPeriod; const rsi = getSeriesValue(getRsiSeries(candles, options, period), index); const active = rsi !== null && rsi < 45; return buildActivation({ neuronId: "rsi_bearish_zone", category: "binary_rsi", timestamp: current?.timestamp, index, active, score: active ? 0.7 : 0, pineCompatible: true, explanation: active ? "RSI is in bearish zone (<45)." : "RSI is not in bearish zone.", inputs: { rsi, period } }); },
  },
  {
    id: "short_bullish_pressure", category: "binary_momentum", description: "Recent closes show short-term bullish pressure.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const lookback = options.momentumLookback ?? DEFAULT_NEURON_OPTIONS.momentumLookback; let up = 0; let down = 0; for (let i = Math.max(1, index - lookback + 1); i <= index; i += 1) { const prev = safeNumber(candles[i - 1]?.close); const now = safeNumber(candles[i]?.close); if (now > prev) up += 1; if (now < prev) down += 1; } const active = up > down && up >= Math.ceil(lookback / 2); return buildActivation({ neuronId: "short_bullish_pressure", category: "binary_momentum", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Recent closes favor bullish pressure." : "No bullish pressure dominance.", inputs: { lookback, up, down } }); },
  },
  {
    id: "short_bearish_pressure", category: "binary_momentum", description: "Recent closes show short-term bearish pressure.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const lookback = options.momentumLookback ?? DEFAULT_NEURON_OPTIONS.momentumLookback; let up = 0; let down = 0; for (let i = Math.max(1, index - lookback + 1); i <= index; i += 1) { const prev = safeNumber(candles[i - 1]?.close); const now = safeNumber(candles[i]?.close); if (now > prev) up += 1; if (now < prev) down += 1; } const active = down > up && down >= Math.ceil(lookback / 2); return buildActivation({ neuronId: "short_bearish_pressure", category: "binary_momentum", timestamp: current?.timestamp, index, active, score: active ? 0.8 : 0, pineCompatible: true, explanation: active ? "Recent closes favor bearish pressure." : "No bearish pressure dominance.", inputs: { lookback, up, down } }); },
  },
  {
    id: "immediate_followthrough_up", category: "binary_momentum", description: "Current bullish close continues prior bullish close.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const previous = getPreviousCandle(candles, index); const active = Boolean(previous && safeNumber(current?.close) > safeNumber(previous?.close) && safeNumber(current?.close) > safeNumber(current?.open)); return buildActivation({ neuronId: "immediate_followthrough_up", category: "binary_momentum", timestamp: current?.timestamp, index, active, score: active ? 0.9 : 0, pineCompatible: true, explanation: active ? "Immediate bullish followthrough confirmed." : "No immediate bullish followthrough.", inputs: { currentClose: safeNumber(current?.close), previousClose: safeNumber(previous?.close), currentOpen: safeNumber(current?.open) } }); },
  },
  {
    id: "immediate_followthrough_down", category: "binary_momentum", description: "Current bearish close continues prior bearish close.", pineCompatible: true,
    compute: (candles, index, options) => { const current = candles[index]; const previous = getPreviousCandle(candles, index); const active = Boolean(previous && safeNumber(current?.close) < safeNumber(previous?.close) && safeNumber(current?.close) < safeNumber(current?.open)); return buildActivation({ neuronId: "immediate_followthrough_down", category: "binary_momentum", timestamp: current?.timestamp, index, active, score: active ? 0.9 : 0, pineCompatible: true, explanation: active ? "Immediate bearish followthrough confirmed." : "No immediate bearish followthrough.", inputs: { currentClose: safeNumber(current?.close), previousClose: safeNumber(previous?.close), currentOpen: safeNumber(current?.open) } }); },
  },
];

/**
 * Binary direction inference for fixed-expiry options.
 * Keeps weighting explicit so discovered patterns remain explainable and PineScript-translatable.
 */
export function inferBinaryDirection(neuronIds = [], context = {}) {
  const ids = new Set((Array.isArray(neuronIds) ? neuronIds : []).map((id) => String(id)));

  let callScore = 0;
  let putScore = 0;

  const callWeights = [
    ["price_above_ema", 1], ["ema_fast_above_slow", 1], ["ema_slope_up", 1], ["ema_pullback_above", 1],
    ["rsi_oversold", 0.5], ["rsi_rebound_up", 1], ["rsi_cross_50_up", 1], ["rsi_bullish_zone", 0.8],
    ["short_bullish_pressure", 1], ["immediate_followthrough_up", 1], ["bullish_candle", 0.5], ["session_overlap", 0.3],
  ];
  const putWeights = [
    ["price_below_ema", 1], ["ema_fast_below_slow", 1], ["ema_slope_down", 1], ["ema_pullback_below", 1],
    ["rsi_overbought", 0.5], ["rsi_rebound_down", 1], ["rsi_cross_50_down", 1], ["rsi_bearish_zone", 0.8],
    ["short_bearish_pressure", 1], ["immediate_followthrough_down", 1], ["bearish_candle", 0.5], ["session_overlap", 0.3],
  ];

  for (const [id, weight] of callWeights) if (ids.has(id)) callScore += weight;
  for (const [id, weight] of putWeights) if (ids.has(id)) putScore += weight;

  if (context?.localPush === "local_push_up") callScore += 0.5;
  if (context?.localPush === "local_push_down") putScore += 0.5;

  if (callScore > putScore + 0.25) return "CALL";
  if (putScore > callScore + 0.25) return "PUT";
  return "NEUTRAL";
}

/**
 * Evaluates binary option outcome at fixed expiry horizon.
 */
export function evaluateBinaryOutcome(candles, index, direction, expiryCandles, options = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  const expiry = Math.max(1, safeNumber(expiryCandles) || 1);
  const entryCandle = rows[index];
  const expiryIndex = index + expiry;
  const expiryCandle = rows[expiryIndex];
  const neutralAsLoss = options.binaryNeutralAsLoss ?? DEFAULT_NEURON_OPTIONS.binaryNeutralAsLoss;

  if (!entryCandle || !expiryCandle) {
    return {
      direction: direction || "NEUTRAL",
      expiryCandles: expiry,
      status: "insufficient_data",
      outcomeLabel: "neutral",
      win: false,
      entryPrice: safeNumber(entryCandle?.close),
      expiryPrice: null,
      index,
      expiryIndex,
    };
  }

  const entryPrice = safeNumber(entryCandle.close);
  const expiryPrice = safeNumber(expiryCandle.close);

  let win = false;
  let outcomeLabel = "neutral";

  if (direction === "CALL") win = expiryPrice > entryPrice;
  else if (direction === "PUT") win = expiryPrice < entryPrice;

  if (direction === "NEUTRAL") outcomeLabel = "neutral";
  else if (win) outcomeLabel = "win";
  else if (expiryPrice === entryPrice && !neutralAsLoss) outcomeLabel = "neutral";
  else outcomeLabel = "loss";

  return {
    direction,
    expiryCandles: expiry,
    status: "evaluated",
    outcomeLabel,
    win,
    entryPrice,
    expiryPrice,
    index,
    expiryIndex,
  };
}

export function calculateNeuronActivations(candles, options = {}) {
  const mergedOptions = { ...DEFAULT_NEURON_OPTIONS, ...(options || {}) };
  const rows = Array.isArray(candles) ? candles : [];
  console.log("[neuronEngine] started", { candles: rows.length, neurons: NEURON_DEFINITIONS.length });
  const activations = [];

  for (let index = 0; index < rows.length; index++) {
    for (const definition of NEURON_DEFINITIONS) {
      const activation = definition.compute(rows, index, mergedOptions);
      activations.push(activation);
    }
  }

  console.log("[neuronEngine] activations computed", { total: activations.length });
  return activations;
}

export function calculateNeuronMatrix(candles, options = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  const activations = calculateNeuronActivations(rows, options);
  const matrix = rows.map((candle, index) => ({
    index,
    timestamp: candle?.timestamp || null,
    neurons: {},
  }));

  for (const activation of activations) {
    const row = matrix[activation.index];
    if (!row) continue;
    row.neurons[activation.neuronId] = {
      active: activation.active,
      score: activation.score,
      explanation: activation.explanation,
      inputs: activation.inputs,
      pineCompatible: activation.pineCompatible,
      category: activation.category,
    };
  }

  return matrix;
}

export function summarizeNeuronActivations(activations) {
  const rows = Array.isArray(activations) ? activations : [];
  const activeCountsByNeuron = {};
  const scoreTotalsByNeuron = {};
  const evaluationCountsByNeuron = {};
  const pineCompatibleCounts = { active: 0, inactive: 0 };
  const candleIndexes = new Set();

  rows.forEach((activation) => {
    if (typeof activation?.index === "number") candleIndexes.add(activation.index);
    const id = activation?.neuronId || "unknown";
    evaluationCountsByNeuron[id] = (evaluationCountsByNeuron[id] || 0) + 1;
    scoreTotalsByNeuron[id] = (scoreTotalsByNeuron[id] || 0) + safeNumber(activation?.score);

    if (activation?.active) {
      activeCountsByNeuron[id] = (activeCountsByNeuron[id] || 0) + 1;
      if (activation?.pineCompatible) pineCompatibleCounts.active += 1;
    } else if (activation?.pineCompatible) {
      pineCompatibleCounts.inactive += 1;
    }
  });

  const averageScoreByNeuron = Object.keys(scoreTotalsByNeuron).reduce((acc, key) => {
    acc[key] = scoreTotalsByNeuron[key] / Math.max(1, evaluationCountsByNeuron[key] || 1);
    return acc;
  }, {});

  const totalActivations = Object.values(activeCountsByNeuron).reduce((sum, count) => sum + count, 0);

  console.log("[neuronEngine] summary built", {
    candlesProcessed: candleIndexes.size,
    neuronTypesEvaluated: Object.keys(evaluationCountsByNeuron).length,
    totalActivations,
  });

  return {
    candlesProcessed: candleIndexes.size,
    neuronTypesEvaluated: Object.keys(evaluationCountsByNeuron).length,
    totalActivations,
    activeCountsByNeuron,
    averageScoreByNeuron,
    pineCompatibleCounts,
  };
}

export function getTopNeuronTypes(summary, limit = 10) {
  const entries = Object.entries(summary?.activeCountsByNeuron || {});
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit))
    .map(([neuronId, count]) => ({ neuronId, count }));
}
