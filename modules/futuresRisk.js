const DEFAULT_RISK_CONFIG = {
  maxLeverage: 3,
  defaultRiskPct: 0.5,
  minRiskReward: 1.5,
  stopMode: "hybrid",
  tpMode: "hybrid",
  noTradeOnConflict: true,
  structureLookback: 12,
  maxHoldBars: 24,
};

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getStructureLevels(candles = [], index = -1, lookback = 12) {
  if (!Array.isArray(candles) || index < 0) return { recentLow: null, recentHigh: null };
  const start = Math.max(0, index - lookback);
  const window = candles.slice(start, index + 1);
  const lows = window.map((c) => toNumber(c?.low, null)).filter((v) => v !== null);
  const highs = window.map((c) => toNumber(c?.high, null)).filter((v) => v !== null);
  return {
    recentLow: lows.length ? Math.min(...lows) : null,
    recentHigh: highs.length ? Math.max(...highs) : null,
  };
}

export function getDefaultFuturesRiskConfig(overrides = {}) {
  return { ...DEFAULT_RISK_CONFIG, ...(overrides || {}) };
}

export function buildFuturesExecutionPlan(direction, state = {}, context = {}, overrides = {}) {
  const config = getDefaultFuturesRiskConfig(overrides);
  const entryPrice = toNumber(context.entryPrice, state.priceRef ?? null);
  if (!entryPrice || !["LONG", "SHORT"].includes(direction)) {
    return {
      entryType: "market",
      entryPrice: entryPrice || null,
      entryZone: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      leverageCap: null,
      sizingMode: "disabled",
      riskPct: null,
    };
  }

  const atr = toNumber(state.volatility?.atr14, null);
  const candleSpread = toNumber(state.volatility?.candleSpreadPct, 0) || 0;
  const candles = Array.isArray(context.candles) ? context.candles : [];
  const index = Number.isInteger(context.candleIndex) ? context.candleIndex : -1;
  const { recentLow, recentHigh } = getStructureLevels(candles, index, config.structureLookback);
  const atrDistance = atr ? atr * 1.2 : entryPrice * Math.max(0.002, candleSpread * 1.3);

  let stopLoss = null;
  if (direction === "LONG") {
    const structureStop = recentLow !== null ? recentLow - (atr ? atr * 0.2 : entryPrice * 0.0005) : null;
    const atrStop = entryPrice - atrDistance;
    if (config.stopMode === "structure") stopLoss = structureStop ?? atrStop;
    else if (config.stopMode === "atr") stopLoss = atrStop;
    else stopLoss = Math.max(structureStop ?? -Infinity, atrStop);
  } else {
    const structureStop = recentHigh !== null ? recentHigh + (atr ? atr * 0.2 : entryPrice * 0.0005) : null;
    const atrStop = entryPrice + atrDistance;
    if (config.stopMode === "structure") stopLoss = structureStop ?? atrStop;
    else if (config.stopMode === "atr") stopLoss = atrStop;
    else stopLoss = Math.min(structureStop ?? Infinity, atrStop);
  }

  const riskDistance = Math.abs(entryPrice - stopLoss);
  if (!Number.isFinite(riskDistance) || riskDistance <= 0) {
    return {
      entryType: "market",
      entryPrice,
      entryZone: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      leverageCap: null,
      sizingMode: "disabled",
      riskPct: null,
    };
  }

  const rr = Math.max(config.minRiskReward, 1);
  const rrTarget = direction === "LONG"
    ? entryPrice + riskDistance * rr
    : entryPrice - riskDistance * rr;
  const structureTarget = direction === "LONG"
    ? (recentHigh !== null ? recentHigh : rrTarget)
    : (recentLow !== null ? recentLow : rrTarget);

  let takeProfit = rrTarget;
  if (config.tpMode === "structure") takeProfit = structureTarget;
  else if (config.tpMode === "hybrid") {
    takeProfit = direction === "LONG"
      ? Math.max(rrTarget, structureTarget)
      : Math.min(rrTarget, structureTarget);
  }

  const entryZone = {
    low: direction === "LONG" ? entryPrice - (atrDistance * 0.2) : entryPrice - (atrDistance * 0.1),
    high: direction === "LONG" ? entryPrice + (atrDistance * 0.1) : entryPrice + (atrDistance * 0.2),
  };

  return {
    entryType: state.marketRegime === "volatile" ? "limit-zone" : "market",
    entryPrice,
    entryZone,
    stopLoss,
    takeProfit,
    riskReward: riskDistance > 0 ? Math.abs((takeProfit - entryPrice) / riskDistance) : null,
    leverageCap: Math.max(1, Number(config.maxLeverage) || 1),
    sizingMode: "fixed-risk",
    riskPct: Number(config.defaultRiskPct),
  };
}
