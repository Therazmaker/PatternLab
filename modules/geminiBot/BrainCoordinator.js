import { GeminiModel } from "./GeminiModel.js";

const MODEL_TARGETS = {
  MOMENTUM: "momentum",
  REVERSAL: "reversal",
  CONTEXT: "context",
  META: "meta",
};

const PATTERN_TO_TARGET = {
  bullish_consecutive_candles: MODEL_TARGETS.MOMENTUM,
  bearish_consecutive_candles: MODEL_TARGETS.MOMENTUM,
  momentum_acceleration: MODEL_TARGETS.MOMENTUM,
  doji: MODEL_TARGETS.REVERSAL,
  bullish_engulfing: MODEL_TARGETS.REVERSAL,
  bearish_engulfing: MODEL_TARGETS.REVERSAL,
  volume_spike: MODEL_TARGETS.CONTEXT,
  low_volume: MODEL_TARGETS.CONTEXT,
  exhaustion: MODEL_TARGETS.CONTEXT,
  followthrough: MODEL_TARGETS.CONTEXT,
  distance_from_ema_base: MODEL_TARGETS.CONTEXT,
};

class ContextModel {
  constructor() {
    this.stats = { trainedCount: 0, skippedCount: 0, errorCount: 0, lastReason: null };
  }

  async trainOnPattern(_sequence, outcome, customIndicatorRows = [], meta = {}) {
    const indicators = customIndicatorRows[customIndicatorRows.length - 1] || meta.indicators || {};
    const volume = Number(indicators.volume || 0);
    const avgVolume = Number(indicators.avgVolume || indicators.volumeAvg || 0);
    const emaDistance = Number(indicators.distanceFromEmaBase || indicators.emaDistance || 0);
    const validOutcome = [0, 1].includes(Number(outcome));
    if (!validOutcome) {
      this.stats.skippedCount += 1;
      this.stats.lastReason = "invalid_outcome";
      return { skipped: true, reason: "invalid_outcome" };
    }

    const hasSignal = (avgVolume > 0 && volume > avgVolume * 1.4) || Math.abs(emaDistance) > 0.01;
    if (!hasSignal) {
      this.stats.skippedCount += 1;
      this.stats.lastReason = "insufficient_context_signal";
      return { skipped: true, reason: "insufficient_context_signal" };
    }

    this.stats.trainedCount += 1;
    this.stats.lastReason = "heuristic_context_update";
    return {
      skipped: false,
      loss: null,
      accuracy: null,
      reason: "heuristic_context_update",
    };
  }
}

export class BrainCoordinator {
  constructor({ modelConfig = {}, onEvent = async () => {}, onQueueState = async () => {}, onModelVersions = async () => {} } = {}) {
    this.onEvent = onEvent;
    this.onQueueState = onQueueState;
    this.onModelVersions = onModelVersions;
    this.models = {
      [MODEL_TARGETS.MOMENTUM]: new GeminiModel({ ...modelConfig }),
      [MODEL_TARGETS.REVERSAL]: new GeminiModel({ ...modelConfig }),
      [MODEL_TARGETS.CONTEXT]: new ContextModel(),
    };
    this.metaCombiner = { version: "meta-v1", lastScore: 0 };
    this.queues = {
      [MODEL_TARGETS.MOMENTUM]: [],
      [MODEL_TARGETS.REVERSAL]: [],
      [MODEL_TARGETS.CONTEXT]: [],
      [MODEL_TARGETS.META]: [],
    };
    this.processing = {
      [MODEL_TARGETS.MOMENTUM]: false,
      [MODEL_TARGETS.REVERSAL]: false,
      [MODEL_TARGETS.CONTEXT]: false,
      [MODEL_TARGETS.META]: false,
    };
    this.safeStartSamples = Number(modelConfig.safeStartSamples) > 0 ? Number(modelConfig.safeStartSamples) : 30;
    this.sessionSampleCount = 0;
  }

  async init() {
    await Promise.all([
      this.models[MODEL_TARGETS.MOMENTUM].init(),
      this.models[MODEL_TARGETS.REVERSAL].init(),
    ]);
    await this.onModelVersions({
      versions: {
        momentum: "tf-lstm-v1",
        reversal: "tf-lstm-v1",
        context: "heuristic-v1",
        meta: this.metaCombiner.version,
      },
    });
  }

  resolveModelTarget(patternName = "") {
    return PATTERN_TO_TARGET[String(patternName || "").toLowerCase()] || MODEL_TARGETS.CONTEXT;
  }

