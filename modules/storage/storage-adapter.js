import { dedupeSignals, migrateStoredSignal } from "../normalizer.js";
import { getMany, isIndexedDbSupported, openIndexedDb, setValue } from "./indexeddb-store.js";
import { clearLegacyData, hasLegacyData, LEGACY_KEYS, readLegacySnapshot, writeLegacyValue } from "./localstorage-legacy.js";
import { buildMigrationPayload, readMigrationFlag, writeMigrationFlag } from "./migration.js";

const STORAGE_KEYS = [
  "signals",
  "sessions",
  "patternVersions",
  "activePatternVersionId",
  "notes",
  "lastImportReport",
  "metaFeedback",
  "botCompiler",
  "backup",
  "backupMeta",
  "marketData",
  "marketDataMeta",
  "promotedPatterns",
  "seededPatterns",
  "seededPatternResults",
];

const defaultMetaFeedback = {
  usefulHypothesisTypes: [], weakHypothesisTypes: [], dismissedHypothesisTypes: [], acceptedSuggestionTypes: [], ignoredSuggestionTypes: [], history: [],
};

let db = null;
let backend = "localStorage";
let writeQueue = Promise.resolve();
let migrationStatus = readMigrationFlag() || { status: "pending" };
let cache = {
  signals: [], sessions: [], patternVersions: [], activePatternVersionId: "", notes: [],
  lastImportReport: null, metaFeedback: { ...defaultMetaFeedback }, botCompiler: { patternMeta: {} }, backup: null, backupMeta: null,
  marketData: [], marketDataMeta: { lastSyncAt: null, lastCandleTimestamp: null, source: "yahoo" }, promotedPatterns: [], seededPatterns: [], seededPatternResults: [],
};

function enqueueWrite(task) {
  writeQueue = writeQueue.then(task).catch((error) => {
    console.error("[Storage] Save failed", error);
    throw error;
  });
  return writeQueue;
}

function normalizeCache(snapshot = {}) {
  const defaultMarketDataMeta = { lastSyncAt: null, lastCandleTimestamp: null, source: "yahoo" };
  cache = {
    ...cache,
    signals: Array.isArray(snapshot.signals) ? dedupeSignals(snapshot.signals.map(migrateStoredSignal)) : [],
    sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions : [],
    patternVersions: Array.isArray(snapshot.patternVersions) ? snapshot.patternVersions : [],
    activePatternVersionId: String(snapshot.activePatternVersionId || ""),
    notes: Array.isArray(snapshot.notes) ? snapshot.notes : [],
    lastImportReport: snapshot.lastImportReport || null,
    metaFeedback: snapshot.metaFeedback && typeof snapshot.metaFeedback === "object" ? { ...defaultMetaFeedback, ...snapshot.metaFeedback } : { ...defaultMetaFeedback },
    botCompiler: snapshot.botCompiler?.patternMeta && typeof snapshot.botCompiler.patternMeta === "object" ? snapshot.botCompiler : { patternMeta: {} },
    backup: snapshot.backup || null,
    backupMeta: snapshot.backupMeta || null,
    marketData: Array.isArray(snapshot.marketData) ? snapshot.marketData : [],
    marketDataMeta: snapshot.marketDataMeta && typeof snapshot.marketDataMeta === "object" ? { ...defaultMarketDataMeta, ...snapshot.marketDataMeta } : { ...defaultMarketDataMeta },
    promotedPatterns: Array.isArray(snapshot.promotedPatterns) ? snapshot.promotedPatterns : [],
    seededPatterns: Array.isArray(snapshot.seededPatterns) ? snapshot.seededPatterns : [],
    seededPatternResults: Array.isArray(snapshot.seededPatternResults) ? snapshot.seededPatternResults : [],
  };
}

async function writeDb(key, value) {
  if (!db) return;
  await setValue(db, key, value);
}

