import { calcWinrate } from "./utils.js";
import { computeStatsCausalAnalytics } from "./statsCausalAnalytics.js";

function countBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || "N/A";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function topEntries(map, max = 5) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

export function computeStats(signals) {
  const wins = signals.filter((s) => s.outcome.status === "win").length;
  const losses = signals.filter((s) => s.outcome.status === "loss").length;
  const skips = signals.filter((s) => s.outcome.status === "skip").length;
  const pending = signals.filter((s) => s.outcome.status === "pending").length;
  const reviewed = signals.filter((s) => s.outcome.status !== "pending").length;

  const causal = computeStatsCausalAnalytics({ trades: signals, decisions: signals });

  return {
    total: signals.length,
    reviewed,
    wins,
    losses,
    skips,
    pending,
    winrate: calcWinrate(wins, losses),
    topAssets: topEntries(countBy(signals, (s) => s.asset)),
    topPatterns: topEntries(countBy(signals, (s) => s.patternName)),
    bySource: topEntries(countBy(signals, (s) => s.source || "manual")),
    byStrategy: topEntries(countBy(signals, (s) => s.strategyName || s.strategyId || "N/A")),
    bySymbol: topEntries(countBy(signals, (s) => s.asset)),
    byTimeframe: topEntries(countBy(signals, (s) => s.timeframe)),
    byAction: topEntries(countBy(signals, (s) => s.strategyAction || s.futuresPolicy?.action || "N/A")),
    byResult: topEntries(countBy(signals, (s) => s.outcome?.status || "pending")),
    directionDist: topEntries(countBy(signals, (s) => s.direction), 2),
    causal,
  };
}
