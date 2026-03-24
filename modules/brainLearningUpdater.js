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
    const winRate = counts > 0 ? wins / counts : 0;
    const dangerScore = clamp((Number(current.danger_score || current.dangerScore || 0.45) * 0.75) + (outcome.result === "loss" ? 0.2 : -0.08), 0.05, 0.95);
    const confidenceBias = clamp((Number(current.confidenceAdjustment || 0) * 0.65) + (outcome.result === "win" ? 0.06 : -0.06), -0.3, 0.3);
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

    const updated = brainMemoryStore.upsertContext(signature, {
      ...current,
      context_signature: signature,
      counts,
      wins,
      losses,
      danger_score: Number(dangerScore.toFixed(3)),
      confidenceAdjustment: Number(confidenceBias.toFixed(3)),
      learned_bias: learnedBias,
      preferredPosture,
      scenarioReliability,
      waitLogicEffectiveness: Number(waitLogicEffectiveness.toFixed(3)),
      last_outcomes: [...(Array.isArray(current.last_outcomes) ? current.last_outcomes : []), outcome.result].slice(-8),
      learning_maturity: Number((counts >= 30 ? Math.min(1, 0.55 + winRate * 0.45) : (counts / 30) * 0.55).toFixed(3)),
    }, { context_signature: signature });

    const evt = createBrainEvent("learning_updated", {
      context_signature: signature,
      counts: updated?.counts,
      danger_score: updated?.danger_score,
      confidenceAdjustment: updated?.confidenceAdjustment,
      preferredPosture: updated?.preferredPosture,
    }, { context_signature: signature, tradeId: outcome.trade_id });
    brainMemoryStore.addEvent(evt);
    if (typeof addTimelineEvent === "function") addTimelineEvent(evt);

    return updated;
  }

  return {
    applyTradeLearning,
  };
}
