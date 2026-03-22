const TUNING_BOUNDS = {
  scoreThresholdDeltaMax: 5,
  confidenceDeltaMax: 0.05,
  momentumDeltaMax: 0.05,
  distanceDeltaMax: 0.2,
  penaltyDeltaMax: 0.1,
  weakSampleSize: 5,
  strongSampleSize: 9,
  booleanToggleSampleSize: 10,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function lossRate(stats = {}) {
  const total = toNumber(stats.count);
  if (!total) return 0;
  return toNumber(stats.losses) / total;
}

function winRate(stats = {}) {
  const total = toNumber(stats.count);
  if (!total) return 0;
  return toNumber(stats.wins) / total;
}

function confidenceFromEvidence({ sampleSize = 0, patternLossRate = 0, consistency = 0, severity = 0 }) {
  const sampleFactor = clamp(sampleSize / 12, 0, 1);
  const consistencyFactor = clamp(consistency, 0, 1);
  const poorWinFactor = clamp(1 - patternLossRate, 0, 1);
  const severityFactor = clamp(severity, 0, 1);
  const score = (sampleFactor * 0.4) + (consistencyFactor * 0.25) + (poorWinFactor * 0.2) + (severityFactor * 0.15);
  return Number(clamp(score, 0, 1).toFixed(3));
}

function buildChange(field, oldValue, newValue) {
  const isNumeric = Number.isFinite(Number(oldValue)) && Number.isFinite(Number(newValue));
  return {
    field,
    oldValue,
    newValue,
    delta: isNumeric ? Number((Number(newValue) - Number(oldValue)).toFixed(4)) : null,
  };
}

function buildProposalFragment({
  key,
  category,
  direction,
  title,
  reason,
  reasonCodes,
  sampleSize,
  winRateValue,
  changes,
  expectedEffect,
  confidence,
  autoApplicable,
  field,
}) {
  return {
    key,
    category,
    direction,
    title,
    reason,
    basedOn: {
      reasonCodes,
      sampleSize,
      winRate: Number(winRateValue.toFixed(3)),
    },
    changes,
    expectedEffect,
    confidence,
    autoApplicable,
    field,
  };
}

function evidenceStats(evidence = {}, reasonCode, direction = null) {
  if (direction && evidence?.byDirection?.[direction]?.reasonCodes?.[reasonCode]) {
    return evidence.byDirection[direction].reasonCodes[reasonCode];
  }
  return evidence?.byReasonCode?.[reasonCode] || null;
}

export function shouldTightenLongResistanceRule(evidence, policy, config = {}) {
  const stats = evidenceStats(evidence, "entered_into_resistance", "LONG");
  if (!stats || stats.count < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize) || lossRate(stats) < 0.6) return null;

  const oldDistance = toNumber(policy?.longEntry?.maxDistanceToResistance, 1);
  const oldPenalty = toNumber(policy?.penalties?.resistanceProximityPenalty, 0);
  const distanceDrop = clamp(0.05 + ((lossRate(stats) - 0.6) * 0.1), 0.03, TUNING_BOUNDS.distanceDeltaMax);
  const penaltyIncrease = clamp(0.03 + ((lossRate(stats) - 0.6) * 0.08), 0.02, TUNING_BOUNDS.penaltyDeltaMax);

  const consistency = stats.count >= TUNING_BOUNDS.strongSampleSize ? 0.9 : 0.7;
  const confidence = confidenceFromEvidence({ sampleSize: stats.count, patternLossRate: lossRate(stats), consistency, severity: 0.8 });

  return buildProposalFragment({
    key: "tighten_long_resistance",
    category: "threshold",
    direction: "LONG",
    title: "Tighten LONG resistance proximity entry rule",
    reason: "Repeated LONG losses show entries are occurring too close to resistance.",
    reasonCodes: ["entered_into_resistance"],
    sampleSize: stats.count,
    winRateValue: winRate(stats),
    changes: [
      buildChange("longEntry.maxDistanceToResistance", oldDistance, Number((oldDistance - distanceDrop).toFixed(4))),
      buildChange("penalties.resistanceProximityPenalty", oldPenalty, Number((oldPenalty + penaltyIncrease).toFixed(4))),
    ],
    expectedEffect: "Should reduce low-quality LONG entries taken too close to resistance.",
    confidence,
    autoApplicable: confidence >= 0.78 && stats.count >= TUNING_BOUNDS.strongSampleSize,
    field: "longEntry.maxDistanceToResistance",
  });
}

