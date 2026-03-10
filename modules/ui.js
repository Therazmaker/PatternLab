function badgeList(tags = [], className = "tag") {
  if (!tags.length) return '<span class="muted">-</span>';
  return tags.map((tag) => `<span class="badge ${className}">${tag}</span>`).join(" ");
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

function renderTable(rows, columns) {
  if (!rows.length) return '<p class="muted">Sin datos suficientes.</p>';
  const head = `<tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${c.format ? c.format(row[c.key], row) : row[c.key]}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
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
        <li><span>Top assets</span><strong>${row.topAssets.join(", ") || "-"}</strong></li>
        <li><span>Top horas</span><strong>${row.topHours.join(", ") || "-"}</strong></li>
        <li><span>CALL vs PUT</span><strong>${row.callCount} / ${row.putCount}</strong></li>
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
      <p class="muted">Creada ${new Date(note.createdAt).toLocaleString()} · Editada ${new Date(note.updatedAt).toLocaleString()}</p>
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
      <ul class="mini-list">${evolution.frequencyByPeriod.map((item) => `<li><span>${item.period}</span><strong>${item.count}</strong></li>`).join("")}</ul>
    </article>
  `;
}
