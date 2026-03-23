// copilotFeedbackEvaluator.js
// Evaluates live/current market context against copilot feedback scenario rules.

/**
 * Evaluate a single rule against the current market context.
 * Rules use a free-text `condition` field; we use keyword matching as a lightweight engine.
 * @param {object} rule - { id, description, condition }
 * @param {object} marketCtx - { price, bias, regime, structure, candle, ... }
 * @returns {{ matched: boolean, ruleId: string, reason: string }}
 */
function evaluateRule(rule, marketCtx = {}) {
  const condition = String(rule.condition || "").toLowerCase();
  const price = Number(marketCtx.price || marketCtx.currentPrice || 0);
  const bias = String(marketCtx.bias || marketCtx.direction || "none").toLowerCase();
  const regime = String(marketCtx.regime || "").toLowerCase();
  const structure = marketCtx.structure || {};

  let matched = false;
  let reason = `Rule "${rule.id}": condition="${rule.condition}"`;

  // Keyword heuristics for common trading conditions
  if (condition.includes("bearish") && (bias === "bearish" || bias === "short")) {
    matched = true;
    reason += " → bias is bearish";
  } else if (condition.includes("bullish") && (bias === "bullish" || bias === "long")) {
    matched = true;
    reason += " → bias is bullish";
  } else if (condition.includes("breakdown") && structure.breakState === "breakdown") {
    matched = true;
    reason += " → breakdown confirmed";
  } else if (condition.includes("breakout") && structure.breakState === "breakout") {
    matched = true;
    reason += " → breakout confirmed";
  } else if (condition.includes("rejection") && structure.rejectionSignal === true) {
    matched = true;
    reason += " → rejection confirmed";
  } else if (condition.includes("ranging") && (regime.includes("ranging") || regime.includes("range"))) {
    matched = true;
    reason += " → market is ranging";
  } else if (condition.includes("trending") && (regime.includes("trending") || regime.includes("trend"))) {
    matched = true;
    reason += " → market is trending";
  } else if (condition.includes("below_resistance") && structure.resistanceQuality === "strong" && price < (marketCtx.resistanceLevel || Infinity)) {
    matched = true;
    reason += " → price below resistance";
  } else if (condition.includes("above_support") && structure.supportQuality === "strong" && price > (marketCtx.supportLevel || 0)) {
    matched = true;
    reason += " → price above support";
  } else if (condition.includes("candle_close") || condition.includes("confirmed_close")) {
    // Requires explicit candle close — matches if a candle is closed (not open/forming)
    matched = Boolean(marketCtx.candleClosed);
    reason += matched ? " → confirmed candle close" : " → candle not yet closed";
  } else if (condition.includes("no_new_high") && marketCtx.newHigh === false) {
    matched = true;
    reason += " → no new high confirmed";
  } else if (condition.includes("no_new_low") && marketCtx.newLow === false) {
    matched = true;
    reason += " → no new low confirmed";
  } else if (condition.includes("price_above") && typeof marketCtx.priceLevel === "number" && price > marketCtx.priceLevel) {
    matched = true;
    reason += ` → price ${price} above ${marketCtx.priceLevel}`;
  } else if (condition.includes("price_below") && typeof marketCtx.priceLevel === "number" && price < marketCtx.priceLevel) {
    matched = true;
    reason += ` → price ${price} below ${marketCtx.priceLevel}`;
  }

  return { matched, ruleId: rule.id, description: rule.description, condition: rule.condition, reason };
}

/**
 * Evaluate a set of rules with "any" or "all" logic.
 * @param {object[]} rules
 * @param {object} marketCtx
 * @param {"any"|"all"} logic
 * @returns {{ triggered: boolean, matchedRules: object[], unmatchedRules: object[] }}
 */
function evaluateRuleSet(rules = [], marketCtx = {}, logic = "any") {
  const results = rules.map((rule) => evaluateRule(rule, marketCtx));
  const matched = results.filter((r) => r.matched);
  const unmatched = results.filter((r) => !r.matched);
  const triggered = logic === "all" ? matched.length === rules.length && rules.length > 0 : matched.length > 0;
  return { triggered, matchedRules: matched, unmatchedRules: unmatched };
}

/**
 * Determine scenario status based on trigger and invalidation evaluations.
 * @param {{ triggered: boolean }} triggerResult
 * @param {{ triggered: boolean }} invalidationResult
 * @returns {"waiting_confirmation"|"validated"|"invalidated"}
 */
