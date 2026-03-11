import { normalizeOHLCInput } from "./v3.js";

const COLORS = ["green", "red", "doji"];

export function makeSessionId() {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function deriveCandleColor(candle = {}) {
  const open = normalizeOHLCInput(candle.open);
  const close = normalizeOHLCInput(candle.close);
  if (open === null || close === null) return null;
  if (close > open) return "green";
  if (close < open) return "red";
  return "doji";
}

export function computeSessionStats(candles = []) {
  const stats = {
    totalCandles: candles.length,
    greenCandles: 0,
    redCandles: 0,
    dojiCandles: 0,
    highOfSession: null,
    lowOfSession: null,
  };
  candles.forEach((candle) => {
    const color = deriveCandleColor(candle) || candle.colorHint;
    if (color === "green") stats.greenCandles += 1;
    if (color === "red") stats.redCandles += 1;
    if (color === "doji") stats.dojiCandles += 1;
    const high = normalizeOHLCInput(candle.high);
    const low = normalizeOHLCInput(candle.low);
    if (high !== null) stats.highOfSession = stats.highOfSession === null ? high : Math.max(stats.highOfSession, high);
    if (low !== null) stats.lowOfSession = stats.lowOfSession === null ? low : Math.min(stats.lowOfSession, low);
  });
  return stats;
}

export function normalizeSession(raw = {}) {
  const candles = Array.isArray(raw.candles) ? raw.candles.map((candle, index) => ({
    index: Number.isInteger(candle.index) ? candle.index : index + 1,
    timeLabel: candle.timeLabel ? String(candle.timeLabel) : null,
    timestamp: candle.timestamp || null,
    open: normalizeOHLCInput(candle.open),
    high: normalizeOHLCInput(candle.high),
    low: normalizeOHLCInput(candle.low),
    close: normalizeOHLCInput(candle.close),
    colorHint: COLORS.includes(candle.colorHint) ? candle.colorHint : deriveCandleColor(candle),
  })) : [];
  return {
    id: raw.id ? String(raw.id) : makeSessionId(),
    date: raw.date ? String(raw.date) : new Date().toISOString().slice(0, 10),
    startedAt: raw.startedAt || new Date().toISOString(),
    endedAt: raw.endedAt || null,
    status: raw.status === "closed" ? "closed" : "active",
    asset: raw.asset ? String(raw.asset) : null,
    tf: raw.tf ? String(raw.tf) : null,
    notes: raw.notes ? String(raw.notes) : "",
    candles,
    stats: computeSessionStats(candles),
  };
}
