import { buildFuturesExecutionPlan, getDefaultFuturesRiskConfig } from "./futuresRisk.js";
import { evaluateStructureFilter } from "./structureFilter.js";

export const FUTURES_POLICY_VERSION = "phase1-shadow-v1";

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRisk(value = "low") {
  const raw = String(value || "").toLowerCase();
  if (raw === "high") return 1;
  if (raw === "medium") return 0.55;
  return 0.15;
}

function scoreActions(state = {}, config = {}) {
  const bias = Number(state.directionBias || 0);
  const contextQ = Number(state.contextScore || 0) / 100;
  const radarQ = Number(state.radarScore || 0) / 100;
  const robustQ = Number(state.robustness?.robustnessScore || 0) / 100;
  const seededSupport = (state.seededMatches || []).reduce((acc, row) => acc + (row.overlapScore * row.winRate), 0);
  const conflictPenalty = (state.conflictFlags || []).length * 0.12;
  const overfitPenalty = normalizeRisk(state.robustness?.overfitRisk) * 0.22;

  let long = 0.25 + Math.max(0, bias) * 0.45 + contextQ * 0.2 + radarQ * 0.15 + seededSupport * 0.2 + (state.trend?.structure === "up" ? 0.12 : -0.05);
  let short = 0.25 + Math.max(0, -bias) * 0.45 + contextQ * 0.2 + radarQ * 0.15 + seededSupport * 0.2 + (state.trend?.structure === "down" ? 0.12 : -0.05);
  let noTrade = 0.2 + (1 - Math.abs(bias)) * 0.25 + (1 - robustQ) * 0.2 + conflictPenalty + overfitPenalty;

  if (config.noTradeOnConflict && (state.conflictFlags || []).length) noTrade += 0.2;
  if ((state.neuronCount || 0) < 2) noTrade += 0.15;
  if (contextQ < 0.45) noTrade += 0.12;

  long -= conflictPenalty + overfitPenalty;
  short -= conflictPenalty + overfitPenalty;

  return { noTrade, long, short };
}

export function evaluateFuturesPolicy(input = {}, overrides = {}) {
  const state = input.state || {};
  const config = getDefaultFuturesRiskConfig({ ...(input.config || {}), ...(overrides || {}) });
  const actionScores = scoreActions(state, config);
  const scored = [
    { action: "NO_TRADE", score: actionScores.noTrade },
    { action: "LONG", score: actionScores.long },
    { action: "SHORT", score: actionScores.short },
  ].sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const runnerUp = scored[1];
  const confidence = clamp((winner.score - runnerUp.score) / (Math.abs(winner.score) + 1), 0, 1);

  let action = winner.action;
  const previewExecutionPlan = action === "NO_TRADE"
    ? null
    : buildFuturesExecutionPlan(action, state, {
      candles: input.candles || [],
      candleIndex: state.candleIndex,
      entryPrice: state.priceRef,
    }, config);

  const structure = evaluateStructureFilter({
    candles: input.candles || [],
    candleIndex: state.candleIndex,
    action,
    entryPrice: previewExecutionPlan?.entryPrice ?? state.priceRef,
    targetPrice: previewExecutionPlan?.takeProfit ?? null,
  });

  let adjustedConfidence = confidence;
  if (action !== "NO_TRADE") {
    adjustedConfidence = clamp(confidence + (structure.scoreAdjustment / 200), 0, 1);
    if (structure.decision === "block") action = "NO_TRADE";
  }

  const evidence = {
    alignedNeurons: (state.activeNeuronIds || []).filter((id) => {
      const key = String(id || "").toLowerCase();
      if (action === "LONG") return ["bull", "higher_high", "push_up", "support"].some((token) => key.includes(token));
      if (action === "SHORT") return ["bear", "lower_low", "push_down", "resistance"].some((token) => key.includes(token));
      return false;
    }),
    conflictingNeurons: (state.activeNeuronIds || []).filter((id) => {
      const key = String(id || "").toLowerCase();
      if (action === "LONG") return ["bear", "lower_low", "push_down"].some((token) => key.includes(token));
      if (action === "SHORT") return ["bull", "higher_high", "push_up"].some((token) => key.includes(token));
      return true;
    }),
    supportingPatterns: (state.seededMatches || []).map((row) => row.patternId),
    regimeFlags: [state.marketRegime || "unclear", `trend:${state.trend?.structure || "flat"}`],
    warningFlags: [...(state.conflictFlags || []), ...(structure.reasons || [])],
    robustnessFlags: [
      `robustness:${state.robustness?.robustnessScore ?? "n/a"}`,
      `overfit:${state.robustness?.overfitRisk || "low"}`,
    ],
    supportingStats: {
      contextScore: state.contextScore,
      radarScore: state.radarScore,
      freshnessScore: state.freshnessScore,
      neuronCount: state.neuronCount,
      directionBias: state.directionBias,
      structureDecision: structure.decision,
      structureBias: structure.features?.structureBias,
      structureBreakState: structure.features?.structureBreakState,
      entryLocationScore: structure.features?.entryLocationScore,
      spaceToTargetScore: structure.features?.spaceToTargetScore,
      invalidationRiskScore: structure.features?.invalidationRiskScore,
    },
    structure,
  };

  const executionPlan = action === "NO_TRADE"
    ? {
      entryType: "market",
      entryPrice: null,
      entryZone: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      leverageCap: null,
      sizingMode: "disabled",
      riskPct: null,
    }
    : buildFuturesExecutionPlan(action, state, {
      candles: input.candles || [],
      candleIndex: state.candleIndex,
      entryPrice: state.priceRef,
    }, config);

  const reason = action === "NO_TRADE"
    ? (structure.decision === "block"
      ? `No trade: structure blocked setup (${(structure.reasons || []).slice(0, 2).join(" ")}).`
      : `No trade: evidence weak/conflicted (${(state.conflictFlags || []).length} conflict flags).`)
    : `${action} chosen from bias ${Number(state.directionBias || 0).toFixed(2)}, context ${state.contextScore}, robustness ${state.robustness?.robustnessScore ?? "n/a"}${structure.decision !== "allow" ? ` · structure ${structure.decision}` : ""}.`;

  return {
    action,
    confidence: adjustedConfidence,
    actionScores,
    executionPlan,
    reason,
    evidence,
    policyVersion: FUTURES_POLICY_VERSION,
  };
}
