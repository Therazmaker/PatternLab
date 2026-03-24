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

function buildWarnings(verdict = null) {
  if (!verdict) return [];
  const warnings = [];
  if (Number(verdict.danger_score || 0) > 0.65) warnings.push("High danger context");
  if ((verdict.last_outcomes || []).slice(-3).every((x) => x === "loss") && (verdict.last_outcomes || []).length >= 3) {
    warnings.push("Repeated losses in similar setup");
  }
  if (Number(verdict.learningEffects?.learnedContextCurrent?.trust_operator || 0) > 0.58) {
    warnings.push("Operator override historically better here");
  }
  return warnings;
}

export function renderBrainDashboard(verdict = null, modeState = {}, executionControlState = {}) {
  if (!verdict) return '<article class="panel-soft brain-dashboard"><h4>Brain Dashboard</h4><p class="muted tiny">Waiting for market context...</p></article>';
  const shadowExecutionEnabled = Boolean(executionControlState?.shadowExecutionEnabled);
  const authority = executionControlState?.executionAuthority || "manual_only";
  const manualConfirmationRequired = executionControlState?.manualConfirmationRequired !== false;
  const authorityLabel = authority === "copilot" ? "Copilot" : authority === "shadow" ? "Shadow" : "Manual Only";

  const contextRows = (verdict.learned_context_match || []).slice(0, 3).map((ctx) => `
    <div class="brain-context-row">
      <span><strong>${ctx.signature}</strong></span>
      <span class="tiny muted">samples ${safe(ctx.sampleCount, 0)} · W/L ${safe(ctx.wins, 0)}/${safe(ctx.losses, 0)}</span>
      <span class="tiny muted">posture ${safe(ctx.preferredPosture, "wait")} · Δconf ${safe(ctx.confidenceAdjustment, 0)}</span>
    </div>
  `).join("");

  const warnings = buildWarnings(verdict);

  return `
    <article class="panel-soft brain-dashboard">
      <div class="brain-head">
        <h4>Brain Dashboard</h4>
        <span class="badge">mode ${safe(verdict.mode, "copilot")}</span>
        <span class="badge ${verdict.executor_ready ? "badge-green" : "badge-muted"}">${verdict.executor_ready ? "executor ready" : "executor idle"}</span>
      </div>

      <div class="brain-grid">
        <section>
          <h5>Market State</h5>
          <p class="tiny">regime: <strong>${safe(verdict.market_state?.regime)}</strong> · momentum: <strong>${safe(verdict.market_state?.momentum)}</strong></p>
          <p class="tiny">volatility: <strong>${safe(verdict.market_state?.volatility)}</strong> · structure: <strong>${safe(verdict.market_state?.structurePosition)}</strong></p>
          <p class="tiny">contextual risk: <strong>${safe(verdict.market_state?.contextualRisk)}</strong></p>
        </section>

        <section>
          <h5>Brain Bias</h5>
          <p class="tiny">current bias: <strong>${safe(verdict.bias)}</strong> · confidence: <strong>${pct(verdict.confidence)}</strong></p>
          <p class="tiny">entry quality: <strong>${safe(verdict.entry_quality)}</strong> · friction: <strong>${safe(verdict.friction)}</strong></p>
          <p class="tiny">context score: <strong>${safe(verdict.context_score)}</strong> · danger: <strong>${safe(verdict.danger_score)}</strong></p>
          <p class="tiny">familiarity: <strong>${safe(verdict.familiarity)}</strong> · learned bias: <strong>${safe(verdict.learned_bias)}</strong></p>
          <p class="tiny">operational mode: <strong>${safe(modeState.mode || verdict.mode)}</strong></p>
        </section>

        <section>
          <h5>Learned Rules Active</h5>
          <div>${chips((verdict.active_rules || []).map((rule) => rule.text || rule.id))}</div>
        </section>

        <section>
          <h5>Learned Contexts</h5>
          ${contextRows || '<p class="muted tiny">No context signatures yet.</p>'}
        </section>

        <section>
          <h5>Next Candle Plan</h5>
          <p class="tiny"><strong>posture:</strong> ${safe(verdict.next_candle_plan?.posture)}</p>
          <p class="tiny"><strong>trigger_long:</strong> ${safe(verdict.next_candle_plan?.trigger_long)}</p>
          <p class="tiny"><strong>trigger_short:</strong> ${safe(verdict.next_candle_plan?.trigger_short)}</p>
          <p class="tiny"><strong>invalidation:</strong> ${safe(verdict.next_candle_plan?.invalidation)}</p>
          <p class="tiny"><strong>expected quality:</strong> ${safe(verdict.next_candle_plan?.expected_quality)}</p>
          <p class="tiny brain-note">${safe(verdict.no_trade_reason || verdict.next_candle_plan?.reasoning_summary)}</p>
        </section>

        <section>
          <h5>Execution Controls</h5>
          <div class="button-row compact">
            <button type="button" class="${shadowExecutionEnabled ? "primary" : "ghost"}" data-brain-action="toggle-shadow-auto">Shadow Auto: ${shadowExecutionEnabled ? "ON" : "OFF"}</button>
            ${shadowExecutionEnabled ? "" : '<span class="badge">Copilot Control</span>'}
          </div>
          <p class="tiny">
            <span class="badge">Execution Authority: ${authorityLabel}</span>
            <span class="badge ${shadowExecutionEnabled ? "badge-green" : "badge-muted"}">Shadow Execution: ${shadowExecutionEnabled ? "Active" : "Paused"}</span>
            <span class="badge">Manual Confirmation: ${manualConfirmationRequired ? "Required" : "Optional"}</span>
          </p>
          <div class="button-row compact" id="brain-dashboard-controls">
            <button type="button" class="ghost" data-brain-action="approve">approve suggestion</button>
            <button type="button" class="ghost" data-brain-action="wait">wait</button>
            <button type="button" class="ghost" data-brain-action="invalidate">invalidate idea</button>
            <button type="button" class="ghost" data-brain-action="bias-long">correct bias: long</button>
            <button type="button" class="ghost" data-brain-action="bias-short">correct bias: short</button>
            <button type="button" class="ghost" data-brain-action="mode-observer">observer mode</button>
            <button type="button" class="ghost" data-brain-action="mode-copilot">copilot mode</button>
            <button type="button" class="ghost" data-brain-action="enable-executor">enable executor mode</button>
            <button type="button" class="ghost" data-brain-action="disable-executor">disable executor mode</button>
          </div>
          <p class="muted tiny">Machine proposes, human decides. Auto execution default: OFF.</p>
        </section>
      </div>

      <div class="brain-summary muted tiny">
        ${chips(warnings.length ? warnings : ["Context learning active", "Decision friction enforced", "Override memory accounted for"])}
      </div>
    </article>
  `;
}
