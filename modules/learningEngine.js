import { loadLearningModel, saveLearningModel } from "./storage/storage-adapter.js";

const MEMORY_MIN = 20;
const MEMORY_MAX = 50;
const DEFAULT_WINDOW = 30;
const ADJUSTMENT_SCALE = 0.04;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureModel(model = null) {
  const base = model && typeof model === "object" ? model : {};
  const memoryWindow = clamp(base.memoryWindow || DEFAULT_WINDOW, MEMORY_MIN, MEMORY_MAX);
  return {
    schema: "patternlab.learningModel.v1",
    updatedAt: base.updatedAt || null,
    memoryWindow,
    weights: {
      longNearResistance: toNumber(base?.weights?.longNearResistance, 0),
      shortNearSupport: toNumber(base?.weights?.shortNearSupport, 0),
      shortAfterFailedBreakout: toNumber(base?.weights?.shortAfterFailedBreakout, 0),
      longAfterFailedBreakdown: toNumber(base?.weights?.longAfterFailedBreakdown, 0),
      momentumWeakPenalty: toNumber(base?.weights?.momentumWeakPenalty, 0),
    },
    toggles: {
      requireConfirmationInCompression: Boolean(base?.toggles?.requireConfirmationInCompression),
    },
    patternMemory: base?.patternMemory && typeof base.patternMemory === "object" ? base.patternMemory : {},
    rollingDiagnostics: Array.isArray(base?.rollingDiagnostics) ? base.rollingDiagnostics : [],
    lastDiagnosis: base?.lastDiagnosis || null,
    lastAdjustments: base?.lastAdjustments || null,
  };
}

function mapReasonToPattern(reasonCodes = [], direction = "NONE") {
  if (reasonCodes.includes("failed_breakout_ignored") && direction === "SHORT") return "failed_breakout_short";
  if (reasonCodes.includes("failed_breakout_ignored") && direction === "LONG") return "failed_breakdown_long";
  if (reasonCodes.includes("entered_long_into_resistance")) return "long_into_resistance";
  if (reasonCodes.includes("entered_short_into_support")) return "short_into_support";
  if (reasonCodes.includes("momentum_weak")) return "weak_momentum_penalty";
  return null;
}

function updatePatternMemory(patternMemory = {}, patternKey, outcome = {}) {
  if (!patternKey) return patternMemory;
  const current = patternMemory[patternKey] || { occurrences: 0, wins: 0, losses: 0, totalReturn: 0, winRate: 0, avgReturn: 0 };
  const type = String(outcome.type || "neutral");
  const next = {
    ...current,
    occurrences: current.occurrences + 1,
    wins: current.wins + (type === "win" ? 1 : 0),
    losses: current.losses + (type === "loss" ? 1 : 0),
    totalReturn: current.totalReturn + toNumber(outcome.pnl, 0),
  };
  next.winRate = next.occurrences ? Number((next.wins / next.occurrences).toFixed(4)) : 0;
  next.avgReturn = next.occurrences ? Number((next.totalReturn / next.occurrences).toFixed(6)) : 0;
  return {
    ...patternMemory,
    [patternKey]: next,
  };
}

export function updateLearningModel(diagnosticResult = {}, meta = {}) {
  const model = ensureModel(loadLearningModel());
  const reasonCodes = Array.isArray(diagnosticResult.reasonCodes) ? diagnosticResult.reasonCodes : [];
  const outcomeType = meta?.outcomeType || "neutral";
  const tradeWeight = Math.min(1, model.rollingDiagnostics.length / Math.max(5, model.memoryWindow));
  const magnitude = ADJUSTMENT_SCALE * (0.35 + tradeWeight);

  const adjustments = {
    weightAdjustments: {},
    toggles: {},
  };

  if (reasonCodes.includes("entered_long_into_resistance") && outcomeType === "loss") {
    model.weights.longNearResistance = clamp(model.weights.longNearResistance - magnitude, -1, 1);
    adjustments.weightAdjustments.longNearResistance = Number((-magnitude).toFixed(4));
  }

  if (reasonCodes.includes("entered_short_into_support") && outcomeType === "loss") {
    model.weights.shortNearSupport = clamp(model.weights.shortNearSupport - magnitude, -1, 1);
    adjustments.weightAdjustments.shortNearSupport = Number((-magnitude).toFixed(4));
  }

  if (reasonCodes.includes("failed_breakout_ignored") && outcomeType === "win") {
    model.weights.shortAfterFailedBreakout = clamp(model.weights.shortAfterFailedBreakout + magnitude, -1, 1);
    adjustments.weightAdjustments.shortAfterFailedBreakout = Number(magnitude.toFixed(4));
  }

  if (reasonCodes.includes("momentum_weak") && outcomeType === "loss") {
    model.weights.momentumWeakPenalty = clamp(model.weights.momentumWeakPenalty - magnitude, -1, 1);
    adjustments.weightAdjustments.momentumWeakPenalty = Number((-magnitude).toFixed(4));
  }

  if (reasonCodes.includes("no_confirmation")) {
    model.toggles.requireConfirmationInCompression = true;
    adjustments.toggles.requireConfirmationInCompression = true;
  }

  const diagEntry = {
    timestamp: new Date().toISOString(),
    outcome: outcomeType,
    reasonCodes,
    classification: diagnosticResult.classification || "unclassified",
    pnl: toNumber(meta?.outcome?.pnl, 0),
  };

  model.rollingDiagnostics = [diagEntry, ...model.rollingDiagnostics].slice(0, model.memoryWindow);
  const patternKey = mapReasonToPattern(reasonCodes, String(meta?.direction || "NONE").toUpperCase());
  model.patternMemory = updatePatternMemory(model.patternMemory, patternKey, {
    type: outcomeType,
    pnl: toNumber(meta?.outcome?.pnl, 0),
    outcome: outcomeType,
  });

  model.updatedAt = new Date().toISOString();
  model.lastDiagnosis = diagnosticResult;
  model.lastAdjustments = adjustments;

  saveLearningModel(model);
  return {
    ...adjustments,
    model,
    patternKey,
  };
}

export function getLearningModel() {
  return ensureModel(loadLearningModel());
}
