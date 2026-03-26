const TFJS_CDN = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const MODEL_STORAGE_KEY = "indexeddb://gemini-bot-model-v1";
const ENSEMBLE_SUFFIXES = ["a", "b", "c"];

async function ensureTfReady() {
  if (globalThis.tf) return globalThis.tf;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TFJS_CDN;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  if (!globalThis.tf) throw new Error("TensorFlow.js no se pudo inicializar");
  return globalThis.tf;
}

export class GeminiModel {
  constructor(config = {}) {
    this.config = {
      lookback: Number(config.lookback) > 5 ? Number(config.lookback) : 10,  // reducido de 20 → 10
      minTrainingSequence: Number(config.minTrainingSequence) >= 6
        ? Number(config.minTrainingSequence)
        : Math.max(6, Math.ceil((Number(config.lookback) > 5 ? Number(config.lookback) : 10) * 0.7)),
      featureSize: Number(config.featureSize) > 1 ? Number(config.featureSize) : 6,
      lstmUnits: Number(config.lstmUnits) > 4 ? Number(config.lstmUnits) : 16, // reducido de 32 → 16 (matriz: 4*16*22=1408, bajo el límite)
      learningRate: Number(config.learningRate) > 0 ? Number(config.learningRate) : 0.001,
      threshold: Number(config.threshold) > 0 && Number(config.threshold) < 1 ? Number(config.threshold) : 0.55,
    };
    this.tf = null;
    this.model = null;
    this.models = [];
    this.ready = false;
    this.#lastPredictions = [];
    this.stats = {
      totalTrained: 0,
      trainedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      avgLoss: null,
      avgAccuracy: null,
      lastTrainLoss: null,
      lastTrainAcc: null,
      lastTrainingReason: null,
      lastEventType: "idle",
      lastSampleWeight: null,
      byPattern: {},
      byTimeframe: {},
      lastTrainingAt: null,
    };
    this.trainingQueue = Promise.resolve();
  }

  #lastPredictions;

  async init() {
    this.tf = await ensureTfReady();
    this.models = this.#buildModel();
    this.model = this.models[0];
    this.ready = true;
    return this.model;
  }

