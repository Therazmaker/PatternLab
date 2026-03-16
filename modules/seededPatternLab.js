import { evaluateBinaryOutcome, getSessionTag, inferBinaryDirection } from "./neuronEngine.js";

const DEFAULT_EXPIRIES = [1, 2, 3, 5];

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPct(delta, entry) {
  if (!Number.isFinite(entry) || entry === 0) return 0;
  return delta / entry;
}

function normalizeNeuronSelection(neurons = []) {
  const unique = [...new Set((Array.isArray(neurons) ? neurons : []).map((item) => String(item || "").trim()).filter(Boolean))];
  return unique.slice(0, 4);
}

function buildActiveNeuronIndex(activations = []) {
  const byIndex = new Map();
  (Array.isArray(activations) ? activations : []).forEach((row) => {
    if (!row?.active) return;
    const index = safeNumber(row.index, -1);
    const neuronId = String(row.neuronId || "").trim();
    if (index < 0 || !neuronId) return;
    if (!byIndex.has(index)) byIndex.set(index, new Set());
    byIndex.get(index).add(neuronId);
  });
  return byIndex;
}

function resolveDirection(mode, neurons, context = {}) {
  if (mode === "call") return "CALL";
  if (mode === "put") return "PUT";
  const inferred = inferBinaryDirection(neurons, context);
  return inferred === "NEUTRAL" ? "CALL" : inferred;
}

function matchesSessionFilter(candle, sessionFilter) {
  if (!sessionFilter || sessionFilter === "all") return true;
  return getSessionTag(candle?.timestamp) === sessionFilter;
}

function computeDirectionalMoves(entryPrice, expiryPrice, direction) {
  const rawDelta = safeNumber(expiryPrice) - safeNumber(entryPrice);
  const movePct = toPct(rawDelta, safeNumber(entryPrice));
  const directional = direction === "PUT" ? -movePct : movePct;
  return {
    favorableMove: Math.max(0, directional),
    adverseMove: Math.max(0, -directional),
  };
}

