import { clamp } from "./utils.js";
import { computeAdaptivePatternScore, computeStability } from "./v4.js";
import { computeOverfitRisk } from "./overfit.js";
import { runStressTests } from "./stresstest.js";
import { computeMonteCarloSummary, runMonteCarlo } from "./montecarlo.js";

function reviewed(rows = []) {
  return rows.filter((row) => ["win", "loss"].includes(row.outcome?.status));
}

function scoreFromRisk(risk) {
  return risk === "low" ? 100 : risk === "medium" ? 62 : 32;
}

export function computeDependencyMetrics(rows = []) {
  const reviewedRows = reviewed(rows);
  if (!reviewedRows.length) return { assetDependency: 0, hourDependency: 0 };
  const countBy = (key) => {
    const map = new Map();
    reviewedRows.forEach((row) => map.set(row[key], (map.get(row[key]) || 0) + 1));
    const max = Math.max(...map.values());
    return Math.round((max / reviewedRows.length) * 100);
  };
  return {
    assetDependency: countBy("asset"),
    hourDependency: countBy("hourBucket"),
  };
}

export function computeRobustnessScore(rows = [], options = {}) {
  const reviewedRows = reviewed(rows);
  const sampleQuality = clamp((reviewedRows.length / 30) * 100, 0, 100);
  const stability = computeStability(rows);
  const adaptiveScore = computeAdaptivePatternScore(rows);

  const ordered = reviewedRows.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const forward = ordered.slice(Math.floor(ordered.length * 0.7));
  const forwardStability = forward.length >= 4 ? computeStability(forward) : 40;

  const overfit = computeOverfitRisk(rows, options);
  const stressSummary = runStressTests(rows, { topN: 2 });
  const monteCarloSummary = computeMonteCarloSummary(runMonteCarlo(rows, { simulations: 300, method: "bootstrap" }));
  const dependency = computeDependencyMetrics(rows);

  const stressResistance = clamp(100 - stressSummary.sensitivity * 4.2, 0, 100);
  const dispersionScore = clamp(100 - (monteCarloSummary.dispersion || 40) * 3.2, 0, 100);
  const dependencyPenalty = ((dependency.assetDependency + dependency.hourDependency) / 2) * 0.22;

  const weighted = (
    sampleQuality * 0.18
    + stability * 0.17
    + adaptiveScore * 0.16
    + forwardStability * 0.14
    + scoreFromRisk(overfit.overfitRisk) * 0.13
    + dispersionScore * 0.11
    + stressResistance * 0.11
  );

  const robustnessScore = Math.round(clamp(weighted - dependencyPenalty, 0, 100));

  const badge = robustnessScore >= 78
    ? "Stronger Evidence"
    : robustnessScore >= 64
      ? "Robust-ish"
      : robustnessScore >= 50
        ? "Promising"
        : robustnessScore >= 35
          ? "Early"
          : "Fragile";

  return {
    robustnessScore,
    badge,
    formula: {
      sampleQuality,
      stability,
      adaptiveScore,
      forwardStability,
      overfitPenaltySource: overfit.overfitRisk,
      dispersionScore,
      stressResistance,
      dependencyPenalty: Number(dependencyPenalty.toFixed(2)),
    },
    overfit,
    stressSummary,
    monteCarloSummary,
    dependency,
  };
}

export function buildRobustnessInsight(summary) {
  if (!summary) return "Insufficient evidence";
  if (summary.badge === "Fragile") return "Exploratory y frágil: requiere más evidencia antes de escalar hipótesis.";
  if (summary.badge === "Early") return "Señales iniciales de robustez, aún sensibles a muestra y contexto.";
  if (summary.badge === "Promising") return "Robustez moderada con áreas de mejora identificables.";
  if (summary.badge === "Robust-ish") return "Comportamiento relativamente resistente en pruebas heurísticas.";
  return "Evidencia más sólida dentro de un marco exploratorio, no concluyente.";
}
