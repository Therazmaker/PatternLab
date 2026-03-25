function toPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function averageRange(candles = [], lookback = 12) {
  const ranges = candles
    .slice(-lookback)
    .map((candle) => Number(candle?.high) - Number(candle?.low))
    .filter((range) => Number.isFinite(range) && range > 0);
  if (!ranges.length) return null;
  return ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
}

export function buildSimplePaperTrade({
  direction = "long",
  candles = [],
  symbol = "BTCUSDT",
  setup = "library_setup",
  decisionSnapshot = {},
  libraryContextSnapshot = {},
  source = "library_trader",
  originTab = "microbot_1m",
} = {}) {
  const last = candles[candles.length - 1] || {};
  const entry = toPrice(last.close) || toPrice(last.open);
  if (!entry) return null;

  const range = averageRange(candles, 15);
  const safeFallback = Math.max(entry * 0.0015, 0.1);
  const baseDistance = Math.max(Number(range) || safeFallback, safeFallback);
  const slDistance = baseDistance;
  const tpDistance = baseDistance * 2;

  const normalizedDirection = String(direction || "long").toLowerCase() === "short" ? "short" : "long";
  const stopLoss = normalizedDirection === "long" ? entry - slDistance : entry + slDistance;
  const takeProfit = normalizedDirection === "long" ? entry + tpDistance : entry - tpDistance;

  if (![entry, stopLoss, takeProfit].every((price) => Number.isFinite(price) && price > 0)) return null;
  if (normalizedDirection === "long" && !(stopLoss < entry && entry < takeProfit)) return null;
  if (normalizedDirection === "short" && !(takeProfit < entry && entry < stopLoss)) return null;

  return {
    id: `mb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    mode: "paper",
    status: "planned",
    direction: normalizedDirection,
    symbol,
    timeframe: "1m",
    entry: Number(entry.toFixed(4)),
    stopLoss: Number(stopLoss.toFixed(4)),
    takeProfit: Number(takeProfit.toFixed(4)),
    riskReward: 2,
    source,
    originTab,
    setup,
    decisionSnapshot,
    libraryContextSnapshot,
    notes: `Simple range-based trade builder (${normalizedDirection})`,
    createdAt: new Date().toISOString(),
  };
}
