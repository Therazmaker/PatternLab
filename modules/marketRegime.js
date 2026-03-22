function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function classifyMarketRegime(feature = {}) {
  const emaFast = Number(feature.emaFast || 0);
  const emaSlow = Number(feature.emaSlow || 0);
  const slope = Number(feature.emaSlope || 0);
  const atr = Math.max(0, Number(feature.atr || 0));

  let regime = "ranging";
  let strength = 40;
  let explanation = "Market is balanced with no dominant directional pressure.";

  if (emaFast > emaSlow && slope > 0) {
    regime = "trending_up";
    const spread = Math.abs(emaFast - emaSlow);
    strength = clamp(55 + (spread * 12) + Math.min(20, slope * 200));
    explanation = "Trending up because fast EMA is above slow EMA and slope is positive.";
  } else if (emaFast < emaSlow && slope < 0) {
    regime = "trending_down";
    const spread = Math.abs(emaFast - emaSlow);
    strength = clamp(55 + (spread * 12) + Math.min(20, Math.abs(slope) * 200));
    explanation = "Trending down because fast EMA is below slow EMA and slope is negative.";
  } else if (feature.compression && feature.volatilityState === "low") {
    regime = "ranging";
    strength = clamp(60 + (feature.compression ? 15 : 0) + (atr <= 0 ? 0 : Math.min(10, 2 / atr)));
    explanation = "Ranging because volatility is compressed and ATR is relatively low.";
  }

  if (feature.expansion && feature.volatilityState === "high") {
    regime = "volatile";
    strength = clamp(65 + (feature.expansion ? 20 : 0) + Math.min(15, atr * 20));
    explanation = "Volatile because ATR is elevated and range expansion is active.";
  }

  return { regime, strength, explanation };
}
