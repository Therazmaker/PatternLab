import { getCurrentPacket, updateCurrentPacket } from "../../modules/sessionBrainOrchestrator.js";

let _modalRoot = null;
let _refreshTimer = null;
let _operatorNote = "";

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function toRecentCandles(candles = []) {
  return (Array.isArray(candles) ? candles : []).slice(-50).map((c) => ({
    open: num(c?.open, 0),
    high: num(c?.high, 0),
    low: num(c?.low, 0),
    close: num(c?.close, 0),
  }));
}

function prettyLabel(value, fallback = "N/A") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtPrice(value) {
  const n = num(value, null);
  return n === null ? "N/A" : n.toFixed(2);
}

function readTarget(nextTrade = {}) {
  if (Array.isArray(nextTrade?.targets) && nextTrade.targets.length) {
    return num(nextTrade.targets[0]?.price_mid ?? nextTrade.targets[0]?.price ?? nextTrade.targets[0], null);
  }
  return num(nextTrade?.target, null);
}

function getTradeLevels(nextTrade = {}) {
  return {
    trigger: num(nextTrade?.trigger_price ?? nextTrade?.trigger, null),
    invalidation: num(nextTrade?.invalidation_price ?? nextTrade?.invalidation, null),
    target: readTarget(nextTrade),
  };
}

function buildRiskBanner(packet = {}) {
  const nextTrade = packet?.next_trade || {};
  const learningState = packet?.learning_state || {};
  const brainState = packet?.brain_state || {};
  const danger = num(brainState?.danger_score, 0);
  const confidence = num(nextTrade?.confidence ?? brainState?.confidence, 0);
  const reliability = num(brainState?.scenario_reliability, 0);
  const mode = String(learningState?.learning_mode ?? learningState?.mode ?? "mixed").toLowerCase();
  if (danger >= 0.8) return { tone: "danger", title: "HIGH RISK CONTEXT", sub: "Danger score is elevated. Reduce aggression." };
  if (mode === "exploration") return { tone: "warn", title: "EXPLORATION MODE", sub: "Signal quality is still being learned." };
  if (confidence >= 0.65 && reliability >= 0.6) return { tone: "ok", title: "VALID STRUCTURE", sub: "Context is relatively stable and structured." };
  return { tone: "mixed", title: "MIXED CONTEXT", sub: "Confirmation still required before execution." };
}

function buildBrainVoice(packet = {}, conflict = detectBiasConflict(packet), countdown = getTimeframeCountdown(5)) {
  const nextTrade = packet?.next_trade || {};
  const learningState = packet?.learning_state || {};
  const brainState = packet?.brain_state || {};
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const direction = String(nextTrade?.direction || "").toLowerCase();
  const mode = String(learningState?.learning_mode ?? learningState?.mode ?? "mixed").toLowerCase();
  const familiarity = num(brainState?.familiarity, 0);
  const danger = num(brainState?.danger_score, 0);
  const confidence = num(nextTrade?.confidence ?? brainState?.confidence, 0);
  const reliability = num(brainState?.scenario_reliability, 0);
  const momentum = String(nextTrade?.momentum || "").toLowerCase();
  const operatorOverride = getOperatorOverride(packet);
  const effectiveDirection = operatorOverride || direction;

  const setupText = setup ? `${prettyLabel(setup)} is the active idea.` : "No clean setup is active yet.";
  const directionText = effectiveDirection ? `${prettyLabel(effectiveDirection)} bias is currently preferred.` : "Direction remains neutral.";
  const qualityText = confidence < 0.45 || reliability < 0.45
    ? "Signal quality is weak, so confirmation should lead execution."
    : "Signal quality is acceptable, but still needs disciplined triggers.";
  const riskText = danger >= 0.75
    ? "Danger is elevated. Avoid forcing continuation."
    : "Risk is manageable if invalidation is respected.";
  const learningText = mode === "exploration"
    ? "The system is exploring, so trust should be reduced."
    : mode === "exploitation"
      ? "The system is exploiting familiar context."
      : "The system is in mixed learning mode.";
  const familiarityText = familiarity < 0.4
    ? "Familiarity is low, indicating unstable pattern memory."
    : "Familiarity is supportive for this structure.";
  const momentumText = momentum === "fading"
    ? "Momentum is fading and favors reactive entries over chasing."
    : "Momentum is not showing major instability.";
  const conflictText = conflict?.hasConflict
    ? `Conflict detected (${prettyLabel(conflict.type)}): ${conflict.summary}`
    : "Structure and bias are currently aligned.";
  const closeText = countdown.totalSeconds < 20
    ? "Avoid forcing a late entry near candle close. Wait for candle confirmation before acting."
    : "";
  return `${setupText} ${directionText} ${learningText} ${qualityText} ${riskText} ${familiarityText} ${momentumText} ${conflictText} ${closeText}`.trim();
}

