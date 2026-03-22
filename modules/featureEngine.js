import { calculateEMA, calculateRSI } from "./indicators.js";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calcAtr(candles = [], period = 14) {
  const rows = Array.isArray(candles) ? candles : [];
  return rows.map((candle, index) => {
    if (index === 0) return null;
    const prev = rows[index - 1] || {};
    const tr = Math.max(
      toNumber(candle.high, 0) - toNumber(candle.low, 0),
      Math.abs(toNumber(candle.high, 0) - toNumber(prev.close, 0)),
      Math.abs(toNumber(candle.low, 0) - toNumber(prev.close, 0)),
    );
    const start = Math.max(1, index - period + 1);
    let sum = 0;
    let count = 0;
    for (let i = start; i <= index; i += 1) {
      const curr = rows[i] || {};
      const prevRow = rows[i - 1] || {};
      const rowTr = Math.max(
        toNumber(curr.high, 0) - toNumber(curr.low, 0),
        Math.abs(toNumber(curr.high, 0) - toNumber(prevRow.close, 0)),
        Math.abs(toNumber(curr.low, 0) - toNumber(prevRow.close, 0)),
      );
      if (!Number.isFinite(rowTr)) continue;
      sum += rowTr;
      count += 1;
    }
    return count ? (sum / count) : tr;
  });
}

function average(values = []) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

export function computeFeatureSnapshot(candles = [], index = null, options = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  if (!rows.length) {
    return {
      rsi: 50,
      emaFast: 0,
      emaSlow: 0,
      atr: 0,
      momentum: 0,
      emaSlope: 0,
      volatilityState: "normal",
      compression: false,
      expansion: false,
    };
  }

  const target = Number.isInteger(index) ? Math.max(0, Math.min(index, rows.length - 1)) : rows.length - 1;
  const fastPeriod = Math.max(2, Number(options.fastPeriod || 9));
  const slowPeriod = Math.max(fastPeriod + 1, Number(options.slowPeriod || 21));
  const rsiPeriod = Math.max(2, Number(options.rsiPeriod || 14));
  const atrPeriod = Math.max(2, Number(options.atrPeriod || 14));
  const momentumLookback = Math.max(1, Number(options.momentumLookback || 5));
  const slopeLookback = Math.max(1, Number(options.slopeLookback || 3));

  const emaFastSeries = calculateEMA(rows, fastPeriod, "close");
  const emaSlowSeries = calculateEMA(rows, slowPeriod, "close");
  const rsiSeries = calculateRSI(rows, rsiPeriod, "close");
  const atrSeries = calcAtr(rows, atrPeriod);

  const closeNow = toNumber(rows[target]?.close, 0);
  const closePrev = toNumber(rows[Math.max(0, target - momentumLookback)]?.close, closeNow);
  const emaFast = toNumber(emaFastSeries[target], closeNow);
  const emaSlow = toNumber(emaSlowSeries[target], closeNow);
  const emaPrev = toNumber(emaFastSeries[Math.max(0, target - slopeLookback)], emaFast);
  const atr = Math.max(0, toNumber(atrSeries[target], 0));

  const atrWindow = atrSeries.slice(Math.max(0, target - 24), target + 1).map((v) => toNumber(v, 0));
  const atrAvg = average(atrWindow);
  const atrRatio = atrAvg > 0 ? atr / atrAvg : 1;
  const volatilityState = atrRatio >= 1.3 ? "high" : atrRatio <= 0.75 ? "low" : "normal";
  const compression = volatilityState === "low" || atrRatio <= 0.7;
  const expansion = volatilityState === "high" || atrRatio >= 1.35;

  return {
    rsi: toNumber(rsiSeries[target], 50),
    emaFast,
    emaSlow,
    atr,
    momentum: closeNow - closePrev,
    emaSlope: emaFast - emaPrev,
    volatilityState,
    compression,
    expansion,
  };
}

export function buildFeatureSeries(candles = [], options = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  return rows.map((_, index) => computeFeatureSnapshot(rows, index, options));
}
