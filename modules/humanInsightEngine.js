import { validateHumanInsight } from "./humanInsightValidation.js";

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

function projectTrendlinePrice(points = [], targetTime) {
  const a = points[0];
  const b = points[1] || a;
  const tA = Number(a?.time);
  const tB = Number(b?.time);
  const pA = Number(a?.price);
  const pB = Number(b?.price);
  if (![tA, tB, pA, pB, Number(targetTime)].every(Number.isFinite)) return Number.NaN;
  if (tA === tB) return pB;
  const slope = (pB - pA) / (tB - tA);
  return pA + slope * (Number(targetTime) - tA);
}

function getInteractionForLine(line = {}, ctx = {}) {
  const candles = Array.isArray(ctx.candles) ? ctx.candles : [];
  const current = ctx.currentCandle || candles[candles.length - 1] || null;
  const prev = ctx.previousCandle || candles[candles.length - 2] || null;
  const currentTime = Number(current?.timestamp ?? current?.time ?? current?.index);
  const currentClose = Number(current?.close ?? ctx.currentPrice);
  const prevClose = Number(prev?.close);

  let linePrice = Number(line?.price);
  if (line?.type === "trendline") linePrice = projectTrendlinePrice(line.points, currentTime);
  if (line?.type === "channel") {
    const base = projectTrendlinePrice(line.points?.slice(0, 2), currentTime);
    const offset = Number(line?.extra?.channelOffset || 0);
    linePrice = Number.isFinite(base) ? base + offset : Number.NaN;
  }

  const distancePct = lineDistancePct(currentClose, linePrice);
  const threshold = Number(ctx.nearLineThresholdPct || 0.003);
  const isNearLine = distancePct <= threshold;

  const crossed = Number.isFinite(prevClose) && Number.isFinite(linePrice)
    ? (prevClose - linePrice) * (currentClose - linePrice) < 0
    : false;
  const breakoutState = crossed ? "break" : isNearLine ? "fail" : "none";
  const rejectionWick = Boolean(current && Number.isFinite(linePrice)
    && Number(current.high) >= linePrice
    && Number(current.low) <= linePrice
    && Math.abs(currentClose - linePrice) <= Math.abs(linePrice) * threshold * 1.25
    && !crossed);

  return {
    linePrice,
    distancePct,
    isNearLine,
    breakoutState,
    rejectionWick,
  };
}

function checkRule(rule, ctx = {}, insight = {}, line = null, interaction = null) {
  const breakoutState = interaction?.breakoutState || String(ctx.breakoutState || "none");
  const rejectionWick = Boolean(interaction?.rejectionWick || ctx.rejectionWick);
  const nearLine = Boolean(interaction?.isNearLine) || lineDistancePct(ctx.currentPrice, interaction?.linePrice ?? line?.price) <= Number(ctx.nearLineThresholdPct || 0.003);
  if (rule === "price_near_line") return nearLine;
  if (rule === "weak_followthrough") return Number(ctx.followthroughStrength || 0) <= 0.45;
  if (rule === "strong_followthrough") return Number(ctx.followthroughStrength || 0) >= 0.55;
  if (rule === "rejection_wick") return rejectionWick;
  if (rule === "low_momentum") return Number(ctx.momentumStrength || 0) <= 0.4;
  if (rule === "line_invalidated") return breakoutState === "break";
  return false;
}

function findLineForInsight(insight = {}, ctx = {}) {
  const rows = ctx.drawings || [];
  return rows.find((line) => line.id === insight.linkedDrawingId) || null;
}

function evaluateSingleInsight(insight = {}, ctx = {}) {
  const line = findLineForInsight(insight, ctx);
  if (!line) return { active: false, line: null, score: 0, missingRules: ["missing_line"] };

  const interaction = getInteractionForLine(line, ctx);
  const rules = insight.activationRules || [];
  const passed = [];
  const missing = [];
  rules.forEach((rule) => {
    if (checkRule(rule, ctx, insight, line, interaction)) passed.push(rule);
    else missing.push(rule);
  });

  const activationScore = rules.length ? passed.length / rules.length : 0;
  const condition = insight.condition?.type || "if_not_break";
  const breakoutState = interaction.breakoutState || String(ctx.breakoutState || "none");
  const passCondition = (condition === "if_break" && breakoutState === "break")
    || (condition === "if_not_break" && breakoutState !== "break")
    || (condition === "needs_confirmation" && Boolean(ctx.hasConfirmation));

  const active = activationScore >= 0.6 && passCondition;
  return {
    active,
    line,
    interaction,
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
    const validation = validateHumanInsight(insight);
    if (!validation.valid) {
      console.debug("Orphan insight skipped", {
        insightId: insight?.id,
        drawingId: insight?.linkedDrawingId,
        conditionType: insight?.condition?.type,
        directionBias: insight?.condition?.directionBias,
        activationResult: false,
        effectSummary: validation.issues.join(","),
      });
      return;
    }
    if (insight?.metadata?.isOrphaned) {
      console.debug("Orphan insight skipped", {
        insightId: insight.id,
        drawingId: insight.linkedDrawingId,
        conditionType: insight.condition?.type,
        directionBias: insight.condition?.directionBias,
        activationResult: false,
        effectSummary: insight.metadata?.orphanReason || "missing_linked_drawing",
      });
      return;
    }
    const evaluation = evaluateSingleInsight(insight, currentContext);
    console.debug("Insight evaluated", {
      insightId: insight.id,
      drawingId: insight.linkedDrawingId,
      conditionType: insight.condition?.type,
      directionBias: insight.condition?.directionBias,
      activationResult: evaluation.active,
      effectSummary: `${insight.effect?.boostBias || 0}/${insight.effect?.reduceOpposite || 0}`,
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
      drawingId: insight.linkedDrawingId,
      conditionType: insight.condition?.type,
      directionBias: insight.condition?.directionBias,
      activationResult: true,
      effectSummary: `boost=${boost},reduce=${reduce},confirm=${Boolean(insight.effect?.requireConfirmation)}`,
    });

    activeInsights.push({
      ...insight,
      activationScore: evaluation.score,
      passedRules: evaluation.passedRules,
      missingRules: evaluation.missingRules,
      linkedLine: evaluation.line,
      interaction: evaluation.interaction,
      isTriggered: evaluation.interaction?.breakoutState === "break" || evaluation.interaction?.rejectionWick,
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
