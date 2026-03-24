import { buildBrainVerdict } from "./unifiedDecisionCore.js";
import { generateScenarioProjections } from "./scenarioProjectionEngine.js";
import { getExecutionPacket } from "./executionAuthority.js";

function toContextSignature({ analysis = {}, symbol = "", timeframe = "" } = {}) {
  const regime = analysis?.pseudoMl?.regime?.regime || "unknown";
  const bias = analysis?.pseudoMl?.probability?.bias || analysis?.bias || "neutral";
  const momentum = analysis?.momentumCondition || "flat";
  return [symbol || "UNK", timeframe || "5m", regime, bias, momentum].join("|");
}

export function runSessionBrainOrchestrator({
  session = null,
  marketView = null,
  analysis = null,
  modeState = {},
  operatorState = {},
  copilotFeedback = null,
  copilotEvaluation = null,
  learnedContexts = [],
  humanOverrideMemory = null,
  executionControlState = null,
} = {}) {
  const contextPacket = {
    sessionId: session?.id || null,
    symbol: marketView?.symbol || session?.asset || null,
    timeframe: marketView?.timeframe || session?.tf || null,
    source: marketView?.source || null,
    marketConnected: Boolean(marketView?.connected),
    candleCount: Array.isArray(marketView?.candles) ? marketView.candles.length : 0,
    analysis,
    context_signature: toContextSignature({ analysis, symbol: marketView?.symbol || session?.asset, timeframe: marketView?.timeframe || session?.tf }),
  };

  const brainPacket = buildBrainVerdict({
    analysis,
    marketView,
    copilotFeedback,
    copilotEvaluation,
    modeState,
    operatorState,
  });

  const scenarioPacket = generateScenarioProjections({
    analysis,
    brainVerdict: brainPacket,
    learnedRules: brainPacket?.active_rules || [],
    learnedContexts,
    frictionScore: brainPacket?.friction || 0,
    humanOverrideMemory,
    executionPosture: brainPacket?.posture || "wait",
  });

  const executionPacket = getExecutionPacket(executionControlState || {});
  const uiPacket = {
    headline: `${contextPacket.symbol || "UNKNOWN"} ${contextPacket.timeframe || "5m"}`,
    posture: brainPacket?.posture || "wait",
    confidence: brainPacket?.confidence || 0,
    entry_quality: brainPacket?.entry_quality || "WAIT",
    no_trade_reason: brainPacket?.no_trade_reason || null,
    authority: executionPacket.authority,
    primaryScenario: scenarioPacket?.scenarios?.[0] || null,
  };

  console.info("[Orchestrator] context -> verdict -> scenarios -> authority packet assembled");

  return {
    contextPacket,
    brainPacket,
    scenarioPacket,
    executionPacket,
    uiPacket,
  };
}
