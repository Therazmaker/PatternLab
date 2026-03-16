export const LEGACY_KEYS = {
  signals: "patternlab.signals.v1",
  sessions: "patternlab.sessions.v1",
  patternVersions: "patternlab.patternVersions.v1",
  activePatternVersionId: "patternlab.patternVersions.activeId.v1",
  notes: "patternlab.notes.v1",
  lastImportReport: "patternlab.lastImportReport",
  metaFeedback: "patternlab.metaFeedback.v1",
  botCompiler: "patternlab.botCompiler.v1",
  promotedPatterns: "patternlab.promotedPatterns.v1",
};

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readLegacySnapshot() {
  return {
    signals: parseJson(localStorage.getItem(LEGACY_KEYS.signals), []),
    sessions: parseJson(localStorage.getItem(LEGACY_KEYS.sessions), []),
    patternVersions: parseJson(localStorage.getItem(LEGACY_KEYS.patternVersions), []),
    activePatternVersionId: localStorage.getItem(LEGACY_KEYS.activePatternVersionId) || "",
    notes: parseJson(localStorage.getItem(LEGACY_KEYS.notes), []),
    lastImportReport: parseJson(localStorage.getItem(LEGACY_KEYS.lastImportReport), null),
    metaFeedback: parseJson(localStorage.getItem(LEGACY_KEYS.metaFeedback), null),
    botCompiler: parseJson(localStorage.getItem(LEGACY_KEYS.botCompiler), null),
    promotedPatterns: parseJson(localStorage.getItem(LEGACY_KEYS.promotedPatterns), []),
  };
}

export function hasLegacyData() {
  return Object.values(LEGACY_KEYS).some((key) => {
    const raw = localStorage.getItem(key);
    return raw && raw !== "[]" && raw !== "{}";
  });
}

export function clearLegacyData() {
  Object.values(LEGACY_KEYS).forEach((key) => localStorage.removeItem(key));
}

export function writeLegacyValue(key, value) {
  if (value === null || value === undefined || value === "") {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
}
