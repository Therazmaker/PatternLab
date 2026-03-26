function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDirection(value = "long") {
  return String(value || "long").toLowerCase() === "short" ? "short" : "long";
}

function avg(values = []) {
  const rows = values.filter((value) => Number.isFinite(value));
  if (!rows.length) return null;
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

function computeEma(values = [], period = 20) {
  const rows = values.filter((value) => Number.isFinite(value));
  if (!rows.length) return null;
  const k = 2 / (period + 1);
  let ema = rows[0];
  for (let i = 1; i < rows.length; i += 1) ema = (rows[i] * k) + (ema * (1 - k));
  return ema;
}

function computeBodyQuality(candle = {}) {
  const open = toNumber(candle.open, NaN);
  const close = toNumber(candle.close, NaN);
  const high = toNumber(candle.high, NaN);
  const low = toNumber(candle.low, NaN);
  if (![open, close, high, low].every(Number.isFinite)) return null;
  const range = Math.max(1e-8, high - low);
  const body = Math.abs(close - open);
  return Number((body / range).toFixed(4));
}

function computeWickPressure(candle = {}) {
  const open = toNumber(candle.open, NaN);
  const close = toNumber(candle.close, NaN);
  const high = toNumber(candle.high, NaN);
  const low = toNumber(candle.low, NaN);
  if (![open, close, high, low].every(Number.isFinite)) return null;
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);
  const range = Math.max(1e-8, high - low);
  return Number(((upperWick - lowerWick) / range).toFixed(4));
}

function computeDistanceFromExtremes(candle = {}, lookback = []) {
  const high = toNumber(candle.high, NaN);
  const low = toNumber(candle.low, NaN);
  const close = toNumber(candle.close, NaN);
  if (![high, low, close].every(Number.isFinite)) return { nearLocalHigh: false, nearLocalLow: false };
  const highs = lookback.map((row) => toNumber(row.high, NaN)).filter(Number.isFinite);
  const lows = lookback.map((row) => toNumber(row.low, NaN)).filter(Number.isFinite);
  const localHigh = highs.length ? Math.max(...highs) : high;
  const localLow = lows.length ? Math.min(...lows) : low;
  const range = Math.max(1e-8, localHigh - localLow);
  return {
    nearLocalHigh: ((localHigh - close) / range) <= 0.18,
    nearLocalLow: ((close - localLow) / range) <= 0.18,
  };
}

function inferPatternName(trade = {}) {
  const matched = Array.isArray(trade?.decisionSnapshot?.matchedLibraryItems) ? trade.decisionSnapshot.matchedLibraryItems : [];
  return String(trade.patternName || trade.setup || matched[0] || "unknown_pattern");
}

function buildContextTags(metrics = {}, trade = {}) {
  const tags = [];
  if (metrics.nearLocalHigh) tags.push("near_local_high");
  if (metrics.nearLocalLow) tags.push("near_local_low");
  if (Number.isFinite(metrics.distanceFromEMA) && Math.abs(metrics.distanceFromEMA) > 0.012) tags.push("extended_from_ema");
  if (Number.isFinite(metrics.volumeRatio) && metrics.volumeRatio < 0.9) tags.push("low_volume");
  if (Number.isFinite(metrics.bodyQuality) && metrics.bodyQuality < 0.33) tags.push("shrinking_bodies");
  if (Number.isFinite(metrics.wickPressure) && metrics.wickPressure > 0.25) tags.push("upper_wick_pressure");
  if (Number.isFinite(metrics.wickPressure) && metrics.wickPressure < -0.25) tags.push("lower_wick_pressure");
  if (trade.closeReason === "no_followthrough") tags.push("early_no_followthrough");
  return tags;
}

