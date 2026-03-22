import { buildFuturesPolicyFeatures } from "./futuresPolicyFeatures.js";
import { evaluateFuturesPolicy } from "./futuresPolicyEngine.js";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const StrategyAction = {
  NO_TRADE: "NO_TRADE",
  LONG: "LONG",
  SHORT: "SHORT",
};

export function runSmaRsiTrend({ feature, params = {} }) {
  const rsiLong = toNumber(params.rsiLongThreshold, 55);
  const rsiShort = toNumber(params.rsiShortThreshold, 45);
  const minSlope = toNumber(params.minSlope, 0);

  const bullish = feature.sma20 > feature.sma50 && feature.rsi14 >= rsiLong && feature.smaSlope >= minSlope;
  const bearish = feature.sma20 < feature.sma50 && feature.rsi14 <= rsiShort && feature.smaSlope <= -Math.abs(minSlope);

  if (bullish) return { action: StrategyAction.LONG, confidence: 0.65, reason: "SMA trend up + RSI strength + positive slope" };
  if (bearish) return { action: StrategyAction.SHORT, confidence: 0.65, reason: "SMA trend down + RSI weakness + negative slope" };
  return { action: StrategyAction.NO_TRADE, confidence: 0.3, reason: "Trend/RSI filters not aligned" };
}

export function runAtrBreakout({ feature, params = {}, candle }) {
  const atrMult = toNumber(params.atrBreakoutMult, 0.8);
  const volMult = toNumber(params.volumeMultiplier, 1.1);
  const minSlope = toNumber(params.minSlope, 0);
  const avgRange = toNumber(feature.avgRange20, 0);
  const range = Math.max(0, toNumber(candle.high, 0) - toNumber(candle.low, 0));
  const breakout = avgRange > 0 && range >= avgRange + (feature.atr14 * atrMult);
  const highVol = feature.volume >= (feature.avgVolume20 * volMult);

  if (!breakout || !highVol) return { action: StrategyAction.NO_TRADE, confidence: 0.25, reason: "No valid ATR breakout confirmation" };
  if (feature.smaSlope >= minSlope) return { action: StrategyAction.LONG, confidence: 0.62, reason: "Volatility breakout with positive slope" };
  return { action: StrategyAction.SHORT, confidence: 0.62, reason: "Volatility breakout with negative slope" };
}

export function runPatternlabHybridTrend({ feature, params = {} }) {
  const minRadar = toNumber(params.minRadarScore, 55);
  const minContext = toNumber(params.minContextScore, 50);
  const minNeuron = toNumber(params.minNeuronCount, 1);
  const allowedRegimes = Array.isArray(params.allowedRegimes) ? params.allowedRegimes : ["trend", "bull", "bear", "breakout"];
  const regimeOk = allowedRegimes.some((tag) => String(feature.marketRegime || "").toLowerCase().includes(String(tag).toLowerCase()));

  if (!regimeOk || feature.radarScore < minRadar || feature.contextScore < minContext || feature.neuronCount < minNeuron) {
    return { action: StrategyAction.NO_TRADE, confidence: 0.2, reason: "Hybrid gating not met (regime/radar/context/neuron filters)" };
  }

  if (feature.sma20 > feature.sma50 && feature.neuronBias >= 0) {
    return { action: StrategyAction.LONG, confidence: 0.7, reason: "PatternLab hybrid bullish alignment" };
  }
  if (feature.sma20 < feature.sma50 && feature.neuronBias <= 0) {
    return { action: StrategyAction.SHORT, confidence: 0.7, reason: "PatternLab hybrid bearish alignment" };
  }
  return { action: StrategyAction.NO_TRADE, confidence: 0.35, reason: "Hybrid filters passed but directional alignment missing" };
}

export function runFuturesPolicyShadowReplay({ candles, candleIndex, context, config = {} }) {
  const syntheticSignal = {
    asset: context.symbol,
    timeframe: context.timeframe,
    timestamp: candles[candleIndex]?.timestamp,
    entryPrice: candles[candleIndex]?.close,
    direction: "CALL",
    contextScore: context.contextScore,
    radarScore: context.radarScore,
    marketRegime: context.marketRegime,
    srContext: { nearSupport: Boolean(context.nearSupport), nearResistance: Boolean(context.nearResistance) },
    features: { activeNeurons: context.activeNeurons || [] },
  };

  const built = buildFuturesPolicyFeatures({
    signal: syntheticSignal,
    candles,
    candleIndex,
    neuronActivations: context.neuronActivations || [],
    seededPatterns: context.seededPatterns || [],
  });

  const decision = evaluateFuturesPolicy({ state: built.state, candles, config: config.futuresPolicyConfig || {} });
  return {
    action: decision.action,
    confidence: decision.confidence,
    reason: decision.reason || "Futures policy replay",
    executionPlan: decision.executionPlan,
    evidence: decision.evidence,
  };
}
