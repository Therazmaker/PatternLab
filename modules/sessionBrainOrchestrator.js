import { buildBrainVerdict } from "./unifiedDecisionCore.js";
import { generateScenarioProjections } from "./scenarioProjectionEngine.js";
import { getExecutionPacket } from "./executionAuthority.js";

export function buildSessionContextSignature({ analysis = {}, symbol = "", timeframe = "" } = {}) {
  const regime = analysis?.pseudoMl?.regime?.regime || "unknown";
  const bias = analysis?.pseudoMl?.probability?.bias || analysis?.bias || "neutral";
  const momentum = analysis?.momentumCondition || "flat";
  return [symbol || "UNK", timeframe || "5m", regime, bias, momentum].join("|");
}

function toRuleRow(update = {}) {
  const id = update?.rule_id || update?.id || null;
  if (!id) return null;
  const isActive = update?.action === "activate" || update?.active === true;
  return {
    id,
    text: update?.reason || id,
    active: isActive,
    weight: Number.isFinite(Number(update?.weight)) ? Number(update.weight) : 1,
    source: "assist_reinforcement",
  };
}

function mergeReinforcementOverlay({ brainPacket = {}, scenarioPacket = {}, executionPacket = {}, overlay = null } = {}) {
  if (!overlay || typeof overlay !== "object") {
    return { brainPacket, scenarioPacket, executionPacket };
  }
  const nextBrain = { ...(brainPacket || {}) };
  const nextScenario = {
    ...(scenarioPacket || {}),
    scenarios: Array.isArray(scenarioPacket?.scenarios) ? scenarioPacket.scenarios.map((row) => ({ ...row })) : [],
  };
  const nextExecution = { ...(executionPacket || {}) };
  const verdictPatch = overlay?.verdict_patch || {};
  const learningPatch = overlay?.learning_patch || {};
  const scenarioUpdates = Array.isArray(overlay?.scenario_updates) ? overlay.scenario_updates : [];
  const nextCandlePatch = overlay?.next_candle_patch || {};
  const ruleUpdates = Array.isArray(overlay?.rule_updates) ? overlay.rule_updates : [];

  ["bias", "confidence", "entry_quality", "posture", "learned_bias", "active_rules", "danger_score", "familiarity"].forEach((key) => {
    if (verdictPatch[key] !== undefined) nextBrain[key] = verdictPatch[key];
  });
  if (learningPatch?.learned_bias !== undefined) nextBrain.learned_bias = learningPatch.learned_bias;
  if (learningPatch?.danger_score !== undefined) nextBrain.danger_score = learningPatch.danger_score;
  if (learningPatch?.familiarity !== undefined) nextBrain.familiarity = learningPatch.familiarity;
  if (Array.isArray(learningPatch?.lesson_tags) && learningPatch.lesson_tags.length) {
    const existingTags = Array.isArray(nextBrain.lesson_tags) ? nextBrain.lesson_tags : [];
    nextBrain.lesson_tags = Array.from(new Set([...existingTags, ...learningPatch.lesson_tags]));
  }
  if (Object.keys(nextCandlePatch).length) {
    nextBrain.next_candle_plan = {
      ...(nextBrain?.next_candle_plan || {}),
      ...nextCandlePatch,
    };
  }
  if (ruleUpdates.length) {
    const currentRules = Array.isArray(nextBrain.active_rules) ? nextBrain.active_rules : [];
    const byId = new Map(currentRules.map((row) => [row?.id, { ...row }]));
    ruleUpdates.map(toRuleRow).filter(Boolean).forEach((row) => {
      if (row.active) byId.set(row.id, { ...byId.get(row.id), ...row });
      if (!row.active && byId.has(row.id)) byId.delete(row.id);
    });
    nextBrain.active_rules = Array.from(byId.values());
  }
  if (nextScenario.scenarios.length && scenarioUpdates.length) {
    nextScenario.scenarios = nextScenario.scenarios.map((scenario) => {
      const update = scenarioUpdates.find((row) => row?.scenario_id === scenario.id || row?.scenario_name === scenario.name || row?.scenario_name === scenario.type);
      if (!update) return scenario;
      const next = { ...scenario };
      if (Number.isFinite(Number(update?.probability))) {
        next.probability = Number(update.probability);
        next.confidence = Number(update.probability);
      }
      if (update?.reason) next.assist_reason = update.reason;
      return next;
    });
  }
  if (nextScenario.scenarios?.length) {
    nextScenario.primary_scenario_id = nextScenario.scenarios[0]?.id || nextScenario.primary_scenario_id;
  }
  if (nextBrain?.next_candle_plan?.posture) {
    nextExecution.execution_posture = nextBrain.next_candle_plan.posture;
  }
  console.info("[Assist] Reinforcement overlay merged into orchestrator packet");
  return { brainPacket: nextBrain, scenarioPacket: nextScenario, executionPacket: nextExecution };
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
  contextMemory = {},
  reinforcementOverlay = null,
} = {}) {
  const contextSignature = buildSessionContextSignature({ analysis, symbol: marketView?.symbol || session?.asset, timeframe: marketView?.timeframe || session?.tf });
  const contextPacket = {
    sessionId: session?.id || null,
    symbol: marketView?.symbol || session?.asset || null,
    timeframe: marketView?.timeframe || session?.tf || null,
    source: marketView?.source || null,
    marketConnected: Boolean(marketView?.connected),
    candleCount: Array.isArray(marketView?.candles) ? marketView.candles.length : 0,
    analysis,
    context_signature: contextSignature,
  };

  const contextMemoryRow = contextMemory?.[contextPacket.context_signature] || null;
  const brainPacket = buildBrainVerdict({
    analysis,
    marketView,
    copilotFeedback,
    copilotEvaluation,
    modeState,
    operatorState,
    contextMemoryRow,
  });

  const scenarioPacket = generateScenarioProjections({
    analysis,
    brainVerdict: brainPacket,
    learnedRules: brainPacket?.active_rules || [],
    learnedContexts,
    contextMemory,
    frictionScore: brainPacket?.friction || 0,
    humanOverrideMemory,
    executionPosture: brainPacket?.posture || "wait",
  });

  const executionPacket = getExecutionPacket(executionControlState || {});
  const merged = mergeReinforcementOverlay({
    brainPacket,
    scenarioPacket,
    executionPacket,
    overlay: reinforcementOverlay,
  });
  const uiPacket = {
    headline: `${contextPacket.symbol || "UNKNOWN"} ${contextPacket.timeframe || "5m"}`,
    posture: merged.brainPacket?.posture || "wait",
    confidence: merged.brainPacket?.confidence || 0,
    entry_quality: merged.brainPacket?.entry_quality || "wait",
    no_trade_reason: merged.brainPacket?.no_trade_reason || null,
    authority: merged.executionPacket.authority,
    primaryScenario: merged.scenarioPacket?.scenarios?.[0] || null,
  };

  console.info("[Orchestrator] context -> verdict -> scenarios -> authority packet assembled");

  return {
    contextPacket,
    brainPacket: merged.brainPacket,
    scenarioPacket: merged.scenarioPacket,
    executionPacket: merged.executionPacket,
    uiPacket,
  };
}
