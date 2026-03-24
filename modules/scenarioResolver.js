import { saveScenarioResolution } from "./scenarioMemoryStore.js";
import { updateScenarioContextStats } from "./scenarioProbabilityUpdater.js";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function evaluateScenario(scenario, futureCandles = []) {
  const direction = Number(scenario.target_direction || 0);
  const triggerPrice = toNumber(scenario.trigger_price, null);
  const invalidationPrice = toNumber(scenario.invalidation_price, null);
  if (!futureCandles.length) return { finalStatus: "unresolved", candlesElapsed: 0, matchedTrigger: false, matchedInvalidation: false, moveExtent: 0, outcomeQuality: 0 };

  let matchedTrigger = false;
  let matchedInvalidation = false;
  let finalStatus = "unresolved";
  let candlesElapsed = futureCandles.length;
  let moveExtent = 0;

  for (let i = 0; i < futureCandles.length; i += 1) {
    const candle = futureCandles[i] || {};
    const high = toNumber(candle.high, null);
    const low = toNumber(candle.low, null);
    const close = toNumber(candle.close, null);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;

    if (direction >= 0 && Number.isFinite(triggerPrice) && high >= triggerPrice) matchedTrigger = true;
    if (direction < 0 && Number.isFinite(triggerPrice) && low <= triggerPrice) matchedTrigger = true;

    if (direction >= 0 && Number.isFinite(invalidationPrice) && low <= invalidationPrice) {
      matchedInvalidation = true;
      finalStatus = "invalidated";
      candlesElapsed = i + 1;
      break;
    }
    if (direction < 0 && Number.isFinite(invalidationPrice) && high >= invalidationPrice) {
      matchedInvalidation = true;
      finalStatus = "invalidated";
      candlesElapsed = i + 1;
      break;
    }

    if (scenario.type === "chop_no_trade") {
      const band = Math.abs((triggerPrice || close) - (invalidationPrice || close));
      if (band > 0 && Math.abs(close - scenario.start_price) <= band * 0.65 && i >= 2) {
        finalStatus = "fulfilled";
        candlesElapsed = i + 1;
      }
    } else if (matchedTrigger && i >= 1) {
      finalStatus = "fulfilled";
      candlesElapsed = i + 1;
      break;
    }

    moveExtent = Math.max(moveExtent, Math.abs(close - toNumber(scenario.start_price, close)));
  }

  const outcomeQuality = finalStatus === "fulfilled" ? 1 : finalStatus === "invalidated" ? -1 : 0;
  return {
    finalStatus,
    candlesElapsed,
    matchedTrigger,
    matchedInvalidation,
    moveExtent: Number(moveExtent.toFixed(6)),
    outcomeQuality,
  };
}

export function resolveScenarioSet({ scenarioSet = null, candles = [], analysis = null, humanSelection = {} } = {}) {
  if (!scenarioSet?.scenarios?.length || !candles.length) return { updatedSet: scenarioSet, resolved: false, winner: null, resolvedRows: [] };
  const createdAt = Number(new Date(scenarioSet.created_at || Date.now()));
  const baseIndex = candles.findIndex((row) => Number(new Date(row.timestamp || 0)) >= createdAt);
  const entryIndex = baseIndex >= 0 ? baseIndex : Math.max(0, candles.length - 1);
  const futureCandles = candles.slice(entryIndex + 1, entryIndex + 1 + 8);
  if (!futureCandles.length) return { updatedSet: scenarioSet, resolved: false, winner: null, resolvedRows: [] };

  const evaluated = scenarioSet.scenarios.map((scenario) => {
    const resolution = evaluateScenario(scenario, futureCandles);
    return {
      ...scenario,
      status: resolution.finalStatus,
      resolution_candles: resolution.candlesElapsed,
      matched_trigger: resolution.matchedTrigger,
      matched_invalidation: resolution.matchedInvalidation,
      move_extent: resolution.moveExtent,
      outcome_quality: resolution.outcomeQuality,
    };
  });

  const fulfilled = evaluated.filter((row) => row.status === "fulfilled").sort((a, b) => b.probability - a.probability);
  const invalidated = evaluated.filter((row) => row.status === "invalidated");
  const unresolved = evaluated.filter((row) => row.status === "unresolved");
  const winner = fulfilled[0] || null;
  const shouldResolveSet = Boolean(winner || invalidated.length === evaluated.length || futureCandles.length >= 8);
  if (!shouldResolveSet) {
    return {
      updatedSet: { ...scenarioSet, scenarios: evaluated, resolved: false },
      resolved: false,
      winner: null,
      resolvedRows: [],
    };
  }

  const resolvedAt = new Date().toISOString();
  evaluated.forEach((scenario) => {
    saveScenarioResolution({
      scenario_id: scenario.id,
      created_at: scenario.created_at,
      resolved_at: resolvedAt,
      context_signature: scenario.context_signature,
      regime: analysis?.pseudoMl?.regime?.regime || analysis?.bias || "unknown",
      momentum: analysis?.momentumCondition || "flat",
      volatility: analysis?.volatilityCondition || "normal",
      structure_position: analysis?.overlays?.structureSummary?.entryQuality >= 60 ? "near_extremes" : "mid_range",
      scenario_type: scenario.type,
      probability_at_creation: scenario.probability,
      final_status: scenario.status,
      outcome_quality: scenario.outcome_quality,
      matched_trigger: scenario.matched_trigger,
      matched_invalidation: scenario.matched_invalidation,
      move_extent: scenario.move_extent,
      resolution_candles: scenario.resolution_candles,
      human_action: humanSelection.action || "none",
      human_override: humanSelection.override || "none",
      lesson_tags: [scenario.status, scenario.type, winner?.id === scenario.id ? "winner" : "not_winner"],
    });
  });

  const resolvedRows = evaluated.map((scenario) => ({
    context_signature: scenario.context_signature,
    scenario,
    resolution: {
      final_status: scenario.status,
      outcome_quality: scenario.outcome_quality,
      resolution_candles: scenario.resolution_candles,
    },
    operatorOverride: {
      used: humanSelection.override && humanSelection.override !== "none",
      outcome: scenario.status,
      action: humanSelection.action || "none",
      override: humanSelection.override || "none",
      followedScenarioId: humanSelection.followedScenarioId || null,
    },
  }));

  updateScenarioContextStats();
  if (winner) {
    console.debug(`[Scenario] Scenario fulfilled: ${winner.type} in ${winner.resolution_candles} candles`);
  }
  console.debug("[Scenario] Probability adjusted for context signature after resolution");

  return {
    updatedSet: {
      ...scenarioSet,
      scenarios: evaluated,
      resolved: true,
      resolved_at: resolvedAt,
      winner_scenario_id: winner?.id || null,
      unresolved_count: unresolved.length,
    },
    resolved: true,
    winner,
    resolvedRows,
  };
}
