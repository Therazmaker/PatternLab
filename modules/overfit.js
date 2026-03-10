import { calcWinrate } from "./utils.js";

function reviewed(rows = []) {
  return rows.filter((row) => ["win", "loss"].includes(row.outcome?.status));
}

function partitionTrainingForward(rows = []) {
  const sorted = [...rows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (sorted.length < 8) return { training: sorted, forward: [] };
  const cut = Math.max(4, Math.floor(sorted.length * 0.7));
  return { training: sorted.slice(0, cut), forward: sorted.slice(cut) };
}

function statusWinrate(rows = []) {
  const wins = rows.filter((row) => row.outcome?.status === "win").length;
  const losses = rows.filter((row) => row.outcome?.status === "loss").length;
  return calcWinrate(wins, losses);
}

function topDependency(rows, key) {
  const reviewedRows = reviewed(rows);
  if (!reviewedRows.length) return { label: "-", ratio: 0, count: 0 };
  const counts = new Map();
  reviewedRows.forEach((row) => {
    const value = row[key] || "-";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const [label, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { label, count, ratio: Number(((count / reviewedRows.length) * 100).toFixed(2)) };
}

function recentVsHistorical(rows = []) {
  const reviewedRows = reviewed(rows).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (reviewedRows.length < 10) return null;
  const recentSize = Math.max(4, Math.floor(reviewedRows.length * 0.35));
  const recent = reviewedRows.slice(-recentSize);
  const historical = reviewedRows.slice(0, reviewedRows.length - recentSize);
  if (!historical.length) return null;
  return {
    recentWinrate: statusWinrate(recent),
    historicalWinrate: statusWinrate(historical),
    delta: Number((statusWinrate(recent) - statusWinrate(historical)).toFixed(2)),
  };
}

function outcomeVariability(rows = []) {
  const reviewedRows = reviewed(rows).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (reviewedRows.length < 12) return 0;
  const chunk = Math.max(4, Math.floor(reviewedRows.length / 4));
  const winrates = [];
  for (let i = 0; i < reviewedRows.length; i += chunk) {
    const slice = reviewedRows.slice(i, i + chunk);
    if (slice.length >= 3) winrates.push(statusWinrate(slice));
  }
  if (winrates.length < 2) return 0;
  const mean = winrates.reduce((acc, item) => acc + item, 0) / winrates.length;
  const variance = winrates.reduce((acc, item) => acc + ((item - mean) ** 2), 0) / winrates.length;
  return Number(Math.sqrt(variance).toFixed(2));
}

export function buildOverfitReasons(rows = [], { patternName, patternVersion = "all" } = {}) {
  const reasons = [];
  const reviewedRows = reviewed(rows);
  const wins = reviewedRows.filter((row) => row.outcome.status === "win").length;
  const losses = reviewedRows.filter((row) => row.outcome.status === "loss").length;
  const pending = rows.filter((row) => row.outcome?.status === "pending").length;
  const winrate = statusWinrate(rows);

  if (reviewedRows.length <= 7 && winrate >= 70) {
    reasons.push({
      code: "high_winrate_low_sample",
      severity: 2,
      message: "Winrate alto con muestra pequeña.",
      evidence: `${winrate}% con solo ${reviewedRows.length} revisadas`,
      suggestion: "Aumentar muestra antes de validar mejoras.",
    });
  }

  const trainForward = partitionTrainingForward(rows);
  if (trainForward.forward.length >= 3) {
    const trainingWinrate = statusWinrate(trainForward.training);
    const forwardWinrate = statusWinrate(trainForward.forward);
    const drop = trainingWinrate - forwardWinrate;
    if (drop >= 15) {
      reasons.push({
        code: "training_forward_drop",
        severity: drop >= 24 ? 3 : 2,
        message: "El patrón cayó con fuerza en validación forward.",
        evidence: `Training ${trainingWinrate}% vs forward ${forwardWinrate}%`,
        suggestion: "Revisar si la lógica depende del contexto histórico inicial.",
      });
    }
  }

  const topAsset = topDependency(rows, "asset");
  if (topAsset.ratio >= 65 && reviewedRows.length >= 6) {
    reasons.push({
      code: "asset_dependency",
      severity: topAsset.ratio >= 80 ? 3 : 2,
      message: `Posible dependencia excesiva de ${topAsset.label}.`,
      evidence: `${topAsset.ratio}% de las señales revisadas`,
      suggestion: "Probar exclusión del asset dominante en Stress Test.",
    });
  }

  const topHour = topDependency(rows, "hourBucket");
  if (topHour.ratio >= 55 && reviewedRows.length >= 6) {
    reasons.push({
      code: "hour_dependency",
      severity: topHour.ratio >= 70 ? 3 : 1,
      message: "Dependencia relevante de una franja horaria.",
      evidence: `${topHour.ratio}% concentrado en hora ${String(topHour.label).padStart(2, "0")}:00`,
      suggestion: "Evaluar estabilidad fuera de la hora dominante.",
    });
  }

  const byVersion = new Map();
  rows.forEach((row) => {
    const v = row.patternVersion || "v1";
    if (!byVersion.has(v)) byVersion.set(v, []);
    byVersion.get(v).push(row);
  });
  if (byVersion.size > 1 && patternVersion === "all") {
    const best = [...byVersion.entries()].map(([version, versionRows]) => ({ version, reviewed: reviewed(versionRows).length, winrate: statusWinrate(versionRows) }))
      .sort((a, b) => b.winrate - a.winrate)[0];
    const worst = [...byVersion.entries()].map(([version, versionRows]) => ({ version, reviewed: reviewed(versionRows).length, winrate: statusWinrate(versionRows) }))
      .sort((a, b) => a.winrate - b.winrate)[0];
    if (best && worst && best.reviewed <= 6 && (best.winrate - worst.winrate) >= 25) {
      reasons.push({
        code: "premature_version_jump",
        severity: 2,
        message: `La mejora de ${best.version} parece prematura por baja muestra.`,
        evidence: `${best.version} ${best.winrate}% (${best.reviewed}) vs ${worst.version} ${worst.winrate}%`,
        suggestion: "Esperar más revisiones antes de declarar mejora estructural.",
      });
    }
  }

  const variability = outcomeVariability(rows);
  if (variability >= 16) {
    reasons.push({
      code: "recent_instability",
      severity: variability >= 22 ? 3 : 2,
      message: "La muestra reciente es inestable.",
      evidence: `Variabilidad estimada ${variability}pp`,
      suggestion: "Reducir exposición analítica a cambios abruptos recientes.",
    });
  }

  if (wins > 0 && losses > 0 && wins <= 3 && winrate >= 66) {
    reasons.push({
      code: "few_big_wins",
      severity: 2,
      message: "La ventaja depende de muy pocos wins relativos.",
      evidence: `${wins} wins y ${losses} losses revisadas`,
      suggestion: "Buscar confirmación en más ciclos de mercado.",
    });
  }

  if (rows.length >= 6 && (pending / rows.length) >= 0.35) {
    reasons.push({
      code: "too_many_pending",
      severity: 1,
      message: "Demasiados pending respecto al total.",
      evidence: `${pending}/${rows.length} pending`,
      suggestion: "Completar review para reducir sesgo de selección.",
    });
  }

  const drift = recentVsHistorical(rows);
  if (drift && Math.abs(drift.delta) >= 14) {
    reasons.push({
      code: "historical_recent_gap",
      severity: Math.abs(drift.delta) >= 20 ? 3 : 2,
      message: "Diferencia fuerte entre histórico y reciente.",
      evidence: `Histórico ${drift.historicalWinrate}% vs reciente ${drift.recentWinrate}%`,
      suggestion: "Separar hipótesis por régimen o periodo.",
    });
  }

  return reasons;
}

export function computeOverfitRisk(rows = [], context = {}) {
  const reasons = buildOverfitReasons(rows, context);
  const score = reasons.reduce((acc, item) => acc + item.severity, 0);
  const overfitRisk = score >= 9 ? "high" : score >= 4 ? "medium" : "low";
  return {
    overfitRisk,
    overfitScore: score,
    reasons,
    label: "Indicadores heurísticos de posible sobreajuste",
  };
}
