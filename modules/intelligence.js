import { clamp, toISODate } from "./utils.js";
import { computePatternMeta, detectMarketRegime } from "./v4.js";

export const RADAR_WEIGHTS = {
  pattern: 0.38,
  context: 0.37,
  freshness: 0.25,
};

const CONTEXT_BASE = 50;
const CONTEXT_LABELS = [
  { min: 70, label: "Strong" },
  { min: 45, label: "Neutral" },
  { min: 0, label: "Weak" },
];

function reviewedRows(signals, predicate) {
  return signals.filter((s) => predicate(s) && ["win", "loss"].includes(s.outcome?.status));
}

function buildPerformanceMap(signals, keyFn) {
  const groups = new Map();
  signals.forEach((signal) => {
    const key = keyFn(signal);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { wins: 0, losses: 0, total: 0 });
    const row = groups.get(key);
    if (signal.outcome.status === "win") row.wins += 1;
    if (signal.outcome.status === "loss") row.losses += 1;
    row.total += 1;
  });

  const result = new Map();
  groups.forEach((row, key) => {
    const sample = row.wins + row.losses;
    const winrate = sample ? (row.wins / sample) * 100 : 50;
    result.set(key, { ...row, sample, winrate });
  });
  return result;
}

export function computeFreshnessScore(signal, now = Date.now()) {
  const ts = new Date(toISODate(signal.timestamp) || 0).getTime();
  if (!ts) return 0;
  const hours = (now - ts) / (1000 * 60 * 60);
  if (hours <= 0) return 100;
  if (hours >= 48) return 5;
  return Math.round(clamp(100 - hours * 2, 5, 100));
}

export function computeContextScore(signal, context) {
  let score = CONTEXT_BASE;
  const { hourStats, assetStats, patternStats, directionStats, recentPatternStats } = context;

  const hour = hourStats.get(signal.hourBucket);
  const asset = assetStats.get(signal.asset);
  const pattern = patternStats.get(signal.patternName);
  const direction = directionStats.get(signal.direction);
  const consistency = recentPatternStats.get(signal.patternName);

  if (hour?.sample >= 4) score += hour.winrate >= 58 ? 10 : hour.winrate <= 45 ? -10 : 0;
  if (asset?.sample >= 4) score += asset.winrate >= 58 ? 10 : asset.winrate <= 45 ? -10 : 0;
  if (pattern?.sample >= 6) score += pattern.winrate >= 57 ? 9 : pattern.winrate <= 46 ? -9 : 0;
  if (direction?.sample >= 6) score += direction.winrate >= 56 ? 6 : direction.winrate <= 44 ? -6 : 0;
  if (signal.session) score += 3;
  if (Number.isInteger(signal.hourBucket)) score += 2;
  if (consistency?.sample >= 5) score += consistency.winrate >= 60 ? 10 : consistency.winrate <= 42 ? -10 : 0;

  return Math.round(clamp(score, 0, 100));
}

export function generateAutoTags(signal, context, thresholds = {}) {
  const tags = [];
  const strongWinrate = thresholds.strongWinrate ?? 58;
  const weakWinrate = thresholds.weakWinrate ?? 45;
  const lowSample = thresholds.lowSample ?? 5;
  const highFrequency = thresholds.highFrequency ?? 12;

  const hour = context.hourStats.get(signal.hourBucket);
  const asset = context.assetStats.get(signal.asset);
  const pattern = context.patternStats.get(signal.patternName);

  if (hour?.sample >= 4 && hour.winrate >= strongWinrate) tags.push("strong-hour");
  if (hour?.sample >= 4 && hour.winrate <= weakWinrate) tags.push("weak-hour");
  if (asset?.sample >= 4 && asset.winrate >= strongWinrate) tags.push("strong-asset");
  if (asset?.sample >= 4 && asset.winrate <= weakWinrate) tags.push("weak-asset");
  if (pattern?.sample < lowSample) tags.push("low-sample");
  if (pattern?.total >= highFrequency) tags.push("high-frequency");
  if (pattern?.sample >= 6 && pattern.winrate >= 56) tags.push("stable-pattern");
  if (pattern?.sample >= 6 && pattern.winrate <= 46) tags.push("unstable-pattern");

  return tags;
}

