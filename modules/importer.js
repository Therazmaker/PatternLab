import { safeJsonParse, uniq } from "./utils.js";
import { normalizeSignal } from "./normalizer.js";
import { deduplicateSignals } from "./import-utils.js";

function extractRawSignals(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.signals)) return input.signals;
  if (input && typeof input === "object") return [input];
  return [];
}

function criticalMissing(raw) {
  const missing = [];
  if (!(raw.asset || raw.symbol || raw.pair)) missing.push("asset");
  if (!(raw.direction || raw.signal || raw.side)) missing.push("direction");
  if (!(raw.timestamp || raw.time || raw.createdAt)) missing.push("timestamp");
  return missing;
}

export function buildImportPreview(text, existingSignals = []) {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return {
      ok: false,
      message: `JSON inválido: ${parsed.error}`,
      total: 0,
      valid: [],
      uniqueValid: [],
      duplicates: [],
      invalid: [],
      missingCritical: [],
      assets: [],
      patterns: [],
    };
  }

  const rows = extractRawSignals(parsed.value);
  const valid = [];
  const invalid = [];
  const missingCritical = [];

  rows.forEach((row, index) => {
    const missing = criticalMissing(row);
    if (missing.length) missingCritical.push({ index, fields: missing });
    const { normalized, errors } = normalizeSignal(row);
    if (errors.length) invalid.push({ index, errors, row });
    else valid.push(normalized);
  });

  const dedupe = deduplicateSignals(valid, existingSignals);

  return {
    ok: true,
    message: "Preview lista",
    total: rows.length,
    valid,
    uniqueValid: dedupe.unique,
    duplicates: dedupe.duplicates,
    invalid,
    missingCritical,
    assets: uniq(valid.map((s) => s.asset)),
    patterns: uniq(valid.map((s) => s.patternName)),
  };
}

function mapStrategyActionToDirection(action) {
  const normalized = String(action || "").toUpperCase();
  if (normalized === "SHORT") return "PUT";
  return "CALL";
}

function mapStrategyOutcome(outcome = {}, action = "") {
  const result = String(outcome?.result || "").toLowerCase();
  if (String(action || "").toUpperCase() === "NO_TRADE") return "skip";
  if (result === "win") return "win";
  if (result === "loss") return "loss";
  if (result === "flat") return "flat";
  if (result === "skipped") return "skip";
  return outcome?.status === "resolved" ? "skip" : "pending";
}

