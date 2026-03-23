// copilotFeedbackBridge.js
// Converts copilot feedback evaluation results into decision engine effects.
// Operates in assisted mode only — does NOT auto-execute trades.

function clamp(value, min = -0.9, max = 0.9) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

/**
 * Build the copilot decision effects from a feedback payload and its evaluation result.
 *
 * @param {object} feedback - normalized copilot feedback (from copilotFeedbackStore)
 * @param {object} evaluation - output of evaluateCopilotFeedback(...)
 * @returns {{
 *   copilotModifier: number,
 *   requireConfirmation: boolean,
 *   blockEntry: boolean,
 *   nextAction: string,
 *   reasonCodes: string[],
 *   summaryText: string,
 * }}
 */
export function buildCopilotFeedbackEffects(feedback = null, evaluation = null) {
  const effects = {
    copilotModifier: 0,
    requireConfirmation: false,
    blockEntry: false,
    nextAction: "idle",
    reasonCodes: [],
    summaryText: "Copilot feedback idle.",
  };

  if (!feedback || !evaluation) return effects;

  const actions = feedback.system_actions || {};
  const { primaryStatus, alternateStatus, globalInvalidated, nextAction, explanation } = evaluation;

  effects.nextAction = nextAction || "wait";

  // Safe mode: always require confirmation unless explicitly opted out
  if (actions.should_require_confirmation !== false) {
    effects.requireConfirmation = true;
    effects.reasonCodes.push("copilot_requires_confirmation");
  }

  // Block immediate entry if flag is set
  if (actions.should_block_immediate_entry === true) {
    effects.blockEntry = true;
    effects.reasonCodes.push("copilot_blocks_immediate_entry");
  }

  // Global invalidation: block all, penalize strongly
  if (globalInvalidated) {
    effects.blockEntry = true;
    effects.copilotModifier = clamp(-0.4);
    effects.requireConfirmation = true;
    effects.reasonCodes.push("copilot_global_invalidation");
  }

  // Primary validated: boost confidence in the preferred direction
  if (primaryStatus === "validated" && !globalInvalidated) {
    effects.copilotModifier = clamp(effects.copilotModifier + 0.25);
    effects.requireConfirmation = Boolean(actions.should_require_confirmation !== false);
    effects.reasonCodes.push("copilot_primary_validated");
  }

  // Primary invalidated: reduce confidence
  if (primaryStatus === "invalidated") {
    effects.copilotModifier = clamp(effects.copilotModifier - 0.3);
    effects.reasonCodes.push("copilot_primary_invalidated");
  }

  // Alternate validated (while primary invalidated): slight positive on alternate direction
  if (alternateStatus === "validated" && primaryStatus === "invalidated") {
    effects.copilotModifier = clamp(effects.copilotModifier + 0.1);
    effects.reasonCodes.push("copilot_alternate_validated");
  }

  // Waiting confirmation: mild caution
  if (primaryStatus === "waiting_confirmation") {
    effects.requireConfirmation = true;
    effects.reasonCodes.push("copilot_waiting_confirmation");
  }

  // Entry quality / posture downgrade
  const verdict = feedback.copilot_verdict || {};
  if (verdict.entry_quality === "avoid") {
    effects.blockEntry = true;
    effects.copilotModifier = clamp(effects.copilotModifier - 0.35);
    effects.reasonCodes.push("copilot_entry_quality_avoid");
  } else if (verdict.entry_quality === "wait" || verdict.entry_quality === "C") {
    effects.requireConfirmation = true;
    effects.copilotModifier = clamp(effects.copilotModifier - 0.15);
    effects.reasonCodes.push("copilot_entry_quality_weak");
  } else if (verdict.entry_quality === "A+" || verdict.entry_quality === "A") {
    effects.copilotModifier = clamp(effects.copilotModifier + 0.1);
    effects.reasonCodes.push("copilot_entry_quality_strong");
  }

  effects.summaryText = explanation || `Copilot: ${primaryStatus ?? "idle"} | modifier ${effects.copilotModifier.toFixed(2)}`;

  return effects;
}
