import { buildDiagnosticPerformanceSummary } from "./microBotDiagnosis.js";
const EXPORT_SCHEMA = "patternlab_microbot_journal_export_v2";
const DEFAULT_ORIGIN_TAB = "microbot_1m";

function toFiniteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveOriginTab(trade = {}) {
  return trade.originTab
    || trade.contextSnapshot?.originTab
    || trade.tradeMeta?.originTab
    || null;
}

function normalizeTradeForExport(trade = {}) {
  const contextSnapshot = toObject(trade.contextSnapshot);
  const tradeMeta = toObject(trade.tradeMeta);
  const diagnostics = toObject(trade.diagnostics || tradeMeta.diagnostics);
  return {
    id: trade.id ?? null,
    originTab: resolveOriginTab(trade),
    source: trade.source ?? null,
    mode: trade.mode ?? "paper",
    symbol: trade.symbol ?? tradeMeta.symbol ?? contextSnapshot.symbol ?? null,
    timeframe: trade.timeframe ?? tradeMeta.timeframe ?? contextSnapshot.timeframe ?? "1m",
    status: trade.status ?? null,
    outcome: trade.outcome ?? null,
    setup: trade.setup ?? null,
    direction: trade.direction ?? null,
    entry: toFiniteNumber(trade.entry, null),
    stopLoss: toFiniteNumber(trade.stopLoss, null),
    takeProfit: toFiniteNumber(trade.takeProfit, null),
    riskReward: toFiniteNumber(trade.riskReward, null),
    createdAt: trade.createdAt ?? null,
    triggeredAt: trade.triggeredAt ?? null,
    resolvedAt: trade.resolvedAt ?? null,
    timeInTradeSec: toFiniteNumber(trade.timeInTradeSec, null),
    candlesInTrade: toFiniteNumber(trade.candlesInTrade, null),
    mfe: toFiniteNumber(trade.mfe, null),
    mae: toFiniteNumber(trade.mae, null),
    notes: trade.notes ?? "",
    operatorAdjusted: Boolean(trade.operatorAdjusted),
    libraryContextSnapshot: toObject(trade.libraryContextSnapshot || contextSnapshot.libraryContextSnapshot),
    decisionSnapshot: toObject(trade.decisionSnapshot || contextSnapshot.decisionSnapshot || tradeMeta.decisionSnapshot),
    learningOutput: toObject(trade.learningOutput || tradeMeta.learningOutput),
    patternName: diagnostics.patternName || trade.patternName || trade.setup || null,
    predictionDirection: diagnostics.predictionDirection || trade.direction || null,
    predictedConfidence: toFiniteNumber(diagnostics.predictedConfidence, toFiniteNumber(trade?.decisionSnapshot?.confidence, null)),
    actualOutcome: diagnostics.actualOutcome || trade.outcome || null,
    entryPrice: toFiniteNumber(diagnostics.entryPrice, toFiniteNumber(trade.entry, null)),
    exitPrice: toFiniteNumber(diagnostics.exitPrice, toFiniteNumber(trade.exitPrice, null)),
    sl: toFiniteNumber(diagnostics.sl, toFiniteNumber(trade.stopLoss, null)),
    tp: toFiniteNumber(diagnostics.tp, toFiniteNumber(trade.takeProfit, null)),
    distanceFromEMA: toFiniteNumber(diagnostics.distanceFromEMA, null),
    distanceFromBase: toFiniteNumber(diagnostics.distanceFromBase, null),
    nearLocalHigh: Boolean(diagnostics.nearLocalHigh),
    nearLocalLow: Boolean(diagnostics.nearLocalLow),
    volumeRatio: toFiniteNumber(diagnostics.volumeRatio, null),
    followthroughScore: toFiniteNumber(diagnostics.followthroughScore, null),
    wickPressure: toFiniteNumber(diagnostics.wickPressure, null),
    bodyQuality: toFiniteNumber(diagnostics.bodyQuality, null),
    contextTags: toArray(diagnostics.contextTags),
    failureReasonCodes: toArray(diagnostics.failureReasonCodes),
    successReasonCodes: toArray(diagnostics.successReasonCodes),
    diagnostics,
    tradeMeta,
    markers: toArray(trade.markers || tradeMeta.markers),
    lifecycleHistory: toArray(trade.lifecycleHistory),
    invalidReasons: toArray(trade.invalidReasons),
    learningExcluded: Boolean(trade.learningExcluded),
  };
}

function normalizeDecisionRecordForExport(row = {}) {
  const decisionSnapshot = toObject(row.decisionSnapshot);
  return {
    timestamp: row.timestamp ?? null,
    symbol: row.symbol ?? null,
    timeframe: row.timeframe ?? "1m",
    action: row.action ?? "no_trade",
    reason: row.reason ?? decisionSnapshot.reason ?? "no_match",
    matchedLibraryItems: toArray(row.matchedLibraryItems || decisionSnapshot.matchedLibraryItems),
    blockingReason: toArray(row.blockingReason || decisionSnapshot.blockingReason),
    warnings: toArray(row.warnings || decisionSnapshot.warnings),
    libraryContextSnapshot: toObject(row.libraryContextSnapshot),
    decisionSnapshot,
  };
}

export function getMicroBotJournalTrades(allTrades = [], options = {}) {
  const originTab = options.originTab || DEFAULT_ORIGIN_TAB;
  const sessionId = options.sessionId || null;
  return (Array.isArray(allTrades) ? allTrades : [])
    .filter((trade) => {
      const sameOrigin = resolveOriginTab(trade) === originTab;
      if (!sameOrigin) return false;
      if (!sessionId) return true;
      const tradeSessionId = trade.sessionId || trade.tradeMeta?.sessionId || trade.contextSnapshot?.sessionId || null;
      return tradeSessionId === sessionId;
    })
    .map((trade) => normalizeTradeForExport(trade));
}

