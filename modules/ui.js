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
      </ul>
      </article>`).join("");
}

export function renderRadarCards(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="muted">Radar sin señales para los filtros actuales.</p>';
    return;
  }
  container.innerHTML = rows.map((signal) => `<article class="radar-card panel-soft">
      <div class="note-head"><h3>${signal.asset} · ${signal.direction}</h3><span class="badge">Radar ${signal.radarScore}</span></div>
      <p><strong>${signal.patternName}</strong> · ${new Date(signal.timestamp).toLocaleString()}</p>
      <div class="context-mini"><strong>Context ${signal.contextScore}</strong><div class="bar"><span style="width:${signal.contextScore}%"></span></div><small>${signal.contextLabel}</small></div>
      <p>${badgeList(signal.radarBadges, "radar")}</p>
      <p>${badgeList(signal.autoTags, "tag")}</p>
      <p class="muted">Regime: <strong>${signal.marketRegime || "unclear"}</strong> · Adaptive: <strong>${signal.patternMeta?.adaptiveScore ?? 0}</strong></p>
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

export function renderPatternVersionsTable(container, rows) {
  container.innerHTML = renderTable(rows, [
    { key: "patternName", label: "Pattern" },
    { key: "patternVersion", label: "Version" },
    { key: "total", label: "Total" },
    { key: "reviewed", label: "Reviewed" },
    { key: "wins", label: "Wins" },
    { key: "losses", label: "Losses" },
    { key: "winrate", label: "Winrate", format: (v) => `${v}%` },
    { key: "maxLosingStreak", label: "Max losing streak" },
    { key: "consistency", label: "Consistency", format: (v) => `${v}%` },
    { key: "sampleSizeScore", label: "Sample size score", format: (v) => `${v}%` },
  ]);
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
    item.innerHTML = `<div class="note-head"><h4>${row.patternName} · ${row.asset}</h4><button class="ghost" data-id="${row.id}">Revisar</button></div><p class="muted">${row.direction} · ${new Date(row.timestamp).toLocaleString()} · Regime ${row.marketRegime || "unclear"}</p>`;
    item.querySelector("[data-id]").addEventListener("click", () => onReview(row.id));
    container.appendChild(item);
  });
}
