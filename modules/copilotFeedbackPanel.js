// copilotFeedbackPanel.js
// Renders the Copilot Feedback block inside Session Candle and the standalone tab panel.
// Extended with Decision Trace (per-candle audit) and Aggregated Stats sections.

/**
 * Render the compact Copilot Feedback block for Session Candle.
 * @param {object|null} feedback  – normalized feedback from copilotFeedbackStore
 * @param {object|null} evaluation – result from evaluateCopilotFeedback
 * @param {object|null} effects   – result from buildCopilotFeedbackEffects
 * @returns {string} HTML string
 */
export function renderCopilotFeedbackBlock(feedback, evaluation, effects) {
  if (!feedback) {
    return `
      <div class="copilot-feedback-block muted tiny">
        <strong>COPILOT FEEDBACK</strong>
        <p>No copilot feedback loaded. Use the Copilot Feedback tab to import a JSON.</p>
      </div>`;
  }

  const verdict = feedback.copilot_verdict || {};
  const primary = feedback.scenario_primary || {};
  const alternate = feedback.scenario_alternate || null;
  const risks = Array.isArray(feedback.cognitive_risks) ? feedback.cognitive_risks : [];
  const ev = evaluation || {};
  const fx = effects || {};

  const statusBadge = (status) => {
    if (!status) return "";
    const cls = status === "validated" ? "badge-green" : status === "invalidated" ? "badge-red" : status === "expired" ? "badge-muted" : "badge-yellow";
    return `<span class="badge ${cls}">${status}</span>`;
  };

  const matchedList = Array.isArray(ev.matchedRules) && ev.matchedRules.length
    ? ev.matchedRules.map((r) => `<li class="tiny">${escapeHtml(r.ruleId)}: ${escapeHtml(r.description || r.condition)}</li>`).join("")
    : "<li class=\"tiny muted\">None</li>";

  const invalidatedList = Array.isArray(ev.invalidatedRules) && ev.invalidatedRules.length
    ? ev.invalidatedRules.map((r) => `<li class="tiny">${escapeHtml(r.ruleId)}: ${escapeHtml(r.description || r.condition)}</li>`).join("")
    : "<li class=\"tiny muted\">None</li>";

  const riskList = risks.length
    ? risks.map((r) => `<li class="tiny">${escapeHtml(typeof r === "string" ? r : (r.description || JSON.stringify(r)))}</li>`).join("")
    : "";

  return `
    <div class="copilot-feedback-block">
      <p class="tiny"><strong>COPILOT FEEDBACK</strong> <span class="badge">assisted mode</span></p>
      <p class="tiny"><strong>Headline:</strong> ${escapeHtml(verdict.headline || "—")}</p>
      <p class="tiny"><strong>Trade Posture:</strong> ${escapeHtml(verdict.trade_posture || "—")} &nbsp;|&nbsp; <strong>Entry Quality:</strong> ${escapeHtml(verdict.entry_quality || "—")}</p>
      <p class="tiny"><strong>Preferred Scenario:</strong> ${escapeHtml(verdict.preferred_scenario || primary.name || "—")}</p>
      <p class="tiny"><strong>Primary:</strong> ${escapeHtml(primary.name || "—")} ${statusBadge(ev.primaryStatus)}</p>
      ${alternate ? `<p class="tiny"><strong>Alternate:</strong> ${escapeHtml(alternate.name || "—")} ${statusBadge(ev.alternateStatus)}</p>` : ""}
      ${ev.globalInvalidated ? `<p class="tiny badge-red"><strong>⚠ Global Invalidation Active</strong></p>` : ""}
      <p class="tiny"><strong>Matched Triggers:</strong></p>
      <ul class="copilot-rules-list">${matchedList}</ul>
      <p class="tiny"><strong>Active Invalidations:</strong></p>
      <ul class="copilot-rules-list">${invalidatedList}</ul>
      ${riskList ? `<p class="tiny"><strong>Cognitive Risks:</strong></p><ul class="copilot-rules-list">${riskList}</ul>` : ""}
      ${fx.summaryText ? `<p class="tiny muted"><strong>Explanation:</strong> ${escapeHtml(fx.summaryText)}</p>` : ""}
      ${fx.blockEntry ? `<p class="tiny badge-red">⛔ Entry blocked by copilot</p>` : ""}
      ${fx.requireConfirmation && !fx.blockEntry ? `<p class="tiny badge-yellow">⏳ Confirmation required</p>` : ""}
    </div>`;
}

