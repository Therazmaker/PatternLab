import {
  detectBreakAbove,
  detectBreakBelow,
  detectFailedBreak,
  detectRejectionAtLevel,
  detectStaysAbove,
  detectStaysBelow,
  detectStrongFollowThrough,
} from "./triggerConditionDetectors.js";

const IMPORTANCE_WEIGHT = { low: 0.08, medium: 0.16, high: 0.24 };

function emptyAggregate() {
  return {
    boostLong: 0,
    boostShort: 0,
    reduceLong: 0,
    reduceShort: 0,
    requireConfirmation: false,
    blockLong: false,
    blockShort: false,
  };
}

function evaluateCondition(triggerLine = {}, candles = []) {
  const level = Number(triggerLine.level || 0);
  const mode = triggerLine.triggerConfig?.confirmationMode || "candle_close";
  const condition = triggerLine.triggerConfig?.condition || "if_not_break";

  if (condition === "if_break") return detectBreakAbove(level, candles, mode) || detectBreakBelow(level, candles, mode);
  if (condition === "if_not_break") return detectFailedBreak(level, candles, mode) || detectStaysBelow(level, candles, 3) || detectStaysAbove(level, candles, 3);
  if (condition === "if_rejects") return detectRejectionAtLevel(level, candles);
  if (condition === "if_stays_below") return detectStaysBelow(level, candles, 3);
  if (condition === "if_stays_above") return detectStaysAbove(level, candles, 3);
  return false;
}

export function evaluateTriggerLines(triggerLines = [], currentContext = {}) {
  const candles = currentContext?.recentCandles || currentContext?.candles || [];
  const currentPrice = Number(currentContext?.currentPrice ?? candles[candles.length - 1]?.close);
  const aggregateEffect = emptyAggregate();

  const activeTriggerEffects = (Array.isArray(triggerLines) ? triggerLines : [])
    .filter((line) => line?.metadata?.active !== false)
    .map((line) => {
      const matched = evaluateCondition(line, candles);
      const importance = line.triggerConfig?.importance || "medium";
      const baseWeight = IMPORTANCE_WEIGHT[importance] || IMPORTANCE_WEIGHT.medium;
      const resultingBias = line.triggerConfig?.biasOnTrigger || "neutral";
      const requiresConfirmation = line.triggerConfig?.confirmationMode === "follow_through" || line.triggerConfig?.biasOnTrigger === "neutral";

      let status = matched ? "triggered" : "watching";
      let summaryText = matched
        ? `Triggered: ${line.triggerConfig?.condition} matched at ${line.level}. Bias ${resultingBias}.`
        : `Watching ${line.triggerConfig?.condition} at ${line.level}.`;
      if (line.triggerConfig?.role === "invalidation_line" && detectStrongFollowThrough(Number(line.level), candles)) {
        status = "invalidated";
        summaryText = `Invalidated: follow-through moved beyond trigger line ${line.level}.`;
      }

      if (matched && status === "triggered") {
        if (resultingBias === "long") {
          aggregateEffect.boostLong += baseWeight;
          aggregateEffect.reduceShort += baseWeight * 0.7;
          if (line.triggerConfig?.role === "invalidation_line") aggregateEffect.blockShort = true;
        } else if (resultingBias === "short") {
          aggregateEffect.boostShort += baseWeight;
          aggregateEffect.reduceLong += baseWeight * 0.7;
          if (line.triggerConfig?.role === "invalidation_line") aggregateEffect.blockLong = true;
        } else {
          aggregateEffect.requireConfirmation = true;
        }
        if (requiresConfirmation) aggregateEffect.requireConfirmation = true;
      }

      console.debug("Trigger line evaluated", {
        triggerLineId: line.id,
        level: line.level,
        condition: line.triggerConfig?.condition,
        resultingBias,
        confirmationResult: matched,
      });
      if (matched) {
        console.debug("Trigger condition matched", {
          triggerLineId: line.id,
          level: line.level,
          condition: line.triggerConfig?.condition,
          resultingBias,
          confirmationResult: line.triggerConfig?.confirmationMode,
        });
      }
      if (status === "invalidated") {
        console.debug("Trigger line invalidated", {
          triggerLineId: line.id,
          level: line.level,
          condition: line.triggerConfig?.condition,
          resultingBias,
          confirmationResult: line.triggerConfig?.confirmationMode,
        });
      }

      return {
        triggerLineId: line.id,
        level: Number(line.level),
        triggered: status === "triggered",
        status,
        matchedCondition: matched ? line.triggerConfig?.condition || null : null,
        resultingBias,
        confidenceEffect: matched ? Number(baseWeight.toFixed(3)) : 0,
        requiresConfirmation,
        summaryText,
      };
    });

  const summaryBits = activeTriggerEffects
    .filter((row) => row.status === "triggered")
    .map((row) => row.summaryText);

  return {
    activeTriggerEffects,
    aggregateEffect,
    summaryText: summaryBits.length ? summaryBits.join(" ") : `Watching ${activeTriggerEffects.length} trigger line(s) · current price ${Number.isFinite(currentPrice) ? currentPrice : "n/a"}`,
  };
}
