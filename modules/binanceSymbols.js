const FALLBACK_SYMBOLS = [
  { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", pricePrecision: 2, quantityPrecision: 3 },
  { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT", pricePrecision: 2, quantityPrecision: 3 },
  { symbol: "SOLUSDT", baseAsset: "SOL", quoteAsset: "USDT", pricePrecision: 3, quantityPrecision: 1 },
  { symbol: "BNBUSDT", baseAsset: "BNB", quoteAsset: "USDT", pricePrecision: 2, quantityPrecision: 2 },
  { symbol: "XRPUSDT", baseAsset: "XRP", quoteAsset: "USDT", pricePrecision: 4, quantityPrecision: 1 },
];

export function getFallbackBinanceFuturesSymbols() {
  return [...FALLBACK_SYMBOLS];
}

export function extractBinanceSymbolMeta(exchangeInfo = {}) {
  const rows = Array.isArray(exchangeInfo?.symbols) ? exchangeInfo.symbols : [];
  const parsed = rows
    .filter((row) => row?.contractType === "PERPETUAL" && row?.quoteAsset === "USDT" && row?.status === "TRADING")
    .map((row) => ({
      symbol: row.symbol,
      baseAsset: row.baseAsset,
      quoteAsset: row.quoteAsset,
      pricePrecision: Number(row.pricePrecision),
      quantityPrecision: Number(row.quantityPrecision),
      triggerProtect: Number(row.triggerProtect),
    }));

  if (!parsed.length) return getFallbackBinanceFuturesSymbols();
  return parsed;
}
