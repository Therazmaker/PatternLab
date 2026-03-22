import { createTradeMemoryLogger } from "./tradeMemoryLogger.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function directionMultiplier(direction) {
  return direction === "SHORT" ? -1 : 1;
}

function buildTradeId() {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calcPnl({ direction, entryPrice, closePrice, positionSize }) {
  if (![entryPrice, closePrice, positionSize].every((value) => Number.isFinite(value))) return 0;
  return (closePrice - entryPrice) * positionSize * directionMultiplier(direction);
}

function calcRiskAmount({ direction, entryPrice, stopLoss, positionSize }) {
  if (![entryPrice, stopLoss, positionSize].every((value) => Number.isFinite(value))) return 0;
  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) return 0;
  return stopDistance * positionSize;
}

function round(value, digits = 8) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function createTradeLifecycleManager({
  liveContextRecorder,
  tradeMemoryLogger = createTradeMemoryLogger(),
  logger = console,
} = {}) {
  const openTrades = new Map();

  async function startTrade(signal = {}, contextSnapshot = null, operatorAction = { action: "none", note: null }) {
    const tradeId = buildTradeId();
    const symbol = String(signal.symbol || "UNKNOWN");
    const timeframe = String(signal.timeframe || "5m");
    const snapshot = contextSnapshot || (liveContextRecorder
      ? await liveContextRecorder.getContextSnapshot(symbol, timeframe)
      : null);

    const trade = {
      tradeId,
      timestamp: new Date().toISOString(),
      symbol,
      timeframe: "5m",
      preTradeContext: {
        context20: snapshot,
      },
      signal: {
        direction: ["LONG", "SHORT", "NONE"].includes(signal.direction) ? signal.direction : "NONE",
        bullishScore: toNumber(signal.bullishScore, 0),
        bearishScore: toNumber(signal.bearishScore, 0),
        confidence: toNumber(signal.confidence, 0),
        reasonCodes: Array.isArray(signal.reasonCodes) ? signal.reasonCodes.map((row) => String(row)) : [],
        policyVersion: String(signal.policyVersion || "v1"),
      },
      operator: {
        action: ["approve", "veto", "none"].includes(operatorAction?.action) ? operatorAction.action : "none",
        note: operatorAction?.note == null ? null : String(operatorAction.note),
      },
      execution: {
        entryPrice: Number.isFinite(Number(signal.entryPrice)) ? Number(signal.entryPrice) : null,
        stopLoss: Number.isFinite(Number(signal.stopLoss)) ? Number(signal.stopLoss) : null,
        takeProfit: Number.isFinite(Number(signal.takeProfit)) ? Number(signal.takeProfit) : null,
        positionSize: Number.isFinite(Number(signal.positionSize)) ? Number(signal.positionSize) : null,
      },
      outcome: {
        result: "open",
        pnl: 0,
        pnlR: 0,
        barsHeld: 0,
        mfe: 0,
        mae: 0,
      },
      runtime: {
        maxFavorablePrice: null,
        maxAdversePrice: null,
      },
    };

    openTrades.set(tradeId, trade);
    logger.debug("Trade started", { tradeId, symbol, direction: trade.signal.direction });
    return trade;
  }

  function updateTrade(tradeId, livePrice) {
    const trade = openTrades.get(tradeId);
    if (!trade) return null;

    const price = toNumber(livePrice, NaN);
    const entryPrice = Number(trade.execution.entryPrice);
    if (!Number.isFinite(price) || !Number.isFinite(entryPrice)) return trade;

    const direction = trade.signal.direction;
    const favorable = direction === "SHORT" ? entryPrice - price : price - entryPrice;
    const adverse = direction === "SHORT" ? price - entryPrice : entryPrice - price;

    trade.outcome.barsHeld += 1;
    trade.outcome.mfe = round(Math.max(trade.outcome.mfe, favorable));
    trade.outcome.mae = round(Math.max(trade.outcome.mae, adverse));
    trade.runtime.maxFavorablePrice = Number.isFinite(trade.runtime.maxFavorablePrice)
      ? (direction === "SHORT" ? Math.min(trade.runtime.maxFavorablePrice, price) : Math.max(trade.runtime.maxFavorablePrice, price))
      : price;
    trade.runtime.maxAdversePrice = Number.isFinite(trade.runtime.maxAdversePrice)
      ? (direction === "SHORT" ? Math.max(trade.runtime.maxAdversePrice, price) : Math.min(trade.runtime.maxAdversePrice, price))
      : price;

    logger.debug("Trade updated", {
      tradeId,
      livePrice: price,
      barsHeld: trade.outcome.barsHeld,
      mfe: trade.outcome.mfe,
      mae: trade.outcome.mae,
    });
    return trade;
  }

  function closeTrade(tradeId, closeData = {}) {
    const trade = openTrades.get(tradeId);
    if (!trade) return null;

    const closePrice = toNumber(closeData.closePrice, Number(trade.execution.entryPrice));
    const pnl = calcPnl({
      direction: trade.signal.direction,
      entryPrice: Number(trade.execution.entryPrice),
      closePrice,
      positionSize: Number(trade.execution.positionSize),
    });
    const riskAmount = calcRiskAmount({
      direction: trade.signal.direction,
      entryPrice: Number(trade.execution.entryPrice),
      stopLoss: Number(trade.execution.stopLoss),
      positionSize: Number(trade.execution.positionSize),
    });

    const pnlR = riskAmount > 0 ? pnl / riskAmount : 0;
    const epsilon = Number(closeData.breakevenEpsilon || 1e-8);
    const result = Math.abs(pnl) <= epsilon ? "breakeven" : (pnl > 0 ? "win" : "loss");

    trade.outcome.result = result;
    trade.outcome.pnl = round(pnl);
    trade.outcome.pnlR = round(pnlR);

    if (Number.isFinite(toNumber(closeData.barsHeld, NaN))) {
      trade.outcome.barsHeld = Math.max(trade.outcome.barsHeld, Number(closeData.barsHeld));
    }

    if (Number.isFinite(toNumber(closeData.mfe, NaN))) trade.outcome.mfe = round(Math.max(trade.outcome.mfe, Number(closeData.mfe)));
    if (Number.isFinite(toNumber(closeData.mae, NaN))) trade.outcome.mae = round(Math.max(trade.outcome.mae, Number(closeData.mae)));

    const finalized = {
      ...trade,
      execution: {
        ...trade.execution,
        entryPrice: Number.isFinite(Number(trade.execution.entryPrice)) ? Number(trade.execution.entryPrice) : null,
      },
    };

    delete finalized.runtime;
    openTrades.delete(tradeId);
    tradeMemoryLogger.logTradeMemory(finalized);

    logger.debug("Trade closed", {
      tradeId,
      result,
      pnl: trade.outcome.pnl,
      pnlR: trade.outcome.pnlR,
      barsHeld: trade.outcome.barsHeld,
    });
    return finalized;
  }

  function getOpenTrades() {
    return [...openTrades.values()];
  }

  return {
    startTrade,
    updateTrade,
    closeTrade,
    getOpenTrades,
  };
}
