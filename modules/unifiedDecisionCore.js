import { activateLearnedRules } from "./ruleActivationEngine.js";
import { ingestLearningFromFeedback } from "./contextLearningEngine.js";
import { buildNextCandlePlan } from "./nextCandlePlanner.js";
import { computeContextScoring } from "./contextScoringEngine.js";

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

export function buildBrainVerdict({ analysis = null, marketView = null, copilotFeedback = null, copilotEvaluation = null, modeState = {}, operatorState = {} } = {}) {
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

  const contextScores = computeContextScoring(learning.learnedContextCurrent || {});
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

  const baseConfidence = clamp(Number(probability.confidence || 0) / 100, 0, 1);
  let confidence = clamp(
    baseConfidence
      + learnedBoost
      - learnedPenalty
      - rulePenalty
      + contextScores.confidence_adjustment
      + (baseBias === "short" ? ruleBoost * 0.4 : 0),
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

  const entryScore = clamp(((Number(structure.entryQuality || 50) / 100) + confidence) / 2 - frictionRaw * 0.4, 0, 1);
  let entryQuality = mapEntryQuality(entryScore);
  let allowTrade = true;
  const noTradeReasons = [];

  if (contextScores.danger_score > 0.65) {
    entryQuality = "wait";
    allowTrade = false;
    noTradeReasons.push("High danger context");
  }

  if (frictionRaw > 0.7) {
    entryQuality = "wait";
    allowTrade = false;
    noTradeReasons.push("Friction too high (late/rejection/conflict risk)");
  }

  if (frictionRaw >= 0.68 && entryQuality !== "wait") {
    console.info(`[Brain/Udc] Entry quality downgraded ${entryQuality} -> wait by friction ${frictionRaw.toFixed(2)}`);
    entryQuality = "wait";
  }

  const nextPlan = buildNextCandlePlan({ bias, confidence, friction: frictionRaw, marketState, activeRules: ruleSet, mode });
  let posture = allowTrade ? nextPlan.posture : "wait";
  if (posture === "wait") allowTrade = false;
  console.info(`[Brain/Udc] Next candle posture: ${String(posture || "wait").replace(/\s+/g, "_")}`);

  const noTradeReason = !allowTrade || posture === "wait" || entryQuality === "wait"
    ? (noTradeReasons[0] || (marketState.momentumConflict ? "Wait: conflict between momentum and structure" : "Wait: learned friction degraded signal"))
    : null;

  return {
    bias,
    confidence: Number(confidence.toFixed(3)),
    entry_quality: entryQuality,
    friction: Number(frictionRaw.toFixed(3)),
    posture,
    allow_trade: allowTrade,
    active_rules: ruleSet,
    learned_context_match: learning.similarContexts,
    next_candle_plan: { ...nextPlan, posture },
    no_trade_reason: noTradeReason,
    decision_path: {
      context_score: contextScores.context_score,
      danger_score: contextScores.danger_score,
      familiarity: contextScores.familiarity,
      confidence_adjustment: contextScores.confidence_adjustment,
      friction: Number(frictionRaw.toFixed(3)),
      allow_trade: allowTrade,
    },
    context_score: contextScores.context_score,
    danger_score: contextScores.danger_score,
    familiarity: contextScores.familiarity,
    confidence_adjustment: contextScores.confidence_adjustment,
    learned_bias: learning.learnedContextCurrent?.learned_bias || learning.learnedContextCurrent?.preferredPosture || "neutral",
    last_outcomes: learning.learnedContextCurrent?.last_outcomes || [],
    executor_ready: mode === "executor" && Boolean(modeState.autoExecutionEnabled) && posture !== "wait" && allowTrade,
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
