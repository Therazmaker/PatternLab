const MAX_JOURNAL_ROWS = 1200;

function nowIso() {
  return new Date().toISOString();
}

function toFiniteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toLifecycleStatus(status = "planned") {
  const raw = String(status || "").toLowerCase();
  if (raw === "invalid") return "invalid";
  if (["planned", "pending"].includes(raw)) return "planned";
  if (raw === "triggered") return "triggered";
  if (raw === "active") return "active";
  if (["closed", "stopped", "target_hit"].includes(raw)) return "closed";
  if (raw === "cancelled") return "cancelled";
  return "planned";
}

function hasInvalidOrdering(direction = "long", entry = null, stopLoss = null, takeProfit = null) {
  if ([entry, stopLoss, takeProfit].every((v) => v === null || v === undefined)) return false;
  if (![entry, stopLoss, takeProfit].every((v) => Number.isFinite(v))) return true;
  if (direction === "short") return !(takeProfit < entry && entry < stopLoss);
  return !(stopLoss < entry && entry < takeProfit);
}

function detectTradeInvalidity(trade = {}) {
  const direction = normalizeDirection(trade.direction);
  const entry = toFiniteNumber(trade.entry, null);
  const stopLoss = toFiniteNumber(trade.stopLoss ?? trade.stop_loss, null);
  const takeProfit = toFiniteNumber(trade.takeProfit ?? trade.take_profit, null);
  const riskReward = toFiniteNumber(trade.riskReward, null);
  const invalidReasons = [];
  if (entry === 0) invalidReasons.push("entry_zero");
  if (takeProfit !== null && takeProfit < 0) invalidReasons.push("tp_negative");
  if (riskReward !== null && riskReward > 100) invalidReasons.push("rr_extreme");
  if (hasInvalidOrdering(direction, entry, stopLoss, takeProfit)) invalidReasons.push("invalid_ordering");
  return invalidReasons;
}

function toOutcome(status = "", explicitOutcome = null) {
  if (explicitOutcome === "win" || explicitOutcome === "loss" || explicitOutcome === "cancelled") return explicitOutcome;
  const raw = String(status || "").toLowerCase();
  if (raw === "target_hit") return "win";
  if (raw === "stopped") return "loss";
  if (raw === "cancelled") return "cancelled";
  return null;
}

function normalizeDirection(value = "long") {
  return String(value || "").toLowerCase() === "short" ? "short" : "long";
}

function normalizeSource(value = "brain_auto") {
  const raw = String(value || "").toLowerCase();
  if (raw === "operator_manual") return "operator_manual";
  if (raw === "operator_adjusted" || raw === "operator_override") return "operator_adjusted";
  if (raw === "brain_auto" || raw === "system_auto") return "brain_auto";
  return "brain_auto";
}

function hasActivationMarker(markers = []) {
  if (!Array.isArray(markers)) return false;
  return markers.some((marker) => {
    const raw = String(marker?.type || marker?.kind || marker?.event || marker?.name || "").toLowerCase();
    return raw.includes("activated") || raw.includes("trigger");
  });
}

function inferRiskReward(trade = {}) {
  const existing = toFiniteNumber(trade.riskReward, null);
  if (existing !== null) return Number(existing.toFixed(4));
  const entry = toFiniteNumber(trade.entry, null);
  const stopLoss = toFiniteNumber(trade.stopLoss ?? trade.stop_loss, null);
  const takeProfit = toFiniteNumber(trade.takeProfit ?? trade.take_profit, null);
  if (entry === null || stopLoss === null || takeProfit === null) return null;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  if (risk <= 1e-9) return null;
  return Number((reward / risk).toFixed(4));
}