function buildSimulationRead(simulationResult = {}, packet = {}) {
  const continuation = num(simulationResult?.continuation_probability, 0);
  const rejection = num(simulationResult?.rejection_probability, 0);
  const chop = num(simulationResult?.chop_probability, 0);
  const danger = num(packet?.brain_state?.danger_score, 0);
  const spread = Math.max(continuation, rejection, chop) - Math.min(continuation, rejection, chop);
  if (spread < 0.12) return "No strong edge. Probabilities are too compressed, so waiting is preferred.";
  if (chop >= continuation - 0.08) return "Chop risk is close to continuation potential. Demand clear confirmation.";
  if (rejection > continuation) return "Rejection path is favored. Prefer reactive execution at trigger zones.";
  if (continuation > rejection && danger >= 0.7) return "Continuation has a slight edge, but danger remains elevated.";
  return "Continuation is modestly favored with controllable risk if structure holds.";
}

function metricInterpretation(name, value, mode) {
  if (name === "familiarity") return value < 0.4 ? "Low familiarity" : value < 0.7 ? "Building familiarity" : "High familiarity";
  if (name === "danger_score") return value >= 0.75 ? "Danger elevated" : value >= 0.45 ? "Moderate danger" : "Low immediate danger";
  if (name === "scenario_reliability") return value < 0.45 ? "Weak scenario reliability" : value < 0.65 ? "Developing reliability" : "Reliable structure";
  if (name === "learning_mode") return mode === "exploration" ? "Exploration, reduced trust" : mode === "exploitation" ? "Exploitation, higher trust" : "Mixed mode, selective trust";
  return "Context developing";
}

function normalizeDirection(value, fallback = "neutral") {
  const dir = String(value || "").toLowerCase();
  return ["long", "short", "neutral"].includes(dir) ? dir : fallback;
}

function getOperatorOverride(packet = {}) {
  const raw = packet?.learning_state?.operator_override ?? packet?.learning_state?.manual_bias_override ?? null;
  const normalized = normalizeDirection(raw, null);
  return normalized === "neutral" ? null : normalized;
}

export function detectBiasConflict(packet = {}) {
  const nextTrade = packet?.next_trade || {};
  const brainState = packet?.brain_state || {};
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const direction = normalizeDirection(nextTrade?.direction, "neutral");
  const confidence = num(nextTrade?.confidence ?? brainState?.confidence, 0);
  const danger = num(brainState?.danger_score, 0);
  const reliability = num(brainState?.scenario_reliability, 0);
  const familiarity = num(brainState?.familiarity, 0);
  const momentum = String(nextTrade?.momentum || "").toLowerCase();
  const operatorOverride = getOperatorOverride(packet);
  const continuationSetup = setup.includes("continuation");
  const fragileContext = danger >= 0.8 || confidence <= 0.15 || reliability <= 0.25 || momentum === "fading";

  if (operatorOverride && operatorOverride !== direction) {
    return {
      hasConflict: true,
      type: "operator_override",
      severity: "high",
      summary: `Operator override (${prettyLabel(operatorOverride)}) supersedes passive ${prettyLabel(direction)} narrative.`,
      recommendation: "Use operator direction until fresh candle confirmation restores structure confidence.",
    };
  }

  if ((danger >= 0.8 && confidence <= 0.15) || (continuationSetup && fragileContext)) {
    return {
      hasConflict: true,
      type: "bias_vs_structure",
      severity: "high",
      summary: "Continuation bias conflicts with fragile structure and elevated danger.",
      recommendation: "Downgrade conviction and wait for confirmation before favoring continuation entries.",
    };
  }

  if (reliability <= 0.2 && familiarity <= 0.4) {
    return {
      hasConflict: true,
      type: "memory_vs_structure",
      severity: "medium",
      summary: "Learned bias is unstable because reliability and familiarity are both weak.",
      recommendation: "Treat learned bias as provisional and prioritize price-action confirmation.",
    };
  }

  return {
    hasConflict: false,
    type: "bias_vs_structure",
    severity: "medium",
    summary: "No major bias conflict detected.",
    recommendation: "Execute only on trigger confirmation with invalidation discipline.",
  };
}

