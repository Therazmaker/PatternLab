import { state, setFilter, setImportPreview, setSignals } from "./modules/state.js";
import {
  exportSignals,
  loadLastImportReport,
  loadMetaFeedback,
  loadSignals,
  loadBotCompilerState,
  saveLastImportReport,
  saveBotCompilerState,
  saveMetaFeedback,
  saveSignals,
} from "./modules/storage.js";
import { buildImportPreview } from "./modules/importer.js";
import { dedupeSignals, migrateStoredSignal } from "./modules/normalizer.js";
import { getFilteredSignals, renderFeedRows, renderFilterOptions } from "./modules/feed.js";
import { applyReview } from "./modules/review.js";
import { computeStats } from "./modules/stats.js";
import { computeAssetAnalysis, computeHourAnalysis, computePatternCompare, computePatternRanking, withCompareFilters } from "./modules/analytics.js";
import { computeConfidenceEvolution, computePatternVersionComparison } from "./modules/v4.js";
import { computeOverfitRisk } from "./modules/overfit.js";
import { runStressTests } from "./modules/stresstest.js";
import { computeMonteCarloSummary, runMonteCarlo } from "./modules/montecarlo.js";
import { buildRobustnessInsight, computeRobustnessScore } from "./modules/robustness.js";
import { filterNotes, loadNotes, saveNotes, upsertNote } from "./modules/journal.js";
import { enrichSignals } from "./modules/intelligence.js";
import {
  applyMetaFeedbackBias,
  buildErrorClusters,
  computeForwardValidation,
  generateHypotheses,
  generateSuggestions,
  rankSuggestions,
  updateMetaFeedback,
} from "./modules/v5.js";
import {
  BOT_DEMO_PATTERNS,
  buildPatternDefinition,
  buildPinePrompt,
  clonePatternVersion,
  comparePatternVersions,
  generateJSONSchema,
} from "./modules/botGenerator.js";
import {
  renderAssetTable,
  renderClusterDetails,
  renderCompareCards,
  renderConfidenceEvolution,
  renderErrorClusters,
  renderForwardValidation,
  renderHourTable,
  renderHypotheses,
  renderImportReport,
  renderList,
  renderNotes,
  renderPatternVersionsTable,
  renderPreview,
  renderRadarCards,
  renderRankingTable,
  renderReviewQueue,
  renderStatsOverview,
  renderSuggestions,
  renderMonteCarlo,
  renderOverfitCheck,
  renderRobustnessScore,
  renderStressTests,
} from "./modules/ui.js";

