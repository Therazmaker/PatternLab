export function compareStrategyRuns(runs = []) {
  const rows = Array.isArray(runs) ? runs : [];
  return rows
    .map((run) => ({
      id: run.id,
      timestamp: run.timestamp,
      strategyId: run.strategyId,
      symbol: run.symbol,
      timeframe: run.timeframe,
      netPnl: run.metrics?.netPnl || 0,
      winRate: run.metrics?.winRate || 0,
      totalTrades: run.metrics?.totalTrades || 0,
      maxDrawdown: run.metrics?.maxDrawdown || 0,
      profitFactor: run.metrics?.profitFactor || 0,
    }))
    .sort((a, b) => (b.netPnl - a.netPnl) || (b.winRate - a.winRate));
}