export function shouldTightenShortSupportRule(evidence, policy, config = {}) {
  const stats = evidenceStats(evidence, "entered_into_support", "SHORT");
  if (!stats || stats.count < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize) || lossRate(stats) < 0.6) return null;

  const oldDistance = toNumber(policy?.shortEntry?.maxDistanceToSupport, 1);
  const oldPenalty = toNumber(policy?.penalties?.supportProximityPenalty, 0);
  const distanceDrop = clamp(0.05 + ((lossRate(stats) - 0.6) * 0.1), 0.03, TUNING_BOUNDS.distanceDeltaMax);
  const penaltyIncrease = clamp(0.03 + ((lossRate(stats) - 0.6) * 0.08), 0.02, TUNING_BOUNDS.penaltyDeltaMax);
  const confidence = confidenceFromEvidence({ sampleSize: stats.count, patternLossRate: lossRate(stats), consistency: 0.8, severity: 0.8 });

  return buildProposalFragment({
    key: "tighten_short_support",
    category: "threshold",
    direction: "SHORT",
    title: "Tighten SHORT support proximity entry rule",
    reason: "Repeated SHORT losses show entries are occurring too close to support.",
    reasonCodes: ["entered_into_support"],
    sampleSize: stats.count,
    winRateValue: winRate(stats),
    changes: [
      buildChange("shortEntry.maxDistanceToSupport", oldDistance, Number((oldDistance - distanceDrop).toFixed(4))),
      buildChange("penalties.supportProximityPenalty", oldPenalty, Number((oldPenalty + penaltyIncrease).toFixed(4))),
    ],
    expectedEffect: "Should improve short selection when downside space is limited.",
    confidence,
    autoApplicable: confidence >= 0.78 && stats.count >= TUNING_BOUNDS.strongSampleSize,
    field: "shortEntry.maxDistanceToSupport",
  });
}

export function shouldIncreaseMomentumThreshold(evidence, direction, policy, config = {}) {
  const lowMomentumStats = evidenceStats(evidence, "low_momentum_entry", direction);
  const noFollowStats = evidenceStats(evidence, "no_followthrough", direction);
  const combinedCount = toNumber(lowMomentumStats?.count) + toNumber(noFollowStats?.count);
  if (combinedCount < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize)) return null;

  const weightedLossRate = ((lossRate(lowMomentumStats || {}) * toNumber(lowMomentumStats?.count)) + (lossRate(noFollowStats || {}) * toNumber(noFollowStats?.count))) / (combinedCount || 1);
  if (weightedLossRate < 0.58) return null;

  const baseField = direction === "SHORT" ? "shortEntry.minMomentum" : "longEntry.minMomentum";
  const oldMomentum = toNumber(direction === "SHORT" ? policy?.shortEntry?.minMomentum : policy?.longEntry?.minMomentum, 0.5);
  const oldNoFollowPenalty = toNumber(policy?.penalties?.noFollowThroughPenalty, 0);

  const bump = clamp(0.02 + ((weightedLossRate - 0.58) * 0.06), 0.015, TUNING_BOUNDS.momentumDeltaMax);
  const penaltyBump = clamp(0.02 + ((weightedLossRate - 0.58) * 0.07), 0.01, TUNING_BOUNDS.penaltyDeltaMax);
  const confidence = confidenceFromEvidence({ sampleSize: combinedCount, patternLossRate: weightedLossRate, consistency: 0.8, severity: 0.7 });

  return buildProposalFragment({
    key: `raise_momentum_${direction.toLowerCase()}`,
    category: "threshold",
    direction,
    title: `Raise ${direction} momentum quality threshold`,
    reason: `Repeated ${direction} losses show weak momentum and poor follow-through patterns.`,
    reasonCodes: ["low_momentum_entry", "no_followthrough"],
    sampleSize: combinedCount,
    winRateValue: 1 - weightedLossRate,
    changes: [
      buildChange(baseField, oldMomentum, Number((oldMomentum + bump).toFixed(4))),
      buildChange("penalties.noFollowThroughPenalty", oldNoFollowPenalty, Number((oldNoFollowPenalty + penaltyBump).toFixed(4))),
    ],
    expectedEffect: "Should filter weaker entries and improve continuation quality.",
    confidence,
    autoApplicable: confidence >= 0.8 && combinedCount >= TUNING_BOUNDS.strongSampleSize,
    field: baseField,
  });
}