export function getTimeframeCountdown(timeframeMinutes = 5) {
  const minutes = Math.max(1, Number(timeframeMinutes || 5));
  const now = Date.now();
  const timeframeMs = minutes * 60 * 1000;
  const nextBoundary = Math.ceil(now / timeframeMs) * timeframeMs;
  const remainingMs = Math.max(0, nextBoundary - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  const urgency = totalSeconds < 15 ? "imminent" : totalSeconds < 60 ? "warning" : "normal";
  return { totalSeconds, display: `${mm}:${ss}`, urgency };
}

export function simulateTradePaths(nextTrade = {}, candles = []) {
  const sample = toRecentCandles(candles);
  if (!sample.length) return { continuation_probability: 0.33, rejection_probability: 0.33, chop_probability: 0.34 };
  let trendVotes = 0;
  let rejectionVotes = 0;
  for (let i = 1; i < sample.length; i += 1) {
    const prev = sample[i - 1];
    const cur = sample[i];
    const body = Math.abs(cur.close - cur.open);
    const range = Math.max(1e-6, cur.high - cur.low);
    if (body / range < 0.25) rejectionVotes += 1;
    if (cur.close > prev.close) trendVotes += 1;
    if (cur.close < prev.close) trendVotes -= 1;
  }
  const direction = String(nextTrade?.direction || "").toLowerCase();
  const directionalEdge = direction === "short" ? -trendVotes : trendVotes;
  const continuation = clamp01(0.5 + directionalEdge / (sample.length * 2));
  const rejection = clamp01(rejectionVotes / sample.length);
  const chop = clamp01(1 - continuation * 0.7 - rejection * 0.6);
  const total = continuation + rejection + chop;
  return {
    continuation_probability: continuation / total,
    rejection_probability: rejection / total,
    chop_probability: chop / total,
  };
}

function drawMiniChart(canvas, candles = [], nextTrade = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rows = toRecentCandles(candles);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);
  if (!rows.length) return;

  const levels = getTradeLevels(nextTrade);
  const levelValues = [levels.trigger, levels.invalidation, levels.target].filter((v) => v !== null);
  const visibleMin = Math.min(...rows.map((c) => c.low), ...levelValues);
  const visibleMax = Math.max(...rows.map((c) => c.high), ...levelValues);
  const range = Math.max(visibleMax - visibleMin, 1e-6);
  const padRange = range * 0.1;
  const chartMin = visibleMin - padRange;
  const chartMax = visibleMax + padRange;

  const inner = { top: 20, right: 64, bottom: 20, left: 18 };
  const usableH = Math.max(1, height - inner.top - inner.bottom);
  const usableW = Math.max(1, width - inner.left - inner.right);
  const step = usableW / rows.length;
  const candleW = Math.max(3, Math.floor(step * 0.7));

  const y = (price) => {
    const pct = (price - chartMin) / Math.max(1e-6, chartMax - chartMin);
    return height - inner.bottom - pct * usableH;
  };

  rows.forEach((c, idx) => {
    const x = inner.left + idx * step + (step - candleW) / 2;
    const up = c.close >= c.open;
    const latest = idx === rows.length - 1;
    if (latest) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.16)";
      ctx.fillRect(x - 4, inner.top, candleW + 8, usableH);
    }
    ctx.strokeStyle = up ? "#34d399" : "#f87171";
    ctx.fillStyle = up ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(x + candleW / 2, y(c.high));
    ctx.lineTo(x + candleW / 2, y(c.low));
    ctx.stroke();
    const top = Math.min(y(c.open), y(c.close));
    const bodyH = Math.max(1, Math.abs(y(c.close) - y(c.open)));
    ctx.fillRect(x, top, candleW, bodyH);
  });

  const drawLine = (price, color, label) => {
    const p = num(price, null);
    if (p === null) return;
    const py = y(p);
    const xStart = inner.left;
    const xEnd = width - inner.right + 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.moveTo(xStart, py);
    ctx.lineTo(xEnd, py);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xStart, py);
    ctx.lineTo(xEnd, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, width - inner.right + 12, py + 3);
  };

  const direction = String(nextTrade?.direction || "").toLowerCase();
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const zonePrice = levels.trigger ?? levels.invalidation;
  if (zonePrice !== null) {
    const zoneHeight = Math.max(8, usableH * 0.07);
    const zoneY = y(zonePrice) - zoneHeight / 2;
    ctx.fillStyle = direction === "short" ? "rgba(248, 113, 113, 0.12)" : "rgba(52, 211, 153, 0.12)";
    ctx.fillRect(inner.left, zoneY, usableW + 8, zoneHeight);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "10px sans-serif";
    ctx.fillText(
      setup === "failed_breakout_short" ? "await rejection confirmation" : "decision zone",
      inner.left + 6,
      zoneY - 4,
    );
  }

  drawLine(levels.trigger, "#facc15", "trigger");
  drawLine(levels.invalidation, "#ef4444", "invalidation");
  drawLine(levels.target, "#22c55e", "target");

  if (zonePrice !== null) {
    const startX = inner.left + usableW - 30;
    const startY = y(zonePrice);
    const arrowY = direction === "short" ? startY + 22 : startY - 22;
    ctx.strokeStyle = direction === "short" ? "#f87171" : "#34d399";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + 22, arrowY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(startX + 22, arrowY);
    ctx.lineTo(startX + 15, arrowY + (direction === "short" ? -2 : 2));
    ctx.lineTo(startX + 20, arrowY + (direction === "short" ? -8 : 8));
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.textAlign = "start";
}

