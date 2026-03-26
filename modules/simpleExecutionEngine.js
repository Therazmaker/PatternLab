import { evaluateEarlyTradeQuality } from "./earlyTradeQualityLayer.js";

function cloneTrade(trade = {}) {
  return { ...trade };
}

function computeExcursions(trade = {}, candle = {}) {
  const entry = Number(trade.entry);
  if (!Number.isFinite(entry) || entry <= 0) return { mfe: trade.mfe ?? 0, mae: trade.mae ?? 0 };
  const high = Number(candle.high);
  const low = Number(candle.low);
  const prevMfe = Number(trade.mfe) || 0;
  const prevMae = Number(trade.mae) || 0;

  if (trade.direction === "short") {
    const favorable = Number.isFinite(low) ? Math.max(0, entry - low) : 0;
    const adverse = Number.isFinite(high) ? Math.max(0, high - entry) : 0;
    return { mfe: Math.max(prevMfe, favorable), mae: Math.max(prevMae, adverse) };
  }

  const favorable = Number.isFinite(high) ? Math.max(0, high - entry) : 0;
  const adverse = Number.isFinite(low) ? Math.max(0, entry - low) : 0;
  return { mfe: Math.max(prevMfe, favorable), mae: Math.max(prevMae, adverse) };
}

function touchedEntry(trade = {}, candle = {}) {
  const entry = Number(trade.entry);
  if (!Number.isFinite(entry) || entry <= 0) return false;
  const low = Number(candle.low);
  const high = Number(candle.high);
  return Number.isFinite(low) && Number.isFinite(high) && low <= entry && high >= entry;
}

export function updateSimpleTradeLifecycle(trade = {}, candle = {}, context = {}) {
  const next = cloneTrade(trade);
  const candleTs = candle.timestamp || new Date().toISOString();
  const candleIndex = Number.isFinite(context.candleIndex) ? context.candleIndex : null;
  const events = [];

  if (next.status === "planned" && touchedEntry(next, candle)) {
    next.status = "active";
    next.triggeredAt = candleTs;
    next.activatedAt = candleTs;
    next.justActivated = true;
    next.triggeredCandleIndex = candleIndex;
    next.candlesInTrade = 0;
    events.push("activated");
    return { trade: next, events, closed: false };
  }

  if (next.status !== "active") {
    return { trade: next, events, closed: next.status === "closed" };
  }

  const excursions = computeExcursions(next, candle);
  next.mfe = Number(excursions.mfe.toFixed(5));
  next.mae = Number(excursions.mae.toFixed(5));
  next.candlesInTrade = Math.max(0, Number(next.candlesInTrade || 0) + 1);

  if (next.justActivated) {
    next.justActivated = false;
    return { trade: next, events, closed: false };
  }

  const qualityEvaluation = evaluateEarlyTradeQuality(next, { ...context, candle });
  if (qualityEvaluation.closed) {
    return qualityEvaluation;
  }
  const qualityEvents = Array.isArray(qualityEvaluation.events) ? qualityEvaluation.events : [];
  const qualityTrade = qualityEvaluation.trade || next;
  events.push(...qualityEvents);

  const low = Number(candle.low);
  const high = Number(candle.high);
  const sl = Number(qualityTrade.stopLoss);
  const tp = Number(qualityTrade.takeProfit);
  const direction = qualityTrade.direction === "short" ? "short" : "long";

  const hitsTp = Number.isFinite(low) && Number.isFinite(high)
    ? (direction === "long" ? high >= tp : low <= tp)
    : false;
  const hitsSl = Number.isFinite(low) && Number.isFinite(high)
    ? (direction === "long" ? low <= sl : high >= sl)
    : false;

  if (hitsTp && hitsSl) {
    qualityTrade.status = "closed";
    qualityTrade.outcome = "ambiguous";
    qualityTrade.closeReason = "ambiguous_intrabar";
    qualityTrade.resolvedAt = candleTs;
    qualityTrade.resolvedCandleIndex = candleIndex;
    qualityTrade.exitPrice = Number(qualityTrade.entry);
    events.push("closed_ambiguous");
    return { trade: qualityTrade, events, closed: true };
  }

  if (hitsTp) {
    qualityTrade.status = "closed";
    qualityTrade.outcome = "win";
    qualityTrade.closeReason = "take_profit";
    qualityTrade.resolvedAt = candleTs;
    qualityTrade.resolvedCandleIndex = candleIndex;
    qualityTrade.exitPrice = tp;
    events.push("closed_tp");
    return { trade: qualityTrade, events, closed: true };
  }

  if (hitsSl) {
    qualityTrade.status = "closed";
    qualityTrade.outcome = "loss";
    qualityTrade.closeReason = "stop_loss";
    qualityTrade.resolvedAt = candleTs;
    qualityTrade.resolvedCandleIndex = candleIndex;
    qualityTrade.exitPrice = sl;
    events.push("closed_sl");
    return { trade: qualityTrade, events, closed: true };
  }

  return { trade: qualityTrade, events, closed: false };
}
