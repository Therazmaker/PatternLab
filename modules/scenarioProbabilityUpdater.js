import { getScenarioMemoryRows, getScenarioContextStats, setScenarioContextStats } from "./scenarioMemoryStore.js";

function bucketContext(signature = "") {
  const raw = String(signature || "unknown_context");
  return raw || "unknown_context";
}

export function updateScenarioContextStats() {
  const rows = getScenarioMemoryRows();
  const grouped = {};
  rows.forEach((row) => {
    const context = bucketContext(row.context_signature);
    const type = row.scenario_type || "chop_no_trade";
    if (!grouped[context]) grouped[context] = { total: 0, types: {}, failures: 0, fulfillments: 0 };
    const g = grouped[context];
    g.total += 1;
    if (!g.types[type]) g.types[type] = { total: 0, fulfilled: 0, invalidated: 0, unresolved: 0, qualitySum: 0, confidenceBias: 0 };
    const t = g.types[type];
    t.total += 1;
    if (row.final_status === "fulfilled") {
      t.fulfilled += 1;
      g.fulfillments += 1;
    } else if (row.final_status === "invalidated") {
      t.invalidated += 1;
      g.failures += 1;
    } else {
      t.unresolved += 1;
    }
    t.qualitySum += Number(row.outcome_quality || 0);
  });

  Object.values(grouped).forEach((contextStats) => {
    Object.values(contextStats.types).forEach((typeStats) => {
      const baseRate = typeStats.total ? (typeStats.fulfilled / typeStats.total) : 0.5;
      const failRate = typeStats.total ? (typeStats.invalidated / typeStats.total) : 0.5;
      typeStats.confidenceBias = Number((baseRate - failRate).toFixed(4));
      typeStats.avgQuality = Number((typeStats.total ? typeStats.qualitySum / typeStats.total : 0).toFixed(4));
    });
  });

  setScenarioContextStats(grouped);
  return grouped;
}

export function getScenarioProbabilityAdjustments(contextSignature) {
  const stats = getScenarioContextStats();
  const contextStats = stats[bucketContext(contextSignature)] || null;
  if (!contextStats) return { matchedContexts: 0, byType: {} };
  const byType = {};
  Object.entries(contextStats.types || {}).forEach(([type, row]) => {
    const sampleWeight = Math.min(1, (row.total || 0) / 12);
    const confidenceShift = (row.confidenceBias || 0) * 0.25 * sampleWeight;
    byType[type] = {
      shift: Number(confidenceShift.toFixed(4)),
      fulfilledRate: Number((row.total ? row.fulfilled / row.total : 0).toFixed(4)),
      sampleSize: row.total || 0,
    };
  });
  return {
    matchedContexts: contextStats.total || 0,
    byType,
  };
}
