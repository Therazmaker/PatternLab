export const OPERATOR_ACTION_TYPES = Object.freeze([
  "approve",
  "veto",
  "still_short",
  "still_long",
  "pullback_only",
  "reversal_confirmed",
  "needs_confirmation",
  "resistance_active",
  "support_active",
  "override_long",
  "override_short",
  "none",
]);

export const OPERATOR_DIRECTIONS = Object.freeze(["LONG", "SHORT", "NONE"]);
export const DECISION_STATES = Object.freeze(["ALLOW", "WARN", "BLOCK", "REQUIRES_MANUAL_CONFIRMATION"]);

export function isValidOperatorActionType(actionType) {
  return OPERATOR_ACTION_TYPES.includes(String(actionType || "").trim().toLowerCase());
}

export function normalizeOperatorActionType(actionType, fallback = "none") {
  const normalized = String(actionType || "").trim().toLowerCase();
  return isValidOperatorActionType(normalized) ? normalized : fallback;
}

export function normalizeDirection(direction, fallback = "NONE") {
  const normalized = String(direction || "").trim().toUpperCase();
  return OPERATOR_DIRECTIONS.includes(normalized) ? normalized : fallback;
}

export function normalizeDecisionState(decision, fallback = "WARN") {
  const normalized = String(decision || "").trim().toUpperCase();
  return DECISION_STATES.includes(normalized) ? normalized : fallback;
}
