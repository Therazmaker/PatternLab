import { readActiveLibraryContext } from "./libraryDecisionAdapter.js";
import { evaluateMicroBotDecision } from "./microBotEngine.js";
import { buildSimplePaperTrade } from "./simpleTradeBuilder.js";
import { updateSimpleTradeLifecycle } from "./simpleExecutionEngine.js";

const ORIGIN_TAB = "microbot_1m";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeSeedCandles(symbol = "BTCUSDT") {
  const now = Date.now();
  const candles = [];
  let price = 100;
  for (let i = 120; i >= 1; i -= 1) {
    const ts = new Date(now - i * 60_000).toISOString();
    const drift = (Math.random() - 0.5) * 0.4;
    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.random() * 0.2;
    const low = Math.min(open, close) - Math.random() * 0.2;
    candles.push({
      timestamp: ts,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(Math.max(0.0001, low).toFixed(4)),
      close: Number(close.toFixed(4)),
      volume: Math.round(100 + Math.random() * 80),
      asset: symbol,
      timeframe: "1m",
      source: "microbot_replay",
    });
    price = close;
  }
  return candles;
}

function createNextReplayCandle(last = {}, symbol = "BTCUSDT") {
  const lastClose = Number(last.close) || 100;
  const drift = (Math.random() - 0.5) * 0.6;
  const open = lastClose;
  const close = Math.max(0.1, open + drift);
  const high = Math.max(open, close) + Math.random() * 0.25;
  const low = Math.max(0.01, Math.min(open, close) - Math.random() * 0.25);
  return {
    timestamp: new Date(Date.parse(last.timestamp || Date.now()) + 60_000).toISOString(),
    open: Number(open.toFixed(4)),
    high: Number(high.toFixed(4)),
    low: Number(low.toFixed(4)),
    close: Number(close.toFixed(4)),
    volume: Math.round(80 + Math.random() * 120),
    asset: symbol,
    timeframe: "1m",
    source: "microbot_replay",
  };
}

function fmtPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(4);
}

function computePaperPnl(trades = []) {
  return trades.reduce((sum, trade) => {
    if (trade?.status !== "closed") return sum;
    const entry = Number(trade.entry);
    const exit = Number(trade.exitPrice);
    if (!Number.isFinite(entry) || !Number.isFinite(exit)) return sum;
    const pnl = trade.direction === "short" ? entry - exit : exit - entry;
    return sum + pnl;
  }, 0);
}

function buildLearningOutput(trade = {}) {
  const patterns = Array.isArray(trade?.decisionSnapshot?.matchedLibraryItems) ? trade.decisionSnapshot.matchedLibraryItems : [];
  let lessonCandidate = "short_was_wrong_context";
  if (trade.outcome === "win" && patterns.some((item) => item.includes("short"))) lessonCandidate = "worked_with_failed_breakout_short";
  else if (trade.decisionSnapshot?.reason === "blocked_by_library") lessonCandidate = "blocked_chase_correctly";

  return {
    tradeId: trade.id,
    timestamp: trade.resolvedAt || new Date().toISOString(),
    outcome: trade.outcome || "unknown",
    direction: trade.direction,
    setup: trade.setup || null,
    libraryPatternsUsed: patterns,
    decisionReason: trade.decisionSnapshot?.reason || null,
    favorableExcursion: trade.mfe ?? null,
    adverseExcursion: trade.mae ?? null,
    lessonCandidate,
  };
}

