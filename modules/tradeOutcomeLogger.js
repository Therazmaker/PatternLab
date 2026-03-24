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
  function logClosedTrade({ trade, contextSignature, brainVerdict, scenarioTaken, triggerUsed, takenBy, operatorOverride, result, mfe, mae, resolutionCandles, exitReason } = {}) {
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
