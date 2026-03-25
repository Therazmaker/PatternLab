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
  intrabarPolicy = {
    allowSameCandleExit: false,
    sameBarTouchRule: "stop_first",
  },
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

  function armSetup({ brainVerdict, nextCandlePlan, scenario, contextSignature, candle }) {
    const state = stateStore.getState();
    const direction = inferDirection({ ...(nextCandlePlan || {}), ...(scenario || {}), brain_bias: brainVerdict?.bias });
    const fallback = fallbackTradeLevels({ direction }, [candle], candle);
    const plan = {
      direction,
      setup_name: scenario?.name || nextCandlePlan?.posture || "next-candle-setup",
      scenario_primary: scenario || null,
      trigger: scenario?.trigger || nextCandlePlan?.trigger_long || nextCandlePlan?.trigger_short || null,
      trigger_price: toNumber(scenario?.trigger_price, toNumber(nextCandlePlan?.trigger_price, null)),
      invalidation: scenario?.invalidation || nextCandlePlan?.invalidation || null,
      invalidation_price: toNumber(scenario?.invalidation_price, null),
      planned_entry: toNumber(scenario?.start_price, toNumber(fallback?.entry, null)),
      stop: toNumber(scenario?.invalidation_price, toNumber(fallback?.stop, null)),
      target: toNumber(scenario?.projected_path?.[2]?.price_mid, toNumber(fallback?.target, null)),
      target_direction: toNumber(scenario?.target_direction, direction === "long" ? 1 : direction === "short" ? -1 : 0),
      context_signature: contextSignature || scenario?.context_signature || null,
      brain_verdict_snapshot: brainVerdict || null,
      confidence: toNumber(brainVerdict?.confidence, null),
      plan_trade_id: `${nextTradeId()}_plan`,
      armed_at: new Date().toISOString(),
      trade_type: "exploratory",
      trade_mode: "exploration",
    };
    const sanitizedPlan = ensureFallbackLevels(plan, candle);
    stateStore.setState({ armed: true, currentPlan: plan, lastAction: "armed", liveBlockedReason: null });
    stateStore.setState({ currentPlan: sanitizedPlan });
    console.info(`[Executor] created trade plan ${sanitizedPlan.plan_trade_id} ${sanitizedPlan.direction} entry=${sanitizedPlan.planned_entry} sl=${sanitizedPlan.stop} tp=${sanitizedPlan.target}`);
    emit("executor_armed", { plan: sanitizedPlan }, { context_signature: sanitizedPlan.context_signature });
    if (brainTradeJournal) {
      const planValidation = validateTradeLevels({
        direction: sanitizedPlan.direction,
        entry: toNumber(sanitizedPlan.planned_entry, null),
        stopLoss: toNumber(sanitizedPlan.stop, toNumber(sanitizedPlan.invalidation_price, null)),
        takeProfit: toNumber(sanitizedPlan.target, null),
      });
      logTradeAttempt("journal_plan_insert", {
        entry: toNumber(sanitizedPlan.planned_entry, null),
        stopLoss: toNumber(sanitizedPlan.stop, toNumber(sanitizedPlan.invalidation_price, null)),
        takeProfit: toNumber(sanitizedPlan.target, null),
      }, planValidation);
      if (!planValidation.valid) {
        console.warn("[Executor] Planned trade rejected from journal due to invalid levels.", planValidation.issues);
        return stateStore.getState();
      }
      const status = "planned";
      brainTradeJournal.upsertJournalTrade({
        id: sanitizedPlan.plan_trade_id || `${nextTradeId()}_plan`,
        mode: "paper",
        source: "brain_auto",
        type: "exploratory",
        status,
        setup: sanitizedPlan.setup_name,
        direction: sanitizedPlan.direction,
        entry: toNumber(sanitizedPlan.planned_entry, null),
        stopLoss: toNumber(sanitizedPlan.stop, toNumber(sanitizedPlan.invalidation_price, null)),
        takeProfit: toNumber(sanitizedPlan.target, null),
        confidence: sanitizedPlan.confidence,
        createdAt: sanitizedPlan.armed_at,
        tags: Array.isArray(sanitizedPlan.tags) ? sanitizedPlan.tags : [],
        notes: sanitizedPlan.trade_mode === "exploration" ? "Exploratory Paper Trade" : "",
        tradeMeta: {
          mode: "paper",
          type: sanitizedPlan.trade_type || "exploratory",
          reason: sanitizedPlan.exploration_reason || "planned",
          riskSize: toNumber(sanitizedPlan.risk_profile?.size_multiplier, null),
        },
      });
    }
    return stateStore.getState();
  }

  function cancelArm(reason = "operator_cancel") {
    stateStore.setState({ armed: false, currentPlan: null, lastAction: reason });
    return stateStore.getState();
  }

  function openTrade(plan, price, candle = {}) {
    const tradeId = nextTradeId();
    const entry = toNumber(price, plan.planned_entry);
    const levelValidation = validateTradeLevels({
      direction: plan.direction,
      entry,
      stopLoss: toNumber(plan.stop, toNumber(plan.invalidation_price, null)),
      takeProfit: toNumber(plan.target, null),
    });
    logTradeAttempt("execute_trade", {
      entry,
      stopLoss: toNumber(plan.stop, toNumber(plan.invalidation_price, null)),
      takeProfit: toNumber(plan.target, null),
    }, levelValidation);
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
      status: "active",
      tags: Array.isArray(plan.tags) ? [...plan.tags] : [],
      trade_type: plan.trade_type || "standard",
      reason: plan.exploration_reason || null,
      confidence: toNumber(plan.confidence, null),
      opened_candle_key: candleKey(candle),
      opened_candle_index: Number.isFinite(Number(candle?.index)) ? Number(candle.index) : null,
    };
    activeTrade = trade;
    stateStore.setState({ activeTradeId: tradeId, armed: false, lastAction: "trade_opened" });
    console.info(`[Executor] trigger event ${tradeId} ${trade.direction} @ ${trade.entry}`);
    emit("trade_opened", { trade_id: tradeId, mode: trade.mode, direction: trade.direction, entry: trade.entry }, { context_signature: trade.context_signature, tradeId });
    brainTradeJournal?.upsertJournalTrade({
      id: trade.id,
      mode: "paper",
      source: "brain_auto",
      type: trade.trade_type,
      status: "active",
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

  function maybeCloseTrade(candle = {}) {
    if (!activeTrade) return null;
    const high = toNumber(candle?.high, null);
    const low = toNumber(candle?.low, null);
    const close = toNumber(candle?.close, null);
    const price = toNumber(close, null);
    if (price === null) return null;
    const currentCandleKey = candleKey(candle);
    if (!intrabarPolicy?.allowSameCandleExit && activeTrade.opened_candle_key === currentCandleKey) return null;
    activeTrade.bars += 1;
    const favorablePoint = activeTrade.direction === "short" ? (Number.isFinite(low) ? low : price) : (Number.isFinite(high) ? high : price);
    const adversePoint = activeTrade.direction === "short" ? (Number.isFinite(high) ? high : price) : (Number.isFinite(low) ? low : price);
    const favorable = activeTrade.direction === "short" ? activeTrade.entry - favorablePoint : favorablePoint - activeTrade.entry;
    const adverse = activeTrade.direction === "short" ? adversePoint - activeTrade.entry : activeTrade.entry - adversePoint;
    activeTrade.mfe = Math.max(activeTrade.mfe, favorable);
    activeTrade.mae = Math.max(activeTrade.mae, adverse);

    let exitReason = null;
    let stopHit = false;
    let targetHit = false;
    if (activeTrade.direction === "long") {
      stopHit = activeTrade.stop !== null && Number.isFinite(low) && low <= activeTrade.stop;
      targetHit = activeTrade.target !== null && Number.isFinite(high) && high >= activeTrade.target;
    } else if (activeTrade.direction === "short") {
      stopHit = activeTrade.stop !== null && Number.isFinite(high) && high >= activeTrade.stop;
      targetHit = activeTrade.target !== null && Number.isFinite(low) && low <= activeTrade.target;
    }
    if (stopHit && targetHit) {
      const rule = String(intrabarPolicy?.sameBarTouchRule || "stop_first").toLowerCase();
      const stopPreferred = rule !== "target_first";
      exitReason = stopPreferred ? "ambiguous_intrabar_stop_first" : "ambiguous_intrabar_target_first";
      activeTrade.intrabar_ambiguity = true;
      activeTrade.intrabar_resolution_rule = stopPreferred ? "stop_first" : "target_first";
      if (stopPreferred) activeTrade.exit = activeTrade.stop;
      else activeTrade.exit = activeTrade.target;
    } else if (stopHit) {
      exitReason = "stop";
    } else if (targetHit) {
      exitReason = "target";
    }
    if (activeTrade.bars >= 16 && !exitReason) exitReason = "rule_exit";

    if (!exitReason) return null;
    if (!Number.isFinite(activeTrade.exit)) activeTrade.exit = price;
    activeTrade.closed_at = new Date().toISOString();
    activeTrade.exit_reason = exitReason;
    activeTrade.result = computeOutcome(activeTrade);
    activeTrade.resolution_candles = activeTrade.bars;
    activeTrade.time_in_trade_sec = Math.max(0, Math.round((new Date(activeTrade.closed_at).getTime() - new Date(activeTrade.opened_at).getTime()) / 1000));
    activeTrade.resolved_candle_index = Number.isFinite(Number(candle?.index)) ? Number(candle.index) : null;
    activeTrade.instant_resolution = activeTrade.opened_candle_key === currentCandleKey || activeTrade.opened_at === activeTrade.closed_at;
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
    console.info(`[Executor] close event ${closed.id} (${closed.result}) via ${closed.exit_reason}`);

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
      timeInTradeSec: closed.time_in_trade_sec,
      mfe: closed.mfe,
      mae: closed.mae,
      notes: closed.trade_type === "exploratory" ? "Exploratory Paper Trade" : "",
      tradeMeta: {
        triggeredCandleIndex: closed.opened_candle_index,
        resolvedCandleIndex: closed.resolved_candle_index,
        instant_resolution: Boolean(closed.instant_resolution),
        ambiguous_intrabar: Boolean(closed.intrabar_ambiguity),
        intrabar_resolution_rule: closed.intrabar_resolution_rule || null,
      },
    });
    return closed;
  }

  function evaluateTrigger(plan, candle = {}) {
    const high = toNumber(candle?.high, null);
    const low = toNumber(candle?.low, null);
    const close = toNumber(candle?.close, null);
    const entry = toNumber(plan.planned_entry, toNumber(plan.trigger_price, null));
    if (entry === null) return false;
    if (Number.isFinite(high) && Number.isFinite(low)) return low <= entry && high >= entry;
    if (plan.direction === "long") return close >= entry;
    if (plan.direction === "short") return close <= entry;
    return false;
  }

  function normalizeSetupName(name = "") {
    return String(name || "").trim().toLowerCase();
  }

  function hasValidSetupDirection({ state, brainVerdict, nextCandlePlan, scenario } = {}) {
    const direction = inferDirection({ ...(nextCandlePlan || {}), ...(scenario || {}), brain_bias: brainVerdict?.bias });
    const setupName = normalizeSetupName(scenario?.name || nextCandlePlan?.posture || "");
    const setupExists = Boolean(setupName) && !setupName.includes("no_trade") && !setupName.includes("chop");
    return { direction, setupName, valid: setupExists && direction !== "none" };
  }

  function logTradeAttempt(stage = "attempt", payload = {}, validation = null) {
    const issues = Array.isArray(validation?.issues) ? validation.issues : [];
    console.info(`[Executor][TradeAttempt] ${stage}`, {
      entry: payload.entry,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
      valid: validation ? validation.valid : null,
      reason: validation ? (issues.length ? issues.join(",") : "valid") : null,
    });
  }

  function ensureFallbackLevels(plan = {}, candle = {}) {
    const fallback = fallbackTradeLevels({ direction: plan.direction }, [candle], candle);
    if (!fallback) return plan;

    const currentPrice = fallback.currentPrice;
    const maxDistance = fallback.candleRange * 2;
    let entry = toNumber(plan.planned_entry, toNumber(plan.trigger_price, currentPrice));
    let stop = toNumber(plan.stop, toNumber(plan.invalidation_price, null));
    let target = toNumber(plan.target, null);

    if (!Number.isFinite(entry) || entry <= 0) entry = currentPrice;

    const hasInvalidLevel = [entry, stop, target].some((v) => !Number.isFinite(v) || v <= 0);
    const hasNegativeLevel = [entry, stop, target].some((v) => Number.isFinite(v) && v < 0);
    const initialValidation = validateTradeLevels({ direction: plan.direction, entry, stopLoss: stop, takeProfit: target }, [candle], candle);
    logTradeAttempt("sanitize_initial", { entry, stopLoss: stop, takeProfit: target }, initialValidation);

    if (hasInvalidLevel || hasNegativeLevel || !initialValidation.valid) {
      entry = fallback.entry;
      stop = fallback.stop;
      target = fallback.target;
      console.warn("[Executor] Invalid trade levels detected. Regenerated from fallback.", {
        hasInvalidLevel,
        hasNegativeLevel,
        issues: initialValidation.issues,
      });
    }

    if (Number.isFinite(currentPrice) && Number.isFinite(maxDistance) && maxDistance > 0) {
      if (Math.abs(entry - currentPrice) > maxDistance) {
        entry = currentPrice;
      }
    }

    let validation = validateTradeLevels({ direction: plan.direction, entry, stopLoss: stop, takeProfit: target }, [candle], candle);
    if (!validation.valid) {
      entry = fallback.entry;
      stop = fallback.stop;
      target = fallback.target;
      validation = validateTradeLevels({ direction: plan.direction, entry, stopLoss: stop, takeProfit: target }, [candle], candle);
    }
    logTradeAttempt("sanitize_final", { entry, stopLoss: stop, takeProfit: target }, validation);

    if (validation.warnings.length) {
      console.warn("[Executor] Trade levels warning.", { warnings: validation.warnings, rr: validation.rr });
    }
    return { ...plan, planned_entry: entry, trigger_price: toNumber(plan.trigger_price, entry), stop, target, risk_reward: validation.rr };
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
      maybeCloseTrade(candle);
      return { state: stateStore.getState(), activeTrade: activeTrade ? { ...activeTrade } : null };
    }

    const contextRow = getContextLearning(contextSignature || scenario?.context_signature || state.currentPlan?.context_signature);
    const learningMode = String(brainVerdict?.learning_mode || "mixed").toLowerCase();
    if (learningMode === "blocked" && state.mode !== "paper") {
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
    if (contextRow?.blocked_for_candles > 0 && state.mode !== "paper") {
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
    const forcePaperExploratory = state.mode === "paper" && setupDirection.direction !== "none";
    const shouldAutoArm = !state.armed && ((state.mode === "paper" && setupDirection.direction !== "none") || (state.autoArm && (hasPlanConfidence(brainVerdict, scenario) || allowExploration || forcePaperExploratory)));
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
        candle,
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

    let plan = state.currentPlan || armSetup({ brainVerdict, nextCandlePlan, scenario, contextSignature, candle }).currentPlan;
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

    if (learningMode === "exploitation" && state.mode !== "paper") {
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
    if (plan.trade_mode === "exploration" && Number(contextRow?.exploration_pause_remaining_candles || 0) > 0 && state.mode !== "paper") {
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
    logTradeAttempt("pre_execution", { entry: plan.planned_entry, stopLoss: plan.stop, takeProfit: plan.target }, preExecutionValidation);
    if (!preExecutionValidation.valid && state.mode !== "paper") {
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

    const trade = openTrade(plan, candle?.close, candle);
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
  const { currentPrice, candleRange } = computeCandleStats(candles, fallbackCandle);
  if (!Number.isFinite(currentPrice)) return null;
  const direction = String(plan?.direction || "long").toLowerCase();

  const entry = currentPrice;
  const stop = direction === "short"
    ? currentPrice + (candleRange * 0.5)
    : currentPrice - (candleRange * 0.5);
  const target = direction === "short"
    ? currentPrice - (candleRange * 1.0)
    : currentPrice + (candleRange * 1.0);

  return {
    entry: Math.max(1e-6, entry),
    stop: Math.max(1e-6, stop),
    target: Math.max(1e-6, target),
    currentPrice,
    candleRange,
  };
}

function validateTradeLevels(trade = {}, candles = [], fallbackCandle = {}) {
  const direction = String(trade?.direction || "").toLowerCase();
  const entry = toNumber(trade?.entry, null);
  const stopLoss = toNumber(trade?.stopLoss, null);
  const takeProfit = toNumber(trade?.takeProfit, null);
  const { currentPrice, candleRange } = computeCandleStats(candles, fallbackCandle);
  const maxDistance = candleRange * 2;
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
  if (Number.isFinite(rr) && rr > 20) warnings.push("rr_suspicious");
  const normalizedRr = Number.isFinite(rr) ? Math.min(rr, 20) : null;

  return { valid: issues.length === 0, issues, warnings, rr: normalizedRr };
}
