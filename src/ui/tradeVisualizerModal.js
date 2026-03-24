import { getCurrentPacket } from "../../modules/sessionBrainOrchestrator.js";

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

  const highs = rows.map((c) => c.high);
  const lows = rows.map((c) => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const pad = 8;
  const usableH = height - pad * 2;
  const candleW = Math.max(2, Math.floor((width - pad * 2) / rows.length) - 1);

  const y = (price) => {
    const pct = (price - min) / Math.max(1e-6, max - min);
    return height - pad - pct * usableH;
  };

  rows.forEach((c, idx) => {
    const x = pad + idx * ((width - pad * 2) / rows.length);
    const up = c.close >= c.open;
    ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
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
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, py);
    ctx.lineTo(width - pad, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "11px sans-serif";
    ctx.fillText(label, pad + 4, py - 4);
  };

  const target = Array.isArray(nextTrade?.targets) && nextTrade.targets.length
    ? num(nextTrade.targets[0]?.price_mid ?? nextTrade.targets[0]?.price ?? nextTrade.targets[0], null)
    : num(nextTrade?.target, null);

  drawLine(nextTrade?.trigger_price ?? nextTrade?.trigger, "#facc15", "trigger");
  drawLine(nextTrade?.invalidation_price ?? nextTrade?.invalidation, "#ef4444", "invalidation");
  drawLine(target, "#22c55e", "target");
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

function renderModal(packet = {}) {
  const nextTrade = packet?.next_trade || {};
  const learningState = packet?.learning_state || {};
  const brainState = packet?.brain_state || {};
  const momentum = String(nextTrade?.momentum || "").toLowerCase();
  const setup = String(nextTrade?.setup || "");
  const sim = simulateTradePaths(nextTrade, packet?.market_state?.candles || []);
  return `
    <div class="tvm-backdrop" data-tvm-close="1"></div>
    <section class="tvm-modal" role="dialog" aria-modal="true" aria-label="Trade Visualizer Modal">
      <header class="tvm-header">
        <h3>Trade Visualizer Modal</h3>
        <button class="ghost" type="button" data-tvm-close="1">Close</button>
      </header>
      <div class="tvm-grid">
        <article class="panel-soft">
          <h5>A. Chart Container</h5>
          <canvas id="tvm-chart" width="720" height="260"></canvas>
        </article>

        <article class="panel-soft">
          <h5>B. Brain Intent Overlay</h5>
          ${setup === "failed_breakout_short" ? '<p class="tiny"><span class="badge badge-yellow">Rejection zone active</span> ↓ Awaiting rejection confirmation</p>' : '<p class="tiny muted">No special setup overlay.</p>'}
          ${momentum === "fading" ? '<p class="tiny"><span class="badge badge-yellow">Momentum warning: fading</span></p>' : '<p class="tiny muted">Momentum stable.</p>'}
        </article>

        <article class="panel-soft">
          <h5>C. Trade Plan</h5>
          <pre class="tiny tvm-pre">${JSON.stringify({
            setup,
            mode: learningState?.mode || "mixed",
            confidence: Number(brainState?.confidence || 0),
            entry_logic: ["wait for rejection", "confirm below trigger", "execute short"],
          }, null, 2)}</pre>
        </article>

        <article class="panel-soft">
          <h5>D. Internal State</h5>
          ${progressRow("learning_mode", String(learningState?.mode || "mixed") === "exploitation" ? 1 : String(learningState?.mode || "mixed") === "mixed" ? 0.6 : 0.35)}
          ${progressRow("familiarity", brainState?.familiarity || 0)}
          ${progressRow("danger_score", brainState?.danger_score || 0)}
          ${progressRow("scenario_reliability", brainState?.scenario_reliability || 0)}
        </article>

        <article class="panel-soft">
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

        <article class="panel-soft">
          <h5>F. Simulation Panel</h5>
          <button class="ghost" type="button" data-tvm-action="simulate">Simulate Outcome</button>
          <div class="tvm-sim-rows" id="tvm-sim-rows">
            ${progressRow("continuation_probability", sim.continuation_probability)}
            ${progressRow("rejection_probability", sim.rejection_probability)}
            ${progressRow("chop_probability", sim.chop_probability)}
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
}

export function openTradeVisualizerModal(brainPacket = null, controls = {}) {
  const packet = brainPacket || getCurrentPacket() || {};
  if (_modalRoot) _modalRoot.remove();
  _modalRoot = document.createElement("div");
  _modalRoot.className = "tvm-root";
  _modalRoot.innerHTML = renderModal(packet);
  document.body.appendChild(_modalRoot);

  const chart = _modalRoot.querySelector("#tvm-chart");
  drawMiniChart(chart, packet?.market_state?.candles || [], packet?.next_trade || {});

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
    } else if (action === "adjust-bias-short") {
      controls?.dispatch?.({ type: "ADJUST_BIAS", payload: { directionOverride: "short" } });
    } else if (action === "block-trade") {
      controls?.executionAuthority?.blockCurrentSetup?.();
    } else if (action === "save-note") {
      const note = String(_modalRoot?.querySelector("#tvm-note")?.value || "").trim();
      _operatorNote = note;
      controls?.saveOperatorNote?.(note, livePacket);
    } else if (action === "simulate") {
      updateSimulationBars(_modalRoot, livePacket?.next_trade || {}, livePacket?.market_state?.candles || []);
    }
  });

  _refreshTimer = window.setInterval(() => {
    if (!_modalRoot) return;
    const livePacket = getCurrentPacket();
    if (!livePacket) return;
    drawMiniChart(_modalRoot.querySelector("#tvm-chart"), livePacket?.market_state?.candles || [], livePacket?.next_trade || {});
    updateSimulationBars(_modalRoot, livePacket?.next_trade || {}, livePacket?.market_state?.candles || []);
  }, 1200);

  return { close };
}