  #buildSingleModel() {
    const tf = this.tf;
    const model = tf.sequential();
    model.add(
      tf.layers.lstm({
        units: this.config.lstmUnits,
        inputShape: [this.config.lookback, this.config.featureSize],
        returnSequences: false,
      }),
    );
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 8, activation: "relu" })); // reducido de 16 → 8
    model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });
    return model;
  }

  #buildModel() {
    const models = ENSEMBLE_SUFFIXES.map(() => this.#buildSingleModel());
    this.models = models;
    this.model = models[0] || null;
    return models;
  }

  #getModelStorageKeys(baseKey = MODEL_STORAGE_KEY) {
    return ENSEMBLE_SUFFIXES.map((suffix) => `${baseKey}-${suffix}`);
  }

  #normalizeIndicators(customIndicators) {
    if (Array.isArray(customIndicators)) {
      return customIndicators.map((value) => Number(value) || 0);
    }
    if (customIndicators && typeof customIndicators === "object") {
      return Object.values(customIndicators).map((value) => Number(value) || 0);
    }
    return [];
  }

  buildFeatureVector(candle, customIndicators = []) {
    const open = Number(candle?.open || 0);
    const high = Number(candle?.high || 0);
    const low = Number(candle?.low || 0);
    const close = Number(candle?.close || 0);
    const volume = Number(candle?.volume || 0);
    const bodyPct = open ? (close - open) / open : 0;
    const normalizedIndicators = this.#normalizeIndicators(customIndicators);
    return [open, high, low, close, volume, bodyPct, ...normalizedIndicators].slice(0, this.config.featureSize);
  }

  async predictDirection(sequence, customIndicatorRows = []) {
    if (!this.ready) await this.init();
    if (!Array.isArray(sequence) || sequence.length < this.config.lookback) {
      return { direction: "neutral", confidence: 0, reason: "insufficient_sequence" };
    }

    const recent = sequence.slice(-this.config.lookback);
    const features = recent.map((candle, index) => this.buildFeatureVector(candle, customIndicatorRows[index] || []));

    const tf = this.tf;
    const input = tf.tensor3d([features], [1, this.config.lookback, this.config.featureSize]);
    const models = Array.isArray(this.models) && this.models.length > 0 ? this.models : [this.model].filter(Boolean);
    const outputs = models.map((model) => model.predict(input));
    const probabilities = await Promise.all(outputs.map(async (output) => {
      const [[value]] = await output.array();
      return Number(value) || 0;
    }));
    const probability = probabilities.length > 0
      ? probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length
      : 0;
    tf.dispose([input, ...outputs]);

    const direction = probability >= this.config.threshold ? "up" : probability <= (1 - this.config.threshold) ? "down" : "neutral";
    const prediction = {
      direction,
      confidence: Number(probability.toFixed(4)),
      threshold: this.config.threshold,
      at: new Date().toISOString(),
    };
    this.#lastPredictions.push(prediction.confidence);
    if (this.#lastPredictions.length > 3) this.#lastPredictions.shift();
    return prediction;
  }

  #normalizeOutcomeLabel(outcome) {
    if (typeof outcome === "number") return outcome >= 0.5 ? 1 : 0;
    const normalized = String(outcome || "").toLowerCase().trim();
    if (["win", "up", "bullish", "long", "1", "true"].includes(normalized)) return 1;
    if (["loss", "down", "bearish", "short", "0", "false"].includes(normalized)) return 0;
    return null;
  }

  #updateBucketStats(group, key, label) {
    const bucketKey = key || "unknown";
    if (!group[bucketKey]) group[bucketKey] = { total: 0, wins: 0, losses: 0, winRate: 0 };
    const bucket = group[bucketKey];
    bucket.total += 1;
    if (label === 1) bucket.wins += 1;
    if (label === 0) bucket.losses += 1;
    bucket.winRate = bucket.total > 0 ? bucket.wins / bucket.total : 0;
  }

  #prepareSequenceForTraining(sequence = []) {
    if (!Array.isArray(sequence) || sequence.length < this.config.minTrainingSequence) return null;
    if (sequence.length >= this.config.lookback) return sequence.slice(-this.config.lookback);
    const first = sequence[0] || {};
    const padding = Array.from({ length: this.config.lookback - sequence.length }, () => first);
    return [...padding, ...sequence];
  }

  async #trainOnPatternInternal(patternContext, outcome, customIndicatorRows = [], meta = {}) {
    if (!this.ready) await this.init();

    const sequence = Array.isArray(patternContext)
      ? patternContext
      : Array.isArray(patternContext?.candles)
        ? patternContext.candles
        : [];
    const label = this.#normalizeOutcomeLabel(outcome);
    if (label === null) throw new Error("outcome inválido para entrenamiento (usa win/loss o 1/0)");

    const preparedSequence = this.#prepareSequenceForTraining(sequence);
    if (!preparedSequence) {
      this.stats.skippedCount += 1;
      this.stats.lastEventType = "skipped";
      this.stats.lastTrainingReason = "insufficient_sequence";
      this.stats.lastTrainLoss = null;
      this.stats.lastTrainAcc = null;
      console.info("[Training] sample skipped: insufficient_sequence", {
        receivedCandles: sequence.length,
        requiredLookback: this.config.lookback,
        minTrainingSequence: this.config.minTrainingSequence,
      });
      return {
        skipped: true,
        reason: "insufficient_sequence",
        requiredLookback: this.config.lookback,
        minTrainingSequence: this.config.minTrainingSequence,
        receivedCandles: sequence.length,
      };
    }

    const features = preparedSequence.map((candle, index) => this.buildFeatureVector(candle, customIndicatorRows[index] || []));
    console.info("[Training] sample created", {
      receivedCandles: sequence.length,
      usedCandles: preparedSequence.length,
      patternType: meta?.patternType || "unknown",
      timeframe: meta?.timeframe || "unknown",
    });

    const tf = this.tf;
    const input = tf.tensor3d([features], [1, this.config.lookback, this.config.featureSize]);
    const target = tf.tensor2d([[label]], [1, 1]);
    const safeWeight = Number(meta?.weight);
    const weight = Number.isFinite(safeWeight) && safeWeight > 0 ? safeWeight : 1;
    this.stats.lastSampleWeight = weight;
    console.info("[Training] sample weight ignored by backend, using fallback", { weight });

    let history;
    try {
      const models = Array.isArray(this.models) && this.models.length > 0 ? this.models : this.#buildModel();
      this.model = models[0];
      const fitOptions = {
        epochs: 1,
        batchSize: 1,
        verbose: 0,
        shuffle: false,
      };
      history = await this.model.fit(input, target, fitOptions);
      console.info("[Training] fit success", {
        loss: Number(history?.history?.loss?.[0]),
        accuracy: Number(history?.history?.accuracy?.[0]),
      });
    } catch (error) {
      this.stats.errorCount += 1;
      this.stats.lastEventType = "error";
      this.stats.lastTrainingReason = error?.message || "fit_failed";
      this.stats.lastTrainLoss = null;
      this.stats.lastTrainAcc = null;
      console.error(`[Training] fit failed: ${error?.message || "unknown_error"}`);
      throw error;
    } finally {
      tf.dispose([input, target]);
    }

    const loss = Number(history?.history?.loss?.[0]);
    const accuracy = Number(history?.history?.accuracy?.[0]);
    this.stats.totalTrained += 1;
    this.stats.trainedCount = this.stats.totalTrained;
    this.stats.lastEventType = "trained";
    this.stats.lastTrainingReason = "fit_success";
    this.stats.lastTrainLoss = Number.isFinite(loss) ? loss : null;
    this.stats.lastTrainAcc = Number.isFinite(accuracy) ? accuracy : null;
    if (Number.isFinite(loss)) {
      this.stats.avgLoss = Number.isFinite(this.stats.avgLoss)
        ? ((this.stats.avgLoss * (this.stats.totalTrained - 1)) + loss) / this.stats.totalTrained
        : loss;
    }
    if (Number.isFinite(accuracy)) {
      this.stats.avgAccuracy = Number.isFinite(this.stats.avgAccuracy)
        ? ((this.stats.avgAccuracy * (this.stats.totalTrained - 1)) + accuracy) / this.stats.totalTrained
        : accuracy;
    }
    this.#updateBucketStats(this.stats.byPattern, meta?.patternType, label);
    this.#updateBucketStats(this.stats.byTimeframe, meta?.timeframe, label);
    this.stats.lastTrainingAt = new Date().toISOString();

    return {
      skipped: false,
      loss,
      accuracy,
      weight,
      backendWeightSupported: false,
      totalTrained: this.stats.totalTrained,
      trainedCount: this.stats.trainedCount,
      skippedCount: this.stats.skippedCount,
      errorCount: this.stats.errorCount,
    };
  }

  async trainOnPattern(patternContext, outcome, customIndicatorRows = [], meta = {}) {
    const run = async () => this.#trainOnPatternInternal(patternContext, outcome, customIndicatorRows, meta);
    const next = this.trainingQueue.then(run, run);
    this.trainingQueue = next.catch(() => {});
    return next;
  }

  async saveModel(storageKey = MODEL_STORAGE_KEY) {
    if (!this.ready) await this.init();
    const models = Array.isArray(this.models) && this.models.length > 0 ? this.models : [this.model].filter(Boolean);
    const keys = this.#getModelStorageKeys(storageKey);
    await Promise.all(models.map((model, index) => model.save(keys[index])));
    return { storageKey, keys };
  }

  async loadModel(storageKey = MODEL_STORAGE_KEY) {
    this.tf = await ensureTfReady();
    const keys = this.#getModelStorageKeys(storageKey);
    const loadedModels = await Promise.all(keys.map(async (key) => {
      try {
        const model = await this.tf.loadLayersModel(key);
        model.compile({
          optimizer: this.tf.train.adam(this.config.learningRate),
          loss: "binaryCrossentropy",
          metrics: ["accuracy"],
        });
        return model;
      } catch (_error) {
        return this.#buildSingleModel();
      }
    }));
    this.models = loadedModels;
    this.model = loadedModels[0];
    this.ready = true;
    return this.model;
  }

  getEnsembleStats() {
    const avgConfidence = this.#lastPredictions.length > 0
      ? this.#lastPredictions.reduce((sum, confidence) => sum + confidence, 0) / this.#lastPredictions.length
      : 0;
    return {
      size: 3,
      avgConfidence: Number(avgConfidence.toFixed(4)),
      lastPredictions: [...this.#lastPredictions],
    };
  }
}