/**
 * Render the full Copilot Feedback tab panel.
 * @param {object|null} feedback
 * @param {object|null} evaluation
 * @param {object|null} effects
 * @param {object[]}    history     – feedback import history
 * @param {object[]}    traces      – decision trace history (newest first)
 * @param {object|null} stats       – aggregated trace statistics
 * @returns {string} HTML string
 */
export function renderCopilotFeedbackTabPanel(feedback, evaluation, effects, history = [], traces = [], stats = null) {
  const block = renderCopilotFeedbackBlock(feedback, evaluation, effects);

  const historyRows = history.length
    ? history.map((h, i) => {
        const v = h.copilot_verdict || {};
        return `<li class="tiny muted">[${i + 1}] ${escapeHtml(h.receivedAt || "")} — ${escapeHtml(v.headline || "")} (${escapeHtml(v.trade_posture || "")}, ${escapeHtml(v.entry_quality || "")})</li>`;
      }).join("")
    : "<li class=\"tiny muted\">No history yet.</li>";

  const decisionTraceHtml   = renderDecisionTraceHistory(traces);
  const aggregatedStatsHtml = renderAggregatedStats(stats);

  return `
    <div class="copilot-feedback-tab">
      <h3>Copilot Feedback Import</h3>
      <p class="muted tiny">Paste a <code>patternlab_copilot_feedback_v1</code> JSON from ChatGPT below. The system will validate, save and monitor it in assisted mode.</p>
      <textarea id="copilot-json-input" rows="12" placeholder='{ "schema": "patternlab_copilot_feedback_v1", "copilot_verdict": { ... }, "scenario_primary": { ... } }'></textarea>
      <div class="button-row compact">
        <button id="btn-copilot-import" class="primary">Import &amp; Validate</button>
        <button id="btn-copilot-clear" class="ghost">Clear</button>
      </div>
      <div id="copilot-import-status" class="quick-add-feedback muted"></div>

      <h3>Current Feedback</h3>
      ${block}

      <h3>Decision Trace</h3>
      <p class="muted tiny">Per-candle audit: triggers matched, reasons for no-trade, and forward outcome after the decision.</p>
      ${decisionTraceHtml}

      <h3>Decision History</h3>
      ${aggregatedStatsHtml}

      <h3>Feedback Import History (last ${history.length})</h3>
      <ul id="copilot-history-list">${historyRows}</ul>
    </div>`;
}

// ─── Decision Trace rendering helpers ────────────────────────────────────────

/**
 * Render the full history of decision traces (newest first).
 * The most recent trace is expanded; older ones are collapsed.
 * @param {object[]} traces
 * @returns {string} HTML string
 */
export function renderDecisionTraceHistory(traces = []) {
  if (!traces || traces.length === 0) {
    return `<p class="muted tiny">No decision traces yet. Traces are recorded automatically when the copilot evaluates a closed candle.</p>`;
  }
  return traces
    .map((trace, idx) => renderSingleDecisionTrace(trace, idx === 0))
    .join("\n");
}

/**
 * Render a single decision_trace_v1 record.
 * @param {object}  trace
 * @param {boolean} open – whether the <details> element should start expanded
 * @returns {string} HTML string
 */
