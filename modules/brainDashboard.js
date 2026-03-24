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
  const maxExploratoryTrades = Number(profile?.max_exploratory_trades_per_context || 5);
  const exploratoryTaken = Number(planContext?.exploratory_trades_taken || 0);
  const exploratoryLeft = Math.max(0, maxExploratoryTrades - exploratoryTaken);
  const pauseRemaining = Number(planContext?.exploration_pause_remaining_candles || 0);
  const exploreRatio = Number(autoShift?.exploration_weight ?? 0.5);
  const exploitRatio = Number(autoShift?.exploitation_weight ?? 0.5);
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
          ${(verdict?.learning_mode === "blocked" || verdict?.auto_shift?.block_trading) ? `<p class="tiny"><span class="badge badge-yellow">Trading blocked (${safe(autoShift?.context_pause_candles, 0)} candle pause)</span></p>` : ""}
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
          <p class="tiny">reason: <strong>${safe((riskProfile?.reason || []).join(", "), "No active risk decision yet.")}</strong></p>
          <p class="tiny">bonuses: <strong>confidence ${safe(riskProfile?.components?.confidence_bonus, 0)}</strong> · <strong>familiarity ${safe(riskProfile?.components?.familiarity_bonus, 0)}</strong> · <strong>scenario ${safe(riskProfile?.components?.scenario_bonus, 0)}</strong></p>
          <p class="tiny">penalties: <strong>danger ${safe(riskProfile?.components?.danger_penalty, 0)}</strong> · <strong>friction ${safe(riskProfile?.components?.friction_penalty, 0)}</strong></p>
          ${riskProfile?.risk_mode === "exploration" ? '<p class="tiny"><span class="badge badge-yellow">Exploration size reduced due to low familiarity</span></p>' : ""}
          ${riskProfile?.risk_mode === "exploitation" ? '<p class="tiny"><span class="badge badge-green">Exploitation size boosted by reliable scenario</span></p>' : ""}
          ${(riskProfile?.size_multiplier || 0) <= 0 ? '<p class="tiny"><span class="badge badge-yellow">Risk blocked by mature bad context</span></p>' : ""}
        </section>

        <section>
          <h5>H. Executor Controls</h5>
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

      </div>
      <div class="brain-summary muted tiny">${safe(verdict.no_trade_reason || verdict.next_candle_plan?.reasoning_summary, "Executor and learning telemetry active")}</div>
    </article>
  `;
}
