import { getLearningModel } from "./learningEngine.js";

function includesAny(text = "", probes = []) {
  const source = String(text || "").toLowerCase();
  return probes.some((probe) => source.includes(String(probe).toLowerCase()));
}

export function activateLearnedRules({ marketState = {}, copilotEvaluation = null } = {}) {
  const model = getLearningModel();
  const activeRules = [];

  if (marketState.volatility === "compressed" && marketState.structurePosition === "near_resistance") {
    activeRules.push({
      id: "avoid_long_compression_resistance",
      text: "avoid long in compression near resistance",
      effect: { longPenalty: 0.22, friction: 0.16 },
    });
  }
  if (marketState.entryTiming === "late") {
    activeRules.push({
      id: "penalize_late_trend_entries",
      text: "penalize late trend entries",
      effect: { confidencePenalty: 0.12, friction: 0.2 },
    });
  }
  if (marketState.momentum === "fading" || marketState.momentum === "flat") {
    activeRules.push({
      id: "require_confirmation_weak_momentum",
      text: "require confirmation in weak momentum zones",
      effect: { requireConfirmation: true, friction: 0.13 },
    });
  }
  if (marketState.failedBreakout) {
    activeRules.push({
      id: "boost_short_after_failed_breakout",
      text: "boost short after failed breakout",
      effect: { shortBoost: 0.18, friction: -0.08 },
    });
  }

  const summary = String(copilotEvaluation?.summaryText || copilotEvaluation?.primary?.name || "");
  if (includesAny(summary, ["invalidated", "failed breakout", "compression"])) {
    activeRules.push({
      id: "copilot_feedback_runtime_guard",
      text: "runtime guard from copilot feedback",
      effect: { confidencePenalty: 0.08, friction: 0.1 },
    });
  }

  if (model?.weights?.momentumWeakPenalty < -0.12) {
    activeRules.push({
      id: "learning_model_momentum_penalty",
      text: "learning model momentum weak penalty",
      effect: { confidencePenalty: Math.min(0.16, Math.abs(model.weights.momentumWeakPenalty)), friction: 0.1 },
    });
  }

  return activeRules.slice(0, 8);
}
