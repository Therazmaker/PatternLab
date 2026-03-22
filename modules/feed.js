import { formatDate } from "./utils.js";
import { filterSignalsBySr, normalizeSrContext } from "./sr.js";

function renderTagBadges(tags = []) {
  if (!tags.length) return '<span class="muted">-</span>';
  return tags.map((tag) => `<span class="badge tag">${tag}</span>`).join(" ");
}

function hasOHLCComplete(signal) {
  const c = signal?.candleData || {};
  return [c.open, c.high, c.low, c.close].every((value) => typeof value === "number");
}

function hasExcursion(signal) {
  return typeof signal?.excursion?.mfe === "number" || typeof signal?.excursion?.mae === "number";
}

function hasSession(signal) {
  return Boolean(signal?.sessionRef?.sessionId);
}

function renderFuturesBadge(signal) {
  const policy = signal?.futuresPolicy;
  if (!policy) return "";
  const tone = policy.action === "LONG" ? "call" : policy.action === "SHORT" ? "put" : "tag";
  const rr = policy.executionPlan?.riskReward;
  const replay = policy.replay?.outcomeType;
  return `<span class="badge ${tone}">Futures ${policy.action} ${(Number(policy.confidence || 0) * 100).toFixed(0)}%</span>${rr ? ` <span class="badge">RR ${rr.toFixed(2)}</span>` : ""}${replay ? ` <span class="badge">${replay}</span>` : ""}`;
}

function renderSourceBadge(signal) {
  if (signal.source !== "strategy-live-shadow") return '<span class="badge">Manual</span>';
  const strategy = signal.strategyName || signal.strategyId || "strategy";
  const action = signal.strategyAction || signal.futuresPolicy?.action || "NO_TRADE";
  const confidence = signal.confidence;
  return `<span class="badge tag">Live Shadow</span> <span class="badge">${strategy}</span> <span class="badge">${action}</span>${typeof confidence === "number" ? ` <span class="badge">${(confidence * 100).toFixed(0)}%</span>` : ""}`;
}

function renderV3Badges(signal) {
  const badges = [];
  if (hasOHLCComplete(signal)) badges.push('<span class="badge v3-ohlc">OHLC complete</span>');
  if (hasExcursion(signal)) badges.push('<span class="badge v3-excursion">Excursion ready</span>');
  if (hasSession(signal)) badges.push('<span class="badge v3-session">Attached to session</span>');
  return badges.join(" ");
}

function renderSrBadges(signal) {
  const sr = normalizeSrContext(signal.srContext);
  const badges = [];
  if (sr.nearSupport) badges.push('<span class="badge sr-support">Near Support</span>');
  if (sr.nearResistance) badges.push('<span class="badge sr-resistance">Near Resistance</span>');
  return badges.length ? badges.join(" ") : '<span class="muted">-</span>';
}

export function getFilteredSignals(signals, filters) {
  const term = filters.search.trim().toLowerCase();
  const srFiltered = filterSignalsBySr(signals, {
    nearSupport: filters.nearSupport,
    nearResistance: filters.nearResistance,
  });

  return srFiltered.filter((s) => {
    if (filters.asset && s.asset !== filters.asset) return false;
    if (filters.direction && s.direction !== filters.direction) return false;
    if (filters.patternName && s.patternName !== filters.patternName) return false;
    if (filters.source && s.source !== filters.source) return false;
    if (filters.strategyId && (s.strategyId || "") !== filters.strategyId) return false;
    if (filters.status && s.outcome.status !== filters.status) return false;
    if (filters.timeframe && s.timeframe !== filters.timeframe) return false;
    if (filters.hasOHLC === "only" && !hasOHLCComplete(s)) return false;
    if (filters.hasOHLC === "exclude" && hasOHLCComplete(s)) return false;
    if (filters.hasExcursion === "only" && !hasExcursion(s)) return false;
    if (filters.hasExcursion === "exclude" && hasExcursion(s)) return false;
    if (filters.hasSession === "only" && !hasSession(s)) return false;
    if (filters.hasSession === "exclude" && hasSession(s)) return false;
    if (filters.mfeMin !== "" && !(Number(s?.excursion?.mfe) >= Number(filters.mfeMin))) return false;
    if (filters.maeMax !== "" && !(Number(s?.excursion?.mae) <= Number(filters.maeMax))) return false;
    if (term) {
      const hay = [s.asset, s.patternName, s.direction, s.timeframe, s.notes, s.strategyName, s.strategyId, ...(s.autoTags || [])].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

export function renderFeedRows(tbody, signals, onReview, onQuickReview) {
  tbody.innerHTML = "";
  if (!signals.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="muted">No hay señales para mostrar.</td></tr>';
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
      <td>${renderSrBadges(signal)}</td>
      <td><span class="badge">${signal.marketRegime || "unclear"}</span></td>
      <td>
        <div class="context-mini">
          <strong>${signal.contextScore ?? 0}</strong>
          <div class="bar"><span style="width:${signal.contextScore ?? 0}%"></span></div>
          <small>${signal.contextLabel || "-"}</small>
        </div>
      </td>
      <td>${renderSourceBadge(signal)} ${renderTagBadges(signal.autoTags)} ${renderV3Badges(signal)} ${renderFuturesBadge(signal)}</td>
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
