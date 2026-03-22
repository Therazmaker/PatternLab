import { normalizeOperatorActionType } from "./operatorActionTypes.js";
import { buildContextSignature } from "./contextSignatureBuilder.js";

const LIVE_ACTION_WEIGHTS = Object.freeze({
  approve: 0.12,
  veto: -0.35,
  still_short: -0.28,
  still_long: 0.28,
  pullback_only: -0.15,
  reversal_confirmed: 0.15,
  needs_confirmation: -0.2,
  resistance_active: -0.18,
  support_active: 0.18,
  override_long: 0.3,
  override_short: -0.3,
  none: 0,
});

function clamp(value, min = -0.45, max = 0.45) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function getPatternStrength(actionType, summary, contextSignature) {
  const actionStats = summary?.byActionType?.[actionType] || { count: 0, avgCorrectnessScore: 0 };
  const regimeStats = summary?.byContext?.[contextSignature.regime]?.[actionType] || { count: 0, avgCorrectnessScore: 0 };

  const sampleConfidence = Math.min(1, (Number(actionStats.count || 0) + Number(regimeStats.count || 0)) / 40);
  const blendedScore = ((Number(actionStats.avgCorrectnessScore || 0) * 0.6) + (Number(regimeStats.avgCorrectnessScore || 0) * 0.4));
  return clamp(blendedScore * sampleConfidence, -0.2, 0.2);
}

export function computeOperatorModifier(currentSignal = {}, currentContext = {}, operatorPatternSummary = {}, currentOperatorInput = null) {
  const actionType = normalizeOperatorActionType(currentOperatorInput?.type || "none", "none");
  const contextSignature = buildContextSignature(currentContext?.contextSignature || currentContext);

  const liveWeight = LIVE_ACTION_WEIGHTS[actionType] || 0;
  const historicalStrength = getPatternStrength(actionType, operatorPatternSummary, contextSignature);

  const liveComponent = clamp(liveWeight, -0.35, 0.35);
  const historicalComponent = currentOperatorInput ? historicalStrength : clamp(historicalStrength * 0.4, -0.08, 0.08);

  const modifierScore = clamp(liveComponent + historicalComponent, -0.45, 0.45);
  const modifierDirection = modifierScore > 0.03 ? "bullish" : modifierScore < -0.03 ? "bearish" : "neutral";

  const contributingFactors = [];
  if (currentOperatorInput) {
    contributingFactors.push({
      source: "live_operator_input",
      description: `Live operator action ${actionType} contributed ${liveComponent.toFixed(2)}.`,
      weight: Number(liveComponent.toFixed(4)),
    });
  }
  if (Math.abs(historicalComponent) > 0.001) {
    contributingFactors.push({
      source: "historical_operator_pattern",
      description: `Historical reliability in ${contextSignature.regime}/${contextSignature.swingStructure} contributed ${historicalComponent.toFixed(2)}.`,
      weight: Number(historicalComponent.toFixed(4)),
    });
  }

  let effectOnDecision = "none";
  if (modifierScore <= -0.3) effectOnDecision = "block";
  else if (modifierScore <= -0.18) effectOnDecision = "require_confirmation";
  else if (modifierScore <= -0.08) effectOnDecision = "soft_warn";
  else if (modifierScore >= 0.2) effectOnDecision = "boost_confidence";

  const summaryText = `Operator modifier computed from action=${actionType}, live=${liveComponent.toFixed(2)}, historical=${historicalComponent.toFixed(2)}, total=${modifierScore.toFixed(2)}.`;

  console.debug("Operator modifier computed", {
    currentOperatorInput,
    historicalOperatorStrength: historicalStrength,
    resultingModifierScore: modifierScore,
  });

  return {
    modifierScore: Number(modifierScore.toFixed(4)),
    modifierDirection,
    effectOnDecision,
    contributingFactors,
    summaryText,
  };
}