export function renderSingleDecisionTrace(trace, open = false) {
  if (!trace) return "";

  const dec    = trace.decision           || {};
  const ctx    = trace.market_context     || {};
  const noTrd  = trace.no_trade_analysis  || {};
  const scPri  = trace.scenarios?.primary || {};
  const scAlt  = trace.scenarios?.alternate || null;
  const fwd    = trace.forward_eval       || {};
  const risks  = Array.isArray(trace.cognitive_risks) ? trace.cognitive_risks : [];

  const actionBadge  = renderActionBadge(dec.action);
  const qualityBadge = renderBlockQualityBadge(fwd.block_quality);
  const statusBadge  = (s) => {
    if (!s || s === "pending") return `<span class="dt-badge dt-badge-muted">${escapeHtml(s || "pending")}</span>`;
    const cls = s === "validated" ? "dt-badge-green" : s === "invalidated" ? "dt-badge-red" : "dt-badge-yellow";
    return `<span class="dt-badge ${cls}">${escapeHtml(s)}</span>`;
  };

  const timeLabel = escapeHtml(trace.candle_time ? String(trace.candle_time).slice(0, 19).replace("T", " ") : "—");
  const openAttr  = open ? " open" : "";

  return `
<details class="dt-section"${openAttr}>
  <summary class="dt-summary">
    <span class="dt-summary-time">${timeLabel}</span>
    <span class="dt-summary-meta">
      ${escapeHtml(dec.scenario_primary || "—")}
      &nbsp;${actionBadge}
      ${qualityBadge ? `&nbsp;${qualityBadge}` : ""}
    </span>
  </summary>

  <!-- A. Header -->
  <div class="dt-block dt-header">
    <div class="dt-header-row">
      <span class="dt-label">Posture</span>
      <span class="dt-value">${escapeHtml(dec.posture || "—")}</span>
      <span class="dt-label">Entry Quality</span>
      <span class="dt-value">${escapeHtml(dec.entry_quality || "—")}</span>
      <span class="dt-label">Confidence</span>
      <span class="dt-value">${dec.confidence != null ? dec.confidence + "%" : "—"}</span>
    </div>
    <div class="dt-header-row">
      <span class="dt-label">Regime</span>
      <span class="dt-value">${escapeHtml(ctx.regime || "—")}</span>
      <span class="dt-label">Structure</span>
      <span class="dt-value">${escapeHtml(ctx.structure || "—")}</span>
      <span class="dt-label">Momentum</span>
      <span class="dt-value">${escapeHtml(ctx.momentum || "—")}</span>
    </div>
    <div class="dt-header-row">
      <span class="dt-label">Primary</span>
      <span class="dt-value">${escapeHtml(scPri.name || "—")} ${statusBadge(scPri.status)}</span>
      ${scAlt ? `<span class="dt-label">Alternate</span><span class="dt-value">${escapeHtml(scAlt.name || "—")} ${statusBadge(scAlt.status)}</span>` : ""}
    </div>
  </div>

  <!-- B. Why This Decision -->
  <div class="dt-block">
    <div class="dt-block-title">Why this decision?</div>
    <p class="dt-reason-text tiny">${escapeHtml(noTrd.reason_text || "—")}</p>
    ${renderReasonChips(noTrd.reason_codes || [])}
  </div>

  <!-- C. Triggers -->
  <div class="dt-block">
    <div class="dt-block-title">Triggers</div>
    ${renderTriggersBlock(scPri, scAlt)}
  </div>

  <!-- D. Cognitive Risks -->
  <div class="dt-block">
    <div class="dt-block-title">Cognitive Risks</div>
    ${risks.length
      ? `<ul class="dt-list">${risks.map((r) => `<li class="tiny dt-risk-item">${escapeHtml(r)}</li>`).join("")}</ul>`
      : `<p class="tiny muted">None detected.</p>`}
  </div>

  <!-- E. Forward Eval -->
  <div class="dt-block">
    <div class="dt-block-title">Forward Eval ${qualityBadge || ""}</div>
    ${renderForwardEval(fwd)}
  </div>

  <!-- F. Explanation -->
  <div class="dt-block">
    <div class="dt-block-title">Explanation</div>
    <p class="tiny dt-explanation">${escapeHtml(trace.explanation_human || "—")}</p>
  </div>
</details>`;
}