function resolveScenarioStatus(triggerResult, invalidationResult) {
  if (invalidationResult.triggered) return "invalidated";
  if (triggerResult.triggered) return "validated";
  return "waiting_confirmation";
}

/**
 * Evaluate the full copilot feedback against the current market context.
 * @param {object} feedback - normalized copilot feedback object (from copilotFeedbackStore)
 * @param {object} marketCtx - live market context
 * @returns {{ primaryStatus, alternateStatus, matchedRules, invalidatedRules, globalInvalidated, nextAction, explanation }}
 */
export function evaluateCopilotFeedback(feedback, marketCtx = {}) {
  if (!feedback || !feedback.scenario_primary) {
    return {
      primaryStatus: null,
      alternateStatus: null,
      matchedRules: [],
      invalidatedRules: [],
      globalInvalidated: false,
      nextAction: "idle",
      explanation: "No copilot feedback loaded.",
    };
  }

  const primary = feedback.scenario_primary;
  const alternate = feedback.scenario_alternate || null;

  // Evaluate primary scenario
  const primaryTrigger = evaluateRuleSet(primary.trigger?.rules || [], marketCtx, primary.trigger?.logic || "any");
  const primaryInvalidation = evaluateRuleSet(primary.invalidation?.rules || [], marketCtx, primary.invalidation?.logic || "any");
  const primaryStatus = resolveScenarioStatus(primaryTrigger, primaryInvalidation);

  // Evaluate alternate scenario (if present)
  let alternateStatus = null;
  let altTrigger = { triggered: false, matchedRules: [], unmatchedRules: [] };
  let altInvalidation = { triggered: false, matchedRules: [], unmatchedRules: [] };
  if (alternate) {
    altTrigger = evaluateRuleSet(alternate.trigger?.rules || [], marketCtx, alternate.trigger?.logic || "any");
    altInvalidation = evaluateRuleSet(alternate.invalidation?.rules || [], marketCtx, alternate.invalidation?.logic || "any");
    alternateStatus = resolveScenarioStatus(altTrigger, altInvalidation);
  }

  // Evaluate global invalidations
  const globalInvalidationResult = evaluateRuleSet(feedback.global_invalidations || [], marketCtx, "any");
  const globalInvalidated = globalInvalidationResult.triggered;

  // Collect all matched/invalidated rules
  const matchedRules = [
    ...primaryTrigger.matchedRules,
    ...(alternate ? altTrigger.matchedRules : []),
  ];
  const invalidatedRules = [
    ...primaryInvalidation.matchedRules,
    ...(alternate ? altInvalidation.matchedRules : []),
    ...globalInvalidationResult.matchedRules,
  ];

  // Determine next action
  let nextAction = "wait";
  if (globalInvalidated) {
    nextAction = "block_all";
  } else if (primaryStatus === "validated") {
    nextAction = "consider_primary";
  } else if (primaryStatus === "invalidated" && alternateStatus === "validated") {
    nextAction = "consider_alternate";
  } else if (primaryStatus === "invalidated") {
    nextAction = "block_primary";
  }

  // Explanation text
  const parts = [
    `Primary scenario "${primary.name}": ${primaryStatus}.`,
  ];
  if (primaryTrigger.matchedRules.length) {
    parts.push(`Triggers matched: ${primaryTrigger.matchedRules.map((r) => r.ruleId).join(", ")}.`);
  }
  if (primaryInvalidation.matchedRules.length) {
    parts.push(`Invalidations matched: ${primaryInvalidation.matchedRules.map((r) => r.ruleId).join(", ")}.`);
  }
  if (alternate) {
    parts.push(`Alternate scenario "${alternate.name}": ${alternateStatus}.`);
  }
  if (globalInvalidated) {
    parts.push(`Global invalidation triggered: ${globalInvalidationResult.matchedRules.map((r) => r.ruleId).join(", ")}.`);
  }

  return {
    primaryStatus,
    alternateStatus,
    matchedRules,
    invalidatedRules,
    globalInvalidated,
    nextAction,
    explanation: parts.join(" "),
    // Extended per-scenario detail used by the decision trace builder
    primaryMatchedTriggers:  primaryTrigger.matchedRules,
    primaryMissingTriggers:  primaryTrigger.unmatchedRules,
    primaryInvalidatedRules: primaryInvalidation.matchedRules,
    altMatchedTriggers:      alternate ? altTrigger.matchedRules       : [],
    altMissingTriggers:      alternate ? altTrigger.unmatchedRules     : [],
    altInvalidatedRules:     alternate ? altInvalidation.matchedRules  : [],
  };
}
