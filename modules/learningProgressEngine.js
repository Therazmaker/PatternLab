function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function avg(values = []) {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + Number(v || 0), 0) / values.length;
}

export function computeLearningProgressPacket({ memorySnapshot = {}, tradeJournalRows = [] } = {}) {
  const contexts = Object.values(memorySnapshot?.contexts || {});
  const rules = Object.values(memorySnapshot?.rules || {});
  const closedTrades = (memorySnapshot?.trades || []).filter((row) => ["win", "loss", "breakeven"].includes(String(row?.result || row?.outcome?.result || "")));
  const wins = closedTrades.filter((row) => (row?.result || row?.outcome?.result) === "win");
  const waitRows = (memorySnapshot?.decisions || []).filter((row) => String(row?.posture || "").toLowerCase() === "wait");
  const waitNoTrade = waitRows.filter((row) => row?.no_trade_reason).length;

  const scenarioReliabilityScores = contexts.flatMap((row) => Object.values(row?.scenarioReliability || {}));
  const maturityRaw = clamp(
    (contexts.length >= 20 ? 0.32 : (contexts.length / 20) * 0.32)
      + (closedTrades.length >= 30 ? 0.36 : (closedTrades.length / 30) * 0.36)
      + (avg(scenarioReliabilityScores) * 0.18)
      + ((rules.length >= 8 ? 1 : rules.length / 8) * 0.14),
    0,
    1,
  );

  const lessons = tradeJournalRows.slice(0, 5).map((row) => {
    const label = Array.isArray(row.lesson_tags) ? row.lesson_tags[0] : null;
    return label || `${row.result || "unknown"}:${row.exit_reason || "closed"}`;
  });
  const dangerousContexts = contexts.filter((row) => Number(row?.danger_score || 0) >= 0.72 || Number(row?.blocked_for_candles || 0) > 0).length;
  const reliableContexts = contexts.filter((row) => Number(row?.wins || 0) >= 3 && (Number(row?.wins || 0) / Math.max(1, Number(row?.counts || row?.samples || 0))) >= 0.62).length;
  const exploratoryTrades = tradeJournalRows.filter((row) => row?.trade_mode === "exploration").length;
  const learningVelocity = Number(((closedTrades.length / Math.max(1, contexts.length)) * (1 + avg(scenarioReliabilityScores))).toFixed(3));

  return {
    memoryCoverage: Number(clamp(contexts.length / 30, 0, 1).toFixed(3)),
    learnedContexts: contexts.length,
    activeRules: rules.length,
    scenarioReliability: Number(avg(scenarioReliabilityScores).toFixed(3)),
    executorPaperWinRate: Number((closedTrades.length ? wins.length / closedTrades.length : 0).toFixed(3)),
    waitAccuracy: Number((waitRows.length ? waitNoTrade / waitRows.length : 0).toFixed(3)),
    learningMaturity: Number(maturityRaw.toFixed(3)),
    tradesLearned: closedTrades.length,
    dangerousContexts,
    reliableContexts,
    exploratoryTrades,
    exploratoryTradeShare: Number((tradeJournalRows.length ? exploratoryTrades / tradeJournalRows.length : 0).toFixed(3)),
    learningVelocity,
    lastLessons: lessons,
  };
}
