import { calcWinrate } from "./utils.js";

function reviewed(rows = []) {
  return rows.filter((row) => ["win", "loss"].includes(row.outcome?.status));
}

function summarize(rows = []) {
  const reviewedRows = reviewed(rows);
  const wins = reviewedRows.filter((row) => row.outcome.status === "win").length;
  const losses = reviewedRows.filter((row) => row.outcome.status === "loss").length;
  return {
    total: rows.length,
    reviewed: reviewedRows.length,
    wins,
    losses,
    winrate: calcWinrate(wins, losses),
  };
}

function delta(base, stressed) {
  return Number((stressed.winrate - base.winrate).toFixed(2));
}

function findDominant(rows, key) {
  const counts = new Map();
  reviewed(rows).forEach((row) => {
    const value = row[key];
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function runStressTests(rows = [], config = {}) {
  const baseline = summarize(rows);
  const reviewedRows = reviewed(rows);
  const topN = Math.max(1, Number(config.topN ?? 2));

  const topWins = reviewedRows.filter((row) => row.outcome.status === "win").slice(0)
    .sort((a, b) => (b.contextScore ?? 50) - (a.contextScore ?? 50))
    .slice(0, topN)
    .map((row) => row.id);
  const stressedNoTopWins = summarize(rows.filter((row) => !topWins.includes(row.id)));

  const worstLosses = reviewedRows.filter((row) => row.outcome.status === "loss").slice(0)
    .sort((a, b) => (b.contextScore ?? 50) - (a.contextScore ?? 50))
    .slice(0, topN)
    .map((row) => row.id);
  const stressedNoWorstLosses = summarize(rows.filter((row) => !worstLosses.includes(row.id)));

  const dominantAsset = findDominant(rows, "asset");
  const noAssetRows = dominantAsset ? rows.filter((row) => row.asset !== dominantAsset) : rows;
  const stressedNoAsset = summarize(noAssetRows);

  const dominantHour = findDominant(rows, "hourBucket");
  const noHourRows = Number.isInteger(dominantHour) ? rows.filter((row) => row.hourBucket !== dominantHour) : rows;
  const stressedNoHour = summarize(noHourRows);

  const ordered = reviewedRows.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const recentSize = Math.max(4, Math.floor(ordered.length * 0.35));
  const recent = summarize(ordered.slice(-recentSize));

  const tests = [
    {
      id: "remove_top_wins",
      title: "Remove Top Wins Test",
      baseline,
      stressed: stressedNoTopWins,
      delta: delta(baseline, stressedNoTopWins),
      interpretation: delta(baseline, stressedNoTopWins) <= -12
        ? "El patrón parece depender de pocos wins destacados."
        : "El patrón mantiene desempeño razonable al quitar wins top.",
    },
    {
      id: "remove_worst_losses",
      title: "Remove Worst Losses Test",
      baseline,
      stressed: stressedNoWorstLosses,
      delta: delta(baseline, stressedNoWorstLosses),
      interpretation: delta(baseline, stressedNoWorstLosses) >= 10
        ? "Resultados sensibles a pocas pérdidas severas."
        : "Sin dependencia extrema de pérdidas puntuales.",
    },
    {
      id: "asset_exclusion",
      title: "Asset Exclusion Test",
      baseline,
      stressed: stressedNoAsset,
      delta: delta(baseline, stressedNoAsset),
      interpretation: delta(baseline, stressedNoAsset) <= -12
        ? `Al excluir ${dominantAsset}, el patrón pierde gran parte de su ventaja.`
        : "Comportamiento relativamente estable al excluir el asset dominante.",
      note: dominantAsset ? `Asset excluido: ${dominantAsset}` : "Sin asset dominante claro",
    },
    {
      id: "hour_exclusion",
      title: "Hour Exclusion Test",
      baseline,
      stressed: stressedNoHour,
      delta: delta(baseline, stressedNoHour),
      interpretation: delta(baseline, stressedNoHour) <= -10
        ? "Dependencia temporal relevante de su mejor franja horaria."
        : "Mantiene comportamiento razonable incluso sin su mejor hora.",
      note: Number.isInteger(dominantHour) ? `Hora excluida: ${String(dominantHour).padStart(2, "0")}:00` : "Sin hora dominante clara",
    },
    {
      id: "recent_window",
      title: "Recent Window Test",
      baseline,
      stressed: recent,
      delta: delta(baseline, recent),
      interpretation: delta(baseline, recent) <= -10
        ? "El rendimiento reciente se debilitó frente al total."
        : delta(baseline, recent) >= 10
          ? "Mejora reciente destacable, aún exploratoria."
          : "Reciente y total se mantienen en rango similar.",
      note: `Ventana reciente: ${recent.reviewed} revisadas`,
    },
  ];

  const sensitivity = Math.round((tests.reduce((acc, test) => acc + Math.abs(test.delta), 0) / tests.length) * 10) / 10;
  return { baseline, tests, sensitivity };
}
