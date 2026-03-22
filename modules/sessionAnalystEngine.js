import { detectPatterns } from "./patternDetector.js";
import { detectRsiDivergence, computeRsi } from "./rsiDivergenceDetector.js";
import { detectSrZones } from "./srZoneDetector.js";

function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function ema(values = [], period = 9) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  values.forEach((value, index) => {
    const n = num(value);
    if (n === null) return;
    prev = prev === null ? n : (n * k) + (prev * (1 - k));
    out[index] = prev;
  });
  return out;
}

function calcAtr(candles = [], period = 14) {
  if (candles.length < 2) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const high = num(candles[i].high, 0);
    const low = num(candles[i].low, 0);
    const prevClose = num(candles[i - 1].close, high);
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const scope = trs.slice(-period);
  return scope.reduce((a, b) => a + b, 0) / Math.max(scope.length, 1);
}

function detectStructure(candles = []) {
  if (candles.length < 4) return { bullish: 50, bearish: 50 };
  const highs = candles.map((c) => num(c.high, NaN));
  const lows = candles.map((c) => num(c.low, NaN));
  const recentHighs = highs.slice(-4);
  const recentLows = lows.slice(-4);
  const up = Number(recentHighs[3] > recentHighs[2]) + Number(recentLows[3] > recentLows[2]) + Number(recentHighs[2] > recentHighs[1]);
  const down = Number(recentHighs[3] < recentHighs[2]) + Number(recentLows[3] < recentLows[2]) + Number(recentLows[2] < recentLows[1]);
  return { bullish: clamp(up * 24, 0, 100), bearish: clamp(down * 24, 0, 100) };
}

function buildNarrative({ trend, rsi, zones, patterns, divergence }) {
  const parts = [];
  parts.push(`Trend is **${trend}** with RSI at **${Number.isFinite(rsi) ? rsi.toFixed(1) : "-"}**.`);
  if (patterns[0]) parts.push(`Primary pattern: **${patterns[0].name}** (strength ${Math.round(patterns[0].strength)}).`);
  if (zones[0]) parts.push(`Nearest ${zones[0].type} near **${zones[0].price}** with ${zones[0].touches} touches.`);
  if (divergence) parts.push(`RSI divergence: **${divergence.type}** (${divergence.strength}/100) → tighten risk.`);
  else parts.push("No strong divergence; use zone reactions for confirmation before execution.");
  return parts.slice(0, 5).join("\n");
}

export function analyzeSessionCandles(candles = [], context = {}) {
  const rows = (Array.isArray(candles) ? candles : []).filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(Number(v))));
  if (rows.length < 3) {
    return {
      trend: "neutral",
      bullishScore: 0,
      bearishScore: 0,
      rsi: null,
      atr: null,
      volatilityState: "low",
      policyMode: context.policyMode || "manual_session",
      patterns: [],
      divergence: null,
      zones: [],
      narrative: "Need at least 3 candles to activate analyst.",
    };
  }

  const closes = rows.map((c) => num(c.close, 0));
  const emaFast = ema(closes, 9);
  const emaSlow = ema(closes, 21);
  const fastNow = emaFast[emaFast.length - 1] ?? closes[closes.length - 1];
  const fastPrev = emaFast[Math.max(0, emaFast.length - 4)] ?? fastNow;
  const slowNow = emaSlow[emaSlow.length - 1] ?? closes[closes.length - 1];
  const lastClose = closes[closes.length - 1];

  const emaSlope = (fastNow - fastPrev) / Math.max(Math.abs(lastClose), 1e-9);
  const momentum = (closes[closes.length - 1] - closes[Math.max(0, closes.length - 4)]) / Math.max(Math.abs(lastClose), 1e-9);
  const structure = detectStructure(rows);

  const atr = calcAtr(rows, 14);
  const atrPct = Number.isFinite(atr) ? (atr / Math.max(Math.abs(lastClose), 1e-9)) * 100 : 0;
  const volatilityState = atrPct < 0.18 ? "low" : atrPct < 0.55 ? "medium" : "high";
  const volatilityBullBoost = volatilityState === "medium" ? 8 : volatilityState === "low" ? 4 : 2;

  let bullishScore = 50;
  let bearishScore = 50;
  bullishScore += clamp(emaSlope * 1600, -24, 24);
  bearishScore -= clamp(emaSlope * 1600, -24, 24);
  bullishScore += clamp(momentum * 1300, -22, 22);
  bearishScore -= clamp(momentum * 1300, -22, 22);
  bullishScore += structure.bullish * 0.35;
  bearishScore += structure.bearish * 0.35;
  bullishScore += volatilityBullBoost;
  bearishScore += volatilityState === "high" ? 10 : 5;

  const rsi = computeRsi(rows, 14);
  if (Number.isFinite(rsi)) {
    bullishScore += clamp((rsi - 50) * 0.6, -14, 16);
    bearishScore += clamp((50 - rsi) * 0.6, -14, 16);
  }

  bullishScore = clamp(bullishScore, 0, 100);
  bearishScore = clamp(bearishScore, 0, 100);

  const trend = bullishScore > bearishScore + 8 ? "bullish" : bearishScore > bullishScore + 8 ? "bearish" : "neutral";

  const patterns = detectPatterns(rows);
  const divergence = detectRsiDivergence(rows, 24);
  const zones = detectSrZones(rows, { minTouches: 2 });
  const narrative = buildNarrative({ trend, rsi, zones, patterns, divergence });

  return {
    trend,
    bullishScore: Number(bullishScore.toFixed(1)),
    bearishScore: Number(bearishScore.toFixed(1)),
    globalScore: Math.round(Math.max(bullishScore, bearishScore)),
    rsi: Number.isFinite(rsi) ? Number(rsi.toFixed(2)) : null,
    atr: Number.isFinite(atr) ? Number(atr.toFixed(6)) : null,
    volatilityState,
    policyMode: context.policyMode || "manual_session",
    patterns,
    divergence,
    zones,
    narrative,
  };
}