const els = {
  jsonInput: document.getElementById("json-input"), preview: document.getElementById("preview"), validateBtn: document.getElementById("btn-validate"), importBtn: document.getElementById("btn-import"), clearBtn: document.getElementById("btn-clear"), loadDemoBtn: document.getElementById("btn-load-demo"),
  includeDuplicates: document.getElementById("import-allow-duplicates"), importReport: document.getElementById("import-report"),
  feedBody: document.getElementById("feed-body"), search: document.getElementById("search"), filterAsset: document.getElementById("filter-asset"), filterDirection: document.getElementById("filter-direction"), filterPattern: document.getElementById("filter-pattern"), filterStatus: document.getElementById("filter-status"), filterTimeframe: document.getElementById("filter-timeframe"), exportBtn: document.getElementById("btn-export"), datasetFile: document.getElementById("dataset-file"),
  modal: document.getElementById("review-modal"), reviewDetails: document.getElementById("review-details"), reviewStatus: document.getElementById("review-status"), reviewComment: document.getElementById("review-comment"), reviewExpiryClose: document.getElementById("review-expiry-close"), reviewLabels: document.getElementById("review-labels"), reviewExecutionError: document.getElementById("review-execution-error"), reviewLateEntry: document.getElementById("review-late-entry"), saveReviewBtn: document.getElementById("btn-save-review"), reviewNextBtn: document.getElementById("btn-review-next"), reviewPrevBtn: document.getElementById("btn-review-prev"),
  statsOverview: document.getElementById("stats-overview"), topAssets: document.getElementById("top-assets"), topPatterns: document.getElementById("top-patterns"), directionDist: document.getElementById("direction-dist"),
  rankingWrap: document.getElementById("ranking-wrap"), hourWrap: document.getElementById("hour-wrap"), assetWrap: document.getElementById("asset-wrap"),
  kpiTotal: document.getElementById("kpi-total"), kpiPending: document.getElementById("kpi-pending"), kpiWins: document.getElementById("kpi-wins"), kpiLosses: document.getElementById("kpi-losses"), kpiWinrate: document.getElementById("kpi-winrate"),
  tabs: [...document.querySelectorAll(".tab-btn")], panels: [...document.querySelectorAll(".tab-panel")],
  comparePatterns: document.getElementById("compare-patterns"), compareAsset: document.getElementById("compare-asset"), compareDirection: document.getElementById("compare-direction"), compareTimeframe: document.getElementById("compare-timeframe"), compareRangeMode: document.getElementById("compare-range-mode"), compareRangeValue: document.getElementById("compare-range-value"), compareResults: document.getElementById("compare-results"),
  versionsWrap: document.getElementById("versions-wrap"), confidencePattern: document.getElementById("confidence-pattern"), confidenceWindow: document.getElementById("confidence-window"), confidenceWrap: document.getElementById("confidence-wrap"),
  radarAsset: document.getElementById("radar-asset"), radarDirection: document.getElementById("radar-direction"), radarPattern: document.getElementById("radar-pattern"), radarTimeframe: document.getElementById("radar-timeframe"), radarMode: document.getElementById("radar-range-mode"), radarRangeValue: document.getElementById("radar-range-value"), radarResults: document.getElementById("radar-results"),
  robustnessPattern: document.getElementById("robustness-pattern"), robustnessVersion: document.getElementById("robustness-version"), robustnessWindow: document.getElementById("robustness-window"), mcMethod: document.getElementById("mc-method"), mcSimulations: document.getElementById("mc-simulations"), runMonteCarloBtn: document.getElementById("btn-run-montecarlo"), robustnessStatus: document.getElementById("robustness-status"), overfitWrap: document.getElementById("overfit-wrap"), stressWrap: document.getElementById("stress-wrap"), montecarloWrap: document.getElementById("montecarlo-wrap"), robustnessWrap: document.getElementById("robustness-wrap"),
  noteId: document.getElementById("note-id"), noteTitle: document.getElementById("note-title"), noteContent: document.getElementById("note-content"), noteTags: document.getElementById("note-tags"), notePattern: document.getElementById("note-pattern"), noteAsset: document.getElementById("note-asset"), noteSignal: document.getElementById("note-signal"), noteForm: document.getElementById("journal-form"), noteResetBtn: document.getElementById("btn-note-reset"),
  noteSearch: document.getElementById("note-search"), noteFilterTag: document.getElementById("note-filter-tag"), noteFilterPattern: document.getElementById("note-filter-pattern"), noteFilterAsset: document.getElementById("note-filter-asset"), notesList: document.getElementById("notes-list"),
  reviewQueue: document.getElementById("review-queue"),
  forwardSplitMode: document.getElementById("forward-split-mode"), forwardRatio: document.getElementById("forward-ratio"), forwardDate: document.getElementById("forward-date"), forwardWrap: document.getElementById("forward-wrap"),
  errorClustersWrap: document.getElementById("error-clusters-wrap"), errorClusterDetails: document.getElementById("error-cluster-details"),
  hypothesisWrap: document.getElementById("hypothesis-wrap"),
  suggestionsWrap: document.getElementById("suggestions-wrap"),
  botPattern: document.getElementById("bot-pattern"), botVersion: document.getElementById("bot-version"), botDefinitionEditor: document.getElementById("bot-definition-editor"), botVersionNotes: document.getElementById("bot-version-notes"),
  botBuildDefinitionBtn: document.getElementById("btn-bot-build-definition"), botCloneVersionBtn: document.getElementById("btn-bot-clone-version"), botSaveVersionBtn: document.getElementById("btn-bot-save-version"), botCompareVersionsBtn: document.getElementById("btn-bot-compare-versions"),
  botGenerateSchemaBtn: document.getElementById("btn-bot-generate-schema"), botGeneratePromptBtn: document.getElementById("btn-bot-generate-prompt"), botCopySchemaBtn: document.getElementById("btn-bot-copy-schema"), botCopyPromptBtn: document.getElementById("btn-bot-copy-prompt"),
  botSchemaEditor: document.getElementById("bot-schema-editor"), botPromptEditor: document.getElementById("bot-prompt-editor"), botOutputStatus: document.getElementById("bot-output-status"), botVersionCompare: document.getElementById("bot-version-compare"), botIntegrationHints: document.getElementById("bot-integration-hints"),
};

const compareFilters = { asset: "", direction: "", timeframe: "", rangeMode: "all", rangeValue: 30 };
const radarFilters = { asset: "", direction: "", patternName: "", timeframe: "", rangeMode: "24h", rangeValue: 25 };
const noteFilters = { search: "", tag: "", patternName: "", asset: "" };
const forwardConfig = { splitMode: "ratio", ratio: 0.7, splitDate: "" };
let notes = [];
let lastRanking = [];
let metaFeedback = loadMetaFeedback();
let forwardValidation = null;
let errorClusters = [];
let hypotheses = [];
let suggestions = [];
let botCompilerState = loadBotCompilerState();
let botCompareTargetVersion = "";

let robustnessState = { overfit: null, stress: null, monteCarlo: { simulations: 0, insight: "Ejecuta simulación para ver resultados." }, summary: null };

function persist() { saveSignals(state.signals); }
function persistNotes() { saveNotes(notes); }
function persistBotCompiler() { saveBotCompilerState(botCompilerState); }

function getPatternVersions(patternName) {
  return botCompilerState.patternMeta?.[patternName]?.versions || [];
}

function setPatternVersions(patternName, versions) {
  if (!botCompilerState.patternMeta[patternName]) botCompilerState.patternMeta[patternName] = { versions: [] };
  botCompilerState.patternMeta[patternName].versions = versions;
  persistBotCompiler();
}

function parseEditorJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function findSignalSample(patternName, version) {
  return state.signals.find((row) => row.patternName === patternName && (row.patternVersion || "v1") === version)
    || state.signals.find((row) => row.patternName === patternName)
    || {};
}

function recalcSignals(rawSignals) {
  lastRanking = computePatternRanking(rawSignals);
  const enrichedBase = enrichSignals(rawSignals, lastRanking);
  const patternRobustness = new Map();
  [...new Set(enrichedBase.map((row) => row.patternName))].forEach((patternName) => {
    const rows = enrichedBase.filter((row) => row.patternName === patternName);
    patternRobustness.set(patternName, computeRobustnessScore(rows, { patternName, patternVersion: "all" }));
  });

  const enriched = enrichedBase.map((signal, index, arr) => ({
    ...signal,
    forwardBucket: index < Math.floor(arr.length * forwardConfig.ratio) ? "training" : "forward",
    patternMeta: {
      ...(signal.patternMeta || {}),
      robustness: {
        robustnessScore: patternRobustness.get(signal.patternName)?.robustnessScore ?? null,
        overfitRisk: patternRobustness.get(signal.patternName)?.overfit?.overfitRisk ?? "low",
        stressSummary: patternRobustness.get(signal.patternName)?.stressSummary ?? null,
        monteCarloSummary: patternRobustness.get(signal.patternName)?.monteCarloSummary ?? null,
        updatedAt: new Date().toISOString(),
      },
    },
  }));
  setSignals(dedupeSignals(enriched));
}

function replaceSignals(signals) { recalcSignals(signals); }

function refreshSharedOptions() {
  const assets = [...new Set(state.signals.map((s) => s.asset))].sort();
  const patterns = [...new Set(state.signals.map((s) => s.patternName))].sort();
  const timeframes = [...new Set(state.signals.map((s) => s.timeframe))].sort();

  renderFilterOptions(els.filterAsset, assets, "Todos los activos");
  renderFilterOptions(els.filterPattern, patterns, "Todos los patrones");
  renderFilterOptions(els.filterTimeframe, timeframes, "Todos los TF");
  renderFilterOptions(els.compareAsset, assets, "Todos los activos");
  renderFilterOptions(els.compareTimeframe, timeframes, "Todos los TF");
  renderFilterOptions(els.radarAsset, assets, "Todos los activos");
  renderFilterOptions(els.radarPattern, patterns, "Todos los patrones");
  renderFilterOptions(els.robustnessPattern, patterns, "Selecciona patrón");
  renderFilterOptions(els.radarTimeframe, timeframes, "Todos los TF");
  renderFilterOptions(els.notePattern, patterns, "-");
  renderFilterOptions(els.noteAsset, assets, "-");
  renderFilterOptions(els.noteFilterPattern, patterns, "Todos los patrones");
  renderFilterOptions(els.noteFilterAsset, assets, "Todos los assets");
  renderFilterOptions(els.confidencePattern, patterns, "Selecciona patrón");
  renderFilterOptions(els.botPattern, [...new Set([...patterns, ...BOT_DEMO_PATTERNS.map((entry) => entry.name)])].sort(), "Selecciona patrón");

  const current = [...els.comparePatterns.selectedOptions].map((o) => o.value);
  els.comparePatterns.innerHTML = patterns.map((p) => `<option value="${p}">${p}</option>`).join("");
  [...els.comparePatterns.options].forEach((o) => { o.selected = current.includes(o.value); });
  els.noteSignal.innerHTML = `<option value="">-</option>${state.signals.slice(-200).reverse().map((s) => `<option value="${s.id}">${s.id}</option>`).join("")}`;

  const robustnessPattern = els.robustnessPattern.value;
  if (robustnessPattern) {
    const versions = [...new Set(state.signals.filter((row) => row.patternName === robustnessPattern).map((row) => row.patternVersion || "v1"))].sort();
    els.robustnessVersion.innerHTML = `<option value="all">Todas las versiones</option>${versions.map((version) => `<option value="${version}">${version}</option>`).join("")}`;
  } else {
    els.robustnessVersion.innerHTML = '<option value="all">Todas las versiones</option>';
  }

  const selectedPattern = els.botPattern.value;
  if (selectedPattern) {
    const versions = [...new Set([
      ...state.signals.filter((row) => row.patternName === selectedPattern).map((row) => row.patternVersion || "v1"),
      ...getPatternVersions(selectedPattern).map((row) => row.version),
      ...BOT_DEMO_PATTERNS.filter((entry) => entry.name === selectedPattern).map((entry) => entry.version),
    ])].sort();
    renderFilterOptions(els.botVersion, versions, "Selecciona versión");
  }
}

