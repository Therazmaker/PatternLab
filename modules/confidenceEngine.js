import { getManualControls } from "./manualControlsStore.js";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLinear(value, min, max) {
  if (max <= min) return 0;
  return clamp((toNumber(value, min) - min) / (max - min), 0, 1);
}

function computeRecencyFactor(lastOutcomes = []) {
  const rows = Array.isArray(lastOutcomes) ? lastOutcomes.slice(-3) : [];
  if (!rows.length) return 0.5;
  const weights = [0.2, 0.3, 0.5].slice(-rows.length);
  const weighted = rows.reduce((acc, item, idx) => {
    const label = String(item || "").toLowerCase();
    const value = label === "win" ? 1 : label === "loss" ? 0 : 0.5;
    return acc + (value * weights[idx]);
  }, 0);
  const totalWeight = weights.reduce((acc, item) => acc + item, 0) || 1;
  return clamp(weighted / totalWeight, 0, 1);
}

function toConfidenceLabel(score = 0) {
  if (score < 0.35) return "low";
  if (score <= 0.65) return "medium";
  return "high";
}

export function computeConfidenceEngine({
  contextMemory = {},
  scenarioReliability = null,
  familiarity = null,
  riskProfile = {},
  learningMode = "mixed",
  manualControls = null,
} = {}) {
  const samples = Math.max(0, toNumber(contextMemory?.samples ?? contextMemory?.counts, 0));
  const wins = Math.max(0, toNumber(contextMemory?.wins, 0));
  const losses = Math.max(0, toNumber(contextMemory?.losses, 0));
  const winrate = clamp(wins / Math.max(samples, 1), 0, 1);
  const winrateFactor = normalizeLinear(winrate, 0.3, 0.7);
  const familiarityFactor = clamp(toNumber(familiarity, contextMemory?.familiarity ?? contextMemory?.context_familiarity ?? 0), 0, 1);
  const scenarioFactor = clamp(toNumber(scenarioReliability, contextMemory?.scenarioReliability ?? 0.5), 0, 1);
  const recencyFactor = computeRecencyFactor(contextMemory?.last_outcomes || []);

  let confidenceScore = clamp(
    (winrateFactor * 0.4)
    + (familiarityFactor * 0.25)
    + (scenarioFactor * 0.2)
    + (recencyFactor * 0.15),
    0,
    1,
  );
  const reasons = [
    `winrate ${wins}/${Math.max(samples, 1)} -> ${winrate.toFixed(2)} (${winrateFactor.toFixed(2)} factor)`,
    `familiarity factor ${familiarityFactor.toFixed(2)}`,
    `scenario reliability factor ${scenarioFactor.toFixed(2)}`,
    `recency factor ${recencyFactor.toFixed(2)} from last outcomes`,
  ];

  const mode = String(learningMode || "mixed").toLowerCase();
  if (mode === "exploration") {
    confidenceScore = clamp(confidenceScore * 0.92, 0, 1);
    reasons.push("exploration mode soft confidence discount");
  } else if (mode === "exploitation") {
    confidenceScore = clamp(confidenceScore + 0.04, 0, 1);
    reasons.push("exploitation mode confidence premium");
  } else if (mode === "blocked") {
    confidenceScore = clamp(confidenceScore * 0.6, 0, 1);
    reasons.push("blocked mode confidence clamp");
  }

  if (Number(riskProfile?.risk_score || 0) > 0.75) {
    confidenceScore = clamp(confidenceScore + 0.03, 0, 1);
    reasons.push("risk profile score supports confidence");
  }

  const manual = manualControls || getManualControls();
  const boost = clamp(toNumber(manual?.confidence_boost, 0), -0.2, 0.2);
  if (Math.abs(boost) > 0.0001) {
    confidenceScore = clamp(confidenceScore + boost, 0, 1);
    reasons.push(`manual confidence boost ${boost >= 0 ? "+" : ""}${boost.toFixed(2)}`);
    console.info(`[Confidence] boosted by manual override ${boost >= 0 ? "+" : ""}${boost.toFixed(2)}`);
  }

  const output = {
    confidence_score: Number(confidenceScore.toFixed(3)),
    confidence_label: toConfidenceLabel(confidenceScore),
    components: {
      winrate_factor: Number(winrateFactor.toFixed(3)),
      familiarity_factor: Number(familiarityFactor.toFixed(3)),
      scenario_factor: Number(scenarioFactor.toFixed(3)),
      recency_factor: Number(recencyFactor.toFixed(3)),
    },
    reason: reasons,
  };
  console.info(`[Confidence] computed score: ${output.confidence_score.toFixed(3)}`);
  return output;
}
