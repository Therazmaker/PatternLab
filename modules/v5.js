import { calcWinrate, clamp } from "./utils.js";
import { computeAdaptivePatternScore, computeStability } from "./v4.js";

const REVIEWED_STATUSES = new Set(["win", "loss"]);

function reviewed(rows = []) {
  return rows.filter((row) => REVIEWED_STATUSES.has(row.outcome?.status));
}

function wins(rows = []) {
  return rows.filter((row) => row.outcome?.status === "win").length;
}

function losses(rows = []) {
  return rows.filter((row) => row.outcome?.status === "loss").length;
}

function buildMetrics(rows = []) {
  const reviewedRows = reviewed(rows);
  const winCount = wins(reviewedRows);
  const lossCount = losses(reviewedRows);
  return {
    total: rows.length,
    reviewed: reviewedRows.length,
    wins: winCount,
    losses: lossCount,
    winrate: calcWinrate(winCount, lossCount),
    reviewedRatio: rows.length ? reviewedRows.length / rows.length : 0,
    stability: computeStability(rows),
    adaptiveScore: Math.round(computeAdaptivePatternScore(rows)),
  };
}

function confidenceBand(score = 0) {
  if (score >= 75) return { key: "high", label: "stronger evidence" };
  if (score >= 52) return { key: "medium", label: "moderate evidence" };
  return { key: "low", label: "exploratory" };
}

function firstSignals(rows, count = 3) {
  return rows.slice(0, count).map((row) => ({
    id: row.id,
    asset: row.asset,
    patternName: row.patternName,
    direction: row.direction,
    timestamp: row.timestamp,
    status: row.outcome?.status,
  }));
}

function keyBy(values = []) {
  return values.join("__");
}

export function computePatternDrift(trainingMetrics, forwardMetrics) {
  if (!trainingMetrics.reviewed || !forwardMetrics.reviewed) {
    return { value: 0, label: "insufficient evidence", note: "No hay suficientes señales revisadas para estimar drift." };
  }
  const diff = Math.round((forwardMetrics.winrate - trainingMetrics.winrate) * 100) / 100;
  const forwardStability = forwardMetrics.stability;
  let label = "stable";
  if (Math.abs(diff) <= 4) label = forwardStability < 45 ? "noisy" : "stable";
  else if (diff > 4) label = "improving";
  else label = "weakening";

  return {
    value: diff,
    label,
    note: `Winrate training ${trainingMetrics.winrate}% vs forward ${forwardMetrics.winrate}% (Δ ${diff}pp).`,
  };
}

export function computeForwardValidation(signals = [], config = {}) {
  const splitMode = config.splitMode || "ratio";
  const ratio = clamp(Number(config.ratio ?? 0.7), 0.3, 0.9);
  const splitDate = config.splitDate ? new Date(config.splitDate).getTime() : null;

  const sorted = [...signals].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let trainingRows = [];
  let forwardRows = [];

  if (splitMode === "date" && splitDate) {
    trainingRows = sorted.filter((row) => new Date(row.timestamp).getTime() <= splitDate);
    forwardRows = sorted.filter((row) => new Date(row.timestamp).getTime() > splitDate);
  } else {
    const splitIndex = Math.max(1, Math.floor(sorted.length * ratio));
    trainingRows = sorted.slice(0, splitIndex);
    forwardRows = sorted.slice(splitIndex);
  }

  const grouped = new Map();
  sorted.forEach((row) => {
    const key = keyBy([row.patternName, row.patternVersion || "v1"]);
    if (!grouped.has(key)) grouped.set(key, { patternName: row.patternName, patternVersion: row.patternVersion || "v1" });
  });

  const rows = [...grouped.values()].map((base) => {
    const training = trainingRows.filter((row) => row.patternName === base.patternName && (row.patternVersion || "v1") === base.patternVersion);
    const forward = forwardRows.filter((row) => row.patternName === base.patternName && (row.patternVersion || "v1") === base.patternVersion);
    const trainingMetrics = buildMetrics(training);
    const forwardMetrics = buildMetrics(forward);
    const drift = computePatternDrift(trainingMetrics, forwardMetrics);

    return {
      ...base,
      training: trainingMetrics,
      forward: forwardMetrics,
      drift,
    };
  }).sort((a, b) => b.forward.winrate - a.forward.winrate);

  return {
    splitMode,
    ratio,
    splitDate: splitMode === "date" ? config.splitDate || null : null,
    trainingSize: trainingRows.length,
    forwardSize: forwardRows.length,
    rows,
  };
}

