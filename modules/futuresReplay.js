function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeTradeMfeMae(direction, entryPrice, candle) {
  const high = toNumber(candle?.high, entryPrice);
  const low = toNumber(candle?.low, entryPrice);
  if (direction === "LONG") {
    return {
      favorable: Math.max(0, high - entryPrice),
      adverse: Math.max(0, entryPrice - low),
    };
  }
  return {
    favorable: Math.max(0, entryPrice - low),
    adverse: Math.max(0, high - entryPrice),
  };
}

export function replayFuturesDecision(decision, candles = [], entryIndex = -1, config = {}) {
  const maxBarsHold = Math.max(1, Number(config.maxBarsHold) || 24);
  if (!decision || decision.action === "NO_TRADE") {
    return {
      outcomeType: "manual-no-trade",
      pnlR: 0,
      pnlPct: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      barsToResolution: 0,
      mfe: 0,
      mae: 0,
    };
  }

  const plan = decision.executionPlan || {};
  const entryPrice = toNumber(plan.entryPrice, null);
  const stopLoss = toNumber(plan.stopLoss, null);
  const takeProfit = toNumber(plan.takeProfit, null);
  const direction = decision.action;
  if (![entryPrice, stopLoss, takeProfit].every((v) => Number.isFinite(v)) || entryIndex < 0) {
    return {
      outcomeType: "timeout",
      pnlR: 0,
      pnlPct: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      barsToResolution: 0,
      mfe: 0,
      mae: 0,
    };
  }

  const riskDistance = Math.abs(entryPrice - stopLoss) || 1;
  let maxFavorableExcursion = 0;
  let maxAdverseExcursion = 0;
  let resolvedAt = null;
  let exitPrice = entryPrice;
  let outcomeType = "timeout";

  for (let i = entryIndex + 1; i < candles.length && (i - entryIndex) <= maxBarsHold; i += 1) {
    const candle = candles[i];
    const high = toNumber(candle?.high, entryPrice);
    const low = toNumber(candle?.low, entryPrice);
    const { favorable, adverse } = computeTradeMfeMae(direction, entryPrice, candle);
    maxFavorableExcursion = Math.max(maxFavorableExcursion, favorable);
    maxAdverseExcursion = Math.max(maxAdverseExcursion, adverse);

    const hitTp = direction === "LONG" ? high >= takeProfit : low <= takeProfit;
    const hitSl = direction === "LONG" ? low <= stopLoss : high >= stopLoss;

    if (hitTp && hitSl) {
      outcomeType = "sl";
      exitPrice = stopLoss;
      resolvedAt = i;
      break;
    }
    if (hitSl) {
      outcomeType = "sl";
      exitPrice = stopLoss;
      resolvedAt = i;
      break;
    }
    if (hitTp) {
      outcomeType = "tp";
      exitPrice = takeProfit;
      resolvedAt = i;
      break;
    }

    if ((i - entryIndex) === maxBarsHold) {
      outcomeType = "timeout";
      exitPrice = toNumber(candle?.close, entryPrice);
      resolvedAt = i;
    }
  }

  if (resolvedAt === null) {
    const fallback = candles[Math.min(candles.length - 1, entryIndex + maxBarsHold)] || candles[entryIndex] || {};
    exitPrice = toNumber(fallback.close, entryPrice);
    resolvedAt = Math.min(candles.length - 1, entryIndex + maxBarsHold);
  }

  const signedMove = direction === "LONG" ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
  const pnlPct = entryPrice ? (signedMove / entryPrice) * 100 : 0;
  const pnlR = signedMove / riskDistance;

  return {
    outcomeType,
    pnlR,
    pnlPct,
    maxFavorableExcursion,
    maxAdverseExcursion,
    barsToResolution: Math.max(0, resolvedAt - entryIndex),
    mfe: maxFavorableExcursion,
    mae: maxAdverseExcursion,
  };
}