function progressRow(label, value = 0) {
  const pct = Math.round(clamp01(value) * 100);
  return `
    <div class="tvm-progress-row">
      <div class="tiny">${label}</div>
      <div class="tvm-progress-track"><span style="width:${pct}%;"></span></div>
      <div class="tiny">${pct}%</div>
    </div>
  `;
}

function buildEntryLogic(nextTrade = {}, packet = {}) {
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const direction = String(nextTrade?.direction || "").toLowerCase();
  const mode = String(packet?.learning_state?.learning_mode ?? packet?.learning_state?.mode ?? "mixed");
  const operatorOverride = getOperatorOverride(packet);
  const countdown = getTimeframeCountdown(5);
  if (!setup || setup.includes("chop") || setup.includes("no_trade")) {
    return [
      "No-trade condition detected.",
      "Wait for cleaner structure and stronger confirmation.",
      "Preserve capital while context remains noisy.",
    ];
  }
  if (operatorOverride === "short") {
    return [
      "Wait for rejection / rollover before short execution.",
      "Avoid late long continuation attempts against operator override.",
      countdown.totalSeconds < 20
        ? "Require candle confirmation if near close."
        : "Confirm downside hold before committing size.",
    ];
  }
  if (operatorOverride === "long") {
    return [
      "Wait for hold and continuation confirmation before long execution.",
      "Avoid premature fading while override remains active.",
      countdown.totalSeconds < 20
        ? "Require candle confirmation if near close."
        : "Enter only when trigger and momentum align.",
    ];
  }
  if (setup === "failed_breakout_short") {
    return [
      "Wait for rejection at trigger or resistance area.",
      "Confirm with close back below trigger before entry.",
      "Execute only while invalidation remains untouched.",
    ];
  }
  if (setup === "continuation_long") {
    return [
      "Wait for breakout hold above trigger.",
      "Enter on continuation confirmation candle.",
      "Abort if structure loses momentum into invalidation.",
    ];
  }
  return [
    `Favor ${direction || "reactive"} entries with trigger confirmation.`,
    "Respect invalidation strictly and avoid anticipation.",
    `Position size should follow ${prettyLabel(mode)} discipline.`,
  ];
}

