const DEFAULT_OPTIONS = {
  referencePriceMode: "hlc3",
  epsilon: 0.000001,
  enableHeuristicClassification: true,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toTimestampValue(timestamp) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === "string" && timestamp.trim()) {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function safeNumber(value, fallback = 0) {
  return isFiniteNumber(value) ? value : fallback;
}

function candleHasValidOHLC(candle) {
  if (!candle || typeof candle !== "object") return false;
  const { open, high, low, close } = candle;
  if (![open, high, low, close].every(isFiniteNumber)) return false;
  if (high < Math.max(open, close, low)) return false;
  if (low > Math.min(open, close, high)) return false;
  return true;
}

export function validateInternal5m(minuteCandles) {
  const issues = [];
  const isArray = Array.isArray(minuteCandles);
  const length = isArray ? minuteCandles.length : 0;

  const invalidLength = !isArray || length !== 5;
  const missingMinutes = !isArray || length < 5;

  let malformedCandles = false;
  let nonMonotonicTimestamps = false;

  if (!isArray) {
    issues.push("minuteCandles must be an array");
  }

  if (invalidLength) {
    issues.push(`expected exactly 5 candles, received ${length}`);
  }

  if (isArray) {
    let previousTs = null;

    minuteCandles.forEach((candle, index) => {
      const label = `candle[${index}]`;
      if (!candleHasValidOHLC(candle)) {
        malformedCandles = true;
        issues.push(`${label} has invalid OHLC structure`);
      }

      if (candle?.volume !== undefined && (!isFiniteNumber(candle.volume) || candle.volume < 0)) {
        malformedCandles = true;
        issues.push(`${label} has invalid volume`);
      }

      if (candle?.timestamp !== undefined) {
        const ts = toTimestampValue(candle.timestamp);
        if (ts === null) {
          malformedCandles = true;
          issues.push(`${label} has invalid timestamp`);
        } else if (previousTs !== null && ts <= previousTs) {
          nonMonotonicTimestamps = true;
          issues.push(`${label} timestamp is not strictly ascending`);
        }
        if (ts !== null) previousTs = ts;
      }
    });
  }

  const ok = !invalidLength && !nonMonotonicTimestamps && !malformedCandles;

  return {
    ok,
    issues,
    missing_minutes: missingMinutes,
    invalid_length: invalidLength,
    non_monotonic_timestamps: nonMonotonicTimestamps,
    malformed_candles: malformedCandles,
  };
}

export function aggregateTo5m(minuteCandles, options = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const epsilon = mergedOptions.epsilon;

  if (!Array.isArray(minuteCandles) || minuteCandles.length === 0) {
    return {
      timestamp: null,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume_total: 0,
      range: 0,
      body: 0,
      direction: "neutral",
      body_pct_of_range: 0,
      upper_wick: 0,
      lower_wick: 0,
    };
  }

  const validForExtremes = minuteCandles.filter(candleHasValidOHLC);
  const first = minuteCandles[0] || {};
  const last = minuteCandles[minuteCandles.length - 1] || {};

  const open = safeNumber(first.open, safeNumber(validForExtremes[0]?.open, 0));
  const close = safeNumber(last.close, safeNumber(validForExtremes[validForExtremes.length - 1]?.close, open));

  const high = validForExtremes.length
    ? Math.max(...validForExtremes.map((c) => c.high))
    : Math.max(open, close);
  const low = validForExtremes.length
    ? Math.min(...validForExtremes.map((c) => c.low))
    : Math.min(open, close);

  const volumeTotal = minuteCandles.reduce((sum, candle) => sum + safeNumber(candle?.volume, 0), 0);

  const range = Math.max(0, high - low);
  const body = Math.abs(close - open);
  const bodyPctOfRange = range <= epsilon ? 0 : body / range;

  const direction = close > open ? "bullish" : close < open ? "bearish" : "neutral";
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);

  return {
    timestamp: first.timestamp ?? null,
    open,
    high,
    low,
    close,
    volume_total: volumeTotal,
    range,
    body,
    direction,
    body_pct_of_range: bodyPctOfRange,
    upper_wick: upperWick,
    lower_wick: lowerWick,
  };
}

