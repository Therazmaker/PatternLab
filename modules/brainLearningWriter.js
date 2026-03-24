import { getLearningModel } from "./learningEngine.js";
import { saveLearningModel } from "./storage.js";

function mergeContexts(model = {}, signature, contextValue) {
  if (!signature || !contextValue) return model;
  return {
    ...model,
    learnedContexts: {
      ...(model.learnedContexts || {}),
      [signature]: contextValue,
    },
  };
}

export function persistLearnedContext({ signature, learnedContextCurrent } = {}) {
  if (!signature || !learnedContextCurrent) return null;
  const model = getLearningModel();
  const updatedModel = mergeContexts(model, signature, learnedContextCurrent);
  saveLearningModel(updatedModel);
  console.info(`[LearningWriter] persisted context ${signature}`);
  return updatedModel.learnedContexts?.[signature] || null;
}

export function persistHumanOverrideMemory(overrideEntry = null) {
  if (!overrideEntry) return null;
  const model = getLearningModel();
  const memoryRows = Array.isArray(model.humanOverrideMemory) ? model.humanOverrideMemory : [];
  const normalized = {
    id: overrideEntry.id || `override_${Date.now()}`,
    timestamp: overrideEntry.timestamp || new Date().toISOString(),
    fromBias: overrideEntry.fromBias || "neutral",
    toBias: overrideEntry.toBias || "neutral",
    reason: overrideEntry.reason || "manual_correction",
    contextSignature: overrideEntry.contextSignature || "unknown",
  };
  const updatedModel = {
    ...model,
    humanOverrideMemory: [normalized, ...memoryRows].slice(0, 120),
  };
  saveLearningModel(updatedModel);
  console.info(`[LearningWriter] persisted human override ${normalized.id}`);
  return normalized;
}

export function persistOutcomeLearning({ updater, diagnosticResult, meta } = {}) {
  if (typeof updater !== "function") return null;
  const result = updater(diagnosticResult, meta);
  console.info("[LearningWriter] persisted post-outcome learning update");
  return result;
}
