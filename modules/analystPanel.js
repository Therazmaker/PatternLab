import { formatPatternStrengthDots } from "./patternDetector.js";

function safeNum(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function pctWidth(bullish, bearish) {
  const sum = Math.max((Number(bullish) || 0) + (Number(bearish) || 0), 1);
  return {
    bear: ((Number(bearish) || 0) / sum) * 100,
    bull: ((Number(bullish) || 0) / sum) * 100,
  };
}

export function renderAnalystPanel({ container, symbol, timeframe = "5m", data, collapsed = false, addedLevels = [], onToggle, onAddToChart }) {
  if (!container) return;
  if (!data) {
    container.innerHTML = '<p class="muted">Analyst idle.</p>';
    return;
  }
  const w = pctWidth(data.bullishScore, data.bearishScore);

  const zonesRows = (data.zones || []).slice(0, 5).map((zone, idx) => {
    const exists = addedLevels.some((row) => row.type === zone.type && Math.abs(Number(row.price) - Number(zone.price)) <= Math.max(Number(zone.price) * 0.0002, 1e-9));
    const btnLabel = exists ? "✓ en chart" : "+ chart";
    return `<tr>
      <td>${safeNum(zone.price, 5)}</td>
      <td>${zone.type}</td>
      <td>${zone.touches}</td>
      <td>${formatPatternStrengthDots(zone.strength)}</td>
      <td><button type="button" class="ghost analyst-add-btn" data-zone-index="${idx}" ${exists ? "disabled" : ""}>${btnLabel}</button></td>
    </tr>`;
  }).join("");

  const divergence = data.divergence
    ? `<div class="analyst-divergence ${data.divergence.type}"><strong>${data.divergence.type.toUpperCase()} divergence</strong> · strength ${data.divergence.strength}/100</div>`
    : "";

  container.innerHTML = `
    <article class="analyst-panel ${collapsed ? "collapsed" : ""}">
      <header class="analyst-header" data-analyst-toggle="1">
        <div>
          <h3>Always-On Analyst · ${symbol || "-"} ${timeframe}</h3>
          <p class="muted tiny">Trend <strong>${data.trend}</strong> · score <strong>${data.globalScore || 0}</strong></p>
        </div>
        <div class="analyst-kpis">
          <span class="badge">RSI ${safeNum(data.rsi, 1)}</span>
          <span class="badge">ATR ${safeNum(data.atr, 5)}</span>
          <span class="badge">Vol ${data.volatilityState}</span>
          <span class="badge">Mode ${data.policyMode || "-"}</span>
        </div>
      </header>
      <div class="analyst-body">
        <section>
          <div class="analyst-scorebar">
            <div class="bear" style="width:${w.bear.toFixed(2)}%">Bear ${safeNum(data.bearishScore, 0)}</div>
            <div class="neutral">Neutral</div>
            <div class="bull" style="width:${w.bull.toFixed(2)}%">Bull ${safeNum(data.bullishScore, 0)}</div>
          </div>
        </section>
        ${divergence}
        <section>
          <h4>Detected patterns</h4>
          <div class="session-analysis-tags">${(data.patterns || []).slice(0, 5).map((pattern) => `<span class="badge">${pattern.name} ${formatPatternStrengthDots(pattern.strength)}</span>`).join("") || '<span class="muted tiny">No high-confidence patterns.</span>'}</div>
        </section>
        <section>
          <h4>Support / Resistance Zones</h4>
          <div class="table-wrap analyst-zones-table">
            <table>
              <thead><tr><th>Price</th><th>Type</th><th>Touches</th><th>Strength</th><th></th></tr></thead>
              <tbody>${zonesRows || '<tr><td colspan="5" class="muted">No zones detected.</td></tr>'}</tbody>
            </table>
          </div>
        </section>
        <section>
          <h4>Analyst narrative</h4>
          <pre class="session-narrative muted">${data.narrative || "-"}</pre>
        </section>
      </div>
    </article>
  `;

  container.querySelector('[data-analyst-toggle="1"]')?.addEventListener("click", () => onToggle?.());
  container.querySelectorAll(".analyst-add-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const zone = (data.zones || [])[Number(btn.dataset.zoneIndex)];
      if (!zone) return;
      onAddToChart?.(zone);
    });
  });
}
