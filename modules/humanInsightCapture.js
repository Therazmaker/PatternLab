import { interpretHumanInsightSelection } from "./humanInsightInterpreter.js";

function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function classifyDrawing(drawing = {}) {
  const points = Array.isArray(drawing.points) ? drawing.points : [];
  if (drawing.type === "channel") {
    return {
      type: "channel",
      label: "channel",
      meaning: "breakout_zone",
      expectation: "breakout",
      directionBias: "neutral",
      conditionSelection: "only_with_confirmation",
      selectedTags: ["key_level", "breakout_expected"],
    };
  }

  if (drawing.type === "horizontal_line") {
    return {
      type: "horizontal_line",
      label: "horizontal line",
      meaning: "resistance",
      expectation: "rejection",
      directionBias: "short",
      conditionSelection: "if_fail_reverse",
      selectedTags: ["rejection_likely", "key_level"],
    };
  }

  if (drawing.type === "trendline") {
    const a = points[0] || {};
    const b = points[points.length - 1] || {};
    const dt = Number(b.time) - Number(a.time);
    const dp = Number(b.price) - Number(a.price);
    const slope = dt ? dp / dt : 0;
    const up = slope >= 0;
    return {
      type: up ? "dynamic_support" : "dynamic_resistance",
      label: up ? "dynamic support" : "dynamic resistance",
      meaning: up ? "support" : "resistance",
      expectation: up ? "rejection" : "rejection",
      directionBias: up ? "long" : "short",
      conditionSelection: "if_fail_reverse",
      selectedTags: ["strong_reaction_here", "key_level", "rejection_likely"],
    };
  }

  return {
    type: "unknown",
    label: "manual level",
    meaning: "invalidation",
    expectation: "rejection",
    directionBias: "neutral",
    conditionSelection: "only_with_confirmation",
    selectedTags: ["key_level"],
  };
}

export function createHumanInsightDraft({ drawing = {}, symbol = "UNKNOWN", timeframe = "UNKNOWN" } = {}) {
  const classification = classifyDrawing(drawing);
  return {
    id: `human_insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    drawing,
    selectedTags: dedupe(classification.selectedTags),
    meaningSelection: classification.meaning,
    expectationSelection: classification.expectation,
    conditionSelection: classification.conditionSelection,
    directionBias: classification.directionBias,
    requireConfirmation: false,
    classification,
    metadata: {
      createdAt: new Date().toISOString(),
      symbol,
      timeframe,
      source: "drawing_intent_panel_v1",
    },
  };
}

export function toggleHumanInsightTag(draft = {}, tag = "") {
  const selected = new Set(draft.selectedTags || []);
  if (selected.has(tag)) selected.delete(tag);
  else selected.add(tag);
  return {
    ...draft,
    selectedTags: dedupe([...selected]),
  };
}

export function updateHumanInsightDraft(draft = {}, patch = {}) {
  return {
    ...draft,
    ...patch,
    selectedTags: dedupe(patch.selectedTags || draft.selectedTags || []),
  };
}

function deriveTagsFromMeaningAndExpectation(meaningSelection = "", expectationSelection = "") {
  const tags = [];
  if (meaningSelection === "support") tags.push("strong_reaction_here");
  if (meaningSelection === "resistance") tags.push("rejection_likely");
  if (meaningSelection === "breakout_zone") tags.push("breakout_expected", "key_level");
  if (meaningSelection === "invalidation") tags.push("invalidation", "key_level");
  if (expectationSelection === "rejection") tags.push("rejection_likely", "weak_momentum_now");
  if (expectationSelection === "breakout") tags.push("breakout_expected");
  return dedupe(tags);
}

export function finalizeHumanInsightDraft(draft = {}) {
  if (!draft?.drawing?.id) return null;
  const inferredDirection = draft.directionBias || "neutral";
  const needsConfirmation = Boolean(draft.requireConfirmation);
  const conditionSelection = draft.conditionSelection || "only_with_confirmation";
  const selectedTags = dedupe([
    ...(draft.selectedTags || []),
    ...deriveTagsFromMeaningAndExpectation(draft.meaningSelection, draft.expectationSelection),
  ]);

  return interpretHumanInsightSelection({
    id: draft.id,
    selectedTags,
    conditionSelection,
    directionBias: inferredDirection,
    requireConfirmation: needsConfirmation,
    meaningSelection: draft.meaningSelection,
    expectationSelection: draft.expectationSelection,
  }, draft.drawing, {
    ...draft.metadata,
    classification: draft.classification,
  });
}
