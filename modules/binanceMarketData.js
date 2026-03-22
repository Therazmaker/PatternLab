import { normalizeBinanceInterval, normalizeBinanceRestKline, normalizeBinanceSymbol, dedupeAndSortCandles } from "./binanceNormalize.js";
import { BinanceKlineWsClient } from "./binanceWs.js";
import { extractBinanceSymbolMeta, getFallbackBinanceFuturesSymbols } from "./binanceSymbols.js";

const BINANCE_REST_BASE = "https://fapi.binance.com";
const BINANCE_MAX_LIMIT = 1500;

function toQuery(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function sanitizeTimestampParam(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.trunc(numeric);
}

function sanitizeKlinesParams(params = {}) {
  const sanitized = { ...params };

  if ("startTime" in sanitized) {
    const validStart = sanitizeTimestampParam(sanitized.startTime);
    if (!validStart) delete sanitized.startTime;
    else sanitized.startTime = validStart;
  }

  if ("endTime" in sanitized) {
    const validEnd = sanitizeTimestampParam(sanitized.endTime);
    if (!validEnd) delete sanitized.endTime;
    else sanitized.endTime = validEnd;
  }

  return sanitized;
}

async function fetchJson(path, params = {}, debugMeta = null) {
  const query = toQuery(params);
  const url = `${BINANCE_REST_BASE}${path}${query ? `?${query}` : ""}`;
  if (debugMeta) {
    console.log("[binanceMarketData] requesting klines", {
      symbol: debugMeta.symbol,
      interval: debugMeta.interval,
      limit: debugMeta.limit,
      startTime: params.startTime,
      endTime: params.endTime,
      url,
    });
  }
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binance HTTP ${response.status}: ${body.slice(0, 120)}`);
  }
  return response.json();
}

function timeframeToMs(timeframe = "1m") {
  const tf = normalizeBinanceInterval(timeframe);
  const map = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };
  return map[tf] || 300_000;
}

export async function loadBinanceHistoricalCandles({ symbol = "BTCUSDT", timeframe = "5m", limit = 500, endTime = null } = {}) {
  const normalizedSymbol = normalizeBinanceSymbol(symbol);
  const normalizedTimeframe = normalizeBinanceInterval(timeframe);
  const target = Math.max(50, Math.min(5000, Number(limit) || 500));
  const requestedEndTime = sanitizeTimestampParam(endTime);
  const hasDateRangeMode = Boolean(requestedEndTime);

  const candles = [];
  let remaining = target;
  let cursorEnd = requestedEndTime || null;
  let isFirstPage = true;

  while (remaining > 0) {
    const step = Math.min(BINANCE_MAX_LIMIT, remaining);
    const requestParams = sanitizeKlinesParams({
      symbol: normalizedSymbol,
      interval: normalizedTimeframe,
      limit: step,
      // Last-N-bars mode: do not send startTime/endTime on the first page request.
      // Date-range mode (or paginated follow-up pages) can include a valid endTime.
      ...(hasDateRangeMode || !isFirstPage ? { endTime: cursorEnd } : {}),
    });
    const rows = await fetchJson("/fapi/v1/klines", requestParams, {
      symbol: normalizedSymbol,
      interval: normalizedTimeframe,
      limit: step,
    });
    console.log("[binanceMarketData] raw klines response length", {
      length: Array.isArray(rows) ? rows.length : 0,
      symbol: normalizedSymbol,
      interval: normalizedTimeframe,
      limit: step,
      startTime: requestParams.startTime,
      endTime: requestParams.endTime,
    });
    if (!Array.isArray(rows) || rows.length === 0) break;

    const normalizedRows = rows
      .map((row) => normalizeBinanceRestKline(row, { symbol: normalizedSymbol, timeframe: normalizedTimeframe }))
      .filter(Boolean);

    candles.push(...normalizedRows);
    remaining -= normalizedRows.length;

    const firstOpen = Number(rows[0]?.[0]);
    if (!Number.isFinite(firstOpen)) break;
    cursorEnd = firstOpen - timeframeToMs(normalizedTimeframe);
    isFirstPage = false;
    if (rows.length < step) break;
  }

  const finalRows = dedupeAndSortCandles(candles).slice(-target);
  if (finalRows.length === 0) {
    console.error("[binanceMarketData] Binance returned 0 candles. Check request parameters (startTime/endTime).", {
      symbol: normalizedSymbol,
      interval: normalizedTimeframe,
      limit: target,
      endTime: requestedEndTime,
    });
    throw new Error("Binance returned 0 candles. Check request parameters (startTime/endTime).");
  }
  return finalRows;
}

export async function loadBinanceFuturesSymbols() {
  try {
    const info = await fetchJson("/fapi/v1/exchangeInfo");
    return extractBinanceSymbolMeta(info);
  } catch (error) {
    console.warn("[binanceMarketData] exchangeInfo failed, using fallback list", error);
    return getFallbackBinanceFuturesSymbols();
  }
}

export function createBinanceLiveDataFeed(options = {}) {
  const wsClient = new BinanceKlineWsClient(options);

  return {
    subscribe({ symbol, timeframe, onCandle, onStatus }) {
      const normalizedSymbol = normalizeBinanceSymbol(symbol);
      const normalizedTimeframe = normalizeBinanceInterval(timeframe);
      return wsClient.subscribe({ symbol: normalizedSymbol, timeframe: normalizedTimeframe }, {
        onKline: async (candle) => {
          onCandle?.(candle);
        },
        onStatus,
      });
    },
    unsubscribe() {
      wsClient.unsubscribe();
    },
    getStatus() {
      return wsClient.getStatus();
    },
    async resyncLatest({ symbol, timeframe, limit = 3 } = {}) {
      return loadBinanceHistoricalCandles({ symbol, timeframe, limit });
    },
  };
}
