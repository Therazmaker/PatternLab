const PATTERN_VERSIONS_KEY = "patternlab.patternVersions.v1";
const ACTIVE_PATTERN_VERSION_KEY = "patternlab.patternVersions.activeId.v1";

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function slugify(value) {
  return normalizeText(value, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "pattern";
}

function buildId(patternName, version) {
  return `${slugify(patternName)}__${slugify(version)}`;
}

export function createPatternVersionEntry(patternName, version, notes = "") {
  const cleanPatternName = normalizeText(patternName, "Unspecified pattern") || "Unspecified pattern";
  const cleanVersion = normalizeText(version, "v1") || "v1";
  return {
    id: buildId(cleanPatternName, cleanVersion),
    patternName: cleanPatternName,
    version: cleanVersion,
    displayName: `${cleanPatternName} • ${cleanVersion}`,
    notes: normalizeText(notes, ""),
    createdAt: Date.now(),
    isArchived: false,
  };
}

function normalizeEntry(input) {
  const base = createPatternVersionEntry(input?.patternName, input?.version, input?.notes);
  return {
    ...base,
    id: normalizeText(input?.id, base.id) || base.id,
    displayName: normalizeText(input?.displayName, base.displayName) || base.displayName,
    createdAt: Number(input?.createdAt) || base.createdAt,
    isArchived: Boolean(input?.isArchived),
  };
}

export function loadPatternVersionsRegistry() {
  const raw = localStorage.getItem(PATTERN_VERSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry);
  } catch {
    return [];
  }
}

export function savePatternVersionsRegistry(entries) {
  localStorage.setItem(PATTERN_VERSIONS_KEY, JSON.stringify(entries.map(normalizeEntry)));
}

export function loadActivePatternVersionId() {
  return normalizeText(localStorage.getItem(ACTIVE_PATTERN_VERSION_KEY), "");
}

export function saveActivePatternVersionId(id) {
  if (!id) localStorage.removeItem(ACTIVE_PATTERN_VERSION_KEY);
  else localStorage.setItem(ACTIVE_PATTERN_VERSION_KEY, id);
}

export function getVersionsForPattern(entries, patternName, options = {}) {
  const includeArchived = Boolean(options.includeArchived);
  return entries
    .filter((entry) => entry.patternName === patternName && (includeArchived || !entry.isArchived))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function ensurePatternVersionExists(entries, patternName, version, notes = "") {
  const cleanPatternName = normalizeText(patternName, "Unspecified pattern") || "Unspecified pattern";
  const cleanVersion = normalizeText(version, "v1") || "v1";
  const existing = entries.find((entry) => entry.patternName === cleanPatternName && entry.version === cleanVersion);
  if (existing) return { entries, entry: existing, created: false };
  const createdEntry = createPatternVersionEntry(cleanPatternName, cleanVersion, notes);
  return { entries: [...entries, createdEntry], entry: createdEntry, created: true };
}

export function rebuildPatternVersionsFromSignals(signals = [], existingEntries = []) {
  let entries = [...existingEntries];
  signals.forEach((signal) => {
    const patternName = normalizeText(signal?.patternName, "Unspecified pattern") || "Unspecified pattern";
    const version = normalizeText(signal?.patternVersion, "v1") || "v1";
    const result = ensurePatternVersionExists(entries, patternName, version);
    entries = result.entries;
  });
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

export function archivePatternVersion(entries, id, archived = true) {
  return entries.map((entry) => (entry.id === id ? { ...entry, isArchived: archived } : entry));
}

export function setActivePatternVersion(entries, id) {
  const exists = entries.some((entry) => entry.id === id && !entry.isArchived);
  return exists ? id : "";
}

export function getQuickAddVersionOptions(entries, patternName) {
  return getVersionsForPattern(entries, patternName).map((entry) => entry.version);
}

export function updatePatternVersionNotes(entries, id, notes) {
  return entries.map((entry) => (entry.id === id ? { ...entry, notes: normalizeText(notes, "") } : entry));
}
