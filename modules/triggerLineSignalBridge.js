function clamp(value, min = -0.9, max = 0.9) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

export function buildTriggerLineEffects(activeTriggerEffects = []) {
  const effects = {
    longModifier: 0,
    shortModifier: 0,
    requireConfirmation: false,
    blockLong: false,
    blockShort: false,
    reasonCodes: [],
    summaryText: "Trigger lines idle.",
  };

  const active = (Array.isArray(activeTriggerEffects) ? activeTriggerEffects : []).filter((row) => row?.status === "triggered");
  if (!active.length) return effects;

  active.forEach((effect) => {
    const weight = clamp(effect.confidenceEffect, 0, 0.35);
    if (effect.resultingBias === "long") {
      effects.longModifier += weight;
      effects.shortModifier -= weight * 0.65;
      effects.reasonCodes.push("trigger_bias_long");
    } else if (effect.resultingBias === "short") {
      effects.shortModifier += weight;
      effects.longModifier -= weight * 0.65;
      effects.reasonCodes.push("trigger_bias_short");
    } else {
      effects.requireConfirmation = true;
      effects.reasonCodes.push("trigger_bias_neutral");
    }
    if (effect.requiresConfirmation) effects.requireConfirmation = true;
    if (effect.matchedCondition === "if_stays_below" && effect.resultingBias === "short") {
      effects.blockLong = true;
      effects.reasonCodes.push("trigger_block_long_stays_below");
    }
    if (effect.matchedCondition === "if_stays_above" && effect.resultingBias === "long") {
      effects.blockShort = true;
      effects.reasonCodes.push("trigger_block_short_stays_above");
    }

    console.debug("Trigger effect applied", {
      triggerLineId: effect.triggerLineId,
      level: effect.level,
      condition: effect.matchedCondition,
      resultingBias: effect.resultingBias,
      confirmationResult: effect.requiresConfirmation,
    });
  });

  effects.longModifier = Number(clamp(effects.longModifier, -0.45, 0.45).toFixed(4));
  effects.shortModifier = Number(clamp(effects.shortModifier, -0.45, 0.45).toFixed(4));
  effects.summaryText = active.map((row) => row.summaryText).slice(0, 3).join(" ");

  return effects;
}
