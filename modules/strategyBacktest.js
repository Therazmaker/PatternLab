import { replayFuturesDecision } from "./futuresReplay.js";
import { runStrategyDecisions, STRATEGY_ACTIONS } from "./strategyEngine.js";
import { computeStrategyMetrics } from "./strategyMetrics.js";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Historical futures strategy simulation.
 * Uses futuresReplay intrabar conservative handling (TP/SL same bar resolves as SL).
 */
export function runStrategyBacktest({ strategyId, candles = [], features = [], strategyConfig = {}, runtimeContext = {} }) {
  const decisions = runStrategyDecisions({ strategyId, candles, features, strategyConfig, runtimeContext });
  const feeBps = toNumber(strategyConfig.execution?.feeBps, 4);
  const slippageBps = toNumber(strategyConfig.execution?.slippageBps, 2);
  const initialEquity = toNumber(strategyConfig.execution?.initialEquity, 10000);

  const trades = [];
  const equityCurve = [];
  let equity = initialEquity;
  let i = 0;

  while (i < decisions.length) {
    const decision = decisions[i];
    if (!decision || decision.action === STRATEGY_ACTIONS.NO_TRADE || !decision.executionPlan) {
      equityCurve.push({ index: i, timestamp: candles[i]?.timestamp, equity });
      i += 1;
      continue;
    }

    const replay = replayFuturesDecision(decision, candles, i, { maxBarsHold: decision.riskConfig?.maxHoldBars || 24 });
    const exitIndex = Math.min(candles.length - 1, i + Math.max(1, Number(replay.barsToResolution || 1)));
    const sizeNotional = equity * (toNumber(decision.executionPlan.sizePct, 1) / 100);
    const grossPnl = sizeNotional * (toNumber(replay.pnlPct, 0) / 100);
    const feeCost = sizeNotional * ((feeBps * 2) / 10000);
    const slipCost = sizeNotional * ((slippageBps * 2) / 10000);
    const pnl = grossPnl - feeCost - slipCost;
    equity += pnl;

    trades.push({
      strategyId,
      side: decision.action,
      entryIndex: i,
      exitIndex,
      entryTimestamp: candles[i]?.timestamp,
      exitTimestamp: candles[exitIndex]?.timestamp,
      entryPrice: decision.executionPlan.entryPrice,
      exitPrice: candles[exitIndex]?.close,
      holdBars: Math.max(1, exitIndex - i),
      confidence: decision.confidence,
      reason: decision.reason,
      outcomeType: replay.outcomeType,
      pnl,
      pnlPct: replay.pnlPct,
      rMultiple: replay.pnlR,
      maxFavorableExcursion: replay.maxFavorableExcursion,
      maxAdverseExcursion: replay.maxAdverseExcursion,
      explanation: `${decision.reason || "decision"} -> ${replay.outcomeType}`,
      structureDecision: decision.evidence?.structure?.decision || "allow",
      structureReasons: decision.evidence?.structure?.reasons || [],
      structureBias: decision.evidence?.structure?.features?.structureBias || null,
      structureEntryLocationScore: decision.evidence?.structure?.features?.entryLocationScore ?? null,
      structureSpaceToTargetScore: decision.evidence?.structure?.features?.spaceToTargetScore ?? null,
      bullishScore: toNumber(decision.scoreSnapshot?.bullishScore, 0),
      bearishScore: toNumber(decision.scoreSnapshot?.bearishScore, 0),
      neutralScore: toNumber(decision.scoreSnapshot?.neutralScore, 0),
      probabilityBias: decision.scoreSnapshot?.bias || "neutral",
      probabilityConfidence: toNumber(decision.scoreSnapshot?.confidence, 0),
      regime: decision.featureSnapshot?.regimeClassification?.regime || decision.featureSnapshot?.marketRegime || "ranging",
      scoreExplanation: decision.scoreSnapshot?.explanation || "",
    });

    for (let cursor = i; cursor <= exitIndex; cursor += 1) {
      equityCurve.push({ index: cursor, timestamp: candles[cursor]?.timestamp, equity });
    }
    i = exitIndex + 1;
  }

  return {
    decisions,
    trades,
    equityCurve,
    metrics: computeStrategyMetrics(trades, equityCurve),
    configUsed: strategyConfig,
  };
}