function writeLegacyByDomain(domain) {
  switch (domain) {
    case "signals": writeLegacyValue(LEGACY_KEYS.signals, cache.signals); break;
    case "sessions": writeLegacyValue(LEGACY_KEYS.sessions, cache.sessions); break;
    case "patternVersions": writeLegacyValue(LEGACY_KEYS.patternVersions, cache.patternVersions); break;
    case "activePatternVersionId": writeLegacyValue(LEGACY_KEYS.activePatternVersionId, cache.activePatternVersionId); break;
    case "notes": writeLegacyValue(LEGACY_KEYS.notes, cache.notes); break;
    case "lastImportReport": writeLegacyValue(LEGACY_KEYS.lastImportReport, cache.lastImportReport); break;
    case "metaFeedback": writeLegacyValue(LEGACY_KEYS.metaFeedback, cache.metaFeedback); break;
    case "botCompiler": writeLegacyValue(LEGACY_KEYS.botCompiler, cache.botCompiler); break;
    case "promotedPatterns": writeLegacyValue(LEGACY_KEYS.promotedPatterns, cache.promotedPatterns); break;
    case "seededPatterns": writeLegacyValue(LEGACY_KEYS.seededPatterns, cache.seededPatterns); break;
    case "seededPatternResults": writeLegacyValue(LEGACY_KEYS.seededPatternResults, cache.seededPatternResults); break;
    default: break;
  }
}

async function persistDomain(domain) {
  if (backend === "indexedDB") {
    await writeDb(domain, cache[domain]);
    writeLegacyByDomain(domain);
    return;
  }
  writeLegacyByDomain(domain);
}

export async function initializeStorage() {
  try {
    if (!isIndexedDbSupported()) throw new Error("IndexedDB no soportado");
    db = await openIndexedDb();
    backend = "indexedDB";
    const stored = await getMany(db, STORAGE_KEYS);
    const hasDbData = STORAGE_KEYS.some((key) => {
      const value = stored[key];
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    });

    if (!hasDbData && hasLegacyData()) {
      console.info("[Storage] Legacy localStorage data detected");
      console.info("[Storage] Migrating data to IndexedDB...");
      const legacy = readLegacySnapshot();
      normalizeCache(legacy);
      await Promise.all(STORAGE_KEYS.map((key) => writeDb(key, cache[key] ?? null)));
      migrationStatus = buildMigrationPayload("completed", { source: "localStorage" });
      writeMigrationFlag(migrationStatus);
      console.info("[Storage] Migration completed successfully");
    } else {
      normalizeCache(stored);
      if (hasDbData) migrationStatus = buildMigrationPayload("completed", { source: "indexedDB" });
    }
    console.info("[Storage] IndexedDB ready");
    return getStorageStatus();
  } catch (error) {
    backend = "localStorage";
    normalizeCache(readLegacySnapshot());
    migrationStatus = buildMigrationPayload("fallback", { reason: error.message });
    console.error("[Storage] IndexedDB unavailable. Using localStorage fallback.", error);
    return getStorageStatus();
  }
}

export function getStorageStatus() {
  const estimatedBytes = new Blob([JSON.stringify(cache)]).size;
  return {
    backend,
    migrationStatus,
    estimatedBytes,
    counts: {
      signals: cache.signals.length,
      sessions: cache.sessions.length,
      patternVersions: cache.patternVersions.length,
      promotedPatterns: cache.promotedPatterns.length,
      seededPatterns: cache.seededPatterns.length,
      seededPatternResults: cache.seededPatternResults.length,
      reviews: cache.signals.filter((row) => row.status && row.status !== "pending").length,
    },
    lastBackupAt: cache.backupMeta?.createdAt || null,
  };
}

export function loadSignals() { return cache.signals; }
export function saveSignals(signals) {
  cache.signals = Array.isArray(signals) ? signals : [];
  return enqueueWrite(() => persistDomain("signals"));
}
export function loadSessions(normalizeSession) {
  const rows = cache.sessions;
  return typeof normalizeSession === "function" ? rows.map(normalizeSession) : rows;
}
export function saveSessions(sessions) {
  cache.sessions = Array.isArray(sessions) ? sessions : [];
  return enqueueWrite(() => persistDomain("sessions"));
}

