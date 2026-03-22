import { getStrategyById } from "./strategyRegistry.js";
import { evaluateJsonRuleStrategy } from "./strategyJson.js";
import { evaluateStructureFilter } from "./structureFilter.js";

export const STRATEGY_ACTIONS = { NO_TRADE: "NO_TRADE", LONG: "LONG", SHORT: "SHORT" };

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}


function scoreThresholdFromConfig(strategyConfig = {}, params = {}) {
  const explicit = Number(strategyConfig?.scoring?.minDirectionalScore);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit));
  const paramThreshold = Number(params?.scoreThreshold);
  if (Number.isFinite(paramThreshold)) return Math.max(0, Math.min(100, paramThreshold));
  return 70;
}

function buildExecutionPlan({ action, feature, candle, riskConfig = {} }) {
  if (action === STRATEGY_ACTIONS.NO_TRADE) return null;
  const entryPrice = toNumber(candle.close, 0);
  const atr = Math.max(0, toNumber(feature.atr14, 0));
  const stopLossPct = Math.abs(toNumber(riskConfig.stopLossPct, 0.5)) / 100;
  const takeProfitPct = Math.abs(toNumber(riskConfig.takeProfitPct, 1.0)) / 100;
  const stopAtr = Math.abs(toNumber(riskConfig.stopAtrMult, 1.0));
  const takeAtr = Math.abs(toNumber(riskConfig.takeProfitAtrMult, 1.8));
  const useAtr = atr > 0 && (riskConfig.stopAtrMult !== undefined || riskConfig.takeProfitAtrMult !== undefined);
  const stopDist = useAtr ? atr * stopAtr : entryPrice * stopLossPct;
  const tpDist = useAtr ? atr * takeAtr : entryPrice * takeProfitPct;
  return {
    entryPrice,
    stopLoss: action === STRATEGY_ACTIONS.LONG ? (entryPrice - stopDist) : (entryPrice + stopDist),
    takeProfit: action === STRATEGY_ACTIONS.LONG ? (entryPrice + tpDist) : (entryPrice - tpDist),
    sizePct: Math.max(0.1, toNumber(riskConfig.riskPerTradePct, 1)),
    riskReward: stopDist > 0 ? tpDist / stopDist : 0,
  };
}

/**
 * Generic strategy evaluator per candle.
 */
export function runStrategyDecisions({ strategyId, candles = [], features = [], strategyConfig = {}, runtimeContext = {} }) {
  const customDefinition = strategyConfig.customStrategyDefinition;
  const hasLongRules = Array.isArray(customDefinition?.entry?.long) && customDefinition.entry.long.length > 0;
  const hasShortRules = Array.isArray(customDefinition?.entry?.short) && customDefinition.entry.short.length > 0;
  if (customDefinition && !hasLongRules && !hasShortRules) {
    throw new Error("Strategy JSON missing entry conditions");
  }
  const strategy = customDefinition
    ? {
      id: customDefinition.strategyId || strategyId || "json_rule_strategy",
      riskDefaults: { maxHoldBars: Number(customDefinition.exit?.maxBarsInTrade || 24), stopAtrMult: Number(customDefinition.risk?.stopLossAtr || 1), takeProfitAtrMult: Number(customDefinition.risk?.takeProfitAtr || 1.8), riskPerTradePct: 1.0 },
      execute: (ctx) => evaluateJsonRuleStrategy({ ...ctx, definition: customDefinition }),
    }
    : getStrategyById(strategyId);
  if (!strategy) throw new Error(`Unknown strategy: ${strategyId}`);

  const params = { ...(strategyConfig.params || {}) };
  const riskConfig = { ...(strategy.riskDefaults || {}), ...(strategyConfig.risk || {}) };
  const isJsonRuleStrategy = Boolean(customDefinition);

  return candles.map((candle, index) => {
    const feature = features[index] || {};
    const context = {
      symbol: runtimeContext.symbol,
      timeframe: runtimeContext.timeframe,
      contextScore: feature.contextScore,
      radarScore: feature.radarScore,
      marketRegime: feature.marketRegime,
      nearSupport: feature.nearSupport,
      nearResistance: feature.nearResistance,
      activeNeurons: feature.activeNeurons,
      neuronActivations: runtimeContext.neuronActivations || [],
      seededPatterns: runtimeContext.seededPatterns || [],
    };

    const evalResult = strategy.execute({ candle, candles, candleIndex: index, feature, features, params, config: strategyConfig, context }) || {};
    const action = Object.values(STRATEGY_ACTIONS).includes(evalResult.action) ? evalResult.action : STRATEGY_ACTIONS.NO_TRADE;
    const scoreThreshold = scoreThresholdFromConfig(strategyConfig, params);
    const bullishScore = toNumber(feature.bullishScore, 0);
    const bearishScore = toNumber(feature.bearishScore, 0);
    let scoreGateBlocked = false;
    let scoreGateReason = '';
    if (!isJsonRuleStrategy && action === STRATEGY_ACTIONS.LONG && bullishScore < scoreThreshold) {
      scoreGateBlocked = true;
      scoreGateReason = `Long blocked: bullish score ${bullishScore.toFixed(1)} below threshold ${scoreThreshold.toFixed(1)}.`;
    }
    if (!isJsonRuleStrategy && action === STRATEGY_ACTIONS.SHORT && bearishScore < scoreThreshold) {
      scoreGateBlocked = true;
      scoreGateReason = `Short blocked: bearish score ${bearishScore.toFixed(1)} below threshold ${scoreThreshold.toFixed(1)}.`;
    }
    const gatedAction = scoreGateBlocked ? STRATEGY_ACTIONS.NO_TRADE : action;
    let executionPlan = evalResult.executionPlan || buildExecutionPlan({ action: gatedAction, feature, candle, riskConfig });
    const structureEnabled = strategyConfig?.structureFilter?.enabled !== false;
    const structureCheck = structureEnabled
      ? evaluateStructureFilter({
        candles,
        candleIndex: index,
        action: gatedAction,
        entryPrice: executionPlan?.entryPrice || candle.close,
        targetPrice: executionPlan?.takeProfit || null,
      })
      : { decision: "allow", scoreAdjustment: 0, reasons: [], features: feature.structure || null };

    let finalAction = gatedAction;
    let confidence = toNumber(evalResult.confidence, 0);
    const structureNotes = structureCheck.reasons || [];
    if (structureEnabled && gatedAction !== STRATEGY_ACTIONS.NO_TRADE) {
      confidence = Math.max(0, Math.min(1, confidence + (structureCheck.scoreAdjustment / 200)));
      if (structureCheck.decision === "block") {
        finalAction = STRATEGY_ACTIONS.NO_TRADE;
        executionPlan = null;
      }
    }

    return {
      index,
      timestamp: candle.timestamp,
      strategyId,
      action: finalAction,
      confidence,
      reason: [evalResult.reason || "", scoreGateReason, ...structureNotes].filter(Boolean).join(" "),
      featureSnapshot: feature,
      executionPlan,
      riskConfig,
      scoreSnapshot: {
        bullishScore,
        bearishScore,
        neutralScore: toNumber(feature.neutralScore, 0),
        confidence: toNumber(feature.probabilityConfidence, 0),
        bias: feature.probabilityBias || "neutral",
        threshold: scoreThreshold,
        explanation: feature.probabilityExplanation || "",
      },
      evidence: {
        ...(evalResult.evidence || {}),
        structure: structureCheck,
      },
    };
  });
}
