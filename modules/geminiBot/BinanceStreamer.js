import { BinanceKlineWsClient } from "../binanceWs.js";

const DEFAULT_TIMEFRAMES = ["1m", "5m"];

export class BinanceStreamer {
  constructor(config = {}) {
    this.config = {
      symbol: config.symbol || "BTCUSDT",
      timeframes: Array.isArray(config.timeframes) && config.timeframes.length ? config.timeframes : DEFAULT_TIMEFRAMES,
      bullishStreakSize: Number(config.bullishStreakSize) > 1 ? Number(config.bullishStreakSize) : 3,
      maxCandlesPerTf: Number(config.maxCandlesPerTf) > 20 ? Number(config.maxCandlesPerTf) : 200,
    };
    this.clientsByTf = new Map();
    this.candlesByTf = new Map();
    this.listeners = {
      status: new Set(),
      kline: new Set(),
      pattern: new Set(),
    };
    this.connected = false;
  }

  on(eventName, listener) {
    const set = this.listeners[eventName];
    if (!set || typeof listener !== "function") return () => {};
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(eventName, payload) {
    this.listeners[eventName]?.forEach((listener) => listener(payload));
  }

  start() {
    this.stop();
    const { symbol, timeframes } = this.config;
    timeframes.forEach((timeframe) => {
      const client = new BinanceKlineWsClient();
      this.clientsByTf.set(timeframe, client);
      this.candlesByTf.set(timeframe, []);
      client.subscribe(
        { symbol, timeframe },
        {
          onKline: (kline) => this.#handleKline(timeframe, kline),
          onStatus: (status) => {
            this.connected = status?.connected || false;
            this.emit("status", { ...status, timeframe, symbol });
          },
        },
      );
    });
    this.emit("status", {
      type: "started",
      symbol,
      timeframes: [...timeframes],
      connected: this.connected,
      at: new Date().toISOString(),
    });
  }

  stop() {
    this.clientsByTf.forEach((client) => client.unsubscribe());
    this.clientsByTf.clear();
    this.connected = false;
    this.emit("status", { type: "stopped", connected: false, at: new Date().toISOString() });
  }

  getRecentCandles(timeframe) {
    return [...(this.candlesByTf.get(timeframe) || [])];
  }

  #handleKline(timeframe, kline) {
    if (!kline || !kline.isClosed) return;
    const candles = this.candlesByTf.get(timeframe) || [];
    candles.push(kline);
    while (candles.length > this.config.maxCandlesPerTf) candles.shift();
    this.candlesByTf.set(timeframe, candles);
    this.emit("kline", { timeframe, kline, candles: [...candles] });

    const pattern = this.#detectBullishStreak(timeframe, candles);
    if (pattern) this.emit("pattern", pattern);
  }

  #detectBullishStreak(timeframe, candles) {
    const { bullishStreakSize } = this.config;
    if (candles.length < bullishStreakSize) return null;
    const window = candles.slice(-bullishStreakSize);
    const allBullish = window.every((candle) => Number(candle.close) > Number(candle.open));
    if (!allBullish) return null;

    return {
      id: `bull-${timeframe}-${window[0].closeTime}-${window[window.length - 1].closeTime}`,
      type: "bullish_consecutive_candles",
      timeframe,
      symbol: this.config.symbol,
      size: bullishStreakSize,
      candles: window,
      detectedAt: new Date().toISOString(),
    };
  }
}
