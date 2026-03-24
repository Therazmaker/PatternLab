const EXECUTOR_MODES = new Set(["paper", "live"]);
const DEFAULT_LEARNING_PROFILE = Object.freeze({
  profile: "aggressive_learning",
  enabled: true,
  paper_only: true,
  exploration_mode: true,
  exploration_bias: 0.7,
  exploitation_bias: 0.3,
  allow_trade_on_wait_in_paper: true,
  allow_high_danger_exploration: true,
  allow_low_confidence_exploration: true,
  min_samples_before_strict_block: 10,
  min_samples_before_context_maturity: 20,
  friction_block_live_only: true,
  danger_block_live_only: true,
  max_exploratory_trades_per_context: 5,
  max_consecutive_losses_before_context_pause: 3,
  context_pause_candles: 5,
  cooldown_candles: 1,
  one_trade_per_candle: true,
  one_active_trade_max: true,
  exploration_entry_quality_floor: "C",
  exploration_requires_trigger: true,
  exploration_requires_invalidation: true,
});

export const DEFAULT_EXECUTOR_STATE = Object.freeze({
  enabled: true,
  mode: "paper",
  autoArm: true,
  cooldownCandles: 1,
  cooldownCandlesRemaining: 0,
  armed: false,
  currentPlan: null,
  activeTradeId: null,
  lastExecutedCandleKey: null,
  lastAction: "idle",
  cooldownUntil: null,
  paused: false,
  liveBlockedReason: null,
  learningProfile: DEFAULT_LEARNING_PROFILE,
});

function normalizeMode(mode = "paper") {
  return EXECUTOR_MODES.has(mode) ? mode : "paper";
}

export function normalizeExecutorState(raw = {}) {
  return {
    enabled: Boolean(raw?.enabled),
    mode: normalizeMode(raw?.mode),
    autoArm: raw?.autoArm !== false,
    cooldownCandles: Math.max(0, Math.floor(Number(raw?.cooldownCandles ?? 1))),
    cooldownCandlesRemaining: Math.max(0, Math.floor(Number(raw?.cooldownCandlesRemaining ?? 0))),
    armed: Boolean(raw?.armed),
    currentPlan: raw?.currentPlan || null,
    activeTradeId: raw?.activeTradeId || null,
    lastExecutedCandleKey: raw?.lastExecutedCandleKey || null,
    lastAction: raw?.lastAction || "idle",
    cooldownUntil: raw?.cooldownUntil || null,
    paused: Boolean(raw?.paused),
    liveBlockedReason: raw?.liveBlockedReason || null,
    learningProfile: { ...DEFAULT_LEARNING_PROFILE, ...(raw?.learningProfile || {}) },
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
