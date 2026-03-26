import { readActiveLibraryContext } from "./libraryDecisionAdapter.js";
import { evaluateMicroBotDecision } from "./microBotEngine.js";
import { buildSimplePaperTrade } from "./simpleTradeBuilder.js";
import { updateSimpleTradeLifecycle } from "./simpleExecutionEngine.js";
import {
  buildMicroBotExportFilename,
  buildMicroBotJournalExport,
  downloadJsonFile,
  getMicroBotJournalTrades,
} from "./microBotJournalExport.js";
import { buildDiagnosticPerformanceSummary, buildTradeDiagnostics } from "./microBotDiagnosis.js";

const ORIGIN_TAB = "microbot_1m";
const REPLAY_TICK_MS = 250;
const REPLAY_TICKS_PER_CANDLE = 12;
const TOUCH_HIGHLIGHT_MS = 1500;

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

function createNextFormingCandle(last = {}, symbol = "BTCUSDT") {
  const baseClose = Number(last.close) || 100;
  const openTime = Date.parse(last.timestamp || Date.now()) + 60_000;
  return {
    timestamp: new Date(openTime).toISOString(),
    closeTime: new Date(openTime + 60_000).toISOString(),
    open: Number(baseClose.toFixed(4)),
    high: Number(baseClose.toFixed(4)),
    low: Number(baseClose.toFixed(4)),
    close: Number(baseClose.toFixed(4)),
    volume: 0,
    asset: symbol,
    timeframe: "1m",
    source: "microbot_replay_live",
    isForming: true,
  };
}

function updateFormingCandleFromTick(formingCandle = null, tickPrice = null) {
  if (!formingCandle || !Number.isFinite(Number(tickPrice))) return formingCandle;
  const price = Number(tickPrice);
  return {
    ...formingCandle,
    close: Number(price.toFixed(4)),
    high: Number(Math.max(Number(formingCandle.high), price).toFixed(4)),
    low: Number(Math.min(Number(formingCandle.low), price).toFixed(4)),
    volume: Number((Number(formingCandle.volume || 0) + (20 + Math.random() * 40)).toFixed(2)),
  };
}

function fmtPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(4);
}

