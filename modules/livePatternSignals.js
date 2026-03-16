import { calcWinrate, safeJsonParse, toISODate, uniq } from "./utils.js";

const REQUIRED_FIELDS = ["patternId", "asset", "timeframe", "direction", "entryTimestamp", "expiryBars", "entryPrice"];

function extractRawSignals(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.signals)) return input.signals;
  if (input && typeof input === "object") return [input];
  return [];
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDirection(value) {
  const upper = String(value || "").trim().toUpperCase();
  return upper === "PUT" ? "PUT" : upper === "CALL" ? "CALL" : null;
}

function timeframeToMs(timeframe) {
  const value = String(timeframe || "").trim().toLowerCase();
  const match = value.match(/^(\d+)\s*([mhd])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  if (unit === "d") return amount * 24 * 60 * 60 * 1000;
  return null;
}

function inferSession(timestamp) {
  const iso = toISODate(timestamp);
  if (!iso) return null;
  const hour = new Date(iso).getUTCHours();
  if (hour >= 0 && hour < 8) return "ASIA";
  if (hour >= 8 && hour < 13) return "LONDON";
  if (hour >= 13 && hour < 21) return "NY";
  return "OFF";
}

function inferExpiryTimestamp(entryTimestamp, expiryBars, timeframe) {
  const entryIso = toISODate(entryTimestamp);
  const bars = Number(expiryBars);
  const tfMs = timeframeToMs(timeframe);
  if (!entryIso || !Number.isFinite(bars) || bars <= 0 || !tfMs) return null;
  return new Date(new Date(entryIso).getTime() + bars * tfMs).toISOString();
}

function inferResult(direction, entryPrice, expiryPrice) {
  if (expiryPrice === null) return "PENDING";
  if (direction === "CALL") return expiryPrice > entryPrice ? "WIN" : "LOSS";
  if (direction === "PUT") return expiryPrice < entryPrice ? "WIN" : "LOSS";
  return "PENDING";
}

function criticalMissing(raw) {
  return REQUIRED_FIELDS.filter((field) => raw?.[field] === undefined || raw?.[field] === null || raw?.[field] === "");
}

function normalizeResult(value) {
  const upper = String(value || "").trim().toUpperCase();
  if (upper === "WIN" || upper === "LOSS" || upper === "PENDING") return upper;
  return null;
}

export function normalizeLivePatternSignal(input = {}) {
  const errors = [];
  const direction = normalizeDirection(input.direction);
  const entryTimestamp = toISODate(input.entryTimestamp);
  const triggerTimestamp = toISODate(input.triggerTimestamp) || entryTimestamp;
  const expiryBars = Number(input.expiryBars);
  const entryPrice = normalizeNumber(input.entryPrice);
  const expiryPrice = normalizeNumber(input.expiryPrice);
  const expiryTimestamp = toISODate(input.expiryTimestamp) || inferExpiryTimestamp(entryTimestamp, expiryBars, input.timeframe);

  if (!input.patternId) errors.push("patternId requerido");
  if (!input.asset) errors.push("asset requerido");
  if (!input.timeframe) errors.push("timeframe requerido");
  if (!direction) errors.push("direction inválida (CALL/PUT)");
  if (!entryTimestamp) errors.push("entryTimestamp inválido");
  if (!Number.isFinite(expiryBars) || expiryBars <= 0) errors.push("expiryBars inválido");
  if (entryPrice === null) errors.push("entryPrice inválido");

  if (errors.length) return { signal: null, errors };

  const result = normalizeResult(input.result) || inferResult(direction, entryPrice, expiryPrice);
  const session = String(input.session || "").trim().toUpperCase() || inferSession(entryTimestamp);

  return {
    signal: {
      source: "live_pattern",
      patternId: String(input.patternId),
      patternName: String(input.patternName || input.patternId),
      asset: String(input.asset),
      timeframe: String(input.timeframe),
      direction,
      triggerTimestamp,
      entryTimestamp,
      expiryBars,
      expiryTimestamp,
      entryPrice,
      expiryPrice,
      result,
      session: session || null,
      open: normalizeNumber(input.open),
      high: normalizeNumber(input.high),
      low: normalizeNumber(input.low),
      close: normalizeNumber(input.close),
      mfe: normalizeNumber(input.mfe),
      mae: normalizeNumber(input.mae),
      notes: String(input.notes || ""),
    },
    errors: [],
  };
}

function duplicateKey(signal) {
  return [signal.patternId, signal.asset, signal.timeframe, signal.direction, signal.entryTimestamp, signal.expiryBars].join("|");
}

export function dedupeLivePatternSignals(candidates = [], existing = []) {
  const known = new Set(existing.map(duplicateKey));
  const unique = [];
  const duplicates = [];
  candidates.forEach((signal, index) => {
    const key = duplicateKey(signal);
    if (known.has(key)) {
      duplicates.push({ index, signal, key });
      return;
    }
    known.add(key);
    unique.push(signal);
  });
  return { unique, duplicates };
}

export function buildLiveImportPreview(text, existingSignals = []) {
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
    const { signal, errors } = normalizeLivePatternSignal(row);
    if (errors.length) invalid.push({ index, errors, row });
    else valid.push(signal);
  });

  const dedupe = dedupeLivePatternSignals(valid, existingSignals);

  return {
    ok: true,
    message: "Preview live lista",
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

export function computeLivePatternSummary(signals = []) {
  const byPattern = new Map();

  signals.forEach((signal) => {
    const key = signal.patternId;
    if (!byPattern.has(key)) {
      byPattern.set(key, {
        patternId: key,
        patternName: signal.patternName || key,
        total: 0,
        wins: 0,
        losses: 0,
        pending: 0,
        winRate: 0,
        bySession: {},
      });
    }
    const row = byPattern.get(key);
    row.total += 1;
    if (signal.result === "WIN") row.wins += 1;
    else if (signal.result === "LOSS") row.losses += 1;
    else row.pending += 1;

    const sessionKey = signal.session || "UNKNOWN";
    if (!row.bySession[sessionKey]) row.bySession[sessionKey] = { total: 0, wins: 0, losses: 0, pending: 0 };
    row.bySession[sessionKey].total += 1;
    if (signal.result === "WIN") row.bySession[sessionKey].wins += 1;
    else if (signal.result === "LOSS") row.bySession[sessionKey].losses += 1;
    else row.bySession[sessionKey].pending += 1;
  });

  return [...byPattern.values()].map((row) => ({
    ...row,
    winRate: calcWinrate(row.wins, row.losses),
  }));
}
