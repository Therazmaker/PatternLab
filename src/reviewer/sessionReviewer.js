import {
  analyzeFailurePatterns,
  analyzeLearningCoverage,
  analyzeLibraryDiscipline,
  analyzeSessionSummary,
  analyzeSetupDistribution,
} from "./reviewerMetrics.js";
import { extractWinningPatterns } from "./winnerPatternExtractor.js";
import { toArray, toObject } from "./reviewerRules.js";

const SOURCE_SCHEMAS = new Set(["patternlab_microbot_journal_export_v1", "patternlab_microbot_journal_export_v2"]);
const REVIEW_SCHEMA = "patternlab_session_review_v1";

export async function loadJournalExport(fileOrJson) {
  if (!fileOrJson) {
    return { ok: false, error: "No input provided.", data: null, sourceName: "unknown" };
  }

  try {
    if (typeof fileOrJson === "string") {
      const data = JSON.parse(fileOrJson);
      return { ok: true, data, sourceName: "pasted_json" };
    }

    if (typeof File !== "undefined" && fileOrJson instanceof File) {
      const text = await fileOrJson.text();
      if (!text.trim()) return { ok: false, error: "The selected file is empty.", data: null, sourceName: fileOrJson.name || "file" };
      const data = JSON.parse(text);
      return { ok: true, data, sourceName: fileOrJson.name || "file" };
    }

    if (typeof fileOrJson === "object") {
      return { ok: true, data: fileOrJson, sourceName: "object" };
    }

    return { ok: false, error: "Unsupported input type.", data: null, sourceName: "unknown" };
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error?.message || "parse error"}`, data: null, sourceName: "unknown" };
  }
}

export function validateJournalExportSchema(data) {
  const payload = toObject(data);
  const trades = toArray(payload.trades);
  const warnings = [];
  const errors = [];

  if (!Object.keys(payload).length) errors.push("Payload is empty.");
  if (!trades.length) warnings.push("No trades found in payload.");
  if (!SOURCE_SCHEMAS.has(payload.schema)) warnings.push(`Unexpected schema: ${payload.schema || "missing"}.`);
  if (!payload.sessionSummary) warnings.push("sessionSummary missing, will be recomputed.");
  if (!payload.exportedAt) warnings.push("exportedAt missing.");

  return {
    ok: errors.length === 0 && trades.length > 0,
    sourceSchema: payload.schema || "unknown",
    tradesCount: trades.length,
    warnings,
    errors,
    limitedConfidence: !SOURCE_SCHEMAS.has(payload.schema) || warnings.length > 0,
  };
}

function analyzeMissingData(trades = [], review = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  const missing = {
    missingCritical: [],
    missingImportant: [],
    niceToHave: [],
  };

  const missingLifecycle = rows.some((trade) => !toArray(trade.lifecycleHistory).length);
  const missingMarkers = rows.some((trade) => !toArray(trade.markers).length);
  const missingStructuredLearning = review.learningAnalysis?.emptyLearningOutputPct > 60;

  if (missingStructuredLearning) missing.missingCritical.push("No structured learningOutput on close for most trades.");
  if (review.contextAnalysis?.highRiskNoWarningTrades > 0) missing.missingCritical.push("No warning propagation from dangerous context to decisionSnapshot.");
  if (missingLifecycle) missing.missingImportant.push("No lifecycle detail for part of the trades.");
  if (missingMarkers) missing.missingImportant.push("No markers despite trade closure in some records.");

  missing.missingImportant.push("No explicit blocking reason when context should veto a trade.");
  missing.missingImportant.push("No no-trade log to audit veto/skip decisions.");

  missing.niceToHave.push("No microstructure snapshot attached to each trade.");
  missing.niceToHave.push("No context score/trend regime snapshot before entry.");
  missing.niceToHave.push("No pattern version attached to every trade record.");
  missing.niceToHave.push("No explanation for why dangerous context did not veto trade.");

  return missing;
}

export function buildRecommendedFixes(reviewResult = {}) {
  const fixes = [];
  const context = reviewResult.contextAnalysis || {};
  const setup = reviewResult.setupAnalysis || {};
  const learning = reviewResult.learningAnalysis || {};

  if ((context.highDangerTrades || 0) > 0 && (context.highRiskNoWarningTrades || 0) > 0) {
    fixes.push({
      priority: "critical",
      title: "Add context veto before trade creation",
      why: "Danger context appears active while trades still execute without warnings.",
      suggestedImplementation: "Before building a paper trade, enforce NO_TRADE when high danger or avoidChase is active unless an explicit override reason is logged.",
    });
  }

  if ((context.avoidChaseTrades || 0) > 0) {
    fixes.push({
      priority: "high",
      title: "Block chase entries under avoidChase alignment",
      why: "Library warnings indicate chase risk but entries continue.",
      suggestedImplementation: "Implement pre-entry guard: if avoidChase + extension condition are both true, cancel entry and record blockingReason.",
    });
  }

  if (setup.monocultureDetected) {
    fixes.push({
      priority: "high",
      title: "Diversify setup activation",
      why: "Most trades come from one setup, creating monoculture risk.",
      suggestedImplementation: "Cap max share per setup and require at least one secondary setup candidate before increasing frequency.",
    });
  }

  if ((learning.emptyLearningOutputPct || 0) > 60) {
    fixes.push({
      priority: "high",
      title: "Persist structured learningOutput on trade close",
      why: "Trade outcomes are not consistently converted into reusable memory.",
      suggestedImplementation: "Write a mandatory learningOutput payload on close (lessonCandidate, context, trigger, veto state, outcome quality).",
    });
  }

  fixes.push({
    priority: "medium",
    title: "Add warning propagation and veto explanation",
    why: "Current snapshots make it hard to trace why risky trades were allowed.",
    suggestedImplementation: "Copy library warning flags into decisionSnapshot and store explanation when a warning does not veto a trade.",
  });

  return fixes;
}

function computeScores(review = {}) {
  const overview = review.sessionOverview || {};
  const context = review.contextAnalysis || {};
  const learning = review.learningAnalysis || {};
  const setup = review.setupAnalysis || {};
  const dataIssues = (review.dataQualityIssues || []).length;

  const executionHealth = Math.max(0, Math.min(100, Math.round(50 + (overview.expectancy || 0) * 30 - dataIssues * 8)));
  const contextDiscipline = Math.max(0, Math.min(100, Math.round(100 - ((context.highRiskNoWarningTrades || 0) * 100) / Math.max(1, overview.totalTrades || 1))));
  const learningReadiness = Math.max(0, Math.min(100, Math.round(100 - (learning.emptyLearningOutputPct || 100))));
  const dataQuality = Math.max(0, Math.min(100, Math.round(100 - dataIssues * 12)));
  const strategyDiversity = Math.max(0, Math.min(100, Math.round(setup.monocultureDetected ? 30 : 80)));

  return { executionHealth, contextDiscipline, learningReadiness, dataQuality, strategyDiversity };
}

export function reviewSessionExport(data) {
  const payload = toObject(data);
  const trades = toArray(payload.trades);
  const schemaValidation = validateJournalExportSchema(payload);

  const sessionOverview = analyzeSessionSummary(trades, toObject(payload.sessionSummary));
  const failure = analyzeFailurePatterns(trades);
  const setupAnalysis = analyzeSetupDistribution(trades);
  const contextAnalysis = analyzeLibraryDiscipline(trades);
  const learningAnalysis = analyzeLearningCoverage(trades);

  const draft = {
    schema: REVIEW_SCHEMA,
    reviewedAt: new Date().toISOString(),
    sourceSchema: payload.schema || "unknown",
    validation: schemaValidation,
    sessionOverview,
    criticalFindings: [...failure.criticalFindings],
    warnings: [...failure.warnings],
    dataQualityIssues: [...failure.dataQualityIssues],
    setupAnalysis,
    contextAnalysis,
    learningAnalysis,
    missingDataAnalysis: {},
    recommendedFixes: [],
    scores: {},
    winningDNA: {},
  };

  if (schemaValidation.limitedConfidence) draft.warnings.unshift("Limited confidence: input is incomplete or schema does not match expected export.");
  if (setupAnalysis.monocultureDetected) draft.warnings.push("Single setup concentration detected: bot is effectively monoculture.");
  if (contextAnalysis.confidencePossiblyFlat) draft.warnings.push("Decision confidence appears weakly sensitive across trades.");

  draft.missingDataAnalysis = analyzeMissingData(trades, draft);
  draft.recommendedFixes = buildRecommendedFixes(draft);
  draft.scores = computeScores(draft);
  draft.winningDNA = extractWinningPatterns(payload, { validation: schemaValidation });

  return draft;
}

export function downloadReviewJson(reviewResult = {}) {
  const payload = JSON.stringify(reviewResult, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `patternlab_session_review_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
