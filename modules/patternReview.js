const DEFAULT_LIVE_STATS = Object.freeze({ wins: 0, losses: 0 });

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLiveStats(stats) {
  return {
    wins: Number.isFinite(Number(stats?.wins)) ? Number(stats.wins) : 0,
    losses: Number.isFinite(Number(stats?.losses)) ? Number(stats.losses) : 0,
  };
}

export function normalizePromotedPattern(entry = {}) {
  const now = new Date().toISOString();
  return {
    id: String(entry.id || `prom-${Math.random().toString(36).slice(2, 10)}`),
    sourceCandidateId: String(entry.sourceCandidateId || ""),
    neurons: toArray(entry.neurons).map((neuron) => String(neuron)),
    direction: entry.direction === "PUT" ? "PUT" : "CALL",
    expiry: Number.isFinite(Number(entry.expiry)) ? Number(entry.expiry) : null,
    createdAt: entry.createdAt || now,
    status: entry.status || "promoted",
    liveStats: normalizeLiveStats(entry.liveStats || DEFAULT_LIVE_STATS),
  };
}

export function createPromotedPatternFromCandidate(candidate, status = "promoted") {
  const binaryDirection = candidate?.binaryDirection === "PUT" ? "PUT" : "CALL";
  return normalizePromotedPattern({
    id: `prom-${candidate?.patternId || Math.random().toString(36).slice(2, 10)}`,
    sourceCandidateId: candidate?.patternId || "",
    neurons: candidate?.neurons || [],
    direction: binaryDirection,
    expiry: candidate?.preferredExpiryCandles ?? null,
    createdAt: new Date().toISOString(),
    status,
    liveStats: { ...DEFAULT_LIVE_STATS },
  });
}

export function upsertPromotedPattern(collection, candidate, status = "promoted") {
  const current = toArray(collection).map((row) => normalizePromotedPattern(row));
  const next = createPromotedPatternFromCandidate(candidate, status);
  const index = current.findIndex((row) => row.sourceCandidateId === next.sourceCandidateId || row.id === next.id);
  if (index >= 0) {
    const merged = {
      ...current[index],
      ...next,
      liveStats: normalizeLiveStats(current[index].liveStats),
      createdAt: current[index].createdAt || next.createdAt,
    };
    current[index] = normalizePromotedPattern(merged);
    return current;
  }
  return [next, ...current];
}

export function summarizeReviewState(candidates = [], decisions = {}, promotedPatterns = []) {
  const rows = toArray(candidates);
  const decisionValues = Object.values(decisions || {});
  const promoted = toArray(promotedPatterns).map((row) => normalizePromotedPattern(row));
  return {
    candidates: rows.length,
    promoted: promoted.filter((row) => row.status === "promoted").length,
    rejected: decisionValues.filter((row) => row === "rejected").length,
    ignored: decisionValues.filter((row) => row === "ignored").length,
  };
}
