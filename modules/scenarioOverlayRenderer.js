function drawScenarioBand(ctx, points, toX, toY, color) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = toX(index + 1);
    const y = toY(point.price_high);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    ctx.lineTo(toX(i + 1), toY(point.price_low));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function lineColorForScenario(scenario, isPrimary) {
  if (scenario.status === "fulfilled") return "rgba(34,197,94,0.88)";
  if (scenario.status === "invalidated") return "rgba(239,68,68,0.7)";
  if (scenario.type.includes("short")) return isPrimary ? "rgba(248,113,113,0.75)" : "rgba(248,113,113,0.45)";
  if (scenario.type.includes("no_trade")) return isPrimary ? "rgba(148,163,184,0.75)" : "rgba(148,163,184,0.45)";
  return isPrimary ? "rgba(96,165,250,0.75)" : "rgba(96,165,250,0.45)";
}

export function renderScenarioOverlays(ctx, options = {}) {
  const {
    scenarioSet,
    maxVisible = 3,
    toY,
    anchorX,
    spacing,
  } = options;
  if (!scenarioSet?.scenarios?.length || typeof toY !== "function") return;

  const rows = scenarioSet.scenarios
    .slice()
    .sort((a, b) => b.probability - a.probability)
    .slice(0, Math.max(1, maxVisible));

  rows.forEach((scenario, index) => {
    const isPrimary = index === 0;
    const color = lineColorForScenario(scenario, isPrimary);
    const bandColor = color.replace(/0\.[0-9]+\)/, isPrimary ? "0.16)" : "0.08)");
    const points = (scenario.projected_path || []).slice(0, 8);
    const toX = (step) => anchorX + spacing * step;

    drawScenarioBand(ctx, points, toX, toY, bandColor);

    ctx.strokeStyle = color;
    ctx.lineWidth = isPrimary ? 2.1 : 1.2;
    ctx.setLineDash(isPrimary ? [] : [5, 5]);
    ctx.beginPath();
    points.forEach((point, pIdx) => {
      const x = toX(pIdx + 1);
      const y = toY(point.price_mid);
      if (pIdx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const labelPoint = points[0];
    if (!labelPoint) return;
    const lx = toX(1);
    const ly = toY(labelPoint.price_mid) - (isPrimary ? 14 : 9);
    const label = `${scenario.name} ${scenario.probability.toFixed(1)}%`;
    ctx.font = "10px 'JetBrains Mono',monospace";
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = "rgba(15,23,42,0.84)";
    ctx.beginPath();
    ctx.roundRect(lx - 4, ly - 11, tw, 16, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);

    if (scenario.status === "fulfilled" || scenario.status === "invalidated") {
      const marker = scenario.status === "fulfilled" ? "✓ fulfilled" : "✕ invalidated";
      ctx.fillStyle = scenario.status === "fulfilled" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)";
      ctx.fillText(marker, lx, ly + 14);
    }
  });
}
