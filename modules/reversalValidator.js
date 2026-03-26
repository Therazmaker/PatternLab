function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function evaluateBearishReversalEvidence(candles = [], context = {}) {
  const rows = candles.slice(-4);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2] || {};
  const prev2 = rows[rows.length - 3] || {};
  const emaValue = toNum(context?.ema?.value, toNum(last.close));

  const closeBelowEma = toNum(last.close) < emaValue;
  const breakdown = Boolean(context?.structure?.structureBreakdown);
  const lowerHighLowerLow = Boolean(context?.structure?.lowerHigh && context?.structure?.lowerLow);
  const bearishFollowthrough = toNum(last.close) < toNum(prev.close)
    && toNum(prev.close) <= toNum(prev2.close);
  const momentumDeterioration = context?.momentum?.bias === "bearish" || toNum(last.close) < toNum(last.open);
  const failedRetest = breakdown && toNum(prev.high) > emaValue && toNum(last.close) < toNum(prev.low);

  const components = {
    breakdown,
    closeBelowEma,
    bearishFollowthrough,
    failedRetest,
    momentumDeterioration,
    lowerHighLowerLow,
  };

  const reversalEvidenceScore = Number((
    (breakdown ? 0.35 : 0)
    + (closeBelowEma ? 0.2 : 0)
    + (bearishFollowthrough ? 0.2 : 0)
    + (failedRetest ? 0.15 : 0)
    + (momentumDeterioration ? 0.1 : 0)
    + (lowerHighLowerLow ? 0.1 : 0)
  ).toFixed(3));

  const confirmedBreakdown = breakdown && closeBelowEma;
  const hasRobustCombination = (confirmedBreakdown && bearishFollowthrough)
    || (confirmedBreakdown && failedRetest)
    || (breakdown && lowerHighLowerLow && closeBelowEma);

  const pullbackLikely = context?.structure?.structureState === "higher_highs_and_higher_lows"
    && context?.priceVsEMA === "above"
    && !confirmedBreakdown
    && !bearishFollowthrough;

  return {
    reversalEvidenceScore,
    confirmedBreakdown,
    hasRobustCombination,
    pullbackLikely,
    components,
  };
}
