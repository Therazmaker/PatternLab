import { hourFromTimestamp, makeSignalId, toISODate } from "./utils.js";

const fieldMap = {
  asset: ["asset", "symbol", "pair"],
  direction: ["direction", "signal", "side"],
  stopLoss: ["stopLoss", "stop_loss", "sl"],
  takeProfit: ["takeProfit", "take_profit", "tp"],
  timestamp: ["timestamp", "time", "createdAt"],
  patternName: ["patternName", "pattern", "setup"],
  entryPrice: ["entryPrice", "entry", "entry_price", "price"],
  timeframe: ["timeframe", "tf"],
  expiryMinutes: ["expiryMinutes", "expiry", "expiry_min"],
  confidence: ["confidence", "score"],
  session: ["session"],
  notes: ["notes", "comment"],
  context: ["context"],
  features: ["features"],
};

function pick(source, aliases) {
  for (const key of aliases) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return undefined;
}

function normalizeDirection(value) {
  const raw = String(value || "").toUpperCase();
  if (["CALL", "BUY", "LONG", "UP"].includes(raw)) return "CALL";
  if (["PUT", "SELL", "SHORT", "DOWN"].includes(raw)) return "PUT";
  return null;
}

function sanitizePattern(value) {
  return String(value || "Unspecified pattern").trim() || "Unspecified pattern";
}

export function normalizeSignal(input) {
  const base = {};
  for (const [target, aliases] of Object.entries(fieldMap)) base[target] = pick(input, aliases);

  const normalized = {
    id: input.id || "",
    source: input.source || "manual-json-import",
    importedAt: new Date().toISOString(),
    asset: base.asset ? String(base.asset).toUpperCase().replace("/", "") : "",
    timeframe: String(base.timeframe || "5m"),
    direction: normalizeDirection(base.direction),
    patternName: sanitizePattern(base.patternName),
    timestamp: toISODate(base.timestamp),
    hourBucket: hourFromTimestamp(base.timestamp),
    entryPrice: base.entryPrice !== undefined ? Number(base.entryPrice) : null,
    stopLoss: base.stopLoss !== undefined ? Number(base.stopLoss) : null,
    takeProfit: base.takeProfit !== undefined ? Number(base.takeProfit) : null,
    expiryMinutes: Number(base.expiryMinutes || 5),
    confidence: base.confidence !== undefined ? Number(base.confidence) : null,
    session: base.session ? String(base.session) : "",
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    autoTags: Array.isArray(input.autoTags) ? input.autoTags.map(String) : [],
    context: base.context && typeof base.context === "object" ? base.context : {},
    features: base.features && typeof base.features === "object" ? base.features : {},
    notes: base.notes ? String(base.notes) : "",
    contextScore: typeof input.contextScore === "number" ? input.contextScore : null,
    outcome: {
      status: input?.outcome?.status || "pending",
      win: null,
      expiryClose: null,
      reviewedAt: null,
      comment: "",
      reviewedBy: input?.outcome?.reviewedBy || "manual",
    },
    reviewMeta: {
      labels: [],
      executionError: false,
      lateEntry: false,
      reviewer: "manual",
      updatedAt: null,
    },
  };

  normalized.id = normalized.id || makeSignalId(normalized);

  const errors = [];
  if (!normalized.asset) errors.push("Falta asset");
  if (!normalized.direction) errors.push("Dirección inválida o faltante");
  if (!normalized.timestamp) errors.push("Timestamp inválido o faltante");
  return { normalized, errors };
}

export function migrateStoredSignal(signal) {
  const base = { ...signal };
  base.patternName = sanitizePattern(base.patternName || base.pattern);
  base.asset = String(base.asset || "").toUpperCase().replace("/", "");
  base.direction = normalizeDirection(base.direction) || "CALL";
  base.timeframe = String(base.timeframe || "5m");
  base.timestamp = toISODate(base.timestamp);
  base.hourBucket = Number.isInteger(base.hourBucket) ? base.hourBucket : hourFromTimestamp(base.timestamp);
  base.tags = Array.isArray(base.tags) ? base.tags.map(String) : [];
  base.autoTags = Array.isArray(base.autoTags) ? base.autoTags.map(String) : [];
  base.session = base.session ? String(base.session) : "";
  base.contextScore = typeof base.contextScore === "number" ? base.contextScore : null;
  base.reviewMeta = {
    labels: Array.isArray(base.reviewMeta?.labels) ? base.reviewMeta.labels : [],
    executionError: Boolean(base.reviewMeta?.executionError),
    lateEntry: Boolean(base.reviewMeta?.lateEntry),
    reviewer: base.reviewMeta?.reviewer || "manual",
    updatedAt: base.reviewMeta?.updatedAt || null,
  };
  base.outcome = {
    status: base.outcome?.status || "pending",
    win: base.outcome?.win ?? null,
    expiryClose: base.outcome?.expiryClose ?? null,
    reviewedAt: base.outcome?.reviewedAt ?? null,
    comment: base.outcome?.comment || "",
    reviewedBy: base.outcome?.reviewedBy || "manual",
  };
  base.id = base.id || makeSignalId(base);
  return base;
}

export function dedupeSignals(signals) {
  const seen = new Set();
  const output = [];
  for (const signal of signals) {
    const key = signal.id || `${signal.asset}|${signal.timestamp}|${signal.direction}|${signal.patternName}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(signal);
    }
  }
  return output;
}
