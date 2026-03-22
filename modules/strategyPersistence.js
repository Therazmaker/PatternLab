import { loadStrategyRuns, saveStrategyRuns } from "./storage.js";

function uuid() {
  return `run_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Persistence for Strategy Lab runs following storage.js conventions.
 */
export function getSavedStrategyRuns() {
  return loadStrategyRuns();
}

export async function persistStrategyRun(runPayload = {}) {
  const runs = loadStrategyRuns();
  const run = {
    id: runPayload.id || uuid(),
    strategyId: runPayload.strategyId,
    strategyName: runPayload.strategyName,
    versionId: runPayload.versionId || "v1",
    strategyType: runPayload.strategyType,
    parameters: runPayload.parameters || {},
    symbol: runPayload.symbol,
    timeframe: runPayload.timeframe,
    candleRange: runPayload.candleRange || {},
    metrics: runPayload.metrics || {},
    timestamp: runPayload.timestamp || new Date().toISOString(),
    notes: runPayload.notes || "",
    trades: runPayload.trades || [],
    approvedForLiveShadow: Boolean(runPayload.approvedForLiveShadow),
    approvedAt: runPayload.approvedAt || null,
    approvalNote: runPayload.approvalNote || "",
    batchSummary: runPayload.batchSummary || null,
  };
  const next = [run, ...runs].slice(0, 200);
  await saveStrategyRuns(next);
  return run;
}
