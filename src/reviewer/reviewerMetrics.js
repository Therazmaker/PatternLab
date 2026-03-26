import {
  hasAvoidChaseSignal,
  hasDangerContext,
  hasLearningOutput,
  parseTime,
  toArray,
  toNumber,
  toObject,
} from "./reviewerRules.js";

function resolveOutcome(trade = {}) {
  return String(trade.outcome || "").toLowerCase();
}

function isClosedResult(trade = {}) {
  const outcome = resolveOutcome(trade);
  return outcome === "win" || outcome === "loss";
}

function normalizeSetup(trade = {}) {
  return trade.setup || trade.decisionSnapshot?.setup || "unknown_setup";
}

function normalizeDirection(trade = {}) {
  return String(trade.direction || trade.decisionSnapshot?.action || "unknown").toLowerCase();
}

export function analyzeSessionSummary(trades = [], sessionSummary = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  const wins = rows.filter((trade) => resolveOutcome(trade) === "win").length;
  const losses = rows.filter((trade) => resolveOutcome(trade) === "loss").length;
  const ambiguous = rows.filter((trade) => !["win", "loss"].includes(resolveOutcome(trade))).length;
  const invalidTrades = rows.filter((trade) => toArray(trade.invalidReasons).length > 0).length;
  const instantResolutions = rows.filter((trade) => Boolean(trade.tradeMeta?.instant_resolution)).length;
  const totalTrades = rows.length;

  const rrValues = rows.map((trade) => toNumber(trade.riskReward, null)).filter(Number.isFinite);
  const avgRR = rrValues.length ? rrValues.reduce((sum, item) => sum + item, 0) / rrValues.length : 0;
  const closed = wins + losses;
  const winRate = closed ? (wins / closed) * 100 : 0;
  const expectancy = closed ? ((wins / closed) * avgRR) - (losses / closed) : 0;
  const netPnl = rows.reduce((sum, trade) => {
    if (resolveOutcome(trade) === "win") return sum + (toNumber(trade.riskReward, 1) || 1);
    if (resolveOutcome(trade) === "loss") return sum - 1;
    return sum;
  }, 0);
  const totalMFE = rows.reduce((sum, trade) => sum + (toNumber(trade.mfe, 0) || 0), 0);
  const totalMAE = rows.reduce((sum, trade) => sum + (toNumber(trade.mae, 0) || 0), 0);

  const resolved = {
    totalTrades: toNumber(sessionSummary.totalTrades, totalTrades) ?? totalTrades,
    wins: toNumber(sessionSummary.wins, wins) ?? wins,
    losses: toNumber(sessionSummary.losses, losses) ?? losses,
    ambiguous: toNumber(sessionSummary.ambiguous, ambiguous) ?? ambiguous,
    invalidTrades: toNumber(sessionSummary.invalidTrades, invalidTrades) ?? invalidTrades,
    instantResolutions: toNumber(sessionSummary.instantResolutions, instantResolutions) ?? instantResolutions,
    winRate: Number((toNumber(sessionSummary.winRate, winRate) ?? winRate).toFixed(2)),
    avgRR: Number((toNumber(sessionSummary.avgRR, avgRR) ?? avgRR).toFixed(4)),
    expectancy: Number((toNumber(sessionSummary.expectancy, expectancy) ?? expectancy).toFixed(4)),
    netPnl: Number((toNumber(sessionSummary.netPnl, netPnl) ?? netPnl).toFixed(4)),
    totalMFE: Number((toNumber(sessionSummary.totalMFE, totalMFE) ?? totalMFE).toFixed(4)),
    totalMAE: Number((toNumber(sessionSummary.totalMAE, totalMAE) ?? totalMAE).toFixed(4)),
  };

  let interpretation = "data incomplete";
  // Reglas simples para priorizar trazabilidad sobre heurística opaca.
  if (!resolved.totalTrades) interpretation = "data incomplete";
  else if (resolved.totalTrades >= 40 && resolved.winRate < 45) interpretation = "overtrading";
  else if (Math.abs(resolved.expectancy) <= 0.15) interpretation = "close to breakeven";
  else if (resolved.expectancy < -0.4 || resolved.netPnl < -(resolved.totalTrades * 0.35)) interpretation = "severely broken";
  else if (resolved.expectancy < 0) interpretation = "unprofitable but salvageable";

  return { ...resolved, interpretation };
}

