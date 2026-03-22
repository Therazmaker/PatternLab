const CAUSE_LABELS = {
  entered_into_resistance: "entry occurred too close to resistance",
  entered_into_support: "entry occurred too close to support",
  countertrend_entry: "trade was taken against the prevailing trend",
  low_momentum_entry: "momentum quality was weak at entry",
  no_followthrough: "price failed to follow through after entry",
  late_entry: "entry timing was late and extended",
  false_breakout: "breakout failed and reversed quickly",
  false_breakdown: "breakdown failed and reversed quickly",
  ranging_noise: "market was in a noisy ranging regime",
  volatility_spike_against: "a volatility spike moved against the trade",
  operator_warning_ignored: "operator warning context was not respected",
  trend_continuation: "trade matched trend continuation",
  pullback_entry_valid: "entry quality matched a valid pullback",
  breakout_with_followthrough: "breakout had strong follow-through",
  breakdown_with_followthrough: "breakdown had strong follow-through",
  support_hold: "support held and produced continuation",
  resistance_reject: "resistance rejection supported downside",
  strong_momentum_alignment: "momentum aligned strongly with direction",
  operator_bias_correct: "operator context improved trade quality",
  veto_saved_loss: "operator veto prevented a likely loss",
  veto_blocked_winner: "operator veto blocked a likely winner",
  confirmation_was_needed: "confirmation requirement reduced uncertainty",
  market_was_unclear: "market outcome remained unclear",
  operator_context_correct: "operator context call was correct",
  operator_context_incorrect: "operator context call was incorrect",
};

function labelFor(code) {
  return CAUSE_LABELS[code] || code.replaceAll("_", " ");
}

export function buildTradeSummary({ direction, result, primaryCause, secondaryCause }) {
  const dir = String(direction || "LONG");
  const side = dir === "SHORT" ? "SHORT" : "LONG";
  const outcome = String(result || "breakeven");
  const primary = labelFor(primaryCause);
  const secondary = secondaryCause ? ` Secondary factor: ${labelFor(secondaryCause)}.` : "";
  return `${side} ${outcome} mainly because ${primary}.${secondary}`.trim();
}

export function buildDecisionSummary({ operatorAction, verdict, signalDirection, primaryCause, secondaryCause }) {
  const action = String(operatorAction || "needs_confirmation");
  const verdictLabel = String(verdict || "neutral_skip").replaceAll("_", " ");
  const signal = String(signalDirection || "LONG");
  const primary = labelFor(primaryCause);
  const secondary = secondaryCause ? ` Secondary factor: ${labelFor(secondaryCause)}.` : "";
  return `Operator ${action} on ${signal} signal classified as ${verdictLabel} because ${primary}.${secondary}`.trim();
}

export function causeLabel(code) {
  return labelFor(code);
}
