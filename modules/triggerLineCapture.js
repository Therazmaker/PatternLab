const TRIGGER_LINES_STORAGE_KEY = "patternlab.sessionTriggerLines.v1";

function uid(prefix = "trigger") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function asString(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfig(raw = {}) {
  const role = ["breakout_confirmation", "failed_breakout_trigger", "rejection_trigger", "invalidation_line"].includes(raw.role)
    ? raw.role
    : "failed_breakout_trigger";
  const condition = ["if_break", "if_not_break", "if_rejects", "if_stays_below", "if_stays_above"].includes(raw.condition)
    ? raw.condition
    : "if_not_break";
  const biasOnTrigger = ["long", "short", "neutral"].includes(raw.biasOnTrigger)
    ? raw.biasOnTrigger
    : "neutral";
  const importance = ["low", "medium", "high"].includes(raw.importance)
    ? raw.importance
    : "medium";
  const confirmationMode = ["immediate", "candle_close", "follow_through"].includes(raw.confirmationMode)
    ? raw.confirmationMode
    : "candle_close";

  return {
    role,
    condition,
    biasOnTrigger,
    importance,
    confirmationMode,
    note: asString(raw.note, "").trim() || null,
  };
}

function normalizeTriggerLine(raw = {}, fallback = {}) {
  return {
    id: asString(raw.id, uid("trigger")),
    type: "trigger_line",
    linkedDrawingId: asString(raw.linkedDrawingId || fallback.linkedDrawingId, ""),
    level: asNumber(raw.level, asNumber(fallback.level, 0)) || 0,
    symbol: asString(raw.symbol || fallback.symbol, "UNKNOWN"),
    timeframe: asString(raw.timeframe || fallback.timeframe, "UNKNOWN"),
    triggerConfig: normalizeConfig(raw.triggerConfig || fallback.triggerConfig),
    runtimeState: {
      status: ["idle", "watching", "triggered", "invalidated"].includes(raw?.runtimeState?.status) ? raw.runtimeState.status : "idle",
      lastEvaluation: raw?.runtimeState?.lastEvaluation || null,
      lastReason: raw?.runtimeState?.lastReason || null,
    },
    metadata: {
      createdAt: raw?.metadata?.createdAt || new Date().toISOString(),
      source: "operator_manual",
      active: raw?.metadata?.active !== false,
    },
  };
}

export function loadTriggerLines() {
  try {
    const rows = JSON.parse(localStorage.getItem(TRIGGER_LINES_STORAGE_KEY) || "[]");
    return (Array.isArray(rows) ? rows : []).map((row) => normalizeTriggerLine(row)).filter((row) => Number.isFinite(Number(row.level)));
  } catch {
    return [];
  }
}

export function saveTriggerLines(triggerLines = []) {
  const rows = (Array.isArray(triggerLines) ? triggerLines : []).map((row) => normalizeTriggerLine(row));
  try { localStorage.setItem(TRIGGER_LINES_STORAGE_KEY, JSON.stringify(rows)); } catch {}
  return rows;
}

export function createTriggerLineFromDrawing(drawing = {}, formData = {}) {
  const level = asNumber(drawing?.price, asNumber(drawing?.points?.[0]?.price, null));
  if (!Number.isFinite(level)) return null;

  const triggerLine = normalizeTriggerLine({
    id: uid("trigger"),
    linkedDrawingId: drawing?.id || "",
    level,
    symbol: drawing?.metadata?.symbol || "UNKNOWN",
    timeframe: drawing?.metadata?.timeframe || "UNKNOWN",
    triggerConfig: formData,
    runtimeState: {
      status: "watching",
      lastEvaluation: new Date().toISOString(),
      lastReason: "created",
    },
    metadata: {
      createdAt: new Date().toISOString(),
      source: "operator_manual",
      active: true,
    },
  });

  const current = loadTriggerLines();
  const next = [...current.filter((row) => row.linkedDrawingId !== triggerLine.linkedDrawingId), triggerLine];
  saveTriggerLines(next);

  console.debug("Trigger line created", {
    triggerLineId: triggerLine.id,
    level: triggerLine.level,
    condition: triggerLine.triggerConfig.condition,
    resultingBias: triggerLine.triggerConfig.biasOnTrigger,
    confirmationResult: triggerLine.triggerConfig.confirmationMode,
  });

  return triggerLine;
}

export function updateTriggerLine(triggerLineId, patch = {}) {
  if (!triggerLineId) return null;
  const current = loadTriggerLines();
  let updated = null;
  const next = current.map((row) => {
    if (row.id !== triggerLineId) return row;
    updated = normalizeTriggerLine({
      ...row,
      ...patch,
      triggerConfig: {
        ...row.triggerConfig,
        ...(patch.triggerConfig || {}),
      },
      runtimeState: {
        ...row.runtimeState,
        ...(patch.runtimeState || {}),
      },
      metadata: {
        ...row.metadata,
        ...(patch.metadata || {}),
      },
    });
    return updated;
  });
  saveTriggerLines(next);
  return updated;
}

export function deleteTriggerLine(triggerLineId) {
  if (!triggerLineId) return false;
  const current = loadTriggerLines();
  const next = current.filter((row) => row.id !== triggerLineId);
  const changed = next.length !== current.length;
  if (changed) saveTriggerLines(next);
  return changed;
}

export function deleteTriggerLineByDrawingId(linkedDrawingId) {
  if (!linkedDrawingId) return false;
  const current = loadTriggerLines();
  const next = current.filter((row) => row.linkedDrawingId !== linkedDrawingId);
  const changed = next.length !== current.length;
  if (changed) saveTriggerLines(next);
  return changed;
}

export { TRIGGER_LINES_STORAGE_KEY };
