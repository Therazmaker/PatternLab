function safe(v, fallback = "—") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function pct(v) {
  const n = Number(v || 0);
  return `${(n * 100).toFixed(0)}%`;
}

function chips(rows = []) {
  if (!rows.length) return '<span class="badge-muted">none</span>';
  return rows.map((row) => `<span class="brain-chip">${row}</span>`).join(" ");
}

function statusFromExecutor(state = {}) {
  if (state.activeTradeId) return "in-trade";
  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) return "cooldown";
  if (state.armed) return "armed";
  return "idle";
}

export function renderBrainDashboard(verdict = null, modeState = {}, executionControlState = {}, opts = {}) {
  if (!verdict) return '<article class="panel-soft brain-dashboard"><h4>Brain Dashboard</h4><p class="muted tiny">Waiting for market context...</p></article>';
  const shadowExecutionEnabled = Boolean(executionControlState?.shadowExecutionEnabled);
  const authority = executionControlState?.executionAuthority || "manual_only";
  const authorityLabel = authority === "copilot" ? "Copilot" : authority === "shadow" ? "Shadow" : "Manual Only";
  const executorState = opts?.executorState || {};
  const learning = opts?.learningProgress || {};
  const activeTrade = opts?.activeTrade || null;
  const liveGate = opts?.liveGate || { allowed: false, reasons: [] };
  const plan = executorState?.currentPlan || {};
  const warnings = [];
  if (Number(verdict?.danger_score || 0) > 0.7) warnings.push("high danger context");
  if (String(verdict?.no_trade_reason || "").includes("repeated_loss_context")) warnings.push("repeated loss pattern");
  if (Number(verdict?.friction || 0) > 0.68) warnings.push("friction blocking entry");
  if (verdict?.exploration_trade_allowed && ["execute_on_confirmation", "exploration"].includes(String(verdict?.posture || "").toLowerCase())) {
    warnings.push("exploratory trade allowed despite wait");
  }
  if (verdict?.exploration_override_applied) {
    warnings.push("Friction bypassed for exploration");
    warnings.push("Danger context allowed for data collection");
  }
  const profile = executorState?.learningProfile || verdict?.learning_profile || {};
  const planContext = plan?.context_signature ? (opts?.contextRow || {}) : {};
  const autoShift = verdict?.auto_shift || {};
  const riskProfile = plan?.risk_profile || executorState?.lastRiskProfile || null;
  const manualControls = opts?.manualControls || {};
  const manualOverridesActive = Boolean(opts?.manualOverridesActive);
  const confidencePreview = Math.max(0, Math.min(1, Number(verdict?.confidence || 0) + Number(manualControls?.confidence_boost || 0)));
  const sizePreview = Math.max(
    0,
    Math.min(
      Number(manualControls?.max_risk_cap ?? 1),
      Number(riskProfile?.size_multiplier || 0) * Number(manualControls?.risk_multiplier_override || 1),
    ),
  );
  const modePreview = manualControls?.force_learning_mode || verdict?.learning_mode || "mixed";
  const maxExploratoryTrades = Number(profile?.max_exploratory_trades_per_context || 5);
  const exploratoryTaken = Number(planContext?.exploratory_trades_taken || 0);
  const exploratoryLeft = Math.max(0, maxExploratoryTrades - exploratoryTaken);
  const pauseRemaining = Number(planContext?.exploration_pause_remaining_candles || 0);
  const exploreRatio = Number(autoShift?.exploration_weight ?? 0.5);
  const exploitRatio = Number(autoShift?.exploitation_weight ?? 0.5);
  const assistState = opts?.assistedReinforcement || {};
  const libraryInsights = opts?.libraryInsights || { matches: [], warnings: [], lessons: [], biasHints: [] };
  const topLibraryMatches = Array.isArray(libraryInsights.matches) ? libraryInsights.matches.slice(0, 3) : [];
  const libraryLessons = Array.isArray(libraryInsights.lessons) ? libraryInsights.lessons.slice(0, 2) : [];
  const libraryBiasHints = Array.isArray(libraryInsights.biasHints) ? libraryInsights.biasHints.slice(0, 2) : [];
  const assistSummary = assistState?.lastSummary || {};
  const assistHeadline = assistSummary?.headline || "No reinforcement applied yet";
  const assistRuleCount = Number(assistSummary?.rulesUpdated || 0);
  const assistScenarioChanges = Number(assistSummary?.scenarioChanges || 0);
  const assistConfidenceDelta = Number(assistSummary?.confidenceDelta || 0);
  const assistTags = Array.isArray(assistSummary?.lessonTagsAdded) ? assistSummary.lessonTagsAdded : [];
  const assistInput = String(assistState?.inputText || "");
  const assistInputValid = Boolean(assistState?.inputValid);
  const assistInputError = assistState?.inputError || "";
  const syntheticInput = String(assistState?.syntheticInput || "");
  const syntheticInputValid = Boolean(assistState?.syntheticInputValid);
  const syntheticInputError = assistState?.syntheticInputError || "";
  const syntheticStoredCount = Number(assistState?.syntheticStoredCount || 0);
  const syntheticRatio = assistState?.syntheticRatio || {};
  const syntheticPct = Number(syntheticRatio?.ratioSynthetic || 0) * 100;
  const realPct = Number(syntheticRatio?.ratioReal || 0) * 100;
  const syntheticLastImportAt = assistState?.syntheticLastImportAt || "none";
  const assistHistory = Array.isArray(assistState?.history || []) ? assistState.history.slice(-5).reverse() : [];
  const assistOverlayActive = Boolean(assistState?.overlayActive);
  const assistOverlayFields = assistState?.overlayLastFields || {};
  const learningStateMessage = String(verdict?.learning_mode || "mixed") === "exploration"
    ? "Exploration: low sample context"
    : String(verdict?.learning_mode || "mixed") === "exploitation"
      ? "Exploitation: high winrate context"
      : String(verdict?.learning_mode || "mixed") === "blocked"
        ? "Blocked: repeated losses detected"
        : "Mixed: uncertain edge";

  return `
    <article class="panel-soft brain-dashboard">
      <div class="brain-head">
        <h4>Session Candle · Brain Live Panel</h4>
        <span class="badge">Brain Mode: AGGRESSIVE PAPER</span>
        <span class="badge ${executorState.enabled ? "badge-green" : "badge-muted"}">Executor Status: ${executorState.enabled ? "ACTIVE" : "OFF"}</span>
      </div>

      <div class="brain-grid">
        <section>
          <h5>A. Brain Status</h5>
          <p class="tiny">authority: <strong>${authorityLabel}</strong> · enabled: <strong>${executorState.enabled ? "yes" : "no"}</strong></p>
          <p class="tiny">paper/live: <strong>${safe(executorState.mode, "paper")}</strong> · state: <strong>${statusFromExecutor(executorState)}</strong></p>
          <p class="tiny">Auto-arm: <strong>${executorState.autoArm ? "ON" : "OFF"}</strong> · Cooldown: <strong>${safe(executorState.cooldownCandles, 1)} candle</strong> (${safe(executorState.cooldownCandlesRemaining, 0)} remaining)</p>
          <p class="tiny">armed: <strong>${executorState.armed ? "yes" : "no"}</strong> · active trade: <strong>${safe(executorState.activeTradeId, "none")}</strong></p>
          ${liveGate.allowed ? '<p class="tiny"><span class="badge badge-green">live gate passed</span></p>' : `<p class="tiny"><span class="badge-muted">live blocked: ${safe((liveGate.reasons || [])[0], "paper only")}</span></p>`}
        </section>

        <section>
          <h5>B. Current Intelligence</h5>
          <p class="tiny">bias: <strong>${safe(verdict.bias)}</strong> · confidence: <strong>${pct(verdict.confidence)}</strong> · friction: <strong>${safe(verdict.friction)}</strong></p>
          <p class="tiny">danger: <strong>${safe(verdict.danger_score)}</strong> · familiarity: <strong>${safe(verdict.familiarity)}</strong> · learned bias: <strong>${safe(verdict.learned_bias)}</strong></p>
          <p class="tiny">active rules: <strong>${(verdict.active_rules || []).length}</strong></p>
          <div>${chips((verdict.active_rules || []).map((rule) => rule.text || rule.id))}</div>
          <p class="tiny">library matches: <strong>${topLibraryMatches.length}</strong></p>
          <div>${chips(topLibraryMatches.map((row) => `${row.item?.type}:${row.item?.name || row.item?.id}`))}</div>
        </section>

        <section>
          <h5>C. Next Trade</h5>
          <p class="tiny">setup: <strong>${safe(plan.setup_name || (verdict?.exploration_override_applied ? `exploratory_${safe(verdict.bias, "long")}` : verdict.next_candle_plan?.posture))}</strong></p>
          <p class="tiny">trigger: <strong>${safe(plan.trigger || verdict.next_candle_plan?.trigger_long || verdict.next_candle_plan?.trigger_short)}</strong></p>
          <p class="tiny">invalidation: <strong>${safe(plan.invalidation || verdict.next_candle_plan?.invalidation)}</strong></p>
          <p class="tiny">entry/stop/target: <strong>${safe(plan.planned_entry)}</strong> / <strong>${safe(plan.stop)}</strong> / <strong>${safe(plan.target)}</strong></p>
          <p class="tiny">scenario: <strong>${safe(plan.scenario_primary?.name || plan.scenario_primary?.type)}</strong> · alt: <strong>${safe(opts?.secondaryScenario?.name || opts?.secondaryScenario?.type)}</strong></p>
          ${verdict?.exploration_override_applied ? '<p class="tiny"><span class="badge badge-yellow">Exploratory Trade (Learning Mode)</span></p>' : ""}
          ${verdict?.exploration_override_applied ? '<p class="tiny"><span class="badge badge-yellow">Friction bypassed for exploration</span></p>' : ""}
          ${verdict?.exploration_override_applied ? '<p class="tiny"><span class="badge badge-yellow">Danger context allowed for data collection</span></p>' : ""}
          <p class="tiny">library hints:</p>
          <div>${chips(libraryBiasHints.map((row) => `${row.hint}${row.bias ? ` (${row.bias})` : ""}`))}</div>
          <div class="button-row compact">
            <button type="button" class="ghost" data-brain-action="open-trade-visualizer">👁 View Setup</button>
          </div>
        </section>

        <section>
          <h5>D. Trade Live Monitor</h5>
          <p class="tiny">status: <strong>${activeTrade ? "active" : "none"}</strong> · id: <strong>${safe(activeTrade?.id, "—")}</strong></p>
          <p class="tiny">entry: <strong>${safe(activeTrade?.entry)}</strong> · stop: <strong>${safe(activeTrade?.stop)}</strong> · target: <strong>${safe(activeTrade?.target)}</strong></p>
          <p class="tiny">MFE: <strong>${safe(activeTrade?.mfe, 0)}</strong> · MAE: <strong>${safe(activeTrade?.mae, 0)}</strong> · candles: <strong>${safe(activeTrade?.bars, 0)}</strong></p>
        </section>

        <section>
          <h5>E. Learning State</h5>
          <p class="tiny">mode: <strong>${safe(verdict.learning_mode, "mixed")}</strong> · ratio: <strong>${Math.round(exploreRatio * 100)}/${Math.round(exploitRatio * 100)}</strong> (explore/exploit)</p>
          <p class="tiny">context maturity: <strong>${safe(verdict.context_maturity, "immature")}</strong> · familiarity: <strong>${safe(autoShift?.familiarity, verdict.familiarity)}</strong></p>
          <p class="tiny">auto-shift reason: <strong>${safe((autoShift?.reason || []).join(", "), learningStateMessage)}</strong></p>
          <p class="tiny"><span class="badge">${learningStateMessage}</span></p>
          ${verdict?.learning_mode === "blocked" ? `<p class="tiny"><span class="badge badge-yellow">Trading blocked (${safe(autoShift?.context_pause_candles, 0)} candle pause)</span></p>` : ""}
        </section>

        <section>
          <h5>F. Learning Progress</h5>
          <p class="tiny">Learning Profile: <strong>${safe(profile?.profile || "aggressive_learning")}</strong> · enabled: <strong>${profile?.enabled ? "yes" : "no"}</strong></p>
          <p class="tiny">Exploratory trades left (context): <strong>${safe(exploratoryLeft, 0)}</strong> / ${safe(maxExploratoryTrades, 5)}</p>
          <p class="tiny">Context pause: <strong>${pauseRemaining > 0 ? `ACTIVE (${pauseRemaining} candles left)` : "inactive"}</strong></p>
          ${verdict?.exploration_trade_allowed ? '<p class="tiny"><span class="badge">exploratory trade allowed despite wait</span></p>' : ""}
          ${verdict?.exploration_override_applied ? `<p class="tiny">bypassed blocks: <strong>${safe((verdict?.bypassed_blocks || []).join(", "), "none")}</strong> · reason mode: <strong>${safe(verdict.trade_reason_mode)}</strong></p>` : ""}
          <p class="tiny">trades executed: <strong>${safe(learning.tradesLearned, 0)}</strong> · contexts learned: <strong>${safe(learning.learnedContexts, 0)}</strong></p>
          <p class="tiny">dangerous contexts: <strong>${safe(learning.dangerousContexts, 0)}</strong> · reliable contexts: <strong>${safe(learning.reliableContexts, 0)}</strong></p>
          <p class="tiny">learning velocity: <strong>${safe(learning.learningVelocity, 0)}</strong></p>
          <p class="tiny">active rules: <strong>${safe(learning.activeRules, 0)}</strong> · scenario reliability: <strong>${pct(learning.scenarioReliability)}</strong></p>
          <p class="tiny">wait accuracy: <strong>${pct(learning.waitAccuracy)}</strong> · paper win rate: <strong>${pct(learning.executorPaperWinRate)}</strong></p>
          <p class="tiny">learning maturity: <strong>${pct(learning.learningMaturity)}</strong></p>
          <p class="tiny">Recent lessons:</p>
          <div>${chips((learning.lastLessons || []).slice(0, 5))}</div>
          <p class="tiny">Warnings:</p>
          <div>${chips(warnings)}</div>
        </section>

        <section>
          <h5>G. Risk Profile</h5>
          <p class="tiny">mode: <strong>${safe(riskProfile?.risk_mode, "mixed")}</strong> · size multiplier: <strong>${safe(riskProfile?.size_multiplier, 0)}</strong></p>
          <p class="tiny">capital fraction: <strong>${safe(riskProfile?.capital_fraction, 0)}</strong> · risk score: <strong>${safe(riskProfile?.risk_score, 0)}</strong></p>
          <p class="tiny">reason: <strong>${safe((riskProfile?.reason || []).join(", "), plan?.setup_name || plan?.trigger ? "Risk pending recompute for active setup." : "Risk pending setup.")}</strong></p>
          <p class="tiny">bonuses: <strong>confidence ${safe(riskProfile?.components?.confidence_bonus, 0)}</strong> · <strong>familiarity ${safe(riskProfile?.components?.familiarity_bonus, 0)}</strong> · <strong>scenario ${safe(riskProfile?.components?.scenario_bonus, 0)}</strong></p>
          <p class="tiny">penalties: <strong>danger ${safe(riskProfile?.components?.danger_penalty, 0)}</strong> · <strong>friction ${safe(riskProfile?.components?.friction_penalty, 0)}</strong></p>
          ${riskProfile?.risk_mode === "exploration" ? '<p class="tiny"><span class="badge badge-yellow">Exploration size reduced due to low familiarity</span></p>' : ""}
          ${riskProfile?.risk_mode === "mixed" ? '<p class="tiny"><span class="badge badge-yellow">Mixed mode active: execution allowed with reduced size</span></p>' : ""}
          ${riskProfile?.risk_mode === "exploitation" ? '<p class="tiny"><span class="badge badge-green">Exploitation size boosted by reliable scenario</span></p>' : ""}
          ${riskProfile?.risk_mode === "blocked" ? '<p class="tiny"><span class="badge badge-yellow">Risk blocked by blocked learning mode</span></p>' : ""}
        </section>

        <section>
          <h5>H. Executor Controls</h5>
          <p class="tiny">library hints:</p>
          <div>${chips(libraryBiasHints.map((row) => `${row.hint}${row.bias ? ` (${row.bias})` : ""}`))}</div>
          <div class="button-row compact">
            <button type="button" class="ghost" data-brain-action="executor-toggle">Brain Executor ${executorState.enabled ? "ON" : "OFF"}</button>
            <button type="button" class="ghost" data-brain-action="executor-mode-paper">Mode: Paper</button>
            <button type="button" class="ghost" data-brain-action="executor-mode-live">Mode: Live</button>
            <button type="button" class="ghost" data-brain-action="executor-arm">Arm Next Trade</button>
            <button type="button" class="ghost" data-brain-action="executor-cancel-arm">Cancel Armed Setup</button>
            <button type="button" class="ghost" data-brain-action="executor-pause">Pause Executor</button>
            <button type="button" class="ghost" data-brain-action="executor-reset-cooldown">Reset Cooldown</button>
          </div>
          <p class="muted tiny">Paper is default. Live execution is blocked until safety gate passes and manual confirmation is enabled.</p>
          <p class="tiny"><span class="badge">manual confirmation: ${(executionControlState?.manualConfirmationRequired !== false) ? "required" : "optional"}</span></p>
        </section>

        <section>
          <h5>I. Confidence Engine</h5>
          <p class="tiny">Confidence: <strong>${pct(verdict?.confidence || 0)}</strong> (${safe(verdict?.confidence_label, "medium")})</p>
          <p class="tiny">components → winrate <strong>${safe(verdict?.confidence_components?.winrate_factor, 0)}</strong> · familiarity <strong>${safe(verdict?.confidence_components?.familiarity_factor, 0)}</strong> · scenario <strong>${safe(verdict?.confidence_components?.scenario_factor, 0)}</strong> · recency <strong>${safe(verdict?.confidence_components?.recency_factor, 0)}</strong></p>
          <p class="tiny">recent performance impact: <strong>${safe((verdict?.confidence_reason || []).find((row) => String(row).includes("recency")) || "n/a")}</strong></p>
          <div>${chips((verdict?.confidence_reason || []).slice(0, 4))}</div>
        </section>

        <section>
          <h5>J. Manual Controls</h5>
          <p class="tiny"><span class="badge ${manualOverridesActive ? "badge-yellow" : "badge-muted"}">override ${manualOverridesActive ? "active" : "inactive"}</span></p>
          <label class="tiny">Confidence Boost (${Number(manualControls?.confidence_boost || 0).toFixed(2)})
            <input type="range" min="-0.2" max="0.2" step="0.01" value="${Number(manualControls?.confidence_boost || 0)}" data-manual-control="confidence_boost" />
          </label>
          <label class="tiny">Risk Multiplier (${Number(manualControls?.risk_multiplier_override || 1).toFixed(2)})
            <input type="range" min="0.5" max="1.5" step="0.01" value="${Number(manualControls?.risk_multiplier_override || 1)}" data-manual-control="risk_multiplier_override" />
          </label>
          <label class="tiny">Exploration Bias (${Number(manualControls?.exploration_bias_override || 0.7).toFixed(2)})
            <input type="range" min="0" max="1" step="0.01" value="${Number(manualControls?.exploration_bias_override || 0.7)}" data-manual-control="exploration_bias_override" />
          </label>
          <label class="tiny">Exploitation Bias (${Number(manualControls?.exploitation_bias_override || 0.3).toFixed(2)})
            <input type="range" min="0" max="1" step="0.01" value="${Number(manualControls?.exploitation_bias_override || 0.3)}" data-manual-control="exploitation_bias_override" />
          </label>
          <label class="tiny">Max Risk Cap (${Number(manualControls?.max_risk_cap || 1).toFixed(2)})
            <input type="range" min="0" max="1" step="0.01" value="${Number(manualControls?.max_risk_cap || 1)}" data-manual-control="max_risk_cap" />
          </label>
          <label class="tiny">Disable Context Blocking
            <input type="checkbox" ${manualControls?.disable_context_blocking ? "checked" : ""} data-manual-control="disable_context_blocking" />
          </label>
          <label class="tiny">Force Learning Mode
            <select data-manual-control="force_learning_mode">
              <option value="" ${!manualControls?.force_learning_mode ? "selected" : ""}>none</option>
              <option value="exploration" ${manualControls?.force_learning_mode === "exploration" ? "selected" : ""}>exploration</option>
              <option value="mixed" ${manualControls?.force_learning_mode === "mixed" ? "selected" : ""}>mixed</option>
              <option value="exploitation" ${manualControls?.force_learning_mode === "exploitation" ? "selected" : ""}>exploitation</option>
            </select>
          </label>
          <div class="tiny muted">Live preview → confidence <strong>${pct(confidencePreview)}</strong> · size <strong>${sizePreview.toFixed(3)}</strong> · mode <strong>${safe(modePreview)}</strong></div>
          <p class="tiny">library hints:</p>
          <div>${chips(libraryBiasHints.map((row) => `${row.hint}${row.bias ? ` (${row.bias})` : ""}`))}</div>
          <div class="button-row compact">
            <button type="button" class="ghost" data-brain-action="manual-controls-reset">Reset manual controls</button>
          </div>
        </section>

        <section>
          <h5>K. Assisted Reinforcement</h5>
          <p class="tiny">headline: <strong>${safe(assistHeadline)}</strong></p>
          <p class="tiny">rules updated: <strong>${assistRuleCount}</strong> · scenario changes: <strong>${assistScenarioChanges}</strong></p>
          <p class="tiny">confidence delta: <strong>${assistConfidenceDelta >= 0 ? "+" : ""}${assistConfidenceDelta.toFixed(2)}</strong></p>
          <p class="tiny">tags added:</p>
          <div>${chips(assistTags)}</div>
          <p class="tiny">history entries: <strong>${safe(assistState?.historyCount, 0)}</strong></p>
          <label class="tiny" for="reinforcementInput">Copilot Reinforcement JSON</label>
          <textarea id="reinforcementInput" data-brain-control="reinforcement-input" placeholder="Paste Copilot Reinforcement JSON here..." rows="8" style="width:100%;resize:vertical;font-family:monospace;">${assistInput}</textarea>
          <p class="tiny ${assistInputValid ? "badge-green" : "badge-muted"}">${assistInput ? (assistInputValid ? "Valid JSON" : `Invalid JSON: ${safe(assistInputError, "invalid JSON")}`) : "No reinforcement applied"}</p>
          <p class="tiny">library hints:</p>
          <div>${chips(libraryBiasHints.map((row) => `${row.hint}${row.bias ? ` (${row.bias})` : ""}`))}</div>
          <div class="button-row compact">
            <button type="button" class="ghost" data-brain-action="assist-export">Export Brain Assist</button>
            <button type="button" class="ghost" data-brain-action="assist-download">Download Brain Assist</button>
            <button type="button" class="ghost" data-brain-action="assist-apply" ${assistInputValid ? "" : "disabled"}>Apply Reinforcement</button>
            <button type="button" class="ghost" data-brain-action="assist-clear">Clear</button>
            <button type="button" class="ghost" data-brain-action="assist-example">Load Example</button>
          </div>
          <div style="margin:.55rem 0;border-top:1px solid rgba(71,85,105,.6);"></div>
          <h6 style="margin:.1rem 0 .35rem;">Synthetic Trades</h6>
          <label class="tiny" for="syntheticTradesInput">Synthetic Trades JSON</label>
          <textarea id="syntheticTradesInput" data-brain-control="synthetic-input" placeholder="Paste Synthetic Trades JSON here..." rows="6" style="width:100%;resize:vertical;font-family:monospace;">${syntheticInput}</textarea>
          <p class="tiny ${syntheticInputValid ? "badge-green" : "badge-muted"}">${syntheticInput ? (syntheticInputValid ? "Valid JSON" : `Invalid JSON: ${safe(syntheticInputError, "invalid JSON")}`) : "No synthetic JSON loaded"}</p>
          <p class="tiny">library hints:</p>
          <div>${chips(libraryBiasHints.map((row) => `${row.hint}${row.bias ? ` (${row.bias})` : ""}`))}</div>
          <div class="button-row compact">
            <button type="button" class="ghost" data-brain-action="assist-synthetic-inject" ${syntheticInputValid ? "" : "disabled"}>Inject Synthetic Trades</button>
            <button type="button" class="ghost" data-brain-action="assist-synthetic-clear">Clear Synthetic JSON</button>
            <button type="button" class="ghost" data-brain-action="assist-synthetic-example">Load Synthetic Example</button>
          </div>
          <p class="tiny">Synthetic Trades Stored: <strong>${syntheticStoredCount}</strong></p>
          <p class="tiny">Synthetic vs Real Learning Ratio: <strong>${syntheticPct.toFixed(1)}% synthetic / ${realPct.toFixed(1)}% real</strong></p>
          <p class="tiny">Last Synthetic Import: <strong>${safe(syntheticLastImportAt, "none")}</strong></p>
          <p class="tiny">Last Reinforcement: <strong>${safe(assistState?.lastAppliedAt || "none")}</strong></p>
          <p class="tiny">Reinforcement Overlay Active: <strong>${assistOverlayActive ? "yes" : "no"}</strong></p>
          <p class="tiny">Last applied fields → bias: <strong>${safe(assistOverlayFields?.bias, "—")}</strong> · learned_bias: <strong>${safe(assistOverlayFields?.learned_bias, "—")}</strong> · active_rules: <strong>${safe(assistOverlayFields?.active_rules, 0)}</strong> · scenario_primary: <strong>${safe(assistOverlayFields?.scenario_primary, "—")}</strong></p>
          <p class="tiny">History (last 5):</p>
          <div>${assistHistory.length ? assistHistory.map((row) => `<div class="tiny muted">• ${safe(row?.summary || row?.reinforcement_summary?.headline, "Reinforcement applied")} <span class="muted">(${safe(row?.timestamp, "")})</span></div>`).join("") : '<span class="badge-muted">none</span>'}</div>
          <p class="muted tiny">Reinforcement refines tactical bias and learning state only. Execution authority remains unchanged.</p>
        </section>

      </div>
      <div class="brain-summary muted tiny">${safe(verdict.no_trade_reason || verdict.next_candle_plan?.reasoning_summary, "Executor and learning telemetry active")}</div>
      <div class="brain-summary muted tiny">Brain Voice · Library: ${libraryLessons.length ? libraryLessons.map((row) => row.name || row.id).join(" · ") : "No active lesson match"}</div>
    </article>
  `;
}
