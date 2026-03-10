import { safeJsonParse, uniq } from "./utils.js";
import { normalizeSignal } from "./normalizer.js";
import { deduplicateSignals } from "./import-utils.js";

function extractRawSignals(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.signals)) return input.signals;
  if (input && typeof input === "object") return [input];
  return [];
}

function criticalMissing(raw) {
  const missing = [];
  if (!(raw.asset || raw.symbol || raw.pair)) missing.push("asset");
  if (!(raw.direction || raw.signal || raw.side)) missing.push("direction");
  if (!(raw.timestamp || raw.time || raw.createdAt)) missing.push("timestamp");
  return missing;
}

export function buildImportPreview(text, existingSignals = []) {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return {
      ok: false,
      message: `JSON inválido: ${parsed.error}`,
      total: 0,
      valid: [],
      uniqueValid: [],
      duplicates: [],
      invalid: [],
      missingCritical: [],
      assets: [],
      patterns: [],
    };
  }

  const rows = extractRawSignals(parsed.value);
  const valid = [];
  const invalid = [];
  const missingCritical = [];

  rows.forEach((row, index) => {
    const missing = criticalMissing(row);
    if (missing.length) missingCritical.push({ index, fields: missing });
    const { normalized, errors } = normalizeSignal(row);
    if (errors.length) invalid.push({ index, errors, row });
    else valid.push(normalized);
  });

  const dedupe = deduplicateSignals(valid, existingSignals);

  return {
    ok: true,
    message: "Preview lista",
    total: rows.length,
    valid,
    uniqueValid: dedupe.unique,
    duplicates: dedupe.duplicates,
    invalid,
    missingCritical,
    assets: uniq(valid.map((s) => s.asset)),
    patterns: uniq(valid.map((s) => s.patternName)),
  };
}