function buildFinalVerdict(packet = {}, conflict = detectBiasConflict(packet), countdown = getTimeframeCountdown(5)) {
  const nextTrade = packet?.next_trade || {};
  const brainState = packet?.brain_state || {};
  const operatorOverride = getOperatorOverride(packet);
  const baseDirection = normalizeDirection(nextTrade?.direction, "neutral");
  const confidence = num(nextTrade?.confidence ?? brainState?.confidence, 0);
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const noTradeLike = setup.includes("no_trade") || setup.includes("chop");

  if (operatorOverride) {
    return {
      label: "OPERATOR OVERRIDE ACTIVE",
      reason: `Operator ${prettyLabel(operatorOverride)} override is active. ${conflict.recommendation}`,
    };
  }
  if (noTradeLike || confidence < 0.08) {
    return { label: "NO TRADE", reason: "Context is too weak/noisy to justify execution." };
  }
  if (countdown.totalSeconds < 20 || conflict.hasConflict) {
    return { label: "WAIT FOR CONFIRMATION", reason: conflict.hasConflict ? conflict.summary : "Candle is near close; wait for confirmation." };
  }
  if (baseDirection === "short") return { label: "SHORT BIAS PRIORITIZED", reason: "Short structure has cleaner alignment than long alternatives." };
  if (baseDirection === "long") return { label: "LONG BIAS PRIORITIZED", reason: "Long structure has cleaner alignment than short alternatives." };
  return { label: "WAIT FOR CONFIRMATION", reason: "Direction neutrality persists until structure clarifies." };
}

