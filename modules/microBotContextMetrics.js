function toPct(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

export function createMicroBotContextMetrics() {
  return {
    totalLongSignals: 0,
    totalShortSignals: 0,
    blockedLongs: 0,
    blockedShorts: 0,
    counterTrendShortAttempts: 0,
    allowedCounterTrendShorts: 0,
    shortInUptrendRate: 0,
    reversalConfirmedShortRate: 0,
    _shortAttemptsInUptrend: 0,
    _reversalConfirmedShorts: 0,
  };
}

export function updateMicroBotContextMetrics(metrics = createMicroBotContextMetrics(), decision = {}) {
  const next = { ...metrics };
  const isUptrend = ["strong_uptrend", "weak_uptrend"].includes(decision.contextState);
  const blocked = decision.action === "no_trade" && (decision.blockedReason || "").includes("short_blocked");
  const allowedShort = decision.action === "short";

  if (decision.setup === "failed_breakout_long") next.totalLongSignals += 1;
  if (decision.setup === "failed_breakout_short") next.totalShortSignals += 1;

  if (decision.setup === "failed_breakout_long" && decision.action === "no_trade") next.blockedLongs += 1;
  if (decision.setup === "failed_breakout_short" && decision.action === "no_trade") next.blockedShorts += 1;

  if (decision.setup === "failed_breakout_short" && isUptrend) {
    next.counterTrendShortAttempts += 1;
    next._shortAttemptsInUptrend += 1;
    if (allowedShort) next.allowedCounterTrendShorts += 1;
  }

  if (allowedShort && isUptrend) {
    next.shortInUptrendRate = toPct(next.allowedCounterTrendShorts, Math.max(1, next._shortAttemptsInUptrend));
  } else {
    next.shortInUptrendRate = toPct(next.allowedCounterTrendShorts, Math.max(1, next.counterTrendShortAttempts));
  }

  if (allowedShort && Number(decision.reversalEvidenceScore || 0) >= 0.55) {
    next._reversalConfirmedShorts += 1;
  }
  next.reversalConfirmedShortRate = toPct(next._reversalConfirmedShorts, Math.max(1, next.totalShortSignals));

  if (blocked) {
    next.shortInUptrendRate = toPct(next.allowedCounterTrendShorts, Math.max(1, next.counterTrendShortAttempts));
  }

  return next;
}