export function loadPatternVersionsRegistry() { return cache.patternVersions; }
export function savePatternVersionsRegistry(entries) {
  cache.patternVersions = Array.isArray(entries) ? entries : [];
  return enqueueWrite(() => persistDomain("patternVersions"));
}
export function loadActivePatternVersionId() { return cache.activePatternVersionId || ""; }
export function saveActivePatternVersionId(id) {
  cache.activePatternVersionId = String(id || "");
  return enqueueWrite(() => persistDomain("activePatternVersionId"));
}

export function loadNotes() { return cache.notes; }
export function saveNotes(notes) {
  cache.notes = Array.isArray(notes) ? notes : [];
  return enqueueWrite(() => persistDomain("notes"));
}

export function loadLastImportReport() { return cache.lastImportReport || null; }
export function saveLastImportReport(report) {
  cache.lastImportReport = report || null;
  return enqueueWrite(() => persistDomain("lastImportReport"));
}

export function loadMetaFeedback() { return cache.metaFeedback || { ...defaultMetaFeedback }; }
export function saveMetaFeedback(metaFeedback) {
  cache.metaFeedback = { ...defaultMetaFeedback, ...(metaFeedback || {}) };
  return enqueueWrite(() => persistDomain("metaFeedback"));
}

export function loadBotCompilerState() { return cache.botCompiler || { patternMeta: {} }; }
export function saveBotCompilerState(value) {
  cache.botCompiler = value?.patternMeta && typeof value.patternMeta === "object" ? value : { patternMeta: {} };
  return enqueueWrite(() => persistDomain("botCompiler"));
}

export function loadMarketData() { return cache.marketData || []; }
export function saveMarketData(candles) {
  cache.marketData = Array.isArray(candles) ? candles : [];
  return enqueueWrite(() => persistDomain("marketData"));
}

const defaultMarketDataMetaValue = { lastSyncAt: null, lastCandleTimestamp: null, source: "yahoo" };
export function loadMarketDataMeta() { return cache.marketDataMeta || { ...defaultMarketDataMetaValue }; }
export function saveMarketDataMeta(meta) {
  cache.marketDataMeta = meta && typeof meta === "object" ? { ...defaultMarketDataMetaValue, ...meta } : { ...defaultMarketDataMetaValue };
  return enqueueWrite(() => persistDomain("marketDataMeta"));
}


export function loadPromotedPatterns() { return cache.promotedPatterns || []; }
export function savePromotedPatterns(rows) {
  cache.promotedPatterns = Array.isArray(rows) ? rows : [];
  return enqueueWrite(() => persistDomain("promotedPatterns"));
}


export function loadSeededPatterns() { return cache.seededPatterns || []; }
export function saveSeededPatterns(rows) {
  cache.seededPatterns = Array.isArray(rows) ? rows : [];
  return enqueueWrite(() => persistDomain("seededPatterns"));
}

export function loadSeededPatternResults() { return cache.seededPatternResults || []; }
export function saveSeededPatternResults(rows) {
  cache.seededPatternResults = Array.isArray(rows) ? rows : [];
  return enqueueWrite(() => persistDomain("seededPatternResults"));
}