function renderModal(packet = {}) {
  const nextTrade = packet?.next_trade || {};
  const learningState = packet?.learning_state || {};
  const brainState = packet?.brain_state || {};
  const mode = String(learningState?.learning_mode ?? learningState?.mode ?? "mixed");
  const setup = String(nextTrade?.setup || "");
  const direction = String(nextTrade?.direction || "neutral");
  const operatorOverride = getOperatorOverride(packet);
  const effectiveDirection = operatorOverride || direction;
  const confidence = num(nextTrade?.confidence ?? brainState?.confidence, 0);
  const levels = getTradeLevels(nextTrade);
  const conflict = detectBiasConflict(packet);
  const countdown = getTimeframeCountdown(5);
  const entryLogic = buildEntryLogic(nextTrade, packet);
  const riskBanner = buildRiskBanner(packet);
  const brainVoice = buildBrainVoice(packet, conflict, countdown);
  const verdict = buildFinalVerdict(packet, conflict, countdown);
  const sim = simulateTradePaths(nextTrade, packet?.market_state?.candles || []);
  return `
    <div class="tvm-backdrop" data-tvm-close="1"></div>
    <section class="tvm-modal" role="dialog" aria-modal="true" aria-label="Trade Visualizer Modal">
      <header class="tvm-header">
        <h3>Trade Visualizer Modal</h3>
        <button class="ghost" type="button" data-tvm-close="1">Close</button>
      </header>
      <div class="tvm-grid">
        <article class="panel-soft tvm-area-chart">
          <div class="tvm-chart-head">
            <h5>A. Chart Container</h5>
            <span id="tvm-countdown" class="tvm-countdown tvm-countdown-${countdown.urgency}">Candle closes in: ${countdown.display}</span>
          </div>
          <canvas id="tvm-chart" width="960" height="340"></canvas>
        </article>

        <article class="panel-soft tvm-area-summary">
          <div id="tvm-risk-banner" class="tvm-risk-banner tvm-risk-${riskBanner.tone}">
            <strong>${riskBanner.title}</strong>
            <div class="tiny">${riskBanner.sub}</div>
          </div>
          <div class="tvm-summary-block">
            <h5>🧠 Brain Voice</h5>
            <p class="tiny" id="tvm-brain-voice">${brainVoice}</p>
          </div>
          <div class="tvm-summary-block">
            <h5>Quick Trade Plan</h5>
            <div class="tvm-kv"><span>Setup</span><strong id="tvm-quick-setup">${prettyLabel(setup, "Chop / No Trade")}</strong></div>
            <div class="tvm-kv"><span>Direction</span><strong id="tvm-quick-direction">${prettyLabel(effectiveDirection)}</strong></div>
            <div class="tvm-kv"><span>Confidence</span><strong id="tvm-quick-confidence">${Math.round(confidence * 100)}%</strong></div>
            ${operatorOverride ? `<p class="tiny"><span id="tvm-override-badge" class="badge badge-yellow">Operator Override: ${prettyLabel(operatorOverride)}</span></p>` : '<p class="tiny" id="tvm-override-badge"></p>'}
            <div class="tvm-summary-verdict" id="tvm-final-verdict"><strong>VERDICT: ${verdict.label}</strong><p class="tiny muted">${verdict.reason}</p></div>
          </div>
        </article>

        <article class="panel-soft tvm-area-intent">
          <h5>B. Brain Intent Overlay</h5>
          <p class="tiny">${setup === "failed_breakout_short" ? '<span class="badge badge-yellow">Rejection zone active</span> Await rejection confirmation near trigger.' : "Decision zone follows active setup and direction bias."}</p>
          <p class="tiny muted">Overlays are aligned to trigger, invalidation, and target visibility.</p>
        </article>

        <article class="panel-soft tvm-area-plan">
          <h5>C. Trade Plan</h5>
          <div class="tvm-plan-grid" id="tvm-plan-grid">
            <div class="tvm-kv"><span>Setup</span><strong>${prettyLabel(setup, "Chop / No Trade")}</strong></div>
            <div class="tvm-kv"><span>Direction</span><strong>${prettyLabel(effectiveDirection)}</strong></div>
            <div class="tvm-kv"><span>Mode</span><strong>${prettyLabel(mode)}</strong></div>
            <div class="tvm-kv"><span>Confidence</span><strong>${Math.round(confidence * 100)}%</strong></div>
            <div class="tvm-kv"><span>Trigger</span><strong>${fmtPrice(levels.trigger)}</strong></div>
            <div class="tvm-kv"><span>Invalidation</span><strong>${fmtPrice(levels.invalidation)}</strong></div>
            <div class="tvm-kv"><span>Target</span><strong>${fmtPrice(levels.target)}</strong></div>
          </div>
          <div class="tvm-logic">
            <div class="tiny"><strong>Entry Logic</strong></div>
            <ul class="tiny">${entryLogic.map((line) => `<li>${line}</li>`).join("")}</ul>
          </div>
        </article>

        <article class="panel-soft tvm-area-internal">
          <h5>D. Internal State</h5>
          ${progressRow("learning_mode", mode === "exploitation" ? 1 : mode === "mixed" ? 0.6 : 0.35)}
          <p class="tiny muted tvm-state-note">${metricInterpretation("learning_mode", 0, mode.toLowerCase())}</p>
          ${progressRow("familiarity", brainState?.familiarity || 0)}
          <p class="tiny muted tvm-state-note">${metricInterpretation("familiarity", num(brainState?.familiarity, 0), mode.toLowerCase())}</p>
          ${progressRow("danger_score", brainState?.danger_score || 0)}
          <p class="tiny muted tvm-state-note">${metricInterpretation("danger_score", num(brainState?.danger_score, 0), mode.toLowerCase())}</p>
          ${progressRow("scenario_reliability", brainState?.scenario_reliability || 0)}
          <p class="tiny muted tvm-state-note">${metricInterpretation("scenario_reliability", num(brainState?.scenario_reliability, 0), mode.toLowerCase())}</p>
        </article>

        <article class="panel-soft tvm-area-controls">
          <h5>E. Human Controls</h5>
          <div class="button-row compact">
            <button class="ghost" type="button" data-tvm-action="confirm-setup">Confirm Setup</button>
            <button class="ghost" type="button" data-tvm-action="adjust-bias-long">Adjust Bias Long</button>
            <button class="ghost" type="button" data-tvm-action="adjust-bias-short">Adjust Bias Short</button>
            <button class="ghost" type="button" data-tvm-action="block-trade">Block Trade</button>
          </div>
          <label class="tiny" for="tvm-note">Operator note</label>
          <textarea id="tvm-note" rows="4" placeholder="Add note for brain memory store">${_operatorNote}</textarea>
          <div class="button-row compact"><button class="ghost" type="button" data-tvm-action="save-note">Save Note</button></div>
        </article>

        <article class="panel-soft tvm-area-sim">
          <h5>F. Simulation Panel</h5>
          <button class="ghost" type="button" data-tvm-action="simulate">Simulate Outcome</button>
          <div class="tvm-sim-rows" id="tvm-sim-rows">
            ${progressRow("continuation_probability", sim.continuation_probability)}
            ${progressRow("rejection_probability", sim.rejection_probability)}
            ${progressRow("chop_probability", sim.chop_probability)}
          </div>
          <div class="tvm-sim-read">
            <div class="tiny"><strong>Simulation Read</strong></div>
            <p class="tiny muted" id="tvm-sim-read">${buildSimulationRead(sim, packet)}</p>
          </div>
        </article>
      </div>
    </section>
  `;
}

