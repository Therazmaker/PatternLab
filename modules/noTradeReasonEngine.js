// noTradeReasonEngine.js
// Defines no-trade reason codes and translates them to human-readable text.

export const NO_TRADE_REASON_CODES = {
  MISSING_TRIGGER:          "missing_trigger",
  ACTIVE_INVALIDATION:      "active_invalidation",
  LOW_CONFIDENCE:           "low_confidence",
  CONFLICTING_SCENARIOS:    "conflicting_scenarios",
  POOR_RR:                  "poor_rr",
  LATE_ENTRY:               "late_entry",
  IMPULSIVE_REENTRY_BLOCK:  "impulsive_reentry_block",
  MOMENTUM_UNCLEAR:         "momentum_unclear",
  STRUCTURE_UNCLEAR:        "structure_unclear",
  ZONE_NOT_CONFIRMED:       "zone_not_confirmed",
  OVEREXTENDED_MOVE:        "overextended_move",
  COGNITIVE_RISK_BLOCK:     "cognitive_risk_block",
};

const REASON_LABELS = {
  missing_trigger:          "Missing trigger",
  active_invalidation:      "Active invalidation",
  low_confidence:           "Low confidence",
  conflicting_scenarios:    "Conflicting scenarios",
  poor_rr:                  "Poor R:R",
  late_entry:               "Late entry",
  impulsive_reentry_block:  "Impulsive re-entry blocked",
  momentum_unclear:         "Unclear momentum",
  structure_unclear:        "Unclear structure",
  zone_not_confirmed:       "Zone not confirmed",
  overextended_move:        "Overextended move",
  cognitive_risk_block:     "Cognitive risk block",
};

const REASON_DESCRIPTIONS = {
  missing_trigger:          "One or more required triggers have not fired yet.",
  active_invalidation:      "An invalidation condition is active, cancelling the setup.",
  low_confidence:           "System confidence is too low to justify entry.",
  conflicting_scenarios:    "Primary and alternate scenarios are in conflict.",
  poor_rr:                  "The risk-to-reward ratio is unfavorable at this entry.",
  late_entry:               "The move has already extended; entry would be chasing.",
  impulsive_reentry_block:  "A recent impulsive move blocks re-entry at this level.",
  momentum_unclear:         "Momentum direction is ambiguous or mixed.",
  structure_unclear:        "Market structure is unclear or in transition.",
  zone_not_confirmed:       "The S/R zone or trigger zone has not been confirmed.",
  overextended_move:        "The move is overextended relative to the reference level.",
  cognitive_risk_block:     "A cognitive bias risk is detected; standing aside.",
};

/**
 * Translate a single reason code to a short label.
 * @param {string} code
 * @returns {string}
 */
export function translateReasonCode(code) {
  return REASON_LABELS[code] || code;
}

/**
 * Translate an array of reason codes to a combined human-readable explanation.
 * @param {string[]} codes
 * @returns {string}
 */
export function translateReasonCodes(codes = []) {
  if (!codes || codes.length === 0) return "No specific reason recorded.";

  // Combined messages for common combinations
  if (codes.includes("active_invalidation") && codes.includes("late_entry")) {
    return "El setup original quedó invalidado y la entrada actual sería tardía.";
  }
  if (codes.includes("missing_trigger") && codes.includes("low_confidence")) {
    return "Triggers requeridos no confirmados; nivel de confianza insuficiente para operar.";
  }
  if (codes.includes("conflicting_scenarios") && codes.includes("structure_unclear")) {
    return "Escenarios en conflicto con estructura de mercado poco clara. Esperar confirmación.";
  }
  if (codes.includes("cognitive_risk_block")) {
    return "Riesgo cognitivo detectado. El sistema recomienda no operar en este contexto.";
  }
  if (codes.includes("active_invalidation")) {
    return "Invalidación activa: el setup ha sido anulado por condiciones adversas.";
  }
  if (codes.includes("missing_trigger")) {
    return "Triggers de entrada pendientes de confirmar.";
  }
  if (codes.includes("low_confidence")) {
    return "Confianza insuficiente. Esperar una señal más clara.";
  }
  if (codes.includes("poor_rr")) {
    return "Relación riesgo/beneficio desfavorable en este nivel.";
  }
  if (codes.includes("overextended_move")) {
    return "El movimiento está sobreextendido. Evitar entrada en momentum.";
  }
  if (codes.includes("momentum_unclear") || codes.includes("structure_unclear")) {
    return "Contexto de mercado ambiguo. Esperar confirmación.";
  }

  // Default: concatenate descriptions
  return codes.map((c) => REASON_DESCRIPTIONS[c] || c).join(" ");
}

/**
 * Derive reason codes from copilot evaluation result and effects.
 * @param {object} evaluation - result from evaluateCopilotFeedback
 * @param {object} effects    - result from buildCopilotFeedbackEffects
 * @param {object} feedback   - normalized copilot feedback
 * @returns {string[]}
 */
export function deriveReasonCodes(evaluation = {}, effects = {}, feedback = null) {
  const codes = new Set();

  if (!evaluation || !effects) return [];

  // Global invalidation
  if (evaluation.globalInvalidated) codes.add("active_invalidation");

  // Primary scenario invalidated
  if (evaluation.primaryStatus === "invalidated") codes.add("active_invalidation");

  // Waiting confirmation = missing triggers
  if (evaluation.primaryStatus === "waiting_confirmation") codes.add("missing_trigger");

  // Conflicting scenarios
  if (
    (evaluation.primaryStatus === "invalidated" && evaluation.alternateStatus === "validated") ||
    (evaluation.primaryStatus === "validated" && evaluation.alternateStatus === "invalidated")
  ) {
    codes.add("conflicting_scenarios");
  }

  // Entry quality blocks
  const verdict = feedback?.copilot_verdict || {};
  if (verdict.entry_quality === "avoid") codes.add("low_confidence");
  if (verdict.entry_quality === "wait" || verdict.entry_quality === "C") codes.add("low_confidence");

  // Map from effects.reasonCodes
  for (const code of effects.reasonCodes || []) {
    if (code === "copilot_global_invalidation")    codes.add("active_invalidation");
    if (code === "copilot_primary_invalidated")    codes.add("active_invalidation");
    if (code === "copilot_waiting_confirmation")   codes.add("missing_trigger");
    if (code === "copilot_entry_quality_avoid")    codes.add("low_confidence");
    if (code === "copilot_entry_quality_weak")     codes.add("low_confidence");
  }

  // Cognitive risks present → cognitive risk block
  if (feedback?.cognitive_risks?.length > 0) {
    codes.add("cognitive_risk_block");
  }

  return [...codes];
}