function refreshStats() {
  const stats = computeStats(state.signals);
  renderStatsOverview(els.statsOverview, stats);
  renderList(els.topAssets, stats.topAssets);
  renderList(els.topPatterns, stats.topPatterns);
  renderList(els.directionDist, stats.directionDist);
  renderRankingTable(els.rankingWrap, lastRanking);
  renderHourTable(els.hourWrap, computeHourAnalysis(state.signals));
  renderAssetTable(els.assetWrap, computeAssetAnalysis(state.signals));
  els.kpiTotal.textContent = stats.total;
  els.kpiPending.textContent = stats.pending;
  els.kpiWins.textContent = stats.wins;
  els.kpiLosses.textContent = stats.losses;
  els.kpiWinrate.textContent = `${stats.winrate}%`;
}

function refreshFeed() { renderFeedRows(els.feedBody, getFilteredSignals(state.signals, state.filters), openReview, quickReview); }
function refreshReviewQueue() { renderReviewQueue(els.reviewQueue, state.signals.filter((s) => s.outcome.status === "pending"), openReview); }

function refreshCompare() {
  const selectedPatterns = [...els.comparePatterns.selectedOptions].map((o) => o.value);
  renderCompareCards(els.compareResults, computePatternCompare(withCompareFilters(state.signals, compareFilters), selectedPatterns));
}

function refreshVersions() { renderPatternVersionsTable(els.versionsWrap, computePatternVersionComparison(state.signals)); }

function refreshConfidenceEvolution() {
  const pattern = els.confidencePattern.value;
  const windowSize = Number(els.confidenceWindow.value) || 20;
  renderConfidenceEvolution(els.confidenceWrap, pattern ? computeConfidenceEvolution(state.signals, pattern, windowSize) : null, windowSize);
}