export function shouldEnableBlockInRange(evidence, policy, config = {}) {
  if (policy?.filters?.blockInRange) return null;
  const stats = evidenceStats(evidence, "ranging_noise");
  if (!stats || stats.count < Math.max(config.minSampleSize || TUNING_BOUNDS.weakSampleSize, TUNING_BOUNDS.booleanToggleSampleSize) || lossRate(stats) < 0.62) return null;

  const confidence = confidenceFromEvidence({ sampleSize: stats.count, patternLossRate: lossRate(stats), consistency: 0.85, severity: 0.75 });
  return buildProposalFragment({
    key: "enable_block_in_range",
    category: "filter",
    direction: "BOTH",
    title: "Enable range environment trade block",
    reason: "Loss clusters show repeated poor performance in ranging/noise conditions.",
    reasonCodes: ["ranging_noise"],
    sampleSize: stats.count,
    winRateValue: winRate(stats),
    changes: [buildChange("filters.blockInRange", Boolean(policy?.filters?.blockInRange), true)],
    expectedEffect: "Should block more trades in choppy/ranging conditions.",
    confidence,
    autoApplicable: false,
    field: "filters.blockInRange",
  });
}

export function shouldIncreaseCountertrendPenalty(evidence, policy, config = {}) {
  const stats = evidenceStats(evidence, "countertrend_entry");
  if (!stats || stats.count < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize) || lossRate(stats) < 0.58) return null;

  const oldPenalty = toNumber(policy?.penalties?.countertrendPenalty, 0);
  const bump = clamp(0.03 + ((lossRate(stats) - 0.58) * 0.08), 0.02, TUNING_BOUNDS.penaltyDeltaMax);
  const confidence = confidenceFromEvidence({ sampleSize: stats.count, patternLossRate: lossRate(stats), consistency: 0.78, severity: 0.75 });

  return buildProposalFragment({
    key: "raise_countertrend_penalty",
    category: "penalty",
    direction: "BOTH",
    title: "Increase countertrend penalty",
    reason: "Countertrend entries are repeatedly underperforming.",
    reasonCodes: ["countertrend_entry"],
    sampleSize: stats.count,
    winRateValue: winRate(stats),
    changes: [buildChange("penalties.countertrendPenalty", oldPenalty, Number((oldPenalty + bump).toFixed(4)))],
    expectedEffect: "Should reduce countertrend exposure and improve directional discipline.",
    confidence,
    autoApplicable: confidence >= 0.8,
    field: "penalties.countertrendPenalty",
  });
}

export function shouldIncreaseNoFollowThroughPenalty(evidence, policy, config = {}) {
  const stats = evidenceStats(evidence, "no_followthrough");
  if (!stats || stats.count < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize) || lossRate(stats) < 0.57) return null;
  const oldPenalty = toNumber(policy?.penalties?.noFollowThroughPenalty, 0);
  const bump = clamp(0.03 + ((lossRate(stats) - 0.57) * 0.09), 0.02, TUNING_BOUNDS.penaltyDeltaMax);
  const confidence = confidenceFromEvidence({ sampleSize: stats.count, patternLossRate: lossRate(stats), consistency: 0.76, severity: 0.7 });

  return buildProposalFragment({
    key: "raise_no_followthrough_penalty",
    category: "penalty",
    direction: "BOTH",
    title: "Increase no-follow-through penalty",
    reason: "Repeated no-follow-through outcomes show continuation quality is too weak.",
    reasonCodes: ["no_followthrough"],
    sampleSize: stats.count,
    winRateValue: winRate(stats),
    changes: [buildChange("penalties.noFollowThroughPenalty", oldPenalty, Number((oldPenalty + bump).toFixed(4)))],
    expectedEffect: "Should penalize weak continuation setups more aggressively.",
    confidence,
    autoApplicable: confidence >= 0.82,
    field: "penalties.noFollowThroughPenalty",
  });
}

