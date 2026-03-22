function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeResult(record = {}) {
  const result = String(record?.outcome?.result || record?.result || "breakeven").toLowerCase();
  if (result === "win" || result === "loss" || result === "breakeven") return result;
  return "breakeven";
}

function normalizeDirection(record = {}) {
  const direction = String(record?.signal?.direction || record?.direction || "LONG").toUpperCase();
  return direction === "SHORT" ? "SHORT" : "LONG";
}

function getReasonCodes(record = {}) {
  if (Array.isArray(record.reasonCodes) && record.reasonCodes.length) return record.reasonCodes.map(String);
  const primary = record.primaryCause ? String(record.primaryCause) : null;
  return primary ? [primary] : [];
}

function collectTradeScores(record = {}) {
  const scores = record.diagnosticScores || record.scores || {};
  return {
    structureScore: toNumber(scores.structureScore),
    momentumScore: toNumber(scores.momentumScore),
    confidenceScore: toNumber(scores.confidenceScore),
  };
}


function resultBucketKey(result) {
  if (result === "loss") return "losses";
  if (result === "win") return "wins";
  return "breakevens";
}

function createReasonBucket() {
  return {
    count: 0,
    losses: 0,
    wins: 0,
    breakevens: 0,
    avgStructureScore: 0,
    avgMomentumScore: 0,
    avgConfidenceScore: 0,
    directions: { LONG: 0, SHORT: 0 },
  };
}

function updateRunningAverages(bucket, scores) {
  const nextCount = bucket.count;
  if (!nextCount) return;
  bucket.avgStructureScore += (scores.structureScore - bucket.avgStructureScore) / nextCount;
  bucket.avgMomentumScore += (scores.momentumScore - bucket.avgMomentumScore) / nextCount;
  bucket.avgConfidenceScore += (scores.confidenceScore - bucket.avgConfidenceScore) / nextCount;
}

function summarizeTopPatterns(byReasonCode = {}, key) {
  return Object.entries(byReasonCode)
    .map(([reasonCode, stats]) => ({ reasonCode, ...stats }))
    .sort((a, b) => toNumber(b[key]) - toNumber(a[key]))
    .slice(0, 3)
    .map((row) => ({
      reasonCode: row.reasonCode,
      count: row.count,
      losses: row.losses,
      wins: row.wins,
      winRate: row.count > 0 ? Number((row.wins / row.count).toFixed(3)) : 0,
    }));
}

