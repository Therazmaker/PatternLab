import { analyzeRecentStructure } from "./structureAnalyzer.js";

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function ema(values = [], period = 9) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function momentumState(candles = [], size = 3) {
  const rows = candles.slice(-size);
  if (rows.length < 2) return { bias: "flat", score: 0 };
  const delta = toNum(rows[rows.length - 1]?.close) - toNum(rows[0]?.close);
  const avgBody = rows.reduce((sum, row) => sum + Math.abs(toNum(row.close) - toNum(row.open)), 0) / rows.length;
  const signed = avgBody > 0 ? delta / avgBody : 0;
  if (signed > 0.6) return { bias: "bullish", score: Math.min(1, signed / 2) };
  if (signed < -0.6) return { bias: "bearish", score: Math.max(-1, signed / 2) };
  return { bias: "flat", score: 0 };
}

export function buildMarketContext(candles = [], opts = {}) {
  const emaPeriod = Number(opts.emaPeriod || 9);
  const closes = candles.map((row) => toNum(row?.close));
  const emaSeries = ema(closes, emaPeriod);
  const lastClose = closes[closes.length - 1] ?? 0;
  const lastEma = emaSeries[emaSeries.length - 1] ?? lastClose;
  const prevEma = emaSeries[emaSeries.length - 3] ?? lastEma;
  const emaSlope = lastEma - prevEma;
  const emaSlopeState = emaSlope > 0 ? "up" : emaSlope < 0 ? "down" : "flat";
  const priceVsEMA = lastClose >= lastEma ? "above" : "below";
  const structure = analyzeRecentStructure(candles, Number(opts.structureLookback || 6));
  const momentum = momentumState(candles, Number(opts.momentumLookback || 3));

  const trendBiasScore = Number((
    (emaSlopeState === "up" ? 0.4 : emaSlopeState === "down" ? -0.4 : 0)
    + (priceVsEMA === "above" ? 0.25 : -0.25)
    + (structure.structureState === "higher_highs_and_higher_lows" ? 0.3 : 0)
    + (structure.structureState === "lower_highs_and_lower_lows" ? -0.3 : 0)
    + (momentum.bias === "bullish" ? 0.15 : momentum.bias === "bearish" ? -0.15 : 0)
  ).toFixed(3));

  let contextState = "range";
  if (trendBiasScore >= 0.7) contextState = "strong_uptrend";
  else if (trendBiasScore >= 0.25) contextState = "weak_uptrend";
  else if (trendBiasScore <= -0.7) contextState = "strong_downtrend";
  else if (trendBiasScore <= -0.25) contextState = "weak_downtrend";

  const possibleReversal = (contextState.includes("uptrend") && structure.lowerLow && priceVsEMA === "below")
    || (contextState.includes("downtrend") && structure.higherHigh && priceVsEMA === "above");
  if (possibleReversal) contextState = "possible_reversal";

  return {
    contextState,
    trendBiasScore,
    ema: {
      period: emaPeriod,
      value: Number(lastEma.toFixed(6)),
      slope: Number(emaSlope.toFixed(6)),
      slopeState: emaSlopeState,
    },
    priceVsEMA,
    structure,
    momentum,
  };
}
