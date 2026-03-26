/**
 * Genetic Optimizer Panel — renders UI for the Evolución Genética section inside GeminiBot.
 * Manages fitness chart, results table, diff view and run history table.
 */

import { GENOME_SCHEMA } from "./geneticOptimizer.js";

const GENE_LABELS = {
  bullish_consecutive_weight:   "Peso bullish streak",
  bearish_consecutive_weight:   "Peso bearish streak",
  bullish_engulfing_weight:     "Peso engulfing alcista",
  bearish_engulfing_weight:     "Peso engulfing bajista",
  doji_weight:                  "Peso doji",
  volume_spike_weight:          "Peso volume spike",
  momentum_acceleration_weight: "Peso momentum acc.",
  min_sample_threshold:         "Min muestras (gate)",
  win_rate_bias_threshold:      "Umbral win rate",
  confidence_gate:              "Umbral confianza",
  low_volume_penalty:           "Penalización volumen bajo",
  overbought_penalty:           "Penalización sobrecompra",
  ema_aligned_bonus:            "Bonus EMA alineada",
  volume_spike_bonus:           "Bonus volume spike",
};

function fmt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3);
}

function fmtPct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function createGeneticOptimizerPanel(elements = {}) {
  let fitnessChartData = { history: [] };

  // ── Fitness chart ────────────────────────────────────────────────────────────
  function drawFitnessChart(history = []) {
    const canvas = elements.fitnessChart;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width  = canvas.offsetWidth  || 600;
    const H = canvas.height = canvas.offsetHeight || 120;

    ctx.clearRect(0, 0, W, H);

    if (!history.length) {
      ctx.fillStyle = "#555";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Sin datos de evolución aún", W / 2, H / 2);
      return;
    }

    const padL = 40, padR = 10, padT = 10, padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allValues = history.flatMap((p) => [p.bestFitness, p.avgFitness]).filter(Number.isFinite);
    const minVal = Math.max(0, Math.min(...allValues) - 0.02);
    const maxVal = Math.min(1, Math.max(...allValues) + 0.02);
    const rangeVal = maxVal - minVal || 0.01;

    const xScale = (i) => padL + (i / Math.max(1, history.length - 1)) * plotW;
    const yScale = (v) => padT + plotH - ((v - minVal) / rangeVal) * plotH;

    // Grid lines
    ctx.strokeStyle = "#2a2d3a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padT + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      const label = fmt(maxVal - (i / 4) * rangeVal);
      ctx.fillStyle = "#666";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(label, padL - 3, y + 3);
    }

    // Avg line (dashed, grey)
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#7c85a0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.avgFitness);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Best line (solid, accent)
    ctx.strokeStyle = "#5b9cf6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.bestFitness);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Last point dot
    if (history.length > 0) {
      const last = history[history.length - 1];
      ctx.fillStyle = "#5b9cf6";
      ctx.beginPath();
      ctx.arc(xScale(history.length - 1), yScale(last.bestFitness), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // X-axis label
    ctx.fillStyle = "#555";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Gen 1", padL, H - 6);
    if (history.length > 1) {
      ctx.textAlign = "right";
      ctx.fillText(`Gen ${history.length}`, W - padR, H - 6);
    }

    // Legend
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#5b9cf6";
    ctx.fillText("— mejor", padL + 4, padT + 10);
    ctx.fillStyle = "#7c85a0";
    ctx.fillText("-- promedio", padL + 55, padT + 10);
  }

  // ── Results table ─────────────────────────────────────────────────────────────
  function renderResultsTable(top5 = []) {
    const tbody = elements.resultsTbody;
    if (!tbody) return;
    tbody.innerHTML = top5.map((ind, idx) => {
      const m = ind.metrics || {};
      return `<tr>
        <td>${idx + 1}</td>
        <td><strong>${fmtPct(ind.fitness)}</strong></td>
        <td>${fmtPct(m.weightedWinRate)}</td>
        <td>${fmtPct(m.stabilityScore)}</td>
        <td>${fmtPct(m.sampleCoverage)}</td>
        <td>${m.validPatternCount ?? "—"} patrones</td>
      </tr>`;
    }).join("");
    const section = elements.resultsSection;
    if (section) section.style.display = top5.length ? "" : "none";
  }

  // ── Diff table ────────────────────────────────────────────────────────────────
  function renderDiffTable(bestGenome, baselineGenome, baselineFitness) {
    const tbody = elements.diffTbody;
    const badge = elements.diffBadge;
    if (!tbody) return;

    const rows = Object.entries(GENOME_SCHEMA).map(([gene, schema]) => {
      const defaultVal = schema.default;
      const bestVal    = bestGenome?.[gene] ?? defaultVal;
      const delta      = bestVal - defaultVal;
      const absDelta   = Math.abs(delta);
      const sign       = delta > 0.001 ? "▲" : delta < -0.001 ? "▼" : "═";
      const highlight  = absDelta > (schema.max - schema.min) * 0.05
        ? (delta > 0 ? " style=\"color:#4caf7d\"" : " style=\"color:#e05252\"")
        : "";
      const label = GENE_LABELS[gene] || gene;
      return `<tr>
        <td>${label}</td>
        <td>${fmt(defaultVal)}</td>
        <td><strong>${fmt(bestVal)}</strong></td>
        <td${highlight}>${sign} ${fmt(absDelta)}</td>
      </tr>`;
    });
    tbody.innerHTML = rows.join("");

    if (badge && typeof baselineFitness === "number") {
      const currentFitness = baselineFitness;
      const bestFitness    = bestGenome?._fitness;
      if (typeof bestFitness === "number") {
        const beats = bestFitness > currentFitness + 0.005;
        badge.textContent = beats ? "✅ beats current config" : "⚠ not better than baseline";
        badge.style.color = beats ? "#4caf7d" : "#e0a052";
      }
    }
  }

  // ── History table ─────────────────────────────────────────────────────────────
  function renderHistoryTable(runs = [], onApplyRun) {
    const tbody = elements.historyTbody;
    if (!tbody) return;
    if (!runs.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:#666;text-align:center">Sin ejecuciones anteriores</td></tr>`;
      return;
    }
    tbody.innerHTML = runs.map((run) => {
      const beats = typeof run.bestFitness === "number" && typeof run.baselineFitness === "number"
        ? run.bestFitness > run.baselineFitness + 0.005
        : null;
      const beatsBadge = beats === true
        ? "<span style=\"color:#4caf7d\">✅</span>"
        : beats === false
          ? "<span style=\"color:#888\">—</span>"
          : "";
      return `<tr>
        <td>${fmtDate(run.createdAt)}</td>
        <td>${run.generations ?? "—"}</td>
        <td>${run.populationSize ?? "—"}</td>
        <td>${fmtPct(run.bestFitness)} ${beatsBadge}</td>
        <td>${fmtPct(run.baselineFitness)}</td>
        <td>${run.status || "—"}</td>
        <td>${run.bestGenome
          ? `<button class="ghost small" data-run-id="${run.id}">Ver</button>`
          : "—"
        }</td>
      </tr>`;
    }).join("");

    if (typeof onApplyRun === "function") {
      tbody.querySelectorAll("button[data-run-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const runId = Number(btn.dataset.runId);
          const run = runs.find((r) => r.id === runId);
          if (run?.bestGenome) onApplyRun(run);
        });
      });
    }
  }

  // ── Status updaters ───────────────────────────────────────────────────────────
  function updateStatus(state = {}) {
    if (elements.currentGen)   elements.currentGen.textContent   = state.generation  ? `${state.generation} / ${state.totalGenerations}` : "—";
    if (elements.bestFitness)  elements.bestFitness.textContent  = fmtPct(state.bestFitness);
    if (elements.avgFitness)   elements.avgFitness.textContent   = fmtPct(state.avgFitness);
    if (elements.statusText)   elements.statusText.textContent   = state.statusText  || "Inactivo";

    if (elements.progressFill && state.generation && state.totalGenerations) {
      const pct = Math.round((state.generation / state.totalGenerations) * 100);
      elements.progressFill.style.width = `${pct}%`;
    }

    if (state.history) {
      fitnessChartData.history = state.history;
      drawFitnessChart(state.history);
    }
  }

  function appendLog(message) {
    const log = elements.log;
    if (!log) return;
    const li = document.createElement("li");
    li.textContent = `[GeneticOptimizer] ${message}`;
    log.prepend(li);
    while (log.children.length > 80) log.removeChild(log.lastChild);
  }

  function setButtonStates({ running = false, hasResult = false } = {}) {
    if (elements.startBtn) elements.startBtn.disabled = running;
    if (elements.stopBtn)  elements.stopBtn.disabled  = !running;
    if (elements.applyBtn) elements.applyBtn.disabled = running || !hasResult;
    if (elements.saveBtn)  elements.saveBtn.disabled  = running || !hasResult;
  }

  // ── Initial draw ──────────────────────────────────────────────────────────────
  drawFitnessChart([]);

  return {
    drawFitnessChart,
    renderResultsTable,
    renderDiffTable,
    renderHistoryTable,
    updateStatus,
    appendLog,
    setButtonStates,
  };
}
