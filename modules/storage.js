import { dedupeSignals, migrateStoredSignal } from "./normalizer.js";

const SIGNALS_KEY = "patternlab.signals.v1";
const LAST_IMPORT_REPORT_KEY = "patternlab.lastImportReport";

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
  localStorage.setItem(SIGNALS_KEY, JSON.stringify(signals));
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
  localStorage.setItem(LAST_IMPORT_REPORT_KEY, JSON.stringify(report));
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
