import {
  hasDangerContext,
  hasLearningOutput,
  toArray,
  toNumber,
  toObject,
} from "./reviewerRules.js";

const OUTPUT_SCHEMA = "patternlab_positive_qualifiers_v1";
const EPSILON = 1e-6;

function avg(values = []) {
  const rows = values.filter(Number.isFinite);
  if (!rows.length) return null;
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

function ratio(part, total) {
  if (!Number.isFinite(total) || total <= 0) return null;
  return part / total;
}

function pct(part, total) {
  const value = ratio(part, total);
  return value === null ? null : Number((value * 100).toFixed(2));
}

function normalizeOutcome(value) {
  const outcome = String(value || "").toLowerCase();
  if (outcome === "win" || outcome === "loss") return outcome;
  return "ambiguous";
}

function normalizeDurationBucket(candlesInTrade) {
  if (!Number.isFinite(candlesInTrade)) return "unknown";
  if (candlesInTrade <= 3) return "short";
  if (candlesInTrade <= 8) return "medium";
  return "long";
}

function normalizeConfidenceBucket(confidence) {
  if (!Number.isFinite(confidence)) return "unknown";
  if (confidence < 0.45) return "low";
  if (confidence < 0.7) return "medium";
  return "high";
}

function hasWarnings(trade = {}) {
  const decision = toObject(trade.decisionSnapshot);
  return toArray(decision.warnings).length > 0;
}

function hasMatchedLibraryItems(trade = {}) {
  const decision = toObject(trade.decisionSnapshot);
  return toArray(decision.matchedLibraryItems).length > 0;
}

function frequencyMap(values = []) {
  const map = {};
  values.forEach((raw) => {
    const key = String(raw || "unknown");
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function resolveTopSetupDirection(features = []) {
  const pairMap = {};
  features.forEach((feature) => {
    const key = `${feature.setup}__${feature.direction}`;
    pairMap[key] = (pairMap[key] || 0) + 1;
  });
  const sorted = Object.entries(pairMap).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  const [topKey, count] = sorted[0];
  const [setup, direction] = topKey.split("__");
  return { setup, direction, count };
}

export function deriveTradeFeatures(trade = {}, options = {}) {
  const threshold = toNumber(options.cleanFollowthroughThreshold, 1.25) || 1.25;
  const outcome = normalizeOutcome(trade.outcome);
  const mfe = toNumber(trade.mfe, null);
  const mae = toNumber(trade.mae, null);
  const confidence = toNumber(trade.decisionSnapshot?.confidence, null);
  const candlesInTrade = toNumber(trade.candlesInTrade, null);
  const mfeMaeRatio = Number.isFinite(mfe)
    ? mfe / Math.max(Math.abs(toNumber(mae, 0) || 0), EPSILON)
    : null;

  return {
    id: trade.id ?? null,
    outcome,
    setup: String(trade.setup || trade.decisionSnapshot?.setup || "unknown_setup"),
    direction: String(trade.direction || trade.decisionSnapshot?.action || "unknown").toLowerCase(),
    riskReward: toNumber(trade.riskReward, null),
    candlesInTrade,
    timeInTradeSec: toNumber(trade.timeInTradeSec, null),
    mfe,
    mae,
    confidence,
    decisionReason: String(trade.decisionSnapshot?.reason || ""),
    favorableDominance: Number.isFinite(mfe) && Number.isFinite(mae) ? mfe > mae : null,
    mfeMaeRatio: Number.isFinite(mfeMaeRatio) ? mfeMaeRatio : null,
    cleanFollowthrough: Number.isFinite(mfeMaeRatio) ? mfeMaeRatio >= threshold : null,
    durationBucket: normalizeDurationBucket(candlesInTrade),
    confidenceBucket: normalizeConfidenceBucket(confidence),
    hasWarnings: hasWarnings(trade),
    hasDangerContext: hasDangerContext(trade),
    hasMatchedLibraryItems: hasMatchedLibraryItems(trade),
    hasLearningOutput: hasLearningOutput(trade),
    hasActiveLibraryContext: toArray(toObject(trade.libraryContextSnapshot).activeItems).length > 0,
  };
}

function summarizeBucket(features = []) {
  const count = features.length;
  const durations = frequencyMap(features.map((row) => row.durationBucket));
  const confidenceBuckets = frequencyMap(features.map((row) => row.confidenceBucket));
  const setupDistribution = frequencyMap(features.map((row) => row.setup));
  const directionDistribution = frequencyMap(features.map((row) => row.direction));

  return {
    count,
    avgCandlesInTrade: avg(features.map((row) => row.candlesInTrade)),
    avgTimeInTradeSec: avg(features.map((row) => row.timeInTradeSec)),
    avgMfe: avg(features.map((row) => row.mfe)),
    avgMae: avg(features.map((row) => row.mae)),
    avgMfeMaeRatio: avg(features.map((row) => row.mfeMaeRatio)),
    avgConfidence: avg(features.map((row) => row.confidence)),
    favorableDominanceRatio: ratio(features.filter((row) => row.favorableDominance === true).length, count),
    cleanFollowthroughRatio: ratio(features.filter((row) => row.cleanFollowthrough === true).length, count),
    warningsRatio: ratio(features.filter((row) => row.hasWarnings).length, count),
    dangerContextRatio: ratio(features.filter((row) => row.hasDangerContext).length, count),
    matchedLibraryItemsRatio: ratio(features.filter((row) => row.hasMatchedLibraryItems).length, count),
    activeLibraryContextRatio: ratio(features.filter((row) => row.hasActiveLibraryContext).length, count),
    learningOutputRatio: ratio(features.filter((row) => row.hasLearningOutput).length, count),
    durationBuckets: durations,
    confidenceBuckets,
    setupDistribution,
    directionDistribution,
    topSetupDirection: resolveTopSetupDirection(features),
  };
}

function differenceMetric(metric, wins, losses, mode = "delta") {
  const winValue = toNumber(wins?.[metric], null);
  const lossValue = toNumber(losses?.[metric], null);
  if (!Number.isFinite(winValue) || !Number.isFinite(lossValue)) return null;
  if (mode === "ratio" && Math.abs(lossValue) > EPSILON) return winValue / lossValue;
  return winValue - lossValue;
}

export function computeWinLossComparison(trades = [], options = {}) {
  const features = (Array.isArray(trades) ? trades : []).map((trade) => deriveTradeFeatures(trade, options));
  const wins = features.filter((row) => row.outcome === "win");
  const losses = features.filter((row) => row.outcome === "loss");
  const ambiguous = features.filter((row) => row.outcome === "ambiguous");

  const winSummary = summarizeBucket(wins);
  const lossSummary = summarizeBucket(losses);

  const differences = [];
  const register = (id, title, metric, mode = "delta") => {
    const value = differenceMetric(metric, winSummary, lossSummary, mode);
    if (!Number.isFinite(value)) return;
    differences.push({ id, title, metric, mode, value: Number(value.toFixed(4)) });
  };

  register("mfe_mae_ratio_gap", "MFE/MAE gap (wins-losses)", "avgMfeMaeRatio");
  register("confidence_gap", "Confidence gap (wins-losses)", "avgConfidence");
  register("warning_gap", "Warning ratio gap (wins-losses)", "warningsRatio");
  register("danger_gap", "Danger-context ratio gap (wins-losses)", "dangerContextRatio");
  register("matched_library_gap", "Matched-library ratio gap (wins-losses)", "matchedLibraryItemsRatio");
  register("duration_gap", "Avg candles gap (wins-losses)", "avgCandlesInTrade");

  return {
    totals: {
      total: features.length,
      wins: wins.length,
      losses: losses.length,
      ambiguous: ambiguous.length,
    },
    wins: winSummary,
    losses: lossSummary,
    ambiguous: summarizeBucket(ambiguous),
    differences,
    featureRows: features,
  };
}

function qualifierPriority({ evidenceGap = 0, sample = 0 }) {
  if (sample < 6) return "low";
  if (Math.abs(evidenceGap) >= 0.2) return "high";
  if (Math.abs(evidenceGap) >= 0.1) return "medium";
  return "low";
}

function pushQualifier(list, qualifier) {
  if (!qualifier) return;
  if (!qualifier.description || !qualifier.ruleHint) return;
  list.push(qualifier);
}

export function buildPositiveQualifiers(comparisonResult = {}, options = {}) {
  const wins = toObject(comparisonResult.wins);
  const losses = toObject(comparisonResult.losses);
  const totals = toObject(comparisonResult.totals);
  const limited = Boolean(options.limitedConfidence);
  const qualifiers = [];

  const sample = (totals.wins || 0) + (totals.losses || 0);

  const ratioGap = differenceMetric("avgMfeMaeRatio", wins, losses);
  if (Number.isFinite(ratioGap) && ratioGap >= 0.35) {
    pushQualifier(qualifiers, {
      id: "clean_followthrough",
      title: "Clean follow-through after entry",
      description: "Winning trades show stronger favorable-to-adverse excursion balance than losing trades.",
      evidence: {
        winAvgMfeMaeRatio: Number((wins.avgMfeMaeRatio || 0).toFixed(4)),
        lossAvgMfeMaeRatio: Number((losses.avgMfeMaeRatio || 0).toFixed(4)),
        ratioGap: Number(ratioGap.toFixed(4)),
      },
      ruleHint: "Use as confidence boost when projected post-entry structure suggests favorable follow-through.",
      priority: qualifierPriority({ evidenceGap: ratioGap, sample }),
      limitedConfidence: limited,
    });
  }

  const dominanceGap = differenceMetric("favorableDominanceRatio", wins, losses);
  if (Number.isFinite(dominanceGap) && dominanceGap >= 0.12) {
    pushQualifier(qualifiers, {
      id: "favorable_excursion_dominance",
      title: "Favorable excursion dominance",
      description: "Wins more often keep MFE above MAE across the trade lifecycle.",
      evidence: {
        winFavorableDominancePct: pct((wins.favorableDominanceRatio || 0), 1),
        lossFavorableDominancePct: pct((losses.favorableDominanceRatio || 0), 1),
        dominanceGapPct: pct(dominanceGap, 1),
      },
      ruleHint: "Prefer candidates with lower early adverse pressure relative to expected extension.",
      priority: qualifierPriority({ evidenceGap: dominanceGap, sample }),
      limitedConfidence: limited,
    });
  }

  const warningGap = differenceMetric("warningsRatio", losses, wins);
  if (Number.isFinite(warningGap) && warningGap >= 0.1) {
    pushQualifier(qualifiers, {
      id: "reduced_warning_conflict",
      title: "Reduced warning conflict",
      description: "Wins appear in cleaner contexts with fewer active warnings than losses.",
      evidence: {
        winWarningsPct: pct((wins.warningsRatio || 0), 1),
        lossWarningsPct: pct((losses.warningsRatio || 0), 1),
        warningGapPct: pct(warningGap, 1),
      },
      ruleHint: "Use as permit preference when candidate trade carries fewer unresolved warnings.",
      priority: qualifierPriority({ evidenceGap: warningGap, sample }),
      limitedConfidence: limited,
    });
  }

  const dangerGap = differenceMetric("dangerContextRatio", losses, wins);
  if (Number.isFinite(dangerGap) && dangerGap >= 0.1) {
    pushQualifier(qualifiers, {
      id: "less_context_conflict",
      title: "Lower danger-context conflict",
      description: "Winning trades are less exposed to danger/avoid-chase context than losses.",
      evidence: {
        winDangerContextPct: pct((wins.dangerContextRatio || 0), 1),
        lossDangerContextPct: pct((losses.dangerContextRatio || 0), 1),
        dangerGapPct: pct(dangerGap, 1),
      },
      ruleHint: "Apply as tie-breaker in favor of candidates with calmer context snapshots.",
      priority: qualifierPriority({ evidenceGap: dangerGap, sample }),
      limitedConfidence: limited,
    });
  }

  const durationGap = differenceMetric("avgCandlesInTrade", wins, losses);
  if (Number.isFinite(durationGap) && Math.abs(durationGap) >= 0.8) {
    const winDuration = toObject(wins.durationBuckets);
    const dominantWinDuration = Object.entries(winDuration).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
    pushQualifier(qualifiers, {
      id: "moderate_duration_resolution",
      title: "Healthier trade duration profile",
      description: `Wins concentrate more in ${dominantWinDuration} duration trades compared with losses.`,
      evidence: {
        winAvgCandles: Number((wins.avgCandlesInTrade || 0).toFixed(3)),
        lossAvgCandles: Number((losses.avgCandlesInTrade || 0).toFixed(3)),
        candlesGap: Number(durationGap.toFixed(3)),
      },
      ruleHint: "Use as ranking signal when expected holding profile matches historical winning duration band.",
      priority: qualifierPriority({ evidenceGap: durationGap / 5, sample }),
      limitedConfidence: limited,
    });
  }

  const confidenceGap = differenceMetric("avgConfidence", wins, losses);
  if (Number.isFinite(confidenceGap) && Math.abs(confidenceGap) >= 0.05) {
    pushQualifier(qualifiers, {
      id: "confidence_not_flat",
      title: "Confidence differentiates outcomes",
      description: "Decision confidence differs meaningfully between wins and losses instead of being flat.",
      evidence: {
        winAvgConfidence: Number((wins.avgConfidence || 0).toFixed(4)),
        lossAvgConfidence: Number((losses.avgConfidence || 0).toFixed(4)),
        confidenceGap: Number(confidenceGap.toFixed(4)),
      },
      ruleHint: "Use as soft boost when confidence is inside the historically winning bucket, not as hard veto.",
      priority: qualifierPriority({ evidenceGap: confidenceGap, sample }),
      limitedConfidence: limited,
    });
  }

  const winPair = toObject(wins.topSetupDirection);
  const lossPair = toObject(losses.topSetupDirection);
  if (winPair.setup && winPair.direction && (winPair.setup !== lossPair.setup || winPair.direction !== lossPair.direction)) {
    pushQualifier(qualifiers, {
      id: "setup_direction_alignment",
      title: "Setup-direction alignment",
      description: `Wins concentrate more around ${winPair.setup}/${winPair.direction} than losses.`,
      evidence: {
        topWinPair: winPair,
        topLossPair: lossPair,
      },
      ruleHint: "Use as ranking preference when candidate setup and direction align with winning concentration.",
      priority: qualifierPriority({ evidenceGap: (winPair.count || 0) / Math.max(1, wins.count || 1), sample }),
      limitedConfidence: limited,
    });
  }

  return qualifiers.slice(0, 8);
}

export function buildDataLimitations(trades = [], comparisonResult = {}, validation = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  const limits = [];
  const weakSignals = [];
  const totals = toObject(comparisonResult.totals);

  if (rows.length < 12) limits.push("Small sample size: fewer than 12 trades in export.");
  if ((totals.wins || 0) < 3) limits.push("Low win sample: fewer than 3 winning trades.");
  if ((totals.losses || 0) < 3) limits.push("Low loss sample: fewer than 3 losing trades.");

  const setupCount = Object.keys(toObject(comparisonResult.wins?.setupDistribution)).length
    + Object.keys(toObject(comparisonResult.losses?.setupDistribution)).length;
  if (setupCount <= 2) {
    limits.push("Setup diversity is low (possible monoculture). Results may not generalize.");
    weakSignals.push("setup_monoculture_detected");
  }

  const directionCount = new Set((comparisonResult.featureRows || []).map((row) => row.direction).filter(Boolean)).size;
  if (directionCount <= 1) {
    limits.push("Direction diversity is low (single-side concentration).");
    weakSignals.push("direction_monoculture_detected");
  }

  const confidenceRange = (() => {
    const values = (comparisonResult.featureRows || []).map((row) => row.confidence).filter(Number.isFinite);
    if (!values.length) return null;
    return Math.max(...values) - Math.min(...values);
  })();

  if (confidenceRange !== null && confidenceRange < 0.08) {
    limits.push("Decision confidence is nearly flat across the dataset.");
    weakSignals.push("confidence_flat_distribution");
  }

  const learningCoverage = ratio((comparisonResult.featureRows || []).filter((row) => row.hasLearningOutput).length, Math.max(1, rows.length));
  if (Number.isFinite(learningCoverage) && learningCoverage < 0.4) {
    limits.push("learningOutput coverage is low; fewer structured post-trade learnings.");
  }

  const missingMfeMae = rows.filter((trade) => !Number.isFinite(toNumber(trade.mfe, null)) || !Number.isFinite(toNumber(trade.mae, null))).length;
  if (missingMfeMae > 0) limits.push(`MFE/MAE missing on ${missingMfeMae} trades.`);

  if (validation?.limitedConfidence) limits.push("Input export validation flagged limited confidence.");

  return {
    dataLimitations: [...new Set(limits)],
    weakSignals: [...new Set(weakSignals)],
  };
}

function buildRecommendedNextIntegration(qualifiers = []) {
  if (!qualifiers.length) {
    return [
      "Collect more diverse sessions before integrating qualifiers into decision ranking.",
      "Keep this module in audit-only mode until at least one stable qualifier emerges.",
    ];
  }

  return [
    "Use top 1-2 high priority qualifiers as confidence boosts (not hard vetoes).",
    "Use context-related qualifiers as permit conditions only when conflict is clear and repeated.",
    "Use setup-direction qualifier as tie-breaker when multiple trade candidates are valid.",
    "Store qualifier hit/miss telemetry per trade candidate before enabling automation.",
  ];
}

export function extractWinningPatterns(data = {}, options = {}) {
  const payload = toObject(data);
  const trades = toArray(payload.trades);
  const validation = toObject(options.validation);
  const comparison = computeWinLossComparison(trades, options);

  const baselineLimitedConfidence = Boolean(validation.limitedConfidence)
    || trades.length < 8
    || comparison.totals.wins < 2
    || comparison.totals.losses < 2;

  const qualifiers = buildPositiveQualifiers(comparison, { limitedConfidence: baselineLimitedConfidence });
  const limitations = buildDataLimitations(trades, comparison, validation);

  return {
    schema: OUTPUT_SCHEMA,
    generatedAt: new Date().toISOString(),
    sourceSchema: payload.schema || "unknown",
    sessionContext: {
      symbol: payload.symbol || payload.sessionSummary?.symbol || null,
      timeframe: payload.timeframe || payload.sessionSummary?.timeframe || null,
      totalTrades: comparison.totals.total,
      wins: comparison.totals.wins,
      losses: comparison.totals.losses,
    },
    comparison: {
      wins: comparison.wins,
      losses: comparison.losses,
      differences: comparison.differences,
    },
    positiveQualifiers: qualifiers.slice(0, 8),
    weakSignals: limitations.weakSignals,
    dataLimitations: limitations.dataLimitations,
    recommendedNextIntegration: buildRecommendedNextIntegration(qualifiers),
    limitedConfidence: baselineLimitedConfidence,
  };
}
