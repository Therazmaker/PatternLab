import { createBrainEvent } from "./brainMemoryStore.js";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowMs() {
  return Date.now();
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

export function createBrainExecutor({
  stateStore,
  brainMemoryStore,
  outcomeLogger,
  learningUpdater,
  getExecutionPacket = () => ({ authority: "manual_only", autoExecutionAllowed: false }),
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
    if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > nowMs()) return { ok: false, reason: "cooldown" };
    const exec = getExecutionPacket();
    if (!exec.autoExecutionAllowed) return { ok: false, reason: "authority_blocked" };
    if (state.mode === "live") {
      const gate = liveGateEvaluator();
      if (!gate.allowed) return { ok: false, reason: "live_mode_blocked", details: gate.reasons };
    }
    return { ok: true };
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
      status: "open",
    };
    activeTrade = trade;
    stateStore.setState({ activeTradeId: tradeId, armed: false, lastAction: "trade_opened" });
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
      cooldownUntil: new Date(nowMs() + cooldownMs).toISOString(),
      lastAction: "trade_closed",
    });

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
    const state = stateStore.getState();
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

    if (!state.armed) return { state, activeTrade: null };

    const operable = canOperate();
    if (!operable.ok) {
      emit("trade_blocked", { reason: operable.reason, details: operable.details || [] }, { context_signature: contextSignature || state.currentPlan?.context_signature });
      return { state: stateStore.getState(), activeTrade: null };
    }

    const plan = state.currentPlan || armSetup({ brainVerdict, nextCandlePlan, scenario, contextSignature }).currentPlan;
    if (!evaluateTrigger(plan, candle)) return { state: stateStore.getState(), activeTrade: null };

    const trade = openTrade(plan, candle?.close);
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
