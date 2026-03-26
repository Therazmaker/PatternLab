function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function closeEarlyTrade(trade = {}, reason = "early_exit", context = {}) {
  const candleTs = context.candle?.timestamp || new Date().toISOString();
  const candleIndex = Number.isFinite(context.candleIndex) ? context.candleIndex : null;
  const next = { ...trade };
  next.status = "closed";
  next.outcome = "loss";
  next.closeReason = reason;
  next.earlyCloseReason = reason;
  next.resolvedAt = candleTs;
  next.resolvedCandleIndex = candleIndex;
  next.exitPrice = toFinite(context.candle?.close, toFinite(next.entry, 0));
  next.earlyCloseMfe = toFinite(next.mfe, 0);
  next.earlyCloseMae = toFinite(next.mae, 0);
  next.earlyCloseCandlesInTrade = toFinite(next.candlesInTrade, 0);
  return next;
}

export function evaluateEarlyTradeQuality(trade = {}, context = {}) {
  if (trade.status !== "active") return { trade, events: [], closed: false };

  const next = { ...trade };
  const events = [];
  const candlesInTrade = toFinite(next.candlesInTrade, 0);
  const mfe = Math.max(0, toFinite(next.mfe, 0));
  const mae = Math.max(0, toFinite(next.mae, 0));
  const baseRange = Math.max(0.000001, Math.abs(toFinite(next.takeProfit, 0) - toFinite(next.entry, 0)));
  const noFollowThroughPct = Math.max(0.01, toFinite(context.noFollowThroughPct, 0.2));

  if (candlesInTrade <= 2 && mae > mfe) {
    const closedTrade = closeEarlyTrade(next, "early_rejection", context);
    events.push("early_exit_early_rejection");
    return { trade: closedTrade, events, closed: true };
  }

  if (candlesInTrade >= 2 && candlesInTrade <= 3) {
    const minimumFollowThrough = baseRange * noFollowThroughPct;
    if (mfe < minimumFollowThrough) {
      const closedTrade = closeEarlyTrade(next, "no_followthrough", context);
      events.push("early_exit_no_followthrough");
      return { trade: closedTrade, events, closed: true };
    }
  }

  const dominanceRatio = mae > 0 ? mfe / mae : (mfe > 0 ? Number.POSITIVE_INFINITY : 0);
  next.favorableDominanceRatio = Number(dominanceRatio.toFixed(5));
  next.isWeakTradeQuality = dominanceRatio < 1.2;
  if (next.isWeakTradeQuality) {
    events.push("trade_quality_weak");
    if (!next.tradeQualityWarningAtCandle) next.tradeQualityWarningAtCandle = candlesInTrade;
    if (context.closeWeakTrades) {
      const closedTrade = closeEarlyTrade(next, "weak_favorable_dominance", context);
      events.push("early_exit_weak_favorable_dominance");
      return { trade: closedTrade, events, closed: true };
    }
  }

  return { trade: next, events, closed: false };
}
