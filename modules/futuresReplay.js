function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDirection(action) {
  const value = String(action || "").toUpperCase();
  if (value === "LONG" || value === "SHORT") return value;
  return null;
}

function hasValidLevels(direction, entryPrice, stopLoss, takeProfit) {
  if (direction === "LONG") return stopLoss < entryPrice && entryPrice < takeProfit;
  if (direction === "SHORT") return takeProfit < entryPrice && entryPrice < stopLoss;
  return false;
}

function resolveIntrabarCollision({ candle = {}, entryPrice, stopLoss, takeProfit, policy = "time-proxy" } = {}) {
  if (policy === "favor_tp") return "tp";
  if (policy === "favor_sl") return "sl";
  if (policy === "ambiguous") return "ambiguous";

  const open = toNumber(candle?.open, entryPrice);
  if (!Number.isFinite(open)) return "ambiguous";

  const distTp = Math.abs(takeProfit - open);
  const distSl = Math.abs(stopLoss - open);
  if (distTp < distSl) return "tp";
  if (distSl < distTp) return "sl";
  return "ambiguous";
}

function logResolution({ decision, direction, entryPrice, takeProfit, stopLoss, candle, outcomeType }) {
  const pattern = decision?.patternName || decision?.setupName || decision?.reason || "unknown";
  const high = toNumber(candle?.high, null);
  const low = toNumber(candle?.low, null);
  console.info(
    `[RESOLVE] pattern=${pattern} direction=${String(direction || "").toLowerCase()} entry=${entryPrice} tp=${takeProfit} sl=${stopLoss} high=${high} low=${low} outcome=${outcomeType}`,
  );
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
  const intrabarPolicy = String(config.intrabarPolicy || "time-proxy").toLowerCase();
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
  const direction = normalizeDirection(decision.action);
  if (![entryPrice, stopLoss, takeProfit].every((v) => Number.isFinite(v)) || entryIndex < 0 || !direction) {
    return {
      outcomeType: "invalid-plan",
      pnlR: 0,
      pnlPct: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      barsToResolution: 0,
      mfe: 0,
      mae: 0,
    };
  }
  if (!hasValidLevels(direction, entryPrice, stopLoss, takeProfit)) {
    return {
      outcomeType: "invalid-plan",
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
      outcomeType = resolveIntrabarCollision({
        candle,
        entryPrice,
        stopLoss,
        takeProfit,
        policy: intrabarPolicy,
      });
      exitPrice = outcomeType === "tp" ? takeProfit : outcomeType === "sl" ? stopLoss : entryPrice;
      resolvedAt = i;
      logResolution({ decision, direction, entryPrice, takeProfit, stopLoss, candle, outcomeType });
      break;
    }
    if (hitSl) {
      outcomeType = "sl";
      exitPrice = stopLoss;
      resolvedAt = i;
      logResolution({ decision, direction, entryPrice, takeProfit, stopLoss, candle, outcomeType });
      break;
    }
    if (hitTp) {
      outcomeType = "tp";
      exitPrice = takeProfit;
      resolvedAt = i;
      logResolution({ decision, direction, entryPrice, takeProfit, stopLoss, candle, outcomeType });
      break;
    }

    if ((i - entryIndex) === maxBarsHold) {
      outcomeType = "timeout";
      exitPrice = toNumber(candle?.close, entryPrice);
      resolvedAt = i;
      logResolution({ decision, direction, entryPrice, takeProfit, stopLoss, candle, outcomeType });
    }
  }

  if (resolvedAt === null) {
    const fallback = candles[Math.min(candles.length - 1, entryIndex + maxBarsHold)] || candles[entryIndex] || {};
    exitPrice = toNumber(fallback.close, entryPrice);
    resolvedAt = Math.min(candles.length - 1, entryIndex + maxBarsHold);
    logResolution({ decision, direction, entryPrice, takeProfit, stopLoss, candle: fallback, outcomeType });
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
