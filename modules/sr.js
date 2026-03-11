import { calcWinrate } from "./utils.js";

export function normalizeSrContext(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    nearSupport: Boolean(source.nearSupport),
    nearResistance: Boolean(source.nearResistance),
    srComment: source.srComment ? String(source.srComment).trim().slice(0, 180) : "",
  };
}

export function buildSrContextFromQuickAdd({ nearSupport = false, nearResistance = false, srComment = "" } = {}) {
  return normalizeSrContext({ nearSupport, nearResistance, srComment });
}

export function updateSignalSrContext(signal, srContextPatch) {
  const updated = structuredClone(signal);
  updated.srContext = normalizeSrContext({ ...(signal.srContext || {}), ...(srContextPatch || {}) });
  return updated;
}

function resolveSrFilter(value, positiveFn) {
  if (value === "only") return positiveFn();
  if (value === "exclude") return !positiveFn();
  return true;
}

export function filterSignalsBySr(signals, filters = {}) {
  return signals.filter((signal) => {
    const sr = normalizeSrContext(signal.srContext);
    return resolveSrFilter(filters.nearSupport, () => sr.nearSupport)
      && resolveSrFilter(filters.nearResistance, () => sr.nearResistance);
  });
}

function bucketMetrics(rows) {
  const reviewedRows = rows.filter((row) => row.outcome.status !== "pending");
  const wins = rows.filter((row) => row.outcome.status === "win").length;
  const losses = rows.filter((row) => row.outcome.status === "loss").length;
  return {
    total: rows.length,
    reviewed: reviewedRows.length,
    wins,
    losses,
    winrate: calcWinrate(wins, losses),
  };
}

export function computeSrStats(signals) {
  const normalized = signals.map((signal) => ({ ...signal, srContext: normalizeSrContext(signal.srContext) }));
  const baseline = bucketMetrics(normalized);
  const nearSupport = bucketMetrics(normalized.filter((row) => row.srContext.nearSupport));
  const nearResistance = bucketMetrics(normalized.filter((row) => row.srContext.nearResistance));
  const supportOnly = bucketMetrics(normalized.filter((row) => row.srContext.nearSupport && !row.srContext.nearResistance));
  const resistanceOnly = bucketMetrics(normalized.filter((row) => row.srContext.nearResistance && !row.srContext.nearSupport));
  const both = bucketMetrics(normalized.filter((row) => row.srContext.nearSupport && row.srContext.nearResistance));
  const neither = bucketMetrics(normalized.filter((row) => !row.srContext.nearSupport && !row.srContext.nearResistance));
  return { baseline, nearSupport, nearResistance, supportOnly, resistanceOnly, both, neither };
}

export function buildSrInsights(srStats) {
  const insights = [];
  const baseline = srStats.baseline.winrate;
  const supportDelta = Number((srStats.nearSupport.winrate - baseline).toFixed(2));
  const resistanceDelta = Number((srStats.nearResistance.winrate - baseline).toFixed(2));

  if (srStats.nearSupport.total >= 4) {
    if (supportDelta >= 5) insights.push("Las señales cerca de soporte muestran mejor rendimiento que el baseline.");
    else if (supportDelta <= -5) insights.push("Las señales cerca de soporte rinden por debajo del baseline actual.");
  }

  if (srStats.nearResistance.total >= 4) {
    if (resistanceDelta <= -5) insights.push("El patrón parece degradarse cerca de resistencia.");
    else if (resistanceDelta >= 5) insights.push("Cerca de resistencia aparece una mejora, pero conviene validarla con cautela.");
  }

  if (srStats.nearSupport.total < 8 || srStats.nearResistance.total < 8) {
    insights.push("La muestra con S/R todavía es baja.");
  }
  if (Math.abs(supportDelta) >= 5 || Math.abs(resistanceDelta) >= 5) {
    insights.push("La mejora observada aún necesita más evidencia.");
  }

  return insights.length ? insights : ["Sin señales fuertes por S/R todavía; continuar registrando contexto manual."];
}
