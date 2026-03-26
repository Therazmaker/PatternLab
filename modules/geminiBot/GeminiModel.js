const TFJS_CDN = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";

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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export class GeminiModel {
  constructor(config = {}) {
    this.config = {
      lookback: Number(config.lookback) > 5 ? Number(config.lookback) : 20,
      featureSize: Number(config.featureSize) > 1 ? Number(config.featureSize) : 12,
      lstmUnits: Number(config.lstmUnits) > 4 ? Number(config.lstmUnits) : 48,
      denseUnits: Number(config.denseUnits) > 2 ? Number(config.denseUnits) : 24,
      dropout: Number(config.dropout) >= 0 && Number(config.dropout) < 1 ? Number(config.dropout) : 0.2,
      learningRate: Number(config.learningRate) > 0 ? Number(config.learningRate) : 0.001,
      threshold: Number(config.threshold) > 0 && Number(config.threshold) < 1 ? Number(config.threshold) : 0.55,
    };
    this.tf = null;
    this.model = null;
    this.ready = false;
    this.stats = {
      totalTrained: 0,
      avgLoss: 0,
      avgAccuracy: 0,
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
    model.add(tf.layers.dropout({ rate: this.config.dropout }));
    model.add(tf.layers.dense({ units: this.config.denseUnits, activation: "relu" }));
    model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });
    return model;
  }

  buildFeatureVector(candle, indicators = {}, normRef = {}) {
    const open = Number(candle?.open || 0);
    const high = Number(candle?.high || 0);
    const low = Number(candle?.low || 0);
    const close = Number(candle?.close || 0);
    const volume = Number(candle?.volume || 0);
    const maxPrice = Math.max(1, Number(normRef.maxPrice || high || close || 1));
    const maxVolume = Math.max(1, Number(normRef.maxVolume || volume || 1));
    const bodyPct = clamp(Number(indicators?.bodyPct ?? (open ? (close - open) / open : 0)), -1, 1);
    const wickRatio = clamp(Number(indicators?.wickRatio ?? 0), 0, 1);
    const rsi14 = clamp(Number(indicators?.rsi14 ?? 50) / 100, 0, 1);
    const ema9 = Number(indicators?.ema9 ?? close);
    const ema21 = Number(indicators?.ema21 ?? close || 1);
    const emaRatio = clamp(ema21 ? ema9 / ema21 : 1, 0, 2);
    const atr14 = clamp(close ? Number(indicators?.atr14 ?? 0) / close : 0, 0, 1);
    const volumeRatioRaw = clamp(Number(indicators?.volumeRatio ?? 1), 0, 5);
    const volumeRatio = volumeRatioRaw / 5;

    return [
      open / maxPrice,
      high / maxPrice,
      low / maxPrice,
      close / maxPrice,
      volume / maxVolume,
      (bodyPct + 1) / 2,
      wickRatio,
      rsi14,
      emaRatio,
      clamp(ema21 / maxPrice, 0, 1),
      atr14,
      volumeRatio,
    ].slice(0, this.config.featureSize);
  }

  #buildNormRef(sequence = []) {
    const recent = sequence.slice(-this.config.lookback);
    const maxPrice = recent.reduce((acc, row) => Math.max(acc, Number(row?.high || row?.close || 0)), 1);
    const maxVolume = recent.reduce((acc, row) => Math.max(acc, Number(row?.volume || 0)), 1);
    return { maxPrice, maxVolume };
  }

  #buildFeatureMatrix(sequence = [], customIndicatorRows = []) {
    const recent = sequence.slice(-this.config.lookback);
    const normRef = this.#buildNormRef(recent);
    return recent.map((candle, index) => this.buildFeatureVector(candle, customIndicatorRows[index] || {}, normRef));
  }

  async predictDirection(sequence, customIndicatorRows = []) {
    if (!this.ready) await this.init();
    if (!Array.isArray(sequence) || sequence.length < this.config.lookback) {
      return { direction: "neutral", confidence: 0, reason: "insufficient_sequence" };
    }

    const features = this.#buildFeatureMatrix(sequence, customIndicatorRows);
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

  async trainOnPattern(sequence, label, customIndicatorRows = []) {
    if (!this.ready) await this.init();
    if (!Array.isArray(sequence) || sequence.length < this.config.lookback) {
      return { loss: null, accuracy: null, trainedAt: new Date().toISOString(), skipped: true };
    }
    const tf = this.tf;
    const features = this.#buildFeatureMatrix(sequence, customIndicatorRows);
    const xs = tf.tensor3d([features], [1, this.config.lookback, this.config.featureSize]);
    const ys = tf.tensor2d([[label ? 1 : 0]], [1, 1]);

    const history = await this.model.fit(xs, ys, {
      epochs: 1,
      batchSize: 1,
      shuffle: false,
      verbose: 0,
    });
    tf.dispose([xs, ys]);

    const loss = Number(history.history.loss?.[0] ?? 0);
    const accuracy = Number((history.history.acc?.[0] ?? history.history.accuracy?.[0] ?? 0));
    this.stats.totalTrained += 1;
    const n = this.stats.totalTrained;
    this.stats.avgLoss = ((this.stats.avgLoss * (n - 1)) + loss) / n;
    this.stats.avgAccuracy = ((this.stats.avgAccuracy * (n - 1)) + accuracy) / n;

    return {
      loss,
      accuracy,
      trainedAt: new Date().toISOString(),
    };
  }

  async saveModel(name = "gemini-lstm-v1") {
    if (!this.ready) await this.init();
    await this.model.save(`indexeddb://${name}`);
    return { name, savedAt: new Date().toISOString() };
  }

  async loadModel(name = "gemini-lstm-v1") {
    this.tf = await ensureTfReady();
    this.model = await this.tf.loadLayersModel(`indexeddb://${name}`);
    this.model.compile({
      optimizer: this.tf.train.adam(this.config.learningRate),
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });
    this.ready = true;
    return { name, loadedAt: new Date().toISOString() };
  }
}
