import { loadTradeMemories, saveTradeMemories } from "./storage/storage-adapter.js";

const MAX_RECORDS = 5000;

function nowIso() {
  return new Date().toISOString();
}

function sortByTimestampDesc(rows = []) {
  return [...rows].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
}

function normalizeTradeDiagnosis(diagnosis = {}) {
  const scores = diagnosis?.diagnosticScores || {};
  return {
    primaryCause: String(diagnosis?.primaryCause || ""),
    secondaryCause: diagnosis?.secondaryCause == null ? null : String(diagnosis.secondaryCause),
    reasonCodes: Array.isArray(diagnosis?.reasonCodes) ? diagnosis.reasonCodes.map((row) => String(row)) : [],
    diagnosticScores: {
      trendAlignmentScore: Number(scores?.trendAlignmentScore || 0),
      structureScore: Number(scores?.structureScore || 0),
      momentumScore: Number(scores?.momentumScore || 0),
      timingScore: Number(scores?.timingScore || 0),
      followThroughScore: Number(scores?.followThroughScore || 0),
      operatorContextScore: Number(scores?.operatorContextScore || 0),
    },
    confidenceInDiagnosis: Number(diagnosis?.confidenceInDiagnosis || 0),
    summaryText: String(diagnosis?.summaryText || ""),
  };
}

function normalizeTradeMemory(tradeObject = {}) {
  return {
    tradeId: String(tradeObject.tradeId || `trade_${Date.now()}`),
    timestamp: tradeObject.timestamp || nowIso(),
    symbol: String(tradeObject.symbol || "UNKNOWN"),
    timeframe: "5m",
    preTradeContext: {
      context20: tradeObject?.preTradeContext?.context20 || null,
    },
    signal: {
      direction: ["LONG", "SHORT", "NONE"].includes(tradeObject?.signal?.direction) ? tradeObject.signal.direction : "NONE",
      bullishScore: Number(tradeObject?.signal?.bullishScore || 0),
      bearishScore: Number(tradeObject?.signal?.bearishScore || 0),
      confidence: Number(tradeObject?.signal?.confidence || 0),
      reasonCodes: Array.isArray(tradeObject?.signal?.reasonCodes) ? tradeObject.signal.reasonCodes.map((row) => String(row)) : [],
      policyVersion: String(tradeObject?.signal?.policyVersion || "v1"),
    },
    operator: {
      action: ["approve", "veto", "none"].includes(tradeObject?.operator?.action) ? tradeObject.operator.action : "none",
      note: tradeObject?.operator?.note == null ? null : String(tradeObject.operator.note),
    },
    execution: {
      entryPrice: Number.isFinite(Number(tradeObject?.execution?.entryPrice)) ? Number(tradeObject.execution.entryPrice) : null,
      stopLoss: Number.isFinite(Number(tradeObject?.execution?.stopLoss)) ? Number(tradeObject.execution.stopLoss) : null,
      takeProfit: Number.isFinite(Number(tradeObject?.execution?.takeProfit)) ? Number(tradeObject.execution.takeProfit) : null,
      positionSize: Number.isFinite(Number(tradeObject?.execution?.positionSize)) ? Number(tradeObject.execution.positionSize) : null,
    },
    outcome: {
      result: ["win", "loss", "breakeven", "open"].includes(tradeObject?.outcome?.result) ? tradeObject.outcome.result : "open",
      pnl: Number(tradeObject?.outcome?.pnl || 0),
      pnlR: Number(tradeObject?.outcome?.pnlR || 0),
      barsHeld: Number(tradeObject?.outcome?.barsHeld || 0),
      mfe: Number(tradeObject?.outcome?.mfe || 0),
      mae: Number(tradeObject?.outcome?.mae || 0),
    },
    diagnosis: normalizeTradeDiagnosis(tradeObject?.diagnosis || {}),
  };
}

export function createTradeMemoryLogger({ logger = console } = {}) {
  function logTradeMemory(tradeObject = {}) {
    const normalized = normalizeTradeMemory(tradeObject);
    const current = loadTradeMemories();
    const filtered = current.filter((row) => row.tradeId !== normalized.tradeId);
    const next = sortByTimestampDesc([normalized, ...filtered]).slice(0, MAX_RECORDS);
    saveTradeMemories(next);
    logger.debug("Trade closed", {
      tradeId: normalized.tradeId,
      symbol: normalized.symbol,
      result: normalized.outcome.result,
      pnl: normalized.outcome.pnl,
      pnlR: normalized.outcome.pnlR,
    });
    logger.debug("Trade diagnosis generated", { tradeId: normalized.tradeId });
    logger.debug(`Primary cause selected: ${normalized.diagnosis.primaryCause}`);
    logger.debug(`Reason codes: ${normalized.diagnosis.reasonCodes.join(", ")}`);
    return normalized;
  }

  function getTradeMemories() {
    return loadTradeMemories();
  }

  function queryTradeMemories(predicate = null) {
    const rows = loadTradeMemories();
    if (typeof predicate !== "function") return rows;
    return rows.filter(predicate);
  }

  return {
    logTradeMemory,
    getTradeMemories,
    queryTradeMemories,
  };
}

export function logTradeMemory(tradeObject = {}) {
  const logger = createTradeMemoryLogger();
  return logger.logTradeMemory(tradeObject);
}
