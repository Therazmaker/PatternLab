import { BinanceKlineWsClient } from "../binanceWs.js";

const DEFAULT_TIMEFRAMES = ["1m", "5m"];
const DEFAULT_ENABLED_PATTERNS = [
  "bullish_consecutive_candles",
  "bearish_consecutive_candles",
  "bullish_engulfing",
  "bearish_engulfing",
  "doji",
  "volume_spike",
  "momentum_acceleration",
];

export class BinanceStreamer {
  constructor(config = {}) {
    this.config = {
      symbol: config.symbol || "BTCUSDT",
      timeframes: Array.isArray(config.timeframes) && config.timeframes.length ? config.timeframes : DEFAULT_TIMEFRAMES,
      bullishStreakSize: Number(config.bullishStreakSize) > 1 ? Number(config.bullishStreakSize) : 3,
      bearishStreakSize: Number(config.bearishStreakSize) > 1 ? Number(config.bearishStreakSize) : 3,
      maxCandlesPerTf: Number(config.maxCandlesPerTf) > 20 ? Number(config.maxCandlesPerTf) : 200,
      enabledPatterns: Array.isArray(config.enabledPatterns) && config.enabledPatterns.length
        ? [...new Set(config.enabledPatterns)]
        : [...DEFAULT_ENABLED_PATTERNS],
    };
    this.clientsByTf = new Map();
    this.candlesByTf = new Map();
    this.patternsByTf = new Map();
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
      this.patternsByTf.set(timeframe, []);
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

  getRecentPatterns(timeframe) {
    return [...(this.patternsByTf.get(timeframe) || [])];
  }

  getLastClose(timeframe) {
    const candles = this.candlesByTf.get(timeframe) || [];
    const last = candles[candles.length - 1];
    return Number(last?.close || 0) || null;
  }

  #handleKline(timeframe, kline) {
    if (!kline || !(kline.closed ?? kline.isClosed)) return;
    const candles = this.candlesByTf.get(timeframe) || [];
    candles.push(kline);
    while (candles.length > this.config.maxCandlesPerTf) candles.shift();
    this.candlesByTf.set(timeframe, candles);

    const indicators = this.#computeIndicators(candles);
    this.emit("kline", { timeframe, kline, candles: [...candles], indicators });

    const detected = this.#detectPatterns(timeframe, candles, indicators);
    detected.forEach((pattern) => {
      const tfPatterns = this.patternsByTf.get(timeframe) || [];
      tfPatterns.push(pattern);
      while (tfPatterns.length > this.config.maxCandlesPerTf) tfPatterns.shift();
      this.patternsByTf.set(timeframe, tfPatterns);
      this.emit("pattern", pattern);
    });
  }

  #detectPatterns(timeframe, candles, indicators) {
    const emitted = [];
    const byType = [
      this.#detectBullishStreak(timeframe, candles, indicators),
      this.#detectBearishStreak(timeframe, candles, indicators),
      this.#detectEngulfing(timeframe, candles, indicators),
      this.#detectDoji(timeframe, candles, indicators),
      this.#detectVolumeSpike(timeframe, candles, indicators),
      this.#detectMomentumAcceleration(timeframe, candles, indicators),
    ].flat().filter(Boolean);

    byType.forEach((pattern) => {
      if (!this.config.enabledPatterns.includes(pattern.type)) return;
      const existing = this.patternsByTf.get(timeframe) || [];
      if (existing.some((row) => row.id === pattern.id)) return;
      emitted.push(pattern);
    });

