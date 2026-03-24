import { activateLearnedRules } from "./ruleActivationEngine.js";
import { ingestLearningFromFeedback } from "./contextLearningEngine.js";
import { buildNextCandlePlan } from "./nextCandlePlanner.js";
import { computeContextScoring } from "./contextScoringEngine.js";
import { evaluateAutoShift } from "./autoShiftEngine.js";
import { computeConfidenceEngine } from "./confidenceEngine.js";
import { getManualControls } from "./manualControlsStore.js";

export const AGGRESSIVE_LEARNING_PROFILE = Object.freeze({
  profile: "aggressive_learning",
  enabled: true,
  paper_only: true,
  exploration_mode: true,
  exploration_bias: 0.7,
  exploitation_bias: 0.3,
  allow_trade_on_wait_in_paper: true,
  allow_high_danger_exploration: true,
  allow_low_confidence_exploration: true,
  min_samples_before_strict_block: 10,
  min_samples_before_context_maturity: 20,
  friction_block_live_only: true,
  danger_block_live_only: true,
  max_exploratory_trades_per_context: 5,
  max_consecutive_losses_before_context_pause: 3,
  context_pause_candles: 5,
  cooldown_candles: 1,
  one_trade_per_candle: true,
  one_active_trade_max: true,
  exploration_entry_quality_floor: "C",
  exploration_requires_trigger: true,
  exploration_requires_invalidation: true,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function mapBias(raw = "neutral") {
  const value = String(raw || "neutral").toLowerCase();
  if (["bullish", "long"].includes(value)) return "long";
  if (["bearish", "short"].includes(value)) return "short";
  return "neutral";
}

function mapEntryQuality(score = 0.5) {
  if (score >= 0.78) return "A";
  if (score >= 0.62) return "B";
  if (score >= 0.48) return "C";
  return "wait";
}

function qualityRank(quality = "wait") {
  return ({ A: 3, B: 2, C: 1, WAIT: 0 })[String(quality || "wait").toUpperCase()] ?? 0;
}

function rankToQuality(rank = 0) {
  if (rank >= 3) return "A";
  if (rank >= 2) return "B";
  if (rank >= 1) return "C";
  return "wait";
}

function contextMaturityForSamples(samples = 0, profile = AGGRESSIVE_LEARNING_PROFILE) {
  if (samples < Number(profile.min_samples_before_strict_block || 10)) return "immature";
  if (samples < Number(profile.min_samples_before_context_maturity || 20)) return "growing";
  return "mature";
}

export function buildBrainVerdict({ analysis = null, marketView = null, copilotFeedback = null, copilotEvaluation = null, modeState = {}, operatorState = {}, contextMemoryRow = null } = {}) {
  const probability = analysis?.pseudoMl?.probability || {};
  const structure = analysis?.overlays?.structureSummary || {};
  const baseBias = mapBias(probability.bias || analysis?.bias);
  const mode = modeState.mode || "copilot";
  const marketState = {
    regime: analysis?.pseudoMl?.regime?.regime || "unknown",
    momentum: analysis?.momentumCondition || "flat",
    volatility: analysis?.volatilityCondition || "normal",
    structurePosition: structure.breakState === "breakout" ? "near_highs" : structure.breakState === "breakdown" ? "near_lows" : "mid",
    contextualRisk: analysis?.continuationContext === "weak" ? "elevated" : "normal",
    entryTiming: analysis?.pushState === "pushing" ? "late" : "on_time",
    failedBreakout: (analysis?.sequenceFlags || []).some((row) => String(row).includes("rejection near highs")),
    momentumConflict: (analysis?.momentumCondition === "fading" && structure.bias === "bullish") || (analysis?.momentumCondition === "rising" && structure.bias === "bearish"),
    nearestResistance: analysis?.overlays?.nearestResistance,
    nearestSupport: analysis?.overlays?.nearestSupport,
    isCompression: analysis?.volatilityCondition === "compressed",
    symbol: marketView?.symbol || null,
    timeframe: marketView?.timeframe || null,
  };

  const invalidationsInContext = Number((operatorState?.operatorSelection || []).filter((a) => a === "veto").length || 0);
  const humanOverrideHits = Number(operatorState?.lastOperatorActionId ? 1 : 0);
  const ruleSet = activateLearnedRules({ marketState, copilotEvaluation });
  ruleSet.forEach((rule) => console.info(`[Brain/Udc] Learned rule activated: ${rule.id}`));

  const learning = ingestLearningFromFeedback(marketState, {
    invalidationsInContext,
    humanOverrideHits,
    confirmedBias: mapBias(copilotFeedback?.copilot_verdict?.trade_posture || baseBias),
    linkedRules: ruleSet.map((r) => r.id),
  });
  if (learning.signature) console.info(`[Brain/Udc] Context match found: ${learning.signature}`);

  const mergedContext = {
    ...(learning.learnedContextCurrent || {}),
    ...(contextMemoryRow || {}),
  };
  const contextScores = computeContextScoring(mergedContext);
  const manualControls = getManualControls();
  const learnedPenalty = learning.learnedContextCurrent?.penalty || 0;
  const learnedBoost = learning.learnedContextCurrent?.boost || 0;
  const rulePenalty = ruleSet.reduce((acc, row) => acc + Number(row.effect?.confidencePenalty || row.effect?.longPenalty || 0), 0);
  const ruleBoost = ruleSet.reduce((acc, row) => acc + Number(row.effect?.shortBoost || 0), 0);

  const frictionRaw = clamp(
    (marketState.entryTiming === "late" ? 0.22 : 0)
    + (marketState.failedBreakout ? 0.18 : 0)
    + (marketState.momentumConflict ? 0.18 : 0)
    + learnedPenalty * 0.55
    + (contextScores.danger_score * 0.55)
    + invalidationsInContext * 0.08
    + ruleSet.reduce((acc, row) => acc + Number(row.effect?.friction || 0), 0),
    0,
    1,
  );

  const scenarioReliability = clamp(
    Number(analysis?.scenario_primary?.reliability
      ?? analysis?.overlays?.scenarioReliability
      ?? mergedContext?.scenarioReliability
      ?? 0.5),
    0,
    1,
  );
  const confidencePacket = computeConfidenceEngine({
    contextMemory: {
      ...mergedContext,
      ...contextScores,
      samples: contextScores.samples,
      wins: contextScores.wins,
      losses: contextScores.losses,
      last_outcomes: contextScores.last_outcomes || mergedContext?.last_outcomes || [],
    },
    scenarioReliability,
    familiarity: contextScores.familiarity,
    learningMode: modeState.mode || "mixed",
    manualControls,
  });
  let confidence = clamp(
    confidencePacket.confidence_score
      + learnedBoost * 0.5
      - learnedPenalty * 0.5
      - rulePenalty * 0.25
      + (baseBias === "short" ? ruleBoost * 0.12 : 0),
    0,
    1,
  );
  let bias = modeState.manualBiasOverride || baseBias;

  if (mode === "observer") {
    bias = "neutral";
    confidence = clamp(confidence * 0.7, 0, 1);
  }

  if (contextScores.familiarity > 0.6 && contextScores.context_score > 0.64) {
    confidence = clamp(confidence + 0.08, 0, 1);
  }

  const strictnessPenalty = confidence < 0.3 ? 0.12 : confidence > 0.6 ? -0.04 : 0;
  const entryScore = clamp(
    ((Number(structure.entryQuality || 50) / 100) + confidence) / 2
    - frictionRaw * (confidence < 0.3 ? 0.55 : 0.35)
    - strictnessPenalty,
    0,
    1,
  );
  let entryQuality = mapEntryQuality(entryScore);
  let allowTrade = true;
  const noTradeReasons = [];
  const learningProfile = {
    ...AGGRESSIVE_LEARNING_PROFILE,
    exploration_bias: Number(manualControls?.exploration_bias_override ?? AGGRESSIVE_LEARNING_PROFILE.exploration_bias),
    exploitation_bias: Number(manualControls?.exploitation_bias_override ?? AGGRESSIVE_LEARNING_PROFILE.exploitation_bias),
  };
  const modeIsPaper = (modeState?.executorMode || "paper") === "paper";
  const sampleCount = Number(contextScores.samples || contextMemoryRow?.counts || contextMemoryRow?.samples || 0);
  let contextMaturity = contextMaturityForSamples(sampleCount, learningProfile);
  const contextPaused = Number(contextMemoryRow?.exploration_pause_remaining_candles || 0) > 0 || Number(contextMemoryRow?.blocked_for_candles || 0) > 0;
  const maturedBadContext = sampleCount >= 10 && Number(contextScores.winrate || 0) <= 0.35;
  const matureGoodContext = sampleCount >= 20 && Number(contextScores.winrate || 0) >= 0.55;
  const nextPlan = buildNextCandlePlan({ bias, confidence, friction: frictionRaw, marketState, activeRules: ruleSet, mode });
  const triggerConfirmed = Boolean(nextPlan?.trigger_long || nextPlan?.trigger_short);
  const invalidationDefined = Boolean(nextPlan?.invalidation);
  const isExplorationAllowed = Boolean(
    modeIsPaper
    && learningProfile.enabled
    && learningProfile.profile === "aggressive_learning"
    && learningProfile.exploration_mode
    && sampleCount < Number(learningProfile.min_samples_before_strict_block || 10)
    && triggerConfirmed
    && invalidationDefined
    && !contextPaused,
  );
  let bypassProtection = false;
  let explorationTradeAllowed = false;
  let explorationOverrideApplied = false;
  const bypassedBlocks = [];
  let tradeReasonMode = "policy_block";

  if (isExplorationAllowed) {
    bypassProtection = true;
    explorationTradeAllowed = true;
    explorationOverrideApplied = true;
    entryQuality = rankToQuality(Math.max(
      qualityRank(entryQuality),
      qualityRank(String(learningProfile.exploration_entry_quality_floor || "C").toUpperCase()),
    ));
    allowTrade = true;
    tradeReasonMode = "explore_to_learn";
    console.info("[LearningProfile] Exploration override enabled");
  }

  const disableContextBlocking = Boolean(manualControls?.disable_context_blocking);
  if (contextScores.danger_score > 0.65) {
    if (!bypassProtection) {
      if (disableContextBlocking) {
        noTradeReasons.push("manual_context_blocking_disabled_danger_ignored");
      } else {
        entryQuality = "wait";
        allowTrade = false;
        noTradeReasons.push("High danger context");
      }
    } else {
      bypassedBlocks.push("danger");
      console.info("[LearningProfile] Bypassing danger block");
    }
  }

  if (frictionRaw > 0.7) {
    if (!bypassProtection) {
      entryQuality = "wait";
      allowTrade = false;
      noTradeReasons.push("Friction too high (late/rejection/conflict risk)");
    } else {
      bypassedBlocks.push("friction");
      console.info("[LearningProfile] Bypassing friction block");
    }
  }
  if (maturedBadContext && !disableContextBlocking) {
    entryQuality = "wait";
    allowTrade = false;
    noTradeReasons.unshift("matured_bad_context");
    console.info("[LearningProfile] context matured into bad block");
  }

  if (Number(contextMemoryRow?.blocked_for_candles || 0) > 0 && !disableContextBlocking) {
    entryQuality = "wait";
    allowTrade = false;
    noTradeReasons.push("repeated_loss_context");
  }

  if (!bypassProtection && frictionRaw >= 0.68 && entryQuality !== "wait") {
    console.info(`[Brain/Udc] Entry quality downgraded ${entryQuality} -> wait by friction ${frictionRaw.toFixed(2)}`);
    entryQuality = "wait";
  }

  let posture = allowTrade ? nextPlan.posture : "wait";
  if (posture === "wait") allowTrade = false;

  if (matureGoodContext) {
    confidence = clamp(confidence + 0.08, 0, 1);
    posture = "execute_on_confirmation";
    tradeReasonMode = "exploitation";
    console.info("[LearningProfile] context promoted to exploitation");
  }

  if (isExplorationAllowed && entryQuality !== "wait") {
    explorationTradeAllowed = true;
    allowTrade = true;
    posture = "exploration";
    tradeReasonMode = "explore_to_learn";
  }

  if (!triggerConfirmed) {
    entryQuality = "wait";
    posture = "wait";
    allowTrade = false;
    noTradeReasons.unshift("missing_trigger");
  }
  if (!invalidationDefined) {
    entryQuality = "wait";
    posture = "wait";
    allowTrade = false;
    noTradeReasons.unshift("missing_invalidation");
  }

  if (confidence < 0.3) {
    entryQuality = "wait";
    posture = "wait";
    allowTrade = false;
    noTradeReasons.unshift("low_confidence_strict_confirmation_required");
  } else if (confidence > 0.6 && entryQuality === "wait" && triggerConfirmed && invalidationDefined) {
    entryQuality = "C";
    if (posture === "wait") posture = "execute_on_confirmation";
  }

  const autoShift = evaluateAutoShift({
    contextSignature: learning.signature || contextMemoryRow?.context_signature || null,
    contextMemory: {
      ...contextMemoryRow,
      ...contextScores,
      samples: sampleCount,
      last_outcomes: learning.learnedContextCurrent?.last_outcomes || contextMemoryRow?.last_outcomes || [],
    },
    learningProgress: {
      familiarity: contextScores.familiarity,
      context_score: contextScores.context_score,
    },
    verdict: {
      confidence,
      friction: frictionRaw,
      entry_quality: entryQuality,
      context_score: contextScores.context_score,
      danger_score: contextScores.danger_score,
      next_candle_plan: nextPlan,
      modeState,
      mode,
    },
    profile: learningProfile,
  });

  confidence = clamp(autoShift.final_confidence + Number(autoShift.confidence_boost || 0), 0, 1);
  entryQuality = autoShift.entry_quality;
  const adjustedFriction = clamp(frictionRaw * Number(autoShift.friction_penalty_multiplier || 1), 0, 1);
  contextMaturity = autoShift.context_maturity || contextMaturity;

  if ((autoShift.block_trading || autoShift.learning_mode === "blocked") && !disableContextBlocking) {
    allowTrade = false;
    posture = "wait";
    noTradeReasons.unshift("matured_bad_context");
    noTradeReasons.unshift("auto_shift_blocked");
  } else {
    allowTrade = Boolean(allowTrade && autoShift.allow_trade);
  }
  if (!allowTrade) entryQuality = "wait";

  if (allowTrade && tradeReasonMode === "policy_block") tradeReasonMode = "standard";

  console.info(`[Brain/Udc] Next candle posture: ${String(posture || "wait").replace(/\s+/g, "_")}`);

  const noTradeReason = !allowTrade || posture === "wait" || entryQuality === "wait"
    ? (noTradeReasons[0] || (marketState.momentumConflict ? "Wait: conflict between momentum and structure" : "Wait: learned friction degraded signal"))
    : null;

  const forcedLearningMode = manualControls?.force_learning_mode || null;
  if (forcedLearningMode) {
    console.info(`[Manual] learning mode overridden -> ${forcedLearningMode}`);
  }

  return {
    bias,
    confidence: Number(confidence.toFixed(3)),
    entry_quality: entryQuality,
    friction: Number(adjustedFriction.toFixed(3)),
    posture,
    allow_trade: allowTrade,
    active_rules: ruleSet,
    learned_context_match: learning.similarContexts,
    next_candle_plan: { ...nextPlan, posture },
    no_trade_reason: noTradeReason,
    confidence_components: confidencePacket.components,
    confidence_reason: confidencePacket.reason,
    confidence_label: confidencePacket.confidence_label,
    trade_strictness: confidence < 0.3 ? "strict" : confidence > 0.6 ? "adaptive" : "normal",
    size_multiplier_hint: Number((confidence < 0.3 ? 0.75 : confidence > 0.6 ? 1.1 : 1).toFixed(3)),
    learning_profile: learningProfile,
    learning_mode: forcedLearningMode || autoShift.learning_mode || (explorationOverrideApplied ? "exploration" : "mixed"),
    exploration_trade_allowed: explorationTradeAllowed,
    exploration_override_applied: explorationOverrideApplied,
    bypassed_blocks: bypassedBlocks,
    context_maturity: contextMaturity,
    trade_reason_mode: tradeReasonMode,
    decision_path: {
      context_score: contextScores.context_score,
      danger_score: contextScores.danger_score,
      familiarity: contextScores.familiarity,
      confidence_adjustment: contextScores.confidence_adjustment,
      friction: Number(adjustedFriction.toFixed(3)),
      allow_trade: allowTrade,
    },
    context_score: contextScores.context_score,
    danger_score: contextScores.danger_score,
    familiarity: contextScores.familiarity,
    confidence_adjustment: contextScores.confidence_adjustment,
    learned_bias: learning.learnedContextCurrent?.learned_bias || learning.learnedContextCurrent?.preferredPosture || "neutral",
    preferred_posture: matureGoodContext ? "execute_on_confirmation" : (learning.learnedContextCurrent?.preferredPosture || "wait"),
    last_outcomes: learning.learnedContextCurrent?.last_outcomes || [],
    executor_ready: mode === "executor" && Boolean(modeState.autoExecutionEnabled) && posture !== "wait" && allowTrade,
    auto_shift: autoShift,
    market_state: marketState,
    mode,
    learningEffects: {
      signature: learning.signature,
      learnedContextCurrent: {
        ...learning.learnedContextCurrent,
        ...contextScores,
      },
      shouldPersistOverride: modeState.lastAction === "invalidate_idea",
      overridePatch: {
        fromBias: baseBias,
        toBias: "neutral",
        reason: "invalidate_idea",
        contextSignature: learning.signature,
      },
    },
  };
}
