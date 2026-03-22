const THRESHOLDS = {
  nearResistanceDistance: 0.35,
  nearSupportDistance: 0.35,
  weakMomentum: 40,
  strongMomentum: 70,
  weakRsiLong: 50,
  strongRsiLong: 60,
  weakRsiShort: 50,
  strongRsiShort: 40,
  goodFollowThroughMfeR: 0.75,
  noFollowThroughMfeR: 0.25,
  noFollowThroughMaeR: 0.6,
  lateEntryDistanceFromEmaAtr: 1.0,
  rangeAtrCompression: 0.75,
  rangeEmaSlopeAbs: 2,
  falseBreakoutMinAdverseR: 0.6,
  falseBreakoutMaxFavorableR: 0.25,
  volatilitySpikeAtrMultiplier: 1.4,
  significantOutcomeMoveStrength: 0.55,
  neutralOutcomeMoveStrength: 0.3,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function contextFeatures(context = {}) {
  return context?.features || context?.preTradeContext?.context20?.features || {};
}

function contextStructure(context = {}) {
  return context?.structure || context?.preTradeContext?.context20?.structure || {};
}

function contextRegime(context = {}) {
  return String(context?.regime || context?.preTradeContext?.context20?.regime || "unknown");
}

export function getTradeContext(trade = {}) {
  return trade?.preTradeContext?.context20 || trade?.context20 || {};
}

function resolveRisk(trade = {}) {
  const entry = toNumber(trade?.execution?.entryPrice, NaN);
  const stop = toNumber(trade?.execution?.stopLoss, NaN);
  const distance = Math.abs(entry - stop);
  return Number.isFinite(distance) && distance > 0 ? distance : 1;
}

function resolveMfeR(trade = {}) {
  return toNumber(trade?.outcome?.mfe, 0) / resolveRisk(trade);
}

function resolveMaeR(trade = {}) {
  return toNumber(trade?.outcome?.mae, 0) / resolveRisk(trade);
}

export function isTrendAlignedLong(context = {}, signal = {}) {
  const features = contextFeatures(context);
  const regime = contextRegime(context);
  const emaSlope = toNumber(features.ema_slope, 0);
  const emaFast = toNumber(features.ema_fast, 0);
  const emaSlow = toNumber(features.ema_slow, 0);
  const bullishBias = toNumber(signal.bullishScore, 0) >= toNumber(signal.bearishScore, 0);
  return (regime === "trending_up" || regime === "uptrend") && emaSlope > 0 && emaFast >= emaSlow && bullishBias;
}

export function isTrendAlignedShort(context = {}, signal = {}) {
  const features = contextFeatures(context);
  const regime = contextRegime(context);
  const emaSlope = toNumber(features.ema_slope, 0);
  const emaFast = toNumber(features.ema_fast, 0);
  const emaSlow = toNumber(features.ema_slow, 0);
  const bearishBias = toNumber(signal.bearishScore, 0) >= toNumber(signal.bullishScore, 0);
  return (regime === "trending_down" || regime === "downtrend") && emaSlope < 0 && emaFast <= emaSlow && bearishBias;
}

export function isNearResistance(context = {}) {
  const structure = contextStructure(context);
  return toNumber(structure.distance_to_resistance, 1) <= THRESHOLDS.nearResistanceDistance;
}

export function isNearSupport(context = {}) {
  const structure = contextStructure(context);
  return toNumber(structure.distance_to_support, 1) <= THRESHOLDS.nearSupportDistance;
}

export function hasWeakMomentum(context = {}) {
  const features = contextFeatures(context);
  const momentumAbs = Math.abs(toNumber(features.momentum, 0));
  return momentumAbs <= THRESHOLDS.weakMomentum;
}

export function hasStrongMomentum(context = {}) {
  const features = contextFeatures(context);
  const momentumAbs = Math.abs(toNumber(features.momentum, 0));
  return momentumAbs >= THRESHOLDS.strongMomentum;
}

export function hasGoodFollowThrough(trade = {}) {
  return resolveMfeR(trade) >= THRESHOLDS.goodFollowThroughMfeR && toNumber(trade?.outcome?.pnlR, 0) > 0;
}

export function hasNoFollowThrough(trade = {}) {
  return resolveMfeR(trade) <= THRESHOLDS.noFollowThroughMfeR || resolveMaeR(trade) >= THRESHOLDS.noFollowThroughMaeR;
}

export function isLateEntry(context = {}, execution = {}) {
  const features = contextFeatures(context);
  const atr = Math.max(toNumber(features.atr, 0), 1);
  const emaFast = toNumber(features.ema_fast, toNumber(execution.entryPrice, 0));
  const entryPrice = toNumber(execution.entryPrice, emaFast);
  const distance = Math.abs(entryPrice - emaFast) / atr;
  return distance >= THRESHOLDS.lateEntryDistanceFromEmaAtr;
}

export function isRangeEnvironment(context = {}) {
  const features = contextFeatures(context);
  const regime = contextRegime(context);
  const emaSlopeAbs = Math.abs(toNumber(features.ema_slope, 0));
  const atr = toNumber(features.atr, 1);
  const compression = features.compression === true;
  return regime === "ranging" || regime === "choppy" || (compression && atr <= THRESHOLDS.rangeAtrCompression) || emaSlopeAbs <= THRESHOLDS.rangeEmaSlopeAbs;
}

export function isVolatileAgainstTrade(trade = {}, context = {}) {
  const features = contextFeatures(context);
  const atr = Math.max(toNumber(features.atr, 0), 1);
  const mae = toNumber(trade?.outcome?.mae, 0);
  return (mae / atr) >= THRESHOLDS.volatilitySpikeAtrMultiplier;
}

export function isValidPullbackEntry(context = {}, signal = {}) {
  const features = contextFeatures(context);
  const rsi = toNumber(features.rsi, 50);
  const direction = String(signal.direction || "LONG");
  if (direction === "SHORT") {
    return rsi <= 55 && rsi >= THRESHOLDS.strongRsiShort;
  }
  return rsi >= 45 && rsi <= THRESHOLDS.strongRsiLong;
}

export function isFalseBreakout(trade = {}, context = {}) {
  const direction = String(trade?.signal?.direction || "LONG");
  const range = isRangeEnvironment(context);
  const adverse = resolveMaeR(trade);
  const favorable = resolveMfeR(trade);
  if (!range) return false;
  if (direction === "SHORT") {
    return adverse >= THRESHOLDS.falseBreakoutMinAdverseR && favorable <= THRESHOLDS.falseBreakoutMaxFavorableR;
  }
  return adverse >= THRESHOLDS.falseBreakoutMinAdverseR && favorable <= THRESHOLDS.falseBreakoutMaxFavorableR;
}

export function wasOperatorWarningRelevant(trade = {}) {
  const action = String(trade?.operator?.action || "none");
  return action === "veto" || action === "needs_confirmation";
}

export function wasOperatorVetoCorrect(decision = {}) {
  const action = String(decision?.operatorAction || "needs_confirmation");
  const signalDirection = String(decision?.signal?.direction || "LONG");
  const moved = String(decision?.marketOutcome?.moved || "sideways");
  const strength = toNumber(decision?.marketOutcome?.moveStrength, 0);
  if (action !== "veto" || strength < THRESHOLDS.significantOutcomeMoveStrength) return false;
  if (signalDirection === "LONG") return moved === "down";
  return moved === "up";
}

function trendAlignmentScoreLong(context = {}, signal = {}) {
  const features = contextFeatures(context);
  const regime = contextRegime(context);
  const emaSlope = toNumber(features.ema_slope, 0);
  const emaFast = toNumber(features.ema_fast, 0);
  const emaSlow = toNumber(features.ema_slow, 0);
  const biasDelta = toNumber(signal.bullishScore, 0) - toNumber(signal.bearishScore, 0);
  let score = 50;
  if (regime.includes("up")) score += 25;
  if (regime.includes("down")) score -= 25;
  if (emaSlope > 0) score += 15;
  if (emaFast >= emaSlow) score += 10;
  score += Math.max(-10, Math.min(10, biasDelta / 5));
  return Math.max(0, Math.min(100, Math.round(score)));
}

function trendAlignmentScoreShort(context = {}, signal = {}) {
  const features = contextFeatures(context);
  const regime = contextRegime(context);
  const emaSlope = toNumber(features.ema_slope, 0);
  const emaFast = toNumber(features.ema_fast, 0);
  const emaSlow = toNumber(features.ema_slow, 0);
  const biasDelta = toNumber(signal.bearishScore, 0) - toNumber(signal.bullishScore, 0);
  let score = 50;
  if (regime.includes("down")) score += 25;
  if (regime.includes("up")) score -= 25;
  if (emaSlope < 0) score += 15;
  if (emaFast <= emaSlow) score += 10;
  score += Math.max(-10, Math.min(10, biasDelta / 5));
  return Math.max(0, Math.min(100, Math.round(score)));
}

function structureScoreLong(context = {}) {
  const structure = contextStructure(context);
  const resistance = toNumber(structure.distance_to_resistance, 1);
  const support = toNumber(structure.distance_to_support, 1);
  const score = 30 + (clamp01(resistance) * 60) + (Math.max(0, 0.5 - support) * 20);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function structureScoreShort(context = {}) {
  const structure = contextStructure(context);
  const support = toNumber(structure.distance_to_support, 1);
  const resistance = toNumber(structure.distance_to_resistance, 1);
  const score = 30 + (clamp01(support) * 60) + (Math.max(0, 0.5 - resistance) * 20);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function momentumScoreLong(context = {}) {
  const features = contextFeatures(context);
  const rsi = toNumber(features.rsi, 50);
  const momentum = toNumber(features.momentum, 0);
  const slope = toNumber(features.ema_slope, 0);
  let score = 50;
  score += (rsi - 50) * 0.8;
  score += momentum * 0.4;
  score += slope * 0.8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function momentumScoreShort(context = {}) {
  const features = contextFeatures(context);
  const rsi = toNumber(features.rsi, 50);
  const momentum = toNumber(features.momentum, 0);
  const slope = toNumber(features.ema_slope, 0);
  let score = 50;
  score += (50 - rsi) * 0.8;
  score += (-momentum) * 0.4;
  score += (-slope) * 0.8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function timingScore(context = {}, execution = {}, signal = {}) {
  let score = 65;
  if (isLateEntry(context, execution)) score -= 35;
  if (isValidPullbackEntry(context, signal)) score += 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function followThroughScore(trade = {}) {
  const mfeR = resolveMfeR(trade);
  const maeR = resolveMaeR(trade);
  const pnlR = toNumber(trade?.outcome?.pnlR, 0);
  const raw = 50 + (mfeR * 45) - (maeR * 25) + (pnlR * 20);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function operatorContextScore(trade = {}) {
  const action = String(trade?.operator?.action || "none");
  const result = String(trade?.outcome?.result || "breakeven");
  if (action === "none") return 55;
  if (action === "approve") return result === "win" ? 85 : 35;
  if (action === "veto") return result === "loss" ? 70 : 40;
  return 50;
}

export function calculateDiagnosticScores(trade = {}) {
  const direction = String(trade?.signal?.direction || "LONG");
  const context = getTradeContext(trade);
  const signal = trade?.signal || {};
  const execution = trade?.execution || {};
  return {
    trendAlignmentScore: direction === "SHORT" ? trendAlignmentScoreShort(context, signal) : trendAlignmentScoreLong(context, signal),
    structureScore: direction === "SHORT" ? structureScoreShort(context) : structureScoreLong(context),
    momentumScore: direction === "SHORT" ? momentumScoreShort(context) : momentumScoreLong(context),
    timingScore: timingScore(context, execution, signal),
    followThroughScore: followThroughScore(trade),
    operatorContextScore: operatorContextScore(trade),
  };
}

export function getRuleThresholds() {
  return { ...THRESHOLDS };
}

export function getDecisionStrengthBucket(moveStrength = 0) {
  const strength = toNumber(moveStrength, 0);
  if (strength >= THRESHOLDS.significantOutcomeMoveStrength) return "strong";
  if (strength <= THRESHOLDS.neutralOutcomeMoveStrength) return "weak";
  return "moderate";
}
