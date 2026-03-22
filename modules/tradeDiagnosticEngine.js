import {
  calculateDiagnosticScores,
  getTradeContext,
  hasNoFollowThrough,
  hasStrongMomentum,
  isFalseBreakout,
  isLateEntry,
  isNearResistance,
  isNearSupport,
  isRangeEnvironment,
  isValidPullbackEntry,
  isVolatileAgainstTrade,
  wasOperatorWarningRelevant,
} from "./diagnosticRules.js";
import { buildTradeSummary } from "./diagnosticSummaryBuilder.js";

function addReason(reasonCodes, weights, code, score) {
  if (!code) return;
  reasonCodes.add(code);
  weights.push({ code, score });
}

function pickPrimarySecondary(weights = []) {
  const ranked = [...weights].sort((a, b) => b.score - a.score);
  return {
    primaryCause: ranked[0]?.code || "no_followthrough",
    secondaryCause: ranked[1]?.code || null,
    ranking: ranked,
  };
}

function computeConfidence(scores = {}, ranking = []) {
  const values = Object.values(scores).filter((value) => Number.isFinite(value));
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 50;
  const top = ranking[0]?.score || 0;
  const second = ranking[1]?.score || 0;
  const separation = Math.max(0, top - second);
  return Math.max(30, Math.min(95, Math.round((avg * 0.45) + (separation * 0.55))));
}

export function diagnoseTrade(tradeMemoryRecord = {}) {
  const direction = String(tradeMemoryRecord?.signal?.direction || "LONG");
  const result = ["win", "loss", "breakeven"].includes(tradeMemoryRecord?.outcome?.result)
    ? tradeMemoryRecord.outcome.result
    : "breakeven";
  const context = getTradeContext(tradeMemoryRecord);
  const scores = calculateDiagnosticScores(tradeMemoryRecord);
  const reasonCodes = new Set();
  const weights = [];

  if (result === "loss") {
    if (direction === "LONG" && isNearResistance(context) && scores.structureScore < 40) {
      addReason(reasonCodes, weights, "entered_into_resistance", 95);
    }
    if (direction === "SHORT" && isNearSupport(context) && scores.structureScore < 40) {
      addReason(reasonCodes, weights, "entered_into_support", 95);
    }
    if (scores.followThroughScore < 35 || hasNoFollowThrough(tradeMemoryRecord)) addReason(reasonCodes, weights, "no_followthrough", 92);
    if (scores.momentumScore < 40) addReason(reasonCodes, weights, "low_momentum_entry", 86);
    if (scores.trendAlignmentScore < 40) addReason(reasonCodes, weights, "countertrend_entry", 88);
    if (scores.timingScore < 35 || isLateEntry(context, tradeMemoryRecord.execution)) addReason(reasonCodes, weights, "late_entry", 82);
    if (isFalseBreakout(tradeMemoryRecord, context)) addReason(reasonCodes, weights, direction === "SHORT" ? "false_breakdown" : "false_breakout", 84);
    if (isRangeEnvironment(context)) addReason(reasonCodes, weights, "ranging_noise", 72);
    if (isVolatileAgainstTrade(tradeMemoryRecord, context)) addReason(reasonCodes, weights, "volatility_spike_against", 78);
    if (wasOperatorWarningRelevant(tradeMemoryRecord) && tradeMemoryRecord?.operator?.action === "approve") {
      addReason(reasonCodes, weights, "operator_warning_ignored", 70);
    }
  }

  if (result === "win") {
    if (scores.trendAlignmentScore > 75 && scores.followThroughScore > 70) addReason(reasonCodes, weights, "trend_continuation", 94);
    if (scores.structureScore > 70 && scores.timingScore > 65 && isValidPullbackEntry(context, tradeMemoryRecord.signal)) {
      addReason(reasonCodes, weights, "pullback_entry_valid", 90);
    }
    if (scores.followThroughScore > 80 && scores.momentumScore > 70) {
      addReason(reasonCodes, weights, direction === "SHORT" ? "breakdown_with_followthrough" : "breakout_with_followthrough", 92);
    }
    if (direction === "LONG" && isNearSupport(context)) addReason(reasonCodes, weights, "support_hold", 78);
    if (direction === "SHORT" && isNearResistance(context)) addReason(reasonCodes, weights, "resistance_reject", 78);
    if (hasStrongMomentum(context) && scores.momentumScore > 70) addReason(reasonCodes, weights, "strong_momentum_alignment", 88);
    if (tradeMemoryRecord?.operator?.action === "approve" && scores.operatorContextScore > 70) {
      addReason(reasonCodes, weights, "operator_bias_correct", 75);
    }
  }

  if (result === "breakeven" && reasonCodes.size === 0) {
    if (isRangeEnvironment(context)) addReason(reasonCodes, weights, "ranging_noise", 70);
    if (scores.followThroughScore < 45) addReason(reasonCodes, weights, "no_followthrough", 68);
  }

  if (reasonCodes.size === 0) {
    if (result === "win") addReason(reasonCodes, weights, "trend_continuation", 55);
    if (result === "loss") addReason(reasonCodes, weights, "no_followthrough", 55);
    if (result === "breakeven") addReason(reasonCodes, weights, "ranging_noise", 55);
  }

  const { primaryCause, secondaryCause, ranking } = pickPrimarySecondary(weights);
  const confidenceInDiagnosis = computeConfidence(scores, ranking);

  return {
    tradeId: String(tradeMemoryRecord.tradeId || "trade_unknown"),
    result,
    primaryCause,
    secondaryCause,
    reasonCodes: [...reasonCodes],
    diagnosticScores: scores,
    confidenceInDiagnosis,
    summaryText: buildTradeSummary({
      direction,
      result,
      primaryCause,
      secondaryCause,
    }),
  };
}
