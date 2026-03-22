const DEFAULT_STATE = {
  versions: [],
  validations: [],
  liveInstances: [],
  degradationAlerts: [],
};

function toIso(value = Date.now()) {
  return new Date(value).toISOString();
}

function slugify(value) {
  return String(value || "strategy").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "strategy";
}

function stableHash(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input || {});
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function nextVersionId(versions, strategyId) {
  const maxN = versions
    .filter((row) => row.strategyId === strategyId)
    .map((row) => Number(String(row.versionId || "").replace(/[^0-9]/g, "")) || 0)
    .reduce((acc, n) => Math.max(acc, n), 0);
  return `v${maxN + 1}`;
}

export function normalizeLifecycleState(value = {}) {
  return {
    versions: Array.isArray(value.versions) ? value.versions : [],
    validations: Array.isArray(value.validations) ? value.validations : [],
    liveInstances: Array.isArray(value.liveInstances) ? value.liveInstances : [],
    degradationAlerts: Array.isArray(value.degradationAlerts) ? value.degradationAlerts : [],
  };
}

export function createStrategyVersion(state, payload = {}) {
  const current = normalizeLifecycleState(state);
  const strategyId = payload.strategyId || `${slugify(payload.name || payload.baseStrategyId)}-${Date.now().toString(36)}`;
  const versionId = payload.versionId || nextVersionId(current.versions, strategyId);
  const definition = payload.definition || {};
  const row = {
    strategyId,
    versionId,
    name: payload.name || payload.baseStrategyId || strategyId,
    description: payload.description || "",
    definition,
    definitionHash: stableHash(definition),
    createdAt: payload.createdAt || toIso(),
    parentVersionId: payload.parentVersionId || null,
    status: payload.status || "draft",
  };
  return {
    state: {
      ...current,
      versions: [row, ...current.versions.filter((item) => !(item.strategyId === strategyId && item.versionId === versionId))],
    },
    version: row,
  };
}

export function ensureVersionFromDefinition(state, payload = {}) {
  const current = normalizeLifecycleState(state);
  const strategyId = payload.strategyId;
  const definitionHash = stableHash(payload.definition || {});
  const existing = current.versions.find((row) => row.strategyId === strategyId && row.definitionHash === definitionHash);
  if (existing) return { state: current, version: existing, created: false };
  const created = createStrategyVersion(current, payload);
  return { ...created, created: true };
}

export function updateVersionStatus(state, strategyId, versionId, status) {
  const current = normalizeLifecycleState(state);
  return {
    ...current,
    versions: current.versions.map((row) => (row.strategyId === strategyId && row.versionId === versionId ? { ...row, status } : row)),
  };
}

export function addValidationResult(state, payload = {}) {
  const current = normalizeLifecycleState(state);
  const validation = {
    validationId: payload.validationId || `val_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    strategyId: payload.strategyId,
    versionId: payload.versionId,
    range: payload.range || {},
    metrics: payload.metrics || {},
    pass: Boolean(payload.pass),
    timestamp: payload.timestamp || toIso(),
    comparedBacktest: payload.comparedBacktest || {},
  };
  const nextState = {
    ...current,
    validations: [validation, ...current.validations].slice(0, 400),
  };
  return {
    state: updateVersionStatus(nextState, payload.strategyId, payload.versionId, validation.pass ? "validated" : "tested"),
    validation,
  };
}

export function promoteVersionToLiveShadow(state, payload = {}) {
  const current = normalizeLifecycleState(state);
  const instance = {
    instanceId: payload.instanceId || `live_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    strategyId: payload.strategyId,
    versionId: payload.versionId,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    activatedAt: payload.activatedAt || toIso(),
    status: payload.status || "active",
    baselineBacktest: payload.baselineBacktest || null,
    baselineValidation: payload.baselineValidation || null,
    liveMetrics: payload.liveMetrics || { rollingWinrate: 0, rollingExpectancy: 0, drawdown: 0, signalFrequency: 0, sampleSize: 0 },
    degrading: false,
  };
  const versions = current.versions.map((row) => {
    if (row.strategyId === payload.strategyId && row.versionId === payload.versionId) return { ...row, status: "live" };
    return row;
  });
  return {
    state: {
      ...current,
      versions,
      liveInstances: [instance, ...current.liveInstances.filter((item) => item.instanceId !== instance.instanceId)],
    },
    instance,
  };
}

