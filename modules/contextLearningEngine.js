import { getLearningModel } from "./learningEngine.js";
import { getCopilotFeedback, getCopilotFeedbackHistory } from "./copilotFeedbackStore.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function buildSignature(ctx = {}) {
  const regime = ctx.regime || "unknown";
  const position = ctx.structurePosition || "mid";
  const volatility = ctx.volatility || "normal";
  const momentum = ctx.momentum || "flat";
  const compression = ctx.isCompression ? "compression" : "free";
  return [regime, position, volatility, momentum, compression].join("+");
}

function ensureContextStore(model = {}) {
  return model.learnedContexts && typeof model.learnedContexts === "object" ? model.learnedContexts : {};
}

function inferFeedbackOutcome(feedback = null) {
  if (!feedback) return "neutral";
  const summary = String(feedback?.copilot_verdict?.headline || "").toLowerCase();
  if (summary.includes("loss") || summary.includes("invalidated") || summary.includes("failed")) return "loss";
  if (summary.includes("win") || summary.includes("validated")) return "win";
  return "neutral";
}

export function ingestLearningFromFeedback(marketContext = {}, runtime = {}) {
  const model = getLearningModel();
  const learnedContexts = ensureContextStore(model);
  const signature = buildSignature(marketContext);
  const currentFeedback = getCopilotFeedback();
  const history = getCopilotFeedbackHistory();
  const all = [currentFeedback, ...history].filter(Boolean).slice(0, 24);

  const inferredOutcome = inferFeedbackOutcome(all[0]);
  const record = learnedContexts[signature] || {
    signature,
    counts: 0,
    wins: 0,
    losses: 0,
    winLossRatio: 0,
    penalty: 0,
    boost: 0,
    preferredPosture: "wait",
    confidenceAdjustment: 0,
    lastSeen: null,
    linkedRules: [],
  };

  const invalidations = Number(runtime.invalidationsInContext || 0);
  const overrides = Number(runtime.humanOverrideHits || 0);
  const penalties = clamp(record.penalty + invalidations * 0.06 + (inferredOutcome === "loss" ? 0.08 : 0), 0, 0.8);
  const boosts = clamp(record.boost + (inferredOutcome === "win" ? 0.06 : 0) + (runtime.confirmedBias === record.preferredPosture ? 0.03 : 0), 0, 0.6);

  const nextCounts = record.counts + 1;
  const nextWins = record.wins + (inferredOutcome === "win" ? 1 : 0);
  const nextLosses = record.losses + (inferredOutcome === "loss" ? 1 : 0);
  const ratio = nextLosses ? Number((nextWins / nextLosses).toFixed(3)) : Number(nextWins > 0 ? nextWins : 0);

  const confidenceAdjustment = clamp((boosts - penalties) + (overrides * -0.03), -0.45, 0.35);

  const current = {
    ...record,
    counts: nextCounts,
    wins: nextWins,
    losses: nextLosses,
    winLossRatio: ratio,
    penalty: Number(penalties.toFixed(3)),
    boost: Number(boosts.toFixed(3)),
    confidenceAdjustment: Number(confidenceAdjustment.toFixed(3)),
    preferredPosture: runtime.confirmedBias || record.preferredPosture || "wait",
    lastSeen: new Date().toISOString(),
    linkedRules: Array.from(new Set([...(record.linkedRules || []), ...(runtime.linkedRules || [])])).slice(0, 8),
  };

  const similar = Object.values(learnedContexts)
    .filter((item) => item?.signature && (item.signature.includes(marketContext.regime || "") || signature.includes(item.signature.split("+")[0])))
    .sort((a, b) => Number(b.counts || 0) - Number(a.counts || 0))
    .slice(0, 4)
    .map((item) => ({
      signature: item.signature,
      sampleCount: Number(item.counts || 0),
      wins: Number(item.wins || 0),
      losses: Number(item.losses || 0),
      preferredPosture: item.preferredPosture || "wait",
      confidenceAdjustment: Number(item.confidenceAdjustment || 0),
      penalty: Number(item.penalty || 0),
      boost: Number(item.boost || 0),
      lastSeen: item.lastSeen || null,
      linkedRules: Array.isArray(item.linkedRules) ? item.linkedRules.slice(0, 5) : [],
    }));

  return {
    signature,
    learnedContextCurrent: current,
    similarContexts: similar,
  };
}

export function buildHumanOverrideMemory(memory = [], patch = {}) {
  const row = {
    id: `override_${Date.now()}`,
    timestamp: new Date().toISOString(),
    fromBias: patch.fromBias || "neutral",
    toBias: patch.toBias || "neutral",
    reason: patch.reason || "manual correction",
    contextSignature: patch.contextSignature || "unknown",
  };
  return [row, ...(Array.isArray(memory) ? memory : [])].slice(0, 80);
}
