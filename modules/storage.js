import { dedupeSignals, migrateStoredSignal } from "./normalizer.js";

const SIGNALS_KEY = "patternlab.signals.v1";
const LAST_IMPORT_REPORT_KEY = "patternlab.lastImportReport";
const META_FEEDBACK_KEY = "patternlab.metaFeedback.v1";
const BOT_COMPILER_KEY = "patternlab.botCompiler.v1";
const SESSIONS_KEY = "patternlab.sessions.v1";

function setItemOrThrow(key, value, label) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    const isQuotaError = error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014;
    if (isQuotaError) {
      throw new Error(`No se pudo guardar ${label}: almacenamiento local lleno. Exporta y limpia datos antiguos.`);
    }
    throw error;
  }
}

export function loadSignals() {
  const raw = localStorage.getItem(SIGNALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeSignals(parsed.map(migrateStoredSignal));
  } catch {
    return [];
  }
}

export function saveSignals(signals) {
  setItemOrThrow(SIGNALS_KEY, JSON.stringify(signals), "las señales");
}

export function exportSignals(signals) {
  const blob = new Blob([JSON.stringify(signals, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `patternlab-dataset-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function saveLastImportReport(report) {
  setItemOrThrow(LAST_IMPORT_REPORT_KEY, JSON.stringify(report), "el reporte de importación");
}

export function loadLastImportReport() {
  try {
    const raw = localStorage.getItem(LAST_IMPORT_REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadMetaFeedback() {
  try {
    const raw = localStorage.getItem(META_FEEDBACK_KEY);
    if (!raw) {
      return {
        usefulHypothesisTypes: [],
        weakHypothesisTypes: [],
        dismissedHypothesisTypes: [],
        acceptedSuggestionTypes: [],
        ignoredSuggestionTypes: [],
        history: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      usefulHypothesisTypes: Array.isArray(parsed.usefulHypothesisTypes) ? parsed.usefulHypothesisTypes : [],
      weakHypothesisTypes: Array.isArray(parsed.weakHypothesisTypes) ? parsed.weakHypothesisTypes : [],
      dismissedHypothesisTypes: Array.isArray(parsed.dismissedHypothesisTypes) ? parsed.dismissedHypothesisTypes : [],
      acceptedSuggestionTypes: Array.isArray(parsed.acceptedSuggestionTypes) ? parsed.acceptedSuggestionTypes : [],
      ignoredSuggestionTypes: Array.isArray(parsed.ignoredSuggestionTypes) ? parsed.ignoredSuggestionTypes : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return {
      usefulHypothesisTypes: [],
      weakHypothesisTypes: [],
      dismissedHypothesisTypes: [],
      acceptedSuggestionTypes: [],
      ignoredSuggestionTypes: [],
      history: [],
    };
  }
}

export function saveMetaFeedback(metaFeedback) {
  setItemOrThrow(META_FEEDBACK_KEY, JSON.stringify(metaFeedback), "el feedback meta");
}

export function loadBotCompilerState() {
  try {
    const raw = localStorage.getItem(BOT_COMPILER_KEY);
    if (!raw) return { patternMeta: {} };
    const parsed = JSON.parse(raw);
    return {
      patternMeta: parsed?.patternMeta && typeof parsed.patternMeta === "object" ? parsed.patternMeta : {},
    };
  } catch {
    return { patternMeta: {} };
  }
}

export function saveBotCompilerState(value) {
  const normalized = {
    patternMeta: value?.patternMeta && typeof value.patternMeta === "object" ? value.patternMeta : {},
  };
  setItemOrThrow(BOT_COMPILER_KEY, JSON.stringify(normalized), "la configuración del bot");
}


export function loadSessions(normalizeSession) {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return typeof normalizeSession === "function" ? parsed.map(normalizeSession) : parsed;
  } catch {
    return [];
  }
}

export function saveSessions(sessions) {
  setItemOrThrow(SESSIONS_KEY, JSON.stringify(Array.isArray(sessions) ? sessions : []), "las sesiones");
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
