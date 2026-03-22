import { loadDecisionMemories, saveDecisionMemories } from "./storage/storage-adapter.js";

const MAX_RECORDS = 5000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeDecisionMemory(decisionObject = {}) {
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
