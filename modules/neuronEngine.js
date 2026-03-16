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
];

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
