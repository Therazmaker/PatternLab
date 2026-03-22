function badgeList(tags = [], className = "tag") {
  if (!tags.length) return '<span class="muted">-</span>';
  return tags.map((tag) => `<span class="badge ${className}">${tag}</span>`).join(" ");
}

function renderTable(rows, columns) {
  if (!rows.length) return '<p class="muted">Sin datos suficientes.</p>';
  const head = `<tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${c.format ? c.format(row[c.key], row) : row[c.key]}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function renderPreview(container, preview) {
  if (!preview) {
    container.innerHTML = "";
    return;
  }
  if (!preview.ok) {
    container.innerHTML = `<p class="status-loss">${preview.message}</p>`;
    return;
  }

  const invalidList = preview.invalid.slice(0, 8).map((row) => `<li>Fila ${row.index + 1}: ${row.errors.join(", ")}</li>`).join("");
  const duplicateList = (preview.duplicates || []).slice(0, 8).map((row) => `<li>Fila ${row.index + 1}: ${row.signal.asset} · ${row.signal.patternName}</li>`).join("");
  const missingList = (preview.missingCritical || []).slice(0, 8).map((row) => `<li>Fila ${row.index + 1}: ${row.fields.join(", ")}</li>`).join("");

  container.innerHTML = `
    <p><strong>Detectadas:</strong> ${preview.total} | <strong>Válidas:</strong> ${preview.valid.length} | <strong>Inválidas:</strong> ${preview.invalid.length} | <strong>Duplicadas:</strong> ${(preview.duplicates || []).length}</p>
    <p><strong>Importables:</strong> ${(preview.uniqueValid || []).length} (sin duplicados).</p>
    <p><strong>Assets:</strong> ${preview.assets.join(", ") || "-"}</p>
    <p><strong>Patterns:</strong> ${preview.patterns.join(", ") || "-"}</p>
    ${missingList ? `<details><summary>Faltantes críticos</summary><ul>${missingList}</ul></details>` : ""}
    ${invalidList ? `<details><summary>Errores por fila</summary><ul>${invalidList}</ul></details>` : ""}
    ${duplicateList ? `<details><summary>Duplicadas detectadas</summary><ul>${duplicateList}</ul></details>` : ""}
  `;
}

export function renderImportReport(container, report) {
  if (!report) {
    container.innerHTML = '<p class="muted">Aún no hay reportes de importación.</p>';
    return;
  }
  container.innerHTML = `
    <p><strong>Última importación:</strong> ${new Date(report.createdAt).toLocaleString()}</p>
    <p class="muted">Detectadas ${report.total}, válidas ${report.valid}, inválidas ${report.invalid}, duplicadas ${report.duplicates}, importadas ${report.imported}.</p>
  `;
}

export function renderList(target, entries) {
  target.innerHTML = entries.length
    ? entries.map(([label, value]) => `<li><span>${label}</span><strong>${value}</strong></li>`).join("")
    : '<li><span class="muted">Sin datos</span></li>';
}

export function renderStatsOverview(container, stats) {
  const cards = [["Total señales", stats.total], ["Revisadas", stats.reviewed], ["Wins", stats.wins], ["Losses", stats.losses], ["Skips", stats.skips], ["Pending", stats.pending], ["Winrate", `${stats.winrate}%`]];
  container.innerHTML = cards.map(([name, value]) => `<div class="stat-card"><span>${name}</span><strong>${value}</strong></div>`).join("");
}

export function renderRankingTable(container, rows) {
  container.innerHTML = renderTable(rows, [
    { key: "rank", label: "#" },
    { key: "patternName", label: "Pattern" },
    { key: "total", label: "Total" },
    { key: "reviewed", label: "Reviewed" },
    { key: "wins", label: "Wins" },
    { key: "losses", label: "Losses" },
    { key: "pending", label: "Pending" },
    { key: "winrate", label: "Winrate", format: (v) => `${v}%` },
    { key: "sampleQuality", label: "Sample quality" },
    { key: "score", label: "Score" },
    { key: "adaptiveScore", label: "Adaptive", format: (v) => `${v ?? 0}` },
    { key: "robustnessScore", label: "Robustness", format: (v) => `${v ?? 0}` },
    { key: "robustnessBadge", label: "Robust badge", format: (v) => `<span class="badge">${v || "-"}</span>` },
    { key: "overfitRisk", label: "Overfit risk", format: (v) => `<span class="badge overfit-${v || "low"}">${v || "low"}</span>` },
    { key: "confidenceBadge", label: "Badge", format: (v) => `<span class="badge confidence-${v.toLowerCase()}">${v}</span>` },
  ]);
}

export function renderHourTable(container, rows) {
  container.innerHTML = renderTable(rows, [
    { key: "hour", label: "Hora" },
    { key: "total", label: "Total" },
    { key: "wins", label: "Wins" },
    { key: "losses", label: "Losses" },
    { key: "winrate", label: "Winrate", format: (v) => `${v}%` },
    { key: "dominantPatterns", label: "Patrones dominantes" },
    { key: "dominantAssets", label: "Assets dominantes" },
  ]);
}

export function renderAssetTable(container, rows) {
  container.innerHTML = renderTable(rows, [
    { key: "asset", label: "Asset" },
    { key: "total", label: "Total" },
    { key: "reviewed", label: "Reviewed" },
    { key: "wins", label: "Wins" },
    { key: "losses", label: "Losses" },
    { key: "winrate", label: "Winrate", format: (v) => `${v}%` },
    { key: "topPatterns", label: "Patrones" },
    { key: "dominantDirections", label: "Direcciones" },
  ]);
}

export function renderCompareCards(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="muted">Selecciona al menos un patrón para comparar.</p>';
    return;
  }
  container.innerHTML = rows.map((row) => `<article class="compare-card panel-soft">
      <h3>${row.patternName}</h3>
      <p class="muted">${row.insight}</p>
      <ul class="mini-list">
        <li><span>Total</span><strong>${row.total}</strong></li>
        <li><span>Revisadas</span><strong>${row.reviewed}</strong></li>
        <li><span>Wins/Losses</span><strong>${row.wins}/${row.losses}</strong></li>
        <li><span>Skips/Pending</span><strong>${row.skips}/${row.pending}</strong></li>
        <li><span>Winrate</span><strong>${row.winrate}%</strong></li>
        <li><span>Frecuencia</span><strong>${row.frequency}%</strong></li>
        <li><span>Adaptive score</span><strong>${row.adaptiveScore}</strong></li>
        <li><span>Regime dominante</span><strong>${row.dominantRegime}</strong></li>
        <li><span>Robustness</span><strong>${row.robustnessScore} · ${row.robustnessBadge}</strong></li>
        <li><span>Stress sensitivity</span><strong>${row.stressSensitivity}</strong></li>
        <li><span>MC dispersión</span><strong>${row.monteCarloDispersion ?? "-"}pp</strong></li>
      </ul>
      </article>`).join("");
}

export function renderRadarCards(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="muted">Radar sin señales para los filtros actuales.</p>';
    return;
  }
  container.innerHTML = rows.map((signal) => `<article class="radar-card panel-soft">
      <div class="note-head"><h3>${signal.asset} · ${signal.direction}</h3><span class="badge">Radar ${signal.radarFuturesScore ?? signal.radarScore}</span></div>
      <p><strong>${signal.patternName}</strong> · ${new Date(signal.timestamp).toLocaleString()}</p>
      <div class="context-mini"><strong>Context ${signal.contextScore}</strong><div class="bar"><span style="width:${signal.contextScore}%"></span></div><small>${signal.contextLabel}</small></div>
      <p>${badgeList(signal.radarBadges, "radar")}</p>
      <p>${badgeList(signal.autoTags, "tag")}</p>
      <p class="muted">Regime: <strong>${signal.marketRegime || "unclear"}</strong> · Adaptive: <strong>${signal.patternMeta?.adaptiveScore ?? 0}</strong> · Robustness: <strong>${signal.patternMeta?.robustness?.robustnessScore ?? "-"}</strong></p>
      ${signal.futuresPolicy ? `<p><span class="badge ${signal.futuresPolicy.action === "LONG" ? "call" : signal.futuresPolicy.action === "SHORT" ? "put" : "tag"}">${signal.futuresPolicy.action}</span> <span class="badge">${Math.round((signal.futuresPolicy.confidence || 0) * 100)}%</span> ${signal.futuresPolicy.executionPlan?.riskReward ? `<span class="badge">RR ${signal.futuresPolicy.executionPlan.riskReward.toFixed(2)}</span>` : ""}</p>
      <p class="muted">${signal.futuresPolicy.reason}</p>
      <p class="muted">Entry ${signal.futuresPolicy.executionPlan?.entryPrice ?? "-"} · SL ${signal.futuresPolicy.executionPlan?.stopLoss ?? "-"} · TP ${signal.futuresPolicy.executionPlan?.takeProfit ?? "-"}</p>
      ${(signal.futuresPolicy.evidence?.warningFlags || []).length ? `<p>${(signal.futuresPolicy.evidence.warningFlags || []).map((flag) => `<span class="badge">⚠ ${flag}</span>`).join(" ")}</p>` : ""}` : ""}
      <p class="muted">${signal.radarInsight}</p>
    </article>`).join("");
}

export function renderNotes(container, notes, onEdit, onDelete) {
  if (!notes.length) {
    container.innerHTML = '<p class="muted">No hay notas para los filtros actuales.</p>';
    return;
  }
  container.innerHTML = "";
  notes.forEach((note) => {
    const card = document.createElement("article");
    card.className = "note-card";
    card.innerHTML = `
      <div class="note-head"><h4>${note.title}</h4><div class="button-row compact"><button data-edit="${note.id}" class="ghost">Editar</button><button data-delete="${note.id}" class="ghost">Eliminar</button></div></div>
      <p>${note.content.replace(/\n/g, "<br>")}</p>
      <p class="muted">Tags: ${note.tags.join(", ") || "-"} · Pattern: ${note.links.patternName || "-"} · Asset: ${note.links.asset || "-"}</p>
    `;
    card.querySelector("[data-edit]").addEventListener("click", () => onEdit(note));
    card.querySelector("[data-delete]").addEventListener("click", () => onDelete(note.id));
    container.appendChild(card);
  });
}

export function renderPatternVersionsTable(container, rows, handlers = {}, patternOptions = []) {
  const {
    onCreate = null,
    onEditNotes = null,
    onArchive = null,
    onActivate = null,
    createMessage = "",
  } = handlers;

  const patternDatalistId = "pattern-version-pattern-options";
  const createForm = `
    <article class="panel-soft versions-form-wrap">
      <h3>Nueva versión</h3>
      <form id="pattern-version-form" class="versions-form">
        <input id="pv-pattern-name" list="${patternDatalistId}" placeholder="Pattern Name" required />
        <datalist id="${patternDatalistId}">${patternOptions.map((name) => `<option value="${name}"></option>`).join("")}</datalist>
        <input id="pv-version" placeholder="Version (ej: v2)" required />
        <input id="pv-notes" placeholder="Notes (opcional)" />
        <button type="submit" class="primary">Crear versión</button>
      </form>
      <p id="pv-create-feedback" class="muted tiny">${createMessage || ""}</p>
    </article>
  `;

  const table = rows.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pattern</th><th>Version</th><th>Notes</th><th>Created At</th><th>Total señales</th><th>Reviewed</th><th>Wins</th><th>Losses</th><th>Winrate</th><th>Robustness</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr class="${row.isActive ? "version-row-active" : ""}">
            <td>${row.patternName}</td>
            <td>${row.patternVersion} ${row.isActive ? '<span class="badge">Active</span>' : ""} ${row.isArchived ? '<span class="badge">Archived</span>' : ""}</td>
            <td>${row.notes || '<span class="muted">-</span>'}</td>
            <td>${row.createdAt ? new Date(row.createdAt).toLocaleString() : '<span class="muted">-</span>'}</td>
            <td>${row.total}</td>
            <td>${row.reviewed}</td>
            <td>${row.wins}</td>
            <td>${row.losses}</td>
            <td>${row.winrate === null ? '<span class="muted">—</span>' : `${row.winrate}%`}</td>
            <td>${row.robustnessScore ?? '<span class="muted">-</span>'}</td>
            <td><span class="badge">${row.statusLabel}</span></td>
            <td>
              <div class="button-row compact">
                <button type="button" class="ghost" data-action="edit-notes" data-id="${row.versionId}">Editar notes</button>
                <button type="button" class="ghost" data-action="archive" data-id="${row.versionId}" data-archived="${row.isArchived ? "1" : "0"}">${row.isArchived ? "Desarchivar" : "Archivar"}</button>
                <button type="button" class="ghost" data-action="activate" data-id="${row.versionId}" ${row.isArchived ? "disabled" : ""}>Activar</button>
              </div>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  ` : '<p class="muted">No hay versiones registradas.</p>';

  container.innerHTML = `${createForm}${table}`;

  const form = container.querySelector("#pattern-version-form");
  if (form && onCreate) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const patternName = container.querySelector("#pv-pattern-name")?.value || "";
      const version = container.querySelector("#pv-version")?.value || "";
      const notes = container.querySelector("#pv-notes")?.value || "";
      onCreate({ patternName, version, notes });
    });
  }

  container.querySelectorAll("[data-action='edit-notes']").forEach((button) => {
    button.addEventListener("click", () => onEditNotes?.(button.getAttribute("data-id") || ""));
  });
  container.querySelectorAll("[data-action='archive']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-id") || "";
      const isArchived = button.getAttribute("data-archived") === "1";
      onArchive?.(id, !isArchived);
    });
  });
  container.querySelectorAll("[data-action='activate']").forEach((button) => {
    button.addEventListener("click", () => onActivate?.(button.getAttribute("data-id") || ""));
  });
}

