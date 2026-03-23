function asDirection(signal = {}) {
  const direction = String(signal.direction || signal.bias || "NONE").toUpperCase();
  return ["LONG", "SHORT", "NONE"].includes(direction) ? direction : "NONE";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function classifyDiagnosis(reasonCodes = [], outcome = {}) {
  const has = (code) => reasonCodes.includes(code);
  if (has("late_entry")) return "late_entry";
  if (has("entered_long_into_resistance") || has("entered_short_into_support") || has("no_confirmation")) return "bad_entry";
  if (has("failed_breakout_ignored") || has("structure_bias_conflict")) return "structure_error";
  if (toNumber(outcome.pnl, 0) < 0 && toNumber(outcome.maxDrawdown, 0) <= 0.35) return "good_entry_bad_luck";
  return toNumber(outcome.pnl, 0) >= 0 ? "good_entry_bad_luck" : "bad_entry";
}

export function analyzeOutcome(tradeContext = {}, outcome = {}) {
  const direction = asDirection(tradeContext?.signal);
  const context = tradeContext?.context || {};
  const reasonCodes = [];

  if (direction === "LONG" && context.nearResistance) reasonCodes.push("entered_long_into_resistance");
  if (direction === "SHORT" && context.nearSupport) reasonCodes.push("entered_short_into_support");

  const breakoutFailed = Boolean(context.triggerLines?.failedBreakout || context.failedBreakout);
  if (breakoutFailed) reasonCodes.push("failed_breakout_ignored");

  const noConfirmation = Boolean(context.compression && !context.confirmationSeen);
  if (noConfirmation) reasonCodes.push("no_confirmation");

  if (String(context.momentumState || "").toLowerCase() === "weak") reasonCodes.push("momentum_weak");

  if (String(context.structurePosition || "").toLowerCase().includes("late")) reasonCodes.push("late_entry");

  const regime = String(context.regime || "").toLowerCase();
  if ((direction === "LONG" && regime === "bearish") || (direction === "SHORT" && regime === "bullish")) {
    reasonCodes.push("structure_bias_conflict");
  }

  if (!reasonCodes.length && toNumber(outcome.pnl, 0) < 0) reasonCodes.push("unclassified_loss");
  if (!reasonCodes.length && toNumber(outcome.pnl, 0) >= 0) reasonCodes.push("aligned_context");

  return {
    reasonCodes,
    classification: classifyDiagnosis(reasonCodes, outcome),
  };
}
