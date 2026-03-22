import { buildFuturesPolicyFeatures } from "./futuresPolicyFeatures.js";
import { evaluateFuturesPolicy } from "./futuresPolicyEngine.js";
import { replayFuturesDecision } from "./futuresReplay.js";

const DEFAULT_MAX_HISTORY = 400;

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createRecordId(candle, candleIndex) {
  return ["live-shadow", candle.source, candle.asset, candle.timeframe, candle.id || candle.timestamp || candleIndex].join(":");
}

function buildDefaultOutcome(action) {
  if (action === "NO_TRADE") {
    return {
      status: "resolved",
      resolutionTimestamp: Date.now(),
      result: "skipped",
      pnlPct: 0,
      rMultiple: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      barsElapsed: 0,
      resolutionReason: "no-trade-policy",
    };
  }
  return {
    status: "pending",
    resolutionTimestamp: null,
    result: null,
    pnlPct: null,
    rMultiple: null,
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    barsElapsed: null,
    resolutionReason: null,
  };
}

function mapReplayOutcome(replay = {}) {
  const type = String(replay.outcomeType || "");
  if (type === "tp") return "win";
  if (type === "sl") return "loss";
  if (type === "timeout") return Math.abs(Number(replay.pnlR || 0)) < 0.02 ? "flat" : (Number(replay.pnlR || 0) > 0 ? "win" : "loss");
  return "flat";
}

function hasResolutionSignal(record, candles, maxHoldBars) {
  const action = record?.policy?.action;
  if (action === "NO_TRADE") return { resolvable: true, reason: "no-trade" };
  const entryIndex = Number(record?.candleIndex);
  if (!Number.isInteger(entryIndex) || entryIndex < 0) return { resolvable: false };
  if (candles.length <= entryIndex + 1) return { resolvable: false };

  const plan = record.plan || {};
  const stop = toNumber(plan.stopLoss, null);
  const target = toNumber(plan.takeProfit, null);
  const hasStops = Number.isFinite(stop) && Number.isFinite(target);
  const future = candles.slice(entryIndex + 1, entryIndex + 1 + maxHoldBars);

  for (const candle of future) {
    const high = toNumber(candle.high, null);
    const low = toNumber(candle.low, null);
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    const hitTp = action === "LONG" ? high >= target : low <= target;
    const hitSl = action === "LONG" ? low <= stop : high >= stop;
    if (hasStops && (hitTp || hitSl)) return { resolvable: true, reason: "tp-sl-hit" };
  }

  if (future.length >= maxHoldBars) return { resolvable: true, reason: "hold-expired" };
  return { resolvable: false };
}

