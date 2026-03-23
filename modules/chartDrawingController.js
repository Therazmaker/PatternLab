const STORAGE_SCHEMA_VERSION = 1;

function uid(prefix = "drawing") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clonePoint(point = {}) {
  return {
    time: Number(point.time),
    price: Number(point.price),
  };
}

function getReferencePrice(drawing = {}) {
  if (drawing.type === "horizontal_line") return Number(drawing.points?.[0]?.price);
  if (drawing.type === "trendline") return Number(drawing.points?.[1]?.price ?? drawing.points?.[0]?.price);
  if (drawing.type === "channel") return Number(drawing.points?.[2]?.price ?? drawing.points?.[1]?.price ?? drawing.points?.[0]?.price);
  return Number.NaN;
}

export function normalizeDrawing(raw = {}, { symbol = "UNKNOWN", timeframe = "UNKNOWN" } = {}) {
  const points = Array.isArray(raw.points) ? raw.points.map(clonePoint).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price)) : [];
  const type = ["horizontal_line", "trigger_line", "trendline", "channel"].includes(raw.type) ? raw.type : "horizontal_line";
  const channelOffset = Number(raw?.extra?.channelOffset);

  const drawing = {
    id: raw.id || uid("drawing"),
    type,
    points,
    extra: {
      channelOffset: Number.isFinite(channelOffset) ? channelOffset : null,
    },
    metadata: {
      symbol: raw?.metadata?.symbol || symbol,
      timeframe: raw?.metadata?.timeframe || timeframe,
      createdAt: raw?.metadata?.createdAt || new Date().toISOString(),
      source: "operator_manual",
      active: raw?.metadata?.active !== false,
      schemaVersion: STORAGE_SCHEMA_VERSION,
    },
  };

  drawing.price = Number.isFinite(Number(raw.price)) ? Number(raw.price) : getReferencePrice(drawing);
  drawing.label = raw.label || (drawing.type === "horizontal_line" ? "H" : drawing.type === "trigger_line" ? "Trigger" : drawing.type === "trendline" ? "T" : "C");
  return drawing;
}

