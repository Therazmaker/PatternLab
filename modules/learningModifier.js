import { getLearningModel } from "./learningEngine.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function asDirection(signal = {}) {
  const direction = String(signal.direction || signal.bias || "NONE").toUpperCase();
  return ["LONG", "SHORT", "NONE"].includes(direction) ? direction : "NONE";
}

function resolvePatternStats(model = {}, key = "") {
  const memory = model?.patternMemory && typeof model.patternMemory === "object" ? model.patternMemory : {};
  return memory[key] || { occurrences: 0, wins: 0, losses: 0, winRate: 0, avgReturn: 0 };
}

function summarizeTier(occurrences = 0, confidence = 0) {
  if (occurrences >= 8 && confidence >= 0.65) return { tier: "strong", scale: 1.8, forceConfirmation: true };
  if (occurrences >= 4 && confidence >= 0.55) return { tier: "moderate", scale: 1.35, forceConfirmation: false };
  return { tier: "weak", scale: 1.05, forceConfirmation: false };
}

function inferConfidenceFromPattern(stats = {}) {
  const winRateDistance = Math.abs(Number(stats.winRate || 0) - 0.5) * 2;
  const avgReturnMagnitude = Math.min(1, Math.abs(Number(stats.avgReturn || 0)) * 25);
  return clamp(winRateDistance * 0.65 + avgReturnMagnitude * 0.35, 0, 1);
}

function makeMatchTrace({ key, label, weight, stats }) {
  const confidence = inferConfidenceFromPattern(stats);
  const tierMeta = summarizeTier(Number(stats.occurrences || 0), confidence);
  const adjustment = Number((Number(weight || 0) * tierMeta.scale).toFixed(4));
  return {
    key,
    name: label,
    occurrences: Number(stats.occurrences || 0),
    wins: Number(stats.wins || 0),
    losses: Number(stats.losses || 0),
    winRate: Number(stats.winRate || 0),
    avgReturn: Number(stats.avgReturn || 0),
    confidence: Number(confidence.toFixed(4)),
    evidenceTier: tierMeta.tier,
    adjustmentApplied: adjustment,
    forceConfirmation: tierMeta.forceConfirmation,
  };
}

export function applyLearningModifier(machineSignal = {}, structureFilterResult = {}, context = {}) {
  const model = getLearningModel();
  const direction = asDirection(machineSignal);
  let modifierScore = 0;
  const reasonCodes = [];
  const matchedPatterns = [];
  const penalties = [];
  const boosts = [];
  const weakEffectThreshold = 0.035;
  let requiresConfirmation = false;
  let forcedByLearning = false;

  const applyTrace = (trace, reasonCode = "", effectType = "penalty") => {
    matchedPatterns.push(trace);
    modifierScore += Number(trace.adjustmentApplied || 0);
    if (reasonCode) reasonCodes.push(reasonCode);
    if (effectType === "boost") boosts.push(trace);
    else penalties.push(trace);
    console.debug("Learning pattern matched", {
      pattern: trace.name,
      occurrences: trace.occurrences,
      winRate: trace.winRate,
      avgReturn: trace.avgReturn,
      adjustmentApplied: trace.adjustmentApplied,
      evidenceTier: trace.evidenceTier,
    });
  };

  if (direction === "LONG" && context.nearResistance) {
    const trace = makeMatchTrace({
      key: "long_into_resistance",
      label: "penalize long near resistance in compression",
      weight: model.weights.longNearResistance,
      stats: resolvePatternStats(model, "long_into_resistance"),
    });
    applyTrace(trace, trace.adjustmentApplied < 0 ? "learning_penalty_long_near_resistance" : "", "penalty");
  }

  if (direction === "SHORT" && context.nearSupport) {
    const trace = makeMatchTrace({
      key: "short_into_support",
      label: "penalize short near support in compression",
      weight: model.weights.shortNearSupport,
      stats: resolvePatternStats(model, "short_into_support"),
    });
    applyTrace(trace, trace.adjustmentApplied < 0 ? "learning_penalty_short_near_support" : "", "penalty");
  }

  if (direction === "SHORT" && context.failedBreakout) {
    const trace = makeMatchTrace({
      key: "failed_breakout_short",
      label: "boost short after failed breakout",
      weight: model.weights.shortAfterFailedBreakout,
      stats: resolvePatternStats(model, "failed_breakout_short"),
    });
    applyTrace(trace, trace.adjustmentApplied > 0 ? "learning_boost_short_failed_breakout" : "", "boost");
  }

  if (String(context.momentumState || "").toLowerCase() === "weak") {
    const trace = makeMatchTrace({
      key: "weak_momentum_penalty",
      label: "require confirmation in weak momentum ranges",
      weight: model.weights.momentumWeakPenalty,
      stats: resolvePatternStats(model, "weak_momentum_penalty"),
    });
    applyTrace(trace, trace.adjustmentApplied < 0 ? "learning_penalty_weak_momentum" : "", "penalty");
    if (trace.forceConfirmation) {
      requiresConfirmation = true;
      forcedByLearning = true;
      reasonCodes.push("learning_forced_confirmation_high_confidence_pattern");
      console.debug("Learning forced confirmation", {
        reason: "high_confidence_repeated_pattern",
        pattern: trace.name,
        occurrences: trace.occurrences,
      });
    }
  }

  if (model.toggles.requireConfirmationInCompression && context.compression) {
    requiresConfirmation = true;
    forcedByLearning = true;
    reasonCodes.push("learning_requires_confirmation_in_compression");
    console.debug("Learning forced confirmation", {
      reason: "compression_toggle",
      compression: Boolean(context.compression),
    });
  }

  if (Math.abs(modifierScore) < weakEffectThreshold && matchedPatterns.length) {
    reasonCodes.push("learning_modifier_below_threshold");
    console.debug("Learning had no effect", {
      modifierScore,
      threshold: weakEffectThreshold,
      matchedPatterns: matchedPatterns.map((row) => row.name),
    });
  } else if (matchedPatterns.length) {
    console.debug("Learning modifier applied", {
      modifierScore,
      requiresConfirmation,
      forcedByLearning,
      matchedPatterns: matchedPatterns.map((row) => ({
        name: row.name,
        adjustmentApplied: row.adjustmentApplied,
        evidenceTier: row.evidenceTier,
      })),
    });
  }

  const decision = String(structureFilterResult.decision || "ALLOW").toUpperCase();
  const effectiveDecision = requiresConfirmation && decision === "ALLOW"
    ? "REQUIRES_MANUAL_CONFIRMATION"
    : decision;

  const scoredModifier = clamp(modifierScore, -0.7, 0.7);
  const modifierEffect = Math.abs(scoredModifier) < weakEffectThreshold ? "none" : scoredModifier > 0 ? "boost" : "penalty";
  const topPattern = matchedPatterns[0];
  const explanation = !matchedPatterns.length
    ? "No learned pattern matched the current context."
    : `Matched ${matchedPatterns.length} learned pattern(s); strongest '${topPattern?.name || "pattern"}' applied ${topPattern?.adjustmentApplied ?? 0}.`;

  return {
    modifierScore: scoredModifier,
    requiresConfirmation,
    forcedByLearning,
    reasonCodes,
    matchedPatterns,
    activePenalties: penalties,
    activeBoosts: boosts,
    modifierEffect,
    explanation,
    learningModifierScore: scoredModifier,
    modelVersion: model.schema,
    structureOverride: effectiveDecision,
    weakEffectThreshold,
    model,
  };
}