export function classifyPriceLocation(referencePrice, candle5m, options = {}) {
  const { epsilon } = { ...DEFAULT_OPTIONS, ...options };

  if (!isFiniteNumber(referencePrice) || !candle5m) return "unknown";

  const { high, low, open, close, range } = candle5m;
  if (![high, low, open, close, range].every(isFiniteNumber)) return "unknown";

  if (range <= epsilon) return "unknown";

  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  const bodyMid = (bodyTop + bodyBottom) / 2;

  if (referencePrice < low - epsilon || referencePrice > high + epsilon) return "unknown";

  if (referencePrice < bodyBottom) return "lower_wick";
  if (referencePrice > bodyTop) return "upper_wick";

  const bodySize = Math.max(bodyTop - bodyBottom, epsilon);
  const distanceToMid = Math.abs(referencePrice - bodyMid);

  // Si cae cerca del centro del cuerpo lo marcamos como body_center.
  if (distanceToMid <= bodySize * 0.2) return "body_center";

  return referencePrice < bodyMid ? "lower_body" : "upper_body";
}

function findInternalVolumeAnchor(minuteCandles, candle5m, options) {
  let maxIndex = 0;
  let maxVolume = -Infinity;

  minuteCandles.forEach((candle, index) => {
    const volume = safeNumber(candle?.volume, 0);
    if (volume > maxVolume) {
      maxVolume = volume;
      maxIndex = index;
    }
  });

  const selected = minuteCandles[maxIndex] || {};
  const referencePrice =
    options.referencePriceMode === "close"
      ? safeNumber(selected.close, safeNumber(candle5m.close, 0))
      : (safeNumber(selected.high, 0) + safeNumber(selected.low, 0) + safeNumber(selected.close, 0)) / 3;

  return {
    minute_index: maxIndex + 1,
    timestamp: selected.timestamp ?? null,
    minute_volume: safeNumber(selected.volume, 0),
    reference_price: referencePrice,
    location: classifyPriceLocation(referencePrice, candle5m, options),
  };
}

function buildTimeAggression(minuteCandles, candle5m) {
  const highIndices = [];
  const lowIndices = [];

  minuteCandles.forEach((candle, idx) => {
    if (safeNumber(candle?.high, -Infinity) === candle5m.high) highIndices.push(idx + 1);
    if (safeNumber(candle?.low, Infinity) === candle5m.low) lowIndices.push(idx + 1);
  });

  const minuteOfHigh = highIndices.length ? highIndices[0] : null;
  const minuteOfLow = lowIndices.length ? lowIndices[0] : null;

  const sameExtremeMinute =
    minuteOfHigh !== null && minuteOfLow !== null && minuteOfHigh === minuteOfLow;

  const highFirst =
    !sameExtremeMinute && minuteOfHigh !== null && minuteOfLow !== null ? minuteOfHigh < minuteOfLow : false;
  const lowFirst =
    !sameExtremeMinute && minuteOfHigh !== null && minuteOfLow !== null ? minuteOfLow < minuteOfHigh : false;

  const retestedHigh = highIndices.length > 1;
  const retestedLow = lowIndices.length > 1;

  let aggressionBias = "neutral";

  // Reglas explícitas: extremos temprano/tardío para inferir presión temporal.
  if (minuteOfHigh !== null && minuteOfLow !== null) {
    if (minuteOfHigh <= 2 && minuteOfLow >= 4) aggressionBias = "seller_dominance";
    else if (minuteOfLow <= 2 && minuteOfHigh >= 4) aggressionBias = "buyer_dominance";
    else if (Math.abs(minuteOfHigh - minuteOfLow) <= 1 || retestedHigh || retestedLow) {
      aggressionBias = "volatile_conflict";
    } else {
      aggressionBias = "balanced";
    }
  }

  let sequenceLabel = "compressed_neutral";
  if (aggressionBias === "seller_dominance") sequenceLabel = "early_push_then_selloff";
  else if (aggressionBias === "buyer_dominance") sequenceLabel = "early_drop_then_recovery";
  else if (aggressionBias === "volatile_conflict") sequenceLabel = "two_way_auction";
  else if (minuteOfHigh !== null && minuteOfHigh >= 4) sequenceLabel = "late_breakout_up";
  else if (minuteOfLow !== null && minuteOfLow >= 4) sequenceLabel = "late_breakout_down";

  return {
    minute_of_high: minuteOfHigh,
    minute_of_low: minuteOfLow,
    high_first: highFirst,
    low_first: lowFirst,
    same_extreme_minute: sameExtremeMinute,
    speed_to_high_minutes: minuteOfHigh,
    speed_to_low_minutes: minuteOfLow,
    retested_high: retestedHigh,
    retested_low: retestedLow,
    aggression_bias: aggressionBias,
    sequence_label: sequenceLabel,
    duplicate_extremes: retestedHigh || retestedLow,
  };
}

