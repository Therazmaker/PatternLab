/**
 * modules/indicators.js
 * Lightweight indicator helpers designed for deterministic, PineScript-friendly research.
 */

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readSource(candle, sourceKey) {
  return asNumber(candle?.[sourceKey]);
}

/**
 * EMA aligned to candle index.
 * Null values are returned while the seed window is incomplete.
 */
export function calculateEMA(candles, period, sourceKey = "close") {
  const rows = Array.isArray(candles) ? candles : [];
  const length = Math.max(1, Number(period) || 1);
  const out = new Array(rows.length).fill(null);
  if (!rows.length) return out;

  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const value = readSource(rows[i], sourceKey);
    if (value === null) continue;
    seedSum += value;
    seedCount += 1;
    if (seedCount === length) {
      out[i] = seedSum / length;
      break;
    }
  }

  const seedIndex = out.findIndex((value) => value !== null);
  if (seedIndex < 0) return out;

  const multiplier = 2 / (length + 1);
  for (let i = seedIndex + 1; i < rows.length; i += 1) {
    const value = readSource(rows[i], sourceKey);
    const prev = out[i - 1];
    if (value === null || prev === null) {
      out[i] = prev;
      continue;
    }
    out[i] = (value - prev) * multiplier + prev;
  }

  return out;
}

/**
 * RSI aligned to candle index.
 * Null values are returned while insufficient history exists.
 */
export function calculateRSI(candles, period = 14, sourceKey = "close") {
  const rows = Array.isArray(candles) ? candles : [];
  const length = Math.max(1, Number(period) || 14);
  const out = new Array(rows.length).fill(null);
  if (rows.length <= length) return out;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i += 1) {
    const current = readSource(rows[i], sourceKey);
    const prev = readSource(rows[i - 1], sourceKey);
    if (current === null || prev === null) continue;
    const delta = current - prev;
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;
  out[length] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = length + 1; i < rows.length; i += 1) {
    const current = readSource(rows[i], sourceKey);
    const prev = readSource(rows[i - 1], sourceKey);
    if (current === null || prev === null) {
      out[i] = out[i - 1];
      continue;
    }
    const delta = current - prev;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    avgGain = ((avgGain * (length - 1)) + gain) / length;
    avgLoss = ((avgLoss * (length - 1)) + loss) / length;

    if (avgLoss === 0) out[i] = 100;
    else {
      const rs = avgGain / avgLoss;
      out[i] = 100 - (100 / (1 + rs));
    }
  }

  return out;
}