function buildPatternClusters(byDirection) {
  return Object.entries(byDirection)
    .flatMap(([direction, summary]) => {
      const sorted = Object.entries(summary.reasonCodes || {})
        .filter(([, stats]) => stats.count >= 3)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

      if (!sorted.length) return [];

      const sampleSize = sorted.reduce((sum, [, row]) => sum + row.count, 0);
      const wins = sorted.reduce((sum, [, row]) => sum + row.wins, 0);
      const losses = sorted.reduce((sum, [, row]) => sum + row.losses, 0);
      const avgStructureScore = sorted.reduce((sum, [, row]) => sum + row.avgStructureScore, 0) / sorted.length;
      const avgMomentumScore = sorted.reduce((sum, [, row]) => sum + row.avgMomentumScore, 0) / sorted.length;

      return [{
        clusterId: `cluster_${direction.toLowerCase()}_${sorted.map(([code]) => code).join("_").slice(0, 48)}`,
        direction,
        repeatedReasonCodes: sorted.map(([reasonCode]) => reasonCode),
        sampleSize,
        winRate: sampleSize > 0 ? Number((wins / sampleSize).toFixed(3)) : 0,
        lossRate: sampleSize > 0 ? Number((losses / sampleSize).toFixed(3)) : 0,
        avgScores: {
          structureScore: Number(avgStructureScore.toFixed(2)),
          momentumScore: Number(avgMomentumScore.toFixed(2)),
        },
      }];
    })
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

export function aggregatePolicyEvidence(trades = [], decisions = []) {
  const totals = {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    skippedDecisions: Array.isArray(decisions) ? decisions.length : 0,
  };

  const byReasonCode = {};
  const byDirection = {
    LONG: { total: 0, wins: 0, losses: 0, breakevens: 0, reasonCodes: {} },
    SHORT: { total: 0, wins: 0, losses: 0, breakevens: 0, reasonCodes: {} },
  };

  const operatorImpact = {
    vetoSavedLossCount: 0,
    vetoBlockedWinnerCount: 0,
    warningIgnoredLossCount: 0,
  };

  const safeTrades = Array.isArray(trades) ? trades : [];
  const safeDecisions = Array.isArray(decisions) ? decisions : [];

  safeTrades.forEach((trade = {}) => {
    totals.totalTrades += 1;
    const result = normalizeResult(trade);
    const direction = normalizeDirection(trade);
    const reasonCodes = getReasonCodes(trade);
    const scores = collectTradeScores(trade);

    if (result === "win") totals.wins += 1;
    if (result === "loss") totals.losses += 1;
    if (result === "breakeven") totals.breakevens += 1;

    byDirection[direction].total += 1;
    byDirection[direction][resultBucketKey(result)] += 1;

    reasonCodes.forEach((reasonCode) => {
      if (!byReasonCode[reasonCode]) byReasonCode[reasonCode] = createReasonBucket();
      if (!byDirection[direction].reasonCodes[reasonCode]) byDirection[direction].reasonCodes[reasonCode] = createReasonBucket();

      byReasonCode[reasonCode].count += 1;
      byDirection[direction].reasonCodes[reasonCode].count += 1;
      const bucketKey = resultBucketKey(result);
      byReasonCode[reasonCode][bucketKey] += 1;
      byDirection[direction].reasonCodes[reasonCode][bucketKey] += 1;
      byReasonCode[reasonCode].directions[direction] += 1;
      byDirection[direction].reasonCodes[reasonCode].directions[direction] += 1;

      updateRunningAverages(byReasonCode[reasonCode], scores);
      updateRunningAverages(byDirection[direction].reasonCodes[reasonCode], scores);
    });

    if (result === "loss" && reasonCodes.includes("operator_warning_ignored")) {
      operatorImpact.warningIgnoredLossCount += 1;
    }
  });

  safeDecisions.forEach((decision = {}) => {
    const codes = getReasonCodes(decision);
    if (codes.includes("veto_saved_loss")) operatorImpact.vetoSavedLossCount += 1;
    if (codes.includes("veto_blocked_winner")) operatorImpact.vetoBlockedWinnerCount += 1;
  });

  const patternClusters = buildPatternClusters(byDirection);

  const evidence = {
    totals,
    byReasonCode,
    byDirection,
    operatorImpact,
    patternClusters,
    debugSummary: {
      topLosingPatterns: summarizeTopPatterns(byReasonCode, "losses"),
      topWinningPatterns: summarizeTopPatterns(byReasonCode, "wins"),
      strongestOperatorSaves: {
        vetoSavedLossCount: operatorImpact.vetoSavedLossCount,
        warningIgnoredLossCount: operatorImpact.warningIgnoredLossCount,
      },
      likelyFieldsToTune: patternClusters.slice(0, 3).map((cluster) => {
        if (cluster.repeatedReasonCodes.includes("entered_into_resistance")) return "longEntry.maxDistanceToResistance";
        if (cluster.repeatedReasonCodes.includes("entered_into_support")) return "shortEntry.maxDistanceToSupport";
        if (cluster.repeatedReasonCodes.includes("low_momentum_entry")) return `${cluster.direction === "LONG" ? "longEntry" : "shortEntry"}.minMomentum`;
        if (cluster.repeatedReasonCodes.includes("countertrend_entry")) return `${cluster.direction === "LONG" ? "longEntry" : "shortEntry"}.requireTrendAlignment`;
        return "penalties.noFollowThroughPenalty";
      }),
    },
  };

  console.info("Policy evidence aggregated", {
    totalTrades: totals.totalTrades,
    losses: totals.losses,
    skippedDecisions: totals.skippedDecisions,
  });

  return evidence;
}
