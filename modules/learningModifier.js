import { getLearningModel } from "./learningEngine.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function asDirection(signal = {}) {
  const direction = String(signal.direction || signal.bias || "NONE").toUpperCase();
  return ["LONG", "SHORT", "NONE"].includes(direction) ? direction : "NONE";
}

export function applyLearningModifier(machineSignal = {}, structureFilterResult = {}, context = {}) {
  const model = getLearningModel();
  const direction = asDirection(machineSignal);
  let modifierScore = 0;
  const reasonCodes = [];
  let requiresConfirmation = false;

  if (direction === "LONG" && context.nearResistance) {
    modifierScore += Number(model.weights.longNearResistance || 0);
    if (model.weights.longNearResistance < 0) reasonCodes.push("learning_penalty_long_near_resistance");
  }

  if (direction === "SHORT" && context.nearSupport) {
    modifierScore += Number(model.weights.shortNearSupport || 0);
    if (model.weights.shortNearSupport < 0) reasonCodes.push("learning_penalty_short_near_support");
  }

  if (direction === "SHORT" && context.failedBreakout) {
    modifierScore += Number(model.weights.shortAfterFailedBreakout || 0);
    if (model.weights.shortAfterFailedBreakout > 0) reasonCodes.push("learning_boost_short_failed_breakout");
  }

  if (String(context.momentumState || "").toLowerCase() === "weak") {
    modifierScore += Number(model.weights.momentumWeakPenalty || 0);
    if (model.weights.momentumWeakPenalty < 0) reasonCodes.push("learning_penalty_weak_momentum");
  }

  if (model.toggles.requireConfirmationInCompression && context.compression) {
    requiresConfirmation = true;
    reasonCodes.push("learning_requires_confirmation_in_compression");
  }

  const decision = String(structureFilterResult.decision || "ALLOW").toUpperCase();
  const effectiveDecision = requiresConfirmation && decision === "ALLOW"
    ? "REQUIRES_MANUAL_CONFIRMATION"
    : decision;

  return {
    modifierScore: clamp(modifierScore, -0.35, 0.35),
    requiresConfirmation,
    reasonCodes,
    modelVersion: model.schema,
    structureOverride: effectiveDecision,
    model,
  };
}
