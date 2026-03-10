import { safeJsonParse, uniq } from "./utils.js";
import { normalizeSignal } from "./normalizer.js";

function extractRawSignals(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.signals)) return input.signals;
  if (input && typeof input === "object") return [input];
  return [];
}

export function buildImportPreview(text) {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return {
      ok: false,
      message: `JSON inválido: ${parsed.error}`,
      total: 0,
      valid: [],
      invalid: [],
      assets: [],
      patterns: [],
    };
  }

  const rows = extractRawSignals(parsed.value);
  const valid = [];
  const invalid = [];

  rows.forEach((row, index) => {
    const { normalized, errors } = normalizeSignal(row);
    if (errors.length) invalid.push({ index, errors, row });
    else valid.push(normalized);
  });

  return {
    ok: true,
    message: "Preview lista",
    total: rows.length,
    valid,
    invalid,
    assets: uniq(valid.map((s) => s.asset)),
    patterns: uniq(valid.map((s) => s.patternName)),
  };
}