export function renderConfidenceEvolution(container, evolution, windowSize = 20) {
  if (!evolution?.rolling?.length) {
    container.innerHTML = '<p class="muted">Selecciona un patrón con señales revisadas para ver su evolución.</p>';
    return;
  }

  const width = 760;
  const height = 220;
  const padX = 36;
  const padY = 20;
  const points = evolution.rolling;
  const step = (width - padX * 2) / Math.max(points.length - 1, 1);
  const y = (value) => (height - padY) - ((value / 100) * (height - padY * 2));

  const rollingPath = points.map((point, index) => `${index === 0 ? "M" : "L"}${padX + step * index},${y(point.rollingWinrate)}`).join(" ");
  const cumulativePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${padX + step * index},${y(point.cumulativeWinrate)}`).join(" ");

  container.innerHTML = `
    <article class="panel-soft confidence-chart">
      <p class="muted">Ventana móvil: ${windowSize} señales</p>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Confidence Evolution">
        <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="currentColor" stroke-opacity="0.3" />
        <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" stroke="currentColor" stroke-opacity="0.3" />
        <path d="${cumulativePath}" fill="none" stroke="#7dd3fc" stroke-width="2" />
        <path d="${rollingPath}" fill="none" stroke="#22c55e" stroke-width="2.5" />
      </svg>
      <p class="muted">Azul: acumulado · Verde: rolling winrate</p>
    </article>
  `;
}

export function renderForwardValidation(container, result) {
  if (!result?.rows?.length) {
    container.innerHTML = '<p class="muted">Insufficient evidence para forward validation.</p>';
    return;
  }

  const summary = `<p class="muted">Training: ${result.trainingSize} señales · Forward: ${result.forwardSize} señales.</p>`;
  const table = renderTable(result.rows, [
    { key: "patternName", label: "Pattern" },
    { key: "patternVersion", label: "Version" },
    { key: "training", label: "Training", format: (_, row) => `${row.training.reviewed}/${row.training.total} · ${row.training.winrate}%` },
    { key: "forward", label: "Forward", format: (_, row) => `${row.forward.reviewed}/${row.forward.total} · ${row.forward.winrate}%` },
    { key: "stability", label: "Forward stability", format: (_, row) => `${row.forward.stability}%` },
    { key: "drift", label: "Drift", format: (_, row) => `<span class="badge">${row.drift.label}</span> ${row.drift.value}pp` },
  ]);
  container.innerHTML = `${summary}<div class="table-wrap">${table}</div>`;
}

export function renderErrorClusters(container, clusters, onOpenCluster) {
  if (!clusters.length) {
    container.innerHTML = '<p class="muted">No se detectaron clusters de error con evidencia suficiente.</p>';
    return;
  }
  container.innerHTML = "";
  clusters.forEach((cluster) => {
    const article = document.createElement("article");
    article.className = "panel-soft";
    article.innerHTML = `
      <div class="note-head"><h3>${cluster.name}</h3><span class="badge">${cluster.count} casos · ${cluster.weight}%</span></div>
      <p class="muted">${cluster.insight}</p>
      <p class="muted">Ejemplos: ${cluster.sampleSignals.map((signal) => `${signal.asset} ${signal.direction} (${signal.status})`).join(" · ")}</p>
      <button class="ghost" data-open="${cluster.id}">Ver señales del cluster</button>
    `;
    article.querySelector("[data-open]").addEventListener("click", () => onOpenCluster(cluster));
    container.appendChild(article);
  });
}

export function renderClusterDetails(container, cluster) {
  if (!cluster) {
    container.innerHTML = '<p class="muted">Selecciona un cluster para ver señales.</p>';
    return;
  }
  container.innerHTML = `<h3>${cluster.name}</h3><p class="muted">${cluster.insight}</p><div class="table-wrap">${renderTable(cluster.signals, [
    { key: "id", label: "ID" },
    { key: "asset", label: "Asset" },
    { key: "patternName", label: "Pattern" },
    { key: "direction", label: "Direction" },
    { key: "hourBucket", label: "Hora" },
    { key: "marketRegime", label: "Regime" },
    { key: "contextScore", label: "Context" },
    { key: "status", label: "Outcome", format: (_, row) => row.outcome?.status || "-" },
  ])}</div>`;
}

export function renderHypotheses(container, items, onDecision) {
  if (!items.length) {
    container.innerHTML = '<p class="muted">No hay hipótesis con evidencia suficiente todavía.</p>';
    return;
  }
  container.innerHTML = "";
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "panel-soft";
    article.innerHTML = `
      <div class="note-head"><h3>${item.title}</h3><span class="badge confidence-${item.confidence}">${item.confidence}</span></div>
      <p class="muted">${item.description}</p>
      <p class="muted">Muestra ${item.evidence.sampleSize} · Winrate ${item.evidence.winrate}% vs baseline ${item.evidence.baselineWinrate}%</p>
      <div class="button-row compact">
        <button class="ghost" data-decision="useful" data-id="${item.id}">Useful</button>
        <button class="ghost" data-decision="weak" data-id="${item.id}">Marked as weak</button>
        <button class="ghost" data-decision="dismissed" data-id="${item.id}">Dismissed</button>
        <button class="ghost" data-decision="archived" data-id="${item.id}">Archived</button>
      </div>
    `;
    article.querySelectorAll("[data-decision]").forEach((btn) => {
      btn.addEventListener("click", () => onDecision(item.id, btn.dataset.decision));
    });
    container.appendChild(article);
  });
}

export function renderSuggestions(container, items, onDecision) {
  if (!items.length) {
    container.innerHTML = '<p class="muted">No hay sugerencias activas con evidencia suficiente.</p>';
    return;
  }
  container.innerHTML = "";
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "panel-soft";
    article.innerHTML = `
      <div class="note-head"><h3>${item.title}</h3><span class="badge">${item.type} · ${item.priority}</span></div>
      <p class="muted">${item.reason}</p>
      <div class="button-row compact">
        <button class="ghost" data-decision="accepted" data-id="${item.id}">Accept</button>
        <button class="ghost" data-decision="ignored" data-id="${item.id}">Ignore</button>
      </div>
    `;
    article.querySelectorAll("[data-decision]").forEach((btn) => {
      btn.addEventListener("click", () => onDecision(item.id, btn.dataset.decision));
    });
    container.appendChild(article);
  });
}

export function renderReviewQueue(container, rows, onReview) {
  if (!rows.length) {
    container.innerHTML = '<p class="muted">No hay señales pending actualmente.</p>';
    return;
  }
  container.innerHTML = "";
  rows.slice(0, 30).forEach((row) => {
    const item = document.createElement("article");
    item.className = "panel-soft";
    item.innerHTML = `<div class="note-head"><h4>${row.patternName} · ${row.asset}</h4><button class="ghost" data-id="${row.id}">Revisar</button></div><p class="muted">${row.direction} · ${new Date(row.timestamp).toLocaleString()} · Regime ${row.marketRegime || "unclear"}</p>${row.futuresPolicy ? `<p class="muted"><strong>Policy:</strong> ${row.futuresPolicy.action} (${Math.round((row.futuresPolicy.confidence || 0) * 100)}%) · ${row.futuresPolicy.replay?.outcomeType || "pending"} · PnL R ${Number(row.futuresPolicy.replay?.pnlR || 0).toFixed(2)}</p>` : ""}`;
    item.querySelector("[data-id]").addEventListener("click", () => onReview(row.id));
    container.appendChild(item);
  });
}

export function renderOverfitCheck(container, result) {
  if (!result) {
    container.innerHTML = '<p class="muted">Selecciona patrón para evaluar sobreajuste.</p>';
    return;
  }
  if (!result.reasons.length) {
    container.innerHTML = `<p><strong>Risk:</strong> <span class="badge">${result.overfitRisk}</span></p><p class="muted">Sin señales heurísticas relevantes por ahora.</p>`;
    return;
  }
  container.innerHTML = `
    <p><strong>Overfit risk:</strong> <span class="badge overfit-${result.overfitRisk}">${result.overfitRisk}</span></p>
    <p class="muted">${result.label}</p>
    ${result.reasons.map((reason) => `<article class="panel-soft"><h4>${reason.message}</h4><p class="muted">Evidencia: ${reason.evidence}</p><p class="muted">Sugerencia: ${reason.suggestion}</p></article>`).join("")}
  `;
}

export function renderStressTests(container, summary) {
  if (!summary?.tests?.length) {
    container.innerHTML = '<p class="muted">Insufficient evidence para Stress Test.</p>';
    return;
  }
  container.innerHTML = summary.tests.map((test) => `
    <article class="panel-soft">
      <h4>${test.title}</h4>
      <p class="muted">Baseline ${test.baseline.winrate}% → Stressed ${test.stressed.winrate}% · Δ ${test.delta}pp</p>
      ${test.note ? `<p class="muted">${test.note}</p>` : ""}
      <p>${test.interpretation}</p>
    </article>
  `).join("");
}

function renderMiniBars(rows = [], key) {
  if (!rows.length) return '<p class="muted">Sin datos.</p>';
  const max = Math.max(...rows.map((item) => item.count));
  return rows.map((item) => `<div class="mc-bar"><span>${item[key]}</span><div class="bar"><span style="width:${Math.round((item.count / max) * 100)}%"></span></div><strong>${item.count}</strong></div>`).join("");
}

export function renderMonteCarlo(container, summary) {
  if (!summary?.simulations) {
    container.innerHTML = `<p class="muted">${summary?.insight || "Ejecuta simulación para ver resultados."}</p>`;
    return;
  }
  container.innerHTML = `
    <ul class="mini-list">
      <li><span>Simulations run</span><strong>${summary.simulations}</strong></li>
      <li><span>Mean / Median winrate</span><strong>${summary.meanWinrate}% / ${summary.medianWinrate}%</strong></li>
      <li><span>P10 / P25 / P75 / P90</span><strong>${summary.p10}% · ${summary.p25}% · ${summary.p75}% · ${summary.p90}%</strong></li>
      <li><span>Best / Worst simulated</span><strong>${summary.bestCase}% / ${summary.worstCase}%</strong></li>
      <li><span>Worst observed streak</span><strong>${summary.worstObservedStreak}</strong></li>
      <li><span>Average max losing streak</span><strong>${summary.avgMaxLosingStreak}</strong></li>
      <li><span>Dispersión</span><strong>${summary.dispersion}pp</strong></li>
    </ul>
    <p class="muted">${summary.insight}</p>
    <h4>Histograma winrate</h4>
    <div>${renderMiniBars(summary.histogram, "bucket")}</div>
    <h4>Distribución max losing streak</h4>
    <div>${renderMiniBars(summary.streakHistogram, "bucket")}</div>
  `;
}

export function renderRobustnessScore(container, summary, insight) {
  if (!summary) {
    container.innerHTML = '<p class="muted">Sin datos para robustez.</p>';
    return;
  }
  container.innerHTML = `
    <p><strong>Robustness score:</strong> ${summary.robustnessScore} / 100</p>
    <p><strong>Badge:</strong> <span class="badge">${summary.badge}</span></p>
    <p class="muted">${insight}</p>
    <p class="muted">Fórmula transparente (componentes): muestra ${Math.round(summary.formula.sampleQuality)}, estabilidad ${summary.formula.stability}, adaptive ${summary.formula.adaptiveScore}, forward ${summary.formula.forwardStability}, dispersión inversa ${summary.formula.dispersionScore}, stress resistance ${summary.formula.stressResistance}, penalización dependencia ${summary.formula.dependencyPenalty}.</p>
  `;
}

export function renderSrContextAnalysis(container, srStats, insights = []) {
  if (!container) return;
  if (!srStats) {
    container.innerHTML = '<p class="muted">Sin datos de S/R todavía.</p>';
    return;
  }

  const rows = [
    { label: "Baseline pattern", ...srStats.baseline, delta: 0 },
    { label: "Near Support", ...srStats.nearSupport, delta: Number((srStats.nearSupport.winrate - srStats.baseline.winrate).toFixed(2)) },
    { label: "Near Resistance", ...srStats.nearResistance, delta: Number((srStats.nearResistance.winrate - srStats.baseline.winrate).toFixed(2)) },
    { label: "Support only", ...srStats.supportOnly, delta: Number((srStats.supportOnly.winrate - srStats.baseline.winrate).toFixed(2)) },
    { label: "Resistance only", ...srStats.resistanceOnly, delta: Number((srStats.resistanceOnly.winrate - srStats.baseline.winrate).toFixed(2)) },
    { label: "Both", ...srStats.both, delta: Number((srStats.both.winrate - srStats.baseline.winrate).toFixed(2)) },
    { label: "Neither", ...srStats.neither, delta: Number((srStats.neither.winrate - srStats.baseline.winrate).toFixed(2)) },
  ];

  const table = renderTable(rows, [
    { key: "label", label: "Segment" },
    { key: "total", label: "Total" },
    { key: "reviewed", label: "Reviewed" },
    { key: "wins", label: "Wins" },
    { key: "losses", label: "Losses" },
    { key: "winrate", label: "Winrate", format: (v) => `${v}%` },
    { key: "delta", label: "vs baseline", format: (v) => `${v > 0 ? "+" : ""}${v}pp` },
  ]);

  const insightHtml = insights.length
    ? `<ul class="mini-list">${insights.map((text) => `<li><span>${text}</span></li>`).join("")}</ul>`
    : '<p class="muted">Sin insights por ahora.</p>';

  container.innerHTML = `
    <p class="muted">Comparación prudente de contexto manual Soporte/Resistencia.</p>
    <div class="table-wrap">${table}</div>
    <h4>Lectura prudente</h4>
    ${insightHtml}
    <p class="muted">Guía: para CALL suele interesar Near Support; para PUT suele interesar Near Resistance (no bloqueante).</p>
  `;
}
