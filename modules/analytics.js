import { calcWinrate, formatHourBucket } from "./utils.js";

function byCountDesc(a, b) {
  return b[1] - a[1];
}

function topLabels(values, max = 3) {
  const map = new Map();
  values.filter(Boolean).forEach((v) => map.set(v, (map.get(v) || 0) + 1));
  return [...map.entries()].sort(byCountDesc).slice(0, max).map(([label]) => label);
}

function baseMetrics(signals) {
  const wins = signals.filter((s) => s.outcome.status === "win").length;
  const losses = signals.filter((s) => s.outcome.status === "loss").length;
  const skips = signals.filter((s) => s.outcome.status === "skip").length;
  const pending = signals.filter((s) => s.outcome.status === "pending").length;
  return { total: signals.length, reviewed: signals.length - pending, wins, losses, skips, pending, winrate: calcWinrate(wins, losses) };
}

export function withCompareFilters(signals, filters) {
  let rows = [...signals];
  if (filters.asset) rows = rows.filter((s) => s.asset === filters.asset);
  if (filters.direction) rows = rows.filter((s) => s.direction === filters.direction);
  if (filters.timeframe) rows = rows.filter((s) => s.timeframe === filters.timeframe);
  rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (filters.rangeMode === "lastN" && filters.rangeValue) rows = rows.slice(0, filters.rangeValue);
  if (filters.rangeMode === "days" && filters.rangeValue) {
    const since = Date.now() - filters.rangeValue * 24 * 60 * 60 * 1000;
    rows = rows.filter((s) => new Date(s.timestamp).getTime() >= since);
  }
  return rows;
}

export function buildPatternInsight(summary) {
  if (summary.total < 5) return "Poca muestra todavía";
  if (summary.pending > summary.reviewed) return "Demasiados pendientes para concluir";
  if (summary.winrate >= 62 && summary.topAssets[0]) return `Buen rendimiento en ${summary.topAssets[0]}`;
  if (summary.topHours[0]) {
    const [start] = summary.topHours[0].split(":");
    return `Mejor desempeño en horario ${start}-${String((Number(start) + 3) % 24).padStart(2, "0")}`;
  }
  if (summary.total >= 12 && summary.winrate < 48) return "Patrón activo pero inestable";
  if (summary.total >= 12) return "Alta frecuencia, precisión media";
  return "Evidencia preliminar, seguir observando";
}

export function computePatternCompare(signals, patternNames) {
  return patternNames.map((patternName) => {
    const rows = signals.filter((s) => s.patternName === patternName);
    const metrics = baseMetrics(rows);
    const callCount = rows.filter((s) => s.direction === "CALL").length;
    const putCount = rows.filter((s) => s.direction === "PUT").length;
    const frequency = signals.length ? Math.round((rows.length / signals.length) * 1000) / 10 : 0;
    const topAssets = topLabels(rows.map((s) => s.asset));
    const topHours = topLabels(rows.map((s) => formatHourBucket(s.hourBucket)));
    const adaptiveScore = rows[0]?.patternMeta?.adaptiveScore ?? 0;
    const dominantRegime = topLabels(rows.map((s) => s.marketRegime), 1)[0] || "unclear";
    const summary = { patternName, ...metrics, topAssets, topHours, callCount, putCount, frequency, adaptiveScore, dominantRegime };
    return { ...summary, insight: buildPatternInsight(summary) };
  });
}

export function computePatternRanking(signals) {
  const patterns = [...new Set(signals.map((s) => s.patternName))];
  const ranked = patterns.map((patternName) => {
    const rows = signals.filter((s) => s.patternName === patternName);
    const metrics = baseMetrics(rows);
    const reviewedWeight = Math.min(1, metrics.reviewed / 25);
    const pendingPenalty = metrics.total ? (metrics.pending / metrics.total) * 12 : 0;
    const lowSamplePenalty = metrics.reviewed < 8 ? (8 - metrics.reviewed) * 2.2 : 0;
    const consistencyBonus = metrics.reviewed >= 12 && metrics.winrate >= 55 ? 4 : 0;
    const adaptiveScore = rows[0]?.patternMeta?.adaptiveScore ?? 0;
    const score = Number((metrics.winrate * reviewedWeight - pendingPenalty - lowSamplePenalty + consistencyBonus + adaptiveScore * 0.25).toFixed(2));
    const sampleQuality = metrics.reviewed >= 25 ? "High" : metrics.reviewed >= 12 ? "Medium" : "Low";
    const confidenceBadge = metrics.reviewed >= 25 ? "Stable" : metrics.reviewed >= 12 ? "Developing" : metrics.reviewed >= 6 ? "Early" : "Exploratory";
    return { patternName, ...metrics, sampleQuality, score, confidenceBadge, adaptiveScore };
  });
  return ranked.sort((a, b) => b.score - a.score).map((item, index) => ({ ...item, rank: index + 1 }));
}

export function computeHourAnalysis(signals) {
  const groups = Array.from({ length: 24 }, (_, hour) => ({ hour, rows: [] }));
  signals.forEach((s) => {
    if (Number.isInteger(s.hourBucket) && s.hourBucket >= 0 && s.hourBucket <= 23) groups[s.hourBucket].rows.push(s);
  });

  return groups.map(({ hour, rows }) => {
    const wins = rows.filter((s) => s.outcome.status === "win").length;
    const losses = rows.filter((s) => s.outcome.status === "loss").length;
    return {
      hour: formatHourBucket(hour),
      total: rows.length,
      wins,
      losses,
      winrate: calcWinrate(wins, losses),
      dominantPatterns: topLabels(rows.map((s) => s.patternName), 2).join(", ") || "-",
      dominantAssets: topLabels(rows.map((s) => s.asset), 2).join(", ") || "-",
    };
  });
}

export function computeAssetAnalysis(signals) {
  const assets = [...new Set(signals.map((s) => s.asset))].filter(Boolean);
  return assets
    .map((asset) => {
      const rows = signals.filter((s) => s.asset === asset);
      const metrics = baseMetrics(rows);
      return {
        asset,
        ...metrics,
        topPatterns: topLabels(rows.map((s) => s.patternName), 2).join(", ") || "-",
        dominantDirections: topLabels(rows.map((s) => s.direction), 2).join("/") || "-",
      };
    })
    .sort((a, b) => b.total - a.total);
}
