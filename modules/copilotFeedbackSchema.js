// copilotFeedbackSchema.js
// Defines and validates the patternlab_copilot_feedback_v1 schema.

export const SCHEMA_VERSION = "patternlab_copilot_feedback_v1";

const VALID_TRADE_POSTURES = ["bearish", "bullish", "neutral", "ranging"];
const VALID_ENTRY_QUALITIES = ["A+", "A", "B", "C", "avoid", "wait"];
const VALID_SCENARIO_STATUSES = ["waiting_confirmation", "validated", "invalidated", "expired"];
const VALID_RISK_LEVELS = ["low", "medium", "high", "extreme"];
const VALID_ACTION_FLAGS = ["should_block_immediate_entry", "should_require_confirmation", "semi_auto_if_validated"];

/**
 * Validate a trigger rule object.
 * @param {object} rule
 * @returns {string[]} error messages
 */
function validateTriggerRule(rule, path = "rule") {
  const errors = [];
  if (!rule || typeof rule !== "object") {
    errors.push(`${path}: must be an object`);
    return errors;
  }
  if (typeof rule.id !== "string" || !rule.id) errors.push(`${path}.id: required string`);
  if (typeof rule.description !== "string" || !rule.description) errors.push(`${path}.description: required string`);
  if (typeof rule.condition !== "string" || !rule.condition) errors.push(`${path}.condition: required string`);
  return errors;
}

/**
 * Validate a scenario object (primary or alternate).
 * @param {object} scenario
 * @param {string} label
 * @returns {string[]} error messages
 */
function validateScenario(scenario, label = "scenario") {
  const errors = [];
  if (!scenario || typeof scenario !== "object") {
    errors.push(`${label}: must be an object`);
    return errors;
  }
  if (typeof scenario.name !== "string" || !scenario.name) errors.push(`${label}.name: required string`);
  if (typeof scenario.description !== "string") errors.push(`${label}.description: required string`);

  if (scenario.trigger) {
    if (!Array.isArray(scenario.trigger.rules)) {
      errors.push(`${label}.trigger.rules: must be an array`);
    } else {
      scenario.trigger.rules.forEach((rule, i) => {
        errors.push(...validateTriggerRule(rule, `${label}.trigger.rules[${i}]`));
      });
    }
  }

  if (scenario.invalidation) {
    if (!Array.isArray(scenario.invalidation.rules)) {
      errors.push(`${label}.invalidation.rules: must be an array`);
    } else {
      scenario.invalidation.rules.forEach((rule, i) => {
        errors.push(...validateTriggerRule(rule, `${label}.invalidation.rules[${i}]`));
      });
    }
  }

  return errors;
}

