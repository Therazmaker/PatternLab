import {
  addBrainEvent,
  addBrainGrowthPoint,
  getBrainEvents,
  getBrainGrowthSeries,
  getBrainState,
  getBrainStats,
  openIndexedDb,
  putBrainState,
  putBrainStats,
} from "../storage/indexeddb-store.js";

const BRAIN_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function createEmptyStats() {
  return {
    key: "global",
    trainedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    neuronsSavedCount: 0,
    lastTrainLoss: null,
    lastTrainAcc: null,
    lastUpdatedAt: null,
    lastActivityAt: null,
    patternStats: {},
    reasonStats: {
      skip: {},
      loss: {},
      success: {},
    },
  };
}

function createEmptyState() {
  return {
    key: "main",
    version: BRAIN_VERSION,
    initializedAt: nowIso(),
    lastHydratedAt: null,
    lastSessionId: null,
    brainReady: false,
  };
}

function normalizePatternBucket(bucket = {}) {
  return {
    patternName: bucket.patternName || "unknown",
    totalSamples: Number(bucket.totalSamples || 0),
    wins: Number(bucket.wins || 0),
    losses: Number(bucket.losses || 0),
    winRate: Number(bucket.winRate || 0),
    learnedCount: Number(bucket.learnedCount || 0),
    skippedCount: Number(bucket.skippedCount || 0),
    errorCount: Number(bucket.errorCount || 0),
  };
}

