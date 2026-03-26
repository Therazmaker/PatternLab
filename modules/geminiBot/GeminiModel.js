const TFJS_CDN = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const MODEL_STORAGE_KEY = "indexeddb://gemini-bot-model-v1";

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
      featureSize: Number(config.featureSize) > 1 ? Number(config.featureSize) : 6,
      lstmUnits: Number(config.lstmUnits) > 4 ? Number(config.lstmUnits) : 16, // reducido de 32 → 16 (matriz: 4*16*22=1408, bajo el límite)
      learningRate: Number(config.learningRate) > 0 ? Number(config.learningRate) : 0.001,
      threshold: Number(config.threshold) > 0 && Number(config.threshold) < 1 ? Number(config.threshold) : 0.55,
    };
    this.tf = null;
    this.model = null;
    this.ready = false;
    this.stats = {
      totalTrained: 0,
      avgLoss: null,
      avgAccuracy: null,
      byPattern: {},
      byTimeframe: {},
      lastTrainingAt: null,
    };
  }

  async init() {
    this.tf = await ensureTfReady();
    this.model = this.#buildModel();
    this.ready = true;
    return this.model;
  }

  #buildModel() {
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
    const output = this.model.predict(input);
    const [[probability]] = await output.array();
    tf.dispose([input, output]);

    const direction = probability >= this.config.threshold ? "up" : probability <= (1 - this.config.threshold) ? "down" : "neutral";
    return {
      direction,
      confidence: Number(probability.toFixed(4)),
      threshold: this.config.threshold,
      at: new Date().toISOString(),
    };
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

  async trainOnPattern(patternContext, outcome, customIndicatorRows = [], meta = {}) {
    if (!this.ready) await this.init();

    const sequence = Array.isArray(patternContext)
      ? patternContext
      : Array.isArray(patternContext?.candles)
        ? patternContext.candles
        : [];
    const label = this.#normalizeOutcomeLabel(outcome);
    if (label === null) throw new Error("outcome inválido para entrenamiento (usa win/loss o 1/0)");

    if (sequence.length < this.config.lookback) {
      return {
        skipped: true,
        reason: "insufficient_sequence",
        requiredLookback: this.config.lookback,
        receivedCandles: sequence.length,
      };
    }

    const recent = sequence.slice(-this.config.lookback);
    const features = recent.map((candle, index) => this.buildFeatureVector(candle, customIndicatorRows[index] || []));

    const tf = this.tf;
    const input = tf.tensor3d([features], [1, this.config.lookback, this.config.featureSize]);
    const target = tf.tensor2d([[label]], [1, 1]);
    const safeWeight = Number(meta?.weight);
    const weight = Number.isFinite(safeWeight) && safeWeight > 0 ? safeWeight : 1;
    const sampleWeight = tf.tensor1d([weight]);

    let history;
    try {
      history = await this.model.fit(input, target, {
        epochs: 1,
        batchSize: 1,
        verbose: 0,
        shuffle: false,
        sampleWeight,
      });
    } finally {
      tf.dispose([input, target, sampleWeight]);
    }

    const loss = Number(history?.history?.loss?.[0]);
    const accuracy = Number(history?.history?.accuracy?.[0]);
    this.stats.totalTrained += 1;
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
      totalTrained: this.stats.totalTrained,
    };
  }

  async saveModel(storageKey = MODEL_STORAGE_KEY) {
    if (!this.ready) await this.init();
    await this.model.save(storageKey);
    return { storageKey };
  }

  async loadModel(storageKey = MODEL_STORAGE_KEY) {
    this.tf = await ensureTfReady();
    this.model = await this.tf.loadLayersModel(storageKey);
    this.model.compile({
      optimizer: this.tf.train.adam(this.config.learningRate),
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });
    this.ready = true;
    return this.model;
  }
}