function refreshRadar() {
  let rows = [...state.signals];
  if (radarFilters.asset) rows = rows.filter((s) => s.asset === radarFilters.asset);
  if (radarFilters.direction) rows = rows.filter((s) => s.direction === radarFilters.direction);
  if (radarFilters.patternName) rows = rows.filter((s) => s.patternName === radarFilters.patternName);
  if (radarFilters.timeframe) rows = rows.filter((s) => s.timeframe === radarFilters.timeframe);
  rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  rows = radarFilters.rangeMode === "24h"
    ? rows.filter((s) => new Date(s.timestamp).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
    : rows.slice(0, radarFilters.rangeValue || 20);
  rows.sort((a, b) => (b.radarScore + ((b.patternMeta?.robustness?.robustnessScore || 0) * 0.12)) - (a.radarScore + ((a.patternMeta?.robustness?.robustnessScore || 0) * 0.12)));
  renderRadarCards(els.radarResults, rows);
}
function getRobustnessRows() {
  let rows = [...state.signals];
  const patternName = els.robustnessPattern.value;
  const version = els.robustnessVersion.value;
  const windowMode = els.robustnessWindow.value;
  if (patternName) rows = rows.filter((row) => row.patternName === patternName);
  if (version && version !== "all") rows = rows.filter((row) => (row.patternVersion || "v1") === version);
  rows = rows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (windowMode === "recent") {
    const size = Math.max(8, Math.floor(rows.length * 0.4));
    rows = rows.slice(-size);
  }
  if (windowMode === "forward") rows = rows.filter((row) => row.forwardBucket === "forward");
  return rows;
}

function refreshRobustnessLab() {
  const rows = getRobustnessRows();
  if (!els.robustnessPattern.value) {
    renderOverfitCheck(els.overfitWrap, null);
    renderStressTests(els.stressWrap, null);
    renderMonteCarlo(els.montecarloWrap, robustnessState.monteCarlo);
    renderRobustnessScore(els.robustnessWrap, null, "");
    return;
  }
  const context = { patternName: els.robustnessPattern.value, patternVersion: els.robustnessVersion.value || "all" };
  robustnessState.overfit = computeOverfitRisk(rows, context);
  robustnessState.stress = runStressTests(rows, { topN: 2 });
  robustnessState.summary = computeRobustnessScore(rows, context);

  renderOverfitCheck(els.overfitWrap, robustnessState.overfit);
  renderStressTests(els.stressWrap, robustnessState.stress);
  renderMonteCarlo(els.montecarloWrap, robustnessState.monteCarlo);
  renderRobustnessScore(els.robustnessWrap, robustnessState.summary, buildRobustnessInsight(robustnessState.summary));
}

async function runMonteCarloFromUI() {
  els.robustnessStatus.textContent = "Running Monte Carlo in chunks...";
  const rows = getRobustnessRows();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = runMonteCarlo(rows, {
    simulations: Number(els.mcSimulations.value) || 100,
    method: els.mcMethod.value,
  });
  robustnessState.monteCarlo = computeMonteCarloSummary(result);
  els.robustnessStatus.textContent = result.ok
    ? `Monte Carlo completed (${robustnessState.monteCarlo.simulations} sims).`
    : result.reason;
  renderMonteCarlo(els.montecarloWrap, robustnessState.monteCarlo);
}


function refreshNotes() {
  renderNotes(els.notesList, filterNotes(notes, noteFilters), editNote, removeNote);
  renderFilterOptions(els.noteFilterTag, [...new Set(notes.flatMap((n) => n.tags))].sort(), "Todas las etiquetas");
}

function refreshV5() {
  forwardValidation = computeForwardValidation(state.signals, forwardConfig);
  errorClusters = buildErrorClusters(state.signals);
  const previousDecisions = Object.fromEntries(metaFeedback.history.filter((h) => h.kind === "hypothesis").map((h) => [h.type, h.decision]));
  hypotheses = applyMetaFeedbackBias(generateHypotheses(state.signals, { previousDecisions }), metaFeedback, "hypothesis");
  suggestions = rankSuggestions(applyMetaFeedbackBias(generateSuggestions(state.signals, { forwardValidation, errorClusters }), metaFeedback, "suggestion"), metaFeedback);
  renderForwardValidation(els.forwardWrap, forwardValidation);
  renderErrorClusters(els.errorClustersWrap, errorClusters, (cluster) => renderClusterDetails(els.errorClusterDetails, cluster));
  renderClusterDetails(els.errorClusterDetails, null);
  renderHypotheses(els.hypothesisWrap, hypotheses, onHypothesisDecision);
  renderSuggestions(els.suggestionsWrap, suggestions, onSuggestionDecision);
}

function renderBotIntegrationHints() {
  const hints = [];
  const selectedPattern = els.botPattern.value;
  const selectedVersion = els.botVersion.value;

  if (selectedPattern) {
    const relatedSuggestions = suggestions.filter((item) => item.reason?.toLowerCase().includes(selectedPattern.toLowerCase())).slice(0, 2);
    relatedSuggestions.forEach((item) => hints.push(`Suggestion: ${item.title}`));
  }

  const middayCluster = errorClusters.find((cluster) => cluster.id === "cluster_midday");
  if (middayCluster) hints.push("Considera generar nueva versión filtrando horario 13-15.");

  const rankingRow = lastRanking.find((row) => row.patternName === selectedPattern);
  if (rankingRow) hints.push(`Ranking score ${rankingRow.score} · adaptive ${rankingRow.adaptiveScore}.`);

  const radarTop = [...state.signals].sort((a, b) => b.radarScore - a.radarScore).slice(0, 1)[0];
  if (radarTop) hints.push(`Radar top reciente: ${radarTop.patternName} ${radarTop.asset} (score ${radarTop.radarScore}).`);

  if (!hints.length) hints.push("Importa o revisa señales para habilitar hints de integración.");
  if (selectedPattern && selectedVersion) hints.unshift(`Compiling ${selectedPattern} ${selectedVersion}.`);

  els.botIntegrationHints.innerHTML = hints.map((text) => `<div class="panel-soft">${text}</div>`).join("");
}

function refreshBotGenerator() {
  renderBotIntegrationHints();
}

function rerender() {
  renderPreview(els.preview, state.importPreview);
  renderImportReport(els.importReport, loadLastImportReport());
  refreshSharedOptions();
  refreshFeed();
  refreshReviewQueue();
  refreshRadar();
  refreshStats();
  refreshCompare();
  refreshVersions();
  refreshConfidenceEvolution();
  refreshNotes();
  refreshV5();
  refreshBotGenerator();
  refreshRobustnessLab();
}

function onHypothesisDecision(id, decision) {
  const item = hypotheses.find((h) => h.id === id);
  if (!item) return;
  metaFeedback = updateMetaFeedback(metaFeedback, { kind: "hypothesis", type: item.type, decision, id });
  saveMetaFeedback(metaFeedback);
  rerender();
}

function onSuggestionDecision(id, decision) {
  const item = suggestions.find((s) => s.id === id);
  if (!item) return;
  metaFeedback = updateMetaFeedback(metaFeedback, { kind: "suggestion", type: item.type, decision, id });
  saveMetaFeedback(metaFeedback);
  rerender();
}

function handleValidate() { setImportPreview(buildImportPreview(els.jsonInput.value.trim(), state.signals)); rerender(); }

function handleImport() {
  if (!state.importPreview || !state.importPreview.ok) handleValidate();
  if (!state.importPreview?.ok) return;
  const selectedRows = els.includeDuplicates.checked ? state.importPreview.valid : state.importPreview.uniqueValid;
  replaceSignals([...state.signals, ...selectedRows]);
  persist();
  saveLastImportReport({ createdAt: new Date().toISOString(), total: state.importPreview.total, valid: state.importPreview.valid.length, invalid: state.importPreview.invalid.length, duplicates: state.importPreview.duplicates.length, imported: selectedRows.length });
  setImportPreview({ ...state.importPreview, message: `Importadas ${selectedRows.length} señales.` });
  rerender();
}

function openReview(signalId) {
  const signal = state.signals.find((s) => s.id === signalId);
  if (!signal) return;
  state.activeSignalId = signalId;
  els.reviewDetails.textContent = JSON.stringify(signal, null, 2);
  els.reviewStatus.value = signal.outcome.status;
  els.reviewComment.value = signal.outcome.comment || "";
  els.reviewExpiryClose.value = signal.outcome.expiryClose ?? "";
  els.reviewLabels.value = signal.reviewMeta?.labels?.join(", ") || "";
  els.reviewExecutionError.checked = Boolean(signal.reviewMeta?.executionError);
  els.reviewLateEntry.checked = Boolean(signal.reviewMeta?.lateEntry);
  els.modal.showModal();
}

function saveReviewChanges() {
  if (!state.activeSignalId) return;
  const payload = {
    status: els.reviewStatus.value,
    comment: els.reviewComment.value.trim(),
    expiryClose: els.reviewExpiryClose.value ? Number(els.reviewExpiryClose.value) : null,
    labels: els.reviewLabels.value.split(",").map((s) => s.trim()).filter(Boolean),
    executionError: els.reviewExecutionError.checked,
    lateEntry: els.reviewLateEntry.checked,
  };
  replaceSignals(state.signals.map((s) => (s.id === state.activeSignalId ? applyReview(s, payload) : s)));
  persist();
  rerender();
}

function moveReview(direction) {
  if (!state.activeSignalId) return;
  const currentIndex = state.signals.findIndex((s) => s.id === state.activeSignalId);
  const next = state.signals[currentIndex + direction];
  if (next) openReview(next.id);
}

function quickReview(signalId, status) {
  replaceSignals(state.signals.map((s) => (s.id === signalId ? applyReview(s, { status, comment: s.outcome.comment || "", expiryClose: s.outcome.expiryClose, labels: s.reviewMeta?.labels || [], executionError: s.reviewMeta?.executionError, lateEntry: s.reviewMeta?.lateEntry }) : s)));
  persist();
  rerender();
}

async function loadDemoJson() {
  const response = await fetch("./data/sample-signals.json");
  els.jsonInput.value = await response.text();
  handleValidate();
}

function handleDatasetImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed)) throw new Error("El dataset debe ser un array de señales.");
      replaceSignals(parsed.map(migrateStoredSignal));
      persist();
      setImportPreview({ ok: true, message: `Dataset cargado: ${parsed.length} señales`, total: parsed.length, valid: parsed, uniqueValid: parsed, duplicates: [], invalid: [], missingCritical: [], assets: [], patterns: [] });
    } catch (error) {
      setImportPreview({ ok: false, message: `Error importando dataset: ${error.message}` });
    }
    rerender();
  };
  reader.readAsText(file);
}