export function computeRadarScore(signal, patternScoreNormalized, contextScoreNormalized, freshnessScore) {
  let score = RADAR_WEIGHTS.pattern * patternScoreNormalized + RADAR_WEIGHTS.context * contextScoreNormalized + RADAR_WEIGHTS.freshness * freshnessScore;
  if (signal.outcome.status === "pending") {
    const ageHours = (Date.now() - new Date(signal.timestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 12) score -= Math.min(15, (ageHours - 12) * 0.7);
  }
  if (signal.autoTags?.includes("unstable-pattern")) score -= 9;
  return Math.round(clamp(score, 0, 100));
}

export function buildRadarInsights(signal) {
  if (signal.outcome.status === "pending" && signal.contextScore >= 68 && signal.autoTags.includes("stable-pattern")) return "Buen contexto y patrón estable";
  if (signal.contextScore < 45 && signal.autoTags.includes("stable-pattern")) return "Patrón bueno pero contexto débil";
  if (signal.autoTags.includes("low-sample") && signal.freshnessScore >= 65) return "Señal reciente pero poca evidencia";
  if (signal.outcome.status === "pending") return "Nueva señal, falta revisión";
  return "Revisión completada, mantener seguimiento";
}

export function contextLabel(value) {
  return CONTEXT_LABELS.find((item) => value >= item.min)?.label || "Weak";
}

export function enrichSignals(signals, patternRanking = []) {
  const reviewed = reviewedRows(signals, () => true);
  const recentCut = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const reviewedRecent = reviewedRows(signals, (s) => new Date(s.timestamp).getTime() >= recentCut);

  const context = {
    hourStats: buildPerformanceMap(reviewed, (s) => s.hourBucket),
    assetStats: buildPerformanceMap(reviewed, (s) => s.asset),
    patternStats: buildPerformanceMap(reviewed, (s) => s.patternName),
    directionStats: buildPerformanceMap(reviewed, (s) => s.direction),
    recentPatternStats: buildPerformanceMap(reviewedRecent, (s) => s.patternName),
  };

  const patternScores = patternRanking.length
    ? new Map(patternRanking.map((row) => [row.patternName, row.score]))
    : new Map();
  const maxPattern = Math.max(...[...patternScores.values(), 1]);
  const minPattern = Math.min(...[...patternScores.values(), 0]);

  const enrichedBase = signals.map((signal) => {
    const contextScore = computeContextScore(signal, context);
    const freshnessScore = computeFreshnessScore(signal);
    const autoTags = generateAutoTags(signal, context);
    const patternRows = signals.filter((s) => s.patternName === signal.patternName);
    const reviewedPattern = reviewedRows(patternRows, () => true);
    const marketRegime = detectMarketRegime(signal, {
      patternFrequency: patternRows.length,
      patternConsistency: reviewedPattern.length
        ? Math.round((reviewedPattern.filter((s) => s.outcome.status === "win").length / reviewedPattern.length) * 100)
        : 50,
    });
    const pRaw = patternScores.get(signal.patternName) ?? 0;
    const patternNormalized = Math.round(((pRaw - minPattern) / (maxPattern - minPattern || 1)) * 100);
    const radarScore = computeRadarScore({ ...signal, autoTags }, patternNormalized, contextScore, freshnessScore);
    const badges = [
      contextScore >= 70 ? "Strong Context" : contextScore <= 44 ? "Weak Context" : "Neutral Context",
      autoTags.includes("high-frequency") ? "High Frequency Pattern" : "Low Sample Pattern",
      freshnessScore >= 65 ? "Fresh Signal" : "Aged Signal",
    ];

    return {
      ...signal,
      patternVersion: signal.patternVersion || "v1",
      contextScore,
      contextLabel: contextLabel(contextScore),
      autoTags,
      freshnessScore,
      radarScore,
      radarBadges: badges,
      marketRegime,
      radarInsight: buildRadarInsights({ ...signal, contextScore, autoTags, freshnessScore }),
    };
  });

  const patternMeta = computePatternMeta(enrichedBase);
  return enrichedBase.map((signal) => ({
    ...signal,
    patternMeta: patternMeta.get(signal.patternName) || signal.patternMeta || {
      adaptiveScore: null,
      stability: null,
      drawdown: null,
      regimeStats: {},
    },
  }));
}
