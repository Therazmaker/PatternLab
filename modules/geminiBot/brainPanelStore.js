import {
  addBrainEvent,
  addBrainGrowthPoint,
  addModelRunHistory,
  getBrainEvents,
  getBrainGrowthSeries,
  getBrainState,
  getModelStats,
  getModelVersions,
  getTrainingQueueState,
  openIndexedDb,
  putBrainState,
  putModelStats,
  putModelVersions,
  putTrainingQueueState,
} from "../storage/indexeddb-store.js";

const BRAIN_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

function createEmptyStats() {
  return {
    key: "global",
    trainedCount: 0,
    skippedCount: 0,
    queuedCount: 0,
    errorCount: 0,
    neuronsSavedCount: 0,
    lastTrainLoss: null,
    lastTrainAcc: null,
    lastUpdatedAt: null,
    lastActivityAt: null,
    tradeOutcomeStats: { win: 0, loss: 0, n_a: 0 },
    patternStats: {},
    modelStats: {},
    reasonStats: {
      training: {},
      tradeLoss: {},
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
    queuedCount: Number(bucket.queuedCount || 0),
    errorCount: Number(bucket.errorCount || 0),
  };
}

function normalizeModelBucket(bucket = {}, modelTarget = "unknown") {
  return {
    modelTarget,
    trainedCount: Number(bucket.trainedCount || 0),
    skippedCount: Number(bucket.skippedCount || 0),
    queuedCount: Number(bucket.queuedCount || 0),
    errorCount: Number(bucket.errorCount || 0),
    totalSamples: Number(bucket.totalSamples || 0),
  };
}

export async function createBrainPanelStore() {
  const db = await openIndexedDb();

  async function hydrate() {
    const [statsRow, stateRow, events, growth, queueState, modelVersions] = await Promise.all([
      getModelStats(db),
      getBrainState(db),
      getBrainEvents(db, 80),
      getBrainGrowthSeries(db, 300),
      getTrainingQueueState(db),
      getModelVersions(db),
    ]);

    const hasData = Boolean(statsRow || (events && events.length) || (growth && growth.length));

    if (!hasData) {
      const freshStats = createEmptyStats();
      const freshState = {
        ...createEmptyState(),
        lastHydratedAt: nowIso(),
      };
      await Promise.all([
        putModelStats(db, freshStats),
        putBrainState(db, freshState),
        putTrainingQueueState(db, { key: "main", queues: {}, processing: {}, updatedAt: nowIso() }),
        putModelVersions(db, { key: "main", versions: {}, updatedAt: nowIso() }),
      ]);
      return {
        stats: freshStats,
        state: freshState,
        events: [],
        growth: [],
        queueState: { queues: {}, processing: {}, updatedAt: nowIso() },
        modelVersions: { versions: {}, updatedAt: nowIso() },
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

    return {
      stats: { ...createEmptyStats(), ...(statsRow || {}) },
      state: nextState,
      events: Array.isArray(events) ? events : [],
      growth: Array.isArray(growth) ? growth : [],
      queueState: queueState || { queues: {}, processing: {}, updatedAt: nowIso() },
      modelVersions: modelVersions || { versions: {}, updatedAt: nowIso() },
    };
  }

  async function persistQueueState(queueState = {}) {
    await putTrainingQueueState(db, {
      key: "main",
      queues: queueState.queues || {},
      processing: queueState.processing || {},
      updatedAt: nowIso(),
    });
  }

  async function persistModelVersions(modelVersions = {}) {
    await putModelVersions(db, {
      key: "main",
      versions: modelVersions.versions || modelVersions || {},
      updatedAt: nowIso(),
    });
  }

  async function persistEvent(event = {}, snapshot = {}) {
    const timestamp = event.timestamp || nowIso();
    const eventType = String(event.eventType || event.type || "training_event");
    const trainingStatus = String(event.trainingStatus || "queued");
    const trainingReason = event.trainingReason || event.reasonCode || null;
    const tradeOutcome = event.tradeOutcome || event.outcome || "n_a";
    const modelTarget = event.modelTarget || "meta";

    const nextStats = {
      ...createEmptyStats(),
      ...(snapshot.stats || {}),
      patternStats: { ...(snapshot.stats?.patternStats || {}) },
      modelStats: { ...(snapshot.stats?.modelStats || {}) },
      reasonStats: {
        training: { ...(snapshot.stats?.reasonStats?.training || {}) },
        tradeLoss: { ...(snapshot.stats?.reasonStats?.tradeLoss || {}) },
        success: { ...(snapshot.stats?.reasonStats?.success || {}) },
      },
      tradeOutcomeStats: {
        win: Number(snapshot.stats?.tradeOutcomeStats?.win || 0),
        loss: Number(snapshot.stats?.tradeOutcomeStats?.loss || 0),
        n_a: Number(snapshot.stats?.tradeOutcomeStats?.n_a || 0),
      },
    };

    if (trainingStatus === "trained") nextStats.trainedCount += 1;
    if (trainingStatus === "skipped") nextStats.skippedCount += 1;
    if (trainingStatus === "queued") nextStats.queuedCount += 1;
    if (trainingStatus === "error") nextStats.errorCount += 1;

    if (trainingStatus === "trained") {
      nextStats.lastTrainLoss = Number.isFinite(Number(event.loss)) ? Number(event.loss) : nextStats.lastTrainLoss;
      nextStats.lastTrainAcc = Number.isFinite(Number(event.acc)) ? Number(event.acc) : nextStats.lastTrainAcc;
    }

    if (["win", "loss", "n_a"].includes(tradeOutcome)) nextStats.tradeOutcomeStats[tradeOutcome] += 1;

    const patternName = String(event.patternName || "unknown");
    const prevPattern = normalizePatternBucket(nextStats.patternStats[patternName]);
    prevPattern.patternName = patternName;
    prevPattern.totalSamples += 1;
    if (trainingStatus === "trained") prevPattern.learnedCount += 1;
    if (trainingStatus === "skipped") prevPattern.skippedCount += 1;
    if (trainingStatus === "queued") prevPattern.queuedCount += 1;
    if (trainingStatus === "error") prevPattern.errorCount += 1;
    if (tradeOutcome === "win") prevPattern.wins += 1;
    if (tradeOutcome === "loss") prevPattern.losses += 1;
    const resolved = prevPattern.wins + prevPattern.losses;
    prevPattern.winRate = resolved > 0 ? prevPattern.wins / resolved : 0;
    nextStats.patternStats[patternName] = prevPattern;

    const previousModel = normalizeModelBucket(nextStats.modelStats[modelTarget], modelTarget);
    previousModel.totalSamples += 1;
    if (trainingStatus === "trained") previousModel.trainedCount += 1;
    if (trainingStatus === "skipped") previousModel.skippedCount += 1;
    if (trainingStatus === "queued") previousModel.queuedCount += 1;
    if (trainingStatus === "error") previousModel.errorCount += 1;
    nextStats.modelStats[modelTarget] = previousModel;

    const reasonKey = String(trainingReason || "unspecified");
    nextStats.reasonStats.training[reasonKey] = Number(nextStats.reasonStats.training[reasonKey] || 0) + 1;
    if (tradeOutcome === "loss") {
      nextStats.reasonStats.tradeLoss[patternName] = Number(nextStats.reasonStats.tradeLoss[patternName] || 0) + 1;
    }
    if (trainingStatus === "trained") {
      nextStats.reasonStats.success[reasonKey] = Number(nextStats.reasonStats.success[reasonKey] || 0) + 1;
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
      eventType,
      type: eventType,
      patternName,
      modelTarget,
      tradeOutcome,
      trainingStatus,
      trainingReason,
      reasonCode: trainingReason,
      outcome: tradeOutcome,
      loss: Number.isFinite(Number(event.loss)) ? Number(event.loss) : null,
      acc: Number.isFinite(Number(event.acc)) ? Number(event.acc) : null,
      detail: event.detail || event.details || "",
      details: event.detail || event.details || "",
      meta: event.meta && typeof event.meta === "object" ? event.meta : {},
    };

    await addBrainEvent(db, normalizedEvent);
    await addModelRunHistory(db, {
      timestamp,
      modelTarget,
      patternName,
      tradeOutcome,
      trainingStatus,
      trainingReason,
      loss: normalizedEvent.loss,
      acc: normalizedEvent.acc,
    });

    await putModelStats(db, nextStats);
    await putBrainState(db, currentState);

    if (["trained", "skipped", "error", "queued"].includes(trainingStatus)) {
      await addBrainGrowthPoint(db, {
        timestamp,
        trainedTotal: nextStats.trainedCount,
        skippedTotal: nextStats.skippedCount,
        errorTotal: nextStats.errorCount,
        queuedTotal: nextStats.queuedCount,
        neuronsTotal: nextStats.neuronsSavedCount,
      });
    }

    return {
      stats: nextStats,
      state: currentState,
      events: await getBrainEvents(db, 80),
      growth: await getBrainGrowthSeries(db, 300),
      queueState: snapshot.queueState || null,
      modelVersions: snapshot.modelVersions || null,
    };
  }

  return {
    hydrate,
    persistEvent,
    persistQueueState,
    persistModelVersions,
  };
}
