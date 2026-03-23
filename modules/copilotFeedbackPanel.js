// copilotFeedbackPanel.js
// Renders the Copilot Feedback block inside Session Candle and the standalone tab panel.

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
 * @param {object[]} history
 * @returns {string} HTML string
 */
export function renderCopilotFeedbackTabPanel(feedback, evaluation, effects, history = []) {
  const block = renderCopilotFeedbackBlock(feedback, evaluation, effects);

  const historyRows = history.length
    ? history.map((h, i) => {
        const v = h.copilot_verdict || {};
        return `<li class="tiny muted">[${i + 1}] ${escapeHtml(h.receivedAt || "")} — ${escapeHtml(v.headline || "")} (${escapeHtml(v.trade_posture || "")}, ${escapeHtml(v.entry_quality || "")})</li>`;
      }).join("")
    : "<li class=\"tiny muted\">No history yet.</li>";

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

      <h3>History (last ${history.length})</h3>
      <ul id="copilot-history-list">${historyRows}</ul>
    </div>`;
}

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
