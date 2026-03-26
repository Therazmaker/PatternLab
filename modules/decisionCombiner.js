export function combineDecisionScores({ action = "no_trade", entrySignalScore = 0, context = {}, reversal = {} } = {}) {
  const isShort = action === "short";
  const contextState = context?.contextState || "range";
  const trendBiasScore = Number(context?.trendBiasScore || 0);
  const reversalEvidenceScore = Number(reversal?.reversalEvidenceScore || 0);

  let counterTrendPenalty = 0;
  if (isShort && contextState === "strong_uptrend") counterTrendPenalty = 0.75;
  else if (isShort && contextState === "weak_uptrend" && !reversal?.confirmedBreakdown) counterTrendPenalty = 0.5;
  else if (isShort && trendBiasScore > 0.15) counterTrendPenalty = 0.3;

  const finalShortScore = Number((entrySignalScore + reversalEvidenceScore - counterTrendPenalty).toFixed(3));

  return {
    entrySignalScore,
    reversalEvidenceScore,
    counterTrendPenalty,
    finalShortScore,
    contextScore: Number((trendBiasScore + reversalEvidenceScore - counterTrendPenalty).toFixed(3)),
  };
}