/** Render matched / missing / invalid triggers for primary (and optionally alternate) scenario. */
function renderTriggersBlock(scPri, scAlt) {
  const rows = [];

  const addSection = (label, matched, missing, invalidations) => {
    rows.push(`<div class="dt-trigger-section-label tiny muted">${escapeHtml(label)}</div>`);
    rows.push(`<div class="dt-trigger-grid">`);
    for (const t of matched) {
      rows.push(`<div class="dt-trigger dt-trigger-matched">✓ ${escapeHtml(t)}</div>`);
    }
    for (const t of missing) {
      rows.push(`<div class="dt-trigger dt-trigger-missing">⊘ ${escapeHtml(t)}</div>`);
    }
    for (const t of invalidations) {
      rows.push(`<div class="dt-trigger dt-trigger-invalid">✗ ${escapeHtml(t)}</div>`);
    }
    if (!matched.length && !missing.length && !invalidations.length) {
      rows.push(`<div class="dt-trigger dt-trigger-none tiny muted">No trigger data.</div>`);
    }
    rows.push(`</div>`);
  };

  addSection(
    scPri?.name ? `Primary: ${scPri.name}` : "Primary Scenario",
    scPri?.matched_triggers    || [],
    scPri?.missing_triggers    || [],
    scPri?.active_invalidations || [],
  );

  if (scAlt) {
    addSection(
      scAlt?.name ? `Alternate: ${scAlt.name}` : "Alternate Scenario",
      scAlt?.matched_triggers    || [],
      scAlt?.missing_triggers    || [],
      scAlt?.active_invalidations || [],
    );
  }

  return rows.join("\n");
}

/** Render the forward evaluation grid. */
function renderForwardEval(fwd) {
  if (!fwd) return `<p class="tiny muted">No forward data yet.</p>`;

  const fmt = (bar) => {
    if (!bar) return `<span class="muted">pending</span>`;
    const sign = (bar.changePct ?? 0) >= 0 ? "+" : "";
    const cls  = (bar.changePct ?? 0) >= 0 ? "dt-fwd-up" : "dt-fwd-down";
    return `<span class="${cls}">${sign}${bar.changePct ?? "?"}%</span>`;
  };

  const fmtScalar = (val) =>
    val != null ? `<span class="${val >= 0 ? "dt-fwd-up" : "dt-fwd-down"}">${val > 0 ? "+" : ""}${val}%</span>` : `<span class="muted">pending</span>`;

  return `
    <div class="dt-fwd-grid">
      <div class="dt-fwd-cell"><span class="dt-fwd-label">+1</span>${fmt(fwd.bars_1)}</div>
      <div class="dt-fwd-cell"><span class="dt-fwd-label">+2</span>${fmt(fwd.bars_2)}</div>
      <div class="dt-fwd-cell"><span class="dt-fwd-label">+3</span>${fmt(fwd.bars_3)}</div>
      <div class="dt-fwd-cell"><span class="dt-fwd-label">+5</span>${fmt(fwd.bars_5)}</div>
      <div class="dt-fwd-cell"><span class="dt-fwd-label">MFE</span>${fmtScalar(fwd.mfe)}</div>
      <div class="dt-fwd-cell"><span class="dt-fwd-label">MAE</span>${fmtScalar(fwd.mae)}</div>
    </div>`;
}

/** Render reason code chips. */
function renderReasonChips(codes = []) {
  if (!codes.length) return "";
  return `<div class="dt-chips">${codes.map((c) => `<span class="dt-chip dt-chip-reason">${formatKeyLabel(c)}</span>`).join("")}</div>`;
}

/** Render action badge. */
function renderActionBadge(action) {
  const map = {
    long_candidate:  ["dt-badge-green",  "long candidate"],
    short_candidate: ["dt-badge-red",    "short candidate"],
    blocked:         ["dt-badge-red",    "blocked"],
    no_trade:        ["dt-badge-yellow", "no trade"],
    wait:            ["dt-badge-muted",  "wait"],
  };
  const [cls, label] = map[action] || ["dt-badge-muted", action || "—"];
  return `<span class="dt-badge ${cls}">${escapeHtml(label)}</span>`;
}

