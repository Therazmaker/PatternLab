import { normalizeDirection } from "./operatorActionTypes.js";

export function createSessionOperatorState() {
  return {
    currentSignal: null,
    currentContext: null,
    operatorSelection: [],
    operatorNote: "",
    recalculatedDecision: null,
    lastOperatorActionId: null,
  };
}

function toContextSnapshot(currentContext = {}) {
  return {
    context20: {
      symbol: currentContext.symbol || "UNKNOWN",
      timeframe: currentContext.timeframe || "5m",
      source: currentContext.source || "session-candle",
      regime: currentContext.regime || "unknown",
      structure: currentContext.structure || {},
      contextSignature: {
        regime: currentContext.regime || "unknown",
        swingStructure: currentContext.structure?.breakState || "stable",
        volatilityBucket: currentContext.volatilityCondition || "normal",
      },
    },
  };
}

export function buildOperatorActionRecord({
  actionId,
  timestamp,
  symbol,
  timeframe,
  currentSignal,
  currentContext,
  operatorAction,
  decisionBefore,
  decisionAfter,
  linkedTradeId = null,
  linkedDecisionId = null,
}) {
  const contextSnapshot = toContextSnapshot(currentContext);
  return {
    actionId,
    timestamp,
    symbol,
    timeframe,
    linkedTradeId,
    linkedDecisionId,
    rawSignal: {
      direction: normalizeDirection(currentSignal?.direction || "NONE", "NONE"),
      bullishScore: Number(currentSignal?.bullishScore || 0),
      bearishScore: Number(currentSignal?.bearishScore || 0),
      confidence: Number(currentSignal?.confidence || 0),
      reasonCodes: Array.isArray(currentSignal?.reasonCodes) ? currentSignal.reasonCodes : [],
    },
    operatorAction,
    ...contextSnapshot,
    immediateEffect: {
      decisionChanged: (decisionBefore?.finalDecision || "WARN") !== (decisionAfter?.finalDecision || "WARN"),
      fromDirection: normalizeDirection(decisionBefore?.finalBias || "NONE", "NONE"),
      toDirection: normalizeDirection(decisionAfter?.finalBias || "NONE", "NONE"),
      fromDecision: decisionBefore?.finalDecision || "WARN",
      toDecision: decisionAfter?.finalDecision || "WARN",
    },
  };
}
