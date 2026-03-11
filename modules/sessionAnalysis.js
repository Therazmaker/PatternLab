const DEFAULT_CONFIG = {
  rsiLength: 7,
  emaLength: 5,
  nearThreshold: 1.8,
  useNarrative: true,
};

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeConfig(config = {}) {
  return {
    rsiLength: Math.max(2, Number(config.rsiLength) || DEFAULT_CONFIG.rsiLength),
    emaLength: Math.max(2, Number(config.emaLength) || DEFAULT_CONFIG.emaLength),
    nearThreshold: Math.max(0.1, Number(config.nearThreshold) || DEFAULT_CONFIG.nearThreshold),
    useNarrative: config.useNarrative !== false,
  };
}

function computeRsiSeries(candles = [], length = 7) {
  const closes = candles.map((c) => safeNumber(c.close));
  const rsi = Array(candles.length).fill(null);
  if (candles.length < length + 1) return rsi;

  for (let i = length; i < closes.length; i += 1) {
    const window = closes.slice(i - length, i + 1);
    if (window.some((v) => v === null)) continue;
    let gains = 0;
    let losses = 0;
    for (let j = 1; j < window.length; j += 1) {
      const diff = window[j] - window[j - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    if (losses === 0 && gains === 0) {
      rsi[i] = 50;
      continue;
    }
    if (losses === 0) {
      rsi[i] = 100;
      continue;
    }
    const rs = gains / losses;
    rsi[i] = 100 - (100 / (1 + rs));
  }
  return rsi;
}

function computeEmaSeries(values = [], length = 5) {
  const ema = Array(values.length).fill(null);
  const k = 2 / (length + 1);
  let previous = null;
  values.forEach((value, index) => {
    if (typeof value !== "number") return;
    if (previous === null) {
      previous = value;
      ema[index] = value;
      return;
    }
    previous = value * k + previous * (1 - k);
    ema[index] = previous;
  });
  return ema;
}

export function buildCandleNarrative(explanation) {
  if (!explanation || explanation.signalState === "none") {
    if (explanation?.reasons?.includes("Insufficient RSI history")) {
      return "No hay historial suficiente para leer RSI/EMA. La vela queda en observación hasta reunir contexto mínimo.";
    }
    return "La lectura se mantiene neutral: no aparece reclaim claro entre RSI y EMA en esta vela.";
  }
  if (explanation.signalState === "call") {
    return "Se observa reclaim alcista: RSI recupera su EMA y el impulso acompaña la continuidad.";
  }
  if (explanation.signalState === "put") {
    return "Se observa reclaim bajista: RSI cae bajo su EMA y la presión vendedora domina la lectura.";
  }
  if (explanation.signalState === "near-call") {
    return "Hay intención alcista, pero la confirmación aún es parcial. El setup está formándose sin validación limpia.";
  }
  if (explanation.signalState === "near-put") {
    return "Hay intención bajista, pero la confirmación sigue débil. El setup está cerca, no completo.";
  }
  return "Lectura mixta sin confirmación clara.";
}

export function explainRsiEmaSignalForCandle(candleIndex, candles = [], config = {}) {
  const cfg = normalizeConfig(config);
  const idx = Number(candleIndex);
  const current = candles[idx];
  const base = {
    candleIndex: Number.isInteger(current?.index) ? current.index : idx + 1,
    signalState: "none",
    summary: "No signal: conditions incomplete.",
    reasons: [],
    passedConditions: [],
    failedConditions: [],
    metrics: {
      rsi: null,
      rsiEma: null,
      rsiMinusEma: null,
      slopeHint: null,
      reclaimDirection: null,
    },
    confidenceLabel: "none",
    visualTags: ["no-signal"],
    narrative: "",
  };
  if (!current) {
    base.reasons.push("Invalid candle index");
    return base;
  }

  const rsiSeries = computeRsiSeries(candles, cfg.rsiLength);
  const emaSeries = computeEmaSeries(rsiSeries, cfg.emaLength);
  const rsi = safeNumber(rsiSeries[idx]);
  const rsiEma = safeNumber(emaSeries[idx]);
  const prevRsi = safeNumber(rsiSeries[idx - 1]);
  const prevEma = safeNumber(emaSeries[idx - 1]);

  if (rsi === null || rsiEma === null || prevRsi === null || prevEma === null) {
    base.reasons.push("Insufficient RSI history");
    base.failedConditions.push("Minimum history for RSI/EMA not met");
    base.summary = "No signal: insufficient RSI/EMA history.";
    base.narrative = cfg.useNarrative ? buildCandleNarrative(base) : "";
    return base;
  }

  const diff = rsi - rsiEma;
  const prevDiff = prevRsi - prevEma;
  const slopeHint = rsi - prevRsi;
  const crossedUp = prevDiff <= 0 && diff > 0;
  const crossedDown = prevDiff >= 0 && diff < 0;
  const momentumUp = slopeHint > 0.25;
  const momentumDown = slopeHint < -0.25;
  const nearUp = diff > 0 && diff < cfg.nearThreshold;
  const nearDown = diff < 0 && Math.abs(diff) < cfg.nearThreshold;

  base.metrics = {
    rsi,
    rsiEma,
    rsiMinusEma: diff,
    slopeHint,
    reclaimDirection: crossedUp ? "up" : crossedDown ? "down" : "flat",
  };

  if (crossedUp) base.passedConditions.push("RSI crossed above EMA");
  else base.failedConditions.push("No bullish reclaim cross");
  if (crossedDown) base.passedConditions.push("RSI crossed below EMA");
  else base.failedConditions.push("No bearish reclaim cross");
  if (momentumUp) base.passedConditions.push("Bullish momentum improving");
  if (momentumDown) base.passedConditions.push("Bearish momentum improving");
  if (!momentumUp && !momentumDown) base.failedConditions.push("Momentum is mixed/flat");

  if (crossedUp && momentumUp && diff >= cfg.nearThreshold) {
    base.signalState = "call";
    base.summary = "CALL setup detected: RSI reclaimed above EMA with improving momentum.";
    base.reasons.push("Bullish reclaim confirmed");
    base.visualTags = ["call", "reclaim-up", "confirmed"];
    base.confidenceLabel = "clear";
  } else if (crossedDown && momentumDown && Math.abs(diff) >= cfg.nearThreshold) {
    base.signalState = "put";
    base.summary = "PUT setup detected: RSI reclaimed below EMA with downside momentum.";
    base.reasons.push("Bearish reclaim confirmed");
    base.visualTags = ["put", "reclaim-down", "confirmed"];
    base.confidenceLabel = "clear";
  } else if ((crossedUp || nearUp) && slopeHint > 0) {
    base.signalState = "near-call";
    base.summary = "Near CALL: upside reclaim is forming, but confirmation is still weak.";
    base.reasons.push(crossedUp ? "Cross exists but distance is weak" : "RSI is approaching bullish reclaim");
    base.visualTags = ["near-call", "forming"];
    base.confidenceLabel = "weak";
  } else if ((crossedDown || nearDown) && slopeHint < 0) {
    base.signalState = "near-put";
    base.summary = "Near PUT: downside reclaim is forming, but confirmation is still weak.";
    base.reasons.push(crossedDown ? "Cross exists but distance is weak" : "RSI is approaching bearish reclaim");
    base.visualTags = ["near-put", "forming"];
    base.confidenceLabel = "weak";
  } else {
    base.signalState = "none";
    base.summary = "No signal: RSI remains without a confirmed reclaim structure.";
    base.reasons.push("No reclaim confirmation");
    base.visualTags = ["no-signal", "neutral"];
    base.confidenceLabel = "mixed";
  }

  base.narrative = cfg.useNarrative ? buildCandleNarrative(base) : "";
  return base;
}

export function buildSessionCandleExplanations(candles = [], config = {}) {
  return candles.map((_, index) => explainRsiEmaSignalForCandle(index, candles, config));
}

export function getDefaultSessionAnalysisConfig() {
  return { ...DEFAULT_CONFIG };
}