export async function createBrainPanelStore() {
  const db = await openIndexedDb();

  async function hydrate() {
    const [statsRow, stateRow, events, growth] = await Promise.all([
      getBrainStats(db),
      getBrainState(db),
      getBrainEvents(db, 80),
      getBrainGrowthSeries(db, 300),
    ]);

    const hasData = Boolean(statsRow || (events && events.length) || (growth && growth.length));

    if (!hasData) {
      const freshStats = createEmptyStats();
      const freshState = {
        ...createEmptyState(),
        lastHydratedAt: nowIso(),
      };
      await Promise.all([
        putBrainStats(db, freshStats),
        putBrainState(db, freshState),
      ]);
      console.info("[BrainPanel] no prior brain data found, initialized empty state");
      return {
        stats: freshStats,
        state: freshState,
        events: [],
        growth: [],
      };
    }

    const nextState = {
      ...createEmptyState(),
      ...(stateRow || {}),
      version: BRAIN_VERSION,
      lastHydratedAt: nowIso(),
      brainReady: true,
    };
    await putBrainState(db, nextState);
    console.info("[BrainPanel] hydrated from IndexedDB");
    return {
      stats: { ...createEmptyStats(), ...(statsRow || {}) },
      state: nextState,
      events: Array.isArray(events) ? events : [],
      growth: Array.isArray(growth) ? growth : [],
    };
  }

  async function persistEvent(event = {}, snapshot = {}) {
    const timestamp = event.timestamp || nowIso();
    const safeType = String(event.type || "diagnosis");
    const reasonCode = event.reasonCode || null;
    const outcome = event.outcome || null;

    const nextStats = {
      ...createEmptyStats(),
      ...(snapshot.stats || {}),
      patternStats: { ...(snapshot.stats?.patternStats || {}) },
      reasonStats: {
        skip: { ...(snapshot.stats?.reasonStats?.skip || {}) },
        loss: { ...(snapshot.stats?.reasonStats?.loss || {}) },
        success: { ...(snapshot.stats?.reasonStats?.success || {}) },
      },
    };

    if (safeType === "trained") nextStats.trainedCount += 1;
    if (safeType === "skipped") nextStats.skippedCount += 1;
    if (safeType === "error") nextStats.errorCount += 1;
    if (safeType === "neuron_saved") nextStats.neuronsSavedCount += 1;

    if (safeType === "trained") {
      nextStats.lastTrainLoss = Number.isFinite(Number(event.loss)) ? Number(event.loss) : nextStats.lastTrainLoss;
      nextStats.lastTrainAcc = Number.isFinite(Number(event.acc)) ? Number(event.acc) : nextStats.lastTrainAcc;
    }

    const patternName = String(event.patternName || "unknown");
    const prevPattern = normalizePatternBucket(nextStats.patternStats[patternName]);
    prevPattern.patternName = patternName;
    if (["trained", "skipped", "error"].includes(safeType)) prevPattern.totalSamples += 1;
    if (safeType === "trained") prevPattern.learnedCount += 1;
    if (safeType === "skipped") prevPattern.skippedCount += 1;
    if (safeType === "error") prevPattern.errorCount += 1;
    if (outcome === "win") prevPattern.wins += 1;
    if (outcome === "loss") prevPattern.losses += 1;
    const resolved = prevPattern.wins + prevPattern.losses;
    prevPattern.winRate = resolved > 0 ? prevPattern.wins / resolved : 0;
    nextStats.patternStats[patternName] = prevPattern;

    if (safeType === "skipped") {
      const key = String(reasonCode || "unspecified_skip");
      nextStats.reasonStats.skip[key] = Number(nextStats.reasonStats.skip[key] || 0) + 1;
    }
    if (outcome === "loss") {
      const key = String(reasonCode || "unspecified_loss");
      nextStats.reasonStats.loss[key] = Number(nextStats.reasonStats.loss[key] || 0) + 1;
    }
    if (safeType === "trained" && outcome === "win") {
      const key = String(reasonCode || "fit_success");
      nextStats.reasonStats.success[key] = Number(nextStats.reasonStats.success[key] || 0) + 1;
    }

    nextStats.lastUpdatedAt = timestamp;
    nextStats.lastActivityAt = timestamp;

    const currentState = {
      ...createEmptyState(),
      ...(snapshot.state || {}),
      version: BRAIN_VERSION,
      brainReady: true,
      lastSessionId: snapshot.state?.lastSessionId || `session_${Date.now()}`,
    };

    const normalizedEvent = {
      timestamp,
      type: safeType,
      patternName,
      outcome,
      reasonCode,
      loss: Number.isFinite(Number(event.loss)) ? Number(event.loss) : null,
      acc: Number.isFinite(Number(event.acc)) ? Number(event.acc) : null,
      meta: event.meta && typeof event.meta === "object" ? event.meta : {},
      details: event.details || "",
    };

    await addBrainEvent(db, normalizedEvent);
    await putBrainStats(db, nextStats);
    await putBrainState(db, currentState);

    if (["trained", "skipped", "error", "neuron_saved"].includes(safeType)) {
      await addBrainGrowthPoint(db, {
        timestamp,
        trainedTotal: nextStats.trainedCount,
        skippedTotal: nextStats.skippedCount,
        errorTotal: nextStats.errorCount,
        neuronsTotal: nextStats.neuronsSavedCount,
        learnedPatternsCount: Object.values(nextStats.patternStats || {}).filter((row) => Number(row.learnedCount || 0) > 0).length,
        optionalAverageWinRate: (() => {
          const rows = Object.values(nextStats.patternStats || {});
          if (!rows.length) return null;
          const valid = rows.filter((row) => Number(row.wins || 0) + Number(row.losses || 0) > 0);
          if (!valid.length) return null;
          const avg = valid.reduce((acc, row) => acc + Number(row.winRate || 0), 0) / valid.length;
          return Number.isFinite(avg) ? avg : null;
        })(),
      });
      console.info("[BrainPanel] growth point added");
    }

    console.info(`[BrainPanel] event persisted: ${safeType}`);
    console.info("[BrainPanel] stats updated");

    return {
      stats: nextStats,
      state: currentState,
      events: await getBrainEvents(db, 80),
      growth: await getBrainGrowthSeries(db, 300),
    };
  }

  return {
    hydrate,
    persistEvent,
  };
}
