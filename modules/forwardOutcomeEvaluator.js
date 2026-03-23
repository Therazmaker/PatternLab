// forwardOutcomeEvaluator.js
// Evaluates forward price behaviour after a blocked / no-trade copilot decision.

export const BLOCK_QUALITY = {
  EXCELLENT_BLOCK:     "excellent_block",
  GOOD_BLOCK:          "good_block",
  NEUTRAL_BLOCK:       "neutral_block",
  BAD_BLOCK:           "bad_block",
  MISSED_OPPORTUNITY:  "missed_opportunity",
  PENDING:             "pending",
};

/**
 * Measure the candle at position N (1-based) after the decision candle.
 * @param {number}   entryPrice
 * @param {object[]} futureCandles
 * @param {number}   n
 * @returns {{ close: number, high: number, low: number, changePct: number }|null}
 */
function measureForwardBar(entryPrice, futureCandles, n) {
  if (!futureCandles || futureCandles.length < n) return null;
  const c = futureCandles[n - 1];
  if (!c) return null;
  const close = Number(c.close);
  const high  = Number(c.high);
  const low   = Number(c.low);
  const changePct = entryPrice
    ? Math.round(((close - entryPrice) / entryPrice) * 10000) / 100
    : null;
  return { close, high, low, changePct };
}

/**
 * Compute MFE (Maximum Favourable Excursion) and MAE (Maximum Adverse Excursion)
 * over the first maxBars candles, relative to the blocked direction.
 * @param {number}   entryPrice
 * @param {object[]} futureCandles
 * @param {string}   blockedDirection  – "long" | "short"
 * @param {number}   maxBars
 * @returns {{ mfe: number|null, mae: number|null }}
 */
function computeMfeMae(entryPrice, futureCandles, blockedDirection, maxBars = 5) {
  if (!futureCandles || futureCandles.length === 0 || !entryPrice) {
    return { mfe: null, mae: null };
  }
  const slice = futureCandles.slice(0, maxBars);
  let maxHigh = -Infinity;
  let minLow  =  Infinity;
  for (const c of slice) {
    if (Number(c.high) > maxHigh) maxHigh = Number(c.high);
    if (Number(c.low)  < minLow)  minLow  = Number(c.low);
  }
  const upMove   = Math.round(((maxHigh - entryPrice) / entryPrice) * 10000) / 100;
  const downMove = Math.round(((entryPrice - minLow)  / entryPrice) * 10000) / 100;

  if (blockedDirection === "short") {
    // For a short: favourable = down, adverse = up
    return { mfe: downMove, mae: upMove };
  }
  // For a long: favourable = up, adverse = down
  return { mfe: upMove, mae: downMove };
}

/**
 * Classify block quality for a blocked / no-trade decision.
 * @param {string} action      – decision_action from the trace
 * @param {string} posture     – trade_posture from the trace
 * @param {object} forwardData – { bars_5, mfe, mae }
 * @returns {string}
 */
function classifyBlockQuality(action, posture, forwardData) {
  const isBlock = action === "blocked" || action === "no_trade";
  if (!isBlock) return "neutral_block";

  const bar5 = forwardData.bars_5;
  if (bar5 === null) return "pending";

  const chg = bar5.changePct ?? null;
  if (chg === null) return "pending";

  if (posture === "bearish") {
    // We blocked a short; block was good if price went UP (setup would have failed)
    if (chg > 3)           return "excellent_block";
    if (chg > 1.5)         return "good_block";
    if (chg < -3)          return "missed_opportunity";
    if (chg < -1.5)        return "bad_block";
    return "neutral_block";
  }

  if (posture === "bullish") {
    // We blocked a long; block was good if price went DOWN (setup would have failed)
    if (chg < -3)          return "excellent_block";
    if (chg < -1.5)        return "good_block";
    if (chg > 3)           return "missed_opportunity";
    if (chg > 1.5)         return "bad_block";
    return "neutral_block";
  }

  return "neutral_block";
}

/**
 * Update a decision trace with forward outcome data.
 * The function is pure — it returns a new trace object (or the same reference if
 * nothing changed).
 *
 * @param {object}   trace      – decision_trace_v1 object
 * @param {object[]} allCandles – full chronological candle array
 * @returns {object} updated trace (new reference when changed)
 */
export function evaluateForwardOutcome(trace, allCandles = []) {
  if (!trace || !trace.candle_time) return trace;

  // Locate the trace candle in allCandles
  const idx = allCandles.findIndex((c) => {
    const ct = c.time ?? c.openTime ?? c.closeTime ?? "";
    return ct === trace.candle_time;
  });
  if (idx === -1) return trace;

  const futureCandles = allCandles.slice(idx + 1);
  if (futureCandles.length === 0) return trace;

  const entryPrice = Number(allCandles[idx]?.close || 0);
  const action     = trace.decision?.action  || "wait";
  const posture    = trace.decision?.posture || "neutral";
  const direction  = posture === "bearish" ? "short" : "long";
  const available  = futureCandles.length;

  const bars1 = measureForwardBar(entryPrice, futureCandles, 1);
  const bars2 = measureForwardBar(entryPrice, futureCandles, 2);
  const bars3 = measureForwardBar(entryPrice, futureCandles, 3);
  const bars5 = measureForwardBar(entryPrice, futureCandles, 5);
  const { mfe, mae } = computeMfeMae(entryPrice, futureCandles, direction);

  const forwardData = {
    bars_1: available >= 1 ? bars1 : null,
    bars_2: available >= 2 ? bars2 : null,
    bars_3: available >= 3 ? bars3 : null,
    bars_5: available >= 5 ? bars5 : null,
    mfe,
    mae,
  };

  const blockQuality = available >= 5
    ? classifyBlockQuality(action, posture, forwardData)
    : "pending";

  return {
    ...trace,
    forward_eval: { ...forwardData, block_quality: blockQuality },
  };
}
