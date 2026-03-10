import { calcWinrate, clamp, toISODate } from "./utils.js";

function reviewedRows(signals) {
  return signals.filter((s) => ["win", "loss"].includes(s.outcome?.status));
}

export function computeDrawdown(outcomes = []) {
  let streak = 0;
  let maxStreak = 0;
  outcomes.forEach((status) => {
    if (status === "loss") {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else if (status === "win") {
      streak = 0;
    }
  });
  return maxStreak;
}

export function computeStability(signals = []) {
  const reviewed = reviewedRows(signals);
  if (reviewed.length < 3) return 35;
  const chunks = [];
  const chunkSize = Math.max(3, Math.floor(reviewed.length / 4));
  for (let i = 0; i < reviewed.length; i += chunkSize) {
    const slice = reviewed.slice(i, i + chunkSize);
    const wins = slice.filter((s) => s.outcome.status === "win").length;
    const losses = slice.filter((s) => s.outcome.status === "loss").length;
    chunks.push(calcWinrate(wins, losses));
  }
  const mean = chunks.reduce((acc, item) => acc + item, 0) / chunks.length;
  const variance = chunks.reduce((acc, item) => acc + (item - mean) ** 2, 0) / chunks.length;
  const deviation = Math.sqrt(variance);
  return Math.round(clamp(100 - deviation * 2.2, 0, 100));
}

export function computeRollingWinrate(signals = [], windowSize = 20) {
  const reviewed = reviewedRows(signals)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const points = [];
  for (let i = 0; i < reviewed.length; i += 1) {
    const window = reviewed.slice(Math.max(0, i - windowSize + 1), i + 1);
    const wins = window.filter((s) => s.outcome.status === "win").length;
    const losses = window.filter((s) => s.outcome.status === "loss").length;
    points.push({
      timestamp: reviewed[i].timestamp,
      rollingWinrate: calcWinrate(wins, losses),
      cumulativeWinrate: calcWinrate(
        reviewed.slice(0, i + 1).filter((s) => s.outcome.status === "win").length,
        reviewed.slice(0, i + 1).filter((s) => s.outcome.status === "loss").length,
      ),
      sample: window.length,
    });
  }
  return points;
}

export function computeAdaptivePatternScore(patternSignals = [], recentWindow = 12) {
  const reviewed = reviewedRows(patternSignals)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (!reviewed.length) return 0;

  const recent = reviewed.slice(-recentWindow);
  const recentWins = recent.filter((s) => s.outcome.status === "win").length;
  const recentLosses = recent.filter((s) => s.outcome.status === "loss").length;
  const overallWins = reviewed.filter((s) => s.outcome.status === "win").length;
  const overallLosses = reviewed.filter((s) => s.outcome.status === "loss").length;

  const recentWinrate = calcWinrate(recentWins, recentLosses);
  const overallWinrate = calcWinrate(overallWins, overallLosses);
  const stability = computeStability(reviewed);
  const sampleQuality = clamp((reviewed.length / 40) * 100, 20, 100);
  const recentDrawdown = computeDrawdown(recent.map((s) => s.outcome.status));

  let score = (0.4 * recentWinrate) + (0.3 * overallWinrate) + (0.2 * stability) + (0.1 * sampleQuality);
  if (recentDrawdown >= 3) score -= recentDrawdown * 3.5;
  if (reviewed.length < 8) score -= (8 - reviewed.length) * 2.5;

  return Math.round(clamp(score, 0, 100));
}

export function detectMarketRegime(signal, context = {}) {
  const hour = Number.isInteger(signal.hourBucket) ? signal.hourBucket : new Date(toISODate(signal.timestamp) || 0).getUTCHours();
  const vol = Number(signal.context?.volatility ?? signal.features?.volatility ?? context.volatility ?? 0.5);
  const freq = Number(context.patternFrequency ?? 0);
  const consistency = Number(context.patternConsistency ?? 50);

  if (vol >= 0.68 && consistency >= 56 && (hour <= 11 || hour >= 13)) return "trend-like";
  if (vol <= 0.38 && consistency >= 50 && freq >= 4) return "range-like";
  if (consistency <= 42 || vol >= 0.82 || freq <= 1) return "unstable";
  return "unclear";
}

export function computePatternMeta(signals = []) {
  const map = new Map();
  const patterns = [...new Set(signals.map((s) => s.patternName))];
  patterns.forEach((patternName) => {
    const rows = signals
      .filter((s) => s.patternName === patternName)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const reviewed = reviewedRows(rows);
    const adaptiveScore = computeAdaptivePatternScore(rows);
    const stability = computeStability(rows);
    const drawdown = computeDrawdown(reviewed.map((s) => s.outcome.status));
    const regimeStats = ["trend-like", "range-like", "unstable", "unclear"].reduce((acc, regime) => {
      const regimeRows = rows.filter((s) => s.marketRegime === regime);
      const wins = regimeRows.filter((s) => s.outcome.status === "win").length;
      const losses = regimeRows.filter((s) => s.outcome.status === "loss").length;
      acc[regime] = {
        total: regimeRows.length,
        winrate: calcWinrate(wins, losses),
      };
      return acc;
    }, {});
    map.set(patternName, {
      adaptiveScore,
      stability,
      drawdown,
      regimeStats,
      confidenceEvolution: computeRollingWinrate(rows, 20),
    });
  });
  return map;
}

export function computePatternVersionComparison(signals = []) {
  const grouped = new Map();
  signals.forEach((signal) => {
    const key = `${signal.patternName}__${signal.patternVersion || "v1"}`;
    if (!grouped.has(key)) grouped.set(key, { patternName: signal.patternName, patternVersion: signal.patternVersion || "v1", rows: [] });
    grouped.get(key).rows.push(signal);
  });

  return [...grouped.values()].map(({ patternName, patternVersion, rows }) => {
    const reviewed = reviewedRows(rows);
    const wins = reviewed.filter((s) => s.outcome.status === "win").length;
    const losses = reviewed.filter((s) => s.outcome.status === "loss").length;
    const drawdown = computeDrawdown(reviewed.map((s) => s.outcome.status));
    const consistency = computeStability(rows);
    const sampleSizeScore = Math.round(clamp((reviewed.length / 30) * 100, 0, 100));
    return {
      patternName,
      patternVersion,
      total: rows.length,
      reviewed: reviewed.length,
      wins,
      losses,
      winrate: calcWinrate(wins, losses),
      maxLosingStreak: drawdown,
      consistency,
      sampleSizeScore,
      robustnessScore: rows[0]?.patternMeta?.robustness?.robustnessScore ?? null,
    };
  }).sort((a, b) => b.winrate - a.winrate);
}

export function computeConfidenceEvolution(signals = [], patternName, windowSize = 20) {
  const rows = signals
    .filter((s) => s.patternName === patternName)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const rolling = computeRollingWinrate(rows, windowSize);
  const frequencyByPeriod = new Map();
  rows.forEach((row) => {
    const date = new Date(row.timestamp);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    frequencyByPeriod.set(key, (frequencyByPeriod.get(key) || 0) + 1);
  });
  return {
    patternName,
    rolling,
    frequencyByPeriod: [...frequencyByPeriod.entries()].map(([period, count]) => ({ period, count })),
  };
}
