// decisionTraceStore.js
// Manages per-candle decision traces for the copilot feedback audit panel.

const MAX_TRACES = 50;
let _traces = [];

/**
 * Add or replace a decision trace.
 * If a trace for the same candle_time already exists it is replaced in-place.
 * @param {object} trace - decision_trace_v1 object
 */
export function addDecisionTrace(trace) {
  if (!trace || !trace.candle_time) return;
  const idx = _traces.findIndex((t) => t.candle_time === trace.candle_time);
  if (idx >= 0) {
    _traces[idx] = trace;
  } else {
    _traces = [trace, ..._traces].slice(0, MAX_TRACES);
  }
}

/**
 * Return all stored decision traces (newest first).
 * @returns {object[]}
 */
export function getDecisionTraces() {
  return [..._traces];
}

/**
 * Return a single trace by candle_time, or null.
 * @param {string} candleTime
 * @returns {object|null}
 */
export function getDecisionTrace(candleTime) {
  return _traces.find((t) => t.candle_time === candleTime) || null;
}

/**
 * Update a trace in-place (e.g. after forward evaluation).
 * @param {string} candleTime
 * @param {object} updatedTrace
 */
export function updateDecisionTrace(candleTime, updatedTrace) {
  const idx = _traces.findIndex((t) => t.candle_time === candleTime);
  if (idx >= 0) _traces[idx] = updatedTrace;
}

/**
 * Compute aggregated statistics from all stored traces.
 * @returns {object}
 */
export function getAggregatedTraceStats() {
  if (_traces.length === 0) {
    return {
      total: 0,
      tradeCandidates: 0,
      blocked: 0,
      noTrade: 0,
      wait: 0,
      goodBlocks: 0,
      missedOpportunities: 0,
      goodBlockPct: 0,
      missedOpportunityPct: 0,
      topReasonCodes: [],
      topInvalidations: [],
      topMatchedTriggers: [],
    };
  }

  let tradeCandidates = 0, blocked = 0, noTrade = 0, wait = 0;
  let goodBlocks = 0, missedOpportunities = 0;
  const reasonCodeCounts     = {};
  const invalidationCounts   = {};
  const matchedTriggerCounts = {};

  for (const t of _traces) {
    const action = t.decision?.action || "wait";
    if (action === "long_candidate" || action === "short_candidate") tradeCandidates++;
    else if (action === "blocked")  blocked++;
    else if (action === "no_trade") noTrade++;
    else wait++;

    const bq = t.forward_eval?.block_quality;
    if (bq === "good_block" || bq === "excellent_block") goodBlocks++;
    if (bq === "missed_opportunity") missedOpportunities++;

    for (const rc of t.no_trade_analysis?.reason_codes || []) {
      reasonCodeCounts[rc] = (reasonCodeCounts[rc] || 0) + 1;
    }
    for (const inv of t.scenarios?.primary?.active_invalidations || []) {
      invalidationCounts[inv] = (invalidationCounts[inv] || 0) + 1;
    }
    for (const mt of t.scenarios?.primary?.matched_triggers || []) {
      matchedTriggerCounts[mt] = (matchedTriggerCounts[mt] || 0) + 1;
    }
  }

  const topN = (map, n = 5) =>
    Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));

  const totalBlocked = blocked + noTrade;
  return {
    total: _traces.length,
    tradeCandidates,
    blocked,
    noTrade,
    wait,
    goodBlocks,
    missedOpportunities,
    goodBlockPct:          totalBlocked > 0 ? Math.round((goodBlocks          / totalBlocked) * 100) : 0,
    missedOpportunityPct:  totalBlocked > 0 ? Math.round((missedOpportunities / totalBlocked) * 100) : 0,
    topReasonCodes:        topN(reasonCodeCounts),
    topInvalidations:      topN(invalidationCounts),
    topMatchedTriggers:    topN(matchedTriggerCounts),
  };
}

/**
 * Clear all stored traces.
 */
export function clearDecisionTraces() {
  _traces = [];
}

/**
 * Hydrate from a persisted state array.
 * @param {object[]} state
 */
export function hydrateDecisionTraceStore(state = []) {
  _traces = Array.isArray(state) ? state.slice(0, MAX_TRACES) : [];
}

/**
 * Serialize to a plain array for persistence.
 * @returns {object[]}
 */
export function serializeDecisionTraceStore() {
  return _traces.slice(0, MAX_TRACES);
}