export function computeReasonCodes(metrics = {}, trade = {}) {
  const direction = toDirection(metrics.predictionDirection || trade.direction);
  const isLoss = metrics.actualOutcome === "loss";
  const isWin = metrics.actualOutcome === "win";
  const failureReasonCodes = [];
  const successReasonCodes = [];

  const barsHeld = toNumber(trade.candlesInTrade, 0) || 0;
  if (isLoss && barsHeld <= 1) failureReasonCodes.push("late_entry");
  if (isLoss && (trade.closeReason === "no_followthrough" || toNumber(metrics.followthroughScore, 0) < 0.75)) failureReasonCodes.push("no_followthrough");

  if (isLoss && direction === "long" && metrics.nearLocalHigh) failureReasonCodes.push("entered_into_resistance");
  if (isLoss && direction === "short" && metrics.nearLocalLow) failureReasonCodes.push("entered_into_support");

  if (isLoss && direction === "long" && Number.isFinite(metrics.wickPressure) && metrics.wickPressure > 0.25) failureReasonCodes.push("bullish_exhaustion");
  if (isLoss && direction === "short" && Number.isFinite(metrics.wickPressure) && metrics.wickPressure < -0.25) failureReasonCodes.push("bearish_exhaustion");

  if (isLoss && Number.isFinite(metrics.volumeRatio) && metrics.volumeRatio < 0.92) failureReasonCodes.push("weak_volume_confirmation");
  if (isLoss && trade.closeReason === "stop_loss" && toNumber(metrics.mfe, 0) > 0.2) failureReasonCodes.push("breakout_failed");
  if (isLoss && Number.isFinite(metrics.bodyQuality) && metrics.bodyQuality < 0.3) failureReasonCodes.push("reversal_without_confirmation");
  if (isLoss && Number.isFinite(metrics.bodyQuality) && metrics.bodyQuality < 0.22) failureReasonCodes.push("shrinking_bodies");
  if (isLoss && Number.isFinite(metrics.wickPressure) && metrics.wickPressure < -0.35 && direction === "long") failureReasonCodes.push("lower_wick_absorption");
  if (isLoss && Number.isFinite(metrics.wickPressure) && metrics.wickPressure > 0.35 && direction === "short") failureReasonCodes.push("upper_wick_rejection");
  if (isLoss && Number.isFinite(metrics.distanceFromBase) && Math.abs(metrics.distanceFromBase) < 0.002 && Number.isFinite(metrics.followthroughScore) && metrics.followthroughScore < 0.95) failureReasonCodes.push("midrange_noise");

  if (isWin && Number.isFinite(metrics.followthroughScore) && metrics.followthroughScore >= 1.2) successReasonCodes.push("confirmation_followthrough");
  if (isWin && ((direction === "long" && metrics.nearLocalLow) || (direction === "short" && metrics.nearLocalHigh))) successReasonCodes.push("rejection_at_extreme");
  if (isWin && Number.isFinite(metrics.volumeRatio) && metrics.volumeRatio >= 1) successReasonCodes.push("volume_confirmation");

  return {
    failureReasonCodes: [...new Set(failureReasonCodes)],
    successReasonCodes: [...new Set(successReasonCodes)],
  };
}

export function buildTradeDiagnostics(trade = {}, candles = [], resolvedCandle = null) {
  const rows = Array.isArray(candles) ? candles : [];
  const entryIndex = Number.isFinite(trade?.createdCandleIndex) ? trade.createdCandleIndex : Math.max(0, rows.length - 1);
  const entryCandle = rows[Math.max(0, Math.min(entryIndex, rows.length - 1))] || {};
  const closeCandle = resolvedCandle || rows[rows.length - 1] || entryCandle;
  const direction = toDirection(trade.direction);

  const closes = rows.slice(Math.max(0, entryIndex - 30), entryIndex + 1).map((row) => toNumber(row.close, NaN)).filter(Number.isFinite);
  const ema = computeEma(closes, 20);
  const base = avg(closes.slice(-12));
  const entryPrice = toNumber(trade.entry, toNumber(entryCandle.close, null));
  const entryVolume = toNumber(entryCandle.volume, null);
  const avgVolume = avg(rows.slice(Math.max(0, entryIndex - 20), entryIndex).map((row) => toNumber(row.volume, NaN)).filter(Number.isFinite));

  const lookbackSlice = rows.slice(Math.max(0, entryIndex - 8), entryIndex + 1);
  const localFlags = computeDistanceFromExtremes(entryCandle, lookbackSlice);

  const mfe = toNumber(trade.mfe, 0);
  const mae = toNumber(trade.mae, 0);
  const followthroughScore = Number.isFinite(mfe) ? Number((mfe / Math.max(mae, 0.0001)).toFixed(4)) : null;

  const metrics = {
    patternName: inferPatternName(trade),
    timeframe: String(trade.timeframe || "1m"),
    predictionDirection: direction,
    predictedConfidence: toNumber(trade?.decisionSnapshot?.confidence, null),
    actualOutcome: String(trade.outcome || "unknown"),
    entryPrice,
    exitPrice: toNumber(trade.exitPrice, toNumber(closeCandle.close, null)),
    sl: toNumber(trade.stopLoss, null),
    tp: toNumber(trade.takeProfit, null),
    mfe,
    mae,
    distanceFromEMA: Number.isFinite(ema) && Number.isFinite(entryPrice) ? Number(((entryPrice - ema) / ema).toFixed(4)) : null,
    distanceFromBase: Number.isFinite(base) && Number.isFinite(entryPrice) ? Number(((entryPrice - base) / base).toFixed(4)) : null,
    nearLocalHigh: localFlags.nearLocalHigh,
    nearLocalLow: localFlags.nearLocalLow,
    volumeRatio: Number.isFinite(entryVolume) && Number.isFinite(avgVolume) && avgVolume > 0 ? Number((entryVolume / avgVolume).toFixed(4)) : null,
    followthroughScore,
    wickPressure: computeWickPressure(entryCandle),
    bodyQuality: computeBodyQuality(entryCandle),
    contextTags: [],
    failureReasonCodes: [],
    successReasonCodes: [],
  };

  metrics.contextTags = buildContextTags(metrics, trade);
  const reasonCodes = computeReasonCodes(metrics, trade);
  metrics.failureReasonCodes = reasonCodes.failureReasonCodes;
  metrics.successReasonCodes = reasonCodes.successReasonCodes;
  return metrics;
}