export function createLiveShadowMonitor(options = {}) {
  const maxHistory = Math.max(100, Number(options.maxHistory) || DEFAULT_MAX_HISTORY);
  let records = [];
  const pendingIndex = new Map();

  function syncPendingIndex() {
    pendingIndex.clear();
    records.forEach((record) => {
      if (record?.outcome?.status === "pending") pendingIndex.set(record.id, true);
    });
  }

  function setRecords(nextRecords = []) {
    records = Array.isArray(nextRecords)
      ? [...nextRecords].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, maxHistory)
      : [];
    syncPendingIndex();
    return records;
  }

  function getRecords() {
    return [...records];
  }

  function upsertRecord(record) {
    const idx = records.findIndex((row) => row.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records = [record, ...records];
    records = records.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, maxHistory);
    if (record?.outcome?.status === "pending") pendingIndex.set(record.id, true);
    else pendingIndex.delete(record.id);
  }

  // Creates the normalized live-shadow record at candle close.
  function createSnapshot({ candle, candles, neuronActivations = [], seededPatterns = [], policyConfig = {}, sourceStatus = null }) {
    if (!candle?.closed) return null;
    const candleIndex = candles.findIndex((row) => row.id === candle.id);
    if (candleIndex < 0) return null;

    const liveSignal = {
      id: `live_shadow_${candle.id}`,
      timestamp: candle.timestamp,
      asset: candle.asset,
      timeframe: candle.timeframe,
      direction: "CALL",
      marketRegime: "live-observer",
      entryPrice: candle.close,
      contextScore: 50,
      radarScore: 50,
      freshnessScore: 50,
      patternMeta: { robustness: { robustnessScore: 55, overfitRisk: "low" } },
    };

    const features = buildFuturesPolicyFeatures({
      signal: liveSignal,
      candles,
      neuronActivations,
      seededPatterns,
      candleIndex,
    });

    const decision = evaluateFuturesPolicy({
      state: features.state,
      candles,
      config: policyConfig,
    });

    const id = createRecordId(candle, candleIndex);
    if (records.some((row) => row.id === id)) return null;

    return {
      id,
      timestamp: new Date(candle.timestamp).getTime(),
      symbol: candle.asset,
      timeframe: candle.timeframe,
      source: candle.source,
      candleIndex,
      sequence: candleIndex,
      market: {
        close: toNumber(candle.close, null),
        open: toNumber(candle.open, null),
        high: toNumber(candle.high, null),
        low: toNumber(candle.low, null),
        candleStatus: candle.closed ? "closed" : "open",
      },
      connection: {
        connected: Boolean(sourceStatus?.connected),
        reconnectAttempts: Number(sourceStatus?.reconnectAttempts || 0),
        streamStatus: sourceStatus?.statusType || "unknown",
      },
      policy: {
        strategyId: "live-shadow-policy",
        strategyName: "Live Shadow Policy",
        action: decision.action,
        confidence: toNumber(decision.confidence, 0),
        reason: decision.reason || "",
        actionScores: decision.actionScores || {},
        thesisTags: decision.evidence?.regimeFlags || [],
        warnings: decision.evidence?.warningFlags || [],
        supportingEvidence: decision.evidence || {},
      },
      plan: {
        entryType: decision.action === "NO_TRADE" ? null : "shadow-close",
        referencePrice: toNumber(decision.executionPlan?.entryPrice, toNumber(candle.close, null)),
        stopLoss: toNumber(decision.executionPlan?.stopLoss, null),
        takeProfit: toNumber(decision.executionPlan?.takeProfit, null),
        riskReward: toNumber(decision.executionPlan?.riskReward, null),
        invalidation: decision.executionPlan?.entryZone ? `entry-zone:${JSON.stringify(decision.executionPlan.entryZone)}` : null,
      },
      stateSummary: {
        activeNeurons: features.state?.activeNeuronIds || [],
        neuronCount: Number(features.state?.neuronCount || 0),
        contextScore: toNumber(features.state?.contextScore, null),
        radarScore: toNumber(features.state?.radarScore, null),
        marketRegime: features.state?.marketRegime || null,
        directionBias: features.state?.directionBias > 0 ? "bullish" : features.state?.directionBias < 0 ? "bearish" : "neutral",
        seededMatches: features.state?.seededMatches || [],
        nearSupport: typeof features.state?.nearSupport === "boolean" ? features.state.nearSupport : null,
        nearResistance: typeof features.state?.nearResistance === "boolean" ? features.state.nearResistance : null,
      },
      outcome: buildDefaultOutcome(decision.action),
      _meta: {
        policyVersion: decision.policyVersion,
        createdAt: new Date().toISOString(),
      },
    };
  }

  // Checks and resolves pending records when enough forward candles exist.
  function resolvePending({ candles = [], maxHoldBars = 24 }) {
    const pendingIds = Array.from(pendingIndex.keys());
    if (!pendingIds.length) return [];
    const resolved = [];

    pendingIds.forEach((id) => {
      const idx = records.findIndex((row) => row.id === id);
      if (idx < 0) {
        pendingIndex.delete(id);
        return;
      }

      const record = records[idx];
      const guard = hasResolutionSignal(record, candles, maxHoldBars);
      if (!guard.resolvable) return;

      const replay = replayFuturesDecision({
        action: record.policy.action,
        executionPlan: {
          entryPrice: record.plan.referencePrice,
          stopLoss: record.plan.stopLoss,
          takeProfit: record.plan.takeProfit,
        },
      }, candles, record.candleIndex, { maxBarsHold: maxHoldBars });

      const next = {
        ...record,
        outcome: {
          status: "resolved",
          resolutionTimestamp: Date.now(),
          result: mapReplayOutcome(replay),
          pnlPct: toNumber(replay.pnlPct, 0),
          rMultiple: toNumber(replay.pnlR, 0),
          maxFavorableExcursion: toNumber(replay.maxFavorableExcursion, 0),
          maxAdverseExcursion: toNumber(replay.maxAdverseExcursion, 0),
          barsElapsed: Number(replay.barsToResolution || 0),
          resolutionReason: replay.outcomeType || guard.reason || "resolved",
        },
      };

      records[idx] = next;
      pendingIndex.delete(id);
      resolved.push(next);
    });

    records = records.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    return resolved;
  }

  return {
    setRecords,
    getRecords,
    createSnapshot,
    upsertRecord,
    resolvePending,
    getPendingCount: () => pendingIndex.size,
  };
}
