import { calculateRSI } from "./indicators.js";
import { computeStructureFeatures } from "./structureFilter.js";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sma(values, index, period) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) sum += num(values[i], 0);
  return sum / period;
}

function atr(candles, index, period = 14) {
  if (index < 1) return null;
  const start = Math.max(1, index - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= index; i += 1) {
    const c = candles[i] || {};
    const prev = candles[i - 1] || {};
    const tr = Math.max(
      num(c.high, 0) - num(c.low, 0),
      Math.abs(num(c.high, 0) - num(prev.close, 0)),
      Math.abs(num(c.low, 0) - num(prev.close, 0)),
    );
    if (!Number.isFinite(tr)) continue;
    sum += tr;
    count += 1;
  }
  return count ? sum / count : null;
}

function buildNeuronIndex(neuronActivations = []) {
  const byIndex = new Map();
  (Array.isArray(neuronActivations) ? neuronActivations : []).forEach((row) => {
    if (!row?.active || !Number.isInteger(row.index)) return;
    if (!byIndex.has(row.index)) byIndex.set(row.index, []);
    byIndex.get(row.index).push(row.neuronId);
  });
  return byIndex;
}

/**
 * Builds per-candle strategy features.
 * Reuses PatternLab context maps when available; only computes missing indicator primitives locally.
 */
export function buildStrategyFeatures(candles = [], context = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  const closes = rows.map((c) => num(c.close, 0));
  const volumes = rows.map((c) => num(c.volume, 0));
  const rsi14 = calculateRSI(rows, 14);
  const neuronByIndex = buildNeuronIndex(context.neuronActivations);
  const contextByTs = context.signalContextByTimestamp || new Map();
  const supportResistanceByTs = context.supportResistanceByTimestamp || new Map();
  const seededMatchesByIndex = context.seededMatchesByIndex || new Map();

  return rows.map((candle, index) => {
    const sma20 = sma(closes, index, 20);
    const sma50 = sma(closes, index, 50);
    const prevSma20 = sma(closes, index - 1, 20);
    const trendSlope = Number.isFinite(sma20) && Number.isFinite(prevSma20) ? sma20 - prevSma20 : 0;
    const atr14 = atr(rows, index, 14);
    const activeNeurons = neuronByIndex.get(index) || [];
    const neuronBias = activeNeurons.length
      ? activeNeurons.reduce((acc, id) => {
        const key = String(id || "").toLowerCase();
        if (key.includes("bull") || key.includes("support") || key.includes("push_up")) return acc + 1;
        if (key.includes("bear") || key.includes("resistance") || key.includes("push_down")) return acc - 1;
        return acc;
      }, 0) / activeNeurons.length
      : 0;

    const contextSignal = contextByTs.get(candle.timestamp) || {};
    const sr = supportResistanceByTs.get(candle.timestamp) || {};
    const structure = computeStructureFeatures({ candles: rows, candleIndex: index, action: neuronBias >= 0 ? "LONG" : "SHORT", entryPrice: num(candle.close, 0) });

    return {
      index,
      timestamp: candle.timestamp,
      open: num(candle.open, 0),
      high: num(candle.high, 0),
      low: num(candle.low, 0),
      close: num(candle.close, 0),
      volume: num(candle.volume, 0),
      rsi14: num(rsi14[index], 50),
      sma20: num(sma20, num(candle.close, 0)),
      sma50: num(sma50, num(candle.close, 0)),
      atr14: num(atr14, 0),
      smaSlope: trendSlope,
      trendSlope,
      avgVolume20: num(sma(volumes, index, 20), num(candle.volume, 0)),
      avgRange20: num(sma(rows.map((r) => num(r.high, 0) - num(r.low, 0)), index, 20), 0),
      activeNeurons,
      neuronCount: activeNeurons.length,
      neuronBias,
      contextScore: num(contextSignal.contextScore, 50),
      radarScore: num(contextSignal.radarScore, 50),
      marketRegime: contextSignal.marketRegime || "unclear",
      nearSupport: Boolean(sr.nearSupport || contextSignal?.srContext?.nearSupport),
      nearResistance: Boolean(sr.nearResistance || contextSignal?.srContext?.nearResistance),
      seededComboMatches: seededMatchesByIndex.get(index) || [],
      structure,
    };
  });
}
