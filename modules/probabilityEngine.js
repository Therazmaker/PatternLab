function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeScores(scores = {}) {
  const safe = {
    bullish: Math.max(0, Number(scores.bullish || 0)),
    bearish: Math.max(0, Number(scores.bearish || 0)),
    neutral: Math.max(0, Number(scores.neutral || 0)),
  };
  const total = safe.bullish + safe.bearish + safe.neutral;
  if (total <= 0) return { bullishScore: 33.33, bearishScore: 33.33, neutralScore: 33.34 };
  return {
    bullishScore: (safe.bullish / total) * 100,
    bearishScore: (safe.bearish / total) * 100,
    neutralScore: (safe.neutral / total) * 100,
  };
}

export function computeProbabilityScores({ feature = {}, regime = {} } = {}) {
  const reasons = [];
  const score = { bullish: 20, bearish: 20, neutral: 20 };

  const rsi = Number(feature.rsi || 50);
  if (rsi >= 60) {
    score.bullish += 15;
    reasons.push("Bullish score increased due to RSI above 60");
  } else if (rsi <= 40) {
    score.bearish += 15;
    reasons.push("Bearish pressure detected due to RSI below 40");
  } else {
    score.neutral += 10;
  }

  if (feature.emaFast > feature.emaSlow) {
    score.bullish += 20;
    reasons.push("Bullish score increased due to EMA alignment");
  } else if (feature.emaFast < feature.emaSlow) {
    score.bearish += 20;
    reasons.push("Bearish pressure detected from bearish EMA alignment");
  } else {
    score.neutral += 8;
  }

  if (feature.emaSlope > 0) {
    score.bullish += 10;
    reasons.push("Positive EMA slope supports upside continuation");
  } else if (feature.emaSlope < 0) {
    score.bearish += 10;
    reasons.push("Negative EMA slope supports downside continuation");
  } else {
    score.neutral += 6;
  }

  if (feature.momentum > 0) {
    score.bullish += 10;
    reasons.push("Positive momentum adds bullish pressure");
  } else if (feature.momentum < 0) {
    score.bearish += 10;
    reasons.push("Negative momentum adds bearish pressure");
  } else {
    score.neutral += 6;
  }

  if (regime.regime === "trending_up") score.bullish += 12;
  if (regime.regime === "trending_down") score.bearish += 12;
  if (regime.regime === "ranging") score.neutral += 16;
  if (regime.regime === "volatile") {
    score.neutral += 10;
    score.bullish += 4;
    score.bearish += 4;
  }

  if (feature.volatilityState === "high") {
    score.neutral += 6;
    reasons.push("High volatility lowers directional certainty");
  }

  const normalized = normalizeScores(score);
  const pairs = [
    ["bullish", normalized.bullishScore],
    ["bearish", normalized.bearishScore],
    ["neutral", normalized.neutralScore],
  ].sort((a, b) => b[1] - a[1]);

  const bias = pairs[0][0];
  const confidence = clamp(pairs[0][1] - pairs[1][1]);

  return {
    bullishScore: clamp(normalized.bullishScore),
    bearishScore: clamp(normalized.bearishScore),
    neutralScore: clamp(normalized.neutralScore),
    confidence,
    bias,
    explanation: reasons.slice(0, 4).join(". ") || "Scores are balanced with mixed directional evidence.",
  };
}
