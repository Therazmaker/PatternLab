import { getLearningModel } from "./learningEngine.js";
import { loadLearningModel, saveLearningModel } from "./storage/storage-adapter.js";

const DEFAULT_SYNTHETIC_WEIGHT = 0.4;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureSyntheticLearningBlock(model = {}) {
  const block = model.syntheticLearning && typeof model.syntheticLearning === "object" ? model.syntheticLearning : {};
  return {
    syntheticWeight: toNumber(block.syntheticWeight, DEFAULT_SYNTHETIC_WEIGHT),
    weightedSamples: toNumber(block.weightedSamples, 0),
    scenarioReliability: block.scenarioReliability && typeof block.scenarioReliability === "object" ? block.scenarioReliability : {},
    familiarityByScenario: block.familiarityByScenario && typeof block.familiarityByScenario === "object" ? block.familiarityByScenario : {},
    lessonTags: block.lessonTags && typeof block.lessonTags === "object" ? block.lessonTags : {},
    lastUpdatedAt: block.lastUpdatedAt || null,
  };
}

function normalizeOutcome(raw = "") {
  const status = String(raw || "neutral").toLowerCase();
  if (["win", "fulfilled", "success"].includes(status)) return "win";
  if (["loss", "invalidated", "failed"].includes(status)) return "loss";
  return "neutral";
}

export function applySyntheticTradesToLearning(rows = []) {
  const payload = Array.isArray(rows) ? rows : [];
  const model = getLearningModel();
  const syntheticLearning = ensureSyntheticLearningBlock(model);

  payload.forEach((row) => {
    const scenarioKey = String(row.scenario || "unknown_scenario");
    const outcome = normalizeOutcome(row.outcome);
    const weight = toNumber(row.weight, syntheticLearning.syntheticWeight || DEFAULT_SYNTHETIC_WEIGHT);

    const scenario = syntheticLearning.scenarioReliability[scenarioKey] || {
      samples: 0,
      wins: 0,
      losses: 0,
      weightedSamples: 0,
      weightedWins: 0,
      reliability: 0,
    };

    scenario.samples += 1;
    scenario.weightedSamples = Number((scenario.weightedSamples + weight).toFixed(3));
    if (outcome === "win") {
      scenario.wins += 1;
      scenario.weightedWins = Number((scenario.weightedWins + weight).toFixed(3));
    }
    if (outcome === "loss") scenario.losses += 1;
    scenario.reliability = scenario.weightedSamples > 0
      ? Number((scenario.weightedWins / scenario.weightedSamples).toFixed(4))
      : 0;
    syntheticLearning.scenarioReliability[scenarioKey] = scenario;

    const familiarityPrev = toNumber(syntheticLearning.familiarityByScenario[scenarioKey], 0);
    syntheticLearning.familiarityByScenario[scenarioKey] = Number(Math.min(1, familiarityPrev + (0.04 * weight)).toFixed(4));

    const tags = String(row.lesson || "")
      .split(/[;,|]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    tags.forEach((tag) => {
      syntheticLearning.lessonTags[tag] = toNumber(syntheticLearning.lessonTags[tag], 0) + 1;
    });

    syntheticLearning.weightedSamples = Number((syntheticLearning.weightedSamples + weight).toFixed(3));
  });

  syntheticLearning.lastUpdatedAt = new Date().toISOString();

  const rawModel = loadLearningModel() || model;
  const nextModel = {
    ...rawModel,
    syntheticLearning,
    updatedAt: new Date().toISOString(),
  };
  saveLearningModel(nextModel);

  return {
    applied: payload.length,
    weightedApplied: Number(payload.reduce((acc, row) => acc + toNumber(row.weight, DEFAULT_SYNTHETIC_WEIGHT), 0).toFixed(3)),
    syntheticLearning,
  };
}

export function getSyntheticLearningSnapshot() {
  const model = getLearningModel();
  return ensureSyntheticLearningBlock(model);
}
