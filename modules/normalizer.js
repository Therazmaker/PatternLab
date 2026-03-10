import { makeSignalId, toISODate } from "./utils.js";

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

export function normalizeSignal(input) {
  const base = {};
  for (const [target, aliases] of Object.entries(fieldMap)) {
    base[target] = pick(input, aliases);
  }

  const normalized = {
    id: input.id || "",
    source: input.source || "manual-json-import",
    importedAt: new Date().toISOString(),
    asset: base.asset ? String(base.asset).toUpperCase().replace("/", "") : "",
    timeframe: String(base.timeframe || "5m"),
    direction: normalizeDirection(base.direction),
    patternName: base.patternName ? String(base.patternName) : "Unspecified pattern",
    timestamp: toISODate(base.timestamp),
    entryPrice: base.entryPrice !== undefined ? Number(base.entryPrice) : null,
    stopLoss: base.stopLoss !== undefined ? Number(base.stopLoss) : null,
    takeProfit: base.takeProfit !== undefined ? Number(base.takeProfit) : null,
    expiryMinutes: Number(base.expiryMinutes || 5),
    confidence: base.confidence !== undefined ? Number(base.confidence) : null,
    session: base.session ? String(base.session) : "",
    context: base.context && typeof base.context === "object" ? base.context : {},
    features: base.features && typeof base.features === "object" ? base.features : {},
    notes: base.notes ? String(base.notes) : "",
    outcome: {
      status: "pending",
      win: null,
      expiryClose: null,
      reviewedAt: null,
      comment: "",
    },
  };

  normalized.id = normalized.id || makeSignalId(normalized);

  const errors = [];
  if (!normalized.asset) errors.push("Falta asset");
  if (!normalized.direction) errors.push("Dirección inválida o faltante");
  if (!normalized.timestamp) errors.push("Timestamp inválido o faltante");
  return { normalized, errors };
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