function submitNote(event) {
  event.preventDefault();
  const tags = els.noteTags.value.split(",").map((t) => t.trim()).filter(Boolean);
  const existing = notes.find((n) => n.id === els.noteId.value);
  notes = upsertNote(notes, { id: els.noteId.value || undefined, createdAt: existing?.createdAt, title: els.noteTitle.value, content: els.noteContent.value, tags, patternName: els.notePattern.value, asset: els.noteAsset.value, signalId: els.noteSignal.value });
  persistNotes();
  resetNoteForm();
  refreshNotes();
}

function resetNoteForm() { els.noteId.value = ""; els.noteForm.reset(); }
function editNote(note) { els.noteId.value = note.id; els.noteTitle.value = note.title; els.noteContent.value = note.content; els.noteTags.value = note.tags.join(", "); els.notePattern.value = note.links.patternName; els.noteAsset.value = note.links.asset; els.noteSignal.value = note.links.signalId; }
function removeNote(noteId) { notes = notes.filter((n) => n.id !== noteId); persistNotes(); refreshNotes(); }

function handleBotPatternChange() {
  refreshSharedOptions();
  const versions = getPatternVersions(els.botPattern.value);
  if (versions.length) {
    const active = versions[versions.length - 1];
    els.botVersion.value = active.version;
    els.botDefinitionEditor.value = JSON.stringify(active.definition, null, 2);
    els.botVersionNotes.value = active.notes || "";
  }
  refreshBotGenerator();
}

function handleBotVersionChange() {
  const versions = getPatternVersions(els.botPattern.value);
  const current = versions.find((row) => row.version === els.botVersion.value);
  if (current) {
    els.botDefinitionEditor.value = JSON.stringify(current.definition, null, 2);
    els.botVersionNotes.value = current.notes || "";
  }
  refreshBotGenerator();
}

function handleBuildPatternDefinition() {
  const patternName = els.botPattern.value;
  const patternVersion = els.botVersion.value || "v1";
  if (!patternName) return;
  const existing = getPatternVersions(patternName).find((row) => row.version === patternVersion);
  const baseDefinition = buildPatternDefinition(state.signals, { patternName, patternVersion, ...(existing?.definition || {}) });
  els.botDefinitionEditor.value = JSON.stringify(baseDefinition, null, 2);
  els.botOutputStatus.textContent = `Definition generated for ${patternName} ${patternVersion}.`;
}

