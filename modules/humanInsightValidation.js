const ALLOWED_INSIGHT_TYPES = new Set(["rejection_setup", "pullback_setup", "breakout_setup", "invalidation"]);
const ALLOWED_CONDITIONS = new Set(["if_break", "if_not_break", "needs_confirmation"]);
const ALLOWED_BIAS = new Set(["long", "short", "neutral"]);

function clamp(value, min = 0, max = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function normalizeDirection(directionBias = "neutral") {
  const key = String(directionBias || "neutral").toLowerCase();
  if (ALLOWED_BIAS.has(key)) return key;
  return "neutral";
}

export function validateHumanInsight(insight = {}) {
  const issues = [];
  if (!insight || typeof insight !== "object") issues.push("insight_not_object");
  if (!insight?.id) issues.push("missing_id");
  if (!insight?.linkedDrawingId) issues.push("missing_linkedDrawingId");
  if (!ALLOWED_INSIGHT_TYPES.has(String(insight?.insightType || ""))) issues.push("invalid_insightType");
  if (!ALLOWED_CONDITIONS.has(String(insight?.condition?.type || ""))) issues.push("invalid_condition_type");
  if (!ALLOWED_BIAS.has(String(insight?.condition?.directionBias || "").toLowerCase())) issues.push("invalid_direction_bias");
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function normalizeHumanInsight(raw = {}, { drawingIds = [], defaultSymbol = "UNKNOWN", defaultTimeframe = "UNKNOWN" } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const selectedDrawing = String(raw.linkedDrawingId || "").trim();
  const directionBias = normalizeDirection(raw?.condition?.directionBias || raw?.directionBias || "neutral");
  const conditionType = ALLOWED_CONDITIONS.has(String(raw?.condition?.type || "")) ? raw.condition.type : "needs_confirmation";

  const normalized = {
    id: String(raw.id || `human_insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    linkedDrawingId: selectedDrawing || null,
    insightType: ALLOWED_INSIGHT_TYPES.has(String(raw.insightType || "")) ? raw.insightType : "pullback_setup",
    context: {
      reactionMemory: raw?.context?.reactionMemory || "medium",
      momentumState: raw?.context?.momentumState || "neutral",
      importance: raw?.context?.importance || "medium",
    },
    condition: {
      type: conditionType,
      directionBias,
    },
    activationRules: Array.isArray(raw.activationRules) ? [...new Set(raw.activationRules.filter(Boolean))] : ["price_near_line"],
    effect: {
      boostBias: Number(clamp(raw?.effect?.boostBias ?? 0.06, -1, 1).toFixed(3)),
      reduceOpposite: Number(clamp(raw?.effect?.reduceOpposite ?? 0.08, 0, 1).toFixed(3)),
      requireConfirmation: Boolean(raw?.effect?.requireConfirmation || conditionType === "needs_confirmation"),
      blockOpposite: Boolean(raw?.effect?.blockOpposite),
    },
    metadata: {
      createdAt: raw?.metadata?.createdAt || new Date().toISOString(),
      symbol: raw?.metadata?.symbol || defaultSymbol,
      timeframe: raw?.metadata?.timeframe || defaultTimeframe,
      isOrphaned: false,
      orphanReason: "",
      source: raw?.metadata?.source || "session-candle",
    },
  };

  if (!selectedDrawing || (drawingIds.length && !drawingIds.includes(selectedDrawing))) {
    normalized.metadata.isOrphaned = true;
    normalized.metadata.orphanReason = "missing_linked_drawing";
  }

  return normalized;
}

export function reconcileHumanInsights(insights = [], {
  drawingIds = [],
  symbol = "UNKNOWN",
  timeframe = "UNKNOWN",
  keepOrphaned = true,
} = {}) {
  const rows = [];
  const seenDrawing = new Set();

  (Array.isArray(insights) ? insights : []).forEach((raw) => {
    const normalized = normalizeHumanInsight(raw, { drawingIds, defaultSymbol: symbol, defaultTimeframe: timeframe });
    if (!normalized) return;

    if (seenDrawing.has(normalized.linkedDrawingId)) {
      return;
    }
    if (normalized.linkedDrawingId) seenDrawing.add(normalized.linkedDrawingId);

    if (normalized.metadata.isOrphaned && !keepOrphaned) {
      return;
    }

    rows.push(normalized);
  });

  return rows;
}
