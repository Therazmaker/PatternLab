import { BinanceStreamer } from "./BinanceStreamer.js";
import { GeminiModel } from "./GeminiModel.js";
import { NeuronStore } from "./NeuronStore.js";

export function createGeminiBotController(elements = {}) {
  const streamer = new BinanceStreamer({ symbol: elements.symbolInput?.value || "BTCUSDT" });
  const model = new GeminiModel();
  const store = new NeuronStore();

  const setStatus = (message) => {
    if (elements.status) elements.status.textContent = message;
  };

  const appendLog = (message) => {
    if (!elements.log) return;
    const line = document.createElement("li");
    line.textContent = message;
    elements.log.prepend(line);
    while (elements.log.children.length > 30) elements.log.removeChild(elements.log.lastChild);
  };

  const setPrediction = (prediction) => {
    if (!elements.prediction) return;
    elements.prediction.textContent = `${prediction.direction.toUpperCase()} (${(prediction.confidence * 100).toFixed(1)}%)`;
  };

  streamer.on("status", (status) => {
    setStatus(`WS ${status.type} ${status.timeframe || ""}`.trim());
  });

  streamer.on("kline", ({ timeframe, kline }) => {
    appendLog(`[${timeframe}] close=${kline.close} open=${kline.open} @ ${new Date(kline.closeTime).toLocaleTimeString()}`);
  });

  streamer.on("pattern", async (pattern) => {
    appendLog(`✅ Patrón detectado (${pattern.size} bullish) en ${pattern.timeframe}`);
    const sequence = streamer.getRecentCandles(pattern.timeframe);
    const prediction = await model.predictDirection(sequence);
    setPrediction(prediction);
    store.appendPattern(pattern, prediction);
  });

  elements.startBtn?.addEventListener("click", async () => {
    try {
      await model.init();
      streamer.config.symbol = (elements.symbolInput?.value || "BTCUSDT").toUpperCase();
      streamer.config.bullishStreakSize = Number(elements.streakInput?.value) || 3;
      streamer.start();
      setStatus("Gemini Bot activo");
    } catch (error) {
      setStatus(`Error iniciando Gemini Bot: ${error.message}`);
    }
  });

  elements.stopBtn?.addEventListener("click", () => {
    streamer.stop();
    setStatus("Gemini Bot detenido");
  });

  elements.exportBtn?.addEventListener("click", () => {
    store.download();
    setStatus("JSON neurona exportado");
  });

  return {
    streamer,
    model,
    store,
  };
}
