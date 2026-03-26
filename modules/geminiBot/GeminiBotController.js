import { BinanceStreamer } from "./BinanceStreamer.js";
import { GeminiModel } from "./GeminiModel.js";
import { NeuronStore } from "./NeuronStore.js";
import { createBrainPanelStore } from "./brainPanelStore.js";

export function createGeminiBotController(elements = {}) {
  let active = false;
  let outcomeTimer = null;
  let statsTimer = null;
  let brainPanelStore = null;
  let outcomeLoopRunning = false;

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
    brainPanel: {
      stats: null,
      state: null,
      events: [],
      growth: [],
    },
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

  const pushBrainSnapshot = (snapshot = {}) => {
    state.brainPanel = {
      stats: snapshot.stats || state.brainPanel.stats || null,
      state: snapshot.state || state.brainPanel.state || null,
      events: Array.isArray(snapshot.events) ? snapshot.events : state.brainPanel.events || [],
      growth: Array.isArray(snapshot.growth) ? snapshot.growth : state.brainPanel.growth || [],
    };
    elements.onBrainPanelUpdate?.(state.brainPanel);
  };

  const persistBrainEvent = async (event = {}) => {
    if (!brainPanelStore) return;
    const snapshot = await brainPanelStore.persistEvent(event, state.brainPanel);
    pushBrainSnapshot(snapshot);
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
    const trained = Number(model.stats.trainedCount || model.stats.totalTrained || 0);
    const skipped = Number(model.stats.skippedCount || 0);
    const errors = Number(model.stats.errorCount || 0);
    elements.trainingStats.total.textContent = String(trained);
    if (elements.trainingStats.skipped) elements.trainingStats.skipped.textContent = String(skipped);
    if (elements.trainingStats.errors) elements.trainingStats.errors.textContent = String(errors);
    elements.trainingStats.loss.textContent = Number.isFinite(model.stats.lastTrainLoss) ? model.stats.lastTrainLoss.toFixed(4) : "n/a";
    elements.trainingStats.acc.textContent = Number.isFinite(model.stats.lastTrainAcc) ? `${(model.stats.lastTrainAcc * 100).toFixed(2)}%` : "n/a";
    console.info("[NeuralActivity] header updated");
    console.info(`[NeuralActivity] trained=${trained} skipped=${skipped} errors=${errors}`);
  };

  const refreshStats = () => {
    const stats = store.getStats();
    elements.onStatsUpdate?.(stats, model.stats);
    console.info("[Training] stats updated", { total: stats.total, wins: stats.wins, losses: stats.losses, pending: stats.pending });
  };

  const toIndicatorRows = (sequence, indicator) => sequence.map(() => ({ ...indicator }));

  const renderChart = (timeframe) => {
    const candles = streamer.getRecentCandles(timeframe);
    const patterns = state.patterns.filter((row) => row.timeframe === timeframe);
    const indicators = candles.map((_, idx) => {
      const matching = patterns.find((p) => p.candles?.[p.candles.length - 1]?.closeTime === candles[idx]?.closeTime);
      return matching?.indicators || null;
    });
    // Compute TP/SL/Entry trade levels for pending patterns
    const trades = patterns
      .filter((p) => p.outcome?.result === "pending")
      .slice(-3)
      .map((p) => {
        const entry = Number(p.candles?.[p.candles.length - 1]?.close || 0);
        const atr = Number(p.indicators?.atr14 || 0);
        const isBullish = (p.prediction?.direction || "up") === "up";
        return {
          entry,
          tp: atr > 0 ? (isBullish ? entry + atr * 2 : entry - atr * 2) : null,
          sl: atr > 0 ? (isBullish ? entry - atr : entry + atr) : null,
          direction: p.prediction?.direction || "neutral",
          type: p.type,
          status: "pending",
        };
      });
    elements.onChartUpdate?.(timeframe, candles, patterns, indicators, trades);
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
    if (outcomeLoopRunning) return;
    outcomeLoopRunning = true;
    try {
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
            await persistBrainEvent({
              timestamp: new Date().toISOString(),
              type: "diagnosis",
              patternName: resolved.type,
              outcome: resolved.outcome?.result || null,
              reasonCode: "bridge_veto",
              details: resolved.prediction.vetoReason || "veto",
              meta: { timeframe: resolved.timeframe },
            });
          } else {
            const weight = Number(resolved?.prediction?.bridgeWeight || 1);
            const report = await model.trainOnPattern(resolved.candles, label, customRows, {
              weight,
              patternType: resolved.type,
              timeframe: resolved.timeframe,
              patternId: resolved.id,
            });
            if (report?.skipped) {
              appendLog(`⚠️ Entrenamiento omitido ${resolved.type} (${resolved.timeframe}) · ${report.reason}`);
              await persistBrainEvent({
                timestamp: new Date().toISOString(),
                type: "skipped",
                patternName: resolved.type,
                outcome: resolved.outcome?.result || null,
                reasonCode: report.reason || "insufficient_sequence",
                details: "training skipped",
                meta: { timeframe: resolved.timeframe, receivedCandles: report.receivedCandles || null },
              });
              updateTrainingStats();
              continue;
            }
            updateTrainingStats();
            appendLog(`🧠 Entrenado ${resolved.type} (${resolved.timeframe}) → ${resolved.outcome.result} | w=${weight.toFixed(2)} | loss=${Number(report.loss || 0).toFixed(4)}`);
            await persistBrainEvent({
              timestamp: new Date().toISOString(),
              type: "trained",
              patternName: resolved.type,
              outcome: resolved.outcome?.result || null,
              reasonCode: "fit_success",
              loss: report.loss,
              acc: report.accuracy,
              details: "training completed",
              meta: { timeframe: resolved.timeframe, weight },
            });
          }
        } catch (error) {
          if (model.stats.lastEventType !== "error") {
            model.stats.errorCount = Number(model.stats.errorCount || 0) + 1;
            model.stats.lastEventType = "error";
            model.stats.lastTrainingReason = error?.message || "unknown_error";
            model.stats.lastTrainLoss = null;
            model.stats.lastTrainAcc = null;
          }
          setStatus(`Error entrenando: ${error.message}`);
          appendLog(`❌ Error entrenando ${resolved.type} (${resolved.timeframe}) · ${error.message}`);
          console.error(`[Training] fit failed: ${error.message}`);
          updateTrainingStats();
          await persistBrainEvent({
            timestamp: new Date().toISOString(),
            type: "error",
            patternName: resolved.type,
            outcome: resolved.outcome?.result || null,
            reasonCode: error?.message || "fit_failed",
            details: error?.message || "training error",
            meta: { timeframe: resolved.timeframe },
          });
        }

        const suggestions = bridge?.suggestNeurons?.(store.getResolvedRecent(20), state.lastIndicators[resolved.timeframe] || {});
        if (Array.isArray(suggestions)) elements.onSuggestionsUpdate?.(suggestions);
      }
      refreshStats();
    } finally {
      outcomeLoopRunning = false;
    }
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
    console.info("[Training] pattern detected", { id: pattern?.id || pattern?.eventId || null, type: pattern?.type, timeframe: pattern?.timeframe });

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
      await persistBrainEvent({
        timestamp: new Date().toISOString(),
        type: "neuron_saved",
        patternName: pattern.type,
        outcome: null,
        reasonCode: "pattern_captured",
        details: "neuron sample appended",
        meta: { timeframe: pattern.timeframe, eventId: stored.id },
      });
      refreshStats();
      renderChart(elements.chartTfSelector?.value || pattern.timeframe);
    } catch (error) {
      setStatus(`Error de predicción: ${error.message}`);
    }
  });

  const start = async () => {
    try {
      if (active) {
        setStatus("Gemini Bot ya está activo");
        return;
      }
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
    document.getElementById("gb-status-dot")?.classList.remove("is-active");
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
  createBrainPanelStore()
    .then(async (storeAdapter) => {
      brainPanelStore = storeAdapter;
      const hydrated = await brainPanelStore.hydrate();
      pushBrainSnapshot(hydrated);
    })
    .catch((error) => {
      console.error("[BrainPanel] hydration failed", error);
      pushBrainSnapshot({
        stats: {
          trainedCount: Number(model.stats.trainedCount || 0),
          skippedCount: Number(model.stats.skippedCount || 0),
          errorCount: Number(model.stats.errorCount || 0),
          neuronsSavedCount: 0,
          lastTrainLoss: model.stats.lastTrainLoss,
          lastTrainAcc: model.stats.lastTrainAcc,
          patternStats: {},
          reasonStats: { skip: {}, loss: {}, success: {} },
        },
        state: { brainReady: false, initializedAt: new Date().toISOString(), lastHydratedAt: null },
        events: [],
        growth: [],
      });
    });

  return {
    streamer,
    model,
    store,
    start,
    stop,
    logBrainEvent(event = {}) {
      persistBrainEvent(event).catch((error) => console.error("[BrainPanel] event logging failed", error));
    },
    async refreshBrainPanel() {
      if (!brainPanelStore) return;
      const hydrated = await brainPanelStore.hydrate();
      pushBrainSnapshot(hydrated);
    },
    getChartData(timeframe) {
      return {
        candles: streamer.getRecentCandles(timeframe),
        patterns: state.patterns.filter((row) => row.timeframe === timeframe),
        predictions: state.predictions.filter((row) => row.timeframe === timeframe),
      };
    },
  };
}