    return emitted;
  }

  #patternBase(type, timeframe, window, size, indicators) {
    const start = window[0];
    const end = window[window.length - 1];
    return {
      id: `${type}-${timeframe}-${start?.closeTime}-${end?.closeTime}`,
      type,
      timeframe,
      symbol: this.config.symbol,
      size,
      candles: window,
      indicators,
      detectedAt: new Date().toISOString(),
    };
  }

  #detectBullishStreak(timeframe, candles, indicators) {
    const { bullishStreakSize } = this.config;
    if (candles.length < bullishStreakSize) return null;
    const window = candles.slice(-bullishStreakSize);
    const allBullish = window.every((candle) => Number(candle.close) > Number(candle.open));
    if (!allBullish) return null;
    return this.#patternBase("bullish_consecutive_candles", timeframe, window, bullishStreakSize, indicators);
  }

  #detectBearishStreak(timeframe, candles, indicators) {
    const { bearishStreakSize } = this.config;
    if (candles.length < bearishStreakSize) return null;
    const window = candles.slice(-bearishStreakSize);
    const allBearish = window.every((candle) => Number(candle.close) < Number(candle.open));
    if (!allBearish) return null;
    return this.#patternBase("bearish_consecutive_candles", timeframe, window, bearishStreakSize, indicators);
  }

  #detectEngulfing(timeframe, candles, indicators) {
    if (candles.length < 2) return null;
    const prev = candles[candles.length - 2];
    const last = candles[candles.length - 1];

    const prevBodyLow = Math.min(Number(prev.open), Number(prev.close));
    const prevBodyHigh = Math.max(Number(prev.open), Number(prev.close));
    const lastBodyLow = Math.min(Number(last.open), Number(last.close));
    const lastBodyHigh = Math.max(Number(last.open), Number(last.close));
    const engulfed = lastBodyLow <= prevBodyLow && lastBodyHigh >= prevBodyHigh;
    if (!engulfed) return null;

    const lastBullish = Number(last.close) > Number(last.open);
    const type = lastBullish ? "bullish_engulfing" : "bearish_engulfing";
    return this.#patternBase(type, timeframe, [prev, last], 2, indicators);
  }

  #detectDoji(timeframe, candles, indicators) {
    if (candles.length < 1) return null;
    const last = candles[candles.length - 1];
    const range = Math.max(0, Number(last.high) - Number(last.low));
    if (!range) return null;
    const body = Math.abs(Number(last.close) - Number(last.open));
    if (body / range >= 0.1) return null;
    return this.#patternBase("doji", timeframe, [last], 1, indicators);
  }

  #detectVolumeSpike(timeframe, candles, indicators) {
    if (candles.length < 11) return null;
    const last = candles[candles.length - 1];
    const prev10 = candles.slice(-11, -1);
    const avg10 = prev10.reduce((acc, row) => acc + Number(row.volume || 0), 0) / prev10.length;
    const vol = Number(last.volume || 0);
    if (!avg10 || vol <= avg10 * 2) return null;
    return this.#patternBase("volume_spike", timeframe, [...prev10, last], 11, indicators);
  }

  #detectMomentumAcceleration(timeframe, candles, indicators) {
    if (candles.length < 3) return null;
    const last3 = candles.slice(-3);
    const bodies = last3.map((row) => Math.abs(Number(row.close) - Number(row.open)));
    if (!(bodies[0] < bodies[1] && bodies[1] < bodies[2])) return null;
    return this.#patternBase("momentum_acceleration", timeframe, last3, 3, indicators);
  }

  #computeIndicators(candles) {
    const closes = candles.map((c) => Number(c.close || 0));
    const highs = candles.map((c) => Number(c.high || 0));
    const lows = candles.map((c) => Number(c.low || 0));
    const volumes = candles.map((c) => Number(c.volume || 0));
    const last = candles[candles.length - 1] || {};
    const lastClose = Number(last.close || 0);
    const lastOpen = Number(last.open || 0);

    const ema9 = this.#ema(closes, 9);
    const ema21 = this.#ema(closes, 21);
    const rsi14 = this.#rsi(closes, 14);
    const atr14 = this.#atr(highs, lows, closes, 14);

    const prev10Volumes = volumes.slice(-11, -1);
    const avg10Volume = prev10Volumes.length
      ? prev10Volumes.reduce((acc, value) => acc + value, 0) / prev10Volumes.length
      : null;
    const volumeRatio = avg10Volume ? Number((Number(last.volume || 0) / avg10Volume).toFixed(6)) : null;

    const range = Math.max(0, Number(last.high || 0) - Number(last.low || 0));
    const upperWick = Math.max(0, Number(last.high || 0) - Math.max(lastOpen, lastClose));
    const lookbackN = Math.max(1, Math.min(candles.length, this.config.bullishStreakSize || 3));
    const firstClose = Number(candles[candles.length - lookbackN]?.close || lastClose || 0);

    return {
      rsi14,
      ema9,
      ema21,
      atr14,
      volumeRatio,
      bodyPct: lastOpen ? (lastClose - lastOpen) / lastOpen : 0,
      wickRatio: range ? upperWick / range : 0,
      priceChangeAbs: lastClose - firstClose,
    };
  }

  #ema(values, period) {
    if (!values.length || values.length < period) return null;
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    for (let i = period; i < values.length; i += 1) {
      ema = values[i] * k + ema * (1 - k);
    }
    return Number.isFinite(ema) ? ema : null;
  }

  #rsi(closes, period = 14) {
    if (closes.length <= period) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i += 1) {
      const delta = closes[i] - closes[i - 1];
      if (delta > 0) gains += delta;
      else losses -= delta;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i += 1) {
      const delta = closes[i] - closes[i - 1];
      const gain = Math.max(delta, 0);
      const loss = Math.max(-delta, 0);
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  #atr(highs, lows, closes, period = 14) {
    if (highs.length <= period || lows.length <= period || closes.length <= period) return null;
    const trueRanges = [];
    for (let i = 1; i < closes.length; i += 1) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      );
      trueRanges.push(tr);
    }

    if (trueRanges.length < period) return null;
    let atr = trueRanges.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    for (let i = period; i < trueRanges.length; i += 1) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }
    return Number.isFinite(atr) ? atr : null;
  }
}