export function shouldIncreaseLateEntryPenalty(evidence, policy, config = {}) {
  const stats = evidenceStats(evidence, "late_entry");
  if (!stats || stats.count < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize) || lossRate(stats) < 0.56) return null;
  const oldPenalty = toNumber(policy?.penalties?.lateEntryPenalty, 0);
  const bump = clamp(0.025 + ((lossRate(stats) - 0.56) * 0.08), 0.015, TUNING_BOUNDS.penaltyDeltaMax);
  const confidence = confidenceFromEvidence({ sampleSize: stats.count, patternLossRate: lossRate(stats), consistency: 0.74, severity: 0.65 });

  return buildProposalFragment({
    key: "raise_late_entry_penalty",
    category: "penalty",
    direction: "BOTH",
    title: "Increase late-entry penalty",
    reason: "Late entries are consistently degrading outcomes.",
    reasonCodes: ["late_entry"],
    sampleSize: stats.count,
    winRateValue: winRate(stats),
    changes: [buildChange("penalties.lateEntryPenalty", oldPenalty, Number((oldPenalty + bump).toFixed(4)))],
    expectedEffect: "Should discourage delayed entries with weaker reward-to-risk.",
    confidence,
    autoApplicable: confidence >= 0.8,
    field: "penalties.lateEntryPenalty",
  });
}

export function shouldIncreaseConfidenceThreshold(evidence, direction, policy, config = {}) {
  const lowMomentumStats = evidenceStats(evidence, "low_momentum_entry", direction);
  const lateEntryStats = evidenceStats(evidence, "late_entry", direction);
  const total = toNumber(lowMomentumStats?.count) + toNumber(lateEntryStats?.count);
  if (total < (config.minSampleSize || TUNING_BOUNDS.weakSampleSize)) return null;

  const weightedLossRate = ((lossRate(lowMomentumStats || {}) * toNumber(lowMomentumStats?.count)) + (lossRate(lateEntryStats || {}) * toNumber(lateEntryStats?.count))) / (total || 1);
  if (weightedLossRate < 0.6) return null;

  const field = direction === "SHORT" ? "shortEntry.minConfidence" : "longEntry.minConfidence";
  const oldValue = toNumber(direction === "SHORT" ? policy?.shortEntry?.minConfidence : policy?.longEntry?.minConfidence, 0.55);
  const bump = clamp(0.015 + ((weightedLossRate - 0.6) * 0.05), 0.01, TUNING_BOUNDS.confidenceDeltaMax);
  const confidence = confidenceFromEvidence({ sampleSize: total, patternLossRate: weightedLossRate, consistency: 0.72, severity: 0.65 });

  return buildProposalFragment({
    key: `raise_confidence_${direction.toLowerCase()}`,
    category: "threshold",
    direction,
    title: `Increase ${direction} minimum confidence threshold`,
    reason: `Lower-confidence ${direction} entries are underperforming materially.`,
    reasonCodes: ["low_momentum_entry", "late_entry"],
    sampleSize: total,
    winRateValue: 1 - weightedLossRate,
    changes: [buildChange(field, oldValue, Number((oldValue + bump).toFixed(4)))],
    expectedEffect: "Should reduce lower-confidence entries and improve average setup quality.",
    confidence,
    autoApplicable: false,
    field,
  });
}

export function shouldRecommendStructureConfirmation(evidence, policy, config = {}) {
  if (policy?.filters?.requireStructureConfirmation) return null;
  const saves = toNumber(evidence?.operatorImpact?.vetoSavedLossCount);
  const blockedWinners = toNumber(evidence?.operatorImpact?.vetoBlockedWinnerCount);
  const netCorrectness = saves - blockedWinners;
  if (saves < Math.max(config.minSampleSize || TUNING_BOUNDS.weakSampleSize, TUNING_BOUNDS.booleanToggleSampleSize) || netCorrectness < 4) return null;

  const sampleSize = saves + blockedWinners;
  const pseudoWinRate = sampleSize > 0 ? saves / sampleSize : 0;
  const confidence = confidenceFromEvidence({ sampleSize, patternLossRate: 1 - pseudoWinRate, consistency: 0.9, severity: 0.8 });

  return buildProposalFragment({
    key: "enable_structure_confirmation",
    category: "filter",
    direction: "BOTH",
    title: "Require structure confirmation before entry",
    reason: "Operator vetoes are repeatedly preventing losses in weak-structure conditions.",
    reasonCodes: ["veto_saved_loss", "operator_context_correct"],
    sampleSize,
    winRateValue: pseudoWinRate,
    changes: [buildChange("filters.requireStructureConfirmation", Boolean(policy?.filters?.requireStructureConfirmation), true)],
    expectedEffect: "Should reduce structurally weak entries and align automation with repeated operator saves.",
    confidence,
    autoApplicable: false,
    field: "filters.requireStructureConfirmation",
  });
}

export { TUNING_BOUNDS };
