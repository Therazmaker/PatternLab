const DEFAULT_DISCOVERY_OPTIONS = {
  maxCombinationSize: 4,
  includeSingleNeuronPatterns: true,
  includeContextDirection: true,
  includeContextSession: true,
  includeContextLocalPush: true,
  maxExamplesPerCandidate: 8,
  minSamples: 5,
  lookaheadCandles: 6,
  bullishTargetPct: 0.0015,
  bearishTargetPct: 0.0015,
  adverseMovePct: 0.001,
  maxActiveNeuronsPerCandle: 10,
};

function getMergedOptions(options = {}) {
  return { ...DEFAULT_DISCOVERY_OPTIONS, ...(options || {}) };
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickDirectionFromCandle(candle) {
  const open = asNumber(candle?.open);
  const close = asNumber(candle?.close);
  if (close > open) return "bullish";
  if (close < open) return "bearish";
  return "neutral";
}

function detectSession(timestamp) {
  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return "offhours";
  const hour = new Date(ts).getUTCHours();
  if (hour >= 0 && hour < 7) return "asia";
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 16) return "overlap";
  if (hour >= 16 && hour < 21) return "newyork";
  return "offhours";
}

function inferLocalPush(candles, index, lookback = 3) {
  const start = Math.max(0, index - Math.max(1, lookback) + 1);
  const window = candles.slice(start, index + 1);
  if (window.length <= 1) return "none";

  let up = 0;
  let down = 0;
  for (let i = 1; i < window.length; i += 1) {
    const prevClose = asNumber(window[i - 1]?.close);
    const close = asNumber(window[i]?.close);
    if (close >= prevClose) up += 1;
    if (close <= prevClose) down += 1;
  }
  const threshold = Math.ceil((window.length - 1) * 0.67);
  if (up >= threshold) return "local_push_up";
  if (down >= threshold) return "local_push_down";
  return "none";
}

function getNeuronMatrixFromInput(neuronInput) {
  if (Array.isArray(neuronInput) && neuronInput.length > 0 && Array.isArray(neuronInput[0])) return neuronInput;

  const byIndex = new Map();
  for (const row of Array.isArray(neuronInput) ? neuronInput : []) {
    const index = asNumber(row?.index, -1);
    if (index < 0) continue;
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(row);
  }

  if (!byIndex.size) return [];
  const maxIndex = Math.max(...byIndex.keys());
  const matrix = new Array(maxIndex + 1).fill(null).map(() => []);
  byIndex.forEach((rows, index) => {
    matrix[index] = rows;
  });
  return matrix;
}

function getActiveNeuronsForIndex(matrixRow, options) {
  const active = (Array.isArray(matrixRow) ? matrixRow : [])
    .filter((row) => Boolean(row?.active))
    .sort((a, b) => asNumber(b?.score) - asNumber(a?.score) || String(a?.neuronId || "").localeCompare(String(b?.neuronId || "")))
    .slice(0, options.maxActiveNeuronsPerCandle)
    .map((row) => ({ neuronId: String(row.neuronId || ""), pineCompatible: Boolean(row?.pineCompatible) }))
    .filter((row) => row.neuronId);

  const seen = new Set();
  return active.filter((row) => {
    if (seen.has(row.neuronId)) return false;
    seen.add(row.neuronId);
    return true;
  });
}

