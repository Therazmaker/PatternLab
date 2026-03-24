import { replayFuturesDecision } from "./futuresReplay.js";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapReplayOutcome(replay = {}) {
  const type = String(replay.outcomeType || "");
  if (type === "tp") return "win";
  if (type === "sl") return "loss";
  if (type === "timeout") return Math.abs(Number(replay.pnlR || 0)) < 0.02 ? "flat" : (Number(replay.pnlR || 0) > 0 ? "win" : "loss");
  return "flat";
}

function hasResolutionSignal(record, candles, maxHoldBars) {
  const entryIndex = Number(record?.candleIndex);
  if (record?.policy?.action === "NO_TRADE") return { resolvable: true, reason: "no-trade" };
  if (!Number.isInteger(entryIndex) || entryIndex < 0 || candles.length <= entryIndex + 1) return { resolvable: false };
  if (candles.length >= entryIndex + maxHoldBars) return { resolvable: true, reason: "hold-expired" };
  return { resolvable: false };
}

export function resolveLiveShadowPending({ records = [], pendingIds = [], candles = [], maxHoldBars = 24 } = {}) {
  const resolved = [];
  const nextRecords = [...records];

  pendingIds.forEach((id) => {
    const idx = nextRecords.findIndex((row) => row.id === id);
    if (idx < 0) return;
    const record = nextRecords[idx];
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
        pnl: toNumber(replay.pnlPct, 0),
        rMultiple: toNumber(replay.pnlR, 0),
        barsElapsed: Number(replay.barsToResolution || 0),
        resolutionReason: replay.outcomeType || guard.reason || "resolved",
      },
    };
    nextRecords[idx] = next;
    resolved.push(next);
  });

  return { nextRecords, resolved };
}
