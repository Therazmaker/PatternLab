import { createBrainEvent } from "./brainMemoryStore.js";

function toLessonTags(outcome = {}) {
  const tags = [];
  if (outcome.result === "win") tags.push("follow-through-confirmed");
  if (outcome.result === "loss") tags.push("risk-control-needed");
  if (Number(outcome.mae || 0) > Number(outcome.mfe || 0)) tags.push("adverse-pressure");
  if (outcome.exit_reason) tags.push(`exit:${outcome.exit_reason}`);
  return tags.slice(0, 6);
}

export function createTradeOutcomeLogger({ brainMemoryStore, brainTradeJournal, addTimelineEvent } = {}) {
  function logClosedTrade({
    trade,
    contextSignature,
    brainVerdict,
    scenarioTaken,
    triggerUsed,
    takenBy,
    operatorOverride,
    result,
    mfe,
    mae,
    resolutionCandles,
    exitReason,
    tradeMode,
    contextMaturity,
    explorationReason,
    wouldHaveBeenBlockedWithoutLearningMode,
    riskProfile,
  } = {}) {
    if (!trade?.id) return null;
    const payload = {
      trade_id: trade.id,
      context_signature: contextSignature || trade.context_signature || null,
      brain_verdict: brainVerdict || null,
      scenario_taken: scenarioTaken || null,
      trigger_used: triggerUsed || null,
      taken_by: takenBy || "copilot_brain",
      operator_override: operatorOverride || null,
      result: result || trade.result || "unknown",
      mfe: Number(mfe || trade.mfe || 0),
      mae: Number(mae || trade.mae || 0),
      resolution_candles: Number(resolutionCandles || trade.resolution_candles || 0),
      lesson_tags: toLessonTags({ result: result || trade.result, mfe: mfe || trade.mfe, mae: mae || trade.mae, exit_reason: exitReason || trade.exit_reason }),
      exit_reason: exitReason || trade.exit_reason || "closed",
      trade_mode: tradeMode || trade.trade_mode || "standard",
      context_maturity: contextMaturity || trade.context_maturity || "unknown",
      exploration_reason: explorationReason || trade.exploration_reason || null,
      would_have_been_blocked_without_learning_mode: Boolean(wouldHaveBeenBlockedWithoutLearningMode ?? trade.would_have_been_blocked_without_learning_mode),
      risk_mode: riskProfile?.risk_mode || trade?.risk_profile?.risk_mode || "mixed",
      size_multiplier: Number(riskProfile?.size_multiplier ?? trade?.risk_profile?.size_multiplier ?? 0),
      capital_fraction: Number(riskProfile?.capital_fraction ?? trade?.risk_profile?.capital_fraction ?? 0),
      risk_score: Number(riskProfile?.risk_score ?? trade?.risk_profile?.risk_score ?? 0),
      risk_reason: Array.isArray(riskProfile?.reason) ? riskProfile.reason : (Array.isArray(trade?.risk_profile?.reason) ? trade.risk_profile.reason : []),
      sizing_components: riskProfile?.components || trade?.risk_profile?.components || null,
    };

    brainMemoryStore?.appendTrade({
      id: payload.trade_id,
      context_signature: payload.context_signature,
      result: payload.result,
      mfe: payload.mfe,
      mae: payload.mae,
      resolution_candles: payload.resolution_candles,
      exit_reason: payload.exit_reason,
      outcome: { status: "resolved", result: payload.result },
      brain_verdict: payload.brain_verdict,
      scenario_taken: payload.scenario_taken,
      trigger_used: payload.trigger_used,
      taken_by: payload.taken_by,
      operator_override: payload.operator_override,
      lesson_tags: payload.lesson_tags,
      trade_mode: payload.trade_mode,
      context_maturity: payload.context_maturity,
      exploration_reason: payload.exploration_reason,
      would_have_been_blocked_without_learning_mode: payload.would_have_been_blocked_without_learning_mode,
      risk_mode: payload.risk_mode,
      size_multiplier: payload.size_multiplier,
      capital_fraction: payload.capital_fraction,
      risk_score: payload.risk_score,
      risk_reason: payload.risk_reason,
      sizing_components: payload.sizing_components,
    }, {
      context_signature: payload.context_signature,
      tradeId: payload.trade_id,
    });

    const journalRow = brainTradeJournal?.append(payload) || payload;

    const evt = createBrainEvent("trade_closed", {
      trade_id: payload.trade_id,
      result: payload.result,
      lesson_tags: payload.lesson_tags,
      exit_reason: payload.exit_reason,
    }, {
      context_signature: payload.context_signature,
      tradeId: payload.trade_id,
    });
    brainMemoryStore?.addEvent(evt);
    if (typeof addTimelineEvent === "function") addTimelineEvent(evt);

    return journalRow;
  }

  return {
    logClosedTrade,
  };
}