function requiredPoints(type = "horizontal_line") {
  if (type === "horizontal_line") return 1;
  if (type === "trigger_line") return 1;
  if (type === "trendline") return 2;
  if (type === "channel") return 3;
  return 1;
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  const px = start.x + t * dx;
  const py = start.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function channelTopPoint(baseA, baseB, offset) {
  const vx = baseB.x - baseA.x;
  const vy = baseB.y - baseA.y;
  const mag = Math.hypot(vx, vy) || 1;
  const nx = -vy / mag;
  const ny = vx / mag;
  return {
    a: { x: baseA.x + nx * offset, y: baseA.y + ny * offset },
    b: { x: baseB.x + nx * offset, y: baseB.y + ny * offset },
  };
}

export function createChartDrawingController({
  getContext,
  chartToScreen,
  onStateChange,
  onDrawingCreated,
  onDrawingDeleted,
  onDrawingsCleared,
  onDrawingSelected,
  onToolChange,
  log = console.debug,
} = {}) {
  const state = {
    activeTool: "select",
    drawings: [],
    selectedDrawingId: null,
    drawingDraft: null,
    isDrawingInProgress: false,
    pendingPointA: null,
    lastClickScreenCoords: null,
    lastClickChartCoords: null,
  };

  function emitState() {
    onStateChange?.({ ...state, drawings: state.drawings.map((item) => ({ ...item })) });
  }

  function drawingLog(label, drawing = null, extra = {}) {
    const ctx = getContext?.() || {};
    log(label, {
      drawingId: drawing?.id || extra?.drawingId || null,
      type: drawing?.type || extra?.type || null,
      points: drawing?.points || extra?.points || [],
      symbol: ctx.symbol || "UNKNOWN",
      timeframe: ctx.timeframe || "UNKNOWN",
      ...extra,
    });
  }

  function setTool(nextTool = "select") {
    const tool = ["select", "horizontal_line", "trigger_line", "trendline", "channel", "erase"].includes(nextTool) ? nextTool : "select";
    state.activeTool = tool;
    if (tool === "select" || tool === "erase") {
      state.drawingDraft = null;
      state.isDrawingInProgress = false;
      state.pendingPointA = null;
    }
    drawingLog("Tool selected", null, { activeTool: tool, type: tool });
    onToolChange?.(tool);
    emitState();
  }

  function setDrawings(rows = []) {
    const ctx = getContext?.() || {};
    state.drawings = rows.map((row) => normalizeDrawing(row, ctx));
    if (state.selectedDrawingId && !state.drawings.some((row) => row.id === state.selectedDrawingId)) {
      state.selectedDrawingId = null;
    }
    emitState();
  }

  function updateDrawings(rows = []) {
    state.drawings = rows;
    emitState();
  }

  function selectDrawing(drawing = null) {
    state.selectedDrawingId = drawing?.id || null;
    onDrawingSelected?.(drawing ? { ...drawing } : null);
    if (drawing) drawingLog("Drawing selected", drawing);
    emitState();
  }

  function clearDraft() {
    state.drawingDraft = null;
    state.isDrawingInProgress = false;
    state.pendingPointA = null;
    emitState();
  }

  function cancelDraft() {
    if (!state.isDrawingInProgress && !state.drawingDraft) return false;
    state.drawingDraft = null;
    state.isDrawingInProgress = false;
    state.pendingPointA = null;
    drawingLog("Drawing aborted", null, { reason: "canceled", type: state.activeTool });
    emitState();
    return true;
  }

  function completeDrawing(draft = null) {
    const points = draft?.points || [];
    const type = draft?.type || state.activeTool;
    if (points.length < requiredPoints(type)) return false;
    const ctx = getContext?.() || {};
    const drawing = normalizeDrawing({
      type,
      points,
      extra: draft?.extra || {},
      metadata: { symbol: ctx.symbol, timeframe: ctx.timeframe },
    }, ctx);
    const next = [...state.drawings, drawing];
    updateDrawings(next);
    state.selectedDrawingId = drawing.id;
    state.drawingDraft = null;
    state.isDrawingInProgress = false;
    drawingLog("Drawing complete", drawing);
    drawingLog("Drawing added to state", drawing, { totalDrawings: next.length });
    onDrawingCreated?.(drawing, next);
    drawingLog("Drawing callback fired", drawing, { callback: "onDrawingCreated" });
    emitState();
    return true;
  }

  function lineHitTest(drawing = {}, screenPoint = { x: 0, y: 0 }, threshold = 8) {
    const points = drawing.points || [];
    if (!points.length) return false;

    if (drawing.type === "horizontal_line" || drawing.type === "trigger_line") {
      const y = chartToScreen?.({ time: points[0].time, price: points[0].price })?.y;
      return Number.isFinite(y) ? Math.abs(screenPoint.y - y) <= threshold : false;
    }

    if (drawing.type === "trendline") {
      const a = chartToScreen?.(points[0]);
      const b = chartToScreen?.(points[1]);
      if (!a || !b) return false;
      return distancePointToSegment(screenPoint, a, b) <= threshold;
    }

    if (drawing.type === "channel") {
      const a = chartToScreen?.(points[0]);
      const b = chartToScreen?.(points[1]);
      const c = chartToScreen?.(points[2]);
      if (!a || !b || !c) return false;
      const offset = Math.sign((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) * distancePointToSegment(c, a, b);
      const upper = channelTopPoint(a, b, offset);
      return distancePointToSegment(screenPoint, a, b) <= threshold || distancePointToSegment(screenPoint, upper.a, upper.b) <= threshold;
    }

    return false;
  }

  function findDrawingAt(screenPoint = { x: 0, y: 0 }) {
    const rows = [...state.drawings].reverse();
    return rows.find((drawing) => lineHitTest(drawing, screenPoint)) || null;
  }

  function eraseDrawing(id = "") {
    if (!id) return false;
    const target = state.drawings.find((row) => row.id === id);
    if (!target) return false;
    const next = state.drawings.filter((row) => row.id !== id);
    updateDrawings(next);
    if (state.selectedDrawingId === id) state.selectedDrawingId = null;
    onDrawingDeleted?.(target, next);
    drawingLog("Drawing deleted", target);
    emitState();
    return true;
  }

  function clearDrawings() {
    if (!state.drawings.length) return false;
    const removedIds = state.drawings.map((row) => row.id);
    updateDrawings([]);
    state.selectedDrawingId = null;
    state.drawingDraft = null;
    state.isDrawingInProgress = false;
    onDrawingsCleared?.(removedIds, []);
    drawingLog("Drawing deleted", null, { drawingId: removedIds.join(","), type: "clear" });
    emitState();
    return true;
  }

  function pointerDown({ chartPoint, screenPoint, button = 0 } = {}) {
    if (!chartPoint || !screenPoint) {
      drawingLog("Drawing aborted", null, { reason: "missing_chart_or_screen_point" });
      return { consumed: false };
    }
    state.lastClickScreenCoords = { ...screenPoint };
    state.lastClickChartCoords = { ...chartPoint };
    drawingLog("Chart click received", null, { x: screenPoint.x, y: screenPoint.y, button });
    drawingLog("Chart coords mapped", null, { time: chartPoint.time, price: chartPoint.price });
    if (button === 2) {
      cancelDraft();
      return { consumed: true };
    }

    if (state.activeTool === "select") {
      const found = findDrawingAt(screenPoint);
      selectDrawing(found);
      return { consumed: Boolean(found) };
    }

    if (state.activeTool === "erase") {
      const found = findDrawingAt(screenPoint);
      if (found) {
        eraseDrawing(found.id);
        return { consumed: true };
      }
      return { consumed: false };
    }

    const type = state.activeTool;
    if (!state.drawingDraft) {
      state.drawingDraft = { type, points: [chartPoint], extra: { channelOffset: null } };
      state.isDrawingInProgress = requiredPoints(type) > 1;
      state.pendingPointA = requiredPoints(type) > 1 ? { ...chartPoint } : null;
      drawingLog("Drawing start", null, { type, pointA: state.pendingPointA || chartPoint });
      emitState();
      if (requiredPoints(type) === 1) {
        completeDrawing(state.drawingDraft);
      }
      return { consumed: true };
    }

    const nextPoints = [...state.drawingDraft.points, chartPoint];
    state.drawingDraft = {
      ...state.drawingDraft,
      points: nextPoints,
    };
    const targetPoints = requiredPoints(type);
    if (nextPoints.length >= targetPoints) {
      if (type === "channel") {
        state.drawingDraft.extra = {
          ...state.drawingDraft.extra,
          channelOffset: nextPoints[2].price - nextPoints[1].price,
        };
      }
      completeDrawing(state.drawingDraft);
      state.pendingPointA = null;
    } else {
      state.isDrawingInProgress = true;
      state.pendingPointA = nextPoints[0] ? { ...nextPoints[0] } : null;
      emitState();
    }
    return { consumed: true };
  }

  function pointerMove({ chartPoint } = {}) {
    if (!chartPoint || !state.drawingDraft) return;
    const type = state.drawingDraft.type;
    const points = state.drawingDraft.points || [];
    const previewPoints = [...points, chartPoint];
    state.drawingDraft = {
      ...state.drawingDraft,
      previewPoints,
    };
    if (type === "channel" && points.length >= 2) {
      state.drawingDraft.extra = {
        ...state.drawingDraft.extra,
        channelOffset: chartPoint.price - points[1].price,
      };
    }
    emitState();
  }

  return {
    state,
    setTool,
    setDrawings,
    selectDrawing,
    cancelDraft,
    pointerDown,
    pointerMove,
    clearDrawings,
    eraseDrawing,
  };
}
