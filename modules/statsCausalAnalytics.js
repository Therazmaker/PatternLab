function countMap(rows = [], keyFn) {
  const m = new Map();
  rows.forEach((row) => {
    const key = keyFn(row) || "unknown";
    m.set(key, (m.get(key) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function computeStatsCausalAnalytics({ decisions = [], scenarios = [], trades = [], overrides = [], learnedContexts = {} } = {}) {
  const closedTrades = trades.filter((t) => t?.outcome?.status === "resolved" || t?.result);
  const wins = closedTrades.filter((t) => (t?.outcome?.result || t?.result) === "win");
  const losses = closedTrades.filter((t) => (t?.outcome?.result || t?.result) === "loss");
  const waitDecisions = decisions.filter((d) => d?.posture === "wait" || String(d?.entry_quality || "").toLowerCase() === "wait");

  const winDrivers = countMap(wins, (row) => row?.context_signature || row?.reason || row?.posture).slice(0, 6);
  const lossDrivers = countMap(losses, (row) => row?.context_signature || row?.reason || row?.posture).slice(0, 6);
  const contextMap = Object.entries(learnedContexts || {}).map(([signature, row]) => ({
    signature,
    samples: Number(row?.counts || 0),
    wins: Number(row?.wins || 0),
    losses: Number(row?.losses || 0),
    confidenceAdjustment: Number(row?.confidenceAdjustment || 0),
  })).sort((a, b) => b.samples - a.samples).slice(0, 20);

  const overrideAnalysis = {
    totalOverrides: overrides.length,
    topOverrideTypes: countMap(overrides, (row) => row?.reason || row?.type).slice(0, 8),
  };

  const waitAnalysis = {
    totalWaitDecisions: waitDecisions.length,
    waitsWithNoTradeOutcome: waitDecisions.filter((row) => row?.no_trade_reason).length,
  };

  const repeatedMistakes = countMap(losses, (row) => row?.reason || row?.resolutionReason || row?.context_signature)
    .filter(([, count]) => count > 1)
    .slice(0, 8);

  return {
    winDrivers,
    lossDrivers,
    contextMap,
    overrideAnalysis,
    waitAnalysis,
    repeatedMistakes,
    brainVsOutcome: {
      decisions: decisions.length,
      scenarios: scenarios.length,
      closedTrades: closedTrades.length,
    },
  };
}
