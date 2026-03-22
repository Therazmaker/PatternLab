import { getDecisionStrengthBucket, wasOperatorVetoCorrect } from "./diagnosticRules.js";
import { buildDecisionSummary } from "./diagnosticSummaryBuilder.js";

function isDirectionMoveAligned(signalDirection, moved) {
  if (signalDirection === "LONG") return moved === "up";
  return moved === "down";
}

export function diagnoseSkippedDecision(decisionMemoryRecord = {}) {
  const decisionId = String(decisionMemoryRecord.decisionId || "decision_unknown");
  const operatorAction = String(decisionMemoryRecord.operatorAction || "needs_confirmation");
  const signalDirection = String(decisionMemoryRecord?.signal?.direction || "LONG");
  const moved = String(decisionMemoryRecord?.marketOutcome?.moved || "sideways");
  const strength = Number(decisionMemoryRecord?.marketOutcome?.moveStrength || 0);
  const strengthBucket = getDecisionStrengthBucket(strength);

  const reasonCodes = [];
  let verdict = "neutral_skip";

  if (operatorAction === "veto") {
    if (wasOperatorVetoCorrect(decisionMemoryRecord)) {
      verdict = "good_skip";
      reasonCodes.push("veto_saved_loss", "operator_context_correct");
    } else if (strengthBucket === "strong" && isDirectionMoveAligned(signalDirection, moved)) {
      verdict = "bad_skip";
      reasonCodes.push("veto_blocked_winner", "operator_context_incorrect");
    } else {
      verdict = "neutral_skip";
      reasonCodes.push("market_was_unclear");
    }
  } else {
    if (strengthBucket === "strong") {
      verdict = "good_skip";
      reasonCodes.push("confirmation_was_needed", "operator_context_correct");
    } else if (strengthBucket === "moderate") {
      verdict = "neutral_skip";
      reasonCodes.push("market_was_unclear");
    } else {
      verdict = "neutral_skip";
      reasonCodes.push("market_was_unclear");
    }
  }

  const primaryCause = reasonCodes[0] || "market_was_unclear";
  const secondaryCause = reasonCodes[1] || null;
  const confidenceInDiagnosis = Math.max(35, Math.min(95, Math.round((strength * 100 * 0.6) + (reasonCodes.length * 10))));

  return {
    decisionId,
    operatorAction,
    verdict,
    primaryCause,
    secondaryCause,
    reasonCodes,
    confidenceInDiagnosis,
    summaryText: buildDecisionSummary({
      operatorAction,
      verdict,
      signalDirection,
      primaryCause,
      secondaryCause,
    }),
  };
}