function updateSimulationBars(root, nextTrade, candles) {
  const holder = root.querySelector("#tvm-sim-rows");
  if (!holder) return;
  const sim = simulateTradePaths(nextTrade, candles);
  holder.innerHTML = [
    progressRow("continuation_probability", sim.continuation_probability),
    progressRow("rejection_probability", sim.rejection_probability),
    progressRow("chop_probability", sim.chop_probability),
  ].join("");
  const simRead = root.querySelector("#tvm-sim-read");
  if (simRead) {
    const livePacket = getCurrentPacket() || {};
    simRead.textContent = buildSimulationRead(sim, { ...livePacket, next_trade: nextTrade });
  }
}

function updateNarrativePanels(root, packet = {}) {
  if (!root) return;
  const conflict = detectBiasConflict(packet);
  const countdown = getTimeframeCountdown(5);
  const risk = buildRiskBanner(packet);
  const riskEl = root.querySelector("#tvm-risk-banner");
  if (riskEl) {
    riskEl.className = `tvm-risk-banner tvm-risk-${risk.tone}`;
    riskEl.innerHTML = `<strong>${risk.title}</strong><div class="tiny">${risk.sub}</div>`;
  }
  const brainVoiceEl = root.querySelector("#tvm-brain-voice");
  if (brainVoiceEl) brainVoiceEl.textContent = buildBrainVoice(packet, conflict, countdown);
  const verdictEl = root.querySelector("#tvm-final-verdict");
  if (verdictEl) {
    const verdict = buildFinalVerdict(packet, conflict, countdown);
    verdictEl.innerHTML = `<strong>VERDICT: ${verdict.label}</strong><p class="tiny muted">${verdict.reason}</p>`;
  }

  const nextTrade = packet?.next_trade || {};
  const operatorOverride = getOperatorOverride(packet);
  const setupEl = root.querySelector("#tvm-quick-setup");
  const directionEl = root.querySelector("#tvm-quick-direction");
  const confidenceEl = root.querySelector("#tvm-quick-confidence");
  if (setupEl) setupEl.textContent = prettyLabel(nextTrade?.setup, "Chop / No Trade");
  if (directionEl) directionEl.textContent = prettyLabel(operatorOverride || nextTrade?.direction, "Neutral");
  if (confidenceEl) confidenceEl.textContent = `${Math.round(num(nextTrade?.confidence ?? packet?.brain_state?.confidence, 0) * 100)}%`;

  const overrideBadgeEl = root.querySelector("#tvm-override-badge");
  if (overrideBadgeEl) {
    overrideBadgeEl.className = operatorOverride ? "badge badge-yellow" : "";
    overrideBadgeEl.textContent = operatorOverride ? `Operator Override: ${prettyLabel(operatorOverride)}` : "";
  }

  const countdownEl = root.querySelector("#tvm-countdown");
  if (countdownEl) {
    countdownEl.className = `tvm-countdown tvm-countdown-${countdown.urgency}`;
    countdownEl.textContent = `Candle closes in: ${countdown.display}`;
  }

  const planGrid = root.querySelector("#tvm-plan-grid");
  if (planGrid) {
    const levels = getTradeLevels(nextTrade);
    const mode = String(packet?.learning_state?.learning_mode ?? packet?.learning_state?.mode ?? "mixed");
    const setupValue = operatorOverride ? `${prettyLabel(operatorOverride)} Bias Override` : prettyLabel(nextTrade?.setup, "Chop / No Trade");
    const directionValue = prettyLabel(operatorOverride || nextTrade?.direction, "Neutral");
    const confidenceValue = `${Math.round(num(nextTrade?.confidence ?? packet?.brain_state?.confidence, 0) * 100)}%`;
    planGrid.innerHTML = `
      <div class="tvm-kv"><span>Setup</span><strong>${setupValue}</strong></div>
      <div class="tvm-kv"><span>Direction</span><strong>${directionValue}</strong></div>
      <div class="tvm-kv"><span>Mode</span><strong>${prettyLabel(mode)}</strong></div>
      <div class="tvm-kv"><span>Confidence</span><strong>${confidenceValue}</strong></div>
      <div class="tvm-kv"><span>Trigger</span><strong>${fmtPrice(levels.trigger)}</strong></div>
      <div class="tvm-kv"><span>Invalidation</span><strong>${fmtPrice(levels.invalidation)}</strong></div>
      <div class="tvm-kv"><span>Target</span><strong>${fmtPrice(levels.target)}</strong></div>
    `;
  }

  const logicEl = root.querySelector(".tvm-logic ul");
  if (logicEl) {
    const lines = buildEntryLogic(nextTrade, packet);
    logicEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
  }
}

