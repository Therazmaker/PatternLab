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
  const cards = [
    ["Total señales", stats.total],
    ["Revisadas", stats.reviewed],
    ["Wins", stats.wins],
    ["Losses", stats.losses],
    ["Skips", stats.skips],
    ["Pending", stats.pending],
    ["Winrate", `${stats.winrate}%`],
  ];
  container.innerHTML = cards.map(([name, value]) => `<div class="stat-card"><span>${name}</span><strong>${value}</strong></div>`).join("");
}
