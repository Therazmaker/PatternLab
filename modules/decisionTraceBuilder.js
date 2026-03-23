// decisionTraceBuilder.js
// Builds a decision_trace_v1 record from copilot feedback, evaluation, and effects.

import { deriveReasonCodes, translateReasonCodes } from "./noTradeReasonEngine.js";

export const DECISION_TRACE_SCHEMA_VERSION = "decision_trace_v1";

/**
 * Map nextAction + posture to a decision_action code.
 * @param {string} nextAction
 * @param {string} posture
 * @returns {string}
 */
function mapDecisionAction(nextAction, posture) {
  switch (nextAction) {
    case "block_all":
      return "blocked";
    case "consider_primary":
    case "consider_alternate":
      if (posture === "bullish") return "long_candidate";
      if (posture === "bearish") return "short_candidate";
      return "wait";
    case "block_primary":
      return "no_trade";
    case "wait":
      return "wait";
    default:
      return "wait";
  }
}

/**
 * Compute a confidence value (0–100) from the copilot modifier.
 * The modifier range is approximately -0.9..0.9 → mapped to 0..100.
 * @param {object} effects
 * @returns {number}
 */
function computeConfidence(effects) {
  if (!effects) return 0;
  const mod = Number(effects.copilotModifier || 0);
  return Math.round(((mod + 0.9) / 1.8) * 100);
}

/**
 * Extract a simple name/id string from a rule object or string.
 * @param {object|string} r
 * @returns {string}
 */
function ruleToName(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  return r.ruleId || r.id || r.description || JSON.stringify(r);
}

/**
 * Build a decision_trace_v1 object.
 * @param {object} options
 * @param {object|null} options.candle     - last closed candle { time, open, high, low, close }
 * @param {object|null} options.feedback   - normalized copilot feedback
 * @param {object|null} options.evaluation - result from evaluateCopilotFeedback (extended)
 * @param {object|null} options.effects    - result from buildCopilotFeedbackEffects
 * @param {object}      options.marketCtx  - market context used for evaluation
 * @returns {object} decision_trace_v1
 */
export function buildDecisionTrace({ candle = null, feedback = null, evaluation = null, effects = null, marketCtx = {} } = {}) {
  const now = candle?.time ?? candle?.closeTime ?? new Date().toISOString();
  const verdict = feedback?.copilot_verdict || {};
  const posture = verdict.trade_posture || "neutral";
  const action = effects ? mapDecisionAction(effects.nextAction, posture) : "wait";

  const reasonCodes = deriveReasonCodes(evaluation || {}, effects || {}, feedback);
  const reasonText = translateReasonCodes(reasonCodes);

  const primaryScenario = feedback?.scenario_primary || {};
  const alternateScenario = feedback?.scenario_alternate || null;

  // The extended evaluator exposes per-scenario trigger/invalidation details.
  // Fall back gracefully to the combined lists if the extended fields are absent.
  const ev = evaluation || {};

  const primaryMatchedTriggers  = ev.primaryMatchedTriggers  || [];
  const primaryMissingTriggers  = ev.primaryMissingTriggers  || [];
  const primaryInvalidatedRules = ev.primaryInvalidatedRules || ev.invalidatedRules || [];

  const altMatchedTriggers  = ev.altMatchedTriggers  || [];
  const altMissingTriggers  = ev.altMissingTriggers  || [];
  const altInvalidatedRules = ev.altInvalidatedRules || [];

  return {
    schema_version: DECISION_TRACE_SCHEMA_VERSION,
    candle_time: now,
    market_context: {
      regime:    marketCtx.regime    || "",
      structure: marketCtx.structure?.bias || "",
      momentum:  marketCtx.bias      || "",
    },
    decision: {
      posture,
      action,
      entry_quality:     verdict.entry_quality || "",
      confidence:        computeConfidence(effects),
      scenario_primary:  primaryScenario.name  || "",
      scenario_alternate: alternateScenario?.name || "",
    },
    scenarios: {
      primary: {
        name:                primaryScenario.name || "",
        matched_triggers:    primaryMatchedTriggers.map(ruleToName).filter(Boolean),
        missing_triggers:    primaryMissingTriggers.map(ruleToName).filter(Boolean),
        active_invalidations: primaryInvalidatedRules.map(ruleToName).filter(Boolean),
        status:              ev.primaryStatus || "pending",
      },
      alternate: alternateScenario ? {
        name:                alternateScenario.name || "",
        matched_triggers:    altMatchedTriggers.map(ruleToName).filter(Boolean),
        missing_triggers:    altMissingTriggers.map(ruleToName).filter(Boolean),
        active_invalidations: altInvalidatedRules.map(ruleToName).filter(Boolean),
        status:              ev.alternateStatus || "pending",
      } : null,
    },
    no_trade_analysis: {
      reason_codes: reasonCodes,
      reason_text:  reasonText,
    },
    cognitive_risks: Array.isArray(feedback?.cognitive_risks)
      ? feedback.cognitive_risks.map((r) => (typeof r === "string" ? r : (r.description || JSON.stringify(r))))
      : [],
    explanation_human: effects?.summaryText || verdict.explanation || "",
    forward_eval: {
      bars_1:        null,
      bars_2:        null,
      bars_3:        null,
      bars_5:        null,
      mfe:           null,
      mae:           null,
      block_quality: "pending",
    },
  };
}