export function openTradeVisualizerModal(brainPacket = null, controls = {}) {
  const packet = brainPacket || getCurrentPacket() || {};
  if (_modalRoot) _modalRoot.remove();
  _modalRoot = document.createElement("div");
  _modalRoot.className = "tvm-root";
  _modalRoot.innerHTML = renderModal(packet);
  document.body.appendChild(_modalRoot);

  const chart = _modalRoot.querySelector("#tvm-chart");
  drawMiniChart(chart, packet?.market_state?.candles || [], { ...(packet?.next_trade || {}), direction: getOperatorOverride(packet) || packet?.next_trade?.direction });

  const close = () => {
    if (_refreshTimer) window.clearInterval(_refreshTimer);
    _refreshTimer = null;
    _modalRoot?.remove();
    _modalRoot = null;
  };

  _modalRoot.addEventListener("click", (event) => {
    const closeEl = event.target.closest("[data-tvm-close='1']");
    if (closeEl) {
      close();
      return;
    }
    const btn = event.target.closest("[data-tvm-action]");
    if (!btn) return;
    const action = btn.dataset.tvmAction;
    const livePacket = getCurrentPacket() || packet;
    if (action === "confirm-setup") {
      controls?.executor?.armTrade?.();
    } else if (action === "adjust-bias-long") {
      controls?.dispatch?.({ type: "ADJUST_BIAS", payload: { directionOverride: "long" } });
      updateCurrentPacket({
        learning_state: { operator_override: "long", manual_bias_override: "long" },
        next_trade: { ...(livePacket?.next_trade || {}), direction: "long" },
      });
    } else if (action === "adjust-bias-short") {
      controls?.dispatch?.({ type: "ADJUST_BIAS", payload: { directionOverride: "short" } });
      updateCurrentPacket({
        learning_state: { operator_override: "short", manual_bias_override: "short" },
        next_trade: { ...(livePacket?.next_trade || {}), direction: "short" },
      });
    } else if (action === "block-trade") {
      controls?.executionAuthority?.blockCurrentSetup?.();
    } else if (action === "save-note") {
      const note = String(_modalRoot?.querySelector("#tvm-note")?.value || "").trim();
      _operatorNote = note;
      controls?.saveOperatorNote?.(note, livePacket);
    } else if (action === "simulate") {
      updateSimulationBars(_modalRoot, livePacket?.next_trade || {}, livePacket?.market_state?.candles || []);
    }
    window.setTimeout(() => {
      const refreshed = getCurrentPacket();
      if (!refreshed || !_modalRoot) return;
      drawMiniChart(
        _modalRoot.querySelector("#tvm-chart"),
        refreshed?.market_state?.candles || [],
        { ...(refreshed?.next_trade || {}), direction: getOperatorOverride(refreshed) || refreshed?.next_trade?.direction },
      );
      updateSimulationBars(_modalRoot, refreshed?.next_trade || {}, refreshed?.market_state?.candles || []);
      updateNarrativePanels(_modalRoot, refreshed);
    }, 120);
  });

  _refreshTimer = window.setInterval(() => {
    if (!_modalRoot) return;
    const livePacket = getCurrentPacket();
    if (!livePacket) return;
    drawMiniChart(
      _modalRoot.querySelector("#tvm-chart"),
      livePacket?.market_state?.candles || [],
      { ...(livePacket?.next_trade || {}), direction: getOperatorOverride(livePacket) || livePacket?.next_trade?.direction },
    );
    updateSimulationBars(_modalRoot, livePacket?.next_trade || {}, livePacket?.market_state?.candles || []);
    updateNarrativePanels(_modalRoot, livePacket);
  }, 1000);

  return { close };
}
