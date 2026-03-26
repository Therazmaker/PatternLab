function toNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickSwingPoints(candles = [], lookback = 6) {
  const rows = candles.slice(-lookback);
  if (rows.length < 2) {
    return {
      latestHigh: toNum(rows[rows.length - 1]?.high, 0),
      prevHigh: toNum(rows[rows.length - 2]?.high, 0),
      latestLow: toNum(rows[rows.length - 1]?.low, 0),
      prevLow: toNum(rows[rows.length - 2]?.low, 0),
    };
  }

  const highs = rows.map((row) => toNum(row?.high, null)).filter((v) => v !== null);
  const lows = rows.map((row) => toNum(row?.low, null)).filter((v) => v !== null);
  return {
    latestHigh: highs[highs.length - 1] ?? 0,
    prevHigh: highs[highs.length - 2] ?? highs[0] ?? 0,
    latestLow: lows[lows.length - 1] ?? 0,
    prevLow: lows[lows.length - 2] ?? lows[0] ?? 0,
  };
}

export function analyzeRecentStructure(candles = [], lookback = 6) {
  const rows = candles.slice(-lookback);
  const { latestHigh, prevHigh, latestLow, prevLow } = pickSwingPoints(rows, lookback);

  const higherHigh = latestHigh > prevHigh;
  const higherLow = latestLow > prevLow;
  const lowerHigh = latestHigh < prevHigh;
  const lowerLow = latestLow < prevLow;

  let structureState = "mixed";
  if (higherHigh && higherLow) structureState = "higher_highs_and_higher_lows";
  else if (lowerHigh && lowerLow) structureState = "lower_highs_and_lower_lows";
  else if (lowerLow && !higherHigh) structureState = "possible_breakdown";
  else if (higherHigh && !lowerLow) structureState = "possible_breakout";

  return {
    structureState,
    higherHigh,
    higherLow,
    lowerHigh,
    lowerLow,
    latestHigh,
    latestLow,
    prevHigh,
    prevLow,
    structureBreakdown: lowerLow,
    structureBreakout: higherHigh,
  };
}
