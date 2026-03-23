const INSIGHT_TYPE_MAP = Object.freeze({
  strong_reaction_here: "rejection_setup",
  weak_momentum_now: "pullback_setup",
  breakout_expected: "breakout_setup",
  rejection_likely: "rejection_setup",
  key_level: "invalidation",
  invalidation: "invalidation",
});

const CONTEXT_TEMPLATE = Object.freeze({
  reactionMemory: "medium",
  momentumState: "neutral",
  importance: "medium",
});

const CONDITION_TYPE_MAP = Object.freeze({
  if_break_continue: "if_break",
  if_fail_reverse: "if_not_break",
  only_with_confirmation: "needs_confirmation",
});

function clamp(value, min = 0, max = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function normalizeDirection(directionBias = "short") {
  const key = String(directionBias || "neutral").toLowerCase();
  if (key === "long") return "long";
  if (key === "short") return "short";
  return "neutral";
}

function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function deriveContext(selectedTags = []) {
  const context = { ...CONTEXT_TEMPLATE };
  if (selectedTags.includes("strong_reaction_here")) context.reactionMemory = "strong";
  if (selectedTags.includes("weak_momentum_now")) context.momentumState = "weak";
  if (selectedTags.includes("breakout_expected")) context.momentumState = "strong";
  if (selectedTags.includes("key_level") || selectedTags.includes("invalidation")) context.importance = "high";
  return context;
}

function deriveInsightType(selectedTags = []) {
  if (!selectedTags.length) return "pullback_setup";
  const [first] = selectedTags;
  return INSIGHT_TYPE_MAP[first] || "pullback_setup";
}

function deriveActivationRules(selectedTags = [], conditionType = "if_not_break") {
  const rules = ["price_near_line"];
  if (selectedTags.includes("weak_momentum_now")) rules.push("low_momentum", "weak_followthrough");
  if (selectedTags.includes("rejection_likely") || conditionType === "if_not_break") rules.push("rejection_wick", "weak_followthrough");
  if (selectedTags.includes("breakout_expected") || conditionType === "if_break") rules.push("strong_followthrough");
  if (selectedTags.includes("invalidation")) rules.push("line_invalidated");
  return dedupe(rules);
}

function deriveEffect({
  selectedTags = [],
  conditionType = "if_not_break",
  directionBias = "short",
  requireConfirmation = false,
} = {}) {
  const normalizedBias = normalizeDirection(directionBias);
  const isLong = normalizedBias === "long";
  const isShort = normalizedBias === "short";
  const baseBoost = selectedTags.includes("key_level") ? 0.16 : selectedTags.includes("strong_reaction_here") ? 0.14 : 0.1;
  const breakoutBoost = conditionType === "if_break" ? 0.06 : 0;
  const reversalBoost = conditionType === "if_not_break" ? 0.08 : 0;
  const boostBias = clamp(baseBoost + breakoutBoost + reversalBoost, -1, 1);
  const reduceOpposite = clamp(boostBias * 0.85, 0, 1);

  return {
    boostBias: Number((isLong || isShort ? boostBias : Math.min(boostBias, 0.06)).toFixed(3)),
    reduceOpposite: Number((isLong || isShort ? reduceOpposite : Math.min(reduceOpposite, 0.08)).toFixed(3)),
    requireConfirmation: Boolean(requireConfirmation || conditionType === "needs_confirmation"),
    blockOpposite: Boolean(selectedTags.includes("invalidation") || selectedTags.includes("key_level")) && isLong ? false : Boolean(selectedTags.includes("invalidation")),
  };
}

export function interpretHumanInsightSelection(selection = {}, drawing = {}, metadata = {}) {
  const selectedTags = dedupe(selection.selectedTags || []);
  const conditionType = CONDITION_TYPE_MAP[selection.conditionSelection] || "if_not_break";
  const directionBias = normalizeDirection(selection.directionBias);

  const resolvedInsightType = selection.meaningSelection === "invalidation" ? "invalidation" : deriveInsightType(selectedTags);

  return {
    id: selection.id,
    linkedDrawingId: drawing.id,
    insightType: resolvedInsightType,
    context: deriveContext(selectedTags),
    condition: {
      type: conditionType,
      directionBias,
    },
    activationRules: deriveActivationRules(selectedTags, conditionType),
    effect: deriveEffect({
      selectedTags,
      conditionType,
      directionBias,
      requireConfirmation: selection.requireConfirmation,
    }),
    metadata: {
      createdAt: metadata.createdAt || new Date().toISOString(),
      symbol: metadata.symbol || "UNKNOWN",
      timeframe: metadata.timeframe || "UNKNOWN",
      source: metadata.source || "session-candle",
      meaningSelection: selection.meaningSelection || null,
      expectationSelection: selection.expectationSelection || null,
      classification: metadata.classification || null,
    },
  };
}
