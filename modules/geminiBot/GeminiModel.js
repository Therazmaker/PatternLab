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

export class GeminiModel {
  constructor(config = {}) {
    this.config = {
      lookback: Number(config.lookback) > 5 ? Number(config.lookback) : 20,
      featureSize: Number(config.featureSize) > 1 ? Number(config.featureSize) : 6,
      lstmUnits: Number(config.lstmUnits) > 4 ? Number(config.lstmUnits) : 32,
      learningRate: Number(config.learningRate) > 0 ? Number(config.learningRate) : 0.001,
      threshold: Number(config.threshold) > 0 && Number(config.threshold) < 1 ? Number(config.threshold) : 0.55,
    };
    this.tf = null;
    this.model = null;
    this.ready = false;
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
    model.add(tf.layers.dense({ units: 16, activation: "relu" }));
    model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });
    return model;
  }

  buildFeatureVector(candle, customIndicators = []) {
    const open = Number(candle?.open || 0);
    const high = Number(candle?.high || 0);
    const low = Number(candle?.low || 0);
    const close = Number(candle?.close || 0);
    const volume = Number(candle?.volume || 0);
    const bodyPct = open ? (close - open) / open : 0;
    return [open, high, low, close, volume, bodyPct, ...customIndicators].slice(0, this.config.featureSize);
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
}
