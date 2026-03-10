import { calcWinrate } from "./utils.js";

function reviewedStatuses(rows = []) {
  return rows
    .filter((row) => ["win", "loss"].includes(row.outcome?.status))
    .map((row) => row.outcome.status);
}

function shuffle(values = []) {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function bootstrap(values = []) {
  const arr = [];
  for (let i = 0; i < values.length; i += 1) {
    arr.push(values[Math.floor(Math.random() * values.length)]);
  }
  return arr;
}

function maxLosingStreak(statuses = []) {
  let current = 0;
  let max = 0;
  statuses.forEach((status) => {
    if (status === "loss") {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  });
  return max;
}

function percentile(sorted = [], p) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
  return sorted[index];
}

export function runMonteCarlo(rows = [], config = {}) {
  const statuses = reviewedStatuses(rows);
  const simulations = Math.max(50, Number(config.simulations ?? 300));
  const method = config.method === "bootstrap" ? "bootstrap" : "shuffle";

  if (statuses.length < 6) {
    return {
      ok: false,
      reason: "Insufficient evidence para Monte Carlo (mínimo 6 revisadas).",
      simulations: 0,
      method,
      samples: statuses.length,
      runs: [],
    };
  }

  const runs = [];
  for (let i = 0; i < simulations; i += 1) {
    const sequence = method === "bootstrap" ? bootstrap(statuses) : shuffle(statuses);
    const wins = sequence.filter((status) => status === "win").length;
    const losses = sequence.filter((status) => status === "loss").length;
    runs.push({
      winrate: calcWinrate(wins, losses),
      maxLosingStreak: maxLosingStreak(sequence),
      losses,
    });
  }

  return {
    ok: true,
    method,
    simulations,
    samples: statuses.length,
    runs,
  };
}

export function computeMonteCarloSummary(result) {
  if (!result?.ok) {
    return {
      simulations: result?.simulations ?? 0,
      insight: result?.reason || "Insufficient evidence",
      histogram: [],
      streakHistogram: [],
    };
  }

  const winrates = result.runs.map((item) => item.winrate).sort((a, b) => a - b);
  const streaks = result.runs.map((item) => item.maxLosingStreak).sort((a, b) => a - b);
  const meanWinrate = Number((winrates.reduce((acc, item) => acc + item, 0) / winrates.length).toFixed(2));
  const medianWinrate = percentile(winrates, 50);
  const dispersion = Number((percentile(winrates, 90) - percentile(winrates, 10)).toFixed(2));

  const histogramMap = new Map();
  winrates.forEach((value) => {
    const bucket = `${Math.floor(value / 5) * 5}-${Math.floor(value / 5) * 5 + 4}`;
    histogramMap.set(bucket, (histogramMap.get(bucket) || 0) + 1);
  });

  const streakMap = new Map();
  streaks.forEach((value) => {
    streakMap.set(String(value), (streakMap.get(String(value)) || 0) + 1);
  });

  const insight = dispersion <= 10
    ? "Patrón con distribución relativamente estable."
    : dispersion <= 18
      ? "Dispersión moderada: ventaja potencial pero sensible al orden."
      : "Alta dispersión, ventaja poco consistente ante permutaciones.";

  return {
    simulations: result.simulations,
    samples: result.samples,
    method: result.method,
    meanWinrate,
    medianWinrate,
    p10: percentile(winrates, 10),
    p25: percentile(winrates, 25),
    p75: percentile(winrates, 75),
    p90: percentile(winrates, 90),
    bestCase: Math.max(...winrates),
    worstCase: Math.min(...winrates),
    worstObservedStreak: Math.max(...streaks),
    avgMaxLosingStreak: Number((streaks.reduce((acc, item) => acc + item, 0) / streaks.length).toFixed(2)),
    dispersion,
    insight,
    histogram: [...histogramMap.entries()].map(([bucket, count]) => ({ bucket, count })),
    streakHistogram: [...streakMap.entries()].map(([bucket, count]) => ({ bucket, count: Number(count) })),
  };
}
