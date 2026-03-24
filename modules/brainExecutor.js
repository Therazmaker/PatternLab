import { createBrainEvent } from "./brainMemoryStore.js";
import { computeRiskSizing } from "./riskSizingEngine.js";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowMs() {
  return Date.now();
}

function candleKey(candle = {}) {
  return String(candle?.id || candle?.timestamp || candle?.index || `${candle?.open}_${candle?.high}_${candle?.low}_${candle?.close}`);
}

function nextTradeId() {
  return `brain_trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function inferDirection(plan = {}) {
  const dir = String(plan?.direction || plan?.brain_bias || "").toLowerCase();
  if (["long", "bullish", "up"].includes(dir)) return "long";
  if (["short", "bearish", "down"].includes(dir)) return "short";
  const td = Number(plan?.target_direction || 0);
  if (td > 0) return "long";
  if (td < 0) return "short";
  return "none";
}

function computeOutcome(trade = {}) {
  if (!trade?.entry || !trade?.exit) return "breakeven";
  const pnl = trade.direction === "short" ? trade.entry - trade.exit : trade.exit - trade.entry;
  if (Math.abs(pnl) < 1e-10) return "breakeven";
  return pnl > 0 ? "win" : "loss";
}

function hasPlanConfidence(brainVerdict = {}, scenario = {}) {
  if (!brainVerdict || brainVerdict.allow_trade === false) return false;
  if (String(brainVerdict?.entry_quality || "").toLowerCase() === "wait") return false;
  if (brainVerdict?.no_trade_reason) return false;
  if (scenario?.block_context || scenario?.blocked_reason) return false;
  return true;
}

function qualityRank(quality = "wait") {
  return ({ A: 3, B: 2, C: 1, WAIT: 0 })[String(quality || "wait").toUpperCase()] ?? 0;
}

export function createBrainExecutor({
  stateStore,
  brainMemoryStore,
  outcomeLogger,
  learningUpdater,
  getExecutionPacket = () => ({ authority: "manual_only", autoExecutionAllowed: false }),
  getLearningProgress = () => ({}),
  liveGateEvaluator = () => ({ allowed: false, reasons: ["live gate unavailable"] }),
  cooldownMs = 90_000,
} = {}) {
  let activeTrade = null;

  function emit(type, payload = {}, linkage = {}) {
    const event = createBrainEvent(type, payload, linkage);
    brainMemoryStore?.addEvent(event);
    return event;
  }

  function canOperate() {
    const state = stateStore.getState();
    if (!state.enabled || state.paused) return { ok: false, reason: "executor_disabled" };
    if (state.mode !== "paper") return { ok: false, reason: "real_money_disabled" };
    if (Number(state.cooldownCandlesRemaining || 0) > 0) return { ok: false, reason: "cooldown_candles" };
    if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > nowMs()) return { ok: false, reason: "cooldown" };
    const exec = getExecutionPacket();
    if (!exec.autoExecutionAllowed) return { ok: false, reason: "authority_blocked" };
    if (state.mode === "live") {
      const gate = liveGateEvaluator();
      if (!gate.allowed) return { ok: false, reason: "live_mode_blocked", details: gate.reasons };
    }
    return { ok: true };
  }

  function getContextLearning(signature) {
    if (!signature) return null;
    return brainMemoryStore?.getSnapshot?.().contexts?.[signature] || null;
  }

function shouldAllowExplorationTrade({ brainVerdict = {}, scenario = {}, contextRow = {}, state = {} } = {}) {
  const learningMode = String(brainVerdict?.learning_mode || "").toLowerCase();
  if (learningMode === "blocked") return false;
  if (learningMode !== "exploration") return false;
  const profile = state?.learningProfile || {};
  if (state.mode !== "paper" || !profile.enabled || !profile.exploration_mode) return false;
    if (brainVerdict?.exploration_override_applied === false) return false;
    if (brainVerdict?.exploration_trade_allowed === false) return false;
    const samples = Number(contextRow?.samples || contextRow?.counts || 0);
    if (samples >= Number(profile.min_samples_before_strict_block || 10)) return false;
    if (!profile.allow_trade_on_wait_in_paper) return false;
    if (Number(contextRow?.exploration_pause_remaining_candles || 0) > 0) return false;
    if (
      Number(contextRow?.exploratory_trades_taken || 0) >= Number(profile.max_exploratory_trades_per_context || 5)
    ) return false;
    if (profile.exploration_requires_trigger && !scenario?.trigger && !brainVerdict?.next_candle_plan?.trigger_long && !brainVerdict?.next_candle_plan?.trigger_short) return false;
    if (profile.exploration_requires_invalidation && !scenario?.invalidation && !brainVerdict?.next_candle_plan?.invalidation) return false;
    const floor = qualityRank(profile.exploration_entry_quality_floor || "C");
    return qualityRank(brainVerdict?.entry_quality || "wait") >= floor;
  }

  function armSetup({ brainVerdict, nextCandlePlan, scenario, contextSignature }) {
    const state = stateStore.getState();
    const direction = inferDirection({ ...(nextCandlePlan || {}), ...(scenario || {}), brain_bias: brainVerdict?.bias });
    const plan = {
      direction,
      setup_name: scenario?.name || nextCandlePlan?.posture || "next-candle-setup",
      scenario_primary: scenario || null,
      trigger: scenario?.trigger || nextCandlePlan?.trigger_long || nextCandlePlan?.trigger_short || null,
      trigger_price: toNumber(scenario?.trigger_price, toNumber(nextCandlePlan?.trigger_price, null)),
      invalidation: scenario?.invalidation || nextCandlePlan?.invalidation || null,
      invalidation_price: toNumber(scenario?.invalidation_price, null),
      planned_entry: toNumber(scenario?.start_price, null),
      stop: toNumber(scenario?.invalidation_price, null),
      target: toNumber(scenario?.projected_path?.[2]?.price_mid, null),
      target_direction: toNumber(scenario?.target_direction, direction === "long" ? 1 : direction === "short" ? -1 : 0),
      context_signature: contextSignature || scenario?.context_signature || null,
      brain_verdict_snapshot: brainVerdict || null,
      armed_at: new Date().toISOString(),
    };
    stateStore.setState({ armed: true, currentPlan: plan, lastAction: "armed", liveBlockedReason: null });
    console.info(`[Executor] Auto-armed setup ${plan.setup_name} (${plan.direction})`);
    emit("executor_armed", { plan }, { context_signature: plan.context_signature });
    return stateStore.getState();
  }

  function cancelArm(reason = "operator_cancel") {
    stateStore.setState({ armed: false, currentPlan: null, lastAction: reason });
    return stateStore.getState();
  }

  function openTrade(plan, price) {
    const tradeId = nextTradeId();
    const entry = toNumber(price, plan.planned_entry);
    const trade = {
      id: tradeId,
      mode: stateStore.getState().mode,
      direction: plan.direction,
      entry,
      stop: toNumber(plan.stop, plan.invalidation_price),
      target: toNumber(plan.target, null),
      mfe: 0,
      mae: 0,
      bars: 0,
      opened_at: new Date().toISOString(),
      context_signature: plan.context_signature,
      scenario_taken: plan.scenario_primary,
      trigger_used: plan.trigger,
      brain_verdict: plan.brain_verdict_snapshot,
      trade_mode: plan.trade_mode || "standard",
      context_maturity: plan.context_maturity || "unknown",
      exploration_reason: plan.exploration_reason || null,
      would_have_been_blocked_without_learning_mode: Boolean(plan.would_have_been_blocked_without_learning_mode),
      risk_profile: plan.risk_profile || null,
      status: "open",
    };
    activeTrade = trade;
    stateStore.setState({ activeTradeId: tradeId, armed: false, lastAction: "trade_opened" });
    console.info(`[Executor] Trade opened ${tradeId} ${trade.direction} @ ${trade.entry}`);
    emit("trade_opened", { trade_id: tradeId, mode: trade.mode, direction: trade.direction, entry: trade.entry }, { context_signature: trade.context_signature, tradeId });
    return trade;
  }

  function maybeCloseTrade(latestPrice) {
    if (!activeTrade) return null;
    const price = toNumber(latestPrice, null);
    if (price === null) return null;
    activeTrade.bars += 1;
    const favorable = activeTrade.direction === "short" ? activeTrade.entry - price : price - activeTrade.entry;
    const adverse = activeTrade.direction === "short" ? price - activeTrade.entry : activeTrade.entry - price;
    activeTrade.mfe = Math.max(activeTrade.mfe, favorable);
    activeTrade.mae = Math.max(activeTrade.mae, adverse);

    let exitReason = null;
    if (activeTrade.direction === "long") {
      if (activeTrade.stop !== null && price <= activeTrade.stop) exitReason = "stop";
      else if (activeTrade.target !== null && price >= activeTrade.target) exitReason = "target";
    } else if (activeTrade.direction === "short") {
      if (activeTrade.stop !== null && price >= activeTrade.stop) exitReason = "stop";
      else if (activeTrade.target !== null && price <= activeTrade.target) exitReason = "target";
    }
    if (activeTrade.bars >= 16 && !exitReason) exitReason = "rule_exit";

    if (!exitReason) return null;
    activeTrade.exit = price;
    activeTrade.closed_at = new Date().toISOString();
    activeTrade.exit_reason = exitReason;
    activeTrade.result = computeOutcome(activeTrade);
    activeTrade.resolution_candles = activeTrade.bars;
    activeTrade.status = "closed";

    const closed = { ...activeTrade };
    activeTrade = null;
    stateStore.setState({
      activeTradeId: null,
      currentPlan: null,
      cooldownCandlesRemaining: Math.max(0, Number(stateStore.getState().cooldownCandles || 1)),
      cooldownUntil: new Date(nowMs() + cooldownMs).toISOString(),
      lastAction: "trade_closed",
    });
    console.info(`[Executor] Trade closed ${closed.id} (${closed.result}) via ${closed.exit_reason}`);

    const logged = outcomeLogger?.logClosedTrade({
      trade: closed,
      contextSignature: closed.context_signature,
      brainVerdict: closed.brain_verdict,
      scenarioTaken: closed.scenario_taken,
      triggerUsed: closed.trigger_used,
      takenBy: "copilot_brain",
      operatorOverride: null,
      result: closed.result,
      mfe: closed.mfe,
      mae: closed.mae,
      resolutionCandles: closed.resolution_candles,
      exitReason: closed.exit_reason,
      tradeMode: closed.trade_mode,
      contextMaturity: closed.context_maturity,
      explorationReason: closed.exploration_reason,
      wouldHaveBeenBlockedWithoutLearningMode: closed.would_have_been_blocked_without_learning_mode,
      riskProfile: closed.risk_profile,
    });

    learningUpdater?.applyTradeLearning(logged || closed);
    return closed;
  }

  function evaluateTrigger(plan, candle = {}) {
    const price = toNumber(candle?.close, null);
    if (price === null) return false;
    const trigger = toNumber(plan.trigger_price, null);
    if (trigger === null) return false;
    if (plan.direction === "long") return price >= trigger;
    if (plan.direction === "short") return price <= trigger;
    return false;
  }

  function processCandle({ candle, brainVerdict, nextCandlePlan, scenario, contextSignature } = {}) {
    let state = stateStore.getState();
    const currentCandleKey = candleKey(candle);
    const switchedCandle = state.lastExecutedCandleKey !== currentCandleKey;
    if (switchedCandle) {
      state = stateStore.setState({
        lastExecutedCandleKey: currentCandleKey,
        cooldownCandlesRemaining: Math.max(0, Number(state.cooldownCandlesRemaining || 0) - 1),
      });
    }

    if (state.mode === "live") {
      const gate = liveGateEvaluator();
      if (!gate.allowed) {
        stateStore.setState({ liveBlockedReason: gate.reasons.join("; ") });
        emit("live_mode_blocked", { reasons: gate.reasons }, { context_signature: contextSignature });
      }
    }

    if (activeTrade) {
      maybeCloseTrade(candle?.close);
      return { state: stateStore.getState(), activeTrade: activeTrade ? { ...activeTrade } : null };
    }

    const contextRow = getContextLearning(contextSignature || scenario?.context_signature || state.currentPlan?.context_signature);
    const learningMode = String(brainVerdict?.learning_mode || "mixed").toLowerCase();
    if (learningMode === "blocked") {
      emit("trade_blocked", {
        reason: "auto_shift_blocked",
        mode: learningMode,
        details: brainVerdict?.auto_shift?.reason || [],
      }, { context_signature: contextSignature || contextRow?.context_signature || scenario?.context_signature });
      return { state: stateStore.getState(), activeTrade: null };
    }
    if (contextRow?.exploration_pause_remaining_candles > 0) {
      const remaining = Math.max(0, Number(contextRow.exploration_pause_remaining_candles || 0) - (switchedCandle ? 1 : 0));
      if (remaining !== Number(contextRow.exploration_pause_remaining_candles || 0)) {
        brainMemoryStore?.upsertContext(contextRow.context_signature, {
          ...contextRow,
          exploration_pause_remaining_candles: remaining,
        }, { context_signature: contextRow.context_signature });
      }
    }
    if (contextRow?.blocked_for_candles > 0) {
      const remaining = Math.max(0, Number(contextRow.blocked_for_candles || 0) - (switchedCandle ? 1 : 0));
      if (remaining !== Number(contextRow.blocked_for_candles || 0)) {
        brainMemoryStore?.upsertContext(contextRow.context_signature, {
          ...contextRow,
          blocked_for_candles: remaining,
          no_trade_reason: remaining > 0 ? "repeated_loss_context" : null,
        }, { context_signature: contextRow.context_signature });
      }
      emit("trade_blocked", {
        reason: "repeated_loss_context",
        blocked_for_candles: remaining,
      }, { context_signature: contextRow.context_signature });
      return { state: stateStore.getState(), activeTrade: null };
    }

    const allowExploration = shouldAllowExplorationTrade({ brainVerdict, scenario, contextRow, state });
    const shouldAutoArm = !state.armed && state.autoArm && (hasPlanConfidence(brainVerdict, scenario) || allowExploration);
    if (shouldAutoArm) {
      const armedState = armSetup({
        brainVerdict: {
          ...(brainVerdict || {}),
          no_trade_reason: allowExploration ? null : brainVerdict?.no_trade_reason,
          posture: allowExploration ? "execute_on_confirmation" : brainVerdict?.posture,
        },
        nextCandlePlan,
        scenario,
        contextSignature,
      });
      if (allowExploration) {
        const exploratoryDirection = inferDirection({ ...(armedState.currentPlan || {}), ...(scenario || {}), brain_bias: brainVerdict?.bias });
        armedState.currentPlan.trade_mode = "exploration";
        armedState.currentPlan.context_maturity = brainVerdict?.context_maturity || "immature";
        armedState.currentPlan.setup_name = `exploratory_${exploratoryDirection === "short" ? "short" : "long"}`;
        armedState.currentPlan.exploration_reason = "explore_to_learn";
        armedState.currentPlan.would_have_been_blocked_without_learning_mode = true;
        stateStore.setState({ currentPlan: armedState.currentPlan });
        console.info("[LearningProfile] Exploration override applied");
      } else if (learningMode === "mixed") {
        armedState.currentPlan.trade_mode = "mixed";
        armedState.currentPlan.confirmation_required = "moderate";
        stateStore.setState({ currentPlan: armedState.currentPlan });
        console.info("[Learning] mode mixed allows execution");
      } else if (learningMode === "exploitation") {
        armedState.currentPlan.trade_mode = "exploitation";
        armedState.currentPlan.confirmation_required = "strong";
        stateStore.setState({ currentPlan: armedState.currentPlan });
      }
      state = armedState;
      emit("executor_auto_arm", { reason: "valid_setup_detected", setup: armedState?.currentPlan?.setup_name }, { context_signature: contextSignature || armedState?.currentPlan?.context_signature });
    }

    if (!state.armed) return { state, activeTrade: null };

    const operable = canOperate();
    if (!operable.ok) {
      emit("trade_blocked", { reason: operable.reason, details: operable.details || [] }, { context_signature: contextSignature || state.currentPlan?.context_signature });
      return { state: stateStore.getState(), activeTrade: null };
    }

    const plan = state.currentPlan || armSetup({ brainVerdict, nextCandlePlan, scenario, contextSignature }).currentPlan;
    if (learningMode === "exploitation") {
      const friction = Number(brainVerdict?.friction ?? 1);
      const triggerPresent = Boolean(plan.trigger || brainVerdict?.next_candle_plan?.trigger_long || brainVerdict?.next_candle_plan?.trigger_short);
      const invalidationPresent = Boolean(plan.invalidation || brainVerdict?.next_candle_plan?.invalidation);
      if (friction > 0.68 || !triggerPresent || !invalidationPresent) {
        emit("trade_blocked", {
          reason: "exploitation_confirmation_failed",
          friction,
          triggerPresent,
          invalidationPresent,
        }, { context_signature: plan?.context_signature || contextSignature });
        return { state: stateStore.getState(), activeTrade: null };
      }
    }
    if (plan.trade_mode === "exploration" && Number(contextRow?.exploration_pause_remaining_candles || 0) > 0) {
      console.info("[LearningProfile] exploratory context paused after repeated losses");
      emit("trade_blocked", { reason: "exploration_context_paused", remaining: Number(contextRow?.exploration_pause_remaining_candles || 0) }, { context_signature: plan?.context_signature || contextSignature });
      return { state: stateStore.getState(), activeTrade: null };
    }
    if (state.lastExecutedCandleKey === currentCandleKey && state.lastAction === "trade_opened") {
      emit("trade_blocked", { reason: "duplicate_candle_trade_prevented", candle_key: currentCandleKey }, { context_signature: plan?.context_signature || contextSignature });
      return { state: stateStore.getState(), activeTrade: null };
    }
    const executionPacket = getExecutionPacket();
    const riskProfile = computeRiskSizing({
      brainVerdict: plan.brain_verdict_snapshot || brainVerdict,
      autoShift: plan.brain_verdict_snapshot?.auto_shift || brainVerdict?.auto_shift || {},
      contextMemory: contextRow || {},
      learningProgress: getLearningProgress() || {},
      scenarioReliability: plan.scenario_primary?.reliability,
      executorMode: state.mode,
      scenario: plan.scenario_primary || scenario || {},
      executionPacket,
      config: {
        learningProfile: state.learningProfile,
      },
    });
    plan.risk_profile = riskProfile;
    stateStore.setState({ currentPlan: plan, lastRiskProfile: riskProfile });
    console.info(`[Risk] Mode = ${riskProfile.risk_mode}, size = ${riskProfile.size_multiplier.toFixed(2)}`);
    if (riskProfile.reason.includes("reduced_by_friction_danger")) console.info("[Risk] Reduced by friction/danger");
    if (riskProfile.reason.includes("boosted_by_familiarity_scenario")) console.info("[Risk] Boosted by familiarity/scenario reliability");
    if (riskProfile.size_multiplier <= 0) {
      console.info("[Risk] Blocked in blocked mode");
      emit("trade_blocked", { reason: "risk_profile_zero_size", risk_profile: riskProfile }, { context_signature: plan?.context_signature || contextSignature });
      return { state: stateStore.getState(), activeTrade: null };
    }
    if (!evaluateTrigger(plan, candle)) return { state: stateStore.getState(), activeTrade: null };

    const trade = openTrade(plan, candle?.close);
    if (plan.trade_mode === "exploration") {
      console.info("[Executor] Exploratory trade executed");
      console.info("[Executor] Exploratory trade opened");
    }
    stateStore.setState({ lastExecutedCandleKey: currentCandleKey });
    emit("executor_trade_context", {
      trigger_confirmed: true,
      setup: plan.setup_name,
      context_signature: plan.context_signature,
      brain_verdict: plan.brain_verdict_snapshot,
    }, { context_signature: plan.context_signature, tradeId: trade.id });
    return { state: stateStore.getState(), activeTrade: { ...trade } };
  }

  function getActiveTrade() {
    return activeTrade ? { ...activeTrade } : null;
  }

  return {
    armSetup,
    cancelArm,
    processCandle,
    getActiveTrade,
  };
}
