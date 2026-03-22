function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtPrice(value) {
  const n = num(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 100) return n.toFixed(3);
  return n.toFixed(5);
}

function classifyContext({ trend, mixedPressure, compression, breakoutWatch, reversalRisk }) {
  if (compression || breakoutWatch) return "breakout watch";
  if (trend === "bullish" && mixedPressure) return "bullish with friction";
  if (trend === "bearish" && mixedPressure) return "bearish with friction";
  if (trend === "bullish") return "bullish continuation";
  if (trend === "bearish") return "bearish continuation";
  if (reversalRisk) return "reversal risk";
  return "neutral compression";
}

function findNearest(zones = [], type, lastClose) {
  const filtered = (zones || []).filter((z) => z.type === type && Number.isFinite(num(z.price)));
  if (!filtered.length) return null;
  return filtered
    .map((z) => ({ ...z, distance: Math.abs(num(z.price, 0) - lastClose) }))
    .sort((a, b) => a.distance - b.distance || (b.strength || 0) - (a.strength || 0))[0];
}

export function buildAnalystGuidance(analysis = {}) {
  const bullishScore = num(analysis.bullishScore, 0);
  const bearishScore = num(analysis.bearishScore, 0);
  const scoreSpread = Math.abs(bullishScore - bearishScore);
  const trend = analysis.trend || "neutral";
  const rsi = num(analysis.rsi);
  const divergence = analysis.divergence || null;
  const patterns = Array.isArray(analysis.patterns) ? analysis.patterns : [];
  const zones = Array.isArray(analysis.zones) ? analysis.zones : [];
  const lastClose = num(analysis.lastClose, num(analysis.currentPrice, 0));

  const topPattern = patterns[0]?.name?.toLowerCase?.() || "";
  const compression = /(compression|range|triangle|wedge)/.test(topPattern);
  const mixedPressure = scoreSpread < 12;
  const breakoutWatch = compression && scoreSpread < 18;
  const reversalRisk = Boolean(divergence && divergence.strength >= 60);

  const nearestResistance = findNearest(zones, "resistance", lastClose);
  const nearestSupport = findNearest(zones, "support", lastClose);
  const resistancePrice = fmtPrice(nearestResistance?.price);
  const supportPrice = fmtPrice(nearestSupport?.price);

  const dangerZone = [];
  if (resistancePrice) dangerZone.push(`longs below ${resistancePrice}`);
  if (supportPrice) dangerZone.push(`shorts above ${supportPrice}`);
  dangerZone.push("mid-range entries without confirmation");

  let setupType = "neutral compression";
  if (trend === "bullish" && !compression) setupType = "bullish continuation";
  if (trend === "bearish" && !compression) setupType = "bearish continuation";
  if (breakoutWatch) setupType = "breakout setup";
  if (reversalRisk && !breakoutWatch) setupType = "reversal risk";

  let tradePosture = "WARN";
  if (breakoutWatch || mixedPressure) tradePosture = "REQUIRES_MANUAL_CONFIRMATION";
  if (trend === "bullish" && scoreSpread >= 16 && !reversalRisk && !compression) tradePosture = "ALLOW";
  if (trend === "bearish" && scoreSpread >= 16 && !reversalRisk && !compression) tradePosture = "ALLOW";

  const blocksEntry = (trend === "bullish" && resistancePrice && lastClose >= num(nearestResistance?.price, Infinity) * 0.998)
    || (trend === "bearish" && supportPrice && lastClose <= num(nearestSupport?.price, 0) * 1.002);
  if (blocksEntry) tradePosture = "BLOCK";

  const optimalEntryZone = [];
  let recommendedAction = "Wait for cleaner confirmation before enabling entries.";

  if (trend === "bullish") {
    if (supportPrice) optimalEntryZone.push(`pullback reaction near ${supportPrice}`);
    if (resistancePrice) optimalEntryZone.push(`breakout and hold above ${resistancePrice}`);
    recommendedAction = resistancePrice
      ? `Allow long only on hold above ${resistancePrice} or confirmed bounce at ${supportPrice || "support"}.`
      : "Favor long continuation on pullbacks with momentum confirmation.";
  } else if (trend === "bearish") {
    if (resistancePrice) optimalEntryZone.push(`rejection near ${resistancePrice}`);
    if (supportPrice) optimalEntryZone.push(`breakdown and hold below ${supportPrice}`);
    recommendedAction = supportPrice
      ? `Favor short continuation below ${supportPrice}; use resistance rejection as secondary entry.`
      : "Favor short continuation while momentum remains aligned.";
  } else {
    if (supportPrice) optimalEntryZone.push(`support reaction at ${supportPrice}`);
    if (resistancePrice) optimalEntryZone.push(`resistance break at ${resistancePrice}`);
  }

  if (tradePosture === "BLOCK") {
    recommendedAction = trend === "bullish"
      ? `Block long entries near ${resistancePrice || "resistance"}; wait for clean breakout close.`
      : `Block short entries near ${supportPrice || "support"}; wait for clear breakdown close.`;
  }

  const why = [];
  if (resistancePrice) why.push("resistance nearby");
  if (supportPrice) why.push("support holding");
  if (compression) why.push("compression active");
  if (mixedPressure) why.push("score mixed");
  if (analysis.volatilityState === "low") why.push("momentum weak");
  if (analysis.volatilityState === "high") why.push("momentum active");
  if (reversalRisk) why.push("divergence detected");
  if (scoreSpread >= 16) why.push("trend aligned");
  if (Number.isFinite(rsi) && (rsi > 70 || rsi < 30)) why.push("RSI extreme");

  const contextLabel = classifyContext({ trend, mixedPressure, compression, breakoutWatch, reversalRisk });

  const narrativeLines = [];
  if (trend === "bullish") narrativeLines.push(`Bullish bias ${resistancePrice ? `with resistance at ${resistancePrice}` : "is in control"}.`);
  else if (trend === "bearish") narrativeLines.push(`Bearish pressure ${supportPrice ? `into support ${supportPrice}` : "is in control"}.`);
  else narrativeLines.push("Neutral tape; directional edge is not confirmed.");

  if (compression) narrativeLines.push("Structure is compressed; treat this as a breakout watch.");
  if (tradePosture === "ALLOW") narrativeLines.push(`Setup is actionable: ${recommendedAction}`);
  else if (tradePosture === "BLOCK") narrativeLines.push(`Entry quality is poor here. ${recommendedAction}`);
  else narrativeLines.push(`Require confirmation first. ${recommendedAction}`);

  if (supportPrice || resistancePrice) {
    narrativeLines.push(`Key levels: support ${supportPrice || "n/a"} / resistance ${resistancePrice || "n/a"}.`);
  }

  return {
    contextLabel,
    setupType,
    tradePosture,
    optimalEntryZone: optimalEntryZone.slice(0, 3),
    dangerZone: [...new Set(dangerZone)].slice(0, 3),
    recommendedAction,
    why: [...new Set(why)].slice(0, 6),
    narrative: narrativeLines.slice(0, 4).join("\n"),
  };
}