function buildEarlyExitLabel(trade = {}) {
  const reason = trade.earlyCloseReason || trade.closeReason;
  if (!reason || !["early_rejection", "no_followthrough", "weak_favorable_dominance"].includes(reason)) return "";
  return `Early exit: ${reason}`;
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

function renderChartSvg(candles = [], activeTrade = null, closedTrades = [], liveState = {}) {
  const allRows = liveState.formingCandle ? [...candles, liveState.formingCandle] : [...candles];
  const rows = allRows.slice(-60);
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
    const touchState = liveState.tradeTouches || {};
    const isTouched = (key) => Number.isFinite(touchState[key]) && touchState[key] > Date.now();
    const entryY = yFor(activeTrade.entry);
    const slY = yFor(activeTrade.stopLoss);
    const tpY = yFor(activeTrade.takeProfit);
    lines.push(`<rect x="${pad}" y="${Math.min(entryY, tpY)}" width="${width - pad * 2}" height="${Math.max(2, Math.abs(entryY - tpY))}" fill="rgba(46,204,113,0.08)" />`);
    lines.push(`<rect x="${pad}" y="${Math.min(entryY, slY)}" width="${width - pad * 2}" height="${Math.max(2, Math.abs(entryY - slY))}" fill="rgba(255,90,107,0.08)" />`);
    lines.push(`<line x1="${pad}" y1="${entryY}" x2="${width - pad}" y2="${entryY}" stroke="${isTouched("entry") ? "#7dd3fc" : "#4da3ff"}" stroke-width="${isTouched("entry") ? 2.4 : 1.4}" stroke-dasharray="6 4" />`);
    lines.push(`<line x1="${pad}" y1="${slY}" x2="${width - pad}" y2="${slY}" stroke="${isTouched("sl") ? "#ffc27a" : "#ff8f00"}" stroke-width="${isTouched("sl") ? 2.4 : 1.4}" stroke-dasharray="4 4" />`);
    lines.push(`<line x1="${pad}" y1="${tpY}" x2="${width - pad}" y2="${tpY}" stroke="${isTouched("tp") ? "#6af0aa" : "#2ecc71"}" stroke-width="${isTouched("tp") ? 2.4 : 1.4}" stroke-dasharray="4 4" />`);
    lines.push(`<text x="${width - pad - 44}" y="${entryY - 5}" fill="#4da3ff" font-size="10">Entry</text>`);
    lines.push(`<text x="${width - pad - 30}" y="${slY - 5}" fill="#ff8f00" font-size="10">SL</text>`);
    lines.push(`<text x="${width - pad - 30}" y="${tpY - 5}" fill="#2ecc71" font-size="10">TP</text>`);
    if (isTouched("entry")) lines.push(`<circle cx="${width - pad - 8}" cy="${entryY}" r="5" fill="#7dd3fc" />`);
    if (isTouched("sl")) lines.push(`<circle cx="${width - pad - 8}" cy="${slY}" r="5" fill="#ffc27a" />`);
    if (isTouched("tp")) lines.push(`<circle cx="${width - pad - 8}" cy="${tpY}" r="5" fill="#6af0aa" />`);
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
  getJournalTrades = () => [],
} = {}) {
  const state = {
    status: "idle",
    symbol: "BTCUSDT",
    timeframe: "1m",
    autoTrade: true,
    replayMode: true,
    candles: makeSeedCandles("BTCUSDT"),
    formingCandle: null,
    replayTickCount: 0,
    tradeTouches: { entry: 0, sl: 0, tp: 0 },
    activeTrade: null,
    closedTrades: [],
    journalPreview: [],
    learningPreview: [],
    lastDecision: { action: "no_trade", reason: "idle", matchedLibraryItems: [], warnings: [], blockingReason: [] },
    noTradeLog: [],
    vetoCount: 0,
    noMatchCount: 0,
    tradeDecisionCount: 0,
    executedTradeCount: 0,
    libraryContext: readActiveLibraryContext(getLibraryItems()),
    journalStatus: "idle",
    lastExportAt: null,
    exportStatus: "idle",
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



  function buildNoTradeRecord({ decision = {}, candle = null } = {}) {
    return {
      timestamp: candle?.timestamp || new Date().toISOString(),
      symbol: state.symbol,
      timeframe: state.timeframe,
      action: "no_trade",
      reason: decision.reason || "no_match",
      matchedLibraryItems: Array.isArray(decision.matchedLibraryItems) ? [...decision.matchedLibraryItems] : [],
      warnings: Array.isArray(decision.warnings) ? [...decision.warnings] : [],
      blockingReason: Array.isArray(decision.blockingReason) ? [...decision.blockingReason] : [],
      libraryContextSnapshot: { ...state.libraryContext },
      decisionSnapshot: { ...decision },
    };
  }

  function registerNoTrade(decision, candle) {
    const record = buildNoTradeRecord({ decision, candle });
    state.noTradeLog.unshift(record);
    state.noTradeLog = state.noTradeLog.slice(0, 100);
    if (decision.reason === "context_veto") state.vetoCount += 1;
    if (decision.reason === "no_match") state.noMatchCount += 1;
  }

  function processNewCandle(candle) {
    state.candles.push(candle);
    if (state.candles.length > 500) state.candles = state.candles.slice(-500);

    state.libraryContext = readActiveLibraryContext(getLibraryItems());
    state.lastDecision = evaluateMicroBotDecision({ candles: state.candles, libraryContext: state.libraryContext });
    if (["long", "short"].includes(state.lastDecision.action) || state.lastDecision.action === "no_trade") {
      state.tradeDecisionCount += 1;
    }

    if (state.lastDecision.action === "no_trade") {
      registerNoTrade(state.lastDecision, candle);
    }

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
        state.executedTradeCount += 1;
        writeJournal(trade);
      }
    }

    if (state.activeTrade) {
      const lifecycle = updateSimpleTradeLifecycle(state.activeTrade, candle, { candleIndex: state.candles.length - 1, candles: state.candles });
      state.activeTrade = lifecycle.trade;
      if (lifecycle.closed) {
        const closedTrade = { ...state.activeTrade, status: "closed", originTab: ORIGIN_TAB };
        closedTrade.diagnostics = buildTradeDiagnostics(closedTrade, state.candles, candle);
        closedTrade.patternName = closedTrade.diagnostics.patternName;
        console.info(`[Diagnosis] ${closedTrade.diagnostics.patternName} ${String(closedTrade.outcome || "unknown").toUpperCase()} -> ${closedTrade.diagnostics.failureReasonCodes.join(", ") || closedTrade.diagnostics.successReasonCodes.join(", ") || "no_reason_code"}`);
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

  function markTradeTouch(level) {
    if (!["entry", "sl", "tp"].includes(level)) return;
    state.tradeTouches[level] = Date.now() + TOUCH_HIGHLIGHT_MS;
    console.info(`[TradeOverlay] price touched ${level}`);
  }

  function updateTradeTouchState(formingCandle) {
    if (!state.activeTrade || !formingCandle) return;
    const high = Number(formingCandle.high);
    const low = Number(formingCandle.low);
    const entry = Number(state.activeTrade.entry);
    const stopLoss = Number(state.activeTrade.stopLoss);
    const takeProfit = Number(state.activeTrade.takeProfit);
    if (Number.isFinite(entry) && low <= entry && high >= entry) markTradeTouch("entry");
    if (Number.isFinite(stopLoss) && low <= stopLoss && high >= stopLoss) markTradeTouch("sl");
    if (Number.isFinite(takeProfit) && low <= takeProfit && high >= takeProfit) markTradeTouch("tp");
  }

  function stepReplay() {
    const lastClosed = state.candles[state.candles.length - 1] || {};
    if (!state.formingCandle) {
      state.formingCandle = createNextFormingCandle(lastClosed, state.symbol);
      state.replayTickCount = 0;
      console.info("[LiveCandle] candle closed, new candle opened", state.formingCandle.timestamp);
    }

    const drift = (Math.random() - 0.5) * 0.28;
    const nextTickPrice = Math.max(0.01, Number(state.formingCandle.close) + drift);
    state.formingCandle = updateFormingCandleFromTick(state.formingCandle, nextTickPrice);
    state.replayTickCount += 1;
    console.debug("[LiveCandle] update current candle", {
      ts: state.formingCandle.timestamp,
      open: state.formingCandle.open,
      high: state.formingCandle.high,
      low: state.formingCandle.low,
      close: state.formingCandle.close,
      ticks: state.replayTickCount,
    });

    if (state.activeTrade) {
      console.debug("[TradeOverlay] draw entry/sl/tp", {
        entry: state.activeTrade.entry,
        stopLoss: state.activeTrade.stopLoss,
        takeProfit: state.activeTrade.takeProfit,
      });
    }
    updateTradeTouchState(state.formingCandle);

    if (state.replayTickCount >= REPLAY_TICKS_PER_CANDLE) {
      const closed = { ...state.formingCandle, isForming: false };
      state.formingCandle = null;
      state.replayTickCount = 0;
      processNewCandle(closed);
      return;
    }

    render();
  }

  function start() {
    state.status = "running";
    if (loop) clearInterval(loop);
    loop = setInterval(stepReplay, REPLAY_TICK_MS);
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
    state.formingCandle = null;
    state.replayTickCount = 0;
    state.tradeTouches = { entry: 0, sl: 0, tp: 0 };
    state.activeTrade = null;
    state.closedTrades = [];
    state.journalPreview = [];
    state.learningPreview = [];
    state.lastDecision = { action: "no_trade", reason: "idle", matchedLibraryItems: [], warnings: [], blockingReason: [] };
    state.noTradeLog = [];
    state.vetoCount = 0;
    state.noMatchCount = 0;
    state.tradeDecisionCount = 0;
    state.executedTradeCount = 0;
    state.journalStatus = "idle";
    render();
  }

  function handleExportJournal() {
    try {
      const allTrades = getJournalTrades();
      const filteredTrades = getMicroBotJournalTrades(allTrades, { originTab: ORIGIN_TAB });
      const exportData = buildMicroBotJournalExport(filteredTrades, {
        originTab: ORIGIN_TAB,
        symbol: state.symbol,
        timeframe: state.timeframe,
        mode: "paper",
        decisionLog: state.noTradeLog,
        sessionSummary: {
          noMatchCount: state.noMatchCount,
          contextVetoCount: state.vetoCount,
          tradeDecisionCount: state.tradeDecisionCount,
          executedTradeCount: state.executedTradeCount,
        },
        librarySnapshot: {
          patterns: state.libraryContext?.patterns || [],
          contexts: state.libraryContext?.contexts || [],
          lessons: state.learningPreview || [],
        },
      });
      const filename = buildMicroBotExportFilename({
        symbol: exportData.symbol || state.symbol || null,
        timeframe: exportData.timeframe || state.timeframe || "1m",
      });
      downloadJsonFile(filename, exportData);
      state.lastExportAt = new Date().toISOString();
      state.exportStatus = `ok: ${filename}`;
    } catch (error) {
      console.error("[MicroBot] Journal export failed", error);
      state.exportStatus = `warning: ${error?.message || "export failed"}`;
    }
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
    elements.exportJournalBtn?.addEventListener("click", handleExportJournal);
  }

  function render() {
    if (!elements.root) return;
    if (elements.status) elements.status.textContent = state.status;
    if (elements.symbol) elements.symbol.textContent = state.symbol;
    if (elements.timeframe) elements.timeframe.textContent = state.timeframe;
    if (elements.tradesCount) elements.tradesCount.textContent = String(state.closedTrades.length);
    if (elements.pnl) elements.pnl.textContent = computePaperPnl(state.closedTrades).toFixed(4);
    if (elements.chart) {
      elements.chart.innerHTML = renderChartSvg(state.candles, state.activeTrade, state.closedTrades, {
        formingCandle: state.formingCandle,
        tradeTouches: state.tradeTouches,
      });
    }

    if (elements.libraryRules) {
      const ids = state.libraryContext.activeItems?.slice(0, 6).map((item) => item.id) || [];
      elements.libraryRules.textContent = ids.length ? ids.join(", ") : "Library unavailable";
    }

    if (elements.lastDecision) {
      const blocking = (state.lastDecision.blockingReason || []).length ? ` · ${state.lastDecision.blockingReason.join(" | ")}` : "";
      elements.lastDecision.textContent = `${state.lastDecision.action} · ${state.lastDecision.reason}${blocking}`;
    }

    if (elements.lastNoTrade) {
      const lastNoTrade = state.noTradeLog[0];
      elements.lastNoTrade.textContent = lastNoTrade
        ? `${lastNoTrade.timestamp.slice(11, 19)} · ${lastNoTrade.reason}${lastNoTrade.blockingReason.length ? ` · ${lastNoTrade.blockingReason.join(" | ")}` : ""}`
        : "none";
    }

    if (elements.vetoCount) elements.vetoCount.textContent = String(state.vetoCount);
    if (elements.noMatchCount) elements.noMatchCount.textContent = String(state.noMatchCount);
    if (elements.tradeDecisionCount) elements.tradeDecisionCount.textContent = String(state.tradeDecisionCount);
    if (elements.executedTradeCount) elements.executedTradeCount.textContent = String(state.executedTradeCount);
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
          ${buildEarlyExitLabel(trade) ? `<div class="tiny muted">${buildEarlyExitLabel(trade)}</div>` : ""}
        </li>
      `)).join("") || '<li class="muted tiny">No closed trades yet</li>';
    }

    if (elements.diagnosticSummary) {
      const summary = buildDiagnosticPerformanceSummary(state.closedTrades);
      const topLoss = summary.topLossReasons.slice(0, 5).map((row) => `${row.code} (${row.count})`).join(", ") || "none";
      const topWin = summary.topWinReasons.slice(0, 5).map((row) => `${row.code} (${row.count})`).join(", ") || "none";
      const lateEntry = summary.patternsMostAffectedByLateEntry.map((row) => `${row.code} (${row.count})`).join(", ") || "none";
      const noFollowthrough = summary.patternsMostAffectedByNoFollowthrough.map((row) => `${row.code} (${row.count})`).join(", ") || "none";
      const byPattern = Object.entries(summary.byPattern)
        .sort((a, b) => b[1].trades - a[1].trades)
        .slice(0, 6)
        .map(([pattern, stats]) => `${pattern}: ${stats.wins}W/${stats.losses}L (${stats.winRate.toFixed(1)}%)`)
        .join("<br/>") || "none";
      const byPatternLoss = Object.entries(summary.lossReasonsByPattern)
        .slice(0, 4)
        .map(([pattern, map]) => `${pattern}: ${Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, count]) => `${code}(${count})`).join(", ")}`)
        .join("<br/>") || "none";
      const byPatternWin = Object.entries(summary.winReasonsByPattern)
        .slice(0, 4)
        .map(([pattern, map]) => `${pattern}: ${Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, count]) => `${code}(${count})`).join(", ")}`)
        .join("<br/>") || "none";

      elements.diagnosticSummary.innerHTML = `
        <p class="tiny"><strong>Rendimiento por patrón:</strong><br/>${byPattern}</p>
        <p class="tiny"><strong>Top razones de pérdida:</strong> ${topLoss}</p>
        <p class="tiny"><strong>Top razones de win:</strong> ${topWin}</p>
        <p class="tiny"><strong>Razones de pérdida por patrón:</strong><br/>${byPatternLoss}</p>
        <p class="tiny"><strong>Razones de win por patrón:</strong><br/>${byPatternWin}</p>
        <p class="tiny"><strong>Más afectados por late_entry:</strong> ${lateEntry}</p>
        <p class="tiny"><strong>Más afectados por no_followthrough:</strong> ${noFollowthrough}</p>
      `;
    }

    if (elements.autoTradeLabel) elements.autoTradeLabel.textContent = state.autoTrade ? "ON" : "OFF";

    const allMicroBotTrades = getMicroBotJournalTrades(getJournalTrades(), { originTab: ORIGIN_TAB });
    const closedMicroBotTrades = allMicroBotTrades.filter((trade) => trade.status === "closed");
    const winCount = closedMicroBotTrades.filter((trade) => trade.outcome === "win").length;
    const winRate = closedMicroBotTrades.length ? (winCount / closedMicroBotTrades.length) * 100 : 0;

    if (elements.journalToolsTradesCount) elements.journalToolsTradesCount.textContent = String(allMicroBotTrades.length);
    if (elements.journalToolsWinrate) elements.journalToolsWinrate.textContent = `${winRate.toFixed(2)}%`;
    if (elements.journalToolsLastExport) elements.journalToolsLastExport.textContent = state.lastExportAt ? state.lastExportAt.replace("T", " ").slice(0, 19) : "never";
    if (elements.exportStatus) elements.exportStatus.textContent = state.exportStatus;
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
