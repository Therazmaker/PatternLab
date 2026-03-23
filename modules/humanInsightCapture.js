import { interpretHumanInsightSelection } from "./humanInsightInterpreter.js";

function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function createHumanInsightDraft({ drawing = {}, symbol = "UNKNOWN", timeframe = "UNKNOWN" } = {}) {
  return {
    id: `human_insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    drawing,
    selectedTags: [],
    conditionSelection: "if_fail_reverse",
    directionBias: drawing.type === "support" ? "long" : "short",
    requireConfirmation: false,
    metadata: {
      createdAt: new Date().toISOString(),
      symbol,
      timeframe,
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

export function finalizeHumanInsightDraft(draft = {}) {
  if (!draft?.drawing?.id) return null;
  const selectedTags = dedupe(draft.selectedTags || []);
  const inferredDirection = draft.directionBias || (draft.drawing?.type === "support" ? "long" : "short");
  const needsConfirmation = Boolean(draft.requireConfirmation || !selectedTags.length);
  const conditionSelection = draft.conditionSelection || "only_with_confirmation";
  return interpretHumanInsightSelection({
    id: draft.id,
    selectedTags,
    conditionSelection,
    directionBias: inferredDirection,
    requireConfirmation: needsConfirmation,
  }, draft.drawing, draft.metadata);
}
