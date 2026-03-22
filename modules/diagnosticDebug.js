export function logDiagnosticScoreBreakdown(logger = console, tradeId, scores = {}) {
  logger.debug("Diagnostic score breakdown", {
    tradeId,
    trendAlignmentScore: scores.trendAlignmentScore,
    structureScore: scores.structureScore,
    momentumScore: scores.momentumScore,
    timingScore: scores.timingScore,
    followThroughScore: scores.followThroughScore,
    operatorContextScore: scores.operatorContextScore,
  });
}
