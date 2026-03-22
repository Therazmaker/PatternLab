const BINANCE_SOURCE = "binance-futures";

function toIso(timestampMs) {
  const ts = Number(timestampMs);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function toNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeBinanceInterval(timeframe = "5m") {
  const tf = String(timeframe || "").trim().toLowerCase();
  const map = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "1d": "1d",
  };
  return map[tf] || "5m";
}

export function normalizeBinanceSymbol(symbol = "BTCUSDT") {
  return String(symbol || "BTCUSDT").trim().toUpperCase().replace(/\s+/g, "");
}

function buildBaseCandle({ symbol, timeframe, openTime, closeTime, open, high, low, close, volume, closed }) {
  const normalizedSymbol = normalizeBinanceSymbol(symbol);
  const normalizedTf = normalizeBinanceInterval(timeframe);
  const ts = Number(openTime);
  const idSuffix = Math.floor(ts / 1000);

  return {
    id: `mkt_${normalizedSymbol}_${normalizedTf}_${idSuffix}`,
    asset: normalizedSymbol,
    symbol: normalizedSymbol,
    timeframe: normalizedTf,
    source: BINANCE_SOURCE,
    timestamp: toIso(ts),
    openTime: ts,
    closeTime: Number(closeTime),
    open: toNum(open, 0),
    high: toNum(high, 0),
    low: toNum(low, 0),
    close: toNum(close, 0),
    volume: toNum(volume, 0),
    closed: Boolean(closed),
  };
}

export function normalizeBinanceRestKline(row, { symbol, timeframe } = {}) {
  if (!Array.isArray(row) || row.length < 7) return null;
  return buildBaseCandle({
    symbol,
    timeframe,
    openTime: row[0],
    closeTime: row[6],
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
    closed: true,
  });
}

export function normalizeBinanceWsKline(payload, { symbol, timeframe } = {}) {
  const kline = payload?.k;
  if (!kline) return null;
  return buildBaseCandle({
    symbol: symbol || payload?.s || kline?.s,
    timeframe: timeframe || kline?.i,
    openTime: kline?.t,
    closeTime: kline?.T,
    open: kline?.o,
    high: kline?.h,
    low: kline?.l,
    close: kline?.c,
    volume: kline?.v,
    closed: Boolean(kline?.x),
  });
}

export function dedupeAndSortCandles(candles = []) {
  const byOpenTime = new Map();
  candles.forEach((row) => {
    if (!row || !Number.isFinite(Number(row.openTime))) return;
    byOpenTime.set(Number(row.openTime), row);
  });
  return [...byOpenTime.values()].sort((a, b) => Number(a.openTime) - Number(b.openTime));
}
