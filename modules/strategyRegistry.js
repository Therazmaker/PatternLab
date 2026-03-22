/**
 * Central strategy registry for Strategy Lab.
 * New strategies should be declared here so UI, backtest and comparison stay in sync.
 */
import {
  runAtrBreakout,
  runFuturesPolicyShadowReplay,
  runPatternlabHybridTrend,
  runSmaRsiTrend,
} from "./strategyTemplates.js";

const STRATEGIES = [
  {
    id: "sma_rsi_trend",
    name: "SMA + RSI Trend",
    type: "rule-based",
    description: "Trend following using SMA20/SMA50 relationship, RSI thresholds and SMA slope.",
    paramsSchema: {
      rsiLongThreshold: { type: "number", default: 56, min: 40, max: 80, step: 1 },
      rsiShortThreshold: { type: "number", default: 44, min: 20, max: 60, step: 1 },
      minSlope: { type: "number", default: 0.0, min: -10, max: 10, step: 0.0001 },
    },
    execute: runSmaRsiTrend,
    featureRequirements: ["rsi14", "sma20", "sma50", "smaSlope"],
    riskDefaults: { stopLossPct: 0.5, takeProfitPct: 1.0, maxHoldBars: 24, riskPerTradePct: 1.0 },
  },
  {
    id: "atr_breakout",
    name: "ATR Breakout",
    type: "rule-based",
    description: "Volatility breakout with ATR and volume confirmation.",
    paramsSchema: {
      atrBreakoutMult: { type: "number", default: 0.8, min: 0.1, max: 5, step: 0.1 },
      volumeMultiplier: { type: "number", default: 1.1, min: 0.5, max: 5, step: 0.1 },
      minSlope: { type: "number", default: 0, min: -10, max: 10, step: 0.0001 },
    },
    execute: runAtrBreakout,
    featureRequirements: ["atr14", "volume", "smaSlope"],
    riskDefaults: { stopAtrMult: 1.0, takeProfitAtrMult: 1.8, maxHoldBars: 18, riskPerTradePct: 1.0 },
  },
  {
    id: "patternlab_hybrid_trend",
    name: "PatternLab Hybrid Trend",
    type: "hybrid",
    description: "Combines PatternLab context/neuron/radar filters with trend logic.",
    paramsSchema: {
      minRadarScore: { type: "number", default: 55, min: 0, max: 100, step: 1 },
      minContextScore: { type: "number", default: 50, min: 0, max: 100, step: 1 },
      minNeuronCount: { type: "number", default: 1, min: 0, max: 20, step: 1 },
      allowedRegimes: { type: "array", default: ["trend", "bull", "bear", "breakout"] },
    },
    execute: runPatternlabHybridTrend,
    featureRequirements: ["contextScore", "radarScore", "marketRegime", "activeNeurons", "neuronCount"],
    riskDefaults: { stopLossPct: 0.45, takeProfitPct: 1.0, maxHoldBars: 20, riskPerTradePct: 1.0 },
  },
  {
    id: "futures_policy_shadow_replay",
    name: "Futures Policy Shadow Replay",
    type: "policy-ready",
    description: "Runs existing futures policy over historical data as a strategy candidate.",
    paramsSchema: {},
    execute: runFuturesPolicyShadowReplay,
    featureRequirements: ["contextScore", "radarScore", "marketRegime", "activeNeurons"],
    riskDefaults: { maxHoldBars: 24, riskPerTradePct: 1.0 },
  },
];

export function listStrategies() {
  return STRATEGIES.map((row) => ({ ...row }));
}

export function getStrategyById(id) {
  return STRATEGIES.find((row) => row.id === id) || null;
}

export function getDefaultParams(strategyId) {
  const strategy = getStrategyById(strategyId);
  if (!strategy) return {};
  return Object.fromEntries(Object.entries(strategy.paramsSchema || {}).map(([key, spec]) => [key, spec.default]));
}