function buildEffortResult(candle5m, options = {}) {
  const { epsilon } = { ...DEFAULT_OPTIONS, ...options };
  const bodySize = candle5m.body;
  const rangeSize = candle5m.range;
  const volumeTotal = candle5m.volume_total;

  const bodySafe = Math.max(bodySize, epsilon);
  const rangeSafe = Math.max(rangeSize, epsilon);

  const bodyToRangeRatio = bodySize / rangeSafe;
  const volumePerPointBody = volumeTotal / bodySafe;
  const volumePerPointRange = volumeTotal / rangeSafe;

  // Absorción: volumen alto + cuerpo pequeño relativo al rango.
  const normalizedParticipation = volumePerPointRange / (1 + volumePerPointRange);
  const absorptionScore = normalizedParticipation * (1 - bodyToRangeRatio);

  // Eficiencia: cuerpo/rango alto y sin exceso de volumen por punto de cuerpo.
  const displacementEfficiencyScore = bodyToRangeRatio / (1 + volumePerPointBody / 10000);

  let label = "balanced";
  if (volumeTotal < epsilon * 1000) label = "low_participation";
  else if (absorptionScore >= 0.65) label = "high_absorption";
  else if (absorptionScore >= 0.4) label = "moderate_absorption";
  else if (displacementEfficiencyScore >= 0.5 && bodyToRangeRatio >= 0.55) label = "efficient_displacement";

  return {
    volume_total: volumeTotal,
    body_size: bodySize,
    range_size: rangeSize,
    body_to_range_ratio: bodyToRangeRatio,
    volume_per_point_body: volumePerPointBody,
    volume_per_point_range: volumePerPointRange,
    absorption_score: absorptionScore,
    displacement_efficiency_score: displacementEfficiencyScore,
    label,
  };
}