export function exportDataset(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `patternlab-dataset-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportSignals(signals) { exportDataset(signals); }

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportMemory() {
  return {
    app: "PatternLab",
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    storageVersion: 1,
    data: {
      signals: cache.signals || [],
      sessions: cache.sessions || [],
      patternVersions: cache.patternVersions || [],
      reviews: (cache.signals || []).filter((row) => row.status && row.status !== "pending"),
      settings: {
        activePatternVersionId: cache.activePatternVersionId || "",
      },
      notes: cache.notes || [],
      meta: {
        lastImportReport: cache.lastImportReport || null,
        metaFeedback: cache.metaFeedback || { ...defaultMetaFeedback },
        botCompiler: cache.botCompiler || { patternMeta: {} },
      },
      promotedPatterns: cache.promotedPatterns || [],
      seededPatterns: cache.seededPatterns || [],
      seededPatternResults: cache.seededPatternResults || [],
    },
  };
}

export function downloadFullMemory() {
  const now = new Date();
  const stamp = `${now.toISOString().slice(0, 10)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `patternlab-memory-${stamp}.json`;
  downloadJson(exportMemory(), filename);
  console.info("[Storage] Export success");
}

export function validateMemoryPayload(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Archivo inválido: JSON vacío o corrupto." };
  if (payload.app !== "PatternLab") return { ok: false, error: "Archivo inválido: app no compatible." };
  if (!payload.data || typeof payload.data !== "object") return { ok: false, error: "Archivo inválido: falta bloque data." };
  if (payload.schemaVersion !== 1) return { ok: false, error: `schemaVersion no soportado (${payload.schemaVersion}).` };
  return {
    ok: true,
    summary: {
      signals: Array.isArray(payload.data.signals) ? payload.data.signals.length : 0,
      sessions: Array.isArray(payload.data.sessions) ? payload.data.sessions.length : 0,
      patternVersions: Array.isArray(payload.data.patternVersions) ? payload.data.patternVersions.length : 0,
      promotedPatterns: Array.isArray(payload.data.promotedPatterns) ? payload.data.promotedPatterns.length : 0,
      seededPatterns: Array.isArray(payload.data.seededPatterns) ? payload.data.seededPatterns.length : 0,
      seededPatternResults: Array.isArray(payload.data.seededPatternResults) ? payload.data.seededPatternResults.length : 0,
    },
  };
}

export async function importMemory(payload, mode = "replace") {
  const validation = validateMemoryPayload(payload);
  if (!validation.ok) throw new Error(validation.error);

  await createBackupNow();

  if (mode !== "replace") {
    console.warn("[Storage] Merge mode no implementado completamente. Se utilizará replace.");
  }

  normalizeCache({
    signals: payload.data.signals || [],
    sessions: payload.data.sessions || [],
    patternVersions: payload.data.patternVersions || [],
    activePatternVersionId: payload.data.settings?.activePatternVersionId || "",
    notes: payload.data.notes || [],
    lastImportReport: payload.data.meta?.lastImportReport || null,
    metaFeedback: payload.data.meta?.metaFeedback || defaultMetaFeedback,
    botCompiler: payload.data.meta?.botCompiler || { patternMeta: {} },
    promotedPatterns: payload.data.promotedPatterns || [],
    seededPatterns: payload.data.seededPatterns || [],
    seededPatternResults: payload.data.seededPatternResults || [],
    backup: cache.backup,
    backupMeta: cache.backupMeta,
  });

  await Promise.all(["signals", "sessions", "patternVersions", "activePatternVersionId", "notes", "lastImportReport", "metaFeedback", "botCompiler", "promotedPatterns", "seededPatterns", "seededPatternResults"].map((key) => persistDomain(key)));
  console.info("[Storage] Import success");
}

export async function createBackupNow() {
  const snapshot = exportMemory();
  cache.backup = snapshot;
  cache.backupMeta = { createdAt: new Date().toISOString(), schemaVersion: snapshot.schemaVersion };
  await Promise.all([persistDomain("backup"), persistDomain("backupMeta")]);
  console.info("[Storage] Backup created");
  return cache.backupMeta;
}

export function downloadBackup() {
  if (!cache.backup) throw new Error("No hay backup disponible.");
  downloadJson(cache.backup, `patternlab-backup-${cache.backupMeta?.createdAt?.slice(0, 10) || "latest"}.json`);
}

export async function restoreBackup() {
  if (!cache.backup) throw new Error("No hay backup disponible para restaurar.");
  await importMemory(cache.backup, "replace");
}

export async function clearLegacyStorage() {
  if (migrationStatus?.status !== "completed") throw new Error("La migración aún no está completada.");
  clearLegacyData();
}
