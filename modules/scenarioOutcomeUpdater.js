import { computeContextScoring, getDefaultContextLearningRow } from "./contextScoringEngine.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function toOutcomeLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (["fulfilled", "win", "won", "success"].includes(normalized)) return "win";
  if (["invalidated", "loss", "lost", "failed"].includes(normalized)) return "loss";
  return "neutral";
}

function normalizeBias(raw = "neutral") {
  const value = String(raw || "neutral").toLowerCase();
  if (["bullish", "long"].includes(value)) return "long";
  if (["bearish", "short"].includes(value)) return "short";
  return "neutral";
}

export function updateContextFromScenarioOutcome({
  context = {},
  scenario = {},
  resolution = {},
  operatorOverride = null,
} = {}) {
  const base = getDefaultContextLearningRow(context);
  const outcome = toOutcomeLabel(resolution.final_status || scenario.status || resolution.outcome);
  const wins = base.wins + (outcome === "win" ? 1 : 0);
  const losses = base.losses + (outcome === "loss" ? 1 : 0);
  const samples = base.samples + (outcome === "neutral" ? 0 : 1);
  const lastOutcomes = [...(Array.isArray(base.last_outcomes) ? base.last_outcomes : []), outcome].slice(-8);
  const consecutiveLosses = lastOutcomes.slice().reverse().findIndex((x) => x !== "loss");
  const lossStreak = consecutiveLosses === -1 ? lastOutcomes.length : consecutiveLosses;

  const rawWinrate = samples > 0 ? wins / samples : 0;
  const preferredPosture = outcome === "win"
    ? (scenario.posture || base.preferred_posture || "wait")
    : base.preferred_posture || "wait";
  const learnedBias = outcome === "win"
    ? normalizeBias(scenario.brain_bias || scenario.bias || base.learned_bias)
    : base.learned_bias || "neutral";

  let confidenceBias = clamp(base.confidence_bias + (outcome === "win" ? 0.06 : outcome === "loss" ? -0.09 : -0.02), -0.55, 0.55);
  let dangerScore = clamp(base.danger_score + (outcome === "loss" ? 0.08 : outcome === "win" ? -0.05 : 0.01) + (lossStreak >= 2 ? lossStreak * 0.03 : 0), 0, 1);

  let trustOperator = clamp(base.trust_operator, 0, 1);
  let operatorCaution = clamp(base.operator_caution, 0, 1);
  const hasOperatorOverride = Boolean(operatorOverride?.used);
  const overrideDirection = hasOperatorOverride ? toOutcomeLabel(operatorOverride.outcome || outcome) : null;
  if (hasOperatorOverride) {
    if (overrideDirection === "win") {
      trustOperator = clamp(trustOperator + 0.08, 0, 1);
      operatorCaution = clamp(operatorCaution - 0.03, 0, 1);
      confidenceBias = clamp(confidenceBias + 0.03, -0.55, 0.55);
    }
    if (overrideDirection === "loss") {
      trustOperator = clamp(trustOperator - 0.04, 0, 1);
      operatorCaution = clamp(operatorCaution + 0.09, 0, 1);
      dangerScore = clamp(dangerScore + 0.05, 0, 1);
    }
  }

  const row = {
    ...base,
    samples,
    wins,
    losses,
    winrate: Number(rawWinrate.toFixed(3)),
    danger_score: Number(dangerScore.toFixed(3)),
    confidence_bias: Number(confidenceBias.toFixed(3)),
    last_outcomes: lastOutcomes,
    learned_bias: learnedBias,
    preferred_posture: preferredPosture,
    trust_operator: Number(trustOperator.toFixed(3)),
    operator_caution: Number(operatorCaution.toFixed(3)),
  };

  const scoring = computeContextScoring(row);
  return {
    ...row,
    danger_score: scoring.danger_score,
    winrate: scoring.winrate,
    context_score: scoring.context_score,
    familiarity: scoring.familiarity,
    confidence_adjustment: scoring.confidence_adjustment,
  };
}