  async submitTrainingSample(sample = {}) {
    const modelTarget = this.resolveModelTarget(sample.patternName);
    const queue = this.queues[modelTarget];
    const trainingItem = { ...sample, modelTarget, enqueuedAt: new Date().toISOString() };
    this.sessionSampleCount += 1;

    if (this.processing[modelTarget]) {
      queue.push(trainingItem);
      await this.onEvent(this.#buildEvent(trainingItem, {
        trainingStatus: "queued",
        trainingReason: "model_busy_queued",
        detail: `queued_position=${queue.length}`,
      }));
      await this.#persistQueue();
      return;
    }

    queue.push(trainingItem);
    await this.#persistQueue();
    await this.#processQueue(modelTarget);
  }

  async #processQueue(modelTarget) {
    if (this.processing[modelTarget]) return;
    const queue = this.queues[modelTarget];
    this.processing[modelTarget] = true;
    await this.#persistQueue();

    while (queue.length > 0) {
      const item = queue.shift();
      const event = await this.#trainItem(item);
      await this.onEvent(event);
      await this.#persistQueue();
    }

    this.processing[modelTarget] = false;
    await this.#persistQueue();
  }

  async #trainItem(item) {
    const label = item.tradeOutcome === "win" ? 1 : item.tradeOutcome === "loss" ? 0 : null;
    if (label === null) {
      return this.#buildEvent(item, {
        trainingStatus: "skipped",
        trainingReason: "invalid_trade_outcome",
        detail: "trade_outcome must be win/loss",
      });
    }

    const model = this.models[item.modelTarget];
    try {
      const report = await model.trainOnPattern(item.candles || [], label, item.customRows || [], {
        patternType: item.patternName,
        timeframe: item.timeframe,
        weight: item.weight,
        indicators: item.indicators || {},
        forceMinTrainingSequence: this.sessionSampleCount <= this.safeStartSamples ? 3 : null,
      });
      if (report?.skipped) {
        return this.#buildEvent(item, {
          trainingStatus: "skipped",
          trainingReason: report.reason || "skipped",
          detail: report.reason || "training skipped",
          loss: null,
          acc: null,
        });
      }

      return this.#buildEvent(item, {
        trainingStatus: "trained",
        trainingReason: report.reason || "fit_success",
        detail: "training completed",
        loss: report.loss,
        acc: report.accuracy,
      });
    } catch (error) {
      const message = error?.message || "fit_failed";
      const reason = message.toLowerCase().includes("concurrent") ? "fit_conflict" : message;
      return this.#buildEvent(item, {
        trainingStatus: "error",
        trainingReason: reason,
        detail: message,
      });
    }
  }

  async resetLearningSession({ safeStartSamples = 30 } = {}) {
    this.safeStartSamples = Number(safeStartSamples) > 0 ? Number(safeStartSamples) : 30;
    this.sessionSampleCount = 0;
    Object.keys(this.queues).forEach((key) => { this.queues[key] = []; });
    Object.keys(this.processing).forEach((key) => { this.processing[key] = false; });
    await this.#persistQueue();
    await Promise.all([
      this.models[MODEL_TARGETS.MOMENTUM].resetToBase({ clearPersisted: true }),
      this.models[MODEL_TARGETS.REVERSAL].resetToBase({ clearPersisted: true }),
    ]);
    this.models[MODEL_TARGETS.CONTEXT].stats = { trainedCount: 0, skippedCount: 0, errorCount: 0, lastReason: null };
    await this.onModelVersions({
      versions: {
        momentum: "tf-lstm-v1",
        reversal: "tf-lstm-v1",
        context: "heuristic-v1",
        meta: this.metaCombiner.version,
      },
    });
  }

  #buildEvent(sample, data = {}) {
    return {
      timestamp: new Date().toISOString(),
      eventType: "training_event",
      patternName: sample.patternName || "unknown",
      modelTarget: sample.modelTarget || MODEL_TARGETS.CONTEXT,
      tradeOutcome: sample.tradeOutcome || "n_a",
      trainingStatus: data.trainingStatus || "queued",
      trainingReason: data.trainingReason || "unspecified",
      detail: data.detail || "",
      loss: data.loss,
      acc: data.acc,
      meta: {
        timeframe: sample.timeframe || "unknown",
      },
    };
  }

  async #persistQueue() {
    const queues = Object.fromEntries(Object.entries(this.queues).map(([key, rows]) => [key, rows.length]));
    await this.onQueueState({ queues, processing: { ...this.processing } });
  }
}