/**
 * Validate a full patternlab_copilot_feedback_v1 JSON payload.
 * @param {unknown} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCopilotFeedback(payload) {
  const errors = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload must be a non-null object"] };
  }

  if (payload.schema !== SCHEMA_VERSION) {
    errors.push(`schema: must be "${SCHEMA_VERSION}", got "${payload.schema}"`);
  }

  // copilot_verdict (required)
  const verdict = payload.copilot_verdict;
  if (!verdict || typeof verdict !== "object") {
    errors.push("copilot_verdict: required object");
  } else {
    if (typeof verdict.headline !== "string" || !verdict.headline) errors.push("copilot_verdict.headline: required string");
    if (verdict.trade_posture !== undefined && !VALID_TRADE_POSTURES.includes(verdict.trade_posture)) {
      errors.push(`copilot_verdict.trade_posture: must be one of ${VALID_TRADE_POSTURES.join(", ")}`);
    }
    if (verdict.entry_quality !== undefined && !VALID_ENTRY_QUALITIES.includes(verdict.entry_quality)) {
      errors.push(`copilot_verdict.entry_quality: must be one of ${VALID_ENTRY_QUALITIES.join(", ")}`);
    }
    if (verdict.preferred_scenario !== undefined && typeof verdict.preferred_scenario !== "string") {
      errors.push("copilot_verdict.preferred_scenario: must be a string");
    }
    if (verdict.explanation !== undefined && typeof verdict.explanation !== "string") {
      errors.push("copilot_verdict.explanation: must be a string");
    }
  }

  // scenario_primary (required)
  if (!payload.scenario_primary || typeof payload.scenario_primary !== "object") {
    errors.push("scenario_primary: required object");
  } else {
    errors.push(...validateScenario(payload.scenario_primary, "scenario_primary"));
  }

  // scenario_alternate (optional)
  if (payload.scenario_alternate !== undefined && payload.scenario_alternate !== null) {
    errors.push(...validateScenario(payload.scenario_alternate, "scenario_alternate"));
  }

  // global_invalidations (optional array)
  if (payload.global_invalidations !== undefined) {
    if (!Array.isArray(payload.global_invalidations)) {
      errors.push("global_invalidations: must be an array");
    } else {
      payload.global_invalidations.forEach((rule, i) => {
        errors.push(...validateTriggerRule(rule, `global_invalidations[${i}]`));
      });
    }
  }

  // cognitive_risks (optional array of strings or objects)
  if (payload.cognitive_risks !== undefined && !Array.isArray(payload.cognitive_risks)) {
    errors.push("cognitive_risks: must be an array");
  }

  // system_actions (optional)
  if (payload.system_actions !== undefined && payload.system_actions !== null) {
    if (typeof payload.system_actions !== "object") {
      errors.push("system_actions: must be an object");
    }
  }

  // ui_summary (optional)
  if (payload.ui_summary !== undefined && payload.ui_summary !== null) {
    if (typeof payload.ui_summary !== "object") {
      errors.push("ui_summary: must be an object");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse and normalize a copilot feedback payload with safe defaults.
 * Assumes the payload has already been validated.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeCopilotFeedback(raw = {}) {
  return {
    schema: SCHEMA_VERSION,
    receivedAt: raw.receivedAt || new Date().toISOString(),
    sessionId: raw.sessionId || null,
    caseId: raw.caseId || null,
    copilot_verdict: {
      headline: String(raw.copilot_verdict?.headline || ""),
      trade_posture: raw.copilot_verdict?.trade_posture || "neutral",
      entry_quality: raw.copilot_verdict?.entry_quality || "wait",
      preferred_scenario: raw.copilot_verdict?.preferred_scenario || null,
      explanation: raw.copilot_verdict?.explanation || "",
    },
    scenario_primary: normalizeScenario(raw.scenario_primary || {}),
    scenario_alternate: raw.scenario_alternate ? normalizeScenario(raw.scenario_alternate) : null,
    global_invalidations: Array.isArray(raw.global_invalidations) ? raw.global_invalidations : [],
    cognitive_risks: Array.isArray(raw.cognitive_risks) ? raw.cognitive_risks : [],
    system_actions: {
      should_block_immediate_entry: Boolean(raw.system_actions?.should_block_immediate_entry ?? false),
      should_require_confirmation: Boolean(raw.system_actions?.should_require_confirmation ?? true),
      semi_auto_if_validated: Boolean(raw.system_actions?.semi_auto_if_validated ?? false),
      ...(raw.system_actions || {}),
    },
    ui_summary: raw.ui_summary || {},
  };
}

function normalizeScenario(raw = {}) {
  return {
    name: String(raw.name || ""),
    description: String(raw.description || ""),
    direction: raw.direction || null,
    trigger: {
      rules: Array.isArray(raw.trigger?.rules) ? raw.trigger.rules : [],
      logic: raw.trigger?.logic || "any",
    },
    invalidation: {
      rules: Array.isArray(raw.invalidation?.rules) ? raw.invalidation.rules : [],
      logic: raw.invalidation?.logic || "any",
    },
  };
}
