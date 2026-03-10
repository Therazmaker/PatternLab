import { formatDate } from "./utils.js";

export function getFilteredSignals(signals, filters) {
  const term = filters.search.trim().toLowerCase();
  return signals.filter((s) => {
    if (filters.asset && s.asset !== filters.asset) return false;
    if (filters.direction && s.direction !== filters.direction) return false;
    if (filters.patternName && s.patternName !== filters.patternName) return false;
    if (filters.status && s.outcome.status !== filters.status) return false;
    if (term) {
      const hay = [s.asset, s.patternName, s.direction, s.timeframe, s.notes].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

export function renderFeedRows(tbody, signals, onReview) {
  tbody.innerHTML = "";
  if (!signals.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">No hay señales para mostrar.</td></tr>';
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
      <td>${formatDate(signal.timestamp)}</td>
      <td><span class="badge ${statusClass}">${signal.outcome.status}</span></td>
      <td>${signal.confidence ?? "-"}</td>
      <td><button data-id="${signal.id}" class="ghost">Revisar</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => onReview(signal.id));
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
