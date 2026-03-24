import { safeJsonParse } from "./utils.js";
import { appendSyntheticTrades } from "./syntheticTradeStore.js";

const SYNTHETIC_SCHEMA = "patternlab_synthetic_trades_v1";
const REQUIRED_FIELDS = ["scenario", "context", "entry", "stop", "target", "outcome", "mfe", "mae", "lesson"];

function extractTrades(payload) {
  if (Array.isArray(payload)) return { schema: SYNTHETIC_SCHEMA, trades: payload };
  if (payload && typeof payload === "object" && Array.isArray(payload.trades)) {
    return { schema: String(payload.schema || ""), trades: payload.trades };
  }
  return { schema: "", trades: [] };
}

function validateTradeRow(row = {}, index = 0) {
  const missing = REQUIRED_FIELDS.filter((field) => row[field] === undefined || row[field] === null || row[field] === "");
  if (missing.length) {
    return { ok: false, index, errors: [`Campos faltantes: ${missing.join(", ")}`] };
  }
  return { ok: true, index, errors: [] };
}

export function validateSyntheticTradePayload(text = "") {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return { ok: false, message: `JSON inválido: ${parsed.error}`, schema: "", valid: [], invalid: [] };
  }

  const extracted = extractTrades(parsed.value);
  if (extracted.schema !== SYNTHETIC_SCHEMA) {
    return {
      ok: false,
      message: `schema inválido. Esperado: ${SYNTHETIC_SCHEMA}`,
      schema: extracted.schema,
      valid: [],
      invalid: [],
    };
  }

  const valid = [];
  const invalid = [];
  extracted.trades.forEach((row, index) => {
    const check = validateTradeRow(row, index);
    if (!check.ok) invalid.push({ index, errors: check.errors, row });
    else valid.push({ ...row, synthetic: true, origin: row.origin || "external-synthetic" });
  });

  return {
    ok: true,
    message: `Validadas ${valid.length} synthetic trades`,
    schema: SYNTHETIC_SCHEMA,
    total: extracted.trades.length,
    valid,
    invalid,
  };
}

export function ingestSyntheticTrades(text = "", options = {}) {
  const validation = validateSyntheticTradePayload(text);
  if (!validation.ok) return validation;

  const stored = appendSyntheticTrades(validation.valid, { origin: options.origin || "external-synthetic" });
  return {
    ok: true,
    schema: SYNTHETIC_SCHEMA,
    total: validation.total,
    valid: validation.valid.length,
    invalid: validation.invalid.length,
    imported: stored.imported,
    duplicates: stored.duplicates,
    rows: stored.rows,
    message: `Synthetic trades importadas: ${stored.imported}`,
  };
}