function bumpCounter(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function toTopEntries(map, limit = 8) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([code, count]) => ({ code, count }));
}

export function buildDiagnosticPerformanceSummary(trades = []) {
  const rows = Array.isArray(trades) ? trades : [];
  const byPattern = {};
  const byTimeframe = {};
  const lossReasons = new Map();
  const winReasons = new Map();
  const lossReasonsByPattern = {};
  const winReasonsByPattern = {};
  const lateEntryByPattern = new Map();
  const noFollowthroughByPattern = new Map();

  rows.forEach((trade) => {
    const diag = trade.diagnostics || {};
    const pattern = String(diag.patternName || trade.setup || "unknown_pattern");
    const timeframe = String(diag.timeframe || trade.timeframe || "1m");
    const outcome = String(diag.actualOutcome || trade.outcome || "unknown");

    if (!byPattern[pattern]) byPattern[pattern] = { trades: 0, wins: 0, losses: 0, winRate: 0 };
    byPattern[pattern].trades += 1;
    if (outcome === "win") byPattern[pattern].wins += 1;
    if (outcome === "loss") byPattern[pattern].losses += 1;

    if (!byTimeframe[timeframe]) byTimeframe[timeframe] = { trades: 0, wins: 0, losses: 0, winRate: 0 };
    byTimeframe[timeframe].trades += 1;
    if (outcome === "win") byTimeframe[timeframe].wins += 1;
    if (outcome === "loss") byTimeframe[timeframe].losses += 1;

    const failure = Array.isArray(diag.failureReasonCodes) ? diag.failureReasonCodes : [];
    const success = Array.isArray(diag.successReasonCodes) ? diag.successReasonCodes : [];

    failure.forEach((code) => {
      bumpCounter(lossReasons, code);
      if (!lossReasonsByPattern[pattern]) lossReasonsByPattern[pattern] = {};
      lossReasonsByPattern[pattern][code] = (lossReasonsByPattern[pattern][code] || 0) + 1;
      if (code === "late_entry") bumpCounter(lateEntryByPattern, pattern);
      if (code === "no_followthrough") bumpCounter(noFollowthroughByPattern, pattern);
    });

    success.forEach((code) => {
      bumpCounter(winReasons, code);
      if (!winReasonsByPattern[pattern]) winReasonsByPattern[pattern] = {};
      winReasonsByPattern[pattern][code] = (winReasonsByPattern[pattern][code] || 0) + 1;
    });
  });

  Object.values(byPattern).forEach((bucket) => {
    const closed = bucket.wins + bucket.losses;
    bucket.winRate = closed ? Number(((bucket.wins / closed) * 100).toFixed(2)) : 0;
  });
  Object.values(byTimeframe).forEach((bucket) => {
    const closed = bucket.wins + bucket.losses;
    bucket.winRate = closed ? Number(((bucket.wins / closed) * 100).toFixed(2)) : 0;
  });

  return {
    byPattern,
    byTimeframe,
    topLossReasons: toTopEntries(lossReasons, 10),
    topWinReasons: toTopEntries(winReasons, 10),
    lossReasonsByPattern,
    winReasonsByPattern,
    patternsMostAffectedByLateEntry: toTopEntries(lateEntryByPattern, 6),
    patternsMostAffectedByNoFollowthrough: toTopEntries(noFollowthroughByPattern, 6),
  };
}
