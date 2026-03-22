
import { createBinanceLiveDataFeed, loadBinanceFuturesSymbols, loadBinanceHistoricalCandles } from "./binanceMarketData.js";
import { normalizeBinanceInterval } from "./binanceNormalize.js";

const MARKET_DATA_SOURCES = {
  YAHOO: "yahoo",
  BINANCE_FUTURES: "binance-futures",
};

const binanceLiveFeed = createBinanceLiveDataFeed();
let activeLiveSubscription = null;

function normalizeSource(source = MARKET_DATA_SOURCES.YAHOO) {
  return String(source || MARKET_DATA_SOURCES.YAHOO).trim().toLowerCase();
}

/**
 * modules/marketData.js
 * Market data collector for EURUSD 5m candles via Yahoo Finance public chart endpoint.
 * Kept fully independent from the signals domain.
 */

const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

function parseTimeframeMs(timeframe = "5m") {
  if (typeof timeframe !== "string") return 5 * 60 * 1000;
  const normalized = timeframe.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(m|h|d|wk|mo)$/);
  if (!match) return 5 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  if (unit === "wk") return value * 7 * 24 * 60 * 60 * 1000;
  if (unit === "mo") return value * 30 * 24 * 60 * 60 * 1000;
  return 5 * 60 * 1000;
}

function getCandleTime(candle) {
  if (!candle?.timestamp) return null;
  const time = new Date(candle.timestamp).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Fetch raw candle data from Yahoo Finance.
 * @param {{ symbol?: string, interval?: string, range?: string }} options
 * @returns {Promise<object>} Raw Yahoo Finance API response
 */
export async function fetchYahooCandles({ symbol = "EURUSD=X", interval = "5m", range = "5d" } = {}) {
  const SUPPORTED_INTERVALS = ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"];
  const SUPPORTED_RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"];

  if (!SUPPORTED_INTERVALS.includes(interval)) {
    throw new Error(`Intervalo no soportado: ${interval}. Válidos: ${SUPPORTED_INTERVALS.join(", ")}`);
  }
  if (!SUPPORTED_RANGES.includes(range)) {
    throw new Error(`Rango no soportado: ${range}. Válidos: ${SUPPORTED_RANGES.join(", ")}`);
  }

  const url = `${YAHOO_BASE_URL}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  let response;
  try {
    response = await fetch(url);
  } catch (networkError) {
    throw new Error(`Error de red al conectar con Yahoo Finance: ${networkError.message}`);
  }

  if (!response.ok) {
    throw new Error(`Yahoo Finance respondió con error HTTP ${response.status}: ${response.statusText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error("Respuesta de Yahoo Finance no es JSON válido.");
  }

  return json;
}

/**
 * Normalize raw Yahoo Finance API response into flat candle objects.
 * @param {object} apiResponse
 * @param {{ symbol?: string, interval?: string }} meta
 * @returns {{ candles: object[], errors: string[] }}
 */
export function normalizeYahooCandles(apiResponse, { symbol = "EURUSD=X", interval = "5m" } = {}) {
  const errors = [];

  if (!apiResponse || typeof apiResponse !== "object") {
    return { candles: [], errors: ["Respuesta de API nula o inválida."] };
  }

  const chart = apiResponse?.chart;
  if (!chart || typeof chart !== "object") {
    return { candles: [], errors: ["Respuesta sin bloque 'chart'."] };
  }

  if (chart.error) {
    return { candles: [], errors: [`Yahoo Finance error: ${chart.error.description || JSON.stringify(chart.error)}`] };
  }

  const results = chart.result;
  if (!Array.isArray(results) || results.length === 0) {
    return { candles: [], errors: ["chart.result vacío o ausente."] };
  }

  const result = results[0];
  const timestamps = result?.timestamp;
  const indicators = result?.indicators;
  const quote = indicators?.quote?.[0];

  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    return { candles: [], errors: ["No hay timestamps en la respuesta."] };
  }

  if (!quote) {
    return { candles: [], errors: ["No hay datos OHLCV en indicators.quote[0]."] };
  }

  const { open: opens, high: highs, low: lows, close: closes, volume: volumes } = quote;

  // Derive asset name from meta.symbol, stripping Yahoo suffixes (e.g. "=X")
  const asset = symbol.replace(/=X$/i, "").toUpperCase() || "EURUSD";
  const timeframe = interval;

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const open = opens?.[i];
    const high = highs?.[i];
    const low = lows?.[i];
    const close = closes?.[i];
    const volume = volumes?.[i] ?? null;

    // Skip candles with null/undefined OHLC (partial or incomplete data)
    if (ts == null || open == null || high == null || low == null || close == null) {
      errors.push(`Vela ${i} descartada: valores OHLC nulos (timestamp=${ts}).`);
      continue;
    }

    const timestamp = new Date(ts * 1000).toISOString();
    const id = `mkt_${asset}_${timeframe}_${ts}`;

    candles.push({
      id,
      asset,
      timeframe,
      source: "yahoo",
      timestamp,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: volume !== null ? Number(volume) : null,
    });
  }

  return { candles, errors };
}