function renderChartSvg(candles = [], activeTrade = null, closedTrades = []) {
  const rows = candles.slice(-60);
  if (!rows.length) return '<div class="muted tiny">Waiting for 1m candles...</div>';
  const width = 920;
  const height = 260;
  const pad = 18;
  const highs = rows.map((c) => Number(c.high)).filter(Number.isFinite);
  const lows = rows.map((c) => Number(c.low)).filter(Number.isFinite);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const span = Math.max(0.0001, maxHigh - minLow);
  const candleWidth = Math.max(3, Math.floor((width - pad * 2) / rows.length) - 1);

  const yFor = (price) => pad + ((maxHigh - price) / span) * (height - pad * 2);

  const bodies = rows.map((candle, idx) => {
    const x = pad + idx * ((width - pad * 2) / rows.length);
    const openY = yFor(Number(candle.open));
    const closeY = yFor(Number(candle.close));
    const highY = yFor(Number(candle.high));
    const lowY = yFor(Number(candle.low));
    const bullish = Number(candle.close) >= Number(candle.open);
    const color = bullish ? "#2ecc71" : "#ff5a6b";
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(openY - closeY));
    return `
      <line x1="${x + candleWidth / 2}" y1="${highY}" x2="${x + candleWidth / 2}" y2="${lowY}" stroke="${color}" stroke-width="1" />
      <rect x="${x}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" opacity="0.85" />
    `;
  }).join("");

  const lines = [];
  if (activeTrade) {
    lines.push(`<line x1="${pad}" y1="${yFor(activeTrade.entry)}" x2="${width - pad}" y2="${yFor(activeTrade.entry)}" stroke="#4da3ff" stroke-dasharray="6 4" />`);
    lines.push(`<line x1="${pad}" y1="${yFor(activeTrade.stopLoss)}" x2="${width - pad}" y2="${yFor(activeTrade.stopLoss)}" stroke="#ff8f00" stroke-dasharray="4 4" />`);
    lines.push(`<line x1="${pad}" y1="${yFor(activeTrade.takeProfit)}" x2="${width - pad}" y2="${yFor(activeTrade.takeProfit)}" stroke="#2ecc71" stroke-dasharray="4 4" />`);
  }
  closedTrades.slice(-6).forEach((trade, index) => {
    const y = yFor(Number(trade.exitPrice || trade.entry));
    const x = width - pad - index * 20;
    lines.push(`<circle cx="${x}" cy="${clamp(y, pad, height - pad)}" r="4" fill="${trade.outcome === "win" ? "#2ecc71" : "#ff5a6b"}" />`);
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="microbot-chart-svg">${bodies}${lines.join("")}</svg>`;
}

export function createMicroBotTab({
  elements = {},
  getLibraryItems = () => [],
  onJournalWrite = () => {},
} = {}) {
  const state = {
    status: "idle",
    symbol: "BTCUSDT",
    timeframe: "1m",
    autoTrade: true,
    replayMode: true,
    candles: makeSeedCandles("BTCUSDT"),
    activeTrade: null,
    closedTrades: [],
    journalPreview: [],
    learningPreview: [],
    lastDecision: { action: "no_trade", reason: "idle", matchedLibraryItems: [], warnings: [] },
    libraryContext: readActiveLibraryContext(getLibraryItems()),
    journalStatus: "idle",
  };

  let loop = null;

  function writeJournal(trade) {
    const payload = {
      ...trade,
      source: "library_trader",
      setup: trade.setup || trade.decisionSnapshot?.setup || "library_setup",
      contextSnapshot: {
        originTab: ORIGIN_TAB,
        symbol: state.symbol,
        timeframe: state.timeframe,
        libraryContextSnapshot: trade.libraryContextSnapshot || {},
        decisionSnapshot: trade.decisionSnapshot || {},
      },
      tradeMeta: {
        ...(trade.tradeMeta || {}),
        originTab: ORIGIN_TAB,
        decisionSnapshot: trade.decisionSnapshot || {},
        libraryContextSnapshot: trade.libraryContextSnapshot || {},
      },
    };

    try {
      onJournalWrite(payload);
      state.journalStatus = "ok";
      state.journalPreview.unshift(payload);
      state.journalPreview = state.journalPreview.slice(0, 5);
    } catch (error) {
      state.journalStatus = `warning: ${error?.message || "journal write failed"}`;
      state.journalPreview.unshift({ ...payload, journalFallback: true });
      state.journalPreview = state.journalPreview.slice(0, 5);
    }
  }

  function processNewCandle(candle) {
    state.candles.push(candle);
    if (state.candles.length > 500) state.candles = state.candles.slice(-500);

    state.libraryContext = readActiveLibraryContext(getLibraryItems());
    state.lastDecision = evaluateMicroBotDecision({ candles: state.candles, libraryContext: state.libraryContext });

    if (state.autoTrade && !state.activeTrade && ["long", "short"].includes(state.lastDecision.action)) {
      const trade = buildSimplePaperTrade({
        direction: state.lastDecision.action,
        candles: state.candles,
        symbol: state.symbol,
        setup: state.lastDecision.setup || "library_setup",
        decisionSnapshot: state.lastDecision,
        libraryContextSnapshot: state.libraryContext,
      });
      if (trade) {
        state.activeTrade = trade;
        writeJournal(trade);
      }
    }

    if (state.activeTrade) {
      const lifecycle = updateSimpleTradeLifecycle(state.activeTrade, candle, { candleIndex: state.candles.length - 1 });
      state.activeTrade = lifecycle.trade;
      if (lifecycle.closed) {
        const closedTrade = { ...state.activeTrade, status: "closed", originTab: ORIGIN_TAB };
        state.closedTrades.unshift(closedTrade);
        state.closedTrades = state.closedTrades.slice(0, 100);
        writeJournal(closedTrade);
        state.learningPreview.unshift(buildLearningOutput(closedTrade));
        state.learningPreview = state.learningPreview.slice(0, 5);
        state.activeTrade = null;
      }
    }

    render();
  }

  function stepReplay() {
    const last = state.candles[state.candles.length - 1] || {};
    processNewCandle(createNextReplayCandle(last, state.symbol));
  }

  function start() {
    state.status = "running";
    if (loop) clearInterval(loop);
    loop = setInterval(stepReplay, 1200);
    render();
  }

  function pause() {
    state.status = "paused";
    if (loop) clearInterval(loop);
    loop = null;
    render();
  }

  function reset() {
    pause();
    state.status = "idle";
    state.candles = makeSeedCandles(state.symbol);
    state.activeTrade = null;
    state.closedTrades = [];
    state.journalPreview = [];
    state.learningPreview = [];
    state.lastDecision = { action: "no_trade", reason: "idle", matchedLibraryItems: [], warnings: [] };
    state.journalStatus = "idle";
    render();
  }

  function bindEvents() {
    elements.startBtn?.addEventListener("click", start);
    elements.pauseBtn?.addEventListener("click", pause);
    elements.resetBtn?.addEventListener("click", reset);
    elements.toggleAutoBtn?.addEventListener("click", () => {
      state.autoTrade = !state.autoTrade;
      render();
    });
    elements.refreshLibraryBtn?.addEventListener("click", () => {
      state.libraryContext = readActiveLibraryContext(getLibraryItems());
      render();
    });
  }

  function render() {
    if (!elements.root) return;
    if (elements.status) elements.status.textContent = state.status;
    if (elements.symbol) elements.symbol.textContent = state.symbol;
    if (elements.timeframe) elements.timeframe.textContent = state.timeframe;
    if (elements.tradesCount) elements.tradesCount.textContent = String(state.closedTrades.length);
    if (elements.pnl) elements.pnl.textContent = computePaperPnl(state.closedTrades).toFixed(4);
    if (elements.chart) elements.chart.innerHTML = renderChartSvg(state.candles, state.activeTrade, state.closedTrades);

    if (elements.libraryRules) {
      const ids = state.libraryContext.activeItems?.slice(0, 6).map((item) => item.id) || [];
      elements.libraryRules.textContent = ids.length ? ids.join(", ") : "Library unavailable";
    }

    if (elements.lastDecision) {
      elements.lastDecision.textContent = `${state.lastDecision.action} · ${state.lastDecision.reason}`;
    }
    if (elements.journalStatus) elements.journalStatus.textContent = state.journalStatus;
    if (elements.learning) {
      elements.learning.innerHTML = state.learningPreview.length
        ? state.learningPreview.map((row) => `<li>${row.timestamp.slice(11, 16)} · ${row.lessonCandidate} (${row.outcome})</li>`).join("")
        : '<li class="muted tiny">No lessons yet</li>';
    }

    if (elements.activeTrade) {
      elements.activeTrade.innerHTML = state.activeTrade
        ? `<div class="mini-list"><div>Direction: <strong>${state.activeTrade.direction}</strong></div><div>Entry: ${fmtPrice(state.activeTrade.entry)}</div><div>SL: ${fmtPrice(state.activeTrade.stopLoss)}</div><div>TP: ${fmtPrice(state.activeTrade.takeProfit)}</div><div>Status: ${state.activeTrade.status}</div><div>Candles: ${state.activeTrade.candlesInTrade || 0}</div></div>`
        : '<p class="muted tiny">No active trade</p>';
    }

    if (elements.journalPreview) {
      elements.journalPreview.innerHTML = state.closedTrades.slice(0, 5).map((trade) => (`
        <li>
          <strong>${trade.outcome || "open"}</strong> · ${trade.setup || "setup"} · ${trade.direction}
          <span class="muted tiny">${String(trade.resolvedAt || trade.createdAt || "").slice(11, 16)}</span>
        </li>
      `)).join("") || '<li class="muted tiny">No closed trades yet</li>';
    }

    if (elements.autoTradeLabel) elements.autoTradeLabel.textContent = state.autoTrade ? "ON" : "OFF";
  }

  bindEvents();
  render();

  return {
    refreshLibrary: () => {
      state.libraryContext = readActiveLibraryContext(getLibraryItems());
      render();
    },
    render,
    destroy: () => {
      if (loop) clearInterval(loop);
      loop = null;
    },
  };
}
