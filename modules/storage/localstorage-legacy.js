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
  seededPatterns: "patternlab.seededPatterns.v1",
  seededPatternResults: "patternlab.seededPatternResults.v1",
  livePatternSignals: "patternlab.livePatternSignals.v1",
  livePatternSummary: "patternlab.livePatternSummary.v1",
  futuresPolicyConfig: "patternlab.futuresPolicyConfig.v1",
  futuresPolicySnapshots: "patternlab.futuresPolicySnapshots.v1",
  liveShadowState: "patternlab.liveShadowState.v1",
  strategyRuns: "patternlab.strategyRuns.v1",
  tradeMemories: "patternlab.tradeMemories.v1",
  decisionMemories: "patternlab.decisionMemories.v1",
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
    seededPatterns: parseJson(localStorage.getItem(LEGACY_KEYS.seededPatterns), []),
    seededPatternResults: parseJson(localStorage.getItem(LEGACY_KEYS.seededPatternResults), []),
    livePatternSignals: parseJson(localStorage.getItem(LEGACY_KEYS.livePatternSignals), []),
    livePatternSummary: parseJson(localStorage.getItem(LEGACY_KEYS.livePatternSummary), []),
    futuresPolicyConfig: parseJson(localStorage.getItem(LEGACY_KEYS.futuresPolicyConfig), null),
    futuresPolicySnapshots: parseJson(localStorage.getItem(LEGACY_KEYS.futuresPolicySnapshots), []),
    liveShadowState: parseJson(localStorage.getItem(LEGACY_KEYS.liveShadowState), null),
    strategyRuns: parseJson(localStorage.getItem(LEGACY_KEYS.strategyRuns), []),
    tradeMemories: parseJson(localStorage.getItem(LEGACY_KEYS.tradeMemories), []),
    decisionMemories: parseJson(localStorage.getItem(LEGACY_KEYS.decisionMemories), []),
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
