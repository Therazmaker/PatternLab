import { buildFuturesPolicyFeatures } from "./futuresPolicyFeatures.js";
import { evaluateFuturesPolicy } from "./futuresPolicyEngine.js";
import { replayFuturesDecision } from "./futuresReplay.js";
import { computeFeatureSnapshot } from "./featureEngine.js";
import { classifyMarketRegime } from "./marketRegime.js";
import { computeProbabilityScores } from "./probabilityEngine.js";
import { applyOperatorFeedback, deriveOperatorPatternFeedback } from "./operatorFeedback.js";
import { computeOperatorModifier } from "./operatorModifierEngine.js";
import { combineFinalDecision } from "./finalDecisionCombiner.js";
import { buildContextSignature } from "./contextSignatureBuilder.js";
import { createOperatorActionLogger } from "./operatorActionLogger.js";
import { evaluateOperatorAction } from "./operatorOutcomeEvaluator.js";
import { analyzeOperatorPatterns } from "./operatorPatternAnalyzer.js";
import {
  loadDecisionMemories,
  loadOperatorActions,
  loadOperatorPatternSummary,
  loadTradeMemories,
  saveOperatorPatternSummary,
} from "./storage/storage-adapter.js";

const DEFAULT_MAX_HISTORY = 400;

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createRecordId(candle, candleIndex) {
  return ["live-shadow", candle.source, candle.asset, candle.timeframe, candle.id || candle.timestamp || candleIndex].join(":");
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
  return {
    status: "pending",
    resolutionTimestamp: null,
    result: null,
    pnlPct: null,
    rMultiple: null,
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    barsElapsed: null,
    resolutionReason: null,
  };
}

function mapReplayOutcome(replay = {}) {
  const type = String(replay.outcomeType || "");
  if (type === "tp") return "win";
  if (type === "sl") return "loss";
  if (type === "timeout") return Math.abs(Number(replay.pnlR || 0)) < 0.02 ? "flat" : (Number(replay.pnlR || 0) > 0 ? "win" : "loss");
  return "flat";
}

function buildMachineDecisionTrace(record = {}) {
  return {
    action: record.policy?.action || "NO_TRADE",
    confidence: toNumber(record.policy?.confidence, 0),
    reason: record.policy?.reason || "",
    bullishScore: toNumber(record.policy?.bullishScore, 0),
    bearishScore: toNumber(record.policy?.bearishScore, 0),
    neutralScore: toNumber(record.policy?.neutralScore, 0),
    probabilityBias: record.policy?.probabilityBias || "neutral",
    probabilityConfidence: toNumber(record.policy?.probabilityConfidence, 0),
    plan: record.plan || null,
  };
}

function replayDecisionForComparison(trace = {}, candles = [], candleIndex = 0, maxHoldBars = 24) {
  const action = trace?.action || trace?.finalAction || "NO_TRADE";
  if (action === "NO_TRADE") {
    return {
      action: "NO_TRADE",
      result: "skipped",
      pnlPct: 0,
      rMultiple: 0,
      resolutionReason: "no-trade-policy",
    };
  }
  const plan = trace?.plan || {};
  const replay = replayFuturesDecision({
    action,
    executionPlan: {
      entryPrice: plan.referencePrice ?? plan.entryPrice ?? null,
      stopLoss: plan.stopLoss ?? null,
      takeProfit: plan.takeProfit ?? null,
    },
  }, candles, candleIndex, { maxBarsHold: maxHoldBars });
  return {
    action,
    result: mapReplayOutcome(replay),
    pnlPct: toNumber(replay.pnlPct, null),
    rMultiple: toNumber(replay.pnlR, null),
    barsElapsed: replay.barsHeld ?? null,
    resolutionReason: replay.outcomeType || "timeout",
  };
}

