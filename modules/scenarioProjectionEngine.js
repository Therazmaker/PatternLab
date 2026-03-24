import { getScenarioProbabilityAdjustments } from "./scenarioProbabilityUpdater.js";

const SCENARIO_TYPES = [
  "bullish_breakout",
  "failed_breakout_short",
  "trend_continuation_long",
  "trend_continuation_short",
  "chop_no_trade",
  "reversal_from_level",
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildContextSignature(analysis = {}) {
  const bias = analysis.bias || "neutral";
  const structurePos = analysis.overlays?.structureSummary?.entryQuality >= 65
    ? "near_extremes"
    : analysis.overlays?.structureSummary?.entryQuality <= 35
      ? "late_move"
      : "mid_range";
  return [
    bias,
    structurePos,
    analysis.volatilityCondition || "normal",
    analysis.momentumCondition || "flat",
  ].join("_");
}

function scenarioDescriptor(type, analysis = {}) {
  const current = toNumber(analysis.overlays?.currentPrice, 0);
  const support = toNumber(analysis.overlays?.nearestSupport, current * 0.995);
  const resistance = toNumber(analysis.overlays?.nearestResistance, current * 1.005);
  const range = Math.max(Math.abs(resistance - support), Math.abs(current) * 0.0015, 0.0001);
  const isBull = analysis.bias === "bullish";
  const isBear = analysis.bias === "bearish";

  const descriptors = {
    bullish_breakout: {
      name: "Bullish Breakout",
      posture: "aggressive_long",
      trigger: `Break and hold above ${resistance.toFixed(4)}`,
      invalidation: `Back below ${current.toFixed(4)}`,
      expected_quality: clamp(62 + (isBull ? 14 : -8), 30, 90),
      start: resistance,
      targetDirection: 1,
      type,
    },
    failed_breakout_short: {
      name: "Failed Breakout Short",
      posture: "fade_breakout",
      trigger: `Wick above ${resistance.toFixed(4)} and close below ${current.toFixed(4)}`,
      invalidation: `Acceptance above ${resistance.toFixed(4)}`,
      expected_quality: clamp(58 + (analysis.momentumCondition === "fading" ? 16 : -5), 30, 90),
      start: resistance,
      targetDirection: -1,
      type,
    },
    trend_continuation_long: {
      name: "Trend Continuation Long",
      posture: "with_trend_long",
      trigger: `Hold above ${current.toFixed(4)} with pullback support`,
      invalidation: `Break below ${support.toFixed(4)}`,
      expected_quality: clamp(56 + (isBull ? 16 : -8), 30, 90),
      start: current,
      targetDirection: 1,
      type,
    },
    trend_continuation_short: {
      name: "Trend Continuation Short",
      posture: "with_trend_short",
      trigger: `Reject under ${current.toFixed(4)} and extend lower`,
      invalidation: `Recover above ${resistance.toFixed(4)}`,
      expected_quality: clamp(56 + (isBear ? 16 : -8), 30, 90),
      start: current,
      targetDirection: -1,
      type,
    },
    chop_no_trade: {
      name: "Chop / No Trade",
      posture: "flat_wait",
      trigger: `Price oscillates between ${support.toFixed(4)} - ${resistance.toFixed(4)}`,
      invalidation: `Clean breakout with follow-through`,
      expected_quality: clamp(50 + (analysis.volatilityCondition === "compressed" ? 20 : 0), 25, 85),
      start: current,
      targetDirection: 0,
      type,
    },
    reversal_from_level: {
      name: "Reversal From Level",
      posture: "counter_trend",
      trigger: `Strong rejection at ${isBull ? resistance.toFixed(4) : support.toFixed(4)}`,
      invalidation: `No reaction and continuation`,
      expected_quality: clamp(45 + (analysis.momentumCondition === "fading" ? 20 : -4), 25, 80),
      start: current,
      targetDirection: isBull ? -1 : 1,
      type,
    },
  };
  return { ...(descriptors[type] || descriptors.chop_no_trade), support, resistance, range, current };
}

function buildProjectedPath({ startPrice, direction, range, uncertainty = 0.2, steps = 6 }) {
  const points = [];
  let prevMid = startPrice;
  for (let step = 1; step <= steps; step += 1) {
    const travel = range * (0.15 + step * 0.12);
    const drift = direction === 0 ? Math.sin(step) * range * 0.08 : direction * travel;
    const mid = prevMid + drift;
    const spread = range * (uncertainty + step * 0.03);
    points.push({ step, price_mid: Number(mid.toFixed(6)), price_low: Number((mid - spread).toFixed(6)), price_high: Number((mid + spread).toFixed(6)) });
    prevMid = mid;
  }
  return points;
}

function baseScore(type, analysis = {}, brainVerdict = null) {
  const bias = analysis.bias || "neutral";
  const momentum = analysis.momentumCondition || "flat";
  const volatility = analysis.volatilityCondition || "normal";
  const noTradeBoost = (brainVerdict?.posture === "wait" || String(brainVerdict?.entry_quality || "").toLowerCase() === "wait" || brainVerdict?.no_trade_reason) ? 0.8 : 0;
  const map = {
    bullish_breakout: 1.1 + (bias === "bullish" ? 0.55 : -0.35) + (volatility === "compressed" ? 0.15 : 0),
    failed_breakout_short: 1 + (momentum === "fading" ? 0.5 : 0) + (bias === "bullish" ? 0.25 : 0),
    trend_continuation_long: 1 + (bias === "bullish" ? 0.65 : -0.4) + (momentum === "rising" ? 0.25 : -0.1),
    trend_continuation_short: 1 + (bias === "bearish" ? 0.65 : -0.4) + (momentum === "fading" && bias === "bearish" ? 0.2 : 0),
    chop_no_trade: 0.8 + (volatility === "compressed" ? 0.5 : 0) + noTradeBoost,
    reversal_from_level: 0.9 + (momentum === "fading" ? 0.35 : 0),
  };
  return clamp(map[type] || 0.5, 0.05, 3.5);
}

function normalizeProbabilities(rows = []) {
  const total = rows.reduce((acc, row) => acc + row.score, 0) || 1;
  const probs = rows.map((row) => ({ ...row, probability: (row.score / total) * 100 }));
  const rounded = probs.map((row) => ({ ...row, probability: Number(row.probability.toFixed(2)) }));
  const drift = 100 - rounded.reduce((acc, row) => acc + row.probability, 0);
  if (rounded.length) rounded[0].probability = Number((rounded[0].probability + drift).toFixed(2));
  return rounded;
}

export function generateScenarioProjections({ analysis = {}, brainVerdict = null, learnedRules = [], learnedContexts = [], contextMemory = {}, frictionScore = 0, humanOverrideMemory = null, executionPosture = "unknown", operatorOverrideMemory = null } = {}) {
  const contextSignature = buildContextSignature(analysis);
  const contextState = contextMemory?.[contextSignature] || null;
  const isBlockedContext = Number(contextState?.blocked_for_candles || 0) > 0 || String(brainVerdict?.no_trade_reason || "") === "repeated_loss_context";
  const probabilityAdjustments = getScenarioProbabilityAdjustments(contextSignature);
  const candidateRows = SCENARIO_TYPES.map((type) => {
    const descriptor = scenarioDescriptor(type, analysis);
    const learnedShift = probabilityAdjustments.byType?.[type]?.shift || 0;
    const overridePenalty = (humanOverrideMemory?.[type] === "rejected_recently" || operatorOverrideMemory?.[type] === "rejected_recently") ? -0.1 : 0;
    const blockPenalty = isBlockedContext ? (type === "chop_no_trade" ? 2.4 : -1.8) : 0;
    const score = clamp(baseScore(type, analysis, brainVerdict) + learnedShift + overridePenalty + blockPenalty - toNumber(frictionScore, 0) * 0.08, 0.05, 5);
    return {
      type,
      score,
      descriptor,
      sampleSize: probabilityAdjustments.byType?.[type]?.sampleSize || 0,
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const normalized = normalizeProbabilities(candidateRows);
  const scenarios = normalized.map((row, index) => {
    const now = new Date().toISOString();
    const uncertainty = clamp((100 - row.descriptor.expected_quality) / 160 + (index * 0.04), 0.08, 0.48);
    const projectedPath = buildProjectedPath({
      startPrice: row.descriptor.start,
      direction: row.descriptor.targetDirection,
      range: row.descriptor.range,
      uncertainty,
      steps: 6,
    });
    return {
      id: `scenario_${row.type}_${Date.now()}_${index + 1}`,
      name: row.descriptor.name,
      type: row.type,
      probability: row.probability,
      posture: row.descriptor.posture,
      trigger: row.descriptor.trigger,
      invalidation: row.descriptor.invalidation,
      expected_quality: row.descriptor.expected_quality,
      brain_posture: brainVerdict?.posture || "wait",
      brain_bias: brainVerdict?.bias || analysis.bias || "neutral",
      brain_entry_quality: brainVerdict?.entry_quality || "wait",
      brain_no_trade_reason: brainVerdict?.no_trade_reason || null,
      reasoning_summary: `Bias ${analysis.bias || "neutral"}, momentum ${analysis.momentumCondition || "flat"}, volatility ${analysis.volatilityCondition || "normal"}. Learned matches: ${row.sampleSize}.`,
      projected_path: projectedPath,
      context_signature: contextSignature,
      created_at: now,
      status: "pending",
      uncertainty,
      start_price: row.descriptor.start,
      trigger_price: row.descriptor.targetDirection >= 0 ? row.descriptor.resistance : row.descriptor.support,
      invalidation_price: row.descriptor.targetDirection >= 0 ? row.descriptor.support : row.descriptor.resistance,
      target_direction: row.descriptor.targetDirection,
      block_context: isBlockedContext && row.type !== "chop_no_trade",
      blocked_reason: isBlockedContext ? "repeated_loss_context" : null,
    };
  });

  const primary = scenarios[0] || null;
  console.debug(`[Scenario] Generated ${scenarios.length} scenarios for context ${contextSignature}`);
  if (primary) console.debug(`[Scenario] Primary scenario: ${primary.type} ${primary.probability.toFixed(2)}%`);

  return {
    created_at: new Date().toISOString(),
    context_signature: contextSignature,
    scenarios,
    primary_scenario_id: primary?.id || null,
    no_trade_probability: scenarios.find((row) => row.type === "chop_no_trade")?.probability || 0,
    matched_similar_contexts: probabilityAdjustments.matchedContexts || learnedContexts.length || 0,
    learned_rules_count: Array.isArray(learnedRules) ? learnedRules.length : 0,
    active_rules: Array.isArray(learnedRules) ? learnedRules : [],
    execution_posture: executionPosture,
  };
}
