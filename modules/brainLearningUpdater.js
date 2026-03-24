import { createBrainEvent } from "./brainMemoryStore.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

export function createBrainLearningUpdater({ brainMemoryStore, addTimelineEvent } = {}) {
  function applyTradeLearning(outcome = {}) {
    const signature = outcome.context_signature;
    if (!signature || !brainMemoryStore) return null;
    const snapshot = brainMemoryStore.getSnapshot();
    const current = snapshot.contexts?.[signature] || {};
    const wins = Number(current.wins || 0) + (outcome.result === "win" ? 1 : 0);
    const losses = Number(current.losses || 0) + (outcome.result === "loss" ? 1 : 0);
    const counts = Number(current.counts || 0) + 1;
    const samples = Number(current.samples || current.counts || 0) + 1;
    const winRate = counts > 0 ? wins / counts : 0;
    const dangerScore = clamp((Number(current.danger_score || current.dangerScore || 0.45) * 0.62) + (outcome.result === "loss" ? 0.34 : -0.12), 0.05, 0.99);
    const confidenceBias = clamp((Number(current.confidenceAdjustment || 0) * 0.5) + (outcome.result === "win" ? 0.12 : -0.16), -0.6, 0.6);
    const learnedBias = outcome.result === "win"
      ? (outcome.brain_verdict?.bias || current.learned_bias || "neutral")
      : (current.learned_bias || "neutral");
    const preferredPosture = outcome.result === "win"
      ? (outcome.brain_verdict?.posture || current.preferredPosture || "wait")
      : (current.preferredPosture || "wait");
    const scenarioType = outcome?.scenario_taken?.type || "unknown";
    const scenarioReliability = {
      ...(current.scenarioReliability || {}),
      [scenarioType]: clamp((Number(current.scenarioReliability?.[scenarioType] || 0.5) * 0.7) + (outcome.result === "win" ? 0.22 : -0.18), 0.05, 0.95),
    };

    const waitLogicEffectiveness = clamp((Number(current.waitLogicEffectiveness || 0.5) * 0.82) + (outcome.trigger_used === "wait" ? (outcome.result === "win" ? 0.1 : -0.06) : 0), 0.05, 0.95);

    const outcomesWindow = [...(Array.isArray(current.last_outcomes) ? current.last_outcomes : []), outcome.result].slice(-8);
    const previousConsecutiveLosses = Number(current.consecutive_losses || 0);
    const consecutiveLosses = outcome.result === "loss" ? previousConsecutiveLosses + 1 : 0;
    const maxConsecutiveLossesBeforePause = Number(current.max_consecutive_losses_before_context_pause || 3);
    const contextPauseCandles = Number(current.context_pause_candles || 5);
    const shouldPauseExploration = outcome.trade_mode === "exploration" && consecutiveLosses >= maxConsecutiveLossesBeforePause;
    const explorationPauseRemaining = shouldPauseExploration
      ? Math.max(Number(current.exploration_pause_remaining_candles || 0), contextPauseCandles)
      : Number(current.exploration_pause_remaining_candles || 0);
    const exploratoryTradesTaken = Number(current.exploratory_trades_taken || 0) + (outcome.trade_mode === "exploration" ? 1 : 0);
    const lastThreeLosses = outcomesWindow.slice(-3).length === 3 && outcomesWindow.slice(-3).every((row) => row === "loss");
    const recentLosses = outcomesWindow.slice(-5).filter((row) => row === "loss").length;
    const clusterBlockedCandles = recentLosses >= 3 ? 4 : 0;
    const repeatedLossBlockedCandles = lastThreeLosses ? 6 : 0;
    const blockCandles = Math.max(Number(current.blocked_for_candles || 0), clusterBlockedCandles, repeatedLossBlockedCandles);
    const noTradeReason = blockCandles > 0 ? "repeated_loss_context" : null;

    const updated = brainMemoryStore.upsertContext(signature, {
      ...current,
      context_signature: signature,
      counts,
      samples,
      wins,
      losses,
      winrate: Number(winRate.toFixed(3)),
      danger_score: Number(dangerScore.toFixed(3)),
      confidenceAdjustment: Number(confidenceBias.toFixed(3)),
      learned_bias: learnedBias,
      preferredPosture,
      scenarioReliability,
      waitLogicEffectiveness: Number(waitLogicEffectiveness.toFixed(3)),
      last_outcomes: outcomesWindow,
      blocked_for_candles: blockCandles,
      no_trade_reason: noTradeReason,
      dangerous_context: dangerScore >= 0.75,
      reliable_context: wins >= 4 && (wins / Math.max(counts, 1)) >= 0.62,
      loss_patterns: outcome.result === "loss" ? [...(Array.isArray(current.loss_patterns) ? current.loss_patterns : []), `${outcome.exit_reason || "closed"}|${outcome.trigger_used || "trigger"}`].slice(-12) : (current.loss_patterns || []),
      learning_maturity: Number((counts >= 30 ? Math.min(1, 0.55 + winRate * 0.45) : (counts / 30) * 0.55).toFixed(3)),
      consecutive_losses: consecutiveLosses,
      exploratory_trades_taken: exploratoryTradesTaken,
      exploration_pause_remaining_candles: explorationPauseRemaining,
      max_consecutive_losses_before_context_pause: maxConsecutiveLossesBeforePause,
      context_pause_candles: contextPauseCandles,
    }, { context_signature: signature });
    if (shouldPauseExploration) {
      console.info("[LearningProfile] exploratory context paused after repeated losses");
    }
    if (outcome.result === "loss" && lastThreeLosses) {
      console.info(`[Learning] Repeated loss detected, context blocked (${signature}) for ${blockCandles} candles`);
    }
    console.info(`[Learning] Context updated ${signature} -> danger ${updated?.danger_score} confidence ${updated?.confidenceAdjustment}`);

    const evt = createBrainEvent("learning_updated", {
      context_signature: signature,
      counts: updated?.counts,
      danger_score: updated?.danger_score,
      confidenceAdjustment: updated?.confidenceAdjustment,
      preferredPosture: updated?.preferredPosture,
      blocked_for_candles: updated?.blocked_for_candles || 0,
      no_trade_reason: updated?.no_trade_reason || null,
    }, { context_signature: signature, tradeId: outcome.trade_id });
    brainMemoryStore.addEvent(evt);
    if (typeof addTimelineEvent === "function") addTimelineEvent(evt);

    return updated;
  }

  return {
    applyTradeLearning,
  };
}
