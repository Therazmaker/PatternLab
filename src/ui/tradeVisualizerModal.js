import { getCurrentPacket, updateCurrentPacket } from "../../modules/sessionBrainOrchestrator.js";

let _modalRoot = null;
let _refreshTimer = null;
let _operatorNote = "";
let _visualTrade = null;
let _systemTradeProposal = null;
let _chartLayout = null;
let _activeDragHandle = null;
let _activePlacementHandle = "entry";
let _visualTradeLearningRecords = [];
let _onTradeSync = null;

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

function uid(prefix = "trade") {
  return `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
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

function inferDirection(nextTrade = {}) {
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const explicit = String(nextTrade?.direction || "").toLowerCase();
  if (explicit === "long" || explicit === "short") return explicit;
  if (setup.includes("short") || setup.includes("bear")) return "short";
  return "long";
}

function avgCandleRange(candles = []) {
  const rows = toRecentCandles(candles);
  if (!rows.length) return 1;
  const total = rows.reduce((sum, c) => sum + Math.max(1e-6, c.high - c.low), 0);
  return total / rows.length;
}

function getCurrentPrice(candles = [], fallback = null) {
  const rows = toRecentCandles(candles);
  const lastClose = num(rows[rows.length - 1]?.close, null);
  if (Number.isFinite(lastClose) && lastClose > 0) return lastClose;
  const fallbackPrice = num(fallback, null);
  if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) return fallbackPrice;
  return null;
}

function fallbackFromStructure(direction, candles = [], entry = null) {
  const rows = toRecentCandles(candles);
  const last = rows[rows.length - 1] || { close: 0, high: 0, low: 0 };
  const range = avgCandleRange(rows);
  const refEntry = num(entry, last.close);
  const highs = rows.map((c) => c.high);
  const lows = rows.map((c) => c.low);
  const swingHigh = highs.length ? Math.max(...highs.slice(-10)) : last.high;
  const swingLow = lows.length ? Math.min(...lows.slice(-10)) : last.low;
  if (direction === "short") {
    const stopLoss = Math.max(refEntry + range * 0.65, swingHigh + range * 0.12);
    const takeProfit = Math.min(refEntry - range * 1.6, swingLow - range * 0.2);
    return { entry: refEntry, stopLoss, takeProfit };
  }
  const stopLoss = Math.min(refEntry - range * 0.65, swingLow - range * 0.12);
  const takeProfit = Math.max(refEntry + range * 1.6, swingHigh + range * 0.2);
  return { entry: refEntry, stopLoss, takeProfit };
}

function sanitizeTradeEntry(trade = {}, candles = []) {
  const direction = trade?.direction === "short" ? "short" : "long";
  const avgRange = avgCandleRange(candles);
  const minGap = Math.max(1e-6, avgRange * 0.12);
  const currentPrice = getCurrentPrice(candles, trade?.entry);
  const rawEntry = num(trade?.entry, null);
  const needsEntryFix = rawEntry === null || rawEntry <= 0;
  let entry = needsEntryFix ? currentPrice : rawEntry;

  if (!Number.isFinite(entry) || entry <= 0) {
    const regenerated = fallbackFromStructure(direction, candles, currentPrice);
    entry = num(regenerated?.entry, currentPrice);
  }
  if (!Number.isFinite(entry) || entry <= 0) {
    throw new Error("[TradeVisualizer] Invalid trade entry (0/negative) after regeneration.");
  }

  let stopLoss = num(trade?.stopLoss, null);
  let takeProfit = num(trade?.takeProfit, null);
  if (needsEntryFix) {
    const fallback = fallbackFromStructure(direction, candles, entry);
    const riskDistance = Number.isFinite(stopLoss) ? Math.max(minGap, Math.abs(rawEntry - stopLoss)) : Math.abs(entry - fallback.stopLoss);
    const rewardDistance = Number.isFinite(takeProfit) ? Math.max(minGap, Math.abs(takeProfit - rawEntry)) : Math.abs(fallback.takeProfit - entry);
    if (direction === "short") {
      stopLoss = entry + riskDistance;
      takeProfit = entry - rewardDistance;
    } else {
      stopLoss = entry - riskDistance;
      takeProfit = entry + rewardDistance;
    }
  }

  return {
    ...trade,
    direction,
    entry,
    stopLoss,
    takeProfit,
    currentPrice,
  };
}

export function buildProposedTrade(packet = {}) {
  const nextTrade = packet?.next_trade || {};
  const levels = getTradeLevels(nextTrade);
  const candles = packet?.market_state?.candles || [];
  const direction = inferDirection(nextTrade);
  const lastClose = getCurrentPrice(candles, levels.trigger);
  const baseEntry = num(levels.trigger, lastClose);
  const structure = fallbackFromStructure(direction, candles, baseEntry);

  let entry = num(levels.trigger, structure.entry);
  let stopLoss = num(levels.invalidation, structure.stopLoss);
  let takeProfit = num(levels.target, structure.takeProfit);
  const minGap = Math.max(1e-6, avgCandleRange(candles) * 0.2);

  if (direction === "long") {
    if (!(stopLoss < entry)) stopLoss = entry - minGap;
    if (!(takeProfit > entry)) takeProfit = entry + minGap * 2;
  } else {
    if (!(stopLoss > entry)) stopLoss = entry + minGap;
    if (!(takeProfit < entry)) takeProfit = entry - minGap * 2;
  }

  return sanitizeTradeEntry({
    id: uid("visual"),
    direction,
    entry,
    stopLoss,
    takeProfit,
    status: "pending",
    source: "system_auto",
    createdAt: Date.now(),
    notes: "Auto-proposed trade from packet structure.",
  }, candles);
}

export function evaluateTradeStatus(trade = {}, candles = []) {
  if (!trade || trade.status === "cancelled") return "cancelled";
  const rows = toRecentCandles(candles);
  if (!rows.length) return "pending";
  const isLong = trade.direction !== "short";
  const touchedAt = rows.findIndex((c) => c.low <= trade.entry && c.high >= trade.entry);
  if (touchedAt < 0) return "pending";

  for (let i = touchedAt; i < rows.length; i += 1) {
    const c = rows[i];
    if (isLong) {
      if (c.low <= trade.stopLoss) return "stopped";
      if (c.high >= trade.takeProfit) return "target_hit";
    } else {
      if (c.high >= trade.stopLoss) return "stopped";
      if (c.low <= trade.takeProfit) return "target_hit";
    }
  }

  return touchedAt === rows.length - 1 ? "triggered" : "active";
}

function resolveOutcomeFromStatus(status = "") {
  if (status === "target_hit") return "win";
  if (status === "stopped") return "loss";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function formatTradeClock(seconds = 0) {
  const safe = Math.max(0, Math.floor(num(seconds, 0)));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function normalizeTradeLevels(nextTrade = {}, candles = []) {
  const sanitized = sanitizeTradeEntry(nextTrade, candles);
  const rows = toRecentCandles(candles);
  const avgRange = avgCandleRange(rows);
  const minGap = Math.max(1e-6, avgRange * 0.12);
  const snap = Math.max(1e-4, avgRange / 50);
  const direction = nextTrade?.direction === "short" ? "short" : "long";
  const next = {
    ...sanitized,
    direction: sanitized.direction,
    entry: num(sanitized?.entry, sanitized?.currentPrice),
    stopLoss: num(sanitized?.stopLoss, 0),
    takeProfit: num(sanitized?.takeProfit, 0),
  };
  if (direction === "long") {
    next.stopLoss = Math.min(next.stopLoss, next.entry - minGap);
    next.takeProfit = Math.max(next.takeProfit, next.entry + minGap);
    if (!(next.stopLoss < next.entry && next.entry < next.takeProfit)) {
      next.stopLoss = next.entry - minGap;
      next.takeProfit = next.entry + minGap * 2;
    }
  } else {
    next.takeProfit = Math.min(next.takeProfit, next.entry - minGap);
    next.stopLoss = Math.max(next.stopLoss, next.entry + minGap);
    if (!(next.takeProfit < next.entry && next.entry < next.stopLoss)) {
      next.takeProfit = next.entry - minGap;
      next.stopLoss = next.entry + minGap * 2;
    }
  }
  const snapPrice = (p) => Math.round(p / snap) * snap;
  next.entry = snapPrice(next.entry);
  next.stopLoss = snapPrice(next.stopLoss);
  next.takeProfit = snapPrice(next.takeProfit);
  if (next.entry === 0) {
    throw new Error("[TradeVisualizer] Entry resolved to 0 after normalization.");
  }
  return { trade: next, minGap, snap };
}

function applyHandleDrag(trade = {}, handle = "entry", draftPrice = 0, candles = []) {
  const base = normalizeTradeLevels(trade, candles);
  const next = { ...base.trade };
  const price = Number.isFinite(Number(draftPrice)) ? Number(draftPrice) : next.entry;
  if (handle === "entry") next.entry = price;
  if (handle === "stopLoss") next.stopLoss = price;
  if (handle === "takeProfit") next.takeProfit = price;
  const normalized = normalizeTradeLevels(next, candles);
  const clamped = { ...normalized.trade };
  if (handle === "entry") {
    if (clamped.direction === "long") {
      clamped.entry = Math.max(clamped.stopLoss + normalized.minGap, Math.min(clamped.entry, clamped.takeProfit - normalized.minGap));
    } else {
      clamped.entry = Math.max(clamped.takeProfit + normalized.minGap, Math.min(clamped.entry, clamped.stopLoss - normalized.minGap));
    }
  } else if (handle === "stopLoss") {
    clamped.stopLoss = clamped.direction === "long"
      ? Math.min(clamped.stopLoss, clamped.entry - normalized.minGap)
      : Math.max(clamped.stopLoss, clamped.entry + normalized.minGap);
  } else if (handle === "takeProfit") {
    clamped.takeProfit = clamped.direction === "long"
      ? Math.max(clamped.takeProfit, clamped.entry + normalized.minGap)
      : Math.min(clamped.takeProfit, clamped.entry - normalized.minGap);
  }
  return normalizeTradeLevels(clamped, candles).trade;
}

function buildLearningRecord(trade = {}) {
  const now = Date.now();
  const resolvedAt = num(trade?.resolvedAt, now);
  const triggeredAt = num(trade?.triggeredAt, resolvedAt);
  return {
    id: trade.id || uid("learn"),
    direction: trade.direction || "long",
    entry: num(trade.entry, 0),
    stopLoss: num(trade.stopLoss, 0),
    takeProfit: num(trade.takeProfit, 0),
    outcome: resolveOutcomeFromStatus(trade.status),
    source: trade.source || "system_auto",
    setup: trade.setup || null,
    confidence: num(trade.confidence, 0),
    triggeredAt,
    resolvedAt,
    timeInTradeSec: Math.max(0, Math.floor((resolvedAt - triggeredAt) / 1000)),
    candlesInTrade: Math.max(0, Math.floor(num(trade.candlesInTrade, 0))),
    mfe: num(trade.mfe, 0),
    mae: num(trade.mae, 0),
    notes: trade.notes || "",
  };
}

function hasPriceTouchedEntry(candle = {}, entry = null) {
  const low = num(candle?.low, null);
  const high = num(candle?.high, null);
  const e = num(entry, null);
  return e !== null && low !== null && high !== null && low <= e && high >= e;
}

function resolveTradeState(trade = {}, packet = {}) {
  if (!trade) return null;
  const candles = toRecentCandles(packet?.market_state?.candles || []);
  if (!candles.length) return { ...trade };
  const now = Date.now();
  const next = { ...trade };
  const isLong = next.direction !== "short";
  const resolvedStates = new Set(["stopped", "target_hit", "cancelled"]);
  if (resolvedStates.has(next.status)) return next;
  const triggerIndex = candles.findIndex((c) => hasPriceTouchedEntry(c, next.entry));
  if (triggerIndex >= 0 && !num(next.triggeredAt, null)) {
    next.status = "triggered";
    next.triggeredAt = now;
    next.triggeredCandleIndex = triggerIndex;
    next.markers = [...(Array.isArray(next.markers) ? next.markers : []), { type: "activated", ts: now, label: "Trade Activated", price: next.entry }];
  }
  if (num(next.triggeredAt, null)) {
    const start = Math.max(0, num(next.triggeredCandleIndex, triggerIndex >= 0 ? triggerIndex : candles.length - 1));
    const activeSlice = candles.slice(start);
    let mfe = num(next.mfe, 0);
    let mae = num(next.mae, 0);
    activeSlice.forEach((c) => {
      const high = num(c?.high, next.entry);
      const low = num(c?.low, next.entry);
      if (isLong) {
        mfe = Math.max(mfe, high - next.entry);
        mae = Math.max(mae, next.entry - low);
      } else {
        mfe = Math.max(mfe, next.entry - low);
        mae = Math.max(mae, high - next.entry);
      }
    });
    next.mfe = mfe;
    next.mae = mae;
    next.candlesInTrade = Math.max(0, candles.length - start - 1);
    next.timeInTradeSec = Math.max(0, Math.floor((now - next.triggeredAt) / 1000));
    next.status = next.status === "triggered" ? "active" : next.status;
    for (let i = start; i < candles.length; i += 1) {
      const c = candles[i];
      const hitStop = isLong ? c.low <= next.stopLoss : c.high >= next.stopLoss;
      const hitTarget = isLong ? c.high >= next.takeProfit : c.low <= next.takeProfit;
      if (hitStop || hitTarget) {
        const resolvedStatus = hitStop ? "stopped" : "target_hit";
        next.status = resolvedStatus;
        next.resolvedAt = now;
        next.timeInTradeSec = Math.max(0, Math.floor((now - next.triggeredAt) / 1000));
        next.candlesInTrade = Math.max(0, i - start);
        next.markers = [...(Array.isArray(next.markers) ? next.markers : []), {
          type: resolvedStatus === "target_hit" ? "target_hit" : "stop_hit",
          ts: now,
          label: resolvedStatus === "target_hit" ? "TP Hit" : "SL Hit",
          price: resolvedStatus === "target_hit" ? next.takeProfit : next.stopLoss,
        }];
        break;
      }
    }
  }
  return next;
}

function calcTradeMetrics(trade = {}, candles = []) {
  const rows = toRecentCandles(candles);
  const current = rows[rows.length - 1]?.close ?? trade.entry;
  const risk = Math.abs(trade.entry - trade.stopLoss);
  const reward = Math.abs(trade.takeProfit - trade.entry);
  const rr = risk > 1e-6 ? reward / risk : 0;
  const dirMult = trade.direction === "short" ? -1 : 1;
  const distanceToEntry = (current - trade.entry) * dirMult;
  const progress = reward > 1e-6 ? clamp01(((current - trade.entry) * dirMult) / reward) : 0;
  const volatility = avgCandleRange(rows);
  const slTight = volatility > 0 && risk < volatility * 0.7;
  return { current, risk, reward, rr, distanceToEntry, progress, slTight };
}

function tradeSourceBadge(trade = {}, systemTrade = {}) {
  if (!trade || trade.source === "system_auto") return "System Trade Proposal";
  if (trade.source === "operator_manual") return "Operator Visual Trade";
  if (trade.direction && systemTrade?.direction && trade.direction !== systemTrade.direction) return "Operator Override Trade";
  return "Operator Trade Active";
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

function buildBrainVoice(packet = {}, conflict = detectBiasConflict(packet), countdown = getTimeframeCountdown(5), trade = null) {
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
  const tradeText = trade
    ? (() => {
        const metrics = calcTradeMetrics(trade, packet?.market_state?.candles || []);
        if (metrics.rr < 1.2) return "Trade structure exists, but reward/risk is weak.";
        if (metrics.slTight) return "Stop may be too tight for current candle range.";
        if (trade.source === "operator_override") return `Operator ${trade.direction} override is active.`;
        return "";
      })()
    : "";
  return `${setupText} ${directionText} ${learningText} ${qualityText} ${riskText} ${familiarityText} ${momentumText} ${conflictText} ${tradeText} ${closeText}`.trim();
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

function drawMiniChart(canvas, candles = [], nextTrade = {}, visualTrade = null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rows = toRecentCandles(candles);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);
  if (!rows.length) return null;

  const levels = getTradeLevels(nextTrade);
  const candleMin = Math.min(...rows.map((c) => c.low));
  const candleMax = Math.max(...rows.map((c) => c.high));
  const candleRange = Math.max(1e-6, candleMax - candleMin);
  const isFiniteLevel = (v) => Number.isFinite(Number(v));
  const tradeLevels = [visualTrade?.entry, visualTrade?.stopLoss, visualTrade?.takeProfit].map((v) => num(v, null));
  const hasAllTradeLevels = tradeLevels.every((v) => v !== null && isFiniteLevel(v));
  const [entry, stopLoss, takeProfit] = tradeLevels;
  const isLong = (visualTrade?.direction || "long") !== "short";
  const hasValidOrder = hasAllTradeLevels && (
    (isLong && stopLoss < entry && entry < takeProfit) ||
    (!isLong && takeProfit < entry && entry < stopLoss)
  );
  const hasInvalidTradeValues = Boolean(visualTrade) && !hasAllTradeLevels;

  // Collect ALL trade-related levels (packet levels + visual trade levels) for range check
  const allTradeLevelValues = [
    levels.trigger, levels.invalidation, levels.target,
    ...(hasAllTradeLevels ? tradeLevels : []),
  ].filter((v) => isFiniteLevel(v)).map((v) => Number(v));
  const allTradeMin = allTradeLevelValues.length ? Math.min(...allTradeLevelValues) : null;
  const allTradeMax = allTradeLevelValues.length ? Math.max(...allTradeLevelValues) : null;
  const tradeRange = allTradeMin !== null && allTradeMax !== null ? allTradeMax - allTradeMin : 0;

  // Smart scaling: only include trade levels when they don't distort candle readability.
  // TRADE_SCALE_THRESHOLD: trade range must be <= 1.5x candle range to include trade levels in scale.
  const TRADE_SCALE_THRESHOLD = 1.5;
  const outOfScale = tradeRange > candleRange * TRADE_SCALE_THRESHOLD;
  const canDrawTradeFill = Boolean(visualTrade && hasAllTradeLevels && hasValidOrder && !outOfScale);

  // When out-of-scale, scale chart ONLY to candles so they remain readable.
  // Out-of-range trade lines are still drawn by drawLine() which handles off-screen markers.
  const levelValues = outOfScale ? [] : allTradeLevelValues;
  const visibleMin = Math.min(candleMin, ...(levelValues.length ? levelValues : [candleMin]));
  const visibleMax = Math.max(candleMax, ...(levelValues.length ? levelValues : [candleMax]));
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
  const priceFromY = (py) => {
    const pctFromBottom = (height - inner.bottom - py) / Math.max(1, usableH);
    return chartMin + pctFromBottom * (chartMax - chartMin);
  };

  const direction = String(nextTrade?.direction || "").toLowerCase();
  const setup = String(nextTrade?.setup || "").toLowerCase();
  const zonePrice = levels.trigger ?? levels.invalidation;
  if (zonePrice !== null) {
    const zoneHeight = Math.max(8, usableH * 0.07);
    const zoneY = y(zonePrice) - zoneHeight / 2;
    ctx.fillStyle = direction === "short" ? "rgba(248, 113, 113, 0.08)" : "rgba(52, 211, 153, 0.08)";
    ctx.fillRect(inner.left, zoneY, usableW + 8, zoneHeight);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "10px sans-serif";
    ctx.fillText(
      setup === "failed_breakout_short" ? "await rejection confirmation" : "decision zone",
      inner.left + 6,
      zoneY - 4,
    );
  }

  if (canDrawTradeFill) {
    const entryY = y(entry);
    const stopY = y(stopLoss);
    const targetY = y(takeProfit);
    const profitTop = Math.min(entryY, targetY);
    const profitBottom = Math.max(entryY, targetY);
    const riskTop = Math.min(entryY, stopY);
    const riskBottom = Math.max(entryY, stopY);
    ctx.fillStyle = "rgba(34,197,94,0.12)";
    ctx.fillRect(inner.left, isLong ? profitTop : riskTop, usableW + 8, Math.abs((isLong ? profitBottom : riskBottom) - (isLong ? profitTop : riskTop)));
    ctx.fillStyle = "rgba(239,68,68,0.11)";
    ctx.fillRect(inner.left, isLong ? riskTop : profitTop, usableW + 8, Math.abs((isLong ? riskBottom : profitBottom) - (isLong ? riskTop : profitTop)));
  }

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

  const labelState = [];
  const resolveLabelY = (rawY) => {
    const minGap = 14;
    let yPos = rawY;
    let guard = 0;
    while (labelState.some((yPrev) => Math.abs(yPrev - yPos) < minGap) && guard < 8) {
      yPos += minGap * (guard % 2 === 0 ? 1 : -1);
      yPos = Math.max(inner.top + 8, Math.min(height - inner.bottom - 8, yPos));
      guard += 1;
    }
    labelState.push(yPos);
    return yPos;
  };

  const drawLine = (price, color, label, options = {}) => {
    const p = num(price, null);
    if (p === null) return;
    const pyRaw = y(p);
    const py = Math.max(inner.top, Math.min(height - inner.bottom, pyRaw));
    const xStart = inner.left;
    const xEnd = width - inner.right + 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = options.bold ? 1.6 : 1.1;
    ctx.globalAlpha = options.alpha ?? 0.9;
    ctx.beginPath();
    ctx.moveTo(xStart, py);
    ctx.lineTo(xEnd, py);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xStart, py);
    ctx.lineTo(xEnd, py);
    ctx.stroke();
    ctx.setLineDash([]);
    const labelY = resolveLabelY(py + 3);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(width - inner.right + 10, labelY - 9, 54, 12);
    ctx.fillStyle = color;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    const outOfView = pyRaw < inner.top || pyRaw > height - inner.bottom;
    ctx.fillText(outOfView ? `${label} ↕` : label, width - inner.right + 12, labelY);
    if (outOfView) {
      const markerY = pyRaw < inner.top ? inner.top : height - inner.bottom;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(xEnd - 4, markerY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawLine(levels.trigger, "#facc15", "trigger", { alpha: 0.35 });
  drawLine(levels.invalidation, "#ef4444", "invalidation", { alpha: 0.35 });
  drawLine(levels.target, "#22c55e", "target", { alpha: 0.35 });

  if (visualTrade) {
    drawLine(entry, "#f8fafc", "Entry", { bold: true });
    drawLine(stopLoss, "#ef4444", "SL", { bold: true });
    drawLine(takeProfit, "#22c55e", "TP", { bold: true });
    [entry, stopLoss, takeProfit].forEach((price, idx) => {
      if (!isFiniteLevel(price)) return;
      const lineY = Math.max(inner.top, Math.min(height - inner.bottom, y(price)));
      ctx.beginPath();
      ctx.fillStyle = idx === 0 ? "#e2e8f0" : idx === 1 ? "#f87171" : "#4ade80";
      ctx.arc(inner.left + usableW - 8, lineY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    if (hasInvalidTradeValues || !hasValidOrder) {
      ctx.fillStyle = "rgba(251, 146, 60, 0.9)";
      ctx.font = "11px sans-serif";
      ctx.fillText("Invalid trade level order", inner.left + 6, inner.top + 12);
    } else if (outOfScale) {
      ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
      ctx.font = "11px sans-serif";
      ctx.fillText("Trade box hidden: invalid or out-of-scale levels", inner.left + 6, inner.top + 12);
    }
    (Array.isArray(visualTrade?.markers) ? visualTrade.markers.slice(-3) : []).forEach((marker) => {
      const markerPrice = num(marker?.price, null);
      if (markerPrice === null) return;
      const markerY = Math.max(inner.top + 8, Math.min(height - inner.bottom - 8, y(markerPrice)));
      const markerColor = marker?.type === "target_hit" ? "#4ade80" : marker?.type === "stop_hit" ? "#f87171" : "#38bdf8";
      ctx.fillStyle = markerColor;
      ctx.beginPath();
      ctx.arc(inner.left + 8, markerY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "10px sans-serif";
      ctx.fillText(String(marker?.label || "marker"), inner.left + 16, markerY + 3);
    });
  }

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
  return {
    width,
    height,
    inner,
    y,
    priceFromY,
    chartMin,
    chartMax,
  };
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

function buildFinalVerdict(packet = {}, conflict = detectBiasConflict(packet), countdown = getTimeframeCountdown(5), trade = null) {
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
  if (trade) {
    const metrics = calcTradeMetrics(trade, packet?.market_state?.candles || []);
    if (metrics.rr < 1.2) {
      return { label: "WEAK R/R - WAIT", reason: "Trade structure exists, but reward/risk is below preferred threshold." };
    }
    if (metrics.slTight) {
      return { label: "TIGHT STOP WARNING", reason: "Stop distance is tight versus recent candle range." };
    }
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
  const activeTrade = _visualTrade || _systemTradeProposal || buildProposedTrade(packet);
  const activeStatus = evaluateTradeStatus(activeTrade, packet?.market_state?.candles || []);
  const metrics = calcTradeMetrics(activeTrade, packet?.market_state?.candles || []);
  const brainVoice = buildBrainVoice(packet, conflict, countdown, activeTrade);
  const verdict = buildFinalVerdict(packet, conflict, countdown, activeTrade);
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
          <p class="tiny muted tvm-chart-hint">Select E / SL / TP, then click the chart to place the level. You can still drag each handle.</p>
          <div class="tvm-chart-wrap" id="tvm-chart-wrap">
            <canvas id="tvm-chart" width="960" height="340"></canvas>
            <div class="tvm-trade-handles" id="tvm-trade-handles">
              <button type="button" class="tvm-handle tvm-handle-entry" data-trade-handle="entry" title="Drag Entry">E</button>
              <button type="button" class="tvm-handle tvm-handle-sl" data-trade-handle="stopLoss" title="Drag Stop Loss">SL</button>
              <button type="button" class="tvm-handle tvm-handle-tp" data-trade-handle="takeProfit" title="Drag Take Profit">TP</button>
            </div>
            <div class="tvm-handle-tooltip" id="tvm-handle-tooltip"></div>
          </div>
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
            <p class="tiny"><span id="tvm-trade-source-badge" class="badge badge-blue">${tradeSourceBadge(activeTrade, _systemTradeProposal || activeTrade)}</span></p>
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
          <div class="tvm-trade-editor">
            <div class="tiny"><strong>Visual Trade Editor</strong></div>
            <div class="tvm-trade-form">
              <label class="tiny">Direction
                <select id="tvm-trade-direction">
                  <option value="long" ${activeTrade.direction === "long" ? "selected" : ""}>Long</option>
                  <option value="short" ${activeTrade.direction === "short" ? "selected" : ""}>Short</option>
                </select>
              </label>
              <label class="tiny">Entry<input id="tvm-trade-entry" type="number" step="0.01" value="${activeTrade.entry.toFixed(2)}"></label>
              <label class="tiny">Stop Loss<input id="tvm-trade-sl" type="number" step="0.01" value="${activeTrade.stopLoss.toFixed(2)}"></label>
              <label class="tiny">Take Profit<input id="tvm-trade-tp" type="number" step="0.01" value="${activeTrade.takeProfit.toFixed(2)}"></label>
            </div>
            <div class="button-row compact">
              <button class="ghost" type="button" data-tvm-action="use-auto-trade">Use Auto Trade</button>
              <button class="ghost" type="button" data-tvm-action="apply-manual-trade">Apply Manual Trade</button>
              <button class="ghost" type="button" data-tvm-action="reset-system-trade">Reset to System Proposal</button>
              <button class="ghost" type="button" data-tvm-action="cancel-trade">Cancel Trade</button>
            </div>
          </div>
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
          <div class="tvm-sim-read">
            <div class="tiny"><strong>Live Trade Info</strong></div>
            ${activeTrade.source === "operator_manual" ? '<p class="tiny"><span class="badge badge-yellow">Operator Visual Trade</span></p>' : ""}
            <div class="tvm-plan-grid" id="tvm-live-trade-info">
              <div class="tvm-kv"><span>Status</span><strong>${prettyLabel(activeStatus)}</strong></div>
              <div class="tvm-kv"><span>Direction</span><strong>${prettyLabel(activeTrade.direction)}</strong></div>
              <div class="tvm-kv"><span>Entry</span><strong>${fmtPrice(activeTrade.entry)}</strong></div>
              <div class="tvm-kv"><span>Stop Loss</span><strong>${fmtPrice(activeTrade.stopLoss)}</strong></div>
              <div class="tvm-kv"><span>Take Profit</span><strong>${fmtPrice(activeTrade.takeProfit)}</strong></div>
              <div class="tvm-kv"><span>Risk / Reward</span><strong class="${metrics.rr < 1.2 ? "tvm-rr-weak" : ""}">${metrics.rr.toFixed(2)}</strong></div>
              <div class="tvm-kv"><span>Risk pts</span><strong>${metrics.risk.toFixed(2)}</strong></div>
              <div class="tvm-kv"><span>Reward pts</span><strong>${metrics.reward.toFixed(2)}</strong></div>
              <div class="tvm-kv"><span>Time in Trade</span><strong>${formatTradeClock(activeTrade.timeInTradeSec)}</strong></div>
              <div class="tvm-kv"><span>Candles in Trade</span><strong>${Math.max(0, num(activeTrade.candlesInTrade, 0))}</strong></div>
              <div class="tvm-kv"><span>MFE</span><strong>${num(activeTrade.mfe, 0).toFixed(2)}</strong></div>
              <div class="tvm-kv"><span>MAE</span><strong>${num(activeTrade.mae, 0).toFixed(2)}</strong></div>
              <div class="tvm-kv"><span>Source</span><strong>${prettyLabel(activeTrade.source)}</strong></div>
              <div class="tvm-kv"><span>Distance to Entry</span><strong>${metrics.distanceToEntry.toFixed(2)}</strong></div>
              <div class="tvm-kv"><span>Unrealized Progress</span><strong>${Math.round(metrics.progress * 100)}%</strong></div>
            </div>
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
  const activeTrade = _visualTrade || _systemTradeProposal || buildProposedTrade(packet);
  const riskEl = root.querySelector("#tvm-risk-banner");
  if (riskEl) {
    riskEl.className = `tvm-risk-banner tvm-risk-${risk.tone}`;
    riskEl.innerHTML = `<strong>${risk.title}</strong><div class="tiny">${risk.sub}</div>`;
  }
  const brainVoiceEl = root.querySelector("#tvm-brain-voice");
  if (brainVoiceEl) brainVoiceEl.textContent = buildBrainVoice(packet, conflict, countdown, activeTrade);
  const verdictEl = root.querySelector("#tvm-final-verdict");
  if (verdictEl) {
    const verdict = buildFinalVerdict(packet, conflict, countdown, activeTrade);
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
  const tradeBadgeEl = root.querySelector("#tvm-trade-source-badge");
  if (tradeBadgeEl) tradeBadgeEl.textContent = tradeSourceBadge(activeTrade, _systemTradeProposal || activeTrade);

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

function readTradeEditor(root, baseTrade = {}) {
  const direction = root.querySelector("#tvm-trade-direction")?.value || baseTrade.direction || "long";
  return {
    ...baseTrade,
    direction,
    entry: num(root.querySelector("#tvm-trade-entry")?.value, baseTrade.entry),
    stopLoss: num(root.querySelector("#tvm-trade-sl")?.value, baseTrade.stopLoss),
    takeProfit: num(root.querySelector("#tvm-trade-tp")?.value, baseTrade.takeProfit),
  };
}

function syncTradeEditor(root, trade = {}) {
  const d = root.querySelector("#tvm-trade-direction");
  const e = root.querySelector("#tvm-trade-entry");
  const sl = root.querySelector("#tvm-trade-sl");
  const tp = root.querySelector("#tvm-trade-tp");
  if (d) d.value = trade.direction;
  if (e) e.value = num(trade.entry, 0).toFixed(2);
  if (sl) sl.value = num(trade.stopLoss, 0).toFixed(2);
  if (tp) tp.value = num(trade.takeProfit, 0).toFixed(2);
}

function updateHandlePositions(root, trade = {}) {
  if (!root || !_chartLayout) return;
  const canvas = root.querySelector("#tvm-chart");
  const holder = root.querySelector("#tvm-trade-handles");
  if (!canvas || !holder) return;
  const canvasRect = canvas.getBoundingClientRect();
  const scaleY = canvasRect.height / Math.max(1, canvas.height);
  const scaleX = canvasRect.width / Math.max(1, canvas.width);
  const rightPx = (_chartLayout.width - _chartLayout.inner.right + 12) * scaleX;
  const setTop = (name, price) => {
    const el = holder.querySelector(`[data-trade-handle='${name}']`);
    if (!el) return;
    const y = _chartLayout.y(num(price, 0));
    const topPx = Math.max(8, Math.min(canvasRect.height - 8, y * scaleY));
    el.style.top = `${topPx}px`;
    el.style.left = `${rightPx}px`;
  };
  setTop("entry", trade.entry);
  setTop("stopLoss", trade.stopLoss);
  setTop("takeProfit", trade.takeProfit);
}

function updateTradeLearningRecord(trade = {}, packet = {}) {
  if (!trade || !["stopped", "target_hit", "cancelled"].includes(trade.status)) return;
  if (trade.learningRecorded) return;
  const learningRecord = buildLearningRecord(trade);
  _visualTradeLearningRecords = [..._visualTradeLearningRecords, learningRecord];
  const currentLearning = Array.isArray(packet?.learning_state?.visual_trade_journal)
    ? packet.learning_state.visual_trade_journal
    : [];
  updateCurrentPacket({
    visual_trade_learning_records: [..._visualTradeLearningRecords],
    learning_state: {
      ...(packet?.learning_state || {}),
      visual_trade_journal: [...currentLearning, learningRecord],
    },
  });
  _visualTrade = { ...trade, learningRecorded: true };
}

function refreshTradeVisualState(root, packet = {}, options = {}) {
  if (!_visualTrade || !root) return;
  const shouldSyncEditor = Boolean(options.syncEditor);
  const prevStatus = _visualTrade?.status;
  const resolved = resolveTradeState(_visualTrade, packet);
  if (resolved) _visualTrade = resolved;
  if (_visualTrade?.status && _visualTrade.status !== prevStatus) {
    if (_onTradeSync) _onTradeSync(_visualTrade, packet, "status_change");
    else console.warn("[Journal] Trade status changed without journal sync callback.", _visualTrade.id, prevStatus, _visualTrade.status);
  }
  updateTradeLearningRecord(_visualTrade, packet);
  if (shouldSyncEditor) syncTradeEditor(root, _visualTrade);
  _chartLayout = drawMiniChart(
    root.querySelector("#tvm-chart"),
    packet?.market_state?.candles || [],
    { ...(packet?.next_trade || {}), direction: getOperatorOverride(packet) || packet?.next_trade?.direction },
    _visualTrade,
  );
  updateHandlePositions(root, _visualTrade);
  updateLiveTradePanel(root, packet);
  updateNarrativePanels(root, packet);
}

function updateLiveTradePanel(root, packet = {}) {
  const holder = root.querySelector("#tvm-live-trade-info");
  if (!holder || !_visualTrade) return;
  const candles = packet?.market_state?.candles || [];
  const status = _visualTrade.status || evaluateTradeStatus(_visualTrade, candles);
  _visualTrade = { ..._visualTrade, status };
  const m = calcTradeMetrics(_visualTrade, candles);
  holder.innerHTML = `
    <div class="tvm-kv"><span>Status</span><strong>${prettyLabel(status)}</strong></div>
    <div class="tvm-kv"><span>Direction</span><strong>${prettyLabel(_visualTrade.direction)}</strong></div>
    <div class="tvm-kv"><span>Entry</span><strong>${fmtPrice(_visualTrade.entry)}</strong></div>
    <div class="tvm-kv"><span>Stop Loss</span><strong>${fmtPrice(_visualTrade.stopLoss)}</strong></div>
    <div class="tvm-kv"><span>Take Profit</span><strong>${fmtPrice(_visualTrade.takeProfit)}</strong></div>
    <div class="tvm-kv"><span>Risk / Reward</span><strong class="${m.rr < 1.2 ? "tvm-rr-weak" : ""}">${m.rr.toFixed(2)}</strong></div>
    <div class="tvm-kv"><span>Risk pts</span><strong>${m.risk.toFixed(2)}</strong></div>
    <div class="tvm-kv"><span>Reward pts</span><strong>${m.reward.toFixed(2)}</strong></div>
    <div class="tvm-kv"><span>Time in Trade</span><strong>${formatTradeClock(_visualTrade.timeInTradeSec)}</strong></div>
    <div class="tvm-kv"><span>Candles in Trade</span><strong>${Math.max(0, num(_visualTrade.candlesInTrade, 0))}</strong></div>
    <div class="tvm-kv"><span>MFE</span><strong>${num(_visualTrade.mfe, 0).toFixed(2)}</strong></div>
    <div class="tvm-kv"><span>MAE</span><strong>${num(_visualTrade.mae, 0).toFixed(2)}</strong></div>
    <div class="tvm-kv"><span>Source</span><strong>${prettyLabel(_visualTrade.source)}</strong></div>
    <div class="tvm-kv"><span>Distance to Entry</span><strong>${m.distanceToEntry.toFixed(2)}</strong></div>
    <div class="tvm-kv"><span>Unrealized Progress</span><strong>${Math.round(m.progress * 100)}%</strong></div>
  `;
}

function bindTradeHandleDrag(root, getPacket) {
  const holder = root.querySelector("#tvm-trade-handles");
  const canvas = root.querySelector("#tvm-chart");
  const tooltip = root.querySelector("#tvm-handle-tooltip");
  if (!holder || !canvas) return;
  const dragState = { handle: null };
  const setActiveHandle = (handle) => {
    _activePlacementHandle = ["entry", "stopLoss", "takeProfit"].includes(handle) ? handle : "entry";
    holder.querySelectorAll("[data-trade-handle]").forEach((el) => {
      el.classList.toggle("selected", el.dataset.tradeHandle === _activePlacementHandle);
    });
    canvas.classList.add("tvm-chart-place-mode");
  };
  const hideTooltip = () => {
    if (!tooltip) return;
    tooltip.classList.remove("show");
  };
  const toCanvasY = (clientY) => {
    const rect = canvas.getBoundingClientRect();
    const pct = (clientY - rect.top) / Math.max(1, rect.height);
    return Math.max(0, Math.min(canvas.height, pct * canvas.height));
  };
  const applyTradeLevel = (handle, price, event = null) => {
    _activeDragHandle = handle;
    const livePacket = getPacket();
    _visualTrade = applyHandleDrag({ ..._visualTrade, source: "operator_manual" }, handle, price, livePacket?.market_state?.candles || []);
    _visualTrade.status = "pending";
    _visualTrade.triggeredAt = null;
    _visualTrade.resolvedAt = null;
    _visualTrade.mfe = 0;
    _visualTrade.mae = 0;
    _visualTrade.candlesInTrade = 0;
    _visualTrade.timeInTradeSec = 0;
    syncTradeEditor(root, _visualTrade);
    updateCurrentPacket({ visual_trade: _visualTrade });
    _onTradeSync?.(_visualTrade, livePacket, "drag_adjust");
    refreshTradeVisualState(root, livePacket);
    if (!tooltip) return;
    const label = handle === "entry" ? "Entry" : handle === "stopLoss" ? "SL" : "TP";
    tooltip.textContent = `${label}: ${fmtPrice(_visualTrade[handle])}`;
    if (event) {
      const canvasRect = canvas.getBoundingClientRect();
      tooltip.style.top = `${Math.max(8, Math.min(canvas.clientHeight - 16, event.clientY - canvasRect.top))}px`;
    }
    tooltip.classList.add("show");
  };
  const onMove = (event) => {
    if (!dragState.handle || !_chartLayout || !_visualTrade) return;
    const canvasY = toCanvasY(event.clientY);
    const price = _chartLayout.priceFromY(canvasY);
    applyTradeLevel(dragState.handle, price, event);
  };
  const endDrag = () => {
    dragState.handle = null;
    _activeDragHandle = null;
    root.querySelectorAll("[data-trade-handle]").forEach((el) => el.classList.remove("dragging"));
    hideTooltip();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  };
  holder.querySelectorAll("[data-trade-handle]").forEach((handleEl) => {
    handleEl.addEventListener("pointerdown", (event) => {
      if (!_visualTrade) return;
      event.preventDefault();
      setActiveHandle(handleEl.dataset.tradeHandle);
      dragState.handle = handleEl.dataset.tradeHandle;
      handleEl.classList.add("dragging");
      handleEl.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", endDrag, { once: true });
    });
  });
  canvas.addEventListener("click", (event) => {
    if (!_visualTrade || !_chartLayout || dragState.handle) return;
    const canvasY = toCanvasY(event.clientY);
    const price = _chartLayout.priceFromY(canvasY);
    applyTradeLevel(_activePlacementHandle || "entry", price, event);
  });
  setActiveHandle(_activePlacementHandle);
}

export function openTradeVisualizerModal(brainPacket = null, controls = {}) {
  _onTradeSync = typeof controls?.onTradeSync === "function" ? controls.onTradeSync : null;
  const packet = brainPacket || getCurrentPacket() || {};
  _systemTradeProposal = buildProposedTrade(packet);
  _visualTradeLearningRecords = Array.isArray(packet?.visual_trade_learning_records) ? [...packet.visual_trade_learning_records] : [];
  _visualTrade = packet?.visual_trade ? { ...packet.visual_trade } : { ..._systemTradeProposal };
  _visualTrade = normalizeTradeLevels(_visualTrade, packet?.market_state?.candles || []).trade;
  _onTradeSync?.(_visualTrade, packet, "modal_open");
  if (_modalRoot) _modalRoot.remove();
  _modalRoot = document.createElement("div");
  _modalRoot.className = "tvm-root";
  _modalRoot.innerHTML = renderModal(packet);
  document.body.appendChild(_modalRoot);

  bindTradeHandleDrag(_modalRoot, () => getCurrentPacket() || packet);
  refreshTradeVisualState(_modalRoot, packet, { syncEditor: true });

  const onTradeInput = () => {
    if (!_modalRoot) return;
    const livePacket = getCurrentPacket() || packet;
    const nextManual = readTradeEditor(_modalRoot, _visualTrade || _systemTradeProposal);
    const source = nextManual.direction !== (_systemTradeProposal?.direction || nextManual.direction) ? "operator_override" : "operator_manual";
    _visualTrade = normalizeTradeLevels({ ...nextManual, source, status: "pending", triggeredAt: null, resolvedAt: null, mfe: 0, mae: 0 }, livePacket?.market_state?.candles || []).trade;
    updateCurrentPacket({ visual_trade: _visualTrade });
    _onTradeSync?.(_visualTrade, livePacket, "operator_edit");
    refreshTradeVisualState(_modalRoot, livePacket);
  };
  ["#tvm-trade-direction", "#tvm-trade-entry", "#tvm-trade-sl", "#tvm-trade-tp"].forEach((selector) => {
    const el = _modalRoot.querySelector(selector);
    if (el) el.addEventListener("input", onTradeInput);
  });

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
    } else if (action === "use-auto-trade" || action === "reset-system-trade") {
      _systemTradeProposal = buildProposedTrade(livePacket);
      _visualTrade = { ...normalizeTradeLevels(_systemTradeProposal, livePacket?.market_state?.candles || []).trade, source: "system_auto", status: "pending", triggeredAt: null, resolvedAt: null, mfe: 0, mae: 0 };
      syncTradeEditor(_modalRoot, _visualTrade);
      updateCurrentPacket({ visual_trade: _visualTrade });
      _onTradeSync?.(_visualTrade, livePacket, "use_auto_trade");
    } else if (action === "apply-manual-trade") {
      const edited = readTradeEditor(_modalRoot, _visualTrade || _systemTradeProposal);
      const source = edited.direction !== (_systemTradeProposal?.direction || edited.direction) ? "operator_override" : "operator_manual";
      _visualTrade = { ...normalizeTradeLevels(edited, livePacket?.market_state?.candles || []).trade, source, status: "pending", createdAt: _visualTrade?.createdAt || Date.now(), triggeredAt: null, resolvedAt: null, mfe: 0, mae: 0 };
      updateCurrentPacket({ visual_trade: _visualTrade });
      _onTradeSync?.(_visualTrade, livePacket, "apply_manual_trade");
    } else if (action === "cancel-trade") {
      if (_visualTrade) {
        _visualTrade = { ..._visualTrade, status: "cancelled", resolvedAt: Date.now(), markers: [...(_visualTrade.markers || []), { type: "cancelled", ts: Date.now(), label: "Trade Cancelled", price: _visualTrade.entry }] };
        updateCurrentPacket({ visual_trade: _visualTrade });
        _onTradeSync?.(_visualTrade, livePacket, "cancel_trade");
      }
    }
    window.setTimeout(() => {
      const refreshed = getCurrentPacket();
      if (!refreshed || !_modalRoot) return;
      updateSimulationBars(_modalRoot, refreshed?.next_trade || {}, refreshed?.market_state?.candles || []);
      refreshTradeVisualState(_modalRoot, refreshed, { syncEditor: true });
    }, 120);
  });

  _refreshTimer = window.setInterval(() => {
    if (!_modalRoot) return;
    const livePacket = getCurrentPacket();
    if (!livePacket) return;
    updateSimulationBars(_modalRoot, livePacket?.next_trade || {}, livePacket?.market_state?.candles || []);
    refreshTradeVisualState(_modalRoot, livePacket);
  }, 1000);

  return { close };
}
