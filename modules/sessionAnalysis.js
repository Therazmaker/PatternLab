const DEFAULT_CONFIG = {
  rsiLength: 7,
  emaLength: 5,
  nearThreshold: 1.8,
  structureMinWindow: 5,
  structureMaxWindow: 12,
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
    structureMinWindow: Math.max(3, Number(config.structureMinWindow) || DEFAULT_CONFIG.structureMinWindow),
    structureMaxWindow: Math.max(5, Number(config.structureMaxWindow) || DEFAULT_CONFIG.structureMaxWindow),
    useNarrative: config.useNarrative !== false,
  };
}

function getBodySize(candle) {
  if (!candle || typeof candle.open !== "number" || typeof candle.close !== "number") return null;
  return Math.abs(candle.close - candle.open);
}

function getAdaptiveStructureWindow(candleIndex, candleCount, config) {
  const seen = Math.max(1, Math.min(candleCount, candleIndex + 1));
  if (seen >= 40) return Math.min(config.structureMaxWindow, 12);
  if (seen >= 20) return Math.min(config.structureMaxWindow, 10);
  if (seen >= 12) return Math.min(config.structureMaxWindow, 8);
  return Math.min(config.structureMinWindow, seen);
}

export function analyzeRecentPriceStructure(candleIndex, candles = [], config = {}) {
  const cfg = normalizeConfig(config);
  const idx = Number(candleIndex);
  const windowSize = getAdaptiveStructureWindow(idx, candles.length, cfg);
  const start = Math.max(0, idx - windowSize + 1);
  const segment = candles.slice(start, idx + 1);
  const valid = segment.filter((c) => [c.open, c.high, c.low, c.close].every((v) => typeof v === "number"));
  const closes = valid.map((c) => c.close);
  const firstClose = closes[0] ?? null;
  const lastClose = closes[closes.length - 1] ?? null;
  const netMove = firstClose !== null && lastClose !== null ? lastClose - firstClose : 0;
  const bodySizes = valid.map((c) => getBodySize(c)).filter((v) => typeof v === "number");
  const avgBody = bodySizes.length ? bodySizes.reduce((a, b) => a + b, 0) / bodySizes.length : 0;
  const range = valid.length ? Math.max(...valid.map((c) => c.high)) - Math.min(...valid.map((c) => c.low)) : 0;
  const upCloses = valid.filter((c) => c.close > c.open).length;
  const downCloses = valid.filter((c) => c.close < c.open).length;
  const smallBodies = bodySizes.filter((v) => avgBody > 0 && v <= avgBody * 0.65).length;
  const longWickRejects = valid.filter((c) => {
    const body = Math.max(getBodySize(c) || 0, 0.0000001);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    return upperWick > body * 1.4 || lowerWick > body * 1.4;
  }).length;
  const expandingBodies = bodySizes.length >= 3 && bodySizes.at(-1) > bodySizes.at(-2) && bodySizes.at(-2) > bodySizes.at(-3);
  const shrinkingBodies = bodySizes.length >= 3 && bodySizes.at(-1) < bodySizes.at(-2) && bodySizes.at(-2) < bodySizes.at(-3);
  const nearFlat = Math.abs(netMove) <= Math.max(avgBody * 0.6, 0.0000001);

  let label = "Mixed Structure";
  let description = "La estructura reciente está mixta: alterna tramos de avance y retroceso sin dominancia clara.";
  let implication = "Conviene leer continuidad solo si aparece una secuencia más limpia en próximas velas.";
  let missing = "Falta una ruptura de estructura o una expansión más consistente del rango.";

  if (nearFlat && smallBodies >= Math.max(2, Math.floor(valid.length * 0.45))) {
    label = "Sideways Noise";
    description = "El precio se mantiene lateral, con velas pequeñas y avance neto limitado dentro de un rango corto.";
    implication = "Este contexto suele generar lecturas de ruido y falsas continuidades.";
    missing = "Falta expansión real del rango para validar dirección.";
  } else if (smallBodies >= Math.max(3, Math.floor(valid.length * 0.5)) && shrinkingBodies) {
    label = "Compression Before Move";
    description = "Las últimas velas muestran compresión progresiva: cuerpos más cortos y pérdida de desplazamiento.";
    implication = "La compresión prepara terreno para un movimiento posterior, pero aún no define sentido.";
    missing = "Falta ruptura con cuerpo más amplio para confirmar salida de compresión.";
  } else if (netMove > 0 && upCloses >= downCloses + 2 && expandingBodies) {
    label = "Continuation Attempt";
    description = "La secuencia reciente mantiene continuidad alcista y los cuerpos crecientes sugieren expansión del impulso.";
    implication = "La lectura favorece continuación, no necesariamente giro fresco.";
    missing = "Si aparece pausa abrupta o rechazo fuerte, esta continuidad podría agotarse.";
  } else if (netMove < 0 && downCloses >= upCloses + 2 && expandingBodies) {
    label = "Continuation Attempt";
    description = "La estructura conserva presión bajista con desplazamiento sostenido en las últimas velas.";
    implication = "Predomina arrastre bajista mientras no haya absorción clara de la caída.";
    missing = "Falta estabilización o recuperación secuencial para hablar de giro.";
  } else if (netMove > 0 && upCloses >= downCloses && shrinkingBodies) {
    label = "Exhaustion Risk";
    description = "El precio viene subiendo, pero los cuerpos se reducen y la subida pierde amplitud.";
    implication = "Puede seguir avanzando, aunque con riesgo de pausa o agotamiento.";
    missing = "Falta nueva expansión para sostener continuidad con convicción.";
  } else if (netMove < 0 && downCloses >= upCloses && shrinkingBodies) {
    label = "Exhaustion Risk";
    description = "La caída sigue presente, pero la presión deja de acelerarse y aparecen señales de cansancio.";
    implication = "El tramo bajista podría entrar en pausa antes de retomar o girar.";
    missing = "Falta rebote más ordenado para confirmar recuperación.";
  } else if (netMove > 0 && downCloses >= 2 && upCloses >= 2) {
    label = "Recovery Structure";
    description = "Después de debilidad previa, el precio dejó de profundizar y empezó una recuperación gradual, más ordenada que explosiva.";
    implication = "La lectura es de mejora progresiva, útil para continuidad moderada.";
    missing = "Falta limpiar por completo la debilidad previa con mayor expansión.";
  } else if (netMove < 0 && upCloses >= 2 && downCloses >= 2) {
    label = "Weak Reversal Attempt";
    description = "Se ve intento de giro dentro de una estructura aún frágil, con rebotes que no consolidan del todo.";
    implication = "El cambio de tono existe, pero todavía convive con presión bajista residual.";
    missing = "Falta secuencia alcista más limpia para validar reversión.";
  }

  if (longWickRejects >= 2) {
    description += " Además, hay rechazo visible en mechas largas, señal de fricción entre compradores y vendedores.";
  }

  return {
    label,
    description,
    implication,
    missing,
    windowSize,
    startCandleIndex: start + 1,
    endCandleIndex: idx + 1,
    stats: { netMove, range, avgBody, upCloses, downCloses, smallBodies, longWickRejects },
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
  if (!explanation) return "";
  const lines = [];
  if (explanation.priceStructureRead) lines.push(explanation.priceStructureRead);
  if (explanation.indicatorConfirmation) lines.push(explanation.indicatorConfirmation);
  if (explanation.whyThisMatters) lines.push(explanation.whyThisMatters);
  if (explanation.whatIsMissing) lines.push(`Pendiente: ${explanation.whatIsMissing}`);
  if (!lines.length && explanation?.reasons?.includes("Insufficient RSI history")) {
    lines.push("No hay historial suficiente para RSI/EMA, pero la estructura de precio sigue en observación pedagógica.");
  }
  return lines.slice(0, 4).join("\n");
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
    structureLabel: "Mixed Structure",
    priceStructureRead: "",
    indicatorConfirmation: "",
    whyThisMatters: "",
    whatIsMissing: "",
    structureContext: null,
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
  const structure = analyzeRecentPriceStructure(idx, candles, cfg);
  base.structureLabel = structure.label;
  base.priceStructureRead = structure.description;
  base.whyThisMatters = structure.implication;
  base.whatIsMissing = structure.missing;
  base.structureContext = structure;

  if (rsi === null || rsiEma === null || prevRsi === null || prevEma === null) {
    base.reasons.push("Insufficient RSI history");
    base.failedConditions.push("Minimum history for RSI/EMA not met");
    base.summary = "No signal: insufficient RSI/EMA history.";
    base.indicatorConfirmation = "Confirmación técnica limitada: aún no hay historial suficiente de RSI/EMA para validar o contradecir la lectura estructural.";
    base.visualTags = ["no-signal", "context-only", structure.label.toLowerCase().replace(/\s+/g, "-")];
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

  if (base.signalState === "call") {
    base.indicatorConfirmation = "RSI está por encima de su EMA y mantiene pendiente positiva, confirmando acompañamiento alcista sobre la estructura reciente.";
  } else if (base.signalState === "put") {
    base.indicatorConfirmation = "RSI se mantiene bajo su EMA con pendiente negativa, reforzando continuidad bajista en esta zona.";
  } else if (base.signalState === "near-call") {
    base.indicatorConfirmation = "RSI sugiere recuperación frente a su EMA, pero la distancia todavía es corta y la validación es parcial.";
  } else if (base.signalState === "near-put") {
    base.indicatorConfirmation = "RSI intenta sostenerse por debajo de su EMA, aunque aún sin separación amplia.";
  } else {
    base.indicatorConfirmation = "Los indicadores no entregan confirmación contundente; por ahora actúan más como contraste que como gatillo principal.";
  }
  base.visualTags = [...new Set([...(base.visualTags || []), structure.label.toLowerCase().replace(/\s+/g, "-")])];

  base.narrative = cfg.useNarrative ? buildCandleNarrative(base) : "";
  return base;
}

export function buildSessionCandleExplanations(candles = [], config = {}) {
  return candles.map((_, index) => explainRsiEmaSignalForCandle(index, candles, config));
}

export function getDefaultSessionAnalysisConfig() {
  return { ...DEFAULT_CONFIG };
}
