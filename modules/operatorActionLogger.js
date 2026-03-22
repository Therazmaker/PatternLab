import { loadOperatorActions, saveOperatorActions } from "./storage/storage-adapter.js";
import {
  normalizeDecisionState,
  normalizeDirection,
  normalizeOperatorActionType,
} from "./operatorActionTypes.js";
import { buildContextSignature } from "./contextSignatureBuilder.js";

const MAX_OPERATOR_ACTIONS = 8000;

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeActionRecord(actionRecord = {}) {
  return {
    actionId: String(actionRecord.actionId || `op_action_${Date.now()}`),
    timestamp: actionRecord.timestamp || nowIso(),
    symbol: String(actionRecord.symbol || "UNKNOWN"),
    timeframe: actionRecord.timeframe === "5m" ? "5m" : "5m",
    linkedTradeId: actionRecord.linkedTradeId ? String(actionRecord.linkedTradeId) : null,
    linkedDecisionId: actionRecord.linkedDecisionId ? String(actionRecord.linkedDecisionId) : null,
    rawSignal: {
      direction: normalizeDirection(actionRecord?.rawSignal?.direction, "NONE"),
      bullishScore: toNumber(actionRecord?.rawSignal?.bullishScore, 0),
      bearishScore: toNumber(actionRecord?.rawSignal?.bearishScore, 0),
      confidence: toNumber(actionRecord?.rawSignal?.confidence, 0),
      reasonCodes: Array.isArray(actionRecord?.rawSignal?.reasonCodes) ? actionRecord.rawSignal.reasonCodes.map((row) => String(row)) : [],
    },
    operatorAction: {
      type: normalizeOperatorActionType(actionRecord?.operatorAction?.type, "none"),
      note: actionRecord?.operatorAction?.note == null ? null : String(actionRecord.operatorAction.note),
    },
    context20: {
      ...(actionRecord?.context20 || {}),
      contextSignature: buildContextSignature(actionRecord?.context20?.contextSignature || actionRecord?.context20 || {}),
    },
    immediateEffect: {
      decisionChanged: Boolean(actionRecord?.immediateEffect?.decisionChanged),
      fromDirection: normalizeDirection(actionRecord?.immediateEffect?.fromDirection, "NONE"),
      toDirection: normalizeDirection(actionRecord?.immediateEffect?.toDirection, "NONE"),
      fromDecision: normalizeDecisionState(actionRecord?.immediateEffect?.fromDecision, "WARN"),
      toDecision: normalizeDecisionState(actionRecord?.immediateEffect?.toDecision, "WARN"),
    },
    laterEvaluation: {
      evaluated: Boolean(actionRecord?.laterEvaluation?.evaluated),
      verdict: actionRecord?.laterEvaluation?.verdict ?? null,
      correctnessScore: actionRecord?.laterEvaluation?.correctnessScore ?? null,
      marketOutcome: actionRecord?.laterEvaluation?.marketOutcome ?? null,
      impactType: actionRecord?.laterEvaluation?.impactType ?? null,
      summaryText: actionRecord?.laterEvaluation?.summaryText ?? null,
    },
  };
}

export function createOperatorActionLogger({ logger = console } = {}) {
  function logOperatorAction(actionRecord = {}) {
    const normalized = normalizeActionRecord(actionRecord);
    const current = loadOperatorActions();
    const filtered = current.filter((row) => row.actionId !== normalized.actionId);
    const next = [normalized, ...filtered]
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
      .slice(0, MAX_OPERATOR_ACTIONS);

    saveOperatorActions(next);
    logger.debug("Operator action logged", {
      actionId: normalized.actionId,
      actionType: normalized.operatorAction.type,
      symbol: normalized.symbol,
      decisionChanged: normalized.immediateEffect.decisionChanged,
    });
    return normalized;
  }

  function queryOperatorActions(filters = {}) {
    const rows = loadOperatorActions();
    return rows.filter((row) => {
      if (filters.actionType && row?.operatorAction?.type !== normalizeOperatorActionType(filters.actionType, "none")) return false;
      if (filters.symbol && row.symbol !== String(filters.symbol)) return false;
      if (filters.direction && row?.rawSignal?.direction !== normalizeDirection(filters.direction, "NONE")) return false;
      if (filters.outcome && row?.laterEvaluation?.impactType !== String(filters.outcome)) return false;
      return true;
    });
  }

  function updateActionEvaluation(actionId, evaluation = {}) {
    const current = loadOperatorActions();
    const idx = current.findIndex((row) => row.actionId === actionId);
    if (idx < 0) return null;
    const nextRow = {
      ...current[idx],
      laterEvaluation: {
        ...(current[idx].laterEvaluation || {}),
        ...evaluation,
        evaluated: true,
      },
    };
    const next = [...current];
    next[idx] = nextRow;
    saveOperatorActions(next);
    return nextRow;
  }

  return {
    logOperatorAction,
    queryOperatorActions,
    updateActionEvaluation,
  };
}

export function logOperatorAction(actionRecord = {}) {
  return createOperatorActionLogger().logOperatorAction(actionRecord);
}