function handleSavePatternVersion() {
  const patternName = els.botPattern.value;
  if (!patternName) return;
  const definition = parseEditorJson(els.botDefinitionEditor.value);
  if (!definition) {
    els.botOutputStatus.textContent = "Definition JSON inválido.";
    return;
  }
  const versions = getPatternVersions(patternName);
  const nextVersion = definition.version || els.botVersion.value || `v${versions.length + 1}`;
  const existingIndex = versions.findIndex((row) => row.version === nextVersion);
  const current = existingIndex >= 0 ? versions[existingIndex] : null;
  const entry = {
    version: nextVersion,
    createdAt: current?.createdAt || new Date().toISOString(),
    notes: els.botVersionNotes.value.trim(),
    definition: { ...definition, name: definition.name || patternName, version: nextVersion },
    generatedPromptHistory: current?.generatedPromptHistory || [],
  };
  const merged = existingIndex >= 0 ? versions.map((row, index) => (index === existingIndex ? entry : row)) : [...versions, entry];
  setPatternVersions(patternName, merged);
  els.botVersion.value = nextVersion;
  els.botOutputStatus.textContent = `Saved ${patternName} ${nextVersion}.`;
  refreshSharedOptions();
}

function handleClonePatternVersion() {
  const patternName = els.botPattern.value;
  if (!patternName) return;
  const versions = getPatternVersions(patternName);
  const source = versions.find((row) => row.version === els.botVersion.value) || versions[versions.length - 1];
  if (!source) return;
  const cloned = clonePatternVersion(source);
  setPatternVersions(patternName, [...versions, cloned]);
  els.botVersion.value = cloned.version;
  els.botDefinitionEditor.value = JSON.stringify(cloned.definition, null, 2);
  els.botVersionNotes.value = cloned.notes;
  els.botOutputStatus.textContent = `Cloned to ${cloned.version}.`;
  refreshSharedOptions();
}

function handleComparePatternVersions() {
  const patternName = els.botPattern.value;
  const versions = getPatternVersions(patternName);
  if (versions.length < 2) {
    els.botVersionCompare.innerHTML = '<p class="muted">Se necesitan al menos dos versiones guardadas.</p>';
    return;
  }
  const current = versions.find((row) => row.version === els.botVersion.value) || versions[versions.length - 1];
  const fallback = versions.find((row) => row.version !== current.version) || versions[0];
  const target = versions.find((row) => row.version === botCompareTargetVersion) || fallback;
  botCompareTargetVersion = target.version;
  const delta = comparePatternVersions(target, current);
  els.botVersionCompare.innerHTML = `<p><strong>${delta.from}</strong> → <strong>${delta.to}</strong></p>
    <ul class="mini-list">
      <li><span>Direction changed</span><strong>${delta.changedDirection ? "yes" : "no"}</strong></li>
      <li><span>Conditions changed</span><strong>${delta.changedConditions ? "yes" : "no"}</strong></li>
      <li><span>Filters changed</span><strong>${delta.changedFilters ? "yes" : "no"}</strong></li>
      <li><span>Execution changed</span><strong>${delta.changedExecution ? "yes" : "no"}</strong></li>
      <li><span>Notes delta</span><strong>${delta.notesDelta || "-"}</strong></li>
    </ul>`;
}

function handleGenerateSchema() {
  const definition = parseEditorJson(els.botDefinitionEditor.value);
  if (!definition) return;
  const schema = generateJSONSchema(definition, findSignalSample(els.botPattern.value, els.botVersion.value));
  els.botSchemaEditor.value = JSON.stringify(schema, null, 2);
  els.botOutputStatus.textContent = "JSON Schema generated.";
}

function handleGeneratePrompt() {
  const definition = parseEditorJson(els.botDefinitionEditor.value);
  const schema = parseEditorJson(els.botSchemaEditor.value);
  if (!definition || !schema) {
    els.botOutputStatus.textContent = "Definition/Schema JSON inválido.";
    return;
  }
  const prompt = buildPinePrompt(definition, schema);
  els.botPromptEditor.value = prompt;

  const patternName = els.botPattern.value;
  const version = definition.version || els.botVersion.value;
  if (patternName && version) {
    const versions = getPatternVersions(patternName);
    const next = versions.map((row) => {
      if (row.version !== version) return row;
      const history = [{ createdAt: new Date().toISOString(), prompt }, ...(row.generatedPromptHistory || [])].slice(0, 10);
      return { ...row, generatedPromptHistory: history };
    });
    setPatternVersions(patternName, next);
  }
  els.botOutputStatus.textContent = "Pine prompt generated.";
}

async function copyText(value, okMessage) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  els.botOutputStatus.textContent = okMessage;
}

function setupTabs() {
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.tabs.forEach((b) => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      els.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
    });
  });
}

