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
  brainTradeJournal = null,
  learningUpdater,
  getExecutionPacket = () => ({ authority: "manual_only", autoExecutionAllowed: false }),
  getLearningProgress = () => ({}),
  liveGateEvaluator = () => ({ allowed: false, reasons: ["live gate unavailable"] }),
  cooldownMs = 90_000,
} = {}) {
  let activeTrade = null;
  const MIN_PAPER_SIZE = 0.01;

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
      confidence: toNumber(brainVerdict?.confidence, null),
      plan_trade_id: `${nextTradeId()}_plan`,
      armed_at: new Date().toISOString(),
    };
    stateStore.setState({ armed: true, currentPlan: plan, lastAction: "armed", liveBlockedReason: null });
    console.info(`[Executor] Auto-armed setup ${plan.setup_name} (${plan.direction})`);
    emit("executor_armed", { plan }, { context_signature: plan.context_signature });
    if (brainTradeJournal) {
      const planValidation = validateTradeLevels({
        direction: plan.direction,
        entry: toNumber(plan.planned_entry, null),
        stopLoss: toNumber(plan.stop, toNumber(plan.invalidation_price, null)),
        takeProfit: toNumber(plan.target, null),
      });
      if (!planValidation.valid) {
        console.warn("[Executor] Planned trade rejected from journal due to invalid levels.", planValidation.issues);
        return stateStore.getState();
      }
      const status = "planned";
      brainTradeJournal.upsertJournalTrade({
        id: plan.plan_trade_id || `${nextTradeId()}_plan`,
        mode: "paper",
        source: "brain_auto",
        status,
        setup: plan.setup_name,
        direction: plan.direction,
        entry: toNumber(plan.planned_entry, null),
        stopLoss: toNumber(plan.stop, toNumber(plan.invalidation_price, null)),
        takeProfit: toNumber(plan.target, null),
        confidence: plan.confidence,
        tags: Array.isArray(plan.tags) ? plan.tags : [],
        notes: plan.trade_mode === "exploration" ? "Exploratory Paper Trade" : "",
        tradeMeta: {
          mode: "paper",
          type: plan.trade_type || "standard",
          reason: plan.exploration_reason || "planned",
          riskSize: toNumber(plan.risk_profile?.size_multiplier, null),
        },
      });
    }
    return stateStore.getState();
  }

  function cancelArm(reason = "operator_cancel") {
    stateStore.setState({ armed: false, currentPlan: null, lastAction: reason });
    return stateStore.getState();
  }

  function openTrade(plan, price) {
    const tradeId = nextTradeId();
    const entry = toNumber(price, plan.planned_entry);
    const levelValidation = validateTradeLevels({
      direction: plan.direction,
      entry,
      stopLoss: toNumber(plan.stop, toNumber(plan.invalidation_price, null)),
      takeProfit: toNumber(plan.target, null),
    });
    if (!levelValidation.valid) {
      console.warn("[Executor] Trade execution rejected due to invalid levels.", levelValidation.issues);
      emit("trade_blocked", { reason: "invalid_trade_levels", issues: levelValidation.issues }, { context_signature: plan?.context_signature || null });
      return null;
    }
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
      status: "triggered",
      tags: Array.isArray(plan.tags) ? [...plan.tags] : [],
      trade_type: plan.trade_type || "standard",
      reason: plan.exploration_reason || null,
      confidence: toNumber(plan.confidence, null),
    };
    activeTrade = trade;
    stateStore.setState({ activeTradeId: tradeId, armed: false, lastAction: "trade_opened" });
    console.info(`[Executor] Trade opened ${tradeId} ${trade.direction} @ ${trade.entry}`);
    emit("trade_opened", { trade_id: tradeId, mode: trade.mode, direction: trade.direction, entry: trade.entry }, { context_signature: trade.context_signature, tradeId });
    brainTradeJournal?.upsertJournalTrade({
      id: trade.id,
      mode: "paper",
      source: "brain_auto",
      status: "triggered",
      setup: plan.setup_name,
      direction: trade.direction,
      entry: trade.entry,
      stopLoss: trade.stop,
      takeProfit: trade.target,
      confidence: trade.confidence,
      triggeredAt: trade.opened_at,
      notes: trade.trade_type === "exploratory" ? "Exploratory Paper Trade" : "",
      tags: trade.tags,
      tradeMeta: {
        mode: "paper",
        type: trade.trade_type,
        reason: trade.reason || "signal_trigger",
        riskSize: toNumber(plan.risk_profile?.size_multiplier, null),
      },
    });
    return trade;
  }

  function maybeCloseTrade(latestPrice) {
    if (!activeTrade) return null;
    const price = toNumber(latestPrice, null);
    if (price === null) return null;
    activeTrade.bars += 1;
    if (activeTrade.status === "triggered") {
      activeTrade.status = "active";
      brainTradeJournal?.upsertJournalTrade({
        id: activeTrade.id,
        status: "active",
        triggeredAt: activeTrade.opened_at,
        notes: activeTrade.trade_type === "exploratory" ? "Exploratory Paper Trade" : "",
      });
    }
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
    brainTradeJournal?.upsertJournalTrade({
      id: closed.id,
      status: "closed",
      outcome: closed.result,
      resolvedAt: closed.closed_at,
      candlesInTrade: closed.resolution_candles,
      mfe: closed.mfe,
      mae: closed.mae,
      notes: closed.trade_type === "exploratory" ? "Exploratory Paper Trade" : "",
    });
    return closed;
  }

  function evaluateTrigger(plan, candle = {}) {
    const high = toNumber(candle?.high, null);
    const low = toNumber(candle?.low, null);
    const close = toNumber(candle?.close, null);
    const trigger = toNumber(plan.trigger_price, toNumber(plan.planned_entry, null));
    if (trigger === null) return false;
    if (plan.direction === "long") return (high !== null ? high >= trigger : close >= trigger);
    if (plan.direction === "short") return (low !== null ? low <= trigger : close <= trigger);
    return false;
  }

  function normalizeSetupName(name = "") {
    return String(name || "").trim().toLowerCase();
  }

  function isAggressivePaperMode(state = {}, brainVerdict = {}) {
    if (String(state?.mode || "").toLowerCase() !== "paper") return false;
    const uiMode = String(brainVerdict?.brain_mode || brainVerdict?.mode || "").toUpperCase();
    const profile = String(state?.learningProfile?.profile || "").toLowerCase();
    return uiMode === "AGGRESSIVE_PAPER" || profile.includes("aggressive");
  }

  function hasValidSetupDirection({ state, brainVerdict, nextCandlePlan, scenario } = {}) {
    const direction = inferDirection({ ...(nextCandlePlan || {}), ...(scenario || {}), brain_bias: brainVerdict?.bias });
    const setupName = normalizeSetupName(scenario?.name || nextCandlePlan?.posture || "");
    const setupExists = Boolean(setupName) && !setupName.includes("no_trade") && !setupName.includes("chop");
    return { direction, setupName, valid: setupExists && direction !== "none" };
  }

  function ensureFallbackLevels(plan = {}, candle = {}) {
    const fallback = fallbackTradeLevels({ direction: plan.direction }, [candle], candle);
    if (!fallback) return plan;
    let entry = toNumber(plan.planned_entry, toNumber(plan.trigger_price, fallback.currentPrice));
    let stop = toNumber(plan.stop, toNumber(plan.invalidation_price, null));
    let target = toNumber(plan.target, null);

    if (entry === 0) entry = fallback.currentPrice;
    if (!Number.isFinite(entry) || entry <= 0 || stop === 0 || target === 0) {
      entry = fallback.entry;
      stop = fallback.stop;
      target = fallback.target;
    }
    const validation = validateTradeLevels({ direction: plan.direction, entry, stopLoss: stop, takeProfit: target }, [candle], candle);
    if (!validation.valid) {
      console.warn("[Executor] Invalid levels detected. Regenerating fallback.", { issues: validation.issues });
      entry = fallback.entry;
      stop = fallback.stop;
      target = fallback.target;
    }
    const finalValidation = validateTradeLevels({ direction: plan.direction, entry, stopLoss: stop, takeProfit: target }, [candle], candle);
    if (finalValidation.warnings.length) {
      console.warn("[Executor] Trade levels warning.", { warnings: finalValidation.warnings, rr: finalValidation.rr });
    }
    return { ...plan, planned_entry: entry, trigger_price: toNumber(plan.trigger_price, entry), stop, target, risk_reward: finalValidation.rr };
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
    const setupDirection = hasValidSetupDirection({ state, brainVerdict, nextCandlePlan, scenario });
    const noTradeVerdict = String(brainVerdict?.verdict || brainVerdict?.action || "").toUpperCase() === "NO_TRADE" || Boolean(brainVerdict?.no_trade_reason);
    const forcePaperExploratory = isAggressivePaperMode(state, brainVerdict) && noTradeVerdict && setupDirection.valid;
    const shouldAutoArm = !state.armed && ((state.mode === "paper") || state.autoArm) && (hasPlanConfidence(brainVerdict, scenario) || allowExploration || forcePaperExploratory);
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
      if (allowExploration || forcePaperExploratory) {
        const exploratoryDirection = inferDirection({ ...(armedState.currentPlan || {}), ...(scenario || {}), brain_bias: brainVerdict?.bias });
        armedState.currentPlan.trade_mode = "exploration";
        armedState.currentPlan.trade_type = "exploratory";
        armedState.currentPlan.context_maturity = brainVerdict?.context_maturity || "immature";
        armedState.currentPlan.setup_name = `exploratory_${exploratoryDirection === "short" ? "short" : "long"}`;
        armedState.currentPlan.exploration_reason = "learning_collection";
        armedState.currentPlan.confidence = Math.min(toNumber(brainVerdict?.confidence, 0.2), 0.3);
        armedState.currentPlan.tags = ["exploratory", "low_confidence", "high_danger"];
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

    let plan = state.currentPlan || armSetup({ brainVerdict, nextCandlePlan, scenario, contextSignature }).currentPlan;
    plan = ensureFallbackLevels(plan, candle);
    stateStore.setState({ currentPlan: plan });
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

    const operable = canOperate();
    if (!operable.ok) {
      emit("trade_blocked", { reason: operable.reason, details: operable.details || [], risk_profile: riskProfile }, { context_signature: contextSignature || state.currentPlan?.context_signature });
      return { state: stateStore.getState(), activeTrade: null };
    }

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
    if (riskProfile.reason.includes("reduced_by_friction_danger")) console.info("[Risk] Reduced by friction/danger");
    if (riskProfile.reason.includes("boosted_by_familiarity_scenario")) console.info("[Risk] Boosted by familiarity/scenario reliability");
    if (riskProfile.size_multiplier <= 0 && state.mode === "paper") {
      riskProfile.size_multiplier = MIN_PAPER_SIZE;
      riskProfile.capital_fraction = Math.max(MIN_PAPER_SIZE, Number(riskProfile.capital_fraction || 0));
      riskProfile.reason = [...new Set([...(riskProfile.reason || []), "paper_minimum_size_applied"])];
      stateStore.setState({ currentPlan: { ...plan, risk_profile: riskProfile }, lastRiskProfile: riskProfile });
    } else if (riskProfile.size_multiplier <= 0) {
      console.info("[Risk] Blocked in blocked mode");
      emit("trade_blocked", { reason: "risk_profile_zero_size", risk_profile: riskProfile }, { context_signature: plan?.context_signature || contextSignature });
      return { state: stateStore.getState(), activeTrade: null };
    }
    const preExecutionValidation = validateTradeLevels({
      direction: plan.direction,
      entry: plan.planned_entry,
      stopLoss: plan.stop,
      takeProfit: plan.target,
    }, [candle], candle);
    if (!preExecutionValidation.valid) {
      console.warn("[Executor] Blocking trade: invalid levels.", preExecutionValidation.issues);
      const regeneratedPlan = ensureFallbackLevels(plan, candle);
      const regeneratedValidation = validateTradeLevels({
        direction: regeneratedPlan.direction,
        entry: regeneratedPlan.planned_entry,
        stopLoss: regeneratedPlan.stop,
        takeProfit: regeneratedPlan.target,
      }, [candle], candle);
      if (!regeneratedValidation.valid) {
        emit("trade_blocked", { reason: "invalid_trade_levels", issues: regeneratedValidation.issues }, { context_signature: plan?.context_signature || contextSignature });
        return { state: stateStore.getState(), activeTrade: null };
      }
      plan = regeneratedPlan;
      stateStore.setState({ currentPlan: plan });
    }

    if (!evaluateTrigger(plan, candle)) return { state: stateStore.getState(), activeTrade: null };

    const trade = openTrade(plan, candle?.close);
    if (!trade) return { state: stateStore.getState(), activeTrade: null };
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return value;
  return Math.min(max, Math.max(min, value));
}

function computeCandleStats(candles = [], fallbackCandle = {}) {
  const rows = Array.isArray(candles) && candles.length ? candles : [fallbackCandle];
  const highs = rows.map((c) => toNumber(c?.high, null)).filter((v) => Number.isFinite(v));
  const lows = rows.map((c) => toNumber(c?.low, null)).filter((v) => Number.isFinite(v));
  const closes = rows.map((c) => toNumber(c?.close, null)).filter((v) => Number.isFinite(v));
  const candleMin = lows.length ? Math.min(...lows) : (closes.length ? Math.min(...closes) : null);
  const candleMax = highs.length ? Math.max(...highs) : (closes.length ? Math.max(...closes) : null);
  const currentPrice = closes.length ? closes[closes.length - 1] : toNumber(fallbackCandle?.close, null);
  const candleRange = Number.isFinite(candleMin) && Number.isFinite(candleMax) ? Math.max(candleMax - candleMin, 1e-6) : 1e-6;
  return { candleMin, candleMax, currentPrice, candleRange };
}

function fallbackTradeLevels(plan = {}, candles = [], fallbackCandle = {}) {
  const { candleMin, candleMax, currentPrice, candleRange } = computeCandleStats(candles, fallbackCandle);
  if (!Number.isFinite(currentPrice)) return null;
  const buffer = candleRange * 0.5;
  const direction = String(plan?.direction || "long").toLowerCase();
  let entry = currentPrice;
  let stop = direction === "short" ? currentPrice + (candleRange * 0.5) : currentPrice - (candleRange * 0.5);
  let target = direction === "short" ? currentPrice - (candleRange * 1.0) : currentPrice + (candleRange * 1.0);

  if (Number.isFinite(candleMin) && Number.isFinite(candleMax)) {
    entry = clamp(entry, candleMin, candleMax);
    stop = clamp(stop, candleMin - buffer, candleMax + buffer);
    target = clamp(target, candleMin - buffer, candleMax + buffer);
  }

  if (entry === 0) entry = currentPrice;
  if (direction === "short") {
    if (!(target < entry && entry < stop)) {
      target = Math.max(1e-6, entry - (candleRange * 1.0));
      stop = Math.max(entry + 1e-6, entry + (candleRange * 0.5));
    }
  } else if (!(stop < entry && entry < target)) {
    stop = Math.max(1e-6, entry - (candleRange * 0.5));
    target = Math.max(entry + 1e-6, entry + (candleRange * 1.0));
  }

  entry = Math.max(1e-6, entry);
  stop = Math.max(1e-6, stop);
  target = Math.max(1e-6, target);
  return { entry, stop, target, currentPrice, candleRange };
}

function validateTradeLevels(trade = {}, candles = [], fallbackCandle = {}) {
  const direction = String(trade?.direction || "").toLowerCase();
  const entry = toNumber(trade?.entry, null);
  const stopLoss = toNumber(trade?.stopLoss, null);
  const takeProfit = toNumber(trade?.takeProfit, null);
  const { currentPrice, candleRange } = computeCandleStats(candles, fallbackCandle);
  const maxDistance = candleRange * 5;
  const issues = [];
  const warnings = [];

  if (![entry, stopLoss, takeProfit].every((v) => Number.isFinite(v) && v > 0)) issues.push("levels_non_finite_or_non_positive");
  if (direction === "short") {
    if (!(takeProfit < entry && entry < stopLoss)) issues.push("invalid_short_ordering");
  } else if (direction === "long") {
    if (!(stopLoss < entry && entry < takeProfit)) issues.push("invalid_long_ordering");
  } else {
    issues.push("invalid_direction");
  }

  if (Number.isFinite(currentPrice) && Number.isFinite(maxDistance) && maxDistance > 0) {
    if (Math.abs(entry - currentPrice) > maxDistance) issues.push("entry_too_far_from_price");
    if (Math.abs(stopLoss - currentPrice) > maxDistance) issues.push("stop_too_far_from_price");
    if (Math.abs(takeProfit - currentPrice) > maxDistance) issues.push("target_too_far_from_price");
  } else {
    issues.push("invalid_price_context");
  }

  const risk = Number.isFinite(entry) && Number.isFinite(stopLoss) ? Math.abs(entry - stopLoss) : NaN;
  const reward = Number.isFinite(entry) && Number.isFinite(takeProfit) ? Math.abs(entry - takeProfit) : NaN;
  if (!Number.isFinite(risk) || risk <= 0) issues.push("non_positive_risk");
  const rr = Number.isFinite(risk) && risk > 0 && Number.isFinite(reward) ? reward / risk : null;
  if (Number.isFinite(rr) && rr > 50) issues.push("rr_extreme_reject");
  else if (Number.isFinite(rr) && rr > 10) warnings.push("rr_suspicious");

  return { valid: issues.length === 0, issues, warnings, rr };
}
