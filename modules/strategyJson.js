const STRATEGY_ACTIONS = { NO_TRADE: "NO_TRADE", LONG: "LONG", SHORT: "SHORT" };

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function windowFromSeries(series = [], index = 0, period = 1) {
  const safePeriod = Math.max(1, Number(period) || 1);
  const start = Math.max(0, index - safePeriod + 1);
  return series.slice(start, index + 1).map((row) => Number(row)).filter((row) => Number.isFinite(row));
}

function sma(series = [], index = 0, period = 1) {
  const values = windowFromSeries(series, index, period);
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function highest(series = [], index = 0, period = 1) {
  const values = windowFromSeries(series, index, period);
  return values.length ? Math.max(...values) : null;
}

function lowest(series = [], index = 0, period = 1) {
  const values = windowFromSeries(series, index, period);
  return values.length ? Math.min(...values) : null;
}

function normalizeCondition(condition) {
  const raw = String(condition || "").trim();
  const match = raw.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*(>=|<=|>|<|==|!=)\s*([a-zA-Z][a-zA-Z0-9]*|-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { left: match[1], op: match[2], right: match[3], raw };
}

function tokenValue(token, { candles = [], features = [], feature = {}, candleIndex = 0 }) {
  const lower = String(token || "").toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(lower)) return Number(lower);
  const candle = candles[candleIndex] || {};
  const closes = candles.map((row) => toNumber(row.close, 0));
  const highs = candles.map((row) => toNumber(row.high, 0));
  const lows = candles.map((row) => toNumber(row.low, 0));
  const atrSeries = features.map((row) => toNumber(row.atr14, 0));
  if (["open", "high", "low", "close", "volume"].includes(lower)) return toNumber(candle[lower], toNumber(feature[lower], 0));
  if (lower === "contextscore") return toNumber(feature.contextScore, 0);
  if (lower === "radarscore") return toNumber(feature.radarScore, 0);
  if (lower === "rsi14") return toNumber(feature.rsi14, 50);
  if (lower === "atr14") return toNumber(feature.atr14, 0);
  const smaMatch = lower.match(/^sma(\d+)$/);
  if (smaMatch) return toNumber(sma(closes, candleIndex, Number(smaMatch[1])), 0);
  const slopeMatch = lower.match(/^slope(\d+)$/);
  if (slopeMatch) {
    const period = Math.max(1, Number(slopeMatch[1]));
    const prevIndex = Math.max(0, candleIndex - period);
    return toNumber(closes[candleIndex], 0) - toNumber(closes[prevIndex], 0);
  }
  const highMatch = lower.match(/^highesthigh(\d+)$/);
  if (highMatch) return toNumber(highest(highs, candleIndex, Number(highMatch[1])), 0);
  const lowMatch = lower.match(/^lowestlow(\d+)$/);
  if (lowMatch) return toNumber(lowest(lows, candleIndex, Number(lowMatch[1])), 0);
  const atrSmaMatch = lower.match(/^atrsma(\d+)$/);
  if (atrSmaMatch) return toNumber(sma(atrSeries, candleIndex, Number(atrSmaMatch[1])), 0);
  return null;
}

function compare(left, op, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (op === ">") return left > right;
  if (op === "<") return left < right;
  if (op === ">=") return left >= right;
  if (op === "<=") return left <= right;
  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  return false;
}

export function evaluateJsonCondition(condition, context = {}) {
  const parsed = normalizeCondition(condition);
  if (!parsed) return { ok: false, reason: `Invalid condition syntax: ${String(condition || "")}` };
  const left = tokenValue(parsed.left, context);
  const right = tokenValue(parsed.right, context);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { ok: false, reason: `Unsupported token in condition: ${parsed.raw}` };
  return { ok: compare(left, parsed.op, right), reason: parsed.raw };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map((row) => String(row || "").trim()).filter(Boolean) : [];
}

export function validateRuleBasedStrategyDefinition(input = {}) {
  const errors = [];
  const strategyId = String(input.strategyId || "").trim();
  const name = String(input.name || strategyId || "Custom JSON Strategy").trim();
  const type = String(input.type || "rule-based").trim();
  if (!strategyId) errors.push("strategyId is required.");
  if (type !== "rule-based") errors.push('type must be "rule-based".');
  const longConditions = normalizeArray(input.entry?.long);
  const shortConditions = normalizeArray(input.entry?.short);
  if (!longConditions.length && !shortConditions.length) errors.push("entry.long or entry.short must contain at least one condition.");
  [...longConditions, ...shortConditions].forEach((condition) => {
    if (!normalizeCondition(condition)) errors.push(`Invalid condition syntax: ${condition}`);
  });
  const normalized = {
    strategyId,
    name,
    type: "rule-based",
    description: String(input.description || "").trim(),
    entry: { long: longConditions, short: shortConditions },
    exit: { maxBarsInTrade: Math.max(1, Math.round(toNumber(input.exit?.maxBarsInTrade, 24))) },
    risk: {
      stopLossAtr: Math.max(0.1, toNumber(input.risk?.stopLossAtr, 1)),
      takeProfitAtr: Math.max(0.1, toNumber(input.risk?.takeProfitAtr, 1.8)),
      feeBps: Math.max(0, toNumber(input.risk?.feeBps, 4)),
      slippageBps: Math.max(0, toNumber(input.risk?.slippageBps, 2)),
      initialEquity: Math.max(100, toNumber(input.risk?.initialEquity, 10000)),
    },
    filters: {
      session: normalizeArray(input.filters?.session),
      allowLong: input.filters?.allowLong !== false,
      allowShort: input.filters?.allowShort !== false,
    },
  };
  return { valid: errors.length === 0, errors, definition: normalized };
}

export function evaluateJsonRuleStrategy({ definition, candles = [], candleIndex = 0, feature = {}, features = [] }) {
  const allowsLong = definition.filters?.allowLong !== false;
  const allowsShort = definition.filters?.allowShort !== false;
  const context = { candles, features, feature, candleIndex };
  const longChecks = (definition.entry?.long || []).map((condition) => evaluateJsonCondition(condition, context));
  const shortChecks = (definition.entry?.short || []).map((condition) => evaluateJsonCondition(condition, context));
  const longReady = allowsLong && longChecks.length > 0 && longChecks.every((check) => check.ok);
  const shortReady = allowsShort && shortChecks.length > 0 && shortChecks.every((check) => check.ok);
  if (longReady && !shortReady) return { action: STRATEGY_ACTIONS.LONG, confidence: 0.62, reason: "JSON long rules matched" };
  if (shortReady && !longReady) return { action: STRATEGY_ACTIONS.SHORT, confidence: 0.62, reason: "JSON short rules matched" };
  if (longReady && shortReady) return { action: STRATEGY_ACTIONS.NO_TRADE, confidence: 0.2, reason: "Both long/short rules matched; skipping ambiguous signal" };
  return { action: STRATEGY_ACTIONS.NO_TRADE, confidence: 0.2, reason: "JSON rule conditions not met" };
}
