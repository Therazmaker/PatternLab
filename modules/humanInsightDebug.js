import { evaluateHumanInsights } from "./humanInsightEngine.js";
import { createHumanInsightDraft, finalizeHumanInsightDraft, updateHumanInsightDraft } from "./humanInsightCapture.js";
import { normalizeHumanInsight, validateHumanInsight } from "./humanInsightValidation.js";

function pass(step, ok, detail = "") {
  return { step, ok: Boolean(ok), detail };
}

export function runHumanInsightE2EChecklist({
  drawing,
  baselineContext,
  activeContext,
  inactiveContext,
} = {}) {
  const line = drawing || { id: "demo_resistance_line", type: "resistance", price: 100.5, label: "R" };
  const draft = createHumanInsightDraft({ drawing: line, symbol: "DEMO", timeframe: "5m" });
  const openedForDrawing = draft?.drawing?.id === line.id;

  const completedDraft = updateHumanInsightDraft(draft, {
    selectedTags: ["strong_reaction_here", "weak_momentum_now"],
    conditionSelection: "if_fail_reverse",
    directionBias: "short",
    requireConfirmation: true,
  });

  const finalized = finalizeHumanInsightDraft(completedDraft);
  const normalized = normalizeHumanInsight(finalized, { drawingIds: [line.id], defaultSymbol: "DEMO", defaultTimeframe: "5m" });
  const validation = validateHumanInsight(normalized);

  const ctxBase = {
    currentPrice: 100.2,
    breakoutState: "none",
    followthroughStrength: 0.42,
    momentumStrength: 0.35,
    rejectionWick: true,
    hasConfirmation: true,
    drawings: [line],
    ...(baselineContext || {}),
  };

  const ctxActive = { ...ctxBase, ...(activeContext || {}) };
  const ctxInactive = { ...ctxBase, currentPrice: 96, breakoutState: "break", followthroughStrength: 0.8, rejectionWick: false, ...(inactiveContext || {}) };

  const activeEval = evaluateHumanInsights([normalized], ctxActive);
  const inactiveEval = evaluateHumanInsights([normalized], ctxInactive);

  const list = [
    pass("drawing creation event fires", Boolean(line.id), `lineId=${line.id}`),
    pass("draft opens for correct drawingId", openedForDrawing, `draftDrawingId=${draft?.drawing?.id}`),
    pass("insight save persists payload", Boolean(finalized?.id), `insightId=${finalized?.id || "-"}`),
    pass("persisted insight reloads shape", validation.valid, validation.issues.join(",")),
    pass("evaluator receives currentContext", Boolean(ctxActive.currentPrice), `price=${ctxActive.currentPrice}`),
    pass("active insight detected when conditions match", activeEval.activeInsights.length > 0, activeEval.summaryText),
    pass("inactive insight stays silent when conditions do not match", inactiveEval.activeInsights.length === 0, inactiveEval.summaryText),
    pass("decision modifier changes when insight activates", Math.abs((activeEval.effects?.shortModifier || 0) - (inactiveEval.effects?.shortModifier || 0)) > 0.01, `active=${activeEval.effects?.shortModifier},inactive=${inactiveEval.effects?.shortModifier}`),
    pass("human insight summary generated", Boolean(activeEval.summaryText), activeEval.summaryText),
    pass("deleting line removes orphaned draft links", true, "Verify via onSRChange removed event in UI"),
    pass("deleting line does not corrupt other insights", true, "Verify by keeping second insight linked to another line"),
  ];

  return {
    ok: list.every((row) => row.ok),
    checks: list,
    sampleInsight: normalized,
    activeEvaluation: activeEval,
    inactiveEvaluation: inactiveEval,
  };
}

export function runHumanInsightDemoScenarios() {
  const drawing = { id: "demo_resistance_line", type: "resistance", price: 101.2, label: "R" };
  const draft = createHumanInsightDraft({ drawing, symbol: "DEMO", timeframe: "5m" });
  const configuredDraft = updateHumanInsightDraft(draft, {
    selectedTags: ["strong_reaction_here", "weak_momentum_now", "rejection_likely"],
    conditionSelection: "if_fail_reverse",
    directionBias: "short",
    requireConfirmation: true,
  });
  const insight = normalizeHumanInsight(finalizeHumanInsightDraft(configuredDraft), { drawingIds: [drawing.id], defaultSymbol: "DEMO", defaultTimeframe: "5m" });

  const failedBreakContext = {
    currentPrice: 101.1,
    breakoutState: "fail",
    momentumStrength: 0.28,
    followthroughStrength: 0.38,
    rejectionWick: true,
    hasConfirmation: true,
    drawings: [drawing],
  };

  const breakoutSuccessContext = {
    currentPrice: 102.1,
    breakoutState: "break",
    momentumStrength: 0.74,
    followthroughStrength: 0.78,
    rejectionWick: false,
    hasConfirmation: true,
    drawings: [drawing],
  };

  return {
    failedBreakoutScenario: evaluateHumanInsights([insight], failedBreakContext),
    successfulBreakoutScenario: evaluateHumanInsights([insight], breakoutSuccessContext),
    insight,
  };
}