/**
 * Remove candles from incomingCandles that already exist in existingCandles
 * (deduplication by id which encodes asset+timeframe+unix timestamp).
 * @param {object[]} existingCandles
 * @param {object[]} incomingCandles
 * @returns {object[]} Only the truly new candles
 */
export function dedupeCandles(existingCandles, incomingCandles) {
  if (!Array.isArray(existingCandles) || !Array.isArray(incomingCandles)) return [];
  const existingIds = new Set(existingCandles.map((c) => c.id));
  return incomingCandles.filter((c) => c && c.id && !existingIds.has(c.id));
}

/**
 * Merge incoming candles into existing candles, deduplicating first.
 * Result is sorted by timestamp ascending.
 * @param {object[]} existingCandles
 * @param {object[]} incomingCandles
 * @returns {object[]} Merged and sorted candle array
 */
export function mergeCandles(existingCandles, incomingCandles) {
  const existing = Array.isArray(existingCandles) ? existingCandles : [];
  const incoming = Array.isArray(incomingCandles) ? incomingCandles : [];
  const newOnes = dedupeCandles(existing, incoming);
  const merged = [...existing, ...newOnes];
  merged.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return merged;
}

/**
 * Return the ISO timestamp of the latest stored candle, or null.
 * @param {object[]} candles
 * @returns {string|null}
 */
export function getLatestCandleTimestamp(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  return candles.reduce((latest, c) => (c.timestamp > latest ? c.timestamp : latest), candles[0].timestamp);
}

/**
 * Return the ISO timestamp of the earliest stored candle, or null.
 * @param {object[]} candles
 * @returns {string|null}
 */
export function getEarliestCandleTimestamp(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  return candles.reduce((earliest, c) => (c.timestamp < earliest ? c.timestamp : earliest), candles[0].timestamp);
}

// ─── Helpers for future pattern engine ──────────────────────────────────────

/**
 * Filter candles by asset and timeframe.
 * @param {object[]} candles
 * @param {string} asset  e.g. "EURUSD"
 * @param {string} timeframe  e.g. "5m"
 * @returns {object[]}
 */
export function getCandlesByAssetAndTf(candles, asset, timeframe) {
  if (!Array.isArray(candles)) return [];
  return candles.filter(
    (c) => c.asset === asset && c.timeframe === timeframe
  );
}

/**
 * Filter candles whose timestamp falls within [start, end] (ISO strings or Date objects).
 * Inclusive on both ends.
 * @param {object[]} candles
 * @param {string|Date} start
 * @param {string|Date} end
 * @returns {object[]}
 */
export function getCandlesInRange(candles, start, end) {
  if (!Array.isArray(candles)) return [];
  const startTs = new Date(start).toISOString();
  const endTs = new Date(end).toISOString();
  return candles.filter((c) => c.timestamp >= startTs && c.timestamp <= endTs);
}

/**
 * Parse and validate candles from a JSON File object.
 * Supports both a plain array and a wrapped { candles: [] } format (e.g. PatternLab export).
 * Required candle fields: timestamp, open, high, low, close.
 * Optional fields: id, volume, asset, timeframe, source.
 * If asset/timeframe/source are absent, the values from `defaults` are used.
 * Invalid rows are skipped with a console warning.
 *
 * @param {File} file - JSON file to import
 * @param {{ asset?: string, timeframe?: string, source?: string }} defaults - Fallback values
 * @returns {Promise<{ candles: object[], total: number, valid: number, invalid: number, errors: string[] }>}
 */