export function buildErrorClusters(signals = []) {
  const problemRows = signals.filter((row) => {
    if (row.outcome?.status === "loss") return true;
    return Boolean(row.reviewMeta?.executionError) || Boolean(row.reviewMeta?.lateEntry);
  });
  if (!problemRows.length) return [];

  const create = (id, name, test, insight, suggestionType = null) => {
    const rows = problemRows.filter(test);
    if (rows.length < 3) return null;
    return {
      id,
      name,
      count: rows.length,
      weight: Math.round((rows.length / problemRows.length) * 1000) / 10,
      sampleSignals: firstSignals(rows, 5),
      insight,
      suggestionType,
      signals: rows,
    };
  };

  const clusters = [];

  const byPatternAsset = new Map();
  problemRows.forEach((row) => {
    const key = keyBy([row.patternName, row.asset]);
    if (!byPatternAsset.has(key)) byPatternAsset.set(key, []);
    byPatternAsset.get(key).push(row);
  });
  byPatternAsset.forEach((rows, key) => {
    if (rows.length < 3) return;
    const [patternName, asset] = key.split("__");
    clusters.push({
      id: `cluster_${key}`,
      name: `Pérdidas ${patternName} en ${asset}`,
      count: rows.length,
      weight: Math.round((rows.length / problemRows.length) * 1000) / 10,
      sampleSignals: firstSignals(rows, 4),
      insight: `Se repiten pérdidas para ${patternName} en ${asset}. Puede requerir segmentación por activo.`,
      suggestionType: "segmentation",
      signals: rows,
    });
  });

  const middayCluster = create(
    "cluster_midday",
    "Pérdidas en horario 13-15",
    (row) => Number.isInteger(row.hourBucket) && row.hourBucket >= 13 && row.hourBucket <= 15,
    "Existe concentración de errores en 13:00-15:59. Revisar condiciones de sesión y volatilidad.",
    "pattern-tuning",
  );
  if (middayCluster) clusters.push(middayCluster);

  const unstableCluster = create(
    "cluster_unstable",
    "Pérdidas en régimen unstable",
    (row) => row.marketRegime === "unstable",
    "Las pérdidas aparecen con frecuencia en régimen unstable. Podría necesitar filtro de contexto.",
    "confidence-warning",
  );
  if (unstableCluster) clusters.push(unstableCluster);

  const lowContextCluster = create(
    "cluster_low_context",
    "Pérdidas con contextScore < 40",
    (row) => Number(row.contextScore) < 40,
    "El contexto débil aparece de forma recurrente en resultados adversos.",
    "pattern-tuning",
  );
  if (lowContextCluster) clusters.push(lowContextCluster);

  const executionCluster = create(
    "cluster_execution_error",
    "Errores de ejecución marcados",
    (row) => Boolean(row.reviewMeta?.executionError),
    "Los errores de ejecución tienen peso relevante en pérdidas revisadas.",
    "review-needed",
  );
  if (executionCluster) clusters.push(executionCluster);

  const lateEntryCluster = create(
    "cluster_late_entry",
    "Entradas tardías",
    (row) => Boolean(row.reviewMeta?.lateEntry),
    "Entradas tardías coinciden con bajo desempeño. Revisar timing de ejecución.",
    "review-needed",
  );
  if (lateEntryCluster) clusters.push(lateEntryCluster);

  return clusters.sort((a, b) => b.count - a.count);
}

export function scoreHypothesisConfidence(evidence = {}) {
  const sample = evidence.sampleSize || 0;
  const delta = Math.abs((evidence.winrate ?? 0) - (evidence.baselineWinrate ?? 0));
  const stability = Number(evidence.stability ?? 40);
  const reviewedRatio = Number(evidence.reviewedRatio ?? 0);

  let raw = 0;
  raw += clamp(sample / 40, 0, 1) * 35;
  raw += clamp(delta / 18, 0, 1) * 30;
  raw += clamp(stability / 100, 0, 1) * 20;
  raw += clamp(reviewedRatio, 0, 1) * 15;

  const score = Math.round(raw);
  return { score, ...confidenceBand(score) };
}