export function analyzeFailurePatterns(trades = []) {
  const rows = Array.isArray(trades) ? trades : [];
  const setupCounts = rows.reduce((acc, trade) => {
    const setup = normalizeSetup(trade);
    acc[setup] = (acc[setup] || 0) + 1;
    return acc;
  }, {});

  const directionCounts = rows.reduce((acc, trade) => {
    const direction = normalizeDirection(trade);
    acc[direction] = (acc[direction] || 0) + 1;
    return acc;
  }, {});

  const sameCandleResolved = rows.filter((trade) => {
    const trig = toNumber(trade.triggeredCandleIndex, null);
    const resolved = toNumber(trade.resolvedCandleIndex, null);
    return Number.isFinite(trig) && Number.isFinite(resolved) && trig === resolved;
  }).length;

  const suspiciousTimestamps = rows.filter((trade) => {
    const triggeredAt = parseTime(trade.triggeredAt);
    const resolvedAt = parseTime(trade.resolvedAt);
    if (triggeredAt === null || resolvedAt === null) return false;
    return resolvedAt < triggeredAt;
  }).length;

  const dangerNoWarning = rows.filter((trade) => hasDangerContext(trade) && warningsEmptyDecision(trade)).length;
  const avoidChaseButTrade = rows.filter((trade) => hasAvoidChaseSignal(trade) && ["long", "short"].includes(normalizeDirection(trade))).length;

  const failureCounts = {
    repeatedSetupOveruse: Object.values(setupCounts).filter((count) => count >= Math.max(5, Math.ceil(rows.length * 0.55))).length,
    sameSideOverconcentration: Object.values(directionCounts).some((count) => rows.length > 0 && (count / rows.length) >= 0.85) ? 1 : 0,
    dangerNoWarning,
    emptyLearningOutput: rows.filter((trade) => !hasLearningOutput(trade)).length,
    emptyLifecycleHistory: rows.filter((trade) => toArray(trade.lifecycleHistory).length === 0).length,
    emptyMarkers: rows.filter((trade) => toArray(trade.markers).length === 0).length,
    zeroSecondsWithCandles: rows.filter((trade) => toNumber(trade.timeInTradeSec, null) === 0 && (toNumber(trade.candlesInTrade, 0) || 0) > 0).length,
    suspiciousTimestamps,
    sameCandleResolved,
    suspiciousWithoutInvalidReason: rows.filter((trade) => toArray(trade.invalidReasons).length === 0 && (toNumber(trade.timeInTradeSec, null) === 0 || (parseTime(trade.resolvedAt) ?? 0) < (parseTime(trade.triggeredAt) ?? 0))).length,
    avoidChaseButTrade,
  };

  const criticalFindings = [];
  const warnings = [];
  const dataQualityIssues = [];

  if (failureCounts.sameSideOverconcentration) criticalFindings.push("Same-side overconcentration detected (bot trades almost one direction).");
  if (failureCounts.repeatedSetupOveruse) criticalFindings.push("Single setup repeated in excess, strategy may be monoculture.");
  if (failureCounts.dangerNoWarning > 0) criticalFindings.push("Danger context active but decision warnings were empty.");
  if (failureCounts.avoidChaseButTrade > 0) criticalFindings.push("Trades executed despite avoidChase / danger signals.");

  if (failureCounts.emptyLearningOutput > 0) warnings.push("Learning output is sparse or absent in many trades.");
  if (failureCounts.sameCandleResolved > Math.max(3, Math.floor(rows.length * 0.4))) warnings.push("Many trades resolve on same candle as trigger.");
  if (failureCounts.zeroSecondsWithCandles > 0) warnings.push("Trades with candlesInTrade > 0 but timeInTradeSec = 0.");

  if (failureCounts.emptyLifecycleHistory > 0) dataQualityIssues.push("lifecycleHistory missing for part of dataset.");
  if (failureCounts.emptyMarkers > 0) dataQualityIssues.push("markers missing for part of dataset.");
  if (failureCounts.suspiciousTimestamps > 0) dataQualityIssues.push("resolvedAt occurs before triggeredAt in some trades.");
  if (failureCounts.suspiciousWithoutInvalidReason > 0) dataQualityIssues.push("Suspicious behavior exists but invalidReasons is empty.");

  return {
    failureCounts,
    criticalFindings,
    warnings,
    dataQualityIssues,
  };
}

function warningsEmptyDecision(trade = {}) {
  return toArray(toObject(trade.decisionSnapshot).warnings).length === 0;
}

export function analyzeSetupDistribution(trades = []) {
  const rows = Array.isArray(trades) ? trades : [];
  const bySetup = {};

  rows.forEach((trade) => {
    const key = normalizeSetup(trade);
    if (!bySetup[key]) {
      bySetup[key] = { setup: key, count: 0, wins: 0, losses: 0, totalRR: 0, rrCount: 0, totalMfe: 0, totalMae: 0, directionLong: 0, directionShort: 0 };
    }
    const bucket = bySetup[key];
    bucket.count += 1;
    if (resolveOutcome(trade) === "win") bucket.wins += 1;
    if (resolveOutcome(trade) === "loss") bucket.losses += 1;
    const rr = toNumber(trade.riskReward, null);
    if (Number.isFinite(rr)) {
      bucket.totalRR += rr;
      bucket.rrCount += 1;
    }
    bucket.totalMfe += toNumber(trade.mfe, 0) || 0;
    bucket.totalMae += toNumber(trade.mae, 0) || 0;
    const direction = normalizeDirection(trade);
    if (direction === "long") bucket.directionLong += 1;
    if (direction === "short") bucket.directionShort += 1;
  });

  const rowsSetup = Object.values(bySetup).map((bucket) => {
    const closed = bucket.wins + bucket.losses;
    const winRate = closed ? (bucket.wins / closed) * 100 : 0;
    const avgRR = bucket.rrCount ? bucket.totalRR / bucket.rrCount : 0;
    const expectancy = closed ? ((bucket.wins / closed) * avgRR) - (bucket.losses / closed) : 0;
    return {
      setup: bucket.setup,
      count: bucket.count,
      wins: bucket.wins,
      losses: bucket.losses,
      winRate: Number(winRate.toFixed(2)),
      expectancy: Number(expectancy.toFixed(4)),
      avgMfe: Number((bucket.totalMfe / Math.max(1, bucket.count)).toFixed(4)),
      avgMae: Number((bucket.totalMae / Math.max(1, bucket.count)).toFixed(4)),
      longCount: bucket.directionLong,
      shortCount: bucket.directionShort,
      tooFewSamples: bucket.count < 5,
    };
  }).sort((a, b) => b.count - a.count);

  const top = rowsSetup[0] || null;
  const concentration = top && rows.length ? top.count / rows.length : 0;
  return {
    bySetup: rowsSetup,
    concentration: Number((concentration * 100).toFixed(2)),
    monocultureDetected: concentration >= 0.8,
    topLosingSetup: [...rowsSetup].sort((a, b) => b.losses - a.losses)[0] || null,
    topWinningSetup: [...rowsSetup].sort((a, b) => b.wins - a.wins)[0] || null,
  };
}

