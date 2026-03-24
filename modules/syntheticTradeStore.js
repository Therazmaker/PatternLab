import { loadSyntheticTrades, saveSyntheticTrades } from "./storage.js";

const DEFAULT_SCHEMA = "patternlab_synthetic_trades_v1";
const MAX_SYNTHETIC_TRADES = 2000;
const SYNTHETIC_WEIGHT = 0.4;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeSyntheticTrade(trade = {}, defaults = {}) {
  return {
    id: normalizeText(trade.id, `syn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    schema: DEFAULT_SCHEMA,
    synthetic: true,
    origin: normalizeText(trade.origin, defaults.origin || "external-synthetic"),
    importedAt: trade.importedAt || defaults.importedAt || new Date().toISOString(),
    scenario: normalizeText(trade.scenario, "unknown_scenario"),
    context: normalizeText(trade.context, "unknown_context"),
    entry: toNumber(trade.entry, 0),
    stop: toNumber(trade.stop, 0),
    target: toNumber(trade.target, 0),
    outcome: normalizeText(trade.outcome, "neutral").toLowerCase(),
    mfe: toNumber(trade.mfe, 0),
    mae: toNumber(trade.mae, 0),
    lesson: normalizeText(trade.lesson, ""),
    lessonTags: Array.isArray(trade.lessonTags)
      ? trade.lessonTags.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 12)
      : [],
    weight: toNumber(trade.weight, SYNTHETIC_WEIGHT) || SYNTHETIC_WEIGHT,
  };
}

export function getSyntheticTrades() {
  const rows = loadSyntheticTrades();
  return Array.isArray(rows) ? rows : [];
}

export function saveSyntheticTradeRows(rows = []) {
  const clean = Array.isArray(rows)
    ? rows.map((row) => normalizeSyntheticTrade(row)).slice(-MAX_SYNTHETIC_TRADES)
    : [];
  return saveSyntheticTrades(clean);
}

export function appendSyntheticTrades(trades = [], options = {}) {
  const now = new Date().toISOString();
  const defaults = { importedAt: now, origin: options.origin || "external-synthetic" };
  const current = getSyntheticTrades();
  const normalized = Array.isArray(trades)
    ? trades.map((row) => normalizeSyntheticTrade(row, defaults))
    : [];

  const deduped = [...current];
  normalized.forEach((row) => {
    const exists = deduped.some((item) => item.id === row.id);
    if (!exists) deduped.push(row);
  });

  const next = deduped.slice(-MAX_SYNTHETIC_TRADES);
  saveSyntheticTrades(next);
  return {
    imported: normalized.length,
    stored: next.length,
    duplicates: normalized.length - (next.length - current.length),
    rows: normalized,
  };
}

export function computeSyntheticLearningRatio(realSampleCount = 0, syntheticRows = []) {
  const real = Math.max(0, Number(realSampleCount || 0));
  const weightedSynthetic = (Array.isArray(syntheticRows) ? syntheticRows : []).reduce(
    (acc, row) => acc + toNumber(row.weight, SYNTHETIC_WEIGHT),
    0,
  );
  const total = real + weightedSynthetic;
  return {
    real,
    syntheticWeighted: Number(weightedSynthetic.toFixed(3)),
    ratioSynthetic: total > 0 ? Number((weightedSynthetic / total).toFixed(3)) : 0,
    ratioReal: total > 0 ? Number((real / total).toFixed(3)) : 0,
  };
}
