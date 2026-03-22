function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function candleStrength(candle) {
  const open = num(candle.open, 0);
  const close = num(candle.close, 0);
  const high = num(candle.high, Math.max(open, close));
  const low = num(candle.low, Math.min(open, close));
  const body = Math.abs(close - open);
  const range = Math.max(high - low, 1e-9);
  return clamp((body / range) * 100, 0, 100);
}

function detectEngulfing(prev, curr) {
  if (!prev || !curr) return [];
  const pOpen = num(prev.open, 0);
  const pClose = num(prev.close, 0);
  const cOpen = num(curr.open, 0);
  const cClose = num(curr.close, 0);
  const prevBear = pClose < pOpen;
  const prevBull = pClose > pOpen;
  const currBull = cClose > cOpen;
  const currBear = cClose < cOpen;
  const bodyRatio = (Math.abs(cClose - cOpen) / Math.max(Math.abs(pClose - pOpen), 1e-9));

  const out = [];
  if (prevBear && currBull && cOpen <= pClose && cClose >= pOpen) {
    out.push({ name: "bullish engulfing", type: "candle", strength: clamp(45 + (bodyRatio * 20), 0, 100) });
  }
  if (prevBull && currBear && cOpen >= pClose && cClose <= pOpen) {
    out.push({ name: "bearish engulfing", type: "candle", strength: clamp(45 + (bodyRatio * 20), 0, 100) });
  }
  return out;
}

function detectPinBar(candle) {
  if (!candle) return null;
  const open = num(candle.open, 0);
  const close = num(candle.close, 0);
  const high = num(candle.high, Math.max(open, close));
  const low = num(candle.low, Math.min(open, close));
  const body = Math.abs(close - open);
  const range = Math.max(high - low, 1e-9);
  const wickTop = high - Math.max(open, close);
  const wickBottom = Math.min(open, close) - low;
  const dominant = Math.max(wickTop, wickBottom);
  if (dominant < body * 1.6) return null;
  if ((dominant / range) < 0.45) return null;
  return { name: "pin bar", type: "candle", strength: clamp((dominant / range) * 100, 0, 100) };
}

export function detectPatterns(candles = []) {
  const rows = Array.isArray(candles) ? candles : [];
  if (rows.length < 3) return [];
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const prev2 = rows[rows.length - 3];

  const patterns = [];
  patterns.push(...detectEngulfing(prev, last));

  const pin = detectPinBar(last);
  if (pin) patterns.push(pin);

  const highBreak = num(last.close, 0) > num(prev.high, 0) && num(prev.close, 0) <= num(prev.high, 0);
  const lowBreak = num(last.close, 0) < num(prev.low, 0) && num(prev.close, 0) >= num(prev.low, 0);
  if (highBreak || lowBreak) {
    const base = highBreak ? (num(last.close, 0) - num(prev.high, 0)) : (num(prev.low, 0) - num(last.close, 0));
    const strength = clamp(40 + (base / Math.max(num(last.high, 0) - num(last.low, 0), 1e-9)) * 60, 0, 100);
    patterns.push({ name: "breakout", type: "structure", strength });
  }

  const r1 = Math.max(num(last.high, 0) - num(last.low, 0), 0);
  const r2 = Math.max(num(prev.high, 0) - num(prev.low, 0), 0);
  const r3 = Math.max(num(prev2.high, 0) - num(prev2.low, 0), 0);
  if (r1 < r2 && r2 < r3) {
    patterns.push({ name: "range compression", type: "structure", strength: clamp((1 - (r1 / Math.max(r3, 1e-9))) * 100, 0, 100) });
  }

  const upperRej = num(last.high, 0) - Math.max(num(last.open, 0), num(last.close, 0));
  const lowerRej = Math.min(num(last.open, 0), num(last.close, 0)) - num(last.low, 0);
  const range = Math.max(num(last.high, 0) - num(last.low, 0), 1e-9);
  if ((upperRej / range) > 0.45 || (lowerRej / range) > 0.45) {
    patterns.push({ name: "rejection", type: "structure", strength: clamp((Math.max(upperRej, lowerRej) / range) * 100, 0, 100) });
  }

  return patterns
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
}

export function formatPatternStrengthDots(strength = 0) {
  const filled = Math.max(0, Math.min(5, Math.round((Number(strength) || 0) / 20)));
  return `${"●".repeat(filled)}${"○".repeat(5 - filled)}`;
}