export function analyzeLibraryDiscipline(trades = []) {
  const rows = Array.isArray(trades) ? trades : [];
  const matchedFrequency = {};
  const confidenceByOutcome = { win: [], loss: [], other: [] };
  const confidenceBySetup = {};

  let highDangerActive = 0;
  let avoidChaseActive = 0;
  let highRiskNoWarnings = 0;

  rows.forEach((trade) => {
    const decision = toObject(trade.decisionSnapshot);
    const matched = toArray(decision.matchedLibraryItems);
    matched.forEach((item) => {
      const key = String(item || "unknown");
      matchedFrequency[key] = (matchedFrequency[key] || 0) + 1;
    });

    const confidence = toNumber(decision.confidence, null);
    if (Number.isFinite(confidence)) {
      const outcome = resolveOutcome(trade);
      if (outcome === "win" || outcome === "loss") confidenceByOutcome[outcome].push(confidence);
      else confidenceByOutcome.other.push(confidence);
      const setup = normalizeSetup(trade);
      confidenceBySetup[setup] = confidenceBySetup[setup] || [];
      confidenceBySetup[setup].push(confidence);
    }

    const danger = hasDangerContext(trade);
    const avoid = hasAvoidChaseSignal(trade);
    if (danger) highDangerActive += 1;
    if (avoid) avoidChaseActive += 1;
    if ((danger || avoid) && warningsEmptyDecision(trade)) highRiskNoWarnings += 1;
  });

  const avg = (values = []) => values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;

  const confidenceRange = (() => {
    const values = Object.values(confidenceBySetup).flat();
    if (!values.length) return null;
    const max = Math.max(...values);
    const min = Math.min(...values);
    return Number((max - min).toFixed(4));
  })();

  return {
    highDangerTrades: highDangerActive,
    avoidChaseTrades: avoidChaseActive,
    highRiskNoWarningTrades: highRiskNoWarnings,
    matchedLibraryItemsFrequency: Object.entries(matchedFrequency).sort((a, b) => b[1] - a[1]).map(([item, count]) => ({ item, count })),
    avgConfidenceByOutcome: {
      win: avg(confidenceByOutcome.win),
      loss: avg(confidenceByOutcome.loss),
      other: avg(confidenceByOutcome.other),
    },
    avgConfidenceBySetup: Object.entries(confidenceBySetup).map(([setup, values]) => ({ setup, confidence: avg(values) })),
    confidenceRange,
    confidencePossiblyFlat: confidenceRange !== null && confidenceRange < 0.08,
  };
}

export function analyzeLearningCoverage(trades = []) {
  const rows = Array.isArray(trades) ? trades : [];
  const total = rows.length || 1;
  const emptyLearningOutput = rows.filter((trade) => !hasLearningOutput(trade)).length;
  const learningRecordedFalse = rows.filter((trade) => trade.learningRecorded === false).length;
  const learningExcludedTrue = rows.filter((trade) => trade.learningExcluded === true).length;
  const lessonCandidates = rows.filter((trade) => {
    const lo = toObject(trade.learningOutput);
    return Boolean(lo.lessonCandidate || lo.lessonCandidates || lo.lesson);
  }).length;

  const qualityLabel = emptyLearningOutput === rows.length
    ? "Learning layer absent"
    : (emptyLearningOutput / total) > 0.6
      ? "Learning output too sparse"
      : "Trade results partially mapped to reusable memory";

  return {
    emptyLearningOutputPct: Number(((emptyLearningOutput / total) * 100).toFixed(2)),
    learningRecordedFalsePct: Number(((learningRecordedFalse / total) * 100).toFixed(2)),
    learningExcludedTruePct: Number(((learningExcludedTrue / total) * 100).toFixed(2)),
    lessonCandidates,
    learningQualityLabel: qualityLabel,
  };
}
