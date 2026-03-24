const EXECUTOR_MODES = new Set(["paper", "live"]);

export const DEFAULT_EXECUTOR_STATE = Object.freeze({
  enabled: false,
  mode: "paper",
  armed: false,
  currentPlan: null,
  activeTradeId: null,
  lastAction: "idle",
  cooldownUntil: null,
  paused: false,
  liveBlockedReason: null,
});

function normalizeMode(mode = "paper") {
  return EXECUTOR_MODES.has(mode) ? mode : "paper";
}

export function normalizeExecutorState(raw = {}) {
  return {
    enabled: Boolean(raw?.enabled),
    mode: normalizeMode(raw?.mode),
    armed: Boolean(raw?.armed),
    currentPlan: raw?.currentPlan || null,
    activeTradeId: raw?.activeTradeId || null,
    lastAction: raw?.lastAction || "idle",
    cooldownUntil: raw?.cooldownUntil || null,
    paused: Boolean(raw?.paused),
    liveBlockedReason: raw?.liveBlockedReason || null,
  };
}

export function createExecutorStateStore(seed = {}) {
  let state = normalizeExecutorState({ ...DEFAULT_EXECUTOR_STATE, ...seed });

  function getState() {
    return { ...state, currentPlan: state.currentPlan ? { ...state.currentPlan } : null };
  }

  function setState(patch = {}) {
    state = normalizeExecutorState({ ...state, ...patch });
    return getState();
  }

  function reset() {
    state = normalizeExecutorState(DEFAULT_EXECUTOR_STATE);
    return getState();
  }

  return {
    getState,
    setState,
    reset,
  };
}