export function importCandlesFromFile(file, { asset = "UNKNOWN", timeframe = "unknown", source = "import" } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided."));
      return;
    }

    console.log("[marketData] import started:", file.name);

    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Error reading file."));

    reader.onload = (e) => {
      const text = e.target.result;

      if (!text || text.trim() === "") {
        reject(new Error("Empty file."));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        reject(new Error("Invalid JSON: could not parse file contents."));
        return;
      }

      // Support plain array or PatternLab export wrapper { candles: [] }
      let rows;
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (parsed && Array.isArray(parsed.candles)) {
        rows = parsed.candles;
      } else {
        reject(new Error("JSON must be an array of candles or an object with a 'candles' array."));
        return;
      }

      console.log("[marketData] candles parsed:", rows.length);

      const candles = [];
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (!row || typeof row !== "object") {
          console.warn(`[marketData] Row ${i} skipped: not an object.`);
          errors.push(`Row ${i}: not an object.`);
          continue;
        }

        const { id, timestamp, open, high, low, close } = row;
        const volume = row.volume !== undefined ? row.volume : null;

        if (!timestamp) {
          console.warn(`[marketData] Row ${i} skipped: missing timestamp.`);
          errors.push(`Row ${i}: missing timestamp.`);
          continue;
        }

        const ts = new Date(timestamp);
        if (isNaN(ts.getTime())) {
          console.warn(`[marketData] Row ${i} skipped: invalid timestamp "${timestamp}".`);
          errors.push(`Row ${i}: invalid timestamp "${timestamp}".`);
          continue;
        }

        const o = Number(open);
        const h = Number(high);
        const l = Number(low);
        const c = Number(close);

        if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) {
          console.warn(`[marketData] Row ${i} skipped: invalid OHLC values.`);
          errors.push(`Row ${i}: invalid OHLC values (open=${open}, high=${high}, low=${low}, close=${close}).`);
          continue;
        }

        // Infer optional fields from defaults when absent
        const candleAsset = row.asset || asset;
        const candleTimeframe = row.timeframe || timeframe;
        const candleSource = row.source || source;

        const unixSeconds = Math.floor(ts.getTime() / 1000);
        const candleId = id || `mkt_${candleAsset}_${candleTimeframe}_${unixSeconds}`;

        candles.push({
          id: candleId,
          asset: candleAsset,
          timeframe: candleTimeframe,
          source: candleSource,
          timestamp: ts.toISOString(),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: (volume !== null && volume !== undefined && !isNaN(Number(volume))) ? Number(volume) : null,
        });
      }

      console.log("[marketData] candles validated:", candles.length, "valid,", errors.length, "invalid.");

      resolve({
        candles,
        total: rows.length,
        valid: candles.length,
        invalid: errors.length,
        errors,
      });
    };

    reader.readAsText(file);
  });
}

/**
 * Slice candles into session-like chunks based on a session config.
 * Each session slice covers one calendar date (UTC) by default.
 * @param {object[]} candles - Sorted candles for a single asset+TF.
 * @param {{ sliceByDate?: boolean, sessionStartHour?: number, sessionEndHour?: number }} sessionConfig
 * @returns {{ date: string, candles: object[] }[]}
 */
export function buildSessionSlices(candles, sessionConfig = {}) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const { sliceByDate = true } = sessionConfig;

  if (!sliceByDate) return [{ date: "all", candles }];

  const byDate = new Map();
  for (const candle of candles) {
    const date = candle.timestamp.slice(0, 10); // YYYY-MM-DD
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(candle);
  }

  return [...byDate.entries()].map(([date, dateCandles]) => ({ date, candles: dateCandles }));
}

export function findDuplicateCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const seen = new Set();
  const duplicates = [];
  candles.forEach((candle, index) => {
    const key = candle?.id || candle?.timestamp;
    if (!key) return;
    if (seen.has(key)) {
      duplicates.push({ index, candle });
      return;
    }
    seen.add(key);
  });
  return duplicates;
}

export function findOutOfOrderCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return [];
  const outOfOrder = [];
  for (let i = 1; i < candles.length; i++) {
    const prevTime = getCandleTime(candles[i - 1]);
    const currTime = getCandleTime(candles[i]);
    if (prevTime === null || currTime === null) continue;
    if (currTime < prevTime) {
      outOfOrder.push({ index: i, previous: candles[i - 1], current: candles[i] });
    }
  }
  return outOfOrder;
}

export function findMissingCandleGaps(candles, timeframe = "5m") {
  if (!Array.isArray(candles) || candles.length < 2) return [];
  const stepMs = parseTimeframeMs(timeframe);
  const sorted = [...candles].sort((a, b) => {
    const ta = getCandleTime(a) ?? 0;
    const tb = getCandleTime(b) ?? 0;
    return ta - tb;
  });

  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevTime = getCandleTime(sorted[i - 1]);
    const currTime = getCandleTime(sorted[i]);
    if (prevTime === null || currTime === null) continue;

    const diff = currTime - prevTime;
    if (diff <= stepMs) continue;

    const missingCount = Math.floor(diff / stepMs) - 1;
    if (missingCount <= 0) continue;

    gaps.push({
      from: new Date(prevTime).toISOString(),
      to: new Date(currTime).toISOString(),
      missingCount,
    });
  }

  return gaps;
}

