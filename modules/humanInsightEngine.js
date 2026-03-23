function clamp(value, min = 0, max = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function lineDistancePct(price, linePrice) {
  const p = Number(price);
  const l = Number(linePrice);
  if (!Number.isFinite(p) || !Number.isFinite(l) || !p) return Number.POSITIVE_INFINITY;
  return Math.abs(p - l) / Math.abs(p);
}

function checkRule(rule, ctx = {}, insight = {}, line = null) {
  if (rule === "price_near_line") return lineDistancePct(ctx.currentPrice, line?.price) <= Number(ctx.nearLineThresholdPct || 0.003);
  if (rule === "weak_followthrough") return Number(ctx.followthroughStrength || 0) <= 0.45;
  if (rule === "strong_followthrough") return Number(ctx.followthroughStrength || 0) >= 0.55;
  if (rule === "rejection_wick") return Boolean(ctx.rejectionWick);
  if (rule === "low_momentum") return Number(ctx.momentumStrength || 0) <= 0.4;
  if (rule === "line_invalidated") return Boolean(ctx.breakoutState === "break");
  return false;
}

function findLineForInsight(insight = {}, ctx = {}) {
  const rows = ctx.drawings || [];
  return rows.find((line) => line.id === insight.linkedDrawingId) || null;
}

function evaluateSingleInsight(insight = {}, ctx = {}) {
  const line = findLineForInsight(insight, ctx);
  if (!line) return { active: false, line: null, score: 0, missingRules: ["missing_line"] };

  const rules = insight.activationRules || [];
  const passed = [];
  const missing = [];
  rules.forEach((rule) => {
    if (checkRule(rule, ctx, insight, line)) passed.push(rule);
    else missing.push(rule);
  });

  const activationScore = rules.length ? passed.length / rules.length : 0;
  const condition = insight.condition?.type || "if_not_break";
  const breakoutState = String(ctx.breakoutState || "none");
  const passCondition = (condition === "if_break" && breakoutState === "break")
    || (condition === "if_not_break" && breakoutState !== "break")
    || (condition === "needs_confirmation" && Boolean(ctx.hasConfirmation));

  const active = activationScore >= 0.6 && passCondition;
  return {
    active,
    line,
    passedRules: passed,
    missingRules: missing,
    score: Number(activationScore.toFixed(3)),
  };
}

export function evaluateHumanInsights(insights = [], currentContext = {}) {
  const activeInsights = [];
  const effects = {
    longModifier: 0,
    shortModifier: 0,
    requireConfirmation: false,
    blockLong: false,
    blockShort: false,
  };

  insights.forEach((insight) => {
    const evaluation = evaluateSingleInsight(insight, currentContext);
    console.debug("Insight evaluated", {
      insightId: insight.id,
      linkedDrawingId: insight.linkedDrawingId,
      active: evaluation.active,
      score: evaluation.score,
    });
    if (!evaluation.active) return;

    const isLong = insight.condition?.directionBias === "long";
    const boost = clamp(insight.effect?.boostBias || 0, -1, 1);
    const reduce = clamp(insight.effect?.reduceOpposite || 0, 0, 1);
    if (isLong) {
      effects.longModifier += boost;
      effects.shortModifier -= reduce;
    } else {
      effects.shortModifier += boost;
      effects.longModifier -= reduce;
    }

    if (insight.effect?.requireConfirmation) effects.requireConfirmation = true;
    if (insight.effect?.blockOpposite) {
      if (isLong) effects.blockShort = true;
      else effects.blockLong = true;
    }

    console.debug("Insight activated", {
      insightId: insight.id,
      directionBias: insight.condition?.directionBias,
      boostBias: boost,
      reduceOpposite: reduce,
    });

    activeInsights.push({
      ...insight,
      activationScore: evaluation.score,
      passedRules: evaluation.passedRules,
      missingRules: evaluation.missingRules,
      linkedLine: evaluation.line,
    });
  });

  effects.longModifier = Number(clamp(effects.longModifier, -1, 1).toFixed(3));
  effects.shortModifier = Number(clamp(effects.shortModifier, -1, 1).toFixed(3));

  const summaryText = activeInsights.length
    ? `Human insight layer active (${activeInsights.length}) · long ${effects.longModifier.toFixed(2)} · short ${effects.shortModifier.toFixed(2)}${effects.requireConfirmation ? " · confirmation required" : ""}${effects.blockLong ? " · block long" : ""}${effects.blockShort ? " · block short" : ""}.`
    : "Human insight layer idle (no active insights).";

  return {
    activeInsights,
    effects,
    summaryText,
  };
}
