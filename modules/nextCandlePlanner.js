function toQuality(confidence = 0, friction = 0) {
  const score = Number(confidence || 0) - Number(friction || 0) * 0.55;
  if (score > 0.72) return "A";
  if (score > 0.58) return "B";
  if (score > 0.43) return "C";
  return "WAIT";
}

export function buildNextCandlePlan({ bias = "neutral", confidence = 0, friction = 0, marketState = {}, activeRules = [], mode = "copilot" } = {}) {
  const quality = toQuality(confidence, friction);
  const posture = mode === "observer"
    ? "observe"
    : quality === "WAIT"
      ? "wait"
      : bias === "long"
        ? "prepare long"
        : bias === "short"
          ? "prepare short"
          : "wait";

  const triggerLong = `Break and hold above local trigger (${marketState.nearestResistance || "resistance"}) with confirmation candle.`;
  const triggerShort = `Reject from local trigger (${marketState.nearestResistance || "resistance"}) or break below support (${marketState.nearestSupport || "support"}).`;
  const invalidation = bias === "long"
    ? "Any strong rejection + failed continuation within next candle"
    : bias === "short"
      ? "Momentum recovery above rejection high"
      : "No clean trigger in either direction";

  const reasons = [];
  if (activeRules.length) reasons.push(`${activeRules.length} learned rule(s) active`);
  if (friction > 0.6) reasons.push("friction is elevated");
  if (marketState.momentumConflict) reasons.push("momentum/structure conflict");

  return {
    posture,
    trigger_long: triggerLong,
    trigger_short: triggerShort,
    invalidation,
    expected_quality: quality,
    reasoning_summary: reasons.length ? reasons.join(" · ") : "Context aligned for assisted execution.",
  };
}