export function runMarketDataIntegrityCheck(candles, timeframe = "5m") {
  const safeCandles = Array.isArray(candles) ? candles : [];
  const duplicates = findDuplicateCandles(safeCandles);
  const outOfOrder = findOutOfOrderCandles(safeCandles);
  const gaps = findMissingCandleGaps(safeCandles, timeframe);

  return {
    total: safeCandles.length,
    duplicates: duplicates.length,
    outOfOrder: outOfOrder.length,
    gaps,
    isHealthy: duplicates.length === 0 && outOfOrder.length === 0 && gaps.length === 0,
  };
}

export function enrichCandle(candle) {
  if (!candle || typeof candle !== "object") return null;
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  if (![open, high, low, close].every(Number.isFinite)) return { ...candle };

  const range = high - low;
  const bodySize = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const bullish = close > open;
  const bearish = close < open;
  const bodyPercentOfRange = range > 0 ? (bodySize / range) * 100 : 0;

  return {
    ...candle,
    range,
    bodySize,
    upperWick,
    lowerWick,
    bullish,
    bearish,
    bodyPercentOfRange,
  };
}

export function enrichCandles(candles) {
  if (!Array.isArray(candles)) return [];
  return candles.map((candle) => enrichCandle(candle));
}


// Source-aware market data facade (compatible with existing callers)
export async function loadHistoricalCandles(options = {}) {
  const source = normalizeSource(options.source);
  if (source === MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    const symbol = options.symbol || options.asset || "BTCUSDT";
    const timeframe = normalizeBinanceInterval(options.timeframe || options.interval || "5m");
    const limit = Number(options.limit) || 500;
    return loadBinanceHistoricalCandles({ symbol, timeframe, limit, endTime: options.endTime });
  }

  const symbol = options.symbol || "EURUSD=X";
  const interval = options.interval || options.timeframe || "5m";
  const range = options.range || "5d";
  const raw = await fetchYahooCandles({ symbol, interval, range });
  const { candles } = normalizeYahooCandles(raw, { symbol, interval });
  return candles;
}

export async function subscribeLiveCandles(options = {}, handlers = {}) {
  const source = normalizeSource(options.source);
  if (activeLiveSubscription && activeLiveSubscription.source !== source) {
    unsubscribeLiveCandles();
  }

  if (source !== MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    return { token: null, source, status: "unsupported-live-source" };
  }

  const token = binanceLiveFeed.subscribe({
    symbol: options.symbol || options.asset || "BTCUSDT",
    timeframe: options.timeframe || options.interval || "5m",
    onCandle: (candle) => {
      handlers.onCandle?.(candle);
      if (candle.closed) handlers.onCandleClose?.(candle);
      else handlers.onCandleUpdate?.(candle);
    },
    onStatus: (status) => handlers.onStatus?.(status),
  });

  activeLiveSubscription = { token, source, symbol: options.symbol || options.asset, timeframe: options.timeframe || options.interval };
  return { token, source, status: "subscribed" };
}

export function unsubscribeLiveCandles() {
  if (!activeLiveSubscription) return;
  if (activeLiveSubscription.source === MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    binanceLiveFeed.unsubscribe();
  }
  activeLiveSubscription = null;
}

export async function getAvailableSymbols(options = {}) {
  const source = normalizeSource(options.source);
  if (source === MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    return loadBinanceFuturesSymbols();
  }
  return [
    { symbol: "EURUSD=X", baseAsset: "EUR", quoteAsset: "USD" },
    { symbol: "GBPUSD=X", baseAsset: "GBP", quoteAsset: "USD" },
    { symbol: "USDJPY=X", baseAsset: "USD", quoteAsset: "JPY" },
    { symbol: "AUDUSD=X", baseAsset: "AUD", quoteAsset: "USD" },
  ];
}

export function getSourceStatus(options = {}) {
  const source = normalizeSource(options.source);
  if (source === MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    return {
      source,
      ...binanceLiveFeed.getStatus(),
      activeSubscription: activeLiveSubscription,
    };
  }
  return {
    source,
    connected: true,
    stream: null,
    activeSubscription: activeLiveSubscription,
  };
}

export async function resyncLatestCandles(options = {}) {
  const source = normalizeSource(options.source);
  if (source === MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    return binanceLiveFeed.resyncLatest({ symbol: options.symbol || options.asset, timeframe: options.timeframe || options.interval, limit: options.limit || 3 });
  }
  return loadHistoricalCandles({ ...options, range: options.range || "1d" });
}

export { MARKET_DATA_SOURCES };
