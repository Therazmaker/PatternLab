const STORAGE_KEY = "patternlab.manualControls.v1";

const LEARNING_MODES = new Set(["exploration", "mixed", "exploitation"]);

export const DEFAULT_MANUAL_CONTROLS = Object.freeze({
  confidence_boost: 0,
  risk_multiplier_override: 1,
  exploration_bias_override: 0.7,
  exploitation_bias_override: 0.3,
  force_learning_mode: null,
  disable_context_blocking: false,
  max_risk_cap: 1,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function normalizeManualControls(raw = {}) {
  const forcedMode = raw?.force_learning_mode === null || raw?.force_learning_mode === undefined || raw?.force_learning_mode === ""
    ? null
    : String(raw.force_learning_mode).toLowerCase();
  return {
    confidence_boost: Number(clamp(raw?.confidence_boost, -0.2, 0.2).toFixed(3)),
    risk_multiplier_override: Number(clamp(raw?.risk_multiplier_override, 0.5, 1.5).toFixed(3)),
    exploration_bias_override: Number(clamp(raw?.exploration_bias_override, 0, 1).toFixed(3)),
    exploitation_bias_override: Number(clamp(raw?.exploitation_bias_override, 0, 1).toFixed(3)),
    force_learning_mode: forcedMode && LEARNING_MODES.has(forcedMode) ? forcedMode : null,
    disable_context_blocking: Boolean(raw?.disable_context_blocking),
    max_risk_cap: Number(clamp(raw?.max_risk_cap, 0, 1).toFixed(3)),
  };
}

export function loadManualControls() {
  if (typeof localStorage === "undefined") return { ...DEFAULT_MANUAL_CONTROLS };
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY), {});
  return normalizeManualControls({ ...DEFAULT_MANUAL_CONTROLS, ...(parsed || {}) });
}

export function saveManualControls(next = {}) {
  const normalized = normalizeManualControls(next);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
  }
  return normalized;
}

let memoryState = loadManualControls();

export function getManualControls() {
  return { ...memoryState };
}

export function setManualControls(patch = {}) {
  memoryState = saveManualControls({ ...memoryState, ...(patch || {}) });
  return getManualControls();
}

export function resetManualControls() {
  memoryState = saveManualControls({ ...DEFAULT_MANUAL_CONTROLS });
  return getManualControls();
}

export function hasActiveManualOverrides(controls = memoryState) {
  const row = normalizeManualControls(controls);
  return (
    Math.abs(Number(row.confidence_boost || 0)) > 0.0001
    || Math.abs(Number(row.risk_multiplier_override || 1) - 1) > 0.0001
    || row.force_learning_mode !== null
    || Boolean(row.disable_context_blocking)
    || Number(row.max_risk_cap || 1) < 0.999
  );
}
