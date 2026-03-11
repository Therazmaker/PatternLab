function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeOHLCInput(value) {
  return toNullableNumber(value);
}

export function normalizeCandleData(input = {}) {
  return {
    open: toNullableNumber(input.open),
    high: toNullableNumber(input.high),
    low: toNullableNumber(input.low),
    close: toNullableNumber(input.close),
    source: ["manual", "derived"].includes(input.source) ? input.source : null,
  };
}

export function normalizeExcursion(input = {}) {
  return {
    mfe: toNullableNumber(input.mfe),
    mae: toNullableNumber(input.mae),
    unit: ["points", "ticks", "price"].includes(input.unit) ? input.unit : null,
    source: ["manual", "derived"].includes(input.source) ? input.source : null,
  };
}

export function normalizeSessionRef(input = {}) {
  return {
    sessionId: input.sessionId ? String(input.sessionId) : null,
    candleIndex: Number.isInteger(input.candleIndex) ? input.candleIndex : toNullableNumber(input.candleIndex),
  };
}

export function normalizeV3Meta(input = {}) {
  return {
    enabled: Boolean(input.enabled),
    notes: input.notes ? String(input.notes) : "",
  };
}

export function isOHLCComplete(candleData = {}) {
  return [candleData.open, candleData.high, candleData.low, candleData.close].every((value) => typeof value === "number");
}

export function deriveColorHint(candleData = {}) {
  if (!isOHLCComplete(candleData)) return null;
  if (candleData.close > candleData.open) return "green";
  if (candleData.close < candleData.open) return "red";
  return "doji";
}

export function validateOHLCConsistency(candleData = {}) {
  const values = [candleData.open, candleData.high, candleData.low, candleData.close].filter((v) => typeof v === "number");
  if (!values.length) return { valid: true, message: "" };

  const open = candleData.open;
  const high = candleData.high;
  const low = candleData.low;
  const close = candleData.close;

  if (typeof high === "number") {
    const compareMax = [open, close, low].filter((v) => typeof v === "number");
    if (compareMax.some((v) => high < v)) return { valid: false, message: "High debe ser mayor o igual a Open/Close/Low." };
  }

  if (typeof low === "number") {
    const compareMin = [open, close, high].filter((v) => typeof v === "number");
    if (compareMin.some((v) => low > v)) return { valid: false, message: "Low debe ser menor o igual a Open/Close/High." };
  }

  return { valid: true, message: "" };
}

export function computeExcursionFromSignal(signal, options = {}) {
  const unit = options.unit || signal?.excursion?.unit || "price";
  const tickSize = typeof options.tickSize === "number" && options.tickSize > 0 ? options.tickSize : null;
  const pointSize = typeof options.pointSize === "number" && options.pointSize > 0 ? options.pointSize : null;
  const entryPrice = toNullableNumber(signal?.entryPrice);
  const high = toNullableNumber(signal?.candleData?.high);
  const low = toNullableNumber(signal?.candleData?.low);
  if (entryPrice === null || high === null || low === null) {
    return { mfe: null, mae: null, unit: unit || "price", source: null };
  }

  const direction = String(signal?.direction || "").toUpperCase();
  let mfe = null;
  let mae = null;
  if (direction === "CALL") {
    mfe = high - entryPrice;
    mae = entryPrice - low;
  } else if (direction === "PUT") {
    mfe = entryPrice - low;
    mae = high - entryPrice;
  } else {
    return { mfe: null, mae: null, unit: unit || "price", source: null };
  }

  const convert = (value) => {
    if (unit === "ticks" && tickSize) return value / tickSize;
    if (unit === "points" && pointSize) return value / pointSize;
    return value;
  };

  return {
    mfe: Math.round(convert(Math.max(0, mfe)) * 100000) / 100000,
    mae: Math.round(convert(Math.max(0, mae)) * 100000) / 100000,
    unit: (unit === "ticks" && !tickSize) || (unit === "points" && !pointSize) ? "price" : unit,
    source: "derived",
  };
}

export function formatExcursion(value, unit = "price") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const suffix = unit === "price" ? "" : ` ${unit}`;
  return `${Number(value).toFixed(unit === "price" ? 5 : 2)}${suffix}`;
}
