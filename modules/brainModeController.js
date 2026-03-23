const VALID_MODES = ["observer", "copilot", "executor"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

export function createBrainModeController(initial = {}) {
  let state = {
    mode: VALID_MODES.includes(initial.mode) ? initial.mode : "copilot",
    autoExecutionEnabled: Boolean(initial.autoExecutionEnabled ?? false),
    manualBiasOverride: initial.manualBiasOverride || null,
    approvedAt: null,
    lastAction: "idle",
  };

  function setMode(mode) {
    if (!VALID_MODES.includes(mode)) return state;
    state.mode = mode;
    if (mode !== "executor") state.autoExecutionEnabled = false;
    state.lastAction = `mode:${mode}`;
    return state;
  }

  return {
    getState: () => ({ ...state }),
    setMode,
    setManualBiasOverride: (bias = null) => {
      const normalized = ["long", "short", "neutral", null].includes(bias) ? bias : null;
      state.manualBiasOverride = normalized;
      state.lastAction = normalized ? `manual_bias:${normalized}` : "manual_bias:clear";
      return { ...state };
    },
    approveSuggestion: () => {
      state.approvedAt = new Date().toISOString();
      state.lastAction = "approve_suggestion";
      return { ...state };
    },
    wait: () => {
      state.lastAction = "wait";
      return { ...state };
    },
    invalidateIdea: () => {
      state.lastAction = "invalidate_idea";
      return { ...state };
    },
    setExecutorEnabled: (enabled) => {
      const safeEnabled = Boolean(enabled);
      state.autoExecutionEnabled = safeEnabled && state.mode === "executor";
      state.lastAction = safeEnabled ? "executor_enabled" : "executor_disabled";
      return { ...state };
    },
    applyFrictionDegradation: (score = 0, confidence = 0) => {
      const friction = clamp(score, 0, 1);
      const degraded = clamp(confidence - (friction * 0.35), 0, 1);
      return { friction, confidence: degraded };
    },
  };
}
