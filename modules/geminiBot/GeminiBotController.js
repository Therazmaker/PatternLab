import { BinanceStreamer } from "./BinanceStreamer.js";
import { GeminiModel } from "./GeminiModel.js";
import { NeuronStore } from "./NeuronStore.js";

export function createGeminiBotController(elements = {}) {
  let active = false;
  let outcomeTimer = null;
  let statsTimer = null;

  const streamer = new BinanceStreamer({
    symbol: elements.symbolInput?.value || "BTCUSDT",
    bullishStreakSize: Number(elements.streakInput?.value || 3),
    bearishStreakSize: Number(elements.bearishStreakInput?.value || 3),
  });
  const model = new GeminiModel(elements.modelConfig || {});
  const store = new NeuronStore();
  const bridge = elements.bridge || null;

  const state = {
    patterns: [],
    predictions: [],
    lastIndicators: { "1m": null, "5m": null },
    lastBridgeDecision: "none",
  };

  const setStatus = (message) => {
    if (elements.status) elements.status.textContent = message;
  };

  const appendLog = (message) => {
    if (!elements.log) return;
    const line = document.createElement("li");
    line.textContent = message;
    elements.log.prepend(line);
    while (elements.log.children.length > 150) elements.log.removeChild(elements.log.lastChild);
  };

  const updateBridgeStatus = () => {
    if (!elements.bridgeStatusEl) return;
    const activeCount = typeof bridge?.getActiveItemsCount === "function" ? bridge.getActiveItemsCount() : 0;
    elements.bridgeStatusEl.textContent = `Library: ${activeCount} reglas activas · last: ${state.lastBridgeDecision}`;
  };

  const setPrediction = (prediction) => {
    if (!elements.prediction) return;
    elements.prediction.textContent = `${prediction.direction.toUpperCase()} (${(prediction.confidence * 100).toFixed(1)}%)`;
  };

  const updateTrainingStats = () => {
    if (!elements.trainingStats) return;
    elements.trainingStats.total.textContent = String(model.stats.totalTrained || 0);
    elements.trainingStats.loss.textContent = Number.isFinite(model.stats.avgLoss) ? model.stats.avgLoss.toFixed(4) : "—";
    elements.trainingStats.acc.textContent = Number.isFinite(model.stats.avgAccuracy) ? (model.stats.avgAccuracy * 100).toFixed(2) + "%" : "—";
  };

  const refreshStats = () => {
    const stats = store.getStats();
    elements.onStatsUpdate?.(stats);
  };

  const toIndicatorRows = (sequence, indicator) => sequence.map(() => ({ ...indicator }));

  const renderChart = (timeframe) => {
    const candles = streamer.getRecentCandles(timeframe);
    const patterns = state.patterns.filter((row) => row.timeframe === timeframe);
    const indicators = candles.map((_, idx) => {
      const matching = patterns.find((p) => p.candles?.[p.candles.length - 1]?.closeTime === candles[idx]?.closeTime);
      return matching?.indicators || null;
    });
    elements.onChartUpdate?.(timeframe, candles, patterns, indicators);
  };

  const selectedTimeframes = () => {
    const selection = elements.tfSelector?.value || "both";
    if (selection === "1m") return ["1m"];
    if (selection === "5m") return ["5m"];
    return ["1m", "5m"];
  };

  const patternAllowed = (type) => {
    const filter = elements.patternFilter?.value || "all";
    return filter === "all" || filter === type;
  };

  const runOutcomeLoop = async () => {
    if (!active) return;
    const pending = store.getPendingOutcomes();
    for (const row of pending) {
      const currentClose = streamer.getLastClose(row.timeframe);
      const resolved = store.resolveOutcome(row.id, currentClose);
      if (!resolved || resolved.outcome?.result === "pending") continue;
      const label = resolved.outcome?.result === "win" ? 1 : 0;
      const customRows = resolved.features.map(() => resolved.indicators || {});
      try {
        if (resolved?.prediction?.vetoed) {
          appendLog(`⛔ Veto persistente ${resolved.type} (${resolved.timeframe}) · ${resolved.prediction.vetoReason || "sin razón"}`);
        } else {
          const weight = Number(resolved?.prediction?.bridgeWeight || 1);
          const report = await model.trainOnPattern(resolved.candles, label, customRows, { weight });
          updateTrainingStats();
          appendLog(`🧠 Entrenado ${resolved.type} (${resolved.timeframe}) → ${resolved.outcome.result} | w=${weight.toFixed(2)} | loss=${Number(report.loss || 0).toFixed(4)}`);
        }
      } catch (error) {
        setStatus(`Error entrenando: ${error.message}`);
      }

      const suggestions = bridge?.suggestNeurons?.(store.getResolvedRecent(20), state.lastIndicators[resolved.timeframe] || {});
      if (Array.isArray(suggestions)) elements.onSuggestionsUpdate?.(suggestions);
    }
    refreshStats();
  };

  streamer.on("status", (status) => {
    setStatus(`WS ${status.type} ${status.timeframe || ""}`.trim());
  });

  streamer.on("kline", ({ timeframe, kline, indicators }) => {
    state.lastIndicators[timeframe] = indicators;
    elements.onIndicatorUpdate?.(indicators);
    renderChart(elements.chartTfSelector?.value || timeframe);
    appendLog(`[${timeframe}] c=${Number(kline.close).toFixed(2)} o=${Number(kline.open).toFixed(2)} @ ${new Date(kline.closeTime).toLocaleTimeString()}`);
  });

  streamer.on("pattern", async (pattern) => {
    if (!active) return;
    if (!selectedTimeframes().includes(pattern.timeframe)) return;
    if (!patternAllowed(pattern.type)) return;

    const sequence = streamer.getRecentCandles(pattern.timeframe);
    const indicatorRows = toIndicatorRows(sequence.slice(-model.config.lookback), pattern.indicators || {});

    try {
      const prediction = await model.predictDirection(sequence, indicatorRows);
      setPrediction(prediction);

      const bridgeResult = bridge?.evaluate?.(pattern, pattern.indicators || {}) || {
        decision: "approve",
        weight: 1,
        reason: "Bridge no configurado",
      };
      state.lastBridgeDecision = bridgeResult.decision || "approve";
      updateBridgeStatus();
      appendLog(`[Bridge] ${(bridgeResult.decision || "approve").toUpperCase()} · ${bridgeResult.reason} (w=${Number(bridgeResult.weight || 1).toFixed(2)})`);

      const featureSequence = sequence.slice(-model.config.lookback).map((candle) =>
        model.buildFeatureVector(candle, pattern.indicators || {}, {
          maxPrice: Math.max(...sequence.slice(-model.config.lookback).map((row) => Number(row.high || row.close || 1)), 1),
          maxVolume: Math.max(...sequence.slice(-model.config.lookback).map((row) => Number(row.volume || 1)), 1),
        }),
      );

      const enrichedPrediction = {
        ...prediction,
        bridgeDecision: bridgeResult.decision,
        bridgeWeight: Number(bridgeResult.weight || 1),
        bridgeReason: bridgeResult.reason || "",
        vetoed: bridgeResult.decision === "veto",
        vetoReason: bridgeResult.decision === "veto" ? bridgeResult.reason : null,
      };

      const stored = store.appendPattern(pattern, enrichedPrediction, featureSequence);
      state.patterns.push(stored);
      state.predictions.push({
        id: stored.id,
        timeframe: pattern.timeframe,
        type: pattern.type,
        prediction: enrichedPrediction,
      });

      appendLog(`✅ ${pattern.type} ${pattern.timeframe} → ${prediction.direction} (${(prediction.confidence * 100).toFixed(1)}%)`);
      refreshStats();
      renderChart(elements.chartTfSelector?.value || pattern.timeframe);
    } catch (error) {
      setStatus(`Error de predicción: ${error.message}`);
    }
  });

  const start = async () => {
    try {
      streamer.config.symbol = (elements.symbolInput?.value || "BTCUSDT").toUpperCase();
      streamer.config.bullishStreakSize = Number(elements.streakInput?.value) || 3;
      streamer.config.bearishStreakSize = Number(elements.bearishStreakInput?.value) || 3;
      streamer.config.timeframes = selectedTimeframes();
      streamer.config.enabledPatterns = elements.patternFilter?.value === "all"
        ? [
          "bullish_consecutive_candles",
          "bearish_consecutive_candles",
          "bullish_engulfing",
          "bearish_engulfing",
          "doji",
          "volume_spike",
          "momentum_acceleration",
        ]
        : [elements.patternFilter.value];

      try {
        await model.loadModel();
        appendLog("💾 Modelo cargado desde IndexedDB");
      } catch {
        await model.init();
        appendLog("🆕 Modelo inicializado");
      }

      active = true;
      streamer.start();
      if (outcomeTimer) clearInterval(outcomeTimer);
      if (statsTimer) clearInterval(statsTimer);
      outcomeTimer = setInterval(() => {
        runOutcomeLoop().catch((error) => setStatus(`Error de outcome loop: ${error.message}`));
      }, 30_000);
      statsTimer = setInterval(refreshStats, 10_000);
      updateTrainingStats();
      updateBridgeStatus();
      setStatus("Gemini Bot activo");
    } catch (error) {
      setStatus(`Error iniciando Gemini Bot: ${error.message}`);
    }
  };

  const stop = async () => {
    active = false;
    streamer.stop();
    if (outcomeTimer) clearInterval(outcomeTimer);
    if (statsTimer) clearInterval(statsTimer);
    outcomeTimer = null;
    statsTimer = null;
    try {
      await model.saveModel();
      setStatus("Gemini Bot detenido · modelo guardado");
    } catch (error) {
      setStatus(`Gemini Bot detenido · fallo guardando modelo: ${error.message}`);
    }
  };

  elements.startBtn?.addEventListener("click", () => {
    start().catch((error) => setStatus(`Error start: ${error.message}`));
  });

  elements.stopBtn?.addEventListener("click", () => {
    stop().catch((error) => setStatus(`Error stop: ${error.message}`));
  });

  elements.exportBtn?.addEventListener("click", () => {
    store.download();
    setStatus("JSON neurona exportado");
  });

  elements.exportTrainingBtn?.addEventListener("click", () => {
    store.downloadTrainingDataset();
    setStatus("Dataset de entrenamiento exportado");
  });

  elements.saveModelBtn?.addEventListener("click", async () => {
    try {
      await model.saveModel();
      setStatus("Modelo guardado en IndexedDB");
    } catch (error) {
      setStatus(`No se pudo guardar modelo: ${error.message}`);
    }
  });

  updateBridgeStatus();

  return {
    streamer,
    model,
    store,
    start,
    stop,
    getChartData(timeframe) {
      return {
        candles: streamer.getRecentCandles(timeframe),
        patterns: state.patterns.filter((row) => row.timeframe === timeframe),
        predictions: state.predictions.filter((row) => row.timeframe === timeframe),
      };
    },
  };
}
