function lineColor(drawing = {}, isSelected = false) {
  if (drawing.type === "horizontal_line") {
    return isSelected ? "rgba(255,255,255,1)" : "rgba(250,204,21,0.98)";
  }
  if (drawing.type === "trendline") return isSelected ? "rgba(255,255,255,1)" : "rgba(34,211,238,0.98)";
  if (drawing.type === "channel") return isSelected ? "rgba(255,255,255,1)" : "rgba(34,211,238,0.9)";
  return isSelected ? "rgba(255,255,255,1)" : "rgba(34,211,238,0.9)";
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

function parallelLine(baseA, baseB, probe) {
  const offset = ((probe.x - baseA.x) * (baseB.y - baseA.y) - (probe.y - baseA.y) * (baseB.x - baseA.x)) / (Math.hypot(baseB.x - baseA.x, baseB.y - baseA.y) || 1);
  const vx = baseB.x - baseA.x;
  const vy = baseB.y - baseA.y;
  const mag = Math.hypot(vx, vy) || 1;
  const nx = -vy / mag;
  const ny = vx / mag;
  return {
    offset,
    a: { x: baseA.x + nx * offset, y: baseA.y + ny * offset },
    b: { x: baseB.x + nx * offset, y: baseB.y + ny * offset },
  };
}

function drawHandles(ctx, points = [], color = "#93c5fd") {
  ctx.save();
  points.forEach((p) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function normalizeDrawingPoint(point = {}) {
<<<<<<< codex/fix-rendering-of-manual-chart-drawings-8x7tge
  const rawTime = point?.time ?? point?.timestamp ?? point?.x;
  const numericTime = Number(rawTime);
  const parsedTime = Date.parse(String(rawTime ?? ""));
  const time = Number.isFinite(numericTime) ? numericTime : Number.isFinite(parsedTime) ? parsedTime : Number.NaN;
=======
  const time = Number(point?.time ?? point?.timestamp ?? point?.x);
>>>>>>> main
  const price = Number(point?.price ?? point?.value ?? point?.y);
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return { time, price };
}

export function renderDrawings(ctx, drawings = [], drawingState = {}, geometry = {}) {
  const chartW = Number(geometry.chartW || 0);
  const chartH = Number(geometry.chartH || 0);
  const padTop = Number(geometry.padTop || 0);
  const toScreen = geometry.chartToScreen;
  const debug = geometry.debug !== false;
  if (!ctx || !toScreen) return;

  if (debug) {
    console.debug("Drawing render pass start", {
      drawingsCount: Array.isArray(drawings) ? drawings.length : 0,
      lastDrawing: Array.isArray(drawings) && drawings.length ? drawings[drawings.length - 1] : null,
    });
  }

  drawings.forEach((drawing) => {
    const isSelected = drawingState.selectedDrawingId === drawing.id;
    const chartPoints = (drawing.points || []).map(normalizeDrawingPoint).filter(Boolean);
    if (!chartPoints.length) {
      if (debug) {
        console.debug("Drawing skipped: no valid chart points", {
          drawingId: drawing?.id ?? null,
          type: drawing?.type ?? null,
          rawPoints: drawing?.points ?? [],
        });
      }
      return;
    }
    const points = chartPoints.map((point) => toScreen(point)).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (!points.length) return;
    const color = drawing.type === "horizontal_line" ? "#ff00ff" : drawing.type === "trendline" ? "#00ffff" : lineColor(drawing, isSelected);
    const [a, b] = points;
    const inViewport = points.some((point) => point.x >= 0 && point.x <= chartW && point.y >= padTop && point.y <= padTop + chartH);
    if (debug) {
      console.debug("Rendering drawing", {
        drawingId: drawing.id,
        type: drawing.type,
        x1: Number(a?.x),
        y1: Number(a?.y),
        x2: Number(b?.x),
        y2: Number(b?.y),
        inViewport,
      });
      if (!inViewport) {
        console.debug("Drawing outside viewport", {
          drawingId: drawing.id,
          type: drawing.type,
          points,
          bounds: { left: 0, right: chartW, top: padTop, bottom: padTop + chartH },
        });
      }
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowBlur = isSelected ? 8 : 0;
    ctx.shadowColor = isSelected ? color : "transparent";
    ctx.globalAlpha = 1;

    if (drawing.type === "horizontal_line") {
      const y = points[0].y;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
    } else if (drawing.type === "trendline") {
      if (!a || !b) {
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (drawing.type === "channel") {
      const [a, b, c] = points;
      if (!a || !b) {
        ctx.restore();
        return;
      }
      const channel = c ? parallelLine(a, b, c) : null;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (channel) {
        ctx.beginPath();
        ctx.moveTo(channel.a.x, channel.a.y);
        ctx.lineTo(channel.b.x, channel.b.y);
        ctx.stroke();
        ctx.fillStyle = "rgba(250,204,21,0.08)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(channel.b.x, channel.b.y);
        ctx.lineTo(channel.a.x, channel.a.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (isSelected) drawHandles(ctx, points, color);
    drawing._bounds = {
      points,
      chartPoints,
      inViewport,
      chartW,
      chartH,
      padTop,
    };
    ctx.restore();
  });

  if (debug) {
    console.debug("Drawing render pass end", {
      drawingsCount: Array.isArray(drawings) ? drawings.length : 0,
    });
  }
}

export function renderDrawingDraft(ctx, drawingState = {}, geometry = {}) {
  const draft = drawingState.drawingDraft;
  const toScreen = geometry.chartToScreen;
  const chartW = Number(geometry.chartW || 0);
  if (!draft || !toScreen) return;

  const previewPoints = (draft.previewPoints || draft.points || []).map((point) => toScreen(point)).filter(Boolean);
  if (!previewPoints.length) return;

  ctx.save();
  ctx.strokeStyle = "rgba(251,191,36,0.9)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);

  if (draft.type === "horizontal_line") {
    const y = previewPoints[previewPoints.length - 1].y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartW, y);
    ctx.stroke();
  } else if (draft.type === "trendline") {
    if (previewPoints.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(previewPoints[0].x, previewPoints[0].y);
      ctx.lineTo(previewPoints[1].x, previewPoints[1].y);
      ctx.stroke();
    }
  } else if (draft.type === "channel") {
    if (previewPoints.length >= 2) {
      const [a, b] = previewPoints;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (previewPoints[2]) {
        const channel = parallelLine(a, b, previewPoints[2]);
        ctx.beginPath();
        ctx.moveTo(channel.a.x, channel.a.y);
        ctx.lineTo(channel.b.x, channel.b.y);
        ctx.stroke();
      }
    }
  }

  drawHandles(ctx, previewPoints, "rgba(251,191,36,0.95)");
  ctx.restore();
}

export function hitTestDrawing(drawings = [], point = { x: 0, y: 0 }, chartToScreen) {
  const ordered = [...drawings].reverse();
  for (const drawing of ordered) {
    const pts = (drawing.points || []).map((p) => chartToScreen?.(p)).filter(Boolean);
    if (!pts.length) continue;
    if (drawing.type === "horizontal_line") {
      if (Math.abs(point.y - pts[0].y) <= 8) return drawing;
      continue;
    }
    if (drawing.type === "trendline" && pts[1]) {
      if (distancePointToSegment(point, pts[0], pts[1]) <= 8) return drawing;
      continue;
    }
    if (drawing.type === "channel" && pts[1]) {
      if (distancePointToSegment(point, pts[0], pts[1]) <= 8) return drawing;
      if (pts[2]) {
        const top = parallelLine(pts[0], pts[1], pts[2]);
        if (distancePointToSegment(point, top.a, top.b) <= 8) return drawing;
      }
    }
  }
  return null;
}
