/**
 * modules/marketData.js
 * Market data collector for EURUSD 5m candles via Yahoo Finance public chart endpoint.
 * Kept fully independent from the signals domain.
 */

const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

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
