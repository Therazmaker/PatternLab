import { downloadReviewJson, loadJournalExport, reviewSessionExport, validateJournalExportSchema } from "../reviewer/sessionReviewer.js";

function fmtPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "-";
}

function fmt(value, digits = 4) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function list(items = [], empty = "No data") {
  if (!items.length) return `<li class="muted">${empty}</li>`;
  return items.map((item) => `<li>${item}</li>`).join("");
}

export function createSessionReviewerTab({ elements = {} } = {}) {
  const state = {
    fileName: "-",
    status: "idle",
    schema: "-",
    validation: null,
    review: null,
  };

  async function runLoad(source) {
    const loaded = await loadJournalExport(source);
    if (!loaded.ok) {
      state.status = loaded.error || "failed";
      state.review = null;
      render();
      return;
    }

    state.fileName = loaded.sourceName || "input";
    state.validation = validateJournalExportSchema(loaded.data);
    state.schema = state.validation.sourceSchema || "unknown";
    state.review = reviewSessionExport(loaded.data);
    state.status = state.validation.ok ? "ready" : `warning: ${state.validation.errors.join(" | ") || state.validation.warnings.join(" | ")}`;
    render();
  }

  function handleFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    runLoad(file);
  }

  function handlePasteReview() {
    const raw = elements.input?.value || "";
    if (!raw.trim()) {
      state.status = "Paste JSON text first.";
      render();
      return;
    }
    runLoad(raw);
  }

  function handleExportReview() {
    if (!state.review) return;
    downloadReviewJson(state.review);
    state.status = "review exported";
    render();
  }

  function bindEvents() {
    elements.fileInput?.addEventListener("change", handleFile);
    elements.loadPasteBtn?.addEventListener("click", handlePasteReview);
    elements.exportBtn?.addEventListener("click", handleExportReview);
  }

  function renderSummary() {
    const overview = state.review?.sessionOverview;
    if (!overview || !elements.summary) {
      if (elements.summary) elements.summary.innerHTML = '<p class="muted">Load a MicroBot journal export to start review.</p>';
      return;
    }
    const topIssue = state.review.criticalFindings[0] || state.review.warnings[0] || "No major issue flagged";
    elements.summary.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><span>Trades</span><strong>${overview.totalTrades}</strong></div>
        <div class="stat-card"><span>Winrate</span><strong>${fmtPct(overview.winRate)}</strong></div>
        <div class="stat-card"><span>Expectancy</span><strong>${fmt(overview.expectancy)}</strong></div>
        <div class="stat-card"><span>Net PnL (R)</span><strong>${fmt(overview.netPnl)}</strong></div>
        <div class="stat-card"><span>Interpretation</span><strong>${overview.interpretation}</strong></div>
      </div>
      <p><strong>Top issue:</strong> ${topIssue}</p>
    `;
  }

  function renderPanels() {
    const review = state.review;
    if (!review) {
      [elements.findings, elements.setup, elements.context, elements.learning, elements.winningDna, elements.fixes].forEach((el) => {
        if (el) el.innerHTML = '<p class="muted">No review yet.</p>';
      });
      return;
    }

    if (elements.findings) {
      elements.findings.innerHTML = `
        <article>
          <h4>Critical findings</h4>
          <ul class="mini-list">${list(review.criticalFindings, "No critical findings")}</ul>
        </article>
        <article>
          <h4>Warnings</h4>
          <ul class="mini-list">${list(review.warnings, "No warnings")}</ul>
        </article>
        <article>
          <h4>Data quality issues</h4>
          <ul class="mini-list">${list(review.dataQualityIssues, "No data quality issues")}</ul>
        </article>
      `;
    }

    if (elements.setup) {
      const rows = (review.setupAnalysis?.bySetup || []).map((row) => `<tr>
        <td>${row.setup}</td><td>${row.count}</td><td>${row.wins}</td><td>${row.losses}</td><td>${fmtPct(row.winRate)}</td><td>${fmt(row.expectancy)}</td><td>${fmt(row.avgMfe)}</td><td>${fmt(row.avgMae)}</td><td>${row.longCount}/${row.shortCount}</td><td>${row.tooFewSamples ? "low sample" : "ok"}</td>
      </tr>`).join("");
      elements.setup.innerHTML = `
        <p><strong>Concentration:</strong> ${fmtPct(review.setupAnalysis.concentration)} ${review.setupAnalysis.monocultureDetected ? "· monoculture" : ""}</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Setup</th><th>Count</th><th>Wins</th><th>Losses</th><th>Winrate</th><th>Expectancy</th><th>Avg MFE</th><th>Avg MAE</th><th>L/S</th><th>Sample</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="10" class="muted">No setup rows</td></tr>'}</tbody>
          </table>
        </div>
      `;
    }

    if (elements.context) {
      const freq = (review.contextAnalysis.matchedLibraryItemsFrequency || []).slice(0, 8).map((row) => `<li>${row.item}: <strong>${row.count}</strong></li>`).join("");
      const bySetup = (review.contextAnalysis.avgConfidenceBySetup || []).map((row) => `<li>${row.setup}: ${fmt(row.confidence, 3)}</li>`).join("");
      elements.context.innerHTML = `
        <p><strong>Danger active trades:</strong> ${review.contextAnalysis.highDangerTrades}</p>
        <p><strong>AvoidChase active trades:</strong> ${review.contextAnalysis.avoidChaseTrades}</p>
        <p><strong>High risk without warnings:</strong> ${review.contextAnalysis.highRiskNoWarningTrades}</p>
        <p><strong>Avg confidence (win/loss):</strong> ${fmt(review.contextAnalysis.avgConfidenceByOutcome?.win, 3)} / ${fmt(review.contextAnalysis.avgConfidenceByOutcome?.loss, 3)}</p>
        <p><strong>Confidence range:</strong> ${fmt(review.contextAnalysis.confidenceRange, 3)} ${review.contextAnalysis.confidencePossiblyFlat ? "(possibly flat)" : ""}</p>
        <h4>Matched library items frequency</h4>
        <ul class="mini-list">${freq || '<li class="muted">No matched items</li>'}</ul>
        <h4>Average confidence by setup</h4>
        <ul class="mini-list">${bySetup || '<li class="muted">No confidence by setup</li>'}</ul>
      `;
    }

    if (elements.learning) {
      const missing = review.missingDataAnalysis || {};
      elements.learning.innerHTML = `
        <p><strong>Learning assessment:</strong> ${review.learningAnalysis.learningQualityLabel}</p>
        <p><strong>Empty learningOutput:</strong> ${fmtPct(review.learningAnalysis.emptyLearningOutputPct)}</p>
        <p><strong>learningRecorded=false:</strong> ${fmtPct(review.learningAnalysis.learningRecordedFalsePct)}</p>
        <p><strong>learningExcluded=true:</strong> ${fmtPct(review.learningAnalysis.learningExcludedTruePct)}</p>
        <p><strong>Lesson candidates:</strong> ${review.learningAnalysis.lessonCandidates}</p>
        <div class="split">
          <article class="panel-soft"><h4>Missing critical</h4><ul class="mini-list">${list(missing.missingCritical, "None")}</ul></article>
          <article class="panel-soft"><h4>Missing important</h4><ul class="mini-list">${list(missing.missingImportant, "None")}</ul></article>
          <article class="panel-soft"><h4>Nice to have</h4><ul class="mini-list">${list(missing.niceToHave, "None")}</ul></article>
        </div>
        <p><strong>Scores:</strong> execution ${review.scores.executionHealth} · context ${review.scores.contextDiscipline} · learning ${review.scores.learningReadiness} · data ${review.scores.dataQuality} · diversity ${review.scores.strategyDiversity}</p>
      `;
    }

    if (elements.winningDna) {
      const winning = review.winningDNA || {};
      const qualifiers = (winning.positiveQualifiers || []).map((item) => `
        <article class="panel-soft">
          <p><span class="badge">${item.priority || "low"}</span> <strong>${item.title}</strong></p>
          <p class="muted">${item.description || "No description."}</p>
          <p><strong>Rule hint:</strong> ${item.ruleHint || "-"}</p>
        </article>
      `).join("");
      const weak = list((winning.weakSignals || []).map((row) => String(row)));
      const limitations = list((winning.dataLimitations || []).map((row) => String(row)));
      const integrations = list((winning.recommendedNextIntegration || []).map((row) => String(row)));
      const differences = (winning.comparison?.differences || []).slice(0, 6).map((row) => `<li>${row.title}: <strong>${fmt(row.value, 4)}</strong></li>`).join("");

      elements.winningDna.innerHTML = `
        <p><strong>Schema:</strong> ${winning.schema || "-"}</p>
        <p><strong>Limited confidence:</strong> ${winning.limitedConfidence ? "yes" : "no"}</p>
        <p><strong>Wins/Losses:</strong> ${(winning.sessionContext?.wins ?? 0)} / ${(winning.sessionContext?.losses ?? 0)} (total ${(winning.sessionContext?.totalTrades ?? 0)})</p>
        <h4>Top Positive Qualifiers</h4>
        ${qualifiers || '<p class="muted">No strong positive qualifiers found yet.</p>'}
        <h4>Win/Loss differences</h4>
        <ul class="mini-list">${differences || '<li class="muted">No comparable differences.</li>'}</ul>
        <h4>Weak signals</h4>
        <ul class="mini-list">${weak}</ul>
        <h4>Data limitations</h4>
        <ul class="mini-list">${limitations}</ul>
        <h4>Recommended next integration</h4>
        <ul class="mini-list">${integrations}</ul>
      `;
    }

    if (elements.fixes) {
      elements.fixes.innerHTML = (review.recommendedFixes || []).map((fix) => `
        <article class="panel-soft">
          <p><span class="badge">${fix.priority}</span> <strong>${fix.title}</strong></p>
          <p class="muted">${fix.why}</p>
          <p>${fix.suggestedImplementation}</p>
        </article>
      `).join("") || '<p class="muted">No recommendations.</p>';
    }
  }

  function render() {
    if (elements.fileName) elements.fileName.textContent = state.fileName;
    if (elements.schema) elements.schema.textContent = state.schema;
    if (elements.status) elements.status.textContent = state.status;
    renderSummary();
    renderPanels();
  }

  bindEvents();
  render();

  return {
    render,
  };
}