function setupEvents() {
  els.validateBtn.addEventListener("click", handleValidate);
  els.importBtn.addEventListener("click", handleImport);
  els.clearBtn.addEventListener("click", () => { els.jsonInput.value = ""; setImportPreview(null); rerender(); });
  els.loadDemoBtn.addEventListener("click", loadDemoJson);
  els.search.addEventListener("input", (e) => { setFilter("search", e.target.value); refreshFeed(); });
  els.filterAsset.addEventListener("change", (e) => { setFilter("asset", e.target.value); refreshFeed(); });
  els.filterDirection.addEventListener("change", (e) => { setFilter("direction", e.target.value); refreshFeed(); });
  els.filterPattern.addEventListener("change", (e) => { setFilter("patternName", e.target.value); refreshFeed(); });
  els.filterStatus.addEventListener("change", (e) => { setFilter("status", e.target.value); refreshFeed(); });
  els.filterTimeframe.addEventListener("change", (e) => { setFilter("timeframe", e.target.value); refreshFeed(); });
  els.saveReviewBtn.addEventListener("click", saveReviewChanges);
  els.reviewNextBtn.addEventListener("click", () => moveReview(1));
  els.reviewPrevBtn.addEventListener("click", () => moveReview(-1));
  els.exportBtn.addEventListener("click", () => exportSignals(state.signals));
  els.datasetFile.addEventListener("change", (e) => handleDatasetImport(e.target.files[0]));

  [els.comparePatterns, els.compareAsset, els.compareDirection, els.compareTimeframe, els.compareRangeMode, els.compareRangeValue].forEach((el) => {
    el.addEventListener("input", () => {
      compareFilters.asset = els.compareAsset.value;
      compareFilters.direction = els.compareDirection.value;
      compareFilters.timeframe = els.compareTimeframe.value;
      compareFilters.rangeMode = els.compareRangeMode.value;
      compareFilters.rangeValue = Number(els.compareRangeValue.value) || 0;
      refreshCompare();
    });
  });

  [els.radarAsset, els.radarDirection, els.radarPattern, els.radarTimeframe, els.radarMode, els.radarRangeValue].forEach((el) => {
    el.addEventListener("input", () => {
      radarFilters.asset = els.radarAsset.value;
      radarFilters.direction = els.radarDirection.value;
      radarFilters.patternName = els.radarPattern.value;
      radarFilters.timeframe = els.radarTimeframe.value;
      radarFilters.rangeMode = els.radarMode.value;
      radarFilters.rangeValue = Number(els.radarRangeValue.value) || 20;
      refreshRadar();
    });
  });

  [els.robustnessPattern, els.robustnessVersion, els.robustnessWindow].forEach((el) => {
    el?.addEventListener("input", () => {
      if (el === els.robustnessPattern) refreshSharedOptions();
      refreshRobustnessLab();
    });
  });

  els.runMonteCarloBtn?.addEventListener("click", runMonteCarloFromUI);

  els.confidencePattern.addEventListener("change", refreshConfidenceEvolution);
  els.confidenceWindow.addEventListener("change", refreshConfidenceEvolution);

  els.forwardSplitMode?.addEventListener("change", () => { forwardConfig.splitMode = els.forwardSplitMode.value; refreshV5(); });
  els.forwardRatio?.addEventListener("input", () => { forwardConfig.ratio = Number(els.forwardRatio.value) / 100; refreshV5(); });
  els.forwardDate?.addEventListener("change", () => { forwardConfig.splitDate = els.forwardDate.value; refreshV5(); });

  els.noteForm.addEventListener("submit", submitNote);
  els.noteResetBtn.addEventListener("click", resetNoteForm);
  els.noteSearch.addEventListener("input", (e) => { noteFilters.search = e.target.value; refreshNotes(); });
  els.noteFilterTag.addEventListener("change", (e) => { noteFilters.tag = e.target.value; refreshNotes(); });
  els.noteFilterPattern.addEventListener("change", (e) => { noteFilters.patternName = e.target.value; refreshNotes(); });
  els.noteFilterAsset.addEventListener("change", (e) => { noteFilters.asset = e.target.value; refreshNotes(); });

  els.botPattern?.addEventListener("change", handleBotPatternChange);
  els.botVersion?.addEventListener("change", handleBotVersionChange);
  els.botBuildDefinitionBtn?.addEventListener("click", handleBuildPatternDefinition);
  els.botSaveVersionBtn?.addEventListener("click", handleSavePatternVersion);
  els.botCloneVersionBtn?.addEventListener("click", handleClonePatternVersion);
  els.botCompareVersionsBtn?.addEventListener("click", handleComparePatternVersions);
  els.botGenerateSchemaBtn?.addEventListener("click", handleGenerateSchema);
  els.botGeneratePromptBtn?.addEventListener("click", handleGeneratePrompt);
  els.botCopySchemaBtn?.addEventListener("click", () => copyText(els.botSchemaEditor.value, "Schema copied."));
  els.botCopyPromptBtn?.addEventListener("click", () => copyText(els.botPromptEditor.value, "Prompt copied."));
}

function init() {
  replaceSignals(loadSignals());
  notes = loadNotes();
  if (!Object.keys(botCompilerState.patternMeta || {}).length) {
    BOT_DEMO_PATTERNS.forEach((entry) => {
      const definition = buildPatternDefinition(state.signals, { patternName: entry.name, patternVersion: entry.version });
      botCompilerState.patternMeta[entry.name] = {
        versions: [{ version: entry.version, definition, createdAt: new Date().toISOString(), notes: "Demo pattern", generatedPromptHistory: [] }],
      };
    });
    persistBotCompiler();
  }
  setupTabs();
  setupEvents();
  rerender();

  if (!els.botPattern.value && BOT_DEMO_PATTERNS.length) {
    els.botPattern.value = BOT_DEMO_PATTERNS[0].name;
    handleBotPatternChange();
    handleBuildPatternDefinition();
    handleGenerateSchema();
  }
}

init();