/** Render block quality badge. */
function renderBlockQualityBadge(bq) {
  if (!bq || bq === "pending") return `<span class="dt-badge dt-badge-muted">pending</span>`;
  const map = {
    excellent_block:    ["dt-badge-green",  "excellent block"],
    good_block:         ["dt-badge-green",  "good block"],
    neutral_block:      ["dt-badge-muted",  "neutral block"],
    bad_block:          ["dt-badge-red",    "bad block"],
    missed_opportunity: ["dt-badge-yellow", "missed opportunity"],
  };
  const [cls, label] = map[bq] || ["dt-badge-muted", bq];
  return `<span class="dt-badge ${cls}">${escapeHtml(label)}</span>`;
}

// ─── Aggregated Stats rendering ───────────────────────────────────────────────

/**
 * Render the aggregated decision stats panel.
 * @param {object|null} stats
 * @returns {string} HTML string
 */
export function renderAggregatedStats(stats) {
  if (!stats || stats.total === 0) {
    return `<p class="muted tiny">No decision history yet. Stats accumulate as candles are evaluated.</p>`;
  }

  const pct = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";

  const topList = (items) =>
    items.length
      ? `<ul class="dt-list">${items.map((x) => `<li class="tiny">${formatKeyLabel(x.key)} <span class="muted">(${x.count})</span></li>`).join("")}</ul>`
      : `<p class="tiny muted">None.</p>`;

  return `
    <details class="dt-section">
      <summary class="dt-summary">
        <span class="dt-summary-time">Aggregated (${stats.total} candles)</span>
        <span class="dt-summary-meta muted tiny">
          ${stats.goodBlocks} good blocks &nbsp;·&nbsp; ${stats.missedOpportunities} missed
        </span>
      </summary>
      <div class="dt-block">
        <div class="dt-stats-grid">
          <div class="dt-stat-cell"><span class="dt-stat-label">Total</span><span class="dt-stat-value">${stats.total}</span></div>
          <div class="dt-stat-cell"><span class="dt-stat-label">Candidates</span><span class="dt-stat-value">${stats.tradeCandidates}</span></div>
          <div class="dt-stat-cell"><span class="dt-stat-label">Blocked</span><span class="dt-stat-value">${stats.blocked}</span></div>
          <div class="dt-stat-cell"><span class="dt-stat-label">No-trade</span><span class="dt-stat-value">${stats.noTrade}</span></div>
          <div class="dt-stat-cell"><span class="dt-stat-label">Good blocks</span><span class="dt-stat-value dt-fwd-up">${stats.goodBlocks} (${stats.goodBlockPct}%)</span></div>
          <div class="dt-stat-cell"><span class="dt-stat-label">Missed</span><span class="dt-stat-value dt-fwd-down">${stats.missedOpportunities} (${stats.missedOpportunityPct}%)</span></div>
        </div>
        <div class="dt-stats-cols">
          <div>
            <div class="dt-block-title">Top No-trade Reasons</div>
            ${topList(stats.topReasonCodes)}
          </div>
          <div>
            <div class="dt-block-title">Top Invalidations</div>
            ${topList(stats.topInvalidations)}
          </div>
          <div>
            <div class="dt-block-title">Most Matched Triggers</div>
            ${topList(stats.topMatchedTriggers)}
          </div>
        </div>
      </div>
    </details>`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Simple HTML-escape helper.
 * @param {unknown} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert an underscore-separated key to a human-readable label and escape it.
 * e.g. "active_invalidation" → "active invalidation"
 * @param {string} key
 * @returns {string} HTML-escaped label
 */
function formatKeyLabel(key) {
  return escapeHtml(String(key ?? "").replace(/_/g, " "));
}