function ensureTradeId(rawTrade = {}) {
  return rawTrade.id
    || rawTrade.trade_id
    || rawTrade.tradeId
    || `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeJournalTrade(brainTrade = {}, context = {}) {
  const id = ensureTradeId(brainTrade);
  const outcome = toOutcome(brainTrade.status, brainTrade.outcome ?? brainTrade.result ?? context.outcome ?? null);
  const now = nowIso();
  const source = normalizeSource(brainTrade.source || context.source || "brain_auto");
  const invalidReasons = detectTradeInvalidity(brainTrade);
  const forcedInvalid = invalidReasons.length > 0;
  const initialStatus = brainTrade.status || context.status || (brainTrade.result ? "closed" : "planned");
  const status = toLifecycleStatus(forcedInvalid ? "invalid" : initialStatus);
  const triggeredAt = brainTrade.triggeredAt || brainTrade.triggered_at || context.triggeredAt || null;
  const resolvedAt = brainTrade.resolvedAt || brainTrade.resolved_at || context.resolvedAt || null;
  const baseMeta = brainTrade.tradeMeta && typeof brainTrade.tradeMeta === "object" ? brainTrade.tradeMeta : {};
  const triggeredCandleIndex = toFiniteNumber(brainTrade.triggeredCandleIndex ?? baseMeta.triggeredCandleIndex, null);
  const resolvedCandleIndex = toFiniteNumber(brainTrade.resolvedCandleIndex ?? baseMeta.resolvedCandleIndex, null);
  const candlesInTradeRaw = toFiniteNumber(brainTrade.candlesInTrade ?? brainTrade.resolution_candles, null);
  const candlesInTrade = (
    Number.isFinite(candlesInTradeRaw)
      ? candlesInTradeRaw
      : (Number.isFinite(triggeredCandleIndex) && Number.isFinite(resolvedCandleIndex) ? Math.max(0, resolvedCandleIndex - triggeredCandleIndex) : null)
  );
  const normalizedCandles = (
    Number.isFinite(candlesInTrade)
      ? ((Number.isFinite(triggeredCandleIndex) && Number.isFinite(resolvedCandleIndex) && resolvedCandleIndex > triggeredCandleIndex)
        ? Math.max(1, candlesInTrade)
        : Math.max(0, candlesInTrade))
      : null
  );
  const instantResolution = Boolean(baseMeta.instant_resolution || (triggeredAt && resolvedAt && triggeredAt === resolvedAt));
  const mfeRaw = toFiniteNumber(brainTrade.mfe, null);
  const maeRaw = toFiniteNumber(brainTrade.mae, null);
  const mfe = Number.isFinite(mfeRaw) ? Math.max(0, mfeRaw) : (status === "closed" && Number.isFinite(normalizedCandles) && normalizedCandles >= 1 ? 0 : null);
  const mae = Number.isFinite(maeRaw) ? Math.max(0, maeRaw) : (status === "closed" && Number.isFinite(normalizedCandles) && normalizedCandles >= 1 ? 0 : null);
  return {
    id,
    mode: "paper",
    source,
    status,
    outcome,
    setup: brainTrade.setup ?? brainTrade.setup_name ?? context.setup ?? null,
    direction: normalizeDirection(brainTrade.direction ?? context.direction ?? "long"),
    entry: toFiniteNumber(brainTrade.entry, null),
    stopLoss: toFiniteNumber(brainTrade.stopLoss ?? brainTrade.stop_loss, null),
    takeProfit: toFiniteNumber(brainTrade.takeProfit ?? brainTrade.take_profit, null),
    riskReward: inferRiskReward(brainTrade),
    confidence: toFiniteNumber(brainTrade.confidence, null),
    createdAt: brainTrade.createdAt || brainTrade.created_at || brainTrade.ts || context.createdAt || now,
    triggeredAt,
    resolvedAt,
    timeInTradeSec: toFiniteNumber(brainTrade.timeInTradeSec ?? brainTrade.time_in_trade_sec, null),
    candlesInTrade: normalizedCandles,
    mfe,
    mae,
    notes: brainTrade.notes || context.notes || "",
    operatorAdjusted: Boolean(brainTrade.operatorAdjusted ?? source === "operator_adjusted"),
    contextSnapshot: brainTrade.contextSnapshot && typeof brainTrade.contextSnapshot === "object" ? brainTrade.contextSnapshot : (context.contextSnapshot && typeof context.contextSnapshot === "object" ? context.contextSnapshot : {}),
    tradeMeta: {
      ...baseMeta,
      triggeredCandleIndex,
      resolvedCandleIndex,
      markers: Array.isArray(baseMeta.markers) ? baseMeta.markers : (Array.isArray(brainTrade.markers) ? brainTrade.markers : []),
      learningRecorded: Boolean(baseMeta.learningRecorded ?? brainTrade.learningRecorded),
      instant_resolution: instantResolution,
    },
    invalidReasons,
    learningExcluded: forcedInvalid || Boolean(brainTrade.learningExcluded),
    updatedAt: now,
    lifecycleHistory: [],
  };
}

function mergeJournalTrade(existing = null, incoming = {}) {
  if (!existing) return incoming;
  const merged = {
    ...existing,
    ...incoming,
    contextSnapshot: {
      ...(existing.contextSnapshot || {}),
      ...(incoming.contextSnapshot || {}),
    },
    tradeMeta: {
      ...(existing.tradeMeta || {}),
      ...(incoming.tradeMeta || {}),
    },
    lifecycleHistory: Array.isArray(existing.lifecycleHistory) ? [...existing.lifecycleHistory] : [],
    createdAt: existing.createdAt || incoming.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  if (existing.status !== incoming.status) {
    const markers = merged.tradeMeta?.markers || [];
    const hasActivation = hasActivationMarker(markers) || Boolean(merged.triggeredAt);
    if (existing.status === "planned" && incoming.status === "closed" && hasActivation) {
      merged.lifecycleHistory.unshift(
        { from: "active", to: "closed", ts: merged.updatedAt },
        { from: "planned", to: "active", ts: merged.updatedAt },
      );
    } else {
      merged.lifecycleHistory.unshift({
        from: existing.status,
        to: incoming.status,
        ts: merged.updatedAt,
      });
    }
    merged.lifecycleHistory = merged.lifecycleHistory.slice(0, 40);
  }
  return merged;
}

export function createBrainTradeJournal(seed = [], options = {}) {
  const rows = Array.isArray(seed) ? [...seed] : [];
  const onChange = typeof options?.onChange === "function" ? options.onChange : null;

  function publish() {
    if (onChange) onChange(getAll());
  }

  function append(entry = {}) {
    return upsertJournalTrade(normalizeJournalTrade(entry));
  }

  function upsertJournalTrade(normalizedTrade = {}) {
    const trade = normalizeJournalTrade(normalizedTrade);
    const idx = rows.findIndex((row) => row?.id === trade.id);
    if (idx < 0) {
      rows.unshift(trade);
      if (rows.length > MAX_JOURNAL_ROWS) rows.length = MAX_JOURNAL_ROWS;
      publish();
      return trade;
    }
    const next = mergeJournalTrade(rows[idx], trade);
    rows[idx] = next;
    publish();
    return next;
  }

  function list(limit = 100) {
    return rows.slice(0, Math.max(0, Number(limit) || 0));
  }

  function getAll() {
    return [...rows];
  }

  function hydrate(nextSeed = []) {
    rows.length = 0;
    rows.push(...(Array.isArray(nextSeed) ? nextSeed.map((row) => normalizeJournalTrade(row)) : []));
    publish();
  }

  return {
    append,
    hydrate,
    list,
    getAll,
    normalizeJournalTrade,
    upsertJournalTrade,
  };
}
