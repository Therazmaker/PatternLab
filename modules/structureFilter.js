import { analyzeMarketStructure } from "./marketStructure.js";

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pctDistance(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.abs((a - b) / b) * 100;
}

function buildSequenceRead(candles = []) {
  const look = candles.slice(-4);
  if (look.length < 3) return { bearishFollowThrough: false, bullishReclaim: false };
  const [a, b, c] = look.slice(-3);
  const bearishFollowThrough = Number(c.close) < Number(b.close) && Number(b.close) < Number(a.close);
  const bullishReclaim = Number(c.close) > Number(b.close) && Number(b.close) > Number(a.close);
  return { bearishFollowThrough, bullishReclaim };
}

export function computeStructureFeatures({ candles = [], candleIndex, action = "NO_TRADE", entryPrice = null, targetPrice = null }) {
  const index = Number.isInteger(candleIndex) ? candleIndex : candles.length - 1;
  const scoped = candles.slice(0, index + 1);
  const current = scoped[scoped.length - 1] || {};
  const price = toNumber(entryPrice, toNumber(current.close, null));
  const structure = analyzeMarketStructure(scoped, { candleIndex: scoped.length - 1, priceRef: price, lookback: 120 });
  const seq = buildSequenceRead(scoped);

  const supportDist = toNumber(structure.nearestSupportDistancePct, null);
  const resistanceDist = toNumber(structure.nearestResistanceDistancePct, null);
  const supportQuality = toNumber(structure.nearestSupport?.qualityScore, 0);
  const resistanceQuality = toNumber(structure.nearestResistance?.qualityScore, 0);
  const targetDist = pctDistance(price, targetPrice);

  const longEntryScore = clamp((supportQuality * 0.6) + Math.max(0, 22 - (supportDist || 100)) * 1.4 - Math.max(0, 5 - (resistanceDist || 0)) * 4, 0, 100);
  const shortEntryScore = clamp((resistanceQuality * 0.6) + Math.max(0, 22 - (resistanceDist || 100)) * 1.4 - Math.max(0, 5 - (supportDist || 0)) * 4, 0, 100);

  const roomPct = action === "SHORT" ? supportDist : resistanceDist;
  const spaceToTargetScore = (!Number.isFinite(targetDist) || !Number.isFinite(roomPct) || targetDist <= 0)
    ? 50
    : clamp((roomPct / targetDist) * 100, 0, 100);

  const invalidationRiskScore = clamp(
    (structure.breakState === "broken" ? 75 : structure.breakState === "weakening" ? 45 : 15)
    + (action === "LONG" && seq.bearishFollowThrough ? 25 : 0)
    + (action === "SHORT" && seq.bullishReclaim ? 25 : 0),
    0,
    100,
  );

  return {
    nearestSupportPrice: structure.nearestSupport?.price ?? null,
    nearestResistancePrice: structure.nearestResistance?.price ?? null,
    nearestSupportDistancePct: supportDist,
    nearestResistanceDistancePct: resistanceDist,
    supportQualityScore: supportQuality,
    resistanceQualityScore: resistanceQuality,
    structureBias: structure.bias,
    structureBreakState: structure.breakState,
    entryLocationScore: action === "SHORT" ? shortEntryScore : longEntryScore,
    spaceToTargetScore,
    invalidationRiskScore,
    sequence: seq,
    levels: {
      supportCandidates: structure.supportLevels.slice(0, 5),
      resistanceCandidates: structure.resistanceLevels.slice(0, 5),
      swings: structure.swings,
      range: structure.range,
    },
  };
}

export function evaluateStructureFilter(input = {}) {
  const action = String(input.action || "NO_TRADE").toUpperCase();
  if (!["LONG", "SHORT"].includes(action)) {
    return {
      decision: "allow",
      scoreAdjustment: 0,
      reasons: [],
      features: computeStructureFeatures({ ...input, action }),
    };
  }

  const features = computeStructureFeatures(input);
  const reasons = [];
  let penalty = 0;

  if (action === "LONG") {
    if (Number(features.nearestResistanceDistancePct) <= 0.35) {
      penalty += 34;
      reasons.push("LONG blocked pressure: nearest resistance is too close.");
    }
    if (Number(features.supportQualityScore) < 35 || Number(features.nearestSupportDistancePct) > 1.6) {
      penalty += 20;
      reasons.push("LONG risk: support is weak or too far for clean invalidation.");
    }
    if (features.structureBreakState === "broken") {
      penalty += 38;
      reasons.push("LONG invalidated: bullish structure already broken.");
    } else if (features.structureBreakState === "weakening") {
      penalty += 18;
      reasons.push("LONG warning: bullish structure is weakening.");
    }
    if (features.sequence?.bearishFollowThrough) {
      penalty += 16;
      reasons.push("LONG warning: bearish follow-through sequence detected.");
    }
  }

  if (action === "SHORT") {
    if (Number(features.nearestSupportDistancePct) <= 0.35) {
      penalty += 34;
      reasons.push("SHORT blocked pressure: nearest support is too close.");
    }
    if (Number(features.resistanceQualityScore) < 35 || Number(features.nearestResistanceDistancePct) > 1.6) {
      penalty += 20;
      reasons.push("SHORT risk: resistance is weak or too far for clean invalidation.");
    }
    if (features.structureBreakState === "broken") {
      penalty += 38;
      reasons.push("SHORT invalidated: bearish structure already broken.");
    } else if (features.structureBreakState === "weakening") {
      penalty += 18;
      reasons.push("SHORT warning: bearish structure is weakening.");
    }
    if (features.sequence?.bullishReclaim) {
      penalty += 16;
      reasons.push("SHORT warning: bullish reclaim sequence detected.");
    }
  }

  if (Number(features.spaceToTargetScore) < 85) {
    penalty += 24;
    reasons.push(`${action} warning: poor structural room to target.`);
  }

  const decision = penalty >= 70 ? "block" : penalty >= 35 ? "warn" : "allow";
  return {
    decision,
    scoreAdjustment: -penalty,
    reasons,
    features,
  };
}
