export function renderPreview(container, preview) {
  if (!preview) {
    container.innerHTML = "";
    return;
  }
  if (!preview.ok) {
    container.innerHTML = `<p class="status-loss">${preview.message}</p>`;
    return;
  }

  const errorList = preview.invalid
    .slice(0, 10)
    .map((row) => `<li>Fila ${row.index + 1}: ${row.errors.join(", ")}</li>`)
    .join("");

  container.innerHTML = `
    <p><strong>Detectadas:</strong> ${preview.total} | <strong>Válidas:</strong> ${preview.valid.length} | <strong>Inválidas:</strong> ${preview.invalid.length}</p>
    <p><strong>Assets:</strong> ${preview.assets.join(", ") || "-"}</p>
    <p><strong>Patterns:</strong> ${preview.patterns.join(", ") || "-"}</p>
    ${errorList ? `<details><summary>Errores por fila</summary><ul>${errorList}</ul></details>` : ""}
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
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${c.format ? c.format(row[c.key], row) : row[c.key]}</td>`).join("")}</tr>`)
    .join("");
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
  container.innerHTML = rows
    .map(
      (row) => `<article class="compare-card panel-soft">
      <h3>${row.patternName}</h3>
      <p class="muted">${row.insight}</p>
      <ul class="mini-list">
        <li><span>Total</span><strong>${row.total}</strong></li>
        <li><span>Revisadas</span><strong>${row.reviewed}</strong></li>
        <li><span>Wins/Losses</span><strong>${row.wins}/${row.losses}</strong></li>
        <li><span>Skips/Pending</span><strong>${row.skips}/${row.pending}</strong></li>
        <li><span>Winrate</span><strong>${row.winrate}%</strong></li>
        <li><span>Frecuencia</span><strong>${row.frequency}%</strong></li>
        <li><span>Top assets</span><strong>${row.topAssets.join(", ") || "-"}</strong></li>
        <li><span>Top horas</span><strong>${row.topHours.join(", ") || "-"}</strong></li>
        <li><span>CALL vs PUT</span><strong>${row.callCount} / ${row.putCount}</strong></li>
      </ul>
      </article>`
    )
    .join("");
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
