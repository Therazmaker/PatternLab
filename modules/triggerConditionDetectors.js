function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCandles(candles = []) {
  return (Array.isArray(candles) ? candles : []).map((row) => ({
    open: asNumber(row.open, 0),
    high: asNumber(row.high, 0),
    low: asNumber(row.low, 0),
    close: asNumber(row.close, 0),
    timestamp: row.timestamp || null,
  }));
}

function getTail(candles = [], size = 3) {
  const rows = normalizeCandles(candles);
  return rows.slice(Math.max(0, rows.length - size));
}

export function detectBreakAbove(level, candles = [], mode = "immediate") {
  const rows = getTail(candles, mode === "follow_through" ? 3 : 2);
  if (!rows.length) return false;
  const last = rows[rows.length - 1];
  if (mode === "immediate") return last.high > level || last.close > level;
  if (mode === "candle_close") return last.close > level;
  const prev = rows[rows.length - 2];
  return Boolean(prev && prev.close > level && last.close > level && last.close >= prev.close);
}

export function detectBreakBelow(level, candles = [], mode = "immediate") {
  const rows = getTail(candles, mode === "follow_through" ? 3 : 2);
  if (!rows.length) return false;
  const last = rows[rows.length - 1];
  if (mode === "immediate") return last.low < level || last.close < level;
  if (mode === "candle_close") return last.close < level;
  const prev = rows[rows.length - 2];
  return Boolean(prev && prev.close < level && last.close < level && last.close <= prev.close);
}

export function detectFailedBreak(level, candles = [], mode = "candle_close") {
  const rows = getTail(candles, mode === "follow_through" ? 4 : 3);
  if (rows.length < 2) return false;
  const recent = rows.slice(-2);
  const testedAbove = rows.some((row) => row.high > level);
  const closedBackBelow = recent.every((row) => row.close < level);
  if (!testedAbove || !closedBackBelow) return false;
  if (mode === "immediate") return true;
  if (mode === "candle_close") return recent[recent.length - 1].close < level;
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  return last.close < level && prev.close < level && last.close <= prev.close;
}

export function detectRejectionAtLevel(level, candles = []) {
  const rows = getTail(candles, 3);
  if (!rows.length) return false;
  const last = rows[rows.length - 1];
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const touched = Math.abs(last.high - level) <= Math.max(Math.abs(level) * 0.0005, 0.5)
    || Math.abs(last.low - level) <= Math.max(Math.abs(level) * 0.0005, 0.5)
    || (last.low <= level && last.high >= level);
  return touched && (upperWick > body * 1.2 || lowerWick > body * 1.2);
}

export function detectStaysBelow(level, candles = [], lookback = 3) {
  const rows = getTail(candles, lookback);
  if (!rows.length) return false;
  return rows.every((row) => row.close < level);
}

export function detectStaysAbove(level, candles = [], lookback = 3) {
  const rows = getTail(candles, lookback);
  if (!rows.length) return false;
  return rows.every((row) => row.close > level);
}

export function detectWeakFollowThrough(level, candles = []) {
  const rows = getTail(candles, 3);
  if (rows.length < 2) return false;
  const [prev, last] = rows.slice(-2);
  const crossed = prev.close > level || last.close > level;
  return crossed && Math.abs(last.close - prev.close) <= Math.abs(level) * 0.0008;
}

export function detectStrongFollowThrough(level, candles = []) {
  const rows = getTail(candles, 3);
  if (rows.length < 2) return false;
  const [prev, last] = rows.slice(-2);
  const trendUp = prev.close > level && last.close > level && last.close > prev.close;
  const trendDown = prev.close < level && last.close < level && last.close < prev.close;
  return trendUp || trendDown;
}
