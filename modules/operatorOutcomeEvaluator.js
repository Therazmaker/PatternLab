import { normalizeOperatorActionType } from "./operatorActionTypes.js";

const IMPACT_TYPES = [
  "saved_loss",
  "blocked_winner",
  "improved_timing",
  "avoided_chop",
  "confirmed_good_trade",
  "delayed_valid_entry",
  "wrong_bias",
  "insufficient_data",
];

function clamp(value, min = -1, max = 1) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function toVerdict(score) {
  if (score >= 0.75) return "correct";
  if (score >= 0.25) return "partially_correct";
  if (score > -0.25) return "neutral";
  return "incorrect";
}

function resolveResultScore(result) {
  if (result === "win") return 1;
  if (result === "loss") return -1;
  return 0;
}

function outcomeFromLinked(linked = {}) {
  return {
    result: String(linked.result || linked.marketOutcome?.result || linked.outcomeComparison?.operatorCorrected?.result || linked.outcome?.result || "unknown"),
    machineResult: String(linked.machineResult || linked.outcomeComparison?.machineOnly?.result || "unknown"),
    moveStrength: Number(linked.moveStrength || linked.marketOutcome?.moveStrength || 0),
    chopRisk: Number(linked.chopRisk || 0),
  };
}

function evaluateByActionType(actionType, actionRecord, linked) {
  const outcome = outcomeFromLinked(linked);
  const operatorResultScore = resolveResultScore(outcome.result);
  const machineResultScore = resolveResultScore(outcome.machineResult);

  if (outcome.result === "unknown" && outcome.machineResult === "unknown") {
    return { score: 0, impactType: "insufficient_data", summary: "Outcome unavailable. Action kept unevaluated quality." };
  }

  switch (actionType) {
    case "approve":
      if (operatorResultScore > 0) return { score: 0.9, impactType: "confirmed_good_trade", summary: "Operator approval aligned with a winning trade." };
      if (operatorResultScore < 0 && outcome.moveStrength >= 0.7) return { score: -0.9, impactType: "wrong_bias", summary: "Operator approved a weak setup that failed hard." };
      return { score: -0.3, impactType: "delayed_valid_entry", summary: "Approved trade underperformed; impact was mildly negative." };
    case "veto":
      if (machineResultScore < 0) return { score: 1, impactType: "saved_loss", summary: "Operator veto likely prevented a losing trade." };
      if (machineResultScore > 0) return { score: -1, impactType: "blocked_winner", summary: "Operator veto blocked a likely strong winner." };
      return { score: 0.2, impactType: "avoided_chop", summary: "Operator veto avoided a low-quality chop outcome." };
    case "still_short":
    case "still_long": {
      const expected = actionType === "still_short" ? "SHORT" : "LONG";
      const marketDirection = String(linked.marketDirection || linked.marketOutcome?.direction || "NONE").toUpperCase();
      if (marketDirection === expected) return { score: 0.85, impactType: "confirmed_good_trade", summary: `Operator ${actionType} matched continuation.` };
      if (marketDirection !== "NONE") return { score: -0.8, impactType: "wrong_bias", summary: `Operator ${actionType} opposed realized direction.` };
      return { score: 0, impactType: "insufficient_data", summary: `Operator ${actionType} could not be judged due to missing direction.` };
    }
    case "resistance_active":
    case "support_active":
      if (machineResultScore < 0) return { score: 0.8, impactType: "saved_loss", summary: `${actionType} protected entry near invalid level.` };
      if (machineResultScore > 0) return { score: -0.7, impactType: "blocked_winner", summary: `${actionType} over-constrained a valid breakout.` };
      return { score: 0.3, impactType: "avoided_chop", summary: `${actionType} likely reduced chop exposure.` };
    case "needs_confirmation":
      if (operatorResultScore > 0 && machineResultScore <= 0) return { score: 0.75, impactType: "improved_timing", summary: "Delayed entry improved trade quality." };
      if (operatorResultScore <= 0 && machineResultScore > 0) return { score: -0.5, impactType: "delayed_valid_entry", summary: "Delay missed an otherwise valid clean move." };
      return { score: 0.25, impactType: "avoided_chop", summary: "Confirmation request added a conservative filter." };
    case "override_long":
    case "override_short":
      if (operatorResultScore > machineResultScore) return { score: 0.95, impactType: "improved_timing", summary: "Directional override outperformed machine direction." };
      if (operatorResultScore < machineResultScore) return { score: -0.95, impactType: "wrong_bias", summary: "Directional override underperformed machine direction." };
      return { score: 0, impactType: "neutral", summary: "Directional override and machine produced equivalent outcome." };
    case "pullback_only":
    case "reversal_confirmed":
    case "none":
    default:
      if (operatorResultScore === 0) return { score: 0, impactType: "avoided_chop", summary: "No measurable edge from operator action." };
      return {
        score: clamp(operatorResultScore * 0.4),
        impactType: operatorResultScore > 0 ? "partially_confirmed" : "wrong_bias",
        summary: "Operator action had secondary influence with limited confidence.",
      };
  }
}

export function evaluateOperatorAction(actionRecord = {}, linkedTradeOrDecision = {}) {
  const actionId = String(actionRecord.actionId || "");
  const actionType = normalizeOperatorActionType(actionRecord?.operatorAction?.type, "none");
  const { score, impactType, summary } = evaluateByActionType(actionType, actionRecord, linkedTradeOrDecision);
  const correctnessScore = clamp(score);
  const normalizedImpact = IMPACT_TYPES.includes(impactType) ? impactType : "insufficient_data";

  return {
    actionId,
    evaluated: true,
    verdict: toVerdict(correctnessScore),
    correctnessScore,
    impactType: normalizedImpact,
    summaryText: summary,
  };
}
