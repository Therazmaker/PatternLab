import { buildFuturesPolicyFeatures } from "./futuresPolicyFeatures.js";
import { evaluateFuturesPolicy } from "./futuresPolicyEngine.js";
import { computeFeatureSnapshot } from "./featureEngine.js";
import { classifyMarketRegime } from "./marketRegime.js";
import { computeProbabilityScores } from "./probabilityEngine.js";
import { computeOperatorModifier } from "./operatorModifierEngine.js";
import { combineFinalDecision } from "./finalDecisionCombiner.js";
import { buildContextSignature } from "./contextSignatureBuilder.js";
import { applyLearningModifier } from "./learningModifier.js";
import { loadOperatorPatternSummary } from "./storage/storage-adapter.js";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildDefaultOutcome(action) {
  if (action === "NO_TRADE") {
    return {
      status: "resolved",
      resolutionTimestamp: Date.now(),
      result: "skipped",
      pnlPct: 0,
      rMultiple: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      barsElapsed: 0,
      resolutionReason: "no-trade-policy",
    };
  }
  return { status: "pending", resolutionTimestamp: null, result: null };
}

function createRecordId(candle, candleIndex) {
  return ["live-shadow", candle.source, candle.asset, candle.timeframe, candle.id || candle.timestamp || candleIndex].join(":");
}

export function createLiveShadowSnapshot({ candle, candles, neuronActivations = [], seededPatterns = [], policyConfig = {}, sourceStatus = null, records = [] } = {}) {
  if (!candle?.closed) return null;
  const candleIndex = candles.findIndex((row) => row.id === candle.id);
  if (candleIndex < 0) return null;

  const id = createRecordId(candle, candleIndex);
  if (records.some((row) => row.id === id)) return null;

  const liveSignal = {
    id: `live_shadow_${candle.id}`,
    timestamp: candle.timestamp,
    asset: candle.asset,
    timeframe: candle.timeframe,
    direction: "CALL",
  };

  const features = buildFuturesPolicyFeatures({ signal: liveSignal, candles, neuronActivations, seededPatterns, candleIndex });
  const decision = evaluateFuturesPolicy({ state: features.state, candles, config: policyConfig });
  const pseudoMlFeature = computeFeatureSnapshot(candles, candleIndex);
  const regime = classifyMarketRegime(pseudoMlFeature);
  const probability = computeProbabilityScores({ feature: pseudoMlFeature, regime });

  const contextSignature = buildContextSignature({
    regime: regime.regime,
    swingStructure: features.state?.structure?.structureBias === "bullish" ? "HH_HL" : features.state?.structure?.structureBias === "bearish" ? "LH_LL" : "range",
    nearResistance: features.state?.nearResistance,
    nearSupport: features.state?.nearSupport,
    momentumState: Number(regime.strength || 0) >= 70 ? "strong" : Number(regime.strength || 0) >= 45 ? "medium" : "weak",
    followThroughState: Number(probability.confidence || 0) >= 0.7 ? "strong" : Number(probability.confidence || 0) >= 0.45 ? "medium" : "weak",
  });

  const operatorModifier = computeOperatorModifier({
    direction: probability.bias === "bullish" ? "LONG" : probability.bias === "bearish" ? "SHORT" : "NONE",
    bullishScore: probability.bullishScore,
    bearishScore: probability.bearishScore,
    confidence: Number(decision.confidence || 0),
  }, contextSignature, loadOperatorPatternSummary() || {}, null);

  const machineSignal = {
    direction: probability.bias === "bullish" ? "LONG" : probability.bias === "bearish" ? "SHORT" : "NONE",
    bullishScore: probability.bullishScore,
    bearishScore: probability.bearishScore,
    confidence: Number(decision.confidence || 0),
  };

  const learningModifier = applyLearningModifier(machineSignal, { decision: decision.evidence?.structure?.decision || "ALLOW" }, {
    nearSupport: features.state?.nearSupport,
    nearResistance: features.state?.nearResistance,
    compression: features.state?.structure?.entryLocationScore < 45,
    momentumState: Number(regime.strength || 0) >= 70 ? "strong" : Number(regime.strength || 0) >= 45 ? "medium" : "weak",
    failedBreakout: Boolean(features.state?.structure?.structureBreakState === "failed"),
  });

  const combinedDecision = combineFinalDecision(machineSignal, { decision: learningModifier.structureOverride }, operatorModifier, learningModifier);

  return {
    id,
    timestamp: new Date(candle.timestamp).getTime(),
    symbol: candle.asset,
    timeframe: candle.timeframe,
    source: candle.source,
    candleIndex,
    policy: {
      strategyId: "live-shadow-policy",
      action: decision.action,
      confidence: toNumber(decision.confidence, 0),
      reason: decision.reason || "",
      finalDecision: combinedDecision.finalDecision,
      finalBias: combinedDecision.finalBias,
      finalConfidence: combinedDecision.confidence,
      decisionBreakdown: combinedDecision.decisionBreakdown,
      probabilityBias: probability.bias,
      regime: regime.regime,
      regimeStrength: regime.strength,
    },
    plan: {
      referencePrice: toNumber(decision.executionPlan?.entryPrice, toNumber(candle.close, null)),
      stopLoss: toNumber(decision.executionPlan?.stopLoss, null),
      takeProfit: toNumber(decision.executionPlan?.takeProfit, null),
    },
    stateSummary: {
      contextSignature,
      nearSupport: features.state?.nearSupport,
      nearResistance: features.state?.nearResistance,
      entryLocationScore: features.state?.structure?.entryLocationScore ?? null,
      structureBreakState: features.state?.structure?.structureBreakState || null,
      operatorModifier,
      learningModifier,
      pseudoMlFeature,
      regime,
      probability,
    },
    outcome: buildDefaultOutcome(decision.action),
    decisionTrace: {
      machine: {
        action: decision.action,
        confidence: toNumber(decision.confidence, 0),
        reason: decision.reason || "",
        bullishScore: probability.bullishScore,
        bearishScore: probability.bearishScore,
        neutralScore: probability.neutralScore,
        probabilityBias: probability.bias,
      },
      operatorCorrected: null,
    },
    connection: {
      connected: Boolean(sourceStatus?.connected),
      reconnectAttempts: Number(sourceStatus?.reconnectAttempts || 0),
      streamStatus: sourceStatus?.statusType || "unknown",
    },
    _meta: { createdAt: new Date().toISOString() },
  };
}