export function updateLiveInstanceMetrics(state, payload = {}) {
  const current = normalizeLifecycleState(state);
  const nextLiveInstances = current.liveInstances.map((row) => {
    if (row.instanceId !== payload.instanceId) return row;
    return {
      ...row,
      liveMetrics: payload.liveMetrics || row.liveMetrics,
      degrading: Boolean(payload.degrading),
      lastSignalAt: payload.lastSignalAt || row.lastSignalAt || null,
      status: payload.status || row.status,
    };
  });

  const nextAlerts = payload.degrading
    ? [{
      id: `deg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      instanceId: payload.instanceId,
      strategyId: payload.strategyId,
      versionId: payload.versionId,
      timestamp: toIso(),
      message: "Strategy performance degrading. Create new version?",
      metrics: payload.liveMetrics || {},
    }, ...current.degradationAlerts].slice(0, 100)
    : current.degradationAlerts;

  return { ...current, liveInstances: nextLiveInstances, degradationAlerts: nextAlerts };
}

export function computeLiveMetrics(signals = []) {
  if (!signals.length) return { rollingWinrate: 0, rollingExpectancy: 0, drawdown: 0, signalFrequency: 0, sampleSize: 0 };
  const resolved = signals.filter((row) => ["win", "loss", "flat", "skip"].includes(row?.outcome?.status));
  const wins = resolved.filter((row) => row?.outcome?.status === "win").length;
  const losses = resolved.filter((row) => row?.outcome?.status === "loss").length;
  const sampleSize = resolved.length;
  const rollingWinrate = sampleSize ? wins / sampleSize : 0;
  const expectancy = sampleSize ? ((wins - losses) / sampleSize) : 0;
  const pnlSeries = resolved.map((row) => Number(row?.futuresPolicy?.replay?.pnlR || (row?.outcome?.status === "win" ? 1 : row?.outcome?.status === "loss" ? -1 : 0)));
  let peak = 0;
  let equity = 0;
  let drawdown = 0;
  pnlSeries.forEach((pnl) => {
    equity += pnl;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  });
  const times = resolved.map((row) => new Date(row.timestamp).getTime()).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const spanHours = times.length > 1 ? Math.max(1, (times[times.length - 1] - times[0]) / (1000 * 60 * 60)) : 1;
  return {
    rollingWinrate,
    rollingExpectancy: expectancy,
    drawdown,
    signalFrequency: sampleSize / spanHours,
    sampleSize,
  };
}

export function detectDegradation(liveMetrics = {}, baseline = {}) {
  const baselineWinrate = Number(baseline.winRate || baseline.winrate || 0);
  const baselineExpectancy = Number(baseline.expectancy || 0);
  const baselineDrawdown = Number(baseline.maxDrawdown || baseline.drawdown || 0);
  const wrDrop = baselineWinrate > 0 ? (baselineWinrate - Number(liveMetrics.rollingWinrate || 0)) : 0;
  const expDrop = baselineExpectancy - Number(liveMetrics.rollingExpectancy || 0);
  const ddWorse = Number(liveMetrics.drawdown || 0) < (baselineDrawdown * 1.25);
  return wrDrop > 0.12 || expDrop > 0.25 || ddWorse;
}

export function getVersionLineage(versions = [], strategyId) {
  const rows = versions.filter((row) => row.strategyId === strategyId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return rows.map((row) => `${row.versionId}${row.parentVersionId ? ` ← ${row.parentVersionId}` : ""}`).join(" → ");
}
