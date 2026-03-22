import { computeFeatureSnapshot } from "./featureEngine.js";
import { analyzeMarketStructure } from "./marketStructure.js";
import { classifyMarketRegime } from "./marketRegime.js";

const CONTEXT_SIZE = 20;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCandle(candle = {}) {
  return {
    open: toNumber(candle.open, 0),
    high: toNumber(candle.high, 0),
    low: toNumber(candle.low, 0),
    close: toNumber(candle.close, 0),
    volume: toNumber(candle.volume, 0),
    timestamp: candle.timestamp || null,
  };
}

function buildSwingStructure(structure = {}) {
  const highs = structure?.swings?.highs || [];
  const lows = structure?.swings?.lows || [];
  if (highs.length < 2 || lows.length < 2) return "range";

  const highStart = Number(highs[highs.length - 2]?.price);
  const highEnd = Number(highs[highs.length - 1]?.price);
  const lowStart = Number(lows[lows.length - 2]?.price);
  const lowEnd = Number(lows[lows.length - 1]?.price);

  if ([highStart, highEnd, lowStart, lowEnd].some((value) => !Number.isFinite(value))) return "range";
  if (highEnd > highStart && lowEnd > lowStart) return "HH_HL";
  if (highEnd < highStart && lowEnd < lowStart) return "LH_LL";
  return "range";
}

function mapVolatilityState(state) {
  if (state === "low" || state === "high") return state;
  return "medium";
}

export function createLiveContextRecorder({ getCandles, logger = console } = {}) {
  const candleProvider = typeof getCandles === "function" ? getCandles : () => [];

  async function getContextSnapshot(symbol, timeframe = "5m") {
    const candles = await Promise.resolve(candleProvider(symbol, timeframe));
    const rows = Array.isArray(candles) ? candles : [];
    const context = rows.slice(-CONTEXT_SIZE);

    if (!context.length) {
      const emptyFeature = computeFeatureSnapshot([]);
      const emptyRegime = classifyMarketRegime(emptyFeature);
      const snapshot = {
        candles: [],
        features: {
          ema_fast: 0,
          ema_slow: 0,
          ema_slope: 0,
          rsi: 50,
          atr: 0,
          momentum: 0,
          volatility_state: "medium",
          compression: false,
          expansion: false,
        },
        structure: null,
        regime: emptyRegime.regime,
      };
      logger.debug("Context snapshot captured", { symbol, timeframe, candles: 0, structureAvailable: false });
      return snapshot;
    }

    const feature = computeFeatureSnapshot(rows, rows.length - 1);
    const regime = classifyMarketRegime(feature);

    let structure = null;
    if (rows.length >= 5) {
      const latestClose = toNumber(rows[rows.length - 1]?.close, null);
      const structureSnapshot = analyzeMarketStructure(rows, {
        candleIndex: rows.length - 1,
        priceRef: latestClose,
        lookback: 120,
      });
      structure = {
        distance_to_support: Number.isFinite(Number(structureSnapshot.nearestSupportDistancePct)) ? Number(structureSnapshot.nearestSupportDistancePct) : null,
        distance_to_resistance: Number.isFinite(Number(structureSnapshot.nearestResistanceDistancePct)) ? Number(structureSnapshot.nearestResistanceDistancePct) : null,
        swing_structure: buildSwingStructure(structureSnapshot),
      };
    }

    const snapshot = {
      candles: context.map(normalizeCandle),
      features: {
        ema_fast: toNumber(feature.emaFast, 0),
        ema_slow: toNumber(feature.emaSlow, 0),
        ema_slope: toNumber(feature.emaSlope, 0),
        rsi: toNumber(feature.rsi, 50),
        atr: toNumber(feature.atr, 0),
        momentum: toNumber(feature.momentum, 0),
        volatility_state: mapVolatilityState(feature.volatilityState),
        compression: Boolean(feature.compression),
        expansion: Boolean(feature.expansion),
      },
      structure,
      regime: regime.regime,
    };

    logger.debug("Context snapshot captured", {
      symbol,
      timeframe,
      candles: snapshot.candles.length,
      structureAvailable: Boolean(snapshot.structure),
    });
    return snapshot;
  }

  return { getContextSnapshot };
}