export function evaluateSeededPattern(candles, activations, config = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  const selectedNeurons = normalizeNeuronSelection(config.selectedNeurons);
  const expiries = (Array.isArray(config.expiries) ? config.expiries : DEFAULT_EXPIRIES)
    .map((value) => safeNumber(value, 0))
    .filter((value) => value > 0);
  const sessionFilter = String(config.sessionFilter || "all");
  const directionMode = String(config.directionMode || "auto").toLowerCase();

  if (selectedNeurons.length < 2) {
    return { status: "invalid", reason: "Select at least 2 neurons.", selectedNeurons, expiries, occurrenceIndexes: [] };
  }

  const activeByIndex = buildActiveNeuronIndex(activations);
  const occurrenceIndexes = [];
  for (let index = 0; index < rows.length; index += 1) {
    const candle = rows[index];
    if (!matchesSessionFilter(candle, sessionFilter)) continue;
    const activeSet = activeByIndex.get(index);
    if (!activeSet) continue;
    const allPresent = selectedNeurons.every((neuronId) => activeSet.has(neuronId));
    if (allPresent) occurrenceIndexes.push(index);
  }

  const byExpiry = new Map(expiries.map((expiry) => [expiry, { expiry, sampleCount: 0, wins: 0, losses: 0, favorableTotal: 0, adverseTotal: 0, sessionStats: {} }]));
  const examples = [];

  occurrenceIndexes.forEach((index) => {
    const candle = rows[index];
    const session = getSessionTag(candle?.timestamp) || "offhours";
    const direction = resolveDirection(directionMode, selectedNeurons, { session });
    const perExpiry = {};

    expiries.forEach((expiry) => {
      const outcome = evaluateBinaryOutcome(rows, index, direction, expiry, { binaryNeutralAsLoss: true });
      if (outcome.status !== "evaluated") return;
      const bucket = byExpiry.get(expiry);
      bucket.sampleCount += 1;
      if (outcome.outcomeLabel === "win") bucket.wins += 1;
      else bucket.losses += 1;

      const { favorableMove, adverseMove } = computeDirectionalMoves(outcome.entryPrice, outcome.expiryPrice, direction);
      bucket.favorableTotal += favorableMove;
      bucket.adverseTotal += adverseMove;
      if (!bucket.sessionStats[session]) bucket.sessionStats[session] = { sampleCount: 0, wins: 0, losses: 0 };
      bucket.sessionStats[session].sampleCount += 1;
      if (outcome.outcomeLabel === "win") bucket.sessionStats[session].wins += 1;
      else bucket.sessionStats[session].losses += 1;

      perExpiry[`${expiry}c`] = {
        outcome: outcome.outcomeLabel,
        favorableMove,
        adverseMove,
      };
    });

    if (examples.length < 10) {
      const firstExpiry = expiries[0];
      const fallback = perExpiry[`${firstExpiry}c`] || { favorableMove: 0, adverseMove: 0 };
      examples.push({
        timestamp: candle?.timestamp || null,
        index,
        direction,
        session,
        outcomes: perExpiry,
        favorableMove: fallback.favorableMove,
        adverseMove: fallback.adverseMove,
      });
    }
  });

  const summaryByExpiry = [...byExpiry.values()].map((row) => {
    const sampleCount = row.sampleCount;
    const losses = row.losses;
    const wins = row.wins;
    const winRate = sampleCount > 0 ? wins / sampleCount : 0;
    const avgFavorableMove = sampleCount > 0 ? row.favorableTotal / sampleCount : 0;
    const avgAdverseMove = sampleCount > 0 ? row.adverseTotal / sampleCount : 0;
    const consistency = sampleCount > 0 ? Math.abs((wins - losses) / sampleCount) : 0;
    return {
      expiry: row.expiry,
      sampleCount,
      wins,
      losses,
      winRate,
      avgFavorableMove,
      avgAdverseMove,
      consistency,
      sessionBreakdown: row.sessionStats,
    };
  });

  return {
    status: "ok",
    selectedNeurons,
    expiries,
    sessionFilter,
    directionMode,
    occurrenceIndexes,
    sampleCount: occurrenceIndexes.length,
    summaryByExpiry,
    examples,
  };
}

export function buildSeededCandidatePayload(result, options = {}) {
  if (!result || result.status !== "ok") return null;
  const primary = result.summaryByExpiry[0] || null;
  const mode = String(result.directionMode || "auto");
  const id = `seeded_${Date.now().toString(36)}`;
  const direction = mode === "put" ? "bearish" : "bullish";
  return {
    patternId: id,
    source: "seeded-lab",
    neurons: result.selectedNeurons,
    context: { session: result.sessionFilter || "all", seeded: true },
    direction,
    binaryDirection: mode === "put" ? "PUT" : mode === "call" ? "CALL" : "AUTO",
    preferredExpiryCandles: primary?.expiry || 1,
    sampleCount: primary?.sampleCount || result.sampleCount || 0,
    winRate: primary?.winRate || 0,
    consistencyScore: primary?.consistency || 0,
    score: primary?.winRate || 0,
    avgFavorableMovePct: primary?.avgFavorableMove || 0,
    avgAdverseMovePct: primary?.avgAdverseMove || 0,
    pineCompatible: true,
    explanation: `Seeded combination (${result.selectedNeurons.join(" + ")}) evaluated with session filter ${result.sessionFilter}.`,
    examples: (result.examples || []).map((example) => ({
      index: example.index,
      timestamp: example.timestamp,
      outcomeLabel: example.outcomes?.[`${primary?.expiry || 1}c`]?.outcome || "loss",
      favorableMovePct: example.favorableMove,
      adverseMovePct: example.adverseMove,
    })),
    meta: {
      createdAt: new Date().toISOString(),
      options,
      summaryByExpiry: result.summaryByExpiry,
    },
  };
}