function hasResolutionSignal(record, candles, maxHoldBars) {
  const action = record?.policy?.action;
  if (action === "NO_TRADE") return { resolvable: true, reason: "no-trade" };
  const entryIndex = Number(record?.candleIndex);
  if (!Number.isInteger(entryIndex) || entryIndex < 0) return { resolvable: false };
  if (candles.length <= entryIndex + 1) return { resolvable: false };

  const plan = record.plan || {};
  const stop = toNumber(plan.stopLoss, null);
  const target = toNumber(plan.takeProfit, null);
  const hasStops = Number.isFinite(stop) && Number.isFinite(target);
  const future = candles.slice(entryIndex + 1, entryIndex + 1 + maxHoldBars);

  for (const candle of future) {
    const high = toNumber(candle.high, null);
    const low = toNumber(candle.low, null);
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    const hitTp = action === "LONG" ? high >= target : low <= target;
    const hitSl = action === "LONG" ? low <= stop : high >= stop;
    if (hasStops && (hitTp || hitSl)) return { resolvable: true, reason: "tp-sl-hit" };
  }

  if (future.length >= maxHoldBars) return { resolvable: true, reason: "hold-expired" };
  return { resolvable: false };
}

export function createLiveShadowMonitor(options = {}) {
  const maxHistory = Math.max(100, Number(options.maxHistory) || DEFAULT_MAX_HISTORY);
  const operatorActionLogger = createOperatorActionLogger();
  let records = [];
  const pendingIndex = new Map();

  function syncPendingIndex() {
    pendingIndex.clear();
    records.forEach((record) => {
      if (record?.outcome?.status === "pending") pendingIndex.set(record.id, true);
    });
  }

  function setRecords(nextRecords = []) {
    records = Array.isArray(nextRecords)
      ? [...nextRecords].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, maxHistory)
      : [];
    syncPendingIndex();
    return records;
  }

  function getRecords() {
    return [...records];
  }

  function upsertRecord(record) {
    const idx = records.findIndex((row) => row.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records = [record, ...records];
    records = records.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, maxHistory);
    if (record?.outcome?.status === "pending") pendingIndex.set(record.id, true);
    else pendingIndex.delete(record.id);
  }

  // Creates the normalized live-shadow record at candle close.
  function createSnapshot({ candle, candles, neuronActivations = [], seededPatterns = [], policyConfig = {}, sourceStatus = null }) {
    if (!candle?.closed) return null;
    const candleIndex = candles.findIndex((row) => row.id === candle.id);
    if (candleIndex < 0) return null;

    const liveSignal = {
      id: `live_shadow_${candle.id}`,
      timestamp: candle.timestamp,
      asset: candle.asset,
      timeframe: candle.timeframe,
      direction: "CALL",
      marketRegime: "live-observer",
      entryPrice: candle.close,
      contextScore: 50,
      radarScore: 50,
      freshnessScore: 50,
      patternMeta: { robustness: { robustnessScore: 55, overfitRisk: "low" } },
    };

    const features = buildFuturesPolicyFeatures({
      signal: liveSignal,
      candles,
      neuronActivations,
      seededPatterns,
      candleIndex,
    });

    const decision = evaluateFuturesPolicy({
      state: features.state,
      candles,
      config: policyConfig,
    });

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

    const operatorPatternSummary = loadOperatorPatternSummary() || {};
    const operatorModifier = computeOperatorModifier({
      direction: probability.bias === "bullish" ? "LONG" : probability.bias === "bearish" ? "SHORT" : "NONE",
      bullishScore: probability.bullishScore,
      bearishScore: probability.bearishScore,
      confidence: probability.confidence,
    }, contextSignature, operatorPatternSummary, null);

    const combinedDecision = combineFinalDecision({
      direction: probability.bias === "bullish" ? "LONG" : probability.bias === "bearish" ? "SHORT" : "NONE",
      bullishScore: probability.bullishScore,
      bearishScore: probability.bearishScore,
      confidence: Number(decision.confidence || 0),
    }, {
      decision: decision.evidence?.structure?.decision || "ALLOW",
      reasons: decision.evidence?.structure?.reasons || [],
    }, operatorModifier);

    const id = createRecordId(candle, candleIndex);
    if (records.some((row) => row.id === id)) return null;

    return {
      id,
      timestamp: new Date(candle.timestamp).getTime(),
      symbol: candle.asset,
      timeframe: candle.timeframe,
      source: candle.source,
      candleIndex,
      sequence: candleIndex,
      market: {
        close: toNumber(candle.close, null),
        open: toNumber(candle.open, null),
        high: toNumber(candle.high, null),
        low: toNumber(candle.low, null),
        candleStatus: candle.closed ? "closed" : "open",
      },
      connection: {
        connected: Boolean(sourceStatus?.connected),
        reconnectAttempts: Number(sourceStatus?.reconnectAttempts || 0),
        streamStatus: sourceStatus?.statusType || "unknown",
      },
      policy: {
        strategyId: "live-shadow-policy",
        strategyName: "Live Shadow Policy",
        action: decision.action,
        confidence: toNumber(decision.confidence, 0),
        reason: decision.reason || "",
        actionScores: decision.actionScores || {},
        thesisTags: decision.evidence?.regimeFlags || [],
        warnings: decision.evidence?.warningFlags || [],
        supportingEvidence: decision.evidence || {},
        structureDecision: decision.evidence?.structure?.decision || "allow",
        structureReasons: decision.evidence?.structure?.reasons || [],
        finalDecision: combinedDecision.finalDecision,
        finalBias: combinedDecision.finalBias,
        finalConfidence: combinedDecision.confidence,
        finalDecisionSummary: combinedDecision.summaryText,
        bullishScore: probability.bullishScore,
        bearishScore: probability.bearishScore,
        neutralScore: probability.neutralScore,
        probabilityBias: probability.bias,
        probabilityConfidence: probability.confidence,
        probabilityExplanation: probability.explanation,
        regime: regime.regime,
        regimeStrength: regime.strength,
        regimeExplanation: regime.explanation,
      },
      plan: {
        entryType: decision.action === "NO_TRADE" ? null : "shadow-close",
        referencePrice: toNumber(decision.executionPlan?.entryPrice, toNumber(candle.close, null)),
        stopLoss: toNumber(decision.executionPlan?.stopLoss, null),
        takeProfit: toNumber(decision.executionPlan?.takeProfit, null),
        riskReward: toNumber(decision.executionPlan?.riskReward, null),
        invalidation: decision.executionPlan?.entryZone ? `entry-zone:${JSON.stringify(decision.executionPlan.entryZone)}` : null,
      },
      stateSummary: {
        activeNeurons: features.state?.activeNeuronIds || [],
        neuronCount: Number(features.state?.neuronCount || 0),
        contextScore: toNumber(features.state?.contextScore, null),
        radarScore: toNumber(features.state?.radarScore, null),
        marketRegime: features.state?.marketRegime || null,
        directionBias: features.state?.directionBias > 0 ? "bullish" : features.state?.directionBias < 0 ? "bearish" : "neutral",
        seededMatches: features.state?.seededMatches || [],
        nearSupport: typeof features.state?.nearSupport === "boolean" ? features.state.nearSupport : null,
        nearResistance: typeof features.state?.nearResistance === "boolean" ? features.state.nearResistance : null,
        structureBias: features.state?.structure?.structureBias || null,
        structureBreakState: features.state?.structure?.structureBreakState || null,
        entryLocationScore: features.state?.structure?.entryLocationScore ?? null,
        supportDistancePct: features.state?.structure?.nearestSupportDistancePct ?? null,
        resistanceDistancePct: features.state?.structure?.nearestResistanceDistancePct ?? null,
        pseudoMlFeature,
        regime,
        probability,
        contextSignature,
        operatorModifier,
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
          probabilityConfidence: probability.confidence,
          plan: {
            referencePrice: toNumber(decision.executionPlan?.entryPrice, toNumber(candle.close, null)),
            stopLoss: toNumber(decision.executionPlan?.stopLoss, null),
            takeProfit: toNumber(decision.executionPlan?.takeProfit, null),
            riskReward: toNumber(decision.executionPlan?.riskReward, null),
          },
        },
        operatorCorrected: null,
      },
      operatorFeedback: {
        actions: [],
        note: "",
        timestamp: null,
        history: [],
      },
      learningMemory: {
        patterns: [],
      },
      _meta: {
        policyVersion: decision.policyVersion,
        createdAt: new Date().toISOString(),
      },
    };
  }

  function applyRecordOperatorFeedback(id, payload = {}) {
    const idx = records.findIndex((row) => row.id === id);
    if (idx < 0) return null;
    const record = records[idx];
    const applied = applyOperatorFeedback(record, payload);
    if (!applied?.recalculated) return null;
    const machineTrace = record.decisionTrace?.machine || buildMachineDecisionTrace(record);
    const corrected = {
      ...applied.recalculated,
      action: applied.recalculated.finalAction,
      plan: machineTrace.plan || record.plan || null,
    };
    const next = {
      ...record,
      operatorFeedback: {
        actions: applied.actions,
        note: applied.note,
        timestamp: applied.recalculated.timestamp,
        history: [
          ...(record.operatorFeedback?.history || []),
          {
            actions: applied.actions,
            note: applied.note,
            timestamp: applied.recalculated.timestamp,
            recalculated: applied.recalculated,
          },
        ].slice(-25),
      },
      decisionTrace: {
        machine: machineTrace,
        operatorCorrected: corrected,
      },
      learningMemory: {
        patterns: [...new Set([...(record.learningMemory?.patterns || []), ...deriveOperatorPatternFeedback({ ...record, operatorFeedback: applied, decisionTrace: { machine: machineTrace, operatorCorrected: corrected } })])],
      },
    };

    const fromAction = record.policy?.finalDecision || "WARN";
    const toAction = corrected.finalState === "operator_vetoed" ? "BLOCK" : corrected.finalState === "requires_manual_confirmation" ? "REQUIRES_MANUAL_CONFIRMATION" : fromAction;
    const actionRecord = operatorActionLogger.logOperatorAction({
      actionId: `op_${record.id}_${Date.now()}`,
      timestamp: applied.recalculated.timestamp,
      symbol: record.symbol,
      timeframe: record.timeframe,
      linkedTradeId: record.id,
      linkedDecisionId: record.id,
      rawSignal: {
        direction: machineTrace.action === "LONG" || machineTrace.action === "SHORT" ? machineTrace.action : "NONE",
        bullishScore: machineTrace.bullishScore,
        bearishScore: machineTrace.bearishScore,
        confidence: machineTrace.confidence,
        reasonCodes: [machineTrace.reason || "machine_signal"],
      },
      operatorAction: {
        type: applied.actions?.[0] || "none",
        note: applied.note || null,
      },
      context20: {
        contextSignature: record.stateSummary?.contextSignature,
        regime: record.policy?.regime,
      },
      immediateEffect: {
        decisionChanged: machineTrace.action !== corrected.finalAction || fromAction !== toAction,
        fromDirection: machineTrace.action === "LONG" || machineTrace.action === "SHORT" ? machineTrace.action : "NONE",
        toDirection: corrected.finalAction === "LONG" || corrected.finalAction === "SHORT" ? corrected.finalAction : "NONE",
        fromDecision: fromAction,
        toDecision: toAction,
      },
      laterEvaluation: {
        evaluated: false,
        verdict: null,
        correctnessScore: null,
        marketOutcome: null,
      },
    });

    next.operatorIntelligence = {
      actionId: actionRecord.actionId,
      actionType: actionRecord.operatorAction.type,
    };
    records[idx] = next;
    return next;
  }

  // Checks and resolves pending records when enough forward candles exist.
  function resolvePending({ candles = [], maxHoldBars = 24 }) {
    const pendingIds = Array.from(pendingIndex.keys());
    if (!pendingIds.length) return [];
    const resolved = [];

    pendingIds.forEach((id) => {
      const idx = records.findIndex((row) => row.id === id);
      if (idx < 0) {
        pendingIndex.delete(id);
        return;
      }

      const record = records[idx];
      const guard = hasResolutionSignal(record, candles, maxHoldBars);
      if (!guard.resolvable) return;

      const replay = replayFuturesDecision({
        action: record.policy.action,
        executionPlan: {
          entryPrice: record.plan.referencePrice,
          stopLoss: record.plan.stopLoss,
          takeProfit: record.plan.takeProfit,
        },
      }, candles, record.candleIndex, { maxBarsHold: maxHoldBars });

      const next = {
        ...record,
        outcome: {
          status: "resolved",
          resolutionTimestamp: Date.now(),
          result: mapReplayOutcome(replay),
          pnlPct: toNumber(replay.pnlPct, 0),
          rMultiple: toNumber(replay.pnlR, 0),
          maxFavorableExcursion: toNumber(replay.maxFavorableExcursion, 0),
          maxAdverseExcursion: toNumber(replay.maxAdverseExcursion, 0),
          barsElapsed: Number(replay.barsToResolution || 0),
          resolutionReason: replay.outcomeType || guard.reason || "resolved",
        },
        outcomeComparison: {
          machineOnly: replayDecisionForComparison(record?.decisionTrace?.machine || buildMachineDecisionTrace(record), candles, record.candleIndex, maxHoldBars),
          operatorCorrected: replayDecisionForComparison(record?.decisionTrace?.operatorCorrected || record?.decisionTrace?.machine || buildMachineDecisionTrace(record), candles, record.candleIndex, maxHoldBars),
          actualOutcome: {
            result: mapReplayOutcome(replay),
            pnlPct: toNumber(replay.pnlPct, null),
            rMultiple: toNumber(replay.pnlR, null),
            resolutionReason: replay.outcomeType || "timeout",
          },
        },
      };

      records[idx] = next;
      if (record.operatorIntelligence?.actionId) {
        const evaluation = evaluateOperatorAction(
          {
            actionId: record.operatorIntelligence.actionId,
            operatorAction: { type: record.operatorIntelligence.actionType || "none" },
            context20: { contextSignature: record.stateSummary?.contextSignature || {} },
          },
          {
            result: next.outcomeComparison?.operatorCorrected?.result,
            machineResult: next.outcomeComparison?.machineOnly?.result,
            marketDirection: next.outcomeComparison?.actualOutcome?.result === "win"
              ? (record.policy?.action === "LONG" ? "LONG" : "SHORT")
              : (record.policy?.action === "LONG" ? "SHORT" : "LONG"),
            moveStrength: Math.abs(Number(next.outcomeComparison?.actualOutcome?.rMultiple || 0)),
          },
        );
        operatorActionLogger.updateActionEvaluation(record.operatorIntelligence.actionId, {
          ...evaluation,
          marketOutcome: next.outcomeComparison?.actualOutcome || null,
        });
        console.debug("Operator action evaluated", evaluation);
      }
      pendingIndex.delete(id);
      resolved.push(next);
    });

    records = records.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    if (resolved.length) {
      const patternSummary = analyzeOperatorPatterns(loadOperatorActions(), loadTradeMemories(), loadDecisionMemories());
      saveOperatorPatternSummary(patternSummary);
      console.debug("Operator pattern summary updated", {
        evaluatedActions: patternSummary?.totals?.evaluatedActions || 0,
        highValuePatterns: (patternSummary?.highValuePatterns || []).length,
      });
    }
    return resolved;
  }

  return {
    setRecords,
    getRecords,
    createSnapshot,
    applyRecordOperatorFeedback,
    upsertRecord,
    resolvePending,
    getPendingCount: () => pendingIndex.size,
  };
}
