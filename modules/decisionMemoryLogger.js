import { loadDecisionMemories, saveDecisionMemories } from "./storage/storage-adapter.js";
import { diagnoseSkippedDecision } from "./decisionDiagnosticEngine.js";

const MAX_RECORDS = 5000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeDecisionDiagnosis(diagnosis = {}) {
  return {
    verdict: ["good_skip", "bad_skip", "neutral_skip"].includes(diagnosis?.verdict) ? diagnosis.verdict : "neutral_skip",
    primaryCause: String(diagnosis?.primaryCause || "market_was_unclear"),
    secondaryCause: diagnosis?.secondaryCause == null ? null : String(diagnosis.secondaryCause),
    reasonCodes: Array.isArray(diagnosis?.reasonCodes) ? diagnosis.reasonCodes.map((row) => String(row)) : [],
    confidenceInDiagnosis: Number(diagnosis?.confidenceInDiagnosis || 0),
    summaryText: String(diagnosis?.summaryText || ""),
  };
}

function normalizeDecisionMemory(decisionObject = {}) {
  const diagnosis = decisionObject?.diagnosis || diagnoseSkippedDecision(decisionObject);
  return {
    decisionId: String(decisionObject.decisionId || `decision_${Date.now()}`),
    timestamp: decisionObject.timestamp || nowIso(),
    symbol: String(decisionObject.symbol || "UNKNOWN"),
    context20: decisionObject.context20 || null,
    signal: {
      direction: ["LONG", "SHORT"].includes(decisionObject?.signal?.direction) ? decisionObject.signal.direction : "LONG",
      confidence: Number(decisionObject?.signal?.confidence || 0),
    },
    operatorAction: ["veto", "needs_confirmation"].includes(decisionObject.operatorAction) ? decisionObject.operatorAction : "needs_confirmation",
    marketOutcome: {
      moved: ["up", "down", "sideways"].includes(decisionObject?.marketOutcome?.moved) ? decisionObject.marketOutcome.moved : "sideways",
      moveStrength: Number(decisionObject?.marketOutcome?.moveStrength || 0),
    },
    diagnosis: normalizeDecisionDiagnosis(diagnosis),
  };
}

export function createDecisionMemoryLogger({ logger = console } = {}) {
  function logDecisionMemory(decisionObject = {}) {
    const normalized = normalizeDecisionMemory(decisionObject);
    const current = loadDecisionMemories();
    const filtered = current.filter((row) => row.decisionId !== normalized.decisionId);
    const next = [normalized, ...filtered]
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
      .slice(0, MAX_RECORDS);

    saveDecisionMemories(next);
    logger.debug("Decision skipped logged", {
      decisionId: normalized.decisionId,
      symbol: normalized.symbol,
      action: normalized.operatorAction,
    });
    logger.debug("Decision diagnosis generated", { decisionId: normalized.decisionId });
    logger.debug(`Primary cause selected: ${normalized.diagnosis.primaryCause}`);
    logger.debug(`Reason codes: ${normalized.diagnosis.reasonCodes.join(", ")}`);
    return normalized;
  }

  function getDecisionMemories() {
    return loadDecisionMemories();
  }

  return {
    logDecisionMemory,
    getDecisionMemories,
  };
}

export function logDecisionMemory(decisionObject = {}) {
  const logger = createDecisionMemoryLogger();
  return logger.logDecisionMemory(decisionObject);
}
