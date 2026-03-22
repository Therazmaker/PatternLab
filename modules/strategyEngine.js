import { getStrategyById } from "./strategyRegistry.js";
import { evaluateStructureFilter } from "./structureFilter.js";

export const STRATEGY_ACTIONS = { NO_TRADE: "NO_TRADE", LONG: "LONG", SHORT: "SHORT" };

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
  const strategy = getStrategyById(strategyId);
  if (!strategy) throw new Error(`Unknown strategy: ${strategyId}`);

  const params = { ...(strategyConfig.params || {}) };
  const riskConfig = { ...(strategy.riskDefaults || {}), ...(strategyConfig.risk || {}) };

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
    let executionPlan = evalResult.executionPlan || buildExecutionPlan({ action, feature, candle, riskConfig });
    const structureEnabled = strategyConfig?.structureFilter?.enabled !== false;
    const structureCheck = structureEnabled
      ? evaluateStructureFilter({
        candles,
        candleIndex: index,
        action,
        entryPrice: executionPlan?.entryPrice || candle.close,
        targetPrice: executionPlan?.takeProfit || null,
      })
      : { decision: "allow", scoreAdjustment: 0, reasons: [], features: feature.structure || null };

    let finalAction = action;
    let confidence = toNumber(evalResult.confidence, 0);
    const structureNotes = structureCheck.reasons || [];
    if (structureEnabled && action !== STRATEGY_ACTIONS.NO_TRADE) {
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
      reason: [evalResult.reason || "", ...structureNotes].filter(Boolean).join(" "),
      featureSnapshot: feature,
      executionPlan,
      riskConfig,
      evidence: {
        ...(evalResult.evidence || {}),
        structure: structureCheck,
      },
    };
  });
}
