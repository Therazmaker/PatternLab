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

async function fetchJson(path, params = {}) {
  const query = toQuery(params);
  const url = `${BINANCE_REST_BASE}${path}${query ? `?${query}` : ""}`;
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

  const candles = [];
  let remaining = target;
  let cursorEnd = Number.isFinite(Number(endTime)) ? Number(endTime) : Date.now();

  while (remaining > 0) {
    const step = Math.min(BINANCE_MAX_LIMIT, remaining);
    const rows = await fetchJson("/fapi/v1/klines", {
      symbol: normalizedSymbol,
      interval: normalizedTimeframe,
      limit: step,
      endTime: cursorEnd,
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
    if (rows.length < step) break;
  }

  return dedupeAndSortCandles(candles).slice(-target);
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
