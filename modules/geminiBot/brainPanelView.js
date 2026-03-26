function esc(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function fmtDate(value) {
  if (!value) return "n/a";
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return "n/a";
  return ts.toLocaleString();
}

function topReasons(map = {}, limit = 5) {
  return Object.entries(map || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, limit);
}

function drawGrowthChart(canvas, growth = []) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.clientWidth || 920;
  const height = canvas.clientHeight || 260;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  if (!growth.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("Sin datos de crecimiento persistidos todavía", 20, 26);
    return;
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = Math.max(
    1,
    ...growth.flatMap((row) => [
      Number(row.trainedTotal || 0),
      Number(row.skippedTotal || 0),
      Number(row.errorTotal || 0),
      Number(row.neuronsTotal || 0),
    ]),
  );

  const series = [
    { key: "trainedTotal", color: "#22c55e", label: "Entrenados" },
    { key: "skippedTotal", color: "#f59e0b", label: "Omitidos" },
    { key: "errorTotal", color: "#ef4444", label: "Errores" },
    { key: "neuronsTotal", color: "#60a5fa", label: "Neuronas" },
  ];

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + innerH);
  ctx.lineTo(padding.left + innerW, padding.top + innerH);
  ctx.stroke();

  const toX = (index) => padding.left + ((growth.length === 1 ? 0 : index / (growth.length - 1)) * innerW);
  const toY = (value) => padding.top + innerH - ((Number(value || 0) / maxY) * innerH);

  series.forEach((line, lineIndex) => {
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    growth.forEach((point, index) => {
      const x = toX(index);
      const y = toY(point[line.key]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = line.color;
    ctx.font = "11px sans-serif";
    ctx.fillText(line.label, padding.left + (lineIndex * 95), height - 8);
  });
}

export function renderBrainPanel(snapshot = {}, elements = {}) {
  const stats = snapshot.stats || {};
  const state = snapshot.state || {};
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const growth = Array.isArray(snapshot.growth) ? snapshot.growth : [];

  if (elements.summary) {
    const cards = [
      ["Aprendido / Entrenado", Number(stats.trainedCount || 0)],
      ["Omitido", Number(stats.skippedCount || 0)],
      ["Errores", Number(stats.errorCount || 0)],
      ["Neuronas guardadas", Number(stats.neuronsSavedCount || 0)],
      ["Última actividad", fmtDate(stats.lastActivityAt || stats.lastUpdatedAt)],
      ["Última pérdida", Number.isFinite(Number(stats.lastTrainLoss)) ? Number(stats.lastTrainLoss).toFixed(4) : "n/a"],
      ["Última precisión", Number.isFinite(Number(stats.lastTrainAcc)) ? `${(Number(stats.lastTrainAcc) * 100).toFixed(2)}%` : "n/a"],
      ["Estado del cerebro", state.brainReady ? "activo" : "inicializado"],
    ];
    elements.summary.innerHTML = cards.map(([label, value]) => `<div class="stat-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  }

  if (elements.badges) {
    const isRehydrated = Boolean(state.lastHydratedAt);
    elements.badges.innerHTML = [
      `<span class="badge ${isRehydrated ? "health-ok" : "health-warn"}">${isRehydrated ? "rehydrated" : "initialized"}</span>`,
      `<span class="badge ${state.brainReady ? "health-ok" : "health-warn"}">${state.brainReady ? "brain ready" : "brain pending"}</span>`,
      `<span class="badge">session: ${esc(state.lastSessionId || "n/a")}</span>`,
    ].join(" ");
  }

  const patternRows = Object.values(stats.patternStats || {}).sort((a, b) => Number(b.totalSamples || 0) - Number(a.totalSamples || 0));
  if (elements.patternBody) {
    elements.patternBody.innerHTML = patternRows.length
      ? patternRows.map((row) => `
        <tr>
          <td>${esc(row.patternName || "unknown")}</td>
          <td>${Number(row.totalSamples || 0)}</td>
          <td>${Number(row.wins || 0)}</td>
          <td>${Number(row.losses || 0)}</td>
          <td>${(Number(row.winRate || 0) * 100).toFixed(1)}%</td>
          <td>${Number(row.learnedCount || 0)}</td>
          <td>${Number(row.skippedCount || 0)}</td>
          <td>${Number(row.errorCount || 0)}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="8" class="muted">Sin datos por patrón todavía.</td></tr>';
  }

  const skipReasons = topReasons(stats.reasonStats?.skip || {});
  const lossReasons = topReasons(stats.reasonStats?.loss || {});
  const successReasons = topReasons(stats.reasonStats?.success || {});
  if (elements.reasons) {
    elements.reasons.innerHTML = `
      <div><h4>Top skip reasons</h4><ul>${skipReasons.length ? skipReasons.map(([key, count]) => `<li>${esc(key)} · ${count}</li>`).join("") : '<li class="muted">n/a</li>'}</ul></div>
      <div><h4>Top loss reasons</h4><ul>${lossReasons.length ? lossReasons.map(([key, count]) => `<li>${esc(key)} · ${count}</li>`).join("") : '<li class="muted">n/a</li>'}</ul></div>
      <div><h4>Top success reasons</h4><ul>${successReasons.length ? successReasons.map(([key, count]) => `<li>${esc(key)} · ${count}</li>`).join("") : '<li class="muted">n/a</li>'}</ul></div>
    `;
  }

  if (elements.historyBody) {
    elements.historyBody.innerHTML = events.length
      ? events.map((row) => `
        <tr>
          <td>${esc(fmtDate(row.timestamp))}</td>
          <td>${esc(row.type || "n/a")}</td>
          <td>${esc(row.patternName || "n/a")}</td>
          <td>${esc(row.reasonCode || "n/a")}</td>
          <td>${esc(row.outcome || "n/a")}</td>
          <td>${esc(row.details || row.meta?.message || "")}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="6" class="muted">Sin eventos persistidos.</td></tr>';
  }

  drawGrowthChart(elements.chart, growth);
  console.info("[BrainPanel] render completed");
}
