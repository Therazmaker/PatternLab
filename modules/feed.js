import { formatDate } from "./utils.js";

function renderTagBadges(tags = []) {
  if (!tags.length) return '<span class="muted">-</span>';
  return tags.map((tag) => `<span class="badge tag">${tag}</span>`).join(" ");
}

export function getFilteredSignals(signals, filters) {
  const term = filters.search.trim().toLowerCase();
  return signals.filter((s) => {
    if (filters.asset && s.asset !== filters.asset) return false;
    if (filters.direction && s.direction !== filters.direction) return false;
    if (filters.patternName && s.patternName !== filters.patternName) return false;
    if (filters.status && s.outcome.status !== filters.status) return false;
    if (filters.timeframe && s.timeframe !== filters.timeframe) return false;
    if (term) {
      const hay = [s.asset, s.patternName, s.direction, s.timeframe, s.notes, ...(s.autoTags || [])].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

export function renderFeedRows(tbody, signals, onReview, onQuickReview) {
  tbody.innerHTML = "";
  if (!signals.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="muted">No hay señales para mostrar.</td></tr>';
    return;
  }

  signals.forEach((signal) => {
    const tr = document.createElement("tr");
    const directionClass = signal.direction === "CALL" ? "call" : "put";
    const statusClass = `status-${signal.outcome.status}`;
    tr.innerHTML = `
      <td>${signal.asset}</td>
      <td>${signal.timeframe}</td>
      <td><span class="badge ${directionClass}">${signal.direction}</span></td>
      <td>${signal.patternName}</td>
      <td>${signal.patternVersion || "v1"}</td>
      <td>${formatDate(signal.timestamp)}</td>
      <td><span class="badge ${statusClass}">${signal.outcome.status}</span></td>
      <td><span class="badge">${signal.marketRegime || "unclear"}</span></td>
      <td>
        <div class="context-mini">
          <strong>${signal.contextScore ?? 0}</strong>
          <div class="bar"><span style="width:${signal.contextScore ?? 0}%"></span></div>
          <small>${signal.contextLabel || "-"}</small>
        </div>
      </td>
      <td>${renderTagBadges(signal.autoTags)}</td>
      <td class="quick-actions">
        <button data-quick="win" data-id="${signal.id}" class="ghost" title="Marcar win">Win</button>
        <button data-quick="loss" data-id="${signal.id}" class="ghost" title="Marcar loss">Loss</button>
        <button data-quick="skip" data-id="${signal.id}" class="ghost" title="Marcar skip">Skip</button>
      </td>
      <td><button data-id="${signal.id}" class="ghost">Revisar</button></td>
    `;
    tr.querySelector('[data-id]:not([data-quick])').addEventListener("click", () => onReview(signal.id));
    tr.querySelectorAll("[data-quick]").forEach((btn) => {
      btn.addEventListener("click", () => onQuickReview(signal.id, btn.dataset.quick));
    });
    tbody.appendChild(tr);
  });
}

export function renderFilterOptions(selectEl, options, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option;
    el.textContent = option;
    selectEl.appendChild(el);
  });
  selectEl.value = options.includes(current) ? current : "";
}