function buildCombinations(items, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) {
    out.push(prefix.slice());
    return out;
  }
  for (let i = start; i < items.length; i += 1) {
    prefix.push(items[i]);
    buildCombinations(items, size, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

function buildContext(candles, index, options) {
  const candle = candles[index] || {};
  const context = {};
  if (options.includeContextDirection) context.direction = pickDirectionFromCandle(candle);
  if (options.includeContextSession) context.session = detectSession(candle.timestamp);
  if (options.includeContextLocalPush) {
    const push = inferLocalPush(candles, index, 4);
    if (push !== "none") context.localPush = push;
  }
  return context;
}

function canonicalizePattern(neurons, context = {}) {
  const neuronIds = [...neurons].map((row) => String(row)).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const contextKeys = Object.keys(context).sort((a, b) => a.localeCompare(b));
  const normalizedContext = {};
  for (const key of contextKeys) {
    const value = context[key];
    if (value === undefined || value === null || value === "") continue;
    normalizedContext[key] = value;
  }
  const contextString = contextKeys
    .filter((key) => normalizedContext[key] !== undefined)
    .map((key) => `${key}:${String(normalizedContext[key])}`)
    .join("|");
  const patternKey = `neurons=${neuronIds.join("+")}::context=${contextString}`;
  return { neuronIds, context: normalizedContext, patternKey };
}

export function inferPatternDirection(neuronIds = [], context = {}) {
  if (context.direction === "bullish" || context.direction === "bearish") return context.direction;

  const ids = neuronIds.map((id) => String(id).toLowerCase());
  let bullish = 0;
  let bearish = 0;
  for (const id of ids) {
    if (/bull|_up|long_lower_wick|rejection_down|followthrough/.test(id)) bullish += 1;
    if (/bear|_down|long_upper_wick|rejection_up/.test(id)) bearish += 1;
  }
  if (bullish > bearish) return "bullish";
  if (bearish > bullish) return "bearish";
  return "neutral";
}

export function buildPatternOccurrences(candles, neuronInput, options = {}) {
  const opts = getMergedOptions(options);
  const rows = Array.isArray(candles) ? candles : [];
  const matrix = getNeuronMatrixFromInput(neuronInput);
  const grouped = new Map();
  const occurrences = [];

  for (let index = 0; index < rows.length; index += 1) {
    const activeRows = getActiveNeuronsForIndex(matrix[index], opts);
    if (!activeRows.length) continue;

    const activeNeuronIds = activeRows.map((row) => row.neuronId);
    const context = buildContext(rows, index, opts);
    const combos = [];

    if (opts.includeSingleNeuronPatterns) {
      for (const neuronId of activeNeuronIds) combos.push([neuronId]);
    }

    const maxCombo = Math.min(opts.maxCombinationSize, activeNeuronIds.length);
    for (let size = 2; size <= maxCombo; size += 1) {
      buildCombinations(activeNeuronIds, size, 0, [], combos);
    }

    for (const combo of combos) {
      const canonical = canonicalizePattern(combo, context);
      const pineCompatible = canonical.neuronIds.every((id) => activeRows.find((row) => row.neuronId === id)?.pineCompatible);
      const occurrence = {
        patternKey: canonical.patternKey,
        neuronIds: canonical.neuronIds,
        context: canonical.context,
        index,
        timestamp: rows[index]?.timestamp || null,
        candleSnapshot: {
          timestamp: rows[index]?.timestamp || null,
          open: asNumber(rows[index]?.open, null),
          high: asNumber(rows[index]?.high, null),
          low: asNumber(rows[index]?.low, null),
          close: asNumber(rows[index]?.close, null),
        },
        debugSummary: `idx=${index}, neurons=${canonical.neuronIds.join(",")}`,
        pineCompatible,
      };

      occurrences.push(occurrence);
      if (!grouped.has(canonical.patternKey)) grouped.set(canonical.patternKey, []);
      grouped.get(canonical.patternKey).push(occurrence);
    }
  }

  return { occurrences, groupedOccurrences: grouped };
}

function evaluateOccurrenceOutcome(candles, occurrence, options) {
  const lookahead = Math.max(1, asNumber(options.lookaheadCandles, DEFAULT_DISCOVERY_OPTIONS.lookaheadCandles));
  const direction = inferPatternDirection(occurrence.neuronIds, occurrence.context);
  const startCandle = candles[occurrence.index];
  const entry = asNumber(startCandle?.close, 0);
  if (!entry || direction === "neutral") {
    return {
      direction,
      maxFavorableMovePct: 0,
      maxAdverseMovePct: 0,
      targetHit: false,
      adverseHit: false,
      outcomeLabel: "neutral",
    };
  }

  const end = Math.min(candles.length - 1, occurrence.index + lookahead);
  let maxFavorable = 0;
  let maxAdverse = 0;
  let targetHit = false;
  let adverseHit = false;
  let firstEvent = "none";

  const targetPct = direction === "bullish" ? asNumber(options.bullishTargetPct, 0.0015) : asNumber(options.bearishTargetPct, 0.0015);
  const adversePct = asNumber(options.adverseMovePct, 0.001);

  for (let i = occurrence.index + 1; i <= end; i += 1) {
    const candle = candles[i];
    const high = asNumber(candle?.high, entry);
    const low = asNumber(candle?.low, entry);

    const favorableMove = direction === "bullish" ? (high - entry) / entry : (entry - low) / entry;
    const adverseMove = direction === "bullish" ? (entry - low) / entry : (high - entry) / entry;

    if (favorableMove > maxFavorable) maxFavorable = favorableMove;
    if (adverseMove > maxAdverse) maxAdverse = adverseMove;

    const hitTargetNow = favorableMove >= targetPct;
    const hitAdverseNow = adverseMove >= adversePct;

    if (hitTargetNow && !targetHit) {
      targetHit = true;
      if (firstEvent === "none") firstEvent = "target";
    }
    if (hitAdverseNow && !adverseHit) {
      adverseHit = true;
      if (firstEvent === "none") firstEvent = "adverse";
    }
  }

  let outcomeLabel = "neutral";
  if (firstEvent === "target") outcomeLabel = "win";
  else if (firstEvent === "adverse") outcomeLabel = "loss";
  else if (maxFavorable > maxAdverse) outcomeLabel = "win";
  else if (maxAdverse > maxFavorable) outcomeLabel = "loss";

  return {
    direction,
    maxFavorableMovePct: maxFavorable,
    maxAdverseMovePct: maxAdverse,
    targetHit,
    adverseHit,
    outcomeLabel,
  };
}

export function evaluatePatternOccurrences(candles, occurrences, options = {}) {
  const opts = getMergedOptions(options);
  return (Array.isArray(occurrences) ? occurrences : []).map((occurrence) => ({
    ...occurrence,
    outcome: evaluateOccurrenceOutcome(candles, occurrence, opts),
  }));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function explanationForCandidate(candidate) {
  const neuronText = candidate.neurons.join(" + ");
  const ctx = [];
  if (candidate.context.session) ctx.push(`${candidate.context.session} session`);
  if (candidate.context.localPush) ctx.push(candidate.context.localPush.replaceAll("_", " "));
  const ctxText = ctx.length ? ` during ${ctx.join(" / ")}` : "";
  const ratio = candidate.avgAdverseMovePct > 0 ? candidate.avgFavorableMovePct / candidate.avgAdverseMovePct : candidate.avgFavorableMovePct > 0 ? 9.99 : 0;
  return `${candidate.direction[0].toUpperCase()}${candidate.direction.slice(1)} candidate pattern composed of ${neuronText}${ctxText}. Observed ${candidate.sampleCount} times with ${(candidate.winRate * 100).toFixed(1)}% win rate and favorable/adverse ratio of ${ratio.toFixed(2)}.`;
}

export function scoreCandidatePattern(candidate, options = {}) {
  const opts = getMergedOptions(options);
  const sampleScale = Math.min(1, candidate.sampleCount / Math.max(opts.minSamples * 3, 1));
  const sampleQualityWeight = 0.25 * sampleScale;
  const winRateWeight = 0.35 * Math.max(0, Math.min(1, candidate.winRate));

  const ratio = candidate.avgAdverseMovePct > 0
    ? candidate.avgFavorableMovePct / candidate.avgAdverseMovePct
    : candidate.avgFavorableMovePct > 0
      ? 3
      : 0;
  const moveQualityWeight = 0.2 * Math.max(0, Math.min(1, ratio / 2));
  const consistencyWeight = 0.2 * Math.max(0, Math.min(1, candidate.consistencyScore));
  const complexityPenalty = 0.08 * Math.max(0, candidate.neurons.length - 1);

  const raw = sampleQualityWeight + winRateWeight + moveQualityWeight + consistencyWeight - complexityPenalty;
  return Number(Math.max(0, raw).toFixed(6));
}

export function aggregateCandidatePatterns(evaluatedOccurrences, options = {}) {
  const opts = getMergedOptions(options);
  const grouped = new Map();

  for (const occurrence of Array.isArray(evaluatedOccurrences) ? evaluatedOccurrences : []) {
    if (!grouped.has(occurrence.patternKey)) grouped.set(occurrence.patternKey, []);
    grouped.get(occurrence.patternKey).push(occurrence);
  }

  const candidates = [];
  grouped.forEach((rows, patternKey) => {
    if (!rows.length) return;
    const sampleCount = rows.length;
    if (sampleCount < opts.minSamples) return;

    const first = rows[0];
    const direction = inferPatternDirection(first.neuronIds, first.context);
    if (direction === "neutral") return;

    let winCount = 0;
    let lossCount = 0;
    let neutralCount = 0;
    const favorable = [];
    const adverse = [];

    for (const row of rows) {
      if (row.outcome.outcomeLabel === "win") winCount += 1;
      else if (row.outcome.outcomeLabel === "loss") lossCount += 1;
      else neutralCount += 1;
      favorable.push(row.outcome.maxFavorableMovePct);
      adverse.push(row.outcome.maxAdverseMovePct);
    }

    const avgFavorableMovePct = favorable.reduce((sum, value) => sum + value, 0) / sampleCount;
    const avgAdverseMovePct = adverse.reduce((sum, value) => sum + value, 0) / sampleCount;
    const winRate = winCount / sampleCount;
    const consistencyScore = 1 - Math.min(1, neutralCount / sampleCount + Math.abs(0.5 - winRate));
    const simplicityScore = Number((1 / Math.max(1, first.neuronIds.length)).toFixed(6));
    const pineCompatible = rows.every((row) => row.pineCompatible);

    const candidate = {
      patternId: `pat-${Math.abs(hashCode(patternKey)).toString(36)}`,
      patternKey,
      neurons: first.neuronIds,
      context: first.context,
      direction,
      sampleCount,
      winCount,
      lossCount,
      neutralCount,
      winRate,
      avgFavorableMovePct,
      avgAdverseMovePct,
      medianFavorableMovePct: median(favorable),
      consistencyScore,
      simplicityScore,
      pineCompatible,
      score: 0,
      explanation: "",
      examples: rows.slice(0, opts.maxExamplesPerCandidate).map((row) => ({
        timestamp: row.timestamp,
        index: row.index,
        outcomeLabel: row.outcome.outcomeLabel,
        maxFavorableMovePct: row.outcome.maxFavorableMovePct,
        maxAdverseMovePct: row.outcome.maxAdverseMovePct,
      })),
    };

    candidate.score = scoreCandidatePattern(candidate, opts);
    candidate.explanation = explanationForCandidate(candidate);

    candidates.push(candidate);
  });

  return candidates;
}

function hashCode(text) {
  let hash = 0;
  const source = String(text || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function rankCandidatePatterns(candidates, options = {}) {
  const opts = getMergedOptions(options);
  return [...(Array.isArray(candidates) ? candidates : [])]
    .filter((row) => row.sampleCount >= opts.minSamples && row.direction !== "neutral" && Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || b.sampleCount - a.sampleCount || b.winRate - a.winRate || a.neurons.length - b.neurons.length);
}

export function discoverCandidatePatterns(candles, neuronInput, options = {}) {
  const opts = getMergedOptions(options);
  const rows = Array.isArray(candles) ? candles : [];

  const { occurrences, groupedOccurrences } = buildPatternOccurrences(rows, neuronInput, opts);
  const evaluated = evaluatePatternOccurrences(rows, occurrences, opts);
  const aggregated = aggregateCandidatePatterns(evaluated, opts);
  const ranked = rankCandidatePatterns(aggregated, opts);

  return {
    candidates: ranked,
    summary: {
      candlesScanned: rows.length,
      occurrencesBuilt: occurrences.length,
      candidateGroups: groupedOccurrences.size,
      candidatesRanked: ranked.length,
    },
  };
}
