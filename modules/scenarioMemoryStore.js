const STORAGE_KEY = "patternlab.scenarioMemory.v1";
const STATS_KEY = "patternlab.scenarioContextStats.v1";
const MAX_ROWS = 600;

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readRows() {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY), []);
}

function writeRows(rows) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
}

function readStats() {
  if (typeof localStorage === "undefined") return {};
  return safeParse(localStorage.getItem(STATS_KEY), {});
}

function writeStats(stats) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats || {}));
}

export function getScenarioMemoryRows() {
  return readRows();
}

export function getScenarioContextStats() {
  return readStats();
}

export function setScenarioContextStats(stats = {}) {
  writeStats(stats);
}

export function saveScenarioResolution(entry) {
  if (!entry || typeof entry !== "object") return null;
  const normalized = {
    schema: "patternlab_scenario_memory_v1",
    scenario_id: String(entry.scenario_id || ""),
    created_at: entry.created_at || new Date().toISOString(),
    resolved_at: entry.resolved_at || new Date().toISOString(),
    context_signature: entry.context_signature || "unknown_context",
    regime: entry.regime || "unknown",
    momentum: entry.momentum || "flat",
    volatility: entry.volatility || "normal",
    structure_position: entry.structure_position || "mid_range",
    scenario_type: entry.scenario_type || "chop_no_trade",
    probability_at_creation: Number(entry.probability_at_creation || 0),
    final_status: entry.final_status || "unresolved",
    outcome_quality: Number(entry.outcome_quality || 0),
    matched_trigger: Boolean(entry.matched_trigger),
    matched_invalidation: Boolean(entry.matched_invalidation),
    move_extent: Number(entry.move_extent || 0),
    resolution_candles: Number(entry.resolution_candles || 0),
    human_action: entry.human_action || "none",
    human_override: entry.human_override || "none",
    lesson_tags: Array.isArray(entry.lesson_tags) ? entry.lesson_tags.slice(0, 8) : [],
  };
  const rows = readRows();
  rows.push(normalized);
  writeRows(rows);
  return normalized;
}

export function getLastResolvedScenarios(limit = 5) {
  return readRows()
    .slice()
    .sort((a, b) => Number(new Date(b.resolved_at || 0)) - Number(new Date(a.resolved_at || 0)))
    .slice(0, Math.max(1, Number(limit) || 5));
}

export function clearScenarioMemory() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STATS_KEY);
}
