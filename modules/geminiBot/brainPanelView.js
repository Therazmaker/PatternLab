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

const EVENT_TYPE_BADGE = {
  training_event: "bp-badge-trained",
  trained: "bp-badge-trained",
  skipped: "bp-badge-skipped",
  queued: "bp-badge-neuron",
  error: "bp-badge-error",
  neuron_saved: "bp-badge-neuron",
  diagnosis: "bp-badge-diagnosis",
};

function eventTypeBadge(type) {
  const cls = EVENT_TYPE_BADGE[type] || "bp-badge-diagnosis";
  return `<span class="bp-event-badge ${cls}">${esc(type || "n/a")}</span>`;
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
    ctx.fillStyle = "#475569";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sin datos de crecimiento persistidos todavía", width / 2, height / 2 - 8);
    ctx.fillStyle = "#334155";
    ctx.font = "11px sans-serif";
    ctx.fillText("Activa el bot y entrena para ver el gráfico de evolución", width / 2, height / 2 + 12);
    ctx.textAlign = "left";
    return;
  }

  const padding = { top: 28, right: 20, bottom: 36, left: 48 };
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

  // Y-axis gridlines and labels
  const gridCount = 5;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= gridCount; i++) {
    const yVal = (maxY * i) / gridCount;
    const y = padding.top + innerH - (i / gridCount) * innerH;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + innerW, y);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.fillText(Math.round(yVal), padding.left - 6, y + 3.5);
  }
  ctx.textAlign = "left";

  // Axes
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + innerH);
  ctx.lineTo(padding.left + innerW, padding.top + innerH);
  ctx.stroke();

  // Center single data points at the midpoint; otherwise distribute across the full width
  const toX = (index) => padding.left + ((growth.length === 1 ? 0.5 : index / (growth.length - 1)) * innerW);
  const toY = (value) => padding.top + innerH - ((Number(value || 0) / maxY) * innerH);

  // Draw lines
  series.forEach((line) => {
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    growth.forEach((point, index) => {
      const x = toX(index);
      const y = toY(point[line.key]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // Legend inside canvas (top-left) — each item is spaced by LEGEND_ITEM_WIDTH pixels
  const LEGEND_ITEM_WIDTH = 105;
  const legendX = padding.left + 8;
  let legendY = padding.top + 4;
  ctx.font = "bold 10px sans-serif";
  series.forEach((line, i) => {
    const lx = legendX + i * LEGEND_ITEM_WIDTH;
    ctx.fillStyle = line.color;
    ctx.fillRect(lx, legendY, 10, 10);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(line.label, lx + 14, legendY + 9);
  });

  // X-axis timestamp labels (first and last)
  ctx.textAlign = "left";
  ctx.fillStyle = "#475569";
  ctx.font = "9px sans-serif";
  if (growth[0]?.timestamp) {
    ctx.fillText(fmtDate(growth[0].timestamp).slice(0, 10), padding.left, height - 6);
  }
  if (growth.length > 1 && growth[growth.length - 1]?.timestamp) {
    const lastLabel = fmtDate(growth[growth.length - 1].timestamp).slice(0, 10);
    ctx.textAlign = "right";
    ctx.fillText(lastLabel, padding.left + innerW, height - 6);
  }
  ctx.textAlign = "left";
}

const STAT_CARD_META = [
  { key: "trainedCount", label: "Aprendido / Entrenado", icon: "🧠", metric: "trained" },
  { key: "skippedCount", label: "Omitido", icon: "⚠️", metric: "skipped" },
  { key: "errorCount", label: "Errores", icon: "❌", metric: "error" },
  { key: "neuronsSavedCount", label: "Neuronas guardadas", icon: "⚡", metric: "neuron" },
  { key: "__lastActivity", label: "Última actividad", icon: "🕐", metric: "time" },
  { key: "__lastLoss", label: "Última pérdida (loss)", icon: "📉", metric: "loss" },
  { key: "__lastAcc", label: "Última precisión (acc)", icon: "📈", metric: "acc" },
  { key: "__brainState", label: "Estado del cerebro", icon: "🔵", metric: "state" },
];

function hasPersistentHistory(stats, state) {
  return Boolean(state.lastHydratedAt) && (Number(stats.trainedCount || 0) + Number(stats.skippedCount || 0) + Number(stats.errorCount || 0)) > 0;
}

function buildStatCardValue(key, stats, state) {
  if (key === "__lastActivity") return fmtDate(stats.lastActivityAt || stats.lastUpdatedAt);
  if (key === "__lastLoss") return Number.isFinite(Number(stats.lastTrainLoss)) ? Number(stats.lastTrainLoss).toFixed(4) : "n/a";
  if (key === "__lastAcc") return Number.isFinite(Number(stats.lastTrainAcc)) ? `${(Number(stats.lastTrainAcc) * 100).toFixed(2)}%` : "n/a";
  if (key === "__brainState") {
    if (!state.brainReady) return "inicializado";
    return hasPersistentHistory(stats, state) ? "rehidratado" : "activo";
  }
  return String(Number(stats[key] || 0));
}

export function renderBrainPanel(snapshot = {}, elements = {}) {
  const stats = snapshot.stats || {};
  const state = snapshot.state || {};
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const growth = Array.isArray(snapshot.growth) ? snapshot.growth : [];

  const filterType = elements.filterType || "";
  const filterPattern = (elements.filterPattern || "").trim().toLowerCase();

  if (elements.summary) {
    elements.summary.innerHTML = STAT_CARD_META.map(({ key, label, icon, metric }) => {
      const value = buildStatCardValue(key, stats, state);
      return `<div class="stat-card bp-stat-card bp-stat-${metric}"><span>${esc(icon)} ${esc(label)}</span><strong>${esc(value)}</strong></div>`;
    }).join("");
  }

  if (elements.badges) {
    const hydrated = hasPersistentHistory(stats, state);
    const brainStatusLabel = hydrated ? "rehydrated" : "initialized";
    elements.badges.innerHTML = [
      `<span class="badge ${hydrated ? "health-ok" : "health-warn"}">${brainStatusLabel}</span>`,
      `<span class="badge ${state.brainReady ? "health-ok" : "health-warn"}">${state.brainReady ? "brain ready" : "brain pending"}</span>`,
      state.lastSessionId ? `<span class="badge">session: ${esc(state.lastSessionId)}</span>` : "",
      state.version ? `<span class="badge bp-badge-diagnosis">v${esc(state.version)}</span>` : "",
    ].filter(Boolean).join(" ");
  }

  const patternRows = Object.values(stats.patternStats || {}).sort((a, b) => Number(b.totalSamples || 0) - Number(a.totalSamples || 0));
  if (elements.patternBody) {
    elements.patternBody.innerHTML = patternRows.length
      ? patternRows.map((row) => {
        const wr = Number(row.winRate || 0) * 100;
        const wrClass = wr >= 55 ? "bp-wr-good" : wr >= 45 ? "bp-wr-mid" : "bp-wr-bad";
        return `<tr>
          <td>${esc(row.patternName || "unknown")}</td>
          <td>${Number(row.totalSamples || 0)}</td>
          <td class="bp-col-win">${Number(row.wins || 0)}</td>
          <td class="bp-col-loss">${Number(row.losses || 0)}</td>
          <td class="${wrClass}">${wr.toFixed(1)}%</td>
          <td>${Number(row.learnedCount || 0)}</td>
          <td>${Number(row.skippedCount || 0)}</td>
          <td>${Number(row.errorCount || 0)}</td>
        </tr>`;
      }).join("")
      : '<tr><td colspan="8" class="muted">Sin datos por patrón todavía.</td></tr>';
  }

  const skipReasons = topReasons(stats.reasonStats?.training || {});
  const lossReasons = topReasons(stats.reasonStats?.tradeLoss || {});
  const successReasons = topReasons(stats.reasonStats?.success || {});
  if (elements.reasons) {
    elements.reasons.innerHTML = `
      <div>
        <h4>⚠️ Top skip reasons</h4>
        <ul>${skipReasons.length ? skipReasons.map(([key, count]) => `<li><span class="bp-reason-key">${esc(key)}</span><span class="bp-reason-count">${count}</span></li>`).join("") : '<li class="muted">n/a</li>'}</ul>
      </div>
      <div>
        <h4>📉 Top loss reasons</h4>
        <ul>${lossReasons.length ? lossReasons.map(([key, count]) => `<li><span class="bp-reason-key">${esc(key)}</span><span class="bp-reason-count">${count}</span></li>`).join("") : '<li class="muted">n/a</li>'}</ul>
      </div>
      <div>
        <h4>✅ Top success reasons</h4>
        <ul>${successReasons.length ? successReasons.map(([key, count]) => `<li><span class="bp-reason-key">${esc(key)}</span><span class="bp-reason-count">${count}</span></li>`).join("") : '<li class="muted">n/a</li>'}</ul>
      </div>
    `;
  }

  if (elements.historyBody) {
    const filteredEvents = events.filter((row) => {
      if (filterType && row.type !== filterType) return false;
      if (filterPattern && !(row.patternName || "").toLowerCase().includes(filterPattern)) return false;
      return true;
    });
    elements.historyBody.innerHTML = filteredEvents.length
      ? filteredEvents.map((row) => `
        <tr>
          <td class="bp-col-ts">${esc(fmtDate(row.timestamp))}</td>
          <td>${eventTypeBadge(row.type)}</td>
          <td>${esc(row.patternName || "n/a")}</td>
          <td>${esc(row.modelTarget || "n/a")}</td>
          <td>${row.tradeOutcome === "win" ? '<span class="bp-outcome-win">win</span>' : row.tradeOutcome === "loss" ? '<span class="bp-outcome-loss">loss</span>' : esc(row.tradeOutcome || "n_a")}</td>
          <td>${esc(row.trainingStatus || "n/a")}</td>
          <td class="muted">${esc(row.trainingReason || row.reasonCode || "n/a")}</td>
          <td class="muted">${esc(row.detail || row.details || row.meta?.message || "")}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="8" class="muted">${filterType || filterPattern ? "Sin eventos para este filtro." : "Sin eventos persistidos."}</td></tr>`;
  }

  drawGrowthChart(elements.chart, growth);
  console.info("[BrainPanel] render completed");
}
