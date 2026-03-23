// copilotFeedbackStore.js
// Manages in-memory current copilot feedback and delegates persistence to storage.

import { normalizeCopilotFeedback, validateCopilotFeedback } from "./copilotFeedbackSchema.js";

let _current = null;
let _history = [];
const MAX_HISTORY = 20;

/**
 * Set a new copilot feedback payload as the current one.
 * Pushes the previous current to history.
 * @param {object} payload - already-validated, normalized feedback object
 */
export function setCopilotFeedback(payload) {
  if (_current) {
    _history = [_current, ..._history].slice(0, MAX_HISTORY);
  }
  _current = normalizeCopilotFeedback(payload);
}

/**
 * Return the current copilot feedback, or null.
 * @returns {object|null}
 */
export function getCopilotFeedback() {
  return _current;
}

/**
 * Return the feedback history (newest first).
 * @returns {object[]}
 */
export function getCopilotFeedbackHistory() {
  return [..._history];
}

/**
 * Clear current feedback and history.
 */
export function clearCopilotFeedback() {
  _current = null;
  _history = [];
}

/**
 * Hydrate the store from a persisted state object.
 * @param {{ current: object|null, history: object[] }} state
 */
export function hydrateCopilotFeedbackStore(state = {}) {
  _current = state.current || null;
  _history = Array.isArray(state.history) ? state.history.slice(0, MAX_HISTORY) : [];
}

/**
 * Serialize the store to a plain object for persistence.
 * @returns {{ current: object|null, history: object[] }}
 */
export function serializeCopilotFeedbackStore() {
  return {
    current: _current,
    history: _history.slice(0, MAX_HISTORY),
  };
}

/**
 * Import and validate a raw JSON string or object.
 * Returns { ok, feedback, errors }.
 * @param {string|object} raw
 * @returns {{ ok: boolean, feedback: object|null, errors: string[] }}
 */
export function importCopilotFeedback(raw) {
  let parsed;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ok: false, feedback: null, errors: [`JSON parse error: ${e.message}`] };
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    return { ok: false, feedback: null, errors: ["Input must be a JSON string or object"] };
  }

  const { valid, errors } = validateCopilotFeedback(parsed);
  if (!valid) {
    return { ok: false, feedback: null, errors };
  }

  const feedback = normalizeCopilotFeedback(parsed);
  setCopilotFeedback(feedback);
  return { ok: true, feedback, errors: [] };
}
