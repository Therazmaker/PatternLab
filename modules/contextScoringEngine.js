function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getDefaultContextLearningRow(overrides = {}) {
  return {
    samples: 0,
    wins: 0,
    losses: 0,
    winrate: 0,
    danger_score: 0,
    confidence_bias: 0,
    last_outcomes: [],
    learned_bias: "neutral",
    preferred_posture: "wait",
    trust_operator: 0,
    operator_caution: 0,
    ...overrides,
  };
}

export function computeContextScoring(contextRow = {}) {
  const row = getDefaultContextLearningRow(contextRow);
  const samples = Math.max(0, safeNumber(row.samples, 0));
  const wins = Math.max(0, safeNumber(row.wins, 0));
  const losses = Math.max(0, safeNumber(row.losses, 0));
  const explicitWinrate = safeNumber(row.winrate, NaN);
  const winrate = Number.isFinite(explicitWinrate)
    ? clamp(explicitWinrate, 0, 1)
    : samples > 0
      ? clamp(wins / Math.max(samples, 1), 0, 1)
      : 0;

  const recent = Array.isArray(row.last_outcomes) ? row.last_outcomes.slice(-6) : [];
  const recentLossPressure = recent.reduce((acc, item, idx) => {
    if (item !== "loss") return acc;
    const weight = 0.12 + ((idx + 1) / Math.max(recent.length, 1)) * 0.08;
    return acc + weight;
  }, 0);

  const baseDanger = clamp((1 - winrate) * 0.72 + (losses / Math.max(samples, 1)) * 0.28, 0, 1);
  const samplePenalty = samples < 4 ? (4 - samples) * 0.04 : 0;
  const dangerScore = clamp(Math.max(baseDanger, safeNumber(row.danger_score, 0)) + recentLossPressure + samplePenalty, 0, 1);

  const familiarity = clamp(samples / 12, 0, 1);
  const confidenceAdjustment = clamp(
    (winrate - 0.5) * 0.56
      + (safeNumber(row.confidence_bias, 0) * 0.5)
      - (dangerScore * 0.45)
      + (familiarity * 0.18),
    -0.5,
    0.5,
  );

  const contextScore = clamp(
    (winrate * 0.58)
      + (familiarity * 0.27)
      + ((1 - dangerScore) * 0.25)
      + confidenceAdjustment * 0.15,
    0,
    1,
  );

  return {
    context_score: Number(contextScore.toFixed(3)),
    danger_score: Number(dangerScore.toFixed(3)),
    familiarity: Number(familiarity.toFixed(3)),
    confidence_adjustment: Number(confidenceAdjustment.toFixed(3)),
    winrate: Number(winrate.toFixed(3)),
    samples,
    wins,
    losses,
    learned_bias: row.learned_bias || "neutral",
    preferred_posture: row.preferred_posture || "wait",
    last_outcomes: recent,
    trust_operator: Number(clamp(row.trust_operator, 0, 1).toFixed(3)),
    operator_caution: Number(clamp(row.operator_caution, 0, 1).toFixed(3)),
  };
}