export function computeJournalSessionSummary(trades = []) {
  const rows = Array.isArray(trades) ? trades : [];
  const totalTrades = rows.length;
  const wins = rows.filter((trade) => trade.outcome === "win").length;
  const losses = rows.filter((trade) => trade.outcome === "loss").length;
  const cancelledTrades = rows.filter((trade) => trade.status === "cancelled" || trade.outcome === "cancelled").length;
  const openTrades = rows.filter((trade) => ["planned", "active", "triggered"].includes(String(trade.status || ""))).length;
  const ambiguous = Math.max(0, totalTrades - wins - losses - cancelledTrades - openTrades);

  const rrValues = rows
    .map((trade) => toFiniteNumber(trade.riskReward, null))
    .filter((value) => Number.isFinite(value));
  const avgRR = rrValues.length ? rrValues.reduce((sum, value) => sum + value, 0) / rrValues.length : 0;

  const totalMFE = rows.reduce((sum, trade) => sum + (toFiniteNumber(trade.mfe, 0) || 0), 0);
  const totalMAE = rows.reduce((sum, trade) => sum + (toFiniteNumber(trade.mae, 0) || 0), 0);
  const invalidTrades = rows.reduce((sum, trade) => sum + (toArray(trade.invalidReasons).length ? 1 : 0), 0);
  const instantResolutions = rows.reduce((sum, trade) => sum + (trade.tradeMeta?.instant_resolution ? 1 : 0), 0);

  const closedResolved = wins + losses;
  const winRate = closedResolved ? (wins / closedResolved) * 100 : 0;

  const winRValues = rows
    .filter((trade) => trade.outcome === "win")
    .map((trade) => toFiniteNumber(trade.riskReward, null))
    .filter((value) => Number.isFinite(value));
  const avgWinR = winRValues.length ? winRValues.reduce((sum, value) => sum + value, 0) / winRValues.length : 0;
  const avgLossR = losses > 0 ? 1 : 0;
  const expectancy = closedResolved ? ((wins / closedResolved) * avgWinR) - ((losses / closedResolved) * avgLossR) : 0;

  // netPnl se reporta en unidades R simples para mantener consistencia cuando no existe fill/size exacto.
  const netPnl = rows.reduce((sum, trade) => {
    if (trade.outcome === "win") return sum + (toFiniteNumber(trade.riskReward, 0) || 0);
    if (trade.outcome === "loss") return sum - 1;
    return sum;
  }, 0);

  return {
    totalTrades,
    wins,
    losses,
    ambiguous,
    openTrades,
    cancelledTrades,
    invalidTrades,
    instantResolutions,
    winRate: Number(winRate.toFixed(2)),
    avgRR: Number(avgRR.toFixed(4)),
    totalMFE: Number(totalMFE.toFixed(4)),
    totalMAE: Number(totalMAE.toFixed(4)),
    netPnl: Number(netPnl.toFixed(4)),
    expectancy: Number(expectancy.toFixed(4)),
  };
}

export function buildMicroBotJournalExport(trades = [], options = {}) {
  const normalized = (Array.isArray(trades) ? trades : []).map((trade) => normalizeTradeForExport(trade));
  const decisionLog = (Array.isArray(options.decisionLog) ? options.decisionLog : [])
    .map((row) => normalizeDecisionRecordForExport(row));
  const exportedAt = options.exportedAt || new Date().toISOString();
  const symbol = options.symbol || normalized[0]?.symbol || null;
  const timeframe = options.timeframe || normalized[0]?.timeframe || "1m";
  const mode = options.mode || normalized[0]?.mode || "paper";
  const baseSummary = computeJournalSessionSummary(normalized);
  const diagnosticSummary = buildDiagnosticPerformanceSummary(normalized.filter((trade) => trade.status === "closed"));
  const providedSummary = toObject(options.sessionSummary);
  return {
    schema: EXPORT_SCHEMA,
    exportedAt,
    system: "PatternLab",
    tab: "MicroBot",
    mode,
    symbol,
    timeframe,
    originTab: options.originTab || DEFAULT_ORIGIN_TAB,
    sessionId: options.sessionId || null,
    sessionSummary: {
      ...baseSummary,
      noMatchCount: toFiniteNumber(providedSummary.noMatchCount, 0) || 0,
      contextVetoCount: toFiniteNumber(providedSummary.contextVetoCount, 0) || 0,
      tradeDecisionCount: toFiniteNumber(providedSummary.tradeDecisionCount, 0) || 0,
      executedTradeCount: toFiniteNumber(providedSummary.executedTradeCount, baseSummary.totalTrades) || 0,
    },
    librarySnapshot: {
      patterns: toArray(options.librarySnapshot?.patterns),
      contexts: toArray(options.librarySnapshot?.contexts),
      lessons: toArray(options.librarySnapshot?.lessons),
    },
    diagnosticSummary,
    trades: normalized,
    decisionLog,
  };
}

export function buildMicroBotExportFilename({ symbol = null, timeframe = "1m", now = new Date() } = {}) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const base = symbol ? `patternlab_microbot_${symbol}_${timeframe}` : "patternlab_microbot_journal";
  return `${base}_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.json`;
}

export function downloadJsonFile(filename, data) {
  const payload = JSON.stringify(data, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