export function classifyMicrostructureSignature(result, options = {}) {
  const { enableHeuristicClassification } = { ...DEFAULT_OPTIONS, ...options };

  const ohlc = result?.ohlc_5m || {};
  const anchor = result?.microstructure?.internal_volume_anchor || {};
  const aggression = result?.microstructure?.time_aggression || {};
  const effort = result?.microstructure?.effort_result || {};

  const upperRejection = ohlc.upper_wick > ohlc.body * 0.8 && ohlc.close < ohlc.high;
  const lowerRejection = ohlc.lower_wick > ohlc.body * 0.8 && ohlc.close > ohlc.low;

  const sellerDominance = aggression.aggression_bias === "seller_dominance";
  const buyerDominance = aggression.aggression_bias === "buyer_dominance";
  const absorption = ["high_absorption", "moderate_absorption"].includes(effort.label);
  const efficientDisplacement = effort.label === "efficient_displacement";

  let classification = "indecision";

  if (enableHeuristicClassification) {
    const anchorUpper = ["upper_wick", "upper_body"].includes(anchor.location);
    const anchorLower = ["lower_wick", "lower_body"].includes(anchor.location);

    if (anchorUpper && sellerDominance && (absorption || upperRejection)) {
      classification = "failed_breakout_short_candidate";
    } else if (anchorLower && buyerDominance && (absorption || lowerRejection)) {
      classification = "failed_breakout_long_candidate";
    } else if (buyerDominance && efficientDisplacement && ohlc.direction === "bullish" && ohlc.body_pct_of_range >= 0.5) {
      classification = "trend_continuation_up";
    } else if (sellerDominance && efficientDisplacement && ohlc.direction === "bearish" && ohlc.body_pct_of_range >= 0.5) {
      classification = "trend_continuation_down";
    } else if (aggression.aggression_bias === "balanced" || aggression.aggression_bias === "volatile_conflict") {
      classification = "neutral_rotation";
    }
  }

  return {
    upper_rejection: upperRejection,
    lower_rejection: lowerRejection,
    seller_dominance: sellerDominance,
    buyer_dominance: buyerDominance,
    absorption,
    efficient_displacement: efficientDisplacement,
    classification,
  };
}

export function buildMicrostructure5m(minuteCandles, options = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const validation = validateInternal5m(minuteCandles);
  const safeCandles = Array.isArray(minuteCandles) ? minuteCandles.filter(Boolean) : [];

  const ohlc5m = aggregateTo5m(safeCandles, mergedOptions);
  const internalVolumeAnchor = findInternalVolumeAnchor(safeCandles, ohlc5m, mergedOptions);
  const timeAggression = buildTimeAggression(safeCandles, ohlc5m);
  const effortResult = buildEffortResult(ohlc5m, mergedOptions);

  const result = {
    timestamp: ohlc5m.timestamp,
    timeframe: "5m",
    ohlc_5m: {
      open: ohlc5m.open,
      high: ohlc5m.high,
      low: ohlc5m.low,
      close: ohlc5m.close,
      volume_total: ohlc5m.volume_total,
      range: ohlc5m.range,
      body: ohlc5m.body,
      direction: ohlc5m.direction,
      body_pct_of_range: ohlc5m.body_pct_of_range,
    },
    microstructure: {
      internal_volume_anchor: internalVolumeAnchor,
      time_aggression: {
        minute_of_high: timeAggression.minute_of_high,
        minute_of_low: timeAggression.minute_of_low,
        high_first: timeAggression.high_first,
        low_first: timeAggression.low_first,
        same_extreme_minute: timeAggression.same_extreme_minute,
        speed_to_high_minutes: timeAggression.speed_to_high_minutes,
        speed_to_low_minutes: timeAggression.speed_to_low_minutes,
        retested_high: timeAggression.retested_high,
        retested_low: timeAggression.retested_low,
        aggression_bias: timeAggression.aggression_bias,
        sequence_label: timeAggression.sequence_label,
      },
      effort_result: effortResult,
      signature: {},
    },
    quality_flags: {
      integrity_ok: validation.ok,
      issues: validation.issues,
      missing_minutes: validation.missing_minutes,
      invalid_length: validation.invalid_length,
      non_monotonic_timestamps: validation.non_monotonic_timestamps,
      malformed_candles: validation.malformed_candles,
      duplicate_extremes: timeAggression.duplicate_extremes,
    },
  };

  result.microstructure.signature = classifyMicrostructureSignature(result, mergedOptions);

  return result;
}

export default {
  buildMicrostructure5m,
  validateInternal5m,
  aggregateTo5m,
  classifyPriceLocation,
  classifyMicrostructureSignature,
};