export function normalizeStrategySignal(record = {}, options = {}) {
  const strategyId = options.strategyId || record.strategyId || "live-shadow-policy";
  const strategyName = options.strategyName || record.strategyName || "Live Shadow Policy";
  const versionId = options.versionId || record.versionId || "live";
  const action = String(record?.policy?.action || "NO_TRADE").toUpperCase();
  const timestamp = record.timestamp || Date.now();

  const { normalized } = normalizeSignal({
    id: String(record.id || ""),
    source: "strategy-live-shadow",
    asset: record.symbol,
    timeframe: record.timeframe || options.timeframe || "5m",
    direction: mapStrategyActionToDirection(action),
    patternName: strategyName,
    patternVersion: versionId,
    timestamp,
    entryPrice: record?.plan?.referencePrice,
    stopLoss: record?.plan?.stopLoss,
    takeProfit: record?.plan?.takeProfit,
    confidence: record?.policy?.confidence,
    notes: record?.policy?.reason || "",
    autoTags: ["strategy-live-shadow", ...(record?.policy?.thesisTags || []), `structure:${record?.policy?.structureDecision || "allow"}`],
    context: {
      source: record.source,
      strategyId,
      strategyName,
      versionId,
      action,
      stateSummary: record.stateSummary || {},
    },
    features: {
      strategy: {
        strategyId,
        strategyName,
        action,
        confidence: record?.policy?.confidence ?? null,
        entryRefPrice: record?.plan?.referencePrice ?? null,
        stopLoss: record?.plan?.stopLoss ?? null,
        takeProfit: record?.plan?.takeProfit ?? null,
        riskReward: record?.plan?.riskReward ?? null,
        thesis: record?.policy?.reason || "",
        thesisTags: record?.policy?.thesisTags || [],
        stateSummary: record?.stateSummary || {},
        structureDecision: record?.policy?.structureDecision || "allow",
        structureReasons: record?.policy?.structureReasons || [],
        metadata: {
          recordSource: record.source || "",
          candleIndex: record.candleIndex ?? null,
          plan: record.plan || {},
          policy: record.policy || {},
          outcome: record.outcome || {},
          decisionTrace: record.decisionTrace || {},
          operatorFeedback: record.operatorFeedback || {},
          outcomeComparison: record.outcomeComparison || {},
          learningMemory: record.learningMemory || {},
        },
      },
    },
    futuresPolicy: {
      action,
      confidence: Number(record?.policy?.confidence || 0),
      reason: record?.policy?.reason || "",
      actionScores: record?.policy?.actionScores || {},
      executionPlan: {
        entryType: record?.plan?.entryType || "shadow-close",
        entryPrice: record?.plan?.referencePrice ?? null,
        stopLoss: record?.plan?.stopLoss ?? null,
        takeProfit: record?.plan?.takeProfit ?? null,
        riskReward: record?.plan?.riskReward ?? null,
      },
      replay: {
        outcomeType: record?.outcome?.resolutionReason || "pending",
        pnlR: record?.outcome?.rMultiple ?? 0,
        pnlPct: record?.outcome?.pnlPct ?? 0,
        barsToResolution: record?.outcome?.barsElapsed ?? 0,
      },
      evidence: record?.policy?.supportingEvidence || {},
      policyVersion: record?._meta?.policyVersion || "phase1-shadow-v1",
    },
  });

  const status = mapStrategyOutcome(record.outcome, action);
  normalized.source = "strategy-live-shadow";
  normalized.strategyId = strategyId;
  normalized.strategyName = strategyName;
  normalized.strategyAction = action;
  normalized.strategyVersionId = versionId;
  normalized.strategySignal = {
    id: normalized.id,
    source: "strategy-live-shadow",
    strategyId,
    strategyName,
    versionId,
    symbol: normalized.asset,
    timeframe: normalized.timeframe,
    timestamp: normalized.timestamp,
    action,
    confidence: normalized.confidence,
    entryRefPrice: normalized.entryPrice,
    stopLoss: normalized.stopLoss,
    takeProfit: normalized.takeProfit,
    riskReward: normalized?.futuresPolicy?.executionPlan?.riskReward ?? null,
    thesis: record?.policy?.reason || "",
    thesisTags: record?.policy?.thesisTags || [],
    stateSummary: record?.stateSummary || {},
    structureDecision: record?.policy?.structureDecision || "allow",
    structureReasons: record?.policy?.structureReasons || [],
    status: status === "pending" ? "pending" : "resolved",
    outcome: record?.outcome || null,
    metadata: {
      source: record.source || "",
      candleIndex: record.candleIndex ?? null,
      policyVersion: record?._meta?.policyVersion || null,
      createdAt: record?._meta?.createdAt || null,
      decisionTrace: record.decisionTrace || {},
      operatorFeedback: record.operatorFeedback || {},
      outcomeComparison: record.outcomeComparison || {},
      learningMemory: record.learningMemory || {},
    },
  };
  normalized.outcome = {
    ...normalized.outcome,
    status,
    reviewedAt: status === "pending" ? null : new Date().toISOString(),
    reviewedBy: "strategy-live-shadow",
    comment: record?.outcome?.resolutionReason || record?.policy?.reason || "",
  };
  return normalized;
}

export function importStrategySignal(record = {}, existingSignals = [], options = {}) {
  const normalized = normalizeStrategySignal(record, options);
  const existingIndex = existingSignals.findIndex((row) => row.id === normalized.id);
  if (existingIndex < 0) {
    return {
      signal: normalized,
      changed: true,
      isNew: true,
      signals: [...existingSignals, normalized],
    };
  }
  const previous = existingSignals[existingIndex];
  const merged = {
    ...previous,
    ...normalized,
    outcome: { ...(previous.outcome || {}), ...(normalized.outcome || {}) },
    strategySignal: { ...(previous.strategySignal || {}), ...(normalized.strategySignal || {}) },
    features: {
      ...(previous.features || {}),
      ...(normalized.features || {}),
      strategy: {
        ...(previous.features?.strategy || {}),
        ...(normalized.features?.strategy || {}),
      },
    },
  };
  const changed = JSON.stringify(previous.outcome) !== JSON.stringify(merged.outcome)
    || JSON.stringify(previous.strategySignal?.metadata || {}) !== JSON.stringify(merged.strategySignal?.metadata || {});
  if (!changed) return { signal: previous, changed: false, isNew: false, signals: existingSignals };
  const next = [...existingSignals];
  next[existingIndex] = merged;
  return { signal: merged, changed: true, isNew: false, signals: next };
}
