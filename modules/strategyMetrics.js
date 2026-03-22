function avg(rows = []) {
  if (!rows.length) return 0;
  return rows.reduce((acc, value) => acc + Number(value || 0), 0) / rows.length;
}

export function computeMaxDrawdown(equityCurve = []) {
  let peak = equityCurve[0]?.equity || 0;
  let maxDd = 0;
  equityCurve.forEach((row) => {
    peak = Math.max(peak, row.equity);
    maxDd = Math.max(maxDd, peak - row.equity);
  });
  return maxDd;
}

export function computeStrategyMetrics(trades = [], equityCurve = []) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const flats = trades.filter((t) => t.pnl === 0);
  const longs = trades.filter((t) => t.side === "LONG");
  const shorts = trades.filter((t) => t.side === "SHORT");
  const pnls = trades.map((t) => t.pnl);
  const rs = trades.map((t) => t.rMultiple || 0);

  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let winStreak = 0;
  let lossStreak = 0;
  trades.forEach((trade) => {
    if (trade.pnl > 0) {
      winStreak += 1;
      lossStreak = 0;
    } else if (trade.pnl < 0) {
      lossStreak += 1;
      winStreak = 0;
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
    longestWinStreak = Math.max(longestWinStreak, winStreak);
    longestLossStreak = Math.max(longestLossStreak, lossStreak);
  });

  const grossProfit = wins.reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnl, 0));
  const totalTrades = trades.length;

  const confidenceBuckets = { low: 0, mid: 0, high: 0 };
  trades.forEach((trade) => {
    const c = Number(trade.confidence || 0);
    if (c >= 0.66) confidenceBuckets.high += 1;
    else if (c >= 0.33) confidenceBuckets.mid += 1;
    else confidenceBuckets.low += 1;
  });

  return {
    totalTrades,
    longCount: longs.length,
    shortCount: shorts.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRate: totalTrades ? (wins.length / totalTrades) : 0,
    avgPnl: avg(pnls),
    avgR: avg(rs),
    expectancy: totalTrades ? (grossProfit - grossLoss) / totalTrades : 0,
    maxDrawdown: computeMaxDrawdown(equityCurve),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0),
    longestWinStreak,
    longestLossStreak,
    averageHoldBars: avg(trades.map((t) => t.holdBars || 0)),
    confidenceBreakdown: confidenceBuckets,
    netPnl: grossProfit - grossLoss,
  };
}