export function generateHypotheses(signals = [], context = {}) {
  const rows = reviewed(signals);
  if (rows.length < 8) return [];
  const hypotheses = [];
  const now = new Date().toISOString();

  const baselineWinrate = calcWinrate(wins(rows), losses(rows));

  const pushHypothesis = ({ type, title, description, entity, evidence }) => {
    const confidence = scoreHypothesisConfidence(evidence);
    hypotheses.push({
      id: `hyp_${type}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: now,
      type,
      title,
      description: `${description} (${confidence.label}).`,
      entity,
      confidence: confidence.key,
      evidence,
      status: "open",
      userDecision: context.previousDecisions?.[type] || null,
      notes: "",
    });
  };

  const patternGroups = [...new Set(rows.map((r) => r.patternName))];
  patternGroups.forEach((patternName) => {
    const patternRows = rows.filter((row) => row.patternName === patternName);
    if (patternRows.length < 6) return;
    const pBaseline = calcWinrate(wins(patternRows), losses(patternRows));
    const stability = computeStability(patternRows);

    const assetMap = new Map();
    patternRows.forEach((row) => {
      if (!assetMap.has(row.asset)) assetMap.set(row.asset, []);
      assetMap.get(row.asset).push(row);
    });
    const topAsset = [...assetMap.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (topAsset && topAsset[1].length >= 4) {
      const assetWinrate = calcWinrate(wins(topAsset[1]), losses(topAsset[1]));
      if (assetWinrate - pBaseline >= 7) {
        pushHypothesis({
          type: "pattern-asset-strength",
          title: `${patternName} parece más fuerte en ${topAsset[0]}`,
          description: `En ${topAsset[0]} este patrón supera su baseline histórico`,
          entity: { patternName, asset: topAsset[0] },
          evidence: { sampleSize: topAsset[1].length, winrate: assetWinrate, baselineWinrate: pBaseline, stability, reviewedRatio: 1 },
        });
      }
    }

    const hourGroups = new Map();
    patternRows.forEach((row) => {
      if (!Number.isInteger(row.hourBucket)) return;
      if (!hourGroups.has(row.hourBucket)) hourGroups.set(row.hourBucket, []);
      hourGroups.get(row.hourBucket).push(row);
    });
    hourGroups.forEach((hourRows, hour) => {
      if (hourRows.length < 4) return;
      const hourWinrate = calcWinrate(wins(hourRows), losses(hourRows));
      if (pBaseline - hourWinrate >= 10) {
        pushHypothesis({
          type: "pattern-hour-weakness",
          title: `${patternName} parece más débil en horario ${hour}:00`,
          description: `El bloque horario ${hour}:00 muestra menor winrate frente al baseline del patrón`,
          entity: { patternName, hourBucket: hour },
          evidence: { sampleSize: hourRows.length, winrate: hourWinrate, baselineWinrate: pBaseline, stability, reviewedRatio: 1 },
        });
      }
    });

    const callRows = patternRows.filter((row) => row.direction === "CALL");
    const putRows = patternRows.filter((row) => row.direction === "PUT");
    if (callRows.length >= 4 && putRows.length >= 4) {
      const callWinrate = calcWinrate(wins(callRows), losses(callRows));
      const putWinrate = calcWinrate(wins(putRows), losses(putRows));
      if (callWinrate - putWinrate >= 8) {
        pushHypothesis({
          type: "direction-stability",
          title: `Las señales CALL de ${patternName} muestran mejor estabilidad que las PUT`,
          description: `CALL mantiene mejor rendimiento relativo que PUT en revisiones equivalentes`,
          entity: { patternName, preferredDirection: "CALL" },
          evidence: { sampleSize: Math.min(callRows.length, putRows.length), winrate: callWinrate, baselineWinrate: putWinrate, stability, reviewedRatio: 1 },
        });
      }
    }

    const sorted = [...patternRows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (sorted.length >= 10) {
      const middle = Math.floor(sorted.length * 0.6);
      const historical = sorted.slice(0, middle);
      const recent = sorted.slice(middle);
      const recentWinrate = calcWinrate(wins(recent), losses(recent));
      const historicalWinrate = calcWinrate(wins(historical), losses(historical));
      if (historicalWinrate - recentWinrate >= 8) {
        pushHypothesis({
          type: "recent-deterioration",
          title: `${patternName} podría estar deteriorándose recientemente`,
          description: "La ventana reciente muestra caída frente al histórico interno",
          entity: { patternName },
          evidence: { sampleSize: recent.length, winrate: recentWinrate, baselineWinrate: historicalWinrate, stability, reviewedRatio: 1 },
        });
      }
    }

    const regimeRows = patternRows.filter((row) => row.marketRegime === "range-like");
    if (regimeRows.length >= 4) {
      const regimeWinrate = calcWinrate(wins(regimeRows), losses(regimeRows));
      if (regimeWinrate - pBaseline >= 7) {
        pushHypothesis({
          type: "regime-fit",
          title: `${patternName} parece funcionar mejor bajo régimen range-like`,
          description: "El régimen range-like mejora el resultado frente al baseline del patrón",
          entity: { patternName, marketRegime: "range-like" },
          evidence: { sampleSize: regimeRows.length, winrate: regimeWinrate, baselineWinrate: pBaseline, stability, reviewedRatio: 1 },
        });
      }
    }

    const versionMap = new Map();
    patternRows.forEach((row) => {
      const version = row.patternVersion || "v1";
      if (!versionMap.has(version)) versionMap.set(version, []);
      versionMap.get(version).push(row);
    });
    const versions = [...versionMap.entries()].filter(([, vRows]) => vRows.length >= 4);
    if (versions.length >= 2) {
      versions.sort((a, b) => calcWinrate(wins(b[1]), losses(b[1])) - calcWinrate(wins(a[1]), losses(a[1])));
      const [top, low] = [versions[0], versions[versions.length - 1]];
      const topWinrate = calcWinrate(wins(top[1]), losses(top[1]));
      const lowWinrate = calcWinrate(wins(low[1]), losses(low[1]));
      if (topWinrate - lowWinrate >= 8) {
        pushHypothesis({
          type: "version-consistency",
          title: `La versión ${top[0]} de ${patternName} muestra mejor consistencia que ${low[0]}`,
          description: "La comparación por versión sugiere diferencias relevantes que vale investigar",
          entity: { patternName, strongerVersion: top[0], weakerVersion: low[0] },
          evidence: { sampleSize: Math.min(top[1].length, low[1].length), winrate: topWinrate, baselineWinrate: lowWinrate, stability, reviewedRatio: 1 },
        });
      }
    }
  });

  return hypotheses;
}

export function rankSuggestions(items = [], feedback = {}) {
  const accepted = new Set(feedback.acceptedSuggestionTypes || []);
  const ignored = new Set(feedback.ignoredSuggestionTypes || []);
  return [...items]
    .map((item) => {
      let score = item.priority === "high" ? 3 : item.priority === "medium" ? 2 : 1;
      if (accepted.has(item.type)) score += 0.8;
      if (ignored.has(item.type)) score -= 0.6;
      return { ...item, rankScore: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

export function generateSuggestions(signals = [], deps = {}) {
  const rows = reviewed(signals);
  if (!rows.length) return [];

  const suggestions = [];
  const forward = deps.forwardValidation;
  const clusters = deps.errorClusters || [];

  const patternGroups = [...new Set(signals.map((s) => s.patternName))];
  patternGroups.forEach((patternName) => {
    const patternRows = signals.filter((s) => s.patternName === patternName);
    const reviewedRows = reviewed(patternRows);
    const pending = patternRows.filter((s) => s.outcome?.status === "pending").length;
    if (pending >= Math.max(4, reviewedRows.length * 0.6)) {
      suggestions.push({
        id: `sug_review_${patternName}`,
        type: "review-needed",
        priority: "high",
        title: `${patternName}: demasiados pending para concluir`,
        reason: `Hay ${pending} pending sobre ${patternRows.length} señales. Conviene revisar más casos antes de priorizar conclusiones.`,
      });
    }

    const assetCount = new Set(patternRows.map((s) => s.asset)).size;
    if (assetCount >= 3) {
      suggestions.push({
        id: `sug_segment_${patternName}`,
        type: "segmentation",
        priority: "medium",
        title: `${patternName}: considerar separar por asset`,
        reason: `El patrón opera en ${assetCount} activos distintos, lo que puede ocultar diferencias de calidad entre instrumentos.`,
      });
    }
  });

  clusters.slice(0, 4).forEach((cluster) => {
    suggestions.push({
      id: `sug_cluster_${cluster.id}`,
      type: cluster.suggestionType || "pattern-tuning",
      priority: cluster.weight >= 28 ? "high" : "medium",
      title: `Error cluster: ${cluster.name}`,
      reason: `${cluster.count} casos (${cluster.weight}% del bloque problemático). ${cluster.insight}`,
    });
  });

  if (forward?.rows?.length) {
    forward.rows.forEach((row) => {
      if (row.forward.reviewed < 4) {
        suggestions.push({
          id: `sug_forward_low_${row.patternName}_${row.patternVersion}`,
          type: "confidence-warning",
          priority: "low",
          title: `${row.patternName} ${row.patternVersion}: muestra forward aún baja`,
          reason: `Solo ${row.forward.reviewed} revisadas en forward. No priorizar conclusiones todavía.`,
        });
      }
      if (row.drift.label === "weakening") {
        suggestions.push({
          id: `sug_forward_weak_${row.patternName}_${row.patternVersion}`,
          type: "opportunity",
          priority: "high",
          title: `${row.patternName} ${row.patternVersion}: posible weakening en forward`,
          reason: row.drift.note,
        });
      }
    });
  }

  const contextRows = rows.filter((s) => Number(s.contextScore) < 40);
  if (contextRows.length >= 6) {
    const contextWinrate = calcWinrate(wins(contextRows), losses(contextRows));
    const allWinrate = calcWinrate(wins(rows), losses(rows));
    suggestions.push({
      id: "sug_low_context",
      type: "pattern-tuning",
      priority: allWinrate - contextWinrate >= 10 ? "high" : "medium",
      title: "Context score bajo está degradando resultados",
      reason: `Winrate global ${allWinrate}% vs ${contextWinrate}% con contextScore < 40 en ${contextRows.length} casos revisados.`,
    });
  }

  return suggestions;
}

export function applyMetaFeedbackBias(items = [], metaFeedback = {}, entity = "suggestion") {
  if (!items.length) return items;
  const accepted = entity === "suggestion" ? new Set(metaFeedback.acceptedSuggestionTypes || []) : new Set(metaFeedback.usefulHypothesisTypes || []);
  const ignored = entity === "suggestion" ? new Set(metaFeedback.ignoredSuggestionTypes || []) : new Set(metaFeedback.weakHypothesisTypes || []);

  return [...items].sort((a, b) => {
    const aScore = (accepted.has(a.type) ? 1 : 0) - (ignored.has(a.type) ? 1 : 0);
    const bScore = (accepted.has(b.type) ? 1 : 0) - (ignored.has(b.type) ? 1 : 0);
    return bScore - aScore;
  });
}

export function updateMetaFeedback(metaFeedback, payload = {}) {
  const next = {
    usefulHypothesisTypes: [...(metaFeedback.usefulHypothesisTypes || [])],
    weakHypothesisTypes: [...(metaFeedback.weakHypothesisTypes || [])],
    dismissedHypothesisTypes: [...(metaFeedback.dismissedHypothesisTypes || [])],
    acceptedSuggestionTypes: [...(metaFeedback.acceptedSuggestionTypes || [])],
    ignoredSuggestionTypes: [...(metaFeedback.ignoredSuggestionTypes || [])],
    history: [...(metaFeedback.history || [])],
  };

  const pushUnique = (key, value) => {
    if (!value) return;
    if (!next[key].includes(value)) next[key].push(value);
  };

  if (payload.kind === "hypothesis") {
    if (payload.decision === "useful") pushUnique("usefulHypothesisTypes", payload.type);
    if (payload.decision === "weak") pushUnique("weakHypothesisTypes", payload.type);
    if (payload.decision === "dismissed" || payload.decision === "archived") pushUnique("dismissedHypothesisTypes", payload.type);
  }

  if (payload.kind === "suggestion") {
    if (payload.decision === "accepted") pushUnique("acceptedSuggestionTypes", payload.type);
    if (payload.decision === "ignored") pushUnique("ignoredSuggestionTypes", payload.type);
  }

  next.history.push({ ...payload, at: new Date().toISOString() });
  next.history = next.history.slice(-400);
  return next;
}
