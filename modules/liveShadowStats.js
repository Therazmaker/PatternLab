function avg(values = []) {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);
  return sum / values.length;
}

function computeStreaks(rows = []) {
  let maxWin = 0;
  let maxLoss = 0;
  let currentType = null;
  let currentLength = 0;

  rows.forEach((row) => {
    const outcome = row.outcome?.result;
    if (outcome !== "win" && outcome !== "loss") {
      currentType = null;
      currentLength = 0;
      return;
    }
    if (outcome === currentType) {
      currentLength += 1;
    } else {
      currentType = outcome;
      currentLength = 1;
    }
    if (outcome === "win") maxWin = Math.max(maxWin, currentLength);
    if (outcome === "loss") maxLoss = Math.max(maxLoss, currentLength);
  });

  return { maxWinStreak: maxWin, maxLossStreak: maxLoss };
}

function confidenceBucket(value) {
  const n = Number(value || 0);
  if (n >= 0.8) return "0.80-1.00";
  if (n >= 0.6) return "0.60-0.79";
  if (n >= 0.4) return "0.40-0.59";
  return "0.00-0.39";
}

function buildRolling(rows = [], take = 10) {
  const subset = rows.slice(0, take);
  const resolved = subset.filter((row) => row.outcome?.status === "resolved");
  const wins = resolved.filter((row) => row.outcome?.result === "win").length;
  const losses = resolved.filter((row) => row.outcome?.result === "loss").length;
  return {
    window: take,
    decisions: subset.length,
    resolved: resolved.length,
    wins,
    losses,
    winRate: resolved.length ? wins / resolved.length : null,
    avgR: avg(resolved.map((row) => row.outcome?.rMultiple).filter(Number.isFinite)),
    avgPnlPct: avg(resolved.map((row) => row.outcome?.pnlPct).filter(Number.isFinite)),
  };
}

export function computeLiveShadowStats(records = []) {
  const rows = [...records];
  const resolved = rows.filter((row) => row.outcome?.status === "resolved");
  const pending = rows.filter((row) => row.outcome?.status === "pending");

  const wins = resolved.filter((row) => row.outcome?.result === "win");
  const losses = resolved.filter((row) => row.outcome?.result === "loss");
  const flats = resolved.filter((row) => row.outcome?.result === "flat");
  const skipped = resolved.filter((row) => row.outcome?.result === "skipped");

  const byAction = rows.reduce((acc, row) => {
    const action = row.policy?.action || "NO_TRADE";
    acc[action] = (acc[action] || 0) + 1;
    return acc;
  }, { LONG: 0, SHORT: 0, NO_TRADE: 0 });

  const confidenceBuckets = rows.reduce((acc, row) => {
    const bucket = confidenceBucket(row.policy?.confidence);
    if (!acc[bucket]) acc[bucket] = { decisions: 0, wins: 0, losses: 0 };
    acc[bucket].decisions += 1;
    if (row.outcome?.result === "win") acc[bucket].wins += 1;
    if (row.outcome?.result === "loss") acc[bucket].losses += 1;
    return acc;
  }, {});

  const avgWinR = avg(wins.map((row) => row.outcome?.rMultiple).filter(Number.isFinite));
  const avgLossR = avg(losses.map((row) => row.outcome?.rMultiple).filter(Number.isFinite));
  const expectancy = Number.isFinite(avgWinR) && Number.isFinite(avgLossR) && resolved.length
    ? (wins.length / resolved.length) * avgWinR + (losses.length / resolved.length) * avgLossR
    : null;

  const streaks = computeStreaks(resolved);
  const comparisons = resolved.filter((row) => row.outcomeComparison?.machineOnly && row.outcomeComparison?.operatorCorrected);
  const operatorImproved = comparisons.filter((row) => {
    const machine = row.outcomeComparison.machineOnly?.result;
    const corrected = row.outcomeComparison.operatorCorrected?.result;
    const actual = row.outcomeComparison.actualOutcome?.result;
    return corrected === actual && machine !== actual;
  }).length;
  const operatorDegraded = comparisons.filter((row) => {
    const machine = row.outcomeComparison.machineOnly?.result;
    const corrected = row.outcomeComparison.operatorCorrected?.result;
    const actual = row.outcomeComparison.actualOutcome?.result;
    return machine === actual && corrected !== actual;
  }).length;

  return {
    totalDecisions: rows.length,
    byAction,
    pendingDecisions: pending.length,
    resolvedDecisions: resolved.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    skipped: skipped.length,
    winRate: resolved.length ? wins.length / resolved.length : null,
    avgConfidence: avg(rows.map((row) => row.policy?.confidence).filter(Number.isFinite)),
    avgPnlPct: avg(resolved.map((row) => row.outcome?.pnlPct).filter(Number.isFinite)),
    avgRMultiple: avg(resolved.map((row) => row.outcome?.rMultiple).filter(Number.isFinite)),
    expectancy,
    operatorComparisons: comparisons.length,
    operatorImproved,
    operatorDegraded,
    ...streaks,
    rolling: {
      last10: buildRolling(rows, 10),
      last20: buildRolling(rows, 20),
    },
    confidenceBuckets,
    updatedAt: new Date().toISOString(),
  };
}
