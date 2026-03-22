import { state, setActiveSessionId, setFilter, setImportPreview, setSessions, setSignals } from "./modules/state.js";
import {
  clearLegacyStorage,
  createBackupNow,
  downloadBackup,
  downloadFullMemory,
  exportDataset,
  exportSignals,
  getStorageStatus,
  importMemory,
  initializeStorage,
  loadActivePatternVersionId,
  loadLastImportReport,
  loadMarketData,
  loadMarketDataMeta,
  loadMetaFeedback,
  loadLivePatternSignals,
  loadLivePatternSummary,
  loadFuturesPolicyConfig,
  loadFuturesPolicySnapshots,
  loadLiveShadowState,
  loadNotes,
  loadPatternVersionsRegistry,
  loadPromotedPatterns,
  loadSeededPatternResults,
  loadSeededPatterns,
  loadSessions,
  loadSignals,
  loadBotCompilerState,
  restoreBackup,
  saveActivePatternVersionId,
  saveLastImportReport,
  saveMarketData,
  saveMarketDataMeta,
  saveBotCompilerState,
  saveLivePatternSignals,
  saveLivePatternSummary,
  saveFuturesPolicyConfig,
  saveFuturesPolicySnapshots,
  saveLiveShadowState,
  saveMetaFeedback,
  saveNotes,
  savePatternVersionsRegistry,
  savePromotedPatterns,
  saveSeededPatternResults,
  saveSeededPatterns,
  saveSessions,
  saveSignals,
  validateMemoryPayload,
} from "./modules/storage.js";
import {
  fetchYahooCandles,
  normalizeYahooCandles,
  mergeCandles,
  getLatestCandleTimestamp,
  getEarliestCandleTimestamp,
  importCandlesFromFile,
  runMarketDataIntegrityCheck,
  enrichCandles,
  loadHistoricalCandles,
  subscribeLiveCandles,
  unsubscribeLiveCandles,
  getAvailableSymbols,
  getSourceStatus,
  resyncLatestCandles,
  MARKET_DATA_SOURCES,
} from "./modules/marketData.js";
import {
  NEURON_DEFINITIONS,
  calculateNeuronActivations,
  getTopNeuronTypes,
  summarizeNeuronActivations,
} from "./modules/neuronEngine.js";
import { discoverCandidatePatterns } from "./modules/patternDiscovery.js";
import { normalizePromotedPattern, summarizeReviewState, upsertPromotedPattern } from "./modules/patternReview.js";
import {
  buildNeuronCoactivationGraph,
  getNodeTopConnections,
  getStrongestEdges,
  getTopConnectedNeurons,
  renderNeuronGraph,
} from "./modules/neuronGraph.js";
import { buildImportPreview } from "./modules/importer.js";
import { buildLiveImportPreview, computeLivePatternSummary, normalizeLivePatternSignal } from "./modules/livePatternSignals.js";
import { buildClusterGraph, getWeightBounds } from "./src/modules/clusterMap/clusterGraphBuilder.js";
import { buildSeededCandidatePayload, evaluateSeededPattern } from "./modules/seededPatternLab.js";
import { renderClusterInspector, renderClusterSummary, syncRangeInput } from "./src/modules/clusterMap/clusterUI.js";
import { renderClusterMap } from "./src/modules/clusterMap/clusterMap.js";
import { dedupeSignals, migrateStoredSignal } from "./modules/normalizer.js";
import { getFilteredSignals, renderFeedRows, renderFilterOptions } from "./modules/feed.js";
import { applyReview } from "./modules/review.js";
import { buildSrContextFromQuickAdd, buildSrInsights, computeSrStats, normalizeSrContext } from "./modules/sr.js";
import { computeSessionStats, deriveCandleColor, normalizeSession } from "./modules/sessions.js";
import { buildSessionCandleExplanations, getDefaultSessionAnalysisConfig } from "./modules/sessionAnalysis.js";
import { computeExcursionFromSignal, deriveColorHint, formatExcursion, normalizeCandleData, normalizeExcursion, normalizeOHLCInput, normalizeSessionRef, normalizeV3Meta, validateOHLCConsistency } from "./modules/v3.js";
import { computeStats } from "./modules/stats.js";
import { computeAssetAnalysis, computeHourAnalysis, computePatternCompare, computePatternRanking, withCompareFilters } from "./modules/analytics.js";
import { computeConfidenceEvolution, computePatternVersionComparison } from "./modules/v4.js";
import {
  archivePatternVersion,
  ensurePatternVersionExists,
  getQuickAddVersionOptions,
  rebuildPatternVersionsFromSignals,
  setActivePatternVersion,
  updatePatternVersionNotes,
} from "./modules/patternVersions.js";
import { computeOverfitRisk } from "./modules/overfit.js";
import { runStressTests } from "./modules/stresstest.js";
import { computeMonteCarloSummary, runMonteCarlo } from "./modules/montecarlo.js";
import { buildRobustnessInsight, computeRobustnessScore } from "./modules/robustness.js";
import { filterNotes, upsertNote } from "./modules/journal.js";
import { enrichSignals } from "./modules/intelligence.js";
import { createLiveShadowMonitor } from "./modules/liveShadowMonitor.js";
import { createLiveShadowTimeline } from "./modules/liveShadowTimeline.js";
import { computeLiveShadowStats } from "./modules/liveShadowStats.js";
import { formatConfidence, formatNumber, formatPct, formatTs, getOutcomeBadgeClass } from "./modules/liveShadowFormatters.js";
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
  renderSrContextAnalysis,
  renderSuggestions,
  renderMonteCarlo,
  renderOverfitCheck,
  renderRobustnessScore,
  renderStressTests,
} from "./modules/ui.js";

const els = {
  quickAddPattern: document.getElementById("quick-add-pattern"), quickAddVersion: document.getElementById("quick-add-version"), quickAddInput: document.getElementById("quick-add-input"), quickAddBtn: document.getElementById("btn-quick-add"), quickAddFeedback: document.getElementById("quick-add-feedback"), quickAddNearSupport: document.getElementById("quick-add-near-support"), quickAddNearResistance: document.getElementById("quick-add-near-resistance"), quickAddSrComment: document.getElementById("quick-add-sr-comment"), quickAddV3Toggle: document.getElementById("quick-add-v3-toggle"), quickAddOpen: document.getElementById("quick-add-open"), quickAddHigh: document.getElementById("quick-add-high"), quickAddLow: document.getElementById("quick-add-low"), quickAddClose: document.getElementById("quick-add-close"), quickAddMfe: document.getElementById("quick-add-mfe"), quickAddMae: document.getElementById("quick-add-mae"), quickAddExcursionUnit: document.getElementById("quick-add-excursion-unit"), quickAddAttachSession: document.getElementById("quick-add-attach-session"), quickAddSessionCandle: document.getElementById("quick-add-session-candle"), quickAddAutoExcursion: document.getElementById("btn-quick-add-auto-excursion"),
  jsonInput: document.getElementById("json-input"), preview: document.getElementById("preview"), validateBtn: document.getElementById("btn-validate"), importBtn: document.getElementById("btn-import"), clearBtn: document.getElementById("btn-clear"), loadDemoBtn: document.getElementById("btn-load-demo"),
  includeDuplicates: document.getElementById("import-allow-duplicates"), importReport: document.getElementById("import-report"),
  feedBody: document.getElementById("feed-body"), search: document.getElementById("search"), filterAsset: document.getElementById("filter-asset"), filterDirection: document.getElementById("filter-direction"), filterPattern: document.getElementById("filter-pattern"), filterStatus: document.getElementById("filter-status"), filterTimeframe: document.getElementById("filter-timeframe"), filterNearSupport: document.getElementById("filter-near-support"), filterNearResistance: document.getElementById("filter-near-resistance"), filterHasOHLC: document.getElementById("filter-has-ohlc"), filterHasExcursion: document.getElementById("filter-has-excursion"), filterHasSession: document.getElementById("filter-has-session"), filterMfeMin: document.getElementById("filter-mfe-min"), filterMaeMax: document.getElementById("filter-mae-max"), exportBtn: document.getElementById("btn-export"), datasetFile: document.getElementById("dataset-file"),
  modal: document.getElementById("review-modal"), reviewDetails: document.getElementById("review-details"), reviewStatus: document.getElementById("review-status"), reviewComment: document.getElementById("review-comment"), reviewExpiryClose: document.getElementById("review-expiry-close"), reviewLabels: document.getElementById("review-labels"), reviewExecutionError: document.getElementById("review-execution-error"), reviewLateEntry: document.getElementById("review-late-entry"), reviewNearSupport: document.getElementById("review-near-support"), reviewNearResistance: document.getElementById("review-near-resistance"), reviewSrComment: document.getElementById("review-sr-comment"), reviewV3Toggle: document.getElementById("review-v3-toggle"), reviewOpen: document.getElementById("review-open"), reviewHigh: document.getElementById("review-high"), reviewLow: document.getElementById("review-low"), reviewClose: document.getElementById("review-close"), reviewMfe: document.getElementById("review-mfe"), reviewMae: document.getElementById("review-mae"), reviewExcursionUnit: document.getElementById("review-excursion-unit"), reviewSessionLink: document.getElementById("review-session-link"), reviewSessionCandle: document.getElementById("review-session-candle"), reviewV3Notes: document.getElementById("review-v3-notes"), reviewAutoExcursion: document.getElementById("btn-review-auto-excursion"), saveReviewBtn: document.getElementById("btn-save-review"), reviewNextBtn: document.getElementById("btn-review-next"), reviewPrevBtn: document.getElementById("btn-review-prev"),
  statsOverview: document.getElementById("stats-overview"), v3SignalStats: document.getElementById("v3-signal-stats"), sessionStats: document.getElementById("session-stats"), topAssets: document.getElementById("top-assets"), topPatterns: document.getElementById("top-patterns"), directionDist: document.getElementById("direction-dist"), srAnalysisWrap: document.getElementById("sr-analysis-wrap"),
  rankingWrap: document.getElementById("ranking-wrap"), hourWrap: document.getElementById("hour-wrap"), assetWrap: document.getElementById("asset-wrap"),
  kpiTotal: document.getElementById("kpi-total"), kpiPending: document.getElementById("kpi-pending"), kpiWins: document.getElementById("kpi-wins"), kpiLosses: document.getElementById("kpi-losses"), kpiWinrate: document.getElementById("kpi-winrate"),
  tabs: [...document.querySelectorAll(".tab-btn")], panels: [...document.querySelectorAll(".tab-panel")],
  comparePatterns: document.getElementById("compare-patterns"), compareAsset: document.getElementById("compare-asset"), compareDirection: document.getElementById("compare-direction"), compareTimeframe: document.getElementById("compare-timeframe"), compareRangeMode: document.getElementById("compare-range-mode"), compareRangeValue: document.getElementById("compare-range-value"), compareNearSupport: document.getElementById("compare-near-support"), compareNearResistance: document.getElementById("compare-near-resistance"), compareResults: document.getElementById("compare-results"),
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
  settingsStorageSummary: document.getElementById("settings-storage-summary"), settingsStorageStatus: document.getElementById("settings-storage-status"), settingsStorageBackend: document.getElementById("settings-storage-backend"), settingsMigrationStatus: document.getElementById("settings-migration-status"), settingsLastBackup: document.getElementById("settings-last-backup"), settingsExportMemoryBtn: document.getElementById("btn-export-memory"), settingsImportFile: document.getElementById("settings-import-file"), settingsImportMode: document.getElementById("settings-import-mode"), settingsImportPreview: document.getElementById("settings-import-preview"), settingsImportMemoryBtn: document.getElementById("btn-import-memory"), settingsBackupNowBtn: document.getElementById("btn-backup-now"), settingsDownloadBackupBtn: document.getElementById("btn-download-backup"), settingsRestoreBackupBtn: document.getElementById("btn-restore-backup"), settingsValidateMemoryBtn: document.getElementById("btn-validate-memory"), settingsClearLegacyBtn: document.getElementById("btn-clear-legacy-storage"), settingsStatus: document.getElementById("settings-status"),
  botPattern: document.getElementById("bot-pattern"), botVersion: document.getElementById("bot-version"), botDefinitionEditor: document.getElementById("bot-definition-editor"), botVersionNotes: document.getElementById("bot-version-notes"),
  botBuildDefinitionBtn: document.getElementById("btn-bot-build-definition"), botCloneVersionBtn: document.getElementById("btn-bot-clone-version"), botSaveVersionBtn: document.getElementById("btn-bot-save-version"), botCompareVersionsBtn: document.getElementById("btn-bot-compare-versions"),
  botGenerateSchemaBtn: document.getElementById("btn-bot-generate-schema"), botGeneratePromptBtn: document.getElementById("btn-bot-generate-prompt"), botCopySchemaBtn: document.getElementById("btn-bot-copy-schema"), botCopyPromptBtn: document.getElementById("btn-bot-copy-prompt"),
  botSchemaEditor: document.getElementById("bot-schema-editor"), botPromptEditor: document.getElementById("bot-prompt-editor"), botOutputStatus: document.getElementById("bot-output-status"), botVersionCompare: document.getElementById("bot-version-compare"), botIntegrationHints: document.getElementById("bot-integration-hints"), sessionNewBtn: document.getElementById("btn-new-session"), sessionCloseBtn: document.getElementById("btn-close-session"), sessionDate: document.getElementById("session-date"), sessionAsset: document.getElementById("session-asset"), sessionTf: document.getElementById("session-tf"), sessionNotes: document.getElementById("session-notes"), sessionCandleTime: document.getElementById("session-candle-time"), sessionCandleOpen: document.getElementById("session-candle-open"), sessionCandleHigh: document.getElementById("session-candle-high"), sessionCandleLow: document.getElementById("session-candle-low"), sessionCandleClose: document.getElementById("session-candle-close"), sessionAddCandleBtn: document.getElementById("btn-add-candle"), sessionClearCandleBtn: document.getElementById("btn-clear-candle"), sessionDuplicateOpenBtn: document.getElementById("btn-duplicate-open"), sessionActiveHeader: document.getElementById("session-active-header"), sessionSvg: document.getElementById("session-canvas"), sessionAnalysisPanel: document.getElementById("session-analysis-panel"), sessionSummary: document.getElementById("session-summary"), sessionCandleStatus: document.getElementById("session-candle-status"), sessionCandlesBody: document.getElementById("session-candles-body"), pastSessions: document.getElementById("past-sessions"), sessionToggleOverlay: document.getElementById("session-toggle-overlay"), sessionToggleNarratives: document.getElementById("session-toggle-narratives"), sessionToggleNear: document.getElementById("session-toggle-near"), sessionToggleMetrics: document.getElementById("session-toggle-metrics"), sessionToggleReplay: document.getElementById("session-toggle-replay"), sessionPrevBtn: document.getElementById("btn-session-prev"), sessionNextBtn: document.getElementById("btn-session-next"), sessionPlayBtn: document.getElementById("btn-session-play"), sessionPauseBtn: document.getElementById("btn-session-pause"),
  mdSource: document.getElementById("md-source"), mdAsset: document.getElementById("md-asset"), mdTimeframe: document.getElementById("md-timeframe"), mdRange: document.getElementById("md-range"), mdLiveStatus: document.getElementById("md-live-status"), mdFetchBtn: document.getElementById("btn-md-fetch"), mdSyncBtn: document.getElementById("btn-md-sync"), mdImportBtn: document.getElementById("btn-md-import"), mdImportFile: document.getElementById("md-import-file"), mdExportBtn: document.getElementById("btn-md-export"), mdIntegrityBtn: document.getElementById("btn-md-integrity"), mdNeuronBtn: document.getElementById("btn-md-neurons"), mdBuildGraphBtn: document.getElementById("btn-md-build-graph"), mdDiscoverPatternsBtn: document.getElementById("btn-md-discover-patterns"), mdClearBtn: document.getElementById("btn-md-clear"), mdStatus: document.getElementById("md-status"), mdDiagnostics: document.getElementById("md-diagnostics"), mdNeuronSummary: document.getElementById("md-neuron-summary"), mdPatternSummary: document.getElementById("md-pattern-summary"), mdPatternBody: document.getElementById("md-pattern-body"), mdPatternDetails: document.getElementById("md-pattern-details"), mdGraphSummary: document.getElementById("md-graph-summary"), mdGraphContainer: document.getElementById("md-graph-container"), mdGraphDetails: document.getElementById("md-graph-details"), mdNeuronPreviewBody: document.getElementById("md-neuron-preview-body"), mdPreviewBody: document.getElementById("md-preview-body"), mdLiveShadowStatus: document.getElementById("md-live-shadow-status"), mdLiveShadowPolicy: document.getElementById("md-live-shadow-policy"), mdLiveShadowPending: document.getElementById("md-live-shadow-pending"), mdLiveShadowStats: document.getElementById("md-live-shadow-stats"), mdLiveShadowTimelineBody: document.getElementById("md-live-shadow-timeline-body"), mdLiveShadowDetail: document.getElementById("md-live-shadow-detail"), mdLiveShadowFilterSymbol: document.getElementById("md-live-shadow-filter-symbol"), mdLiveShadowFilterTimeframe: document.getElementById("md-live-shadow-filter-timeframe"), mdLiveShadowFilterAction: document.getElementById("md-live-shadow-filter-action"), mdLiveShadowFilterResult: document.getElementById("md-live-shadow-filter-result"), prSummary: document.getElementById("pr-summary"), prTableBody: document.getElementById("pr-table-body"), prInspect: document.getElementById("pr-inspect"), prPromoteBtn: document.getElementById("btn-pr-promote"), prRejectBtn: document.getElementById("btn-pr-reject"), prIgnoreBtn: document.getElementById("btn-pr-ignore"), prPromotedSummary: document.getElementById("pr-promoted-summary"), clusterMinEdge: document.getElementById("cluster-min-edge"), clusterMinEdgeValue: document.getElementById("cluster-min-edge-value"), clusterMinNode: document.getElementById("cluster-min-node"), clusterMinNodeValue: document.getElementById("cluster-min-node-value"), clusterSessionFilter: document.getElementById("cluster-session-filter"), clusterMapSummary: document.getElementById("cluster-map-summary"), clusterMapContainer: document.getElementById("cluster-map-container"), clusterMapInspector: document.getElementById("cluster-map-inspector"),
};

els.seededNeuronSelect = document.getElementById("seeded-neuron-select");
els.seededDirectionMode = document.getElementById("seeded-direction-mode");
els.seededSessionFilter = document.getElementById("seeded-session-filter");
els.seededExpiry1 = document.getElementById("seeded-expiry-1");
els.seededExpiry2 = document.getElementById("seeded-expiry-2");
els.seededExpiry3 = document.getElementById("seeded-expiry-3");
els.seededExpiry5 = document.getElementById("seeded-expiry-5");
els.seededSelected = document.getElementById("seeded-selected");
els.seededRunBtn = document.getElementById("btn-seeded-run");
els.seededSaveBtn = document.getElementById("btn-seeded-save");
els.seededPromoteBtn = document.getElementById("btn-seeded-promote");
els.seededExportBtn = document.getElementById("btn-seeded-export");
els.seededStatus = document.getElementById("seeded-status");
els.seededSummary = document.getElementById("seeded-summary");
els.seededTableBody = document.getElementById("seeded-table-body");
els.seededInspector = document.getElementById("seeded-inspector");
els.seededExamplesBody = document.getElementById("seeded-examples-body");

els.importerMode = document.getElementById("importer-mode");
els.quickAddBlock = document.getElementById("quick-add-block");
els.liveLogBlock = document.getElementById("live-log-block");
els.researchActions = document.getElementById("research-actions");
els.liveActions = document.getElementById("live-actions");
els.livePatternSelector = document.getElementById("live-pattern-selector");
els.livePatternId = document.getElementById("live-pattern-id");
els.livePatternName = document.getElementById("live-pattern-name");
els.liveAsset = document.getElementById("live-asset");
els.liveTimeframe = document.getElementById("live-timeframe");
els.liveDirection = document.getElementById("live-direction");
els.liveTriggerTs = document.getElementById("live-trigger-ts");
els.liveEntryTs = document.getElementById("live-entry-ts");
els.liveExpiryBars = document.getElementById("live-expiry-bars");
els.liveExpiryTs = document.getElementById("live-expiry-ts");
els.liveEntryPrice = document.getElementById("live-entry-price");
els.liveExpiryPrice = document.getElementById("live-expiry-price");
els.liveSession = document.getElementById("live-session");
els.liveOpen = document.getElementById("live-open");
els.liveHigh = document.getElementById("live-high");
els.liveLow = document.getElementById("live-low");
els.liveClose = document.getElementById("live-close");
els.liveMfe = document.getElementById("live-mfe");
els.liveMae = document.getElementById("live-mae");
els.liveNotes = document.getElementById("live-notes");
els.liveFeedback = document.getElementById("live-feedback");
els.liveSaveBtn = document.getElementById("btn-live-save");
els.liveImportBtn = document.getElementById("btn-live-import");
els.liveValidateBtn = document.getElementById("btn-live-validate");
els.liveClearBtn = document.getElementById("btn-live-clear");

const compareFilters = { asset: "", direction: "", timeframe: "", rangeMode: "all", rangeValue: 30, nearSupport: "", nearResistance: "" };
const radarFilters = { asset: "", direction: "", patternName: "", timeframe: "", rangeMode: "24h", rangeValue: 25 };
const noteFilters = { search: "", tag: "", patternName: "", asset: "" };
const forwardConfig = { splitMode: "ratio", ratio: 0.7, splitDate: "" };
let notes = [];
let lastRanking = [];
let metaFeedback = { usefulHypothesisTypes: [], weakHypothesisTypes: [], dismissedHypothesisTypes: [], acceptedSuggestionTypes: [], ignoredSuggestionTypes: [], history: [] };
let forwardValidation = null;
let errorClusters = [];
let hypotheses = [];
let suggestions = [];
let botCompilerState = { patternMeta: {} };
let botCompareTargetVersion = "";
let patternVersionsRegistry = [];
let activePatternVersionId = "";
let patternVersionCreateMessage = "";
let sessionHistoryId = "";
let selectedSessionCandleIndex = null;
let sessionReplayTimer = null;
let editingSessionCandleIndex = null;
let sessionCandleDraft = null;
const sessionAnalysisConfig = getDefaultSessionAnalysisConfig();
const SESSION_PREFS_KEY = "patternlab.sessionAnalysisPrefs.v1";
let sessionAnalysisPrefs = { showOverlay: true, showNarratives: true, showNear: true, showMetrics: true, replayMode: false };

let robustnessState = { overfit: null, stress: null, monteCarlo: { simulations: 0, insight: "Ejecuta simulación para ver resultados." }, summary: null };
let pendingMemoryImport = null;
let storageStatus = null;

let marketDataCandles = [];
let marketDataMeta = {
  lastSyncAt: null,
  lastCandleTimestamp: null,
  source: MARKET_DATA_SOURCES.YAHOO,
  selectedSymbol: "EURUSD=X",
  selectedTimeframe: "5m",
  liveStatus: { connected: false, reconnectAttempts: 0, lastMessageAt: null, statusType: "idle" },
  lastLiveCandleCloseAt: null,
};
let marketDataLiveToken = null;
let marketDataOpenCandle = null;
let futuresPolicyConfig = { enabled: true, maxLeverage: 3, defaultRiskPct: 0.5, minRiskReward: 1.5, stopMode: "hybrid", tpMode: "hybrid", noTradeOnConflict: true, maxHoldBars: 24 };
let futuresPolicySnapshots = [];
const liveShadowMonitor = createLiveShadowMonitor({ maxHistory: 400 });
const liveShadowTimeline = createLiveShadowTimeline({ limit: 300 });
let liveShadowFilters = { symbol: "all", timeframe: "all", action: "all", result: "all" };
let liveShadowStats = computeLiveShadowStats([]);
let liveShadowSelectedId = "";
let marketDataDiagnostics = null;
let neuronActivations = [];
let neuronSummary = null;
let neuronGraph = null;
let selectedGraphNodeId = "";
let selectedGraphEdgeKey = "";
let patternDiscoveryResult = null;
let clusterGraph = null;
let selectedClusterNodeId = "";
let selectedSeededNeurons = [];
let seededPatternResult = null;
let seededPatterns = [];
let seededPatternResults = [];
const clusterMapFilters = { minEdgeWeight: 1, minNodeWeight: 1, session: "all" };
let selectedPatternCandidateId = "";
let selectedReviewCandidateId = "";
let promotedPatterns = [];
let patternReviewDecisions = {};
let livePatternSignals = [];
let livePatternSummary = [];
let importerMode = "research";

function setSettingsStatus(message, kind = "muted") {
  if (!els.settingsStatus) return;
  els.settingsStatus.className = `settings-status ${kind}`;
  els.settingsStatus.textContent = message || "";
}

function refreshStorageStatusUI() {
  storageStatus = getStorageStatus();
  if (!els.settingsStorageSummary || !storageStatus) return;
  const { counts, estimatedBytes, backend, migrationStatus, lastBackupAt } = storageStatus;
  els.settingsStorageBackend.textContent = backend === "indexedDB" ? "IndexedDB" : "localStorage (fallback)";
  els.settingsMigrationStatus.textContent = migrationStatus?.status || "pending";
  els.settingsLastBackup.textContent = lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "Sin backup";
  els.settingsStorageSummary.innerHTML = `
    <li><span>Señales</span><strong>${counts.signals}</strong></li>
    <li><span>Sesiones</span><strong>${counts.sessions}</strong></li>
    <li><span>Pattern Versions</span><strong>${counts.patternVersions}</strong></li>
    <li><span>Reviews</span><strong>${counts.reviews}</strong></li>
    <li><span>Promoted Patterns</span><strong>${counts.promotedPatterns || 0}</strong></li>
    <li><span>Live Signals</span><strong>${counts.livePatternSignals || 0}</strong></li>
    <li><span>Live Summary Rows</span><strong>${counts.livePatternSummary || 0}</strong></li>
    <li><span>Live Shadow Records</span><strong>${counts.liveShadowRecords || 0}</strong></li>
    <li><span>Tamaño estimado</span><strong>${Math.round(estimatedBytes / 1024)} KB</strong></li>
  `;
  els.settingsStorageStatus.textContent = backend === "indexedDB"
    ? "Storage ready: IndexedDB principal activo."
    : "IndexedDB no disponible, usando fallback localStorage.";
}

function persist() {
  refreshFuturesSnapshots();
  Promise.all([saveSignals(state.signals), saveSessions(state.sessions), saveFuturesPolicySnapshots(futuresPolicySnapshots), saveFuturesPolicyConfig(futuresPolicyConfig), persistLiveShadowState()])
    .catch((error) => console.error("[Storage] persist() failed", error));
}
function persistNotes() { saveNotes(notes).catch((error) => console.error("[Storage] saveNotes failed", error)); }
function persistBotCompiler() { saveBotCompilerState(botCompilerState).catch((error) => console.error("[Storage] saveBotCompiler failed", error)); }
function persistPatternVersions() { savePatternVersionsRegistry(patternVersionsRegistry).catch((error) => console.error("[Storage] savePatternVersions failed", error)); }
function persistPromotedPatterns() { savePromotedPatterns(promotedPatterns).catch((error) => console.error("[Storage] savePromotedPatterns failed", error)); }
function persistLivePatternDomains() {
  Promise.all([saveLivePatternSignals(livePatternSignals), saveLivePatternSummary(livePatternSummary)])
    .catch((error) => console.error("[Storage] saveLivePattern domains failed", error));
}

function syncPatternVersionsWithSignals(signals) {
  patternVersionsRegistry = rebuildPatternVersionsFromSignals(signals, patternVersionsRegistry);
  persistPatternVersions();
  if (!activePatternVersionId || !patternVersionsRegistry.some((entry) => entry.id === activePatternVersionId && !entry.isArchived)) {
    const fallback = patternVersionsRegistry.find((entry) => !entry.isArchived);
    activePatternVersionId = fallback?.id || "";
    saveActivePatternVersionId(activePatternVersionId);
  }
}

function refreshQuickAddVersionOptions() {
  if (!els.quickAddPattern || !els.quickAddVersion) return;
  const patternName = els.quickAddPattern.value;
  const versions = patternName ? getQuickAddVersionOptions(patternVersionsRegistry, patternName) : [];
  renderFilterOptions(els.quickAddVersion, versions, versions.length ? "Selecciona versión" : "Sin versiones");

  const activeForPattern = patternVersionsRegistry.find((entry) => entry.id === activePatternVersionId && entry.patternName === patternName && !entry.isArchived);
  if (activeForPattern && versions.includes(activeForPattern.version)) {
    els.quickAddVersion.value = activeForPattern.version;
  } else if (versions.length) {
    els.quickAddVersion.value = versions[versions.length - 1];
  }
}


function refreshLivePatternSelector() {
  if (!els.livePatternSelector) return;
  const options = promotedPatterns.map((row) => row.sourceCandidateId || row.id).filter(Boolean);
  renderFilterOptions(els.livePatternSelector, options, options.length ? "Selecciona patrón promovido" : "Sin promoted patterns");
}

function setLiveFeedback(message, tone = "muted") {
  if (!els.liveFeedback) return;
  els.liveFeedback.className = `quick-add-feedback ${tone}`;
  els.liveFeedback.textContent = message || "";
}

function toInputIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function applyImporterMode() {
  const isLive = importerMode === "live";
  if (els.quickAddBlock) els.quickAddBlock.style.display = isLive ? "none" : "block";
  if (els.liveLogBlock) els.liveLogBlock.style.display = isLive ? "block" : "none";
  if (els.researchActions) els.researchActions.style.display = isLive ? "none" : "flex";
  if (els.liveActions) els.liveActions.style.display = isLive ? "flex" : "none";
}

function getLiveFormSignal() {
  return {
    patternId: els.livePatternId?.value || "",
    patternName: els.livePatternName?.value || "",
    asset: els.liveAsset?.value || "",
    timeframe: els.liveTimeframe?.value || "",
    direction: els.liveDirection?.value || "CALL",
    triggerTimestamp: fromDateTimeInput(els.liveTriggerTs?.value),
    entryTimestamp: fromDateTimeInput(els.liveEntryTs?.value),
    expiryBars: els.liveExpiryBars?.value,
    expiryTimestamp: fromDateTimeInput(els.liveExpiryTs?.value),
    entryPrice: els.liveEntryPrice?.value,
    expiryPrice: els.liveExpiryPrice?.value,
    session: els.liveSession?.value || null,
    open: els.liveOpen?.value,
    high: els.liveHigh?.value,
    low: els.liveLow?.value,
    close: els.liveClose?.value,
    mfe: els.liveMfe?.value,
    mae: els.liveMae?.value,
    notes: els.liveNotes?.value || "",
  };
}

function clearLiveForm() {
  [els.livePatternId, els.livePatternName, els.liveAsset, els.liveTimeframe, els.liveTriggerTs, els.liveEntryTs, els.liveExpiryBars, els.liveExpiryTs, els.liveEntryPrice, els.liveExpiryPrice, els.liveSession, els.liveOpen, els.liveHigh, els.liveLow, els.liveClose, els.liveMfe, els.liveMae, els.liveNotes].forEach((el) => { if (el) el.value = ""; });
  if (els.liveDirection) els.liveDirection.value = "CALL";
  setLiveFeedback("");
}

function handleLiveValidate() {
  const preview = buildLiveImportPreview(els.jsonInput.value.trim(), livePatternSignals);
  setImportPreview(preview);
  if (preview.ok) setLiveFeedback(`Valid live: ${preview.uniqueValid.length} importables`, "success");
  rerender();
}

function importLiveFromPreview(preview, message = "") {
  if (!preview?.ok) return false;
  const selectedRows = els.includeDuplicates.checked ? preview.valid : preview.uniqueValid;
  livePatternSignals = [...livePatternSignals, ...selectedRows];
  livePatternSummary = computeLivePatternSummary(livePatternSignals);
  persistLivePatternDomains();
  setImportPreview({ ...preview, message: message || `Imported ${selectedRows.length} live signals.` });
  setLiveFeedback(message || `Imported ${selectedRows.length} live signals.`, "success");
  return true;
}

function handleLiveImport() {
  if (!state.importPreview || !state.importPreview.ok) handleLiveValidate();
  if (!state.importPreview?.ok) return;
  importLiveFromPreview(state.importPreview);
  rerender();
}

function handleLiveSave() {
  const { signal, errors } = normalizeLivePatternSignal(getLiveFormSignal());
  if (errors.length) {
    setLiveFeedback(errors[0], "error");
    return;
  }
  livePatternSignals = [...livePatternSignals, signal];
  livePatternSummary = computeLivePatternSummary(livePatternSignals);
  persistLivePatternDomains();
  setLiveFeedback("Live signal saved", "success");
  clearLiveForm();
  rerender();
}

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
  const enrichedBase = enrichSignals(rawSignals, lastRanking, { marketDataCandles, neuronActivations, seededPatterns, futuresPolicyConfig });
  const patternRobustness = new Map();
  [...new Set(enrichedBase.map((row) => row.patternName))].forEach((patternName) => {
    const rows = enrichedBase.filter((row) => row.patternName === patternName);
    patternRobustness.set(patternName, computeRobustnessScore(rows, { patternName, patternVersion: "all" }));
  });

  const enriched = enrichedBase.map((signal, index, arr) => ({
    ...signal,
    candleData: normalizeCandleData(signal.candleData),
    excursion: normalizeExcursion(signal.excursion),
    sessionRef: normalizeSessionRef(signal.sessionRef),
    v3Meta: normalizeV3Meta(signal.v3Meta),
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

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || null;
}

function replaceSessions(nextSessions) {
  setSessions((nextSessions || []).map(normalizeSession));
  if (!state.sessions.some((s) => s.id === state.activeSessionId)) {
    const active = state.sessions.find((s) => s.status === "active");
    setActiveSessionId(active?.id || null);
  }
}

function loadSessionAnalysisPrefs() {
  try {
    const raw = localStorage.getItem(SESSION_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    sessionAnalysisPrefs = {
      ...sessionAnalysisPrefs,
      showOverlay: parsed?.showOverlay !== false,
      showNarratives: parsed?.showNarratives !== false,
      showNear: parsed?.showNear !== false,
      showMetrics: parsed?.showMetrics !== false,
      replayMode: Boolean(parsed?.replayMode),
    };
  } catch {
    sessionAnalysisPrefs = { ...sessionAnalysisPrefs };
  }
}

function saveSessionAnalysisPrefs() {
  localStorage.setItem(SESSION_PREFS_KEY, JSON.stringify(sessionAnalysisPrefs));
}

function syncSessionAnalysisToggleUI() {
  if (els.sessionToggleOverlay) els.sessionToggleOverlay.checked = sessionAnalysisPrefs.showOverlay;
  if (els.sessionToggleNarratives) els.sessionToggleNarratives.checked = sessionAnalysisPrefs.showNarratives;
  if (els.sessionToggleNear) els.sessionToggleNear.checked = sessionAnalysisPrefs.showNear;
  if (els.sessionToggleMetrics) els.sessionToggleMetrics.checked = sessionAnalysisPrefs.showMetrics;
  if (els.sessionToggleReplay) els.sessionToggleReplay.checked = sessionAnalysisPrefs.replayMode;
}

function getSessionRecordedSignal(session, candleIndex) {
  if (!session || !Number.isInteger(candleIndex)) return null;
  return state.signals.find((signal) => signal.sessionRef?.sessionId === session.id && signal.sessionRef?.candleIndex === candleIndex) || null;
}

function setSessionCandleStatus(message = "", tone = "muted") {
  if (!els.sessionCandleStatus) return;
  els.sessionCandleStatus.textContent = message;
  els.sessionCandleStatus.className = `quick-add-feedback ${tone}`;
}

function clearSessionCandleEdit() {
  editingSessionCandleIndex = null;
  sessionCandleDraft = null;
}

function normalizeRecordedSignalSelection(value) {
  const selected = String(value || "none").toLowerCase();
  if (["call", "put"].includes(selected)) return selected.toUpperCase();
  return null;
}

function removeSignalSessionReference(signal) {
  const next = { ...signal, sessionRef: normalizeSessionRef({ sessionId: null, candleIndex: null }) };
  return next;
}

function reindexSessionSignals(sessionId, removedIndex) {
  let touched = false;
  const nextSignals = state.signals.map((signal) => {
    if (signal.sessionRef?.sessionId !== sessionId || !Number.isInteger(signal.sessionRef?.candleIndex)) return signal;
    if (signal.sessionRef.candleIndex === removedIndex) {
      touched = true;
      return removeSignalSessionReference(signal);
    }
    if (signal.sessionRef.candleIndex > removedIndex) {
      touched = true;
      return { ...signal, sessionRef: normalizeSessionRef({ ...signal.sessionRef, candleIndex: signal.sessionRef.candleIndex - 1 }) };
    }
    return signal;
  });
  if (touched) replaceSignals(nextSignals);
  return touched;
}

function syncRecordedSignalForCandle(session, candleIndex, value) {
  if (!session || !Number.isInteger(candleIndex)) return false;
  const existing = getSessionRecordedSignal(session, candleIndex);
  const nextDirection = normalizeRecordedSignalSelection(value);
  if (!existing && !nextDirection) return false;
  if (!existing && nextDirection) {
    setSessionCandleStatus("No linked signal found for this candle. Recorded signal badge remains informational.", "warning");
    return false;
  }
  if (existing && !nextDirection) {
    if (!window.confirm(`This will unlink signal ${existing.id} from candle #${candleIndex}. Continue?`)) return false;
    replaceSignals(state.signals.map((signal) => signal.id === existing.id ? removeSignalSessionReference(signal) : signal));
    return true;
  }
  if (existing.direction === nextDirection) return false;
  if (!window.confirm(`Signal ${existing.id} direction will change from ${existing.direction} to ${nextDirection}. Continue?`)) return false;
  replaceSignals(state.signals.map((signal) => signal.id === existing.id ? { ...signal, direction: nextDirection } : signal));
  return true;
}

function stopSessionReplay() {
  if (sessionReplayTimer) {
    window.clearInterval(sessionReplayTimer);
    sessionReplayTimer = null;
  }
}

function getSelectedExplanation(session, explanations = []) {
  if (!session?.candles?.length || !explanations.length) return null;
  const fallback = explanations[explanations.length - 1] || null;
  if (!selectedSessionCandleIndex) return fallback;
  return explanations.find((item) => item.candleIndex === selectedSessionCandleIndex) || fallback;
}

function signalBadgeLabel(stateValue) {
  if (stateValue === "call") return "CALL";
  if (stateValue === "put") return "PUT";
  if (stateValue === "near-call") return "NEAR CALL";
  if (stateValue === "near-put") return "NEAR PUT";
  return "NO SIGNAL";
}

function renderSessionAnalysisPanel(session, explanations = []) {
  if (!els.sessionAnalysisPanel) return;
  if (!session || !session.candles.length || !explanations.length) {
    els.sessionAnalysisPanel.innerHTML = '<p class="muted">Select a candle to see the analytical read.</p>';
    return;
  }
  const explanation = getSelectedExplanation(session, explanations);
  if (!explanation) {
    els.sessionAnalysisPanel.innerHTML = '<p class="muted">No analysis available.</p>';
    return;
  }
  const recorded = getSessionRecordedSignal(session, explanation.candleIndex);
  const timeLabel = session.candles.find((c) => c.index === explanation.candleIndex)?.timeLabel || "-";
  const metrics = explanation.metrics || {};
  const structure = explanation.structureContext || null;
  const metricPills = [
    `RSI: ${typeof metrics.rsi === "number" ? metrics.rsi.toFixed(2) : "-"}`,
    `RSI EMA: ${typeof metrics.rsiEma === "number" ? metrics.rsiEma.toFixed(2) : "-"}`,
    `Δ RSI-EMA: ${typeof metrics.rsiMinusEma === "number" ? metrics.rsiMinusEma.toFixed(2) : "-"}`,
    `Slope: ${typeof metrics.slopeHint === "number" ? metrics.slopeHint.toFixed(2) : "-"}`,
    `Direction: ${metrics.reclaimDirection || "-"}`,
  ];
  const readLabel = signalBadgeLabel(explanation.signalState);
  els.sessionAnalysisPanel.innerHTML = `
    <div class="session-analysis-header">
      <h3>Candle #${explanation.candleIndex} · ${timeLabel}</h3>
      <span class="badge session-state ${explanation.signalState || "none"}">${readLabel}</span>
    </div>
    <div class="session-analysis-tags">
      <span class="badge">Analytical Read: ${explanation.structureLabel || "Mixed Structure"}</span>
      <span class="badge ${recorded ? "v3-session" : ""}">${recorded ? `Recorded Signal: ${recorded.direction}` : "No Recorded Signal"}</span>
      ${structure ? `<span class="badge">Context: ${structure.startCandleIndex}-${structure.endCandleIndex} (${structure.windowSize} velas)</span>` : ""}
    </div>
    <div class="session-analysis-block">
      <h4>Price Structure Read</h4>
      <p>${explanation.priceStructureRead || "No structural read available."}</p>
    </div>
    <div class="session-analysis-block">
      <h4>Indicator Confirmation</h4>
      <p>${explanation.indicatorConfirmation || explanation.summary}</p>
    </div>
    <div class="session-analysis-block">
      <h4>Why this matters</h4>
      <p>${explanation.whyThisMatters || "Context remains mixed; wait for a cleaner sequence."}</p>
    </div>
    <div class="session-analysis-block">
      <h4>What is still missing</h4>
      <p>${explanation.whatIsMissing || "No additional requirement."}</p>
    </div>
    <div class="split">
      <div>
        <h4>Technical checks met</h4>
        <ul class="mini-list">${(explanation.passedConditions || []).length ? explanation.passedConditions.map((item) => `<li><span>${item}</span><strong>✓</strong></li>`).join("") : '<li><span class="muted">No confirmed conditions</span></li>'}</ul>
      </div>
      <div>
        <h4>Technical checks pending</h4>
        <ul class="mini-list">${(explanation.failedConditions || []).length ? explanation.failedConditions.map((item) => `<li><span>${item}</span><strong>·</strong></li>`).join("") : '<li><span class="muted">No pending conditions</span></li>'}</ul>
      </div>
    </div>
    ${sessionAnalysisPrefs.showMetrics ? `<div class="session-metrics">${metricPills.map((item) => `<span class="badge">${item}</span>`).join("")}</div>` : ""}
    ${sessionAnalysisPrefs.showNarratives ? `<pre class="session-narrative muted">${explanation.narrative || ""}</pre>` : ""}
  `;
}

function renderSessionHeader() {
  if (!els.sessionActiveHeader) return;
  const active = getActiveSession();
  if (!active) {
    els.sessionActiveHeader.innerHTML = '<p class="muted">No hay sesión activa.</p>';
    return;
  }
  els.sessionActiveHeader.innerHTML = `<div class="note-head"><h3>${active.date}</h3><span class="badge">${active.status}</span></div><p class="muted">${active.asset || "-"} · ${active.tf || "-"} · started ${new Date(active.startedAt).toLocaleString()}</p>`;
}

function drawSessionCandles(session, explanations = []) {
  if (!els.sessionSvg) return;
  if (!session || !session.candles.length) {
    els.sessionSvg.innerHTML = '<div class="muted">Agrega velas para visualizarlas.</div>';
    return;
  }
  const candles = session.candles;
  const highs = candles.map((c) => c.high).filter((v) => typeof v === "number");
  const lows = candles.map((c) => c.low).filter((v) => typeof v === "number");
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = Math.max(max - min, 0.00001);
  const width = Math.max(900, candles.length * 34);
  const height = 280;
  const y = (price) => 18 + ((max - price) / range) * (height - 36);
  const markerColor = (stateValue) => {
    if (stateValue === "call") return "#58d09b";
    if (stateValue === "put") return "#ff857a";
    if (stateValue === "near-call") return "#2f7f61";
    if (stateValue === "near-put") return "#8b5550";
    return "#64748b";
  };
  const selectedExplanation = explanations.find((item) => item.candleIndex === selectedSessionCandleIndex) || explanations[explanations.length - 1] || null;
  const context = selectedExplanation?.structureContext || null;
  let contextBand = "";
  if (context) {
    const startX = 18 + (context.startCandleIndex - 1) * 34;
    const endX = 18 + context.endCandleIndex * 34 - 14;
    contextBand = `<rect x="${startX}" y="8" width="${Math.max(10, endX - startX)}" height="${height - 16}" fill="rgba(96,165,250,0.08)" stroke="rgba(147,197,253,0.5)" stroke-dasharray="4 4" rx="6" />`;
  }
  const bodies = candles.map((candle, i) => {
    if ([candle.open, candle.high, candle.low, candle.close].some((v) => typeof v !== "number")) return "";
    const x = 18 + i * 34;
    const openY = y(candle.open);
    const closeY = y(candle.close);
    const highY = y(candle.high);
    const lowY = y(candle.low);
    const color = deriveCandleColor(candle) || "doji";
    const fill = color === "green" ? "#22c55e" : color === "red" ? "#ef4444" : "#a1a1aa";
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(Math.abs(closeY - openY), 2);
    const explanation = explanations.find((item) => item.candleIndex === candle.index);
    const stateValue = explanation?.signalState || "none";
    const showMarker = sessionAnalysisPrefs.showOverlay && (sessionAnalysisPrefs.showNear || !String(stateValue).startsWith("near"));
    const marker = showMarker && stateValue !== "none" ? `<circle cx="${x + 8}" cy="${lowY + 8}" r="3.5" fill="${markerColor(stateValue)}" />` : "";
    const selectedStroke = selectedSessionCandleIndex === candle.index ? '#93c5fd' : 'transparent';
    return `<g data-candle-index="${candle.index}"><line x1="${x + 8}" x2="${x + 8}" y1="${highY}" y2="${lowY}" stroke="${fill}" /><rect x="${x + 2}" y="${bodyTop}" width="12" height="${bodyH}" fill="${fill}" stroke="${selectedStroke}" stroke-width="1.5" rx="2"><title>#${candle.index} O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}${explanation ? ` | ${signalBadgeLabel(explanation.signalState)}` : ""}</title></rect>${marker}</g>`;
  }).join("");
  els.sessionSvg.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="280">${contextBand}${bodies}</svg>`;
  els.sessionSvg.querySelectorAll('[data-candle-index]').forEach((node) => {
    node.addEventListener('mouseenter', () => {
      selectedSessionCandleIndex = Number(node.getAttribute('data-candle-index'));
      renderSessionAnalysisPanel(session, explanations);
    });
    node.addEventListener('click', () => {
      selectedSessionCandleIndex = Number(node.getAttribute('data-candle-index'));
      refreshSessionCandlesTab();
    });
  });
}

function renderSessionTable(session, explanations = []) {
  if (!els.sessionCandlesBody) return;
  if (!session || !session.candles.length) {
    els.sessionCandlesBody.innerHTML = '<tr><td colspan="10" class="muted">Sin velas.</td></tr>';
    return;
  }
  els.sessionCandlesBody.innerHTML = session.candles.map((c) => {
    const explanation = explanations.find((item) => item.candleIndex === c.index);
    const stateValue = explanation?.signalState || "none";
    const analytical = signalBadgeLabel(stateValue);
    const recorded = getSessionRecordedSignal(session, c.index);
    const selectedClass = selectedSessionCandleIndex === c.index ? 'session-row-selected' : '';
    const isEditing = editingSessionCandleIndex === c.index;
    if (isEditing) {
      const draft = sessionCandleDraft || {};
      const selectedRecorded = draft.recordedSignal || "none";
      return `<tr data-table-candle="${c.index}" class="${selectedClass} session-row-editing"><td>${c.index}</td><td><input data-edit-field="timeLabel" value="${draft.timeLabel || ""}" placeholder="Time" /></td><td><input data-edit-field="open" type="number" step="0.00001" value="${draft.open ?? ""}" /></td><td><input data-edit-field="high" type="number" step="0.00001" value="${draft.high ?? ""}" /></td><td><input data-edit-field="low" type="number" step="0.00001" value="${draft.low ?? ""}" /></td><td><input data-edit-field="close" type="number" step="0.00001" value="${draft.close ?? ""}" /></td><td>${deriveCandleColor(draft) || c.colorHint || "-"}</td><td><span class="badge session-state ${stateValue}">${analytical}</span></td><td><select data-edit-field="recordedSignal"><option value="none" ${selectedRecorded === "none" ? "selected" : ""}>None / No Recorded Signal</option><option value="call" ${selectedRecorded === "call" ? "selected" : ""}>CALL</option><option value="put" ${selectedRecorded === "put" ? "selected" : ""}>PUT</option></select></td><td><div class="button-row compact"><button class="primary" data-candle-action="save" data-candle-index="${c.index}">Save</button><button class="ghost" data-candle-action="cancel" data-candle-index="${c.index}">Cancel</button></div></td></tr>`;
    }
    const recordedLabel = recorded ? `Recorded Signal (${recorded.direction})` : "No Recorded Signal";
    return `<tr data-table-candle="${c.index}" class="${selectedClass}"><td>${c.index}</td><td>${c.timeLabel || "-"}</td><td>${c.open ?? "-"}</td><td>${c.high ?? "-"}</td><td>${c.low ?? "-"}</td><td>${c.close ?? "-"}</td><td>${c.colorHint || deriveCandleColor(c) || "-"}</td><td><span class="badge session-state ${stateValue}">${analytical}</span></td><td>${recordedLabel}</td><td><div class="button-row compact"><button class="ghost" data-candle-action="edit" data-candle-index="${c.index}">Edit</button><button class="ghost" data-candle-action="delete" data-candle-index="${c.index}">Delete</button></div></td></tr>`;
  }).join("");

  els.sessionCandlesBody.querySelectorAll('[data-table-candle]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('[data-candle-action]') || event.target.closest('[data-edit-field]')) return;
      selectedSessionCandleIndex = Number(row.getAttribute('data-table-candle'));
      refreshSessionCandlesTab();
    });
  });

  els.sessionCandlesBody.querySelectorAll('[data-edit-field]').forEach((input) => {
    input.addEventListener('input', (event) => {
      if (!sessionCandleDraft) return;
      const field = event.target.getAttribute('data-edit-field');
      const value = event.target.value;
      if (["open", "high", "low", "close"].includes(field)) {
        sessionCandleDraft[field] = normalizeOHLCInput(value);
      } else if (field === "recordedSignal") {
        sessionCandleDraft.recordedSignal = String(value || "none").toLowerCase();
      } else {
        sessionCandleDraft[field] = value;
      }
    });
  });

  els.sessionCandlesBody.querySelectorAll('[data-candle-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-candle-action');
      const candleIndex = Number(btn.getAttribute('data-candle-index'));
      const target = session.candles.find((candle) => candle.index === candleIndex);
      if (!target) return;
      if (action === 'edit') {
        editingSessionCandleIndex = candleIndex;
        const recorded = getSessionRecordedSignal(session, candleIndex);
        sessionCandleDraft = {
          timeLabel: target.timeLabel || "",
          open: target.open,
          high: target.high,
          low: target.low,
          close: target.close,
          recordedSignal: recorded ? String(recorded.direction || "none").toLowerCase() : "none",
        };
        setSessionCandleStatus("Editing candle...", "muted");
        refreshSessionCandlesTab();
        return;
      }
      if (action === 'cancel') {
        clearSessionCandleEdit();
        setSessionCandleStatus("Edition canceled.", "muted");
        refreshSessionCandlesTab();
        return;
      }
      if (action === 'save') {
        const check = validateOHLCConsistency(sessionCandleDraft || {});
        const hasMissing = [sessionCandleDraft?.open, sessionCandleDraft?.high, sessionCandleDraft?.low, sessionCandleDraft?.close].some((value) => value === null);
        if (!check.valid) {
          setSessionCandleStatus(check.message, "error");
          return;
        }
        if (hasMissing) {
          setSessionCandleStatus("Warning: OHLC incomplete. Candle will be saved with partial data.", "warning");
        }
        const updatedCandle = {
          ...target,
          timeLabel: sessionCandleDraft?.timeLabel ? String(sessionCandleDraft.timeLabel) : null,
          open: sessionCandleDraft?.open ?? null,
          high: sessionCandleDraft?.high ?? null,
          low: sessionCandleDraft?.low ?? null,
          close: sessionCandleDraft?.close ?? null,
        };
        updatedCandle.colorHint = deriveCandleColor(updatedCandle);
        const updatedSignals = syncRecordedSignalForCandle(session, candleIndex, sessionCandleDraft?.recordedSignal || "none");
        replaceSessions(state.sessions.map((row) => row.id === session.id ? normalizeSession({ ...row, candles: row.candles.map((candle) => candle.index === candleIndex ? updatedCandle : candle) }) : row));
        clearSessionCandleEdit();
        persist();
        setSessionCandleStatus(updatedSignals ? "Candle updated and linked signal adjusted." : "Candle updated.", "success");
        refreshSessionCandlesTab();
        return;
      }
      if (action === 'delete') {
        const linked = getSessionRecordedSignal(session, candleIndex);
        const warning = linked
          ? `Candle #${candleIndex} has linked signal ${linked.id}. Deleting it will unlink and reindex later links. Continue?`
          : `Delete candle #${candleIndex}?`;
        if (!window.confirm(warning)) return;
        const remaining = session.candles
          .filter((candle) => candle.index !== candleIndex)
          .map((candle, idx) => ({ ...candle, index: idx + 1 }));
        const adjustedSignals = reindexSessionSignals(session.id, candleIndex);
        replaceSessions(state.sessions.map((row) => row.id === session.id ? normalizeSession({ ...row, candles: remaining }) : row));
        clearSessionCandleEdit();
        persist();
        setSessionCandleStatus(adjustedSignals ? "Candle deleted. Linked signal references were adjusted safely." : "Candle deleted.", adjustedSignals ? "warning" : "success");
        if (selectedSessionCandleIndex === candleIndex) selectedSessionCandleIndex = remaining[remaining.length - 1]?.index || null;
        refreshSessionCandlesTab();
      }
    });
  });
}

function renderSessionSummary(session) {
  if (!els.sessionSummary) return;
  if (!session) { els.sessionSummary.innerHTML = '<p class="muted">Sin sesión activa.</p>'; return; }
  const stats = computeSessionStats(session.candles);
  els.sessionSummary.innerHTML = `<ul class="mini-list"><li><span>Total candles</span><strong>${stats.totalCandles}</strong></li><li><span>Green/Red/Doji</span><strong>${stats.greenCandles}/${stats.redCandles}/${stats.dojiCandles}</strong></li><li><span>High/Low</span><strong>${stats.highOfSession ?? "-"} / ${stats.lowOfSession ?? "-"}</strong></li><li><span>Range</span><strong>${stats.highOfSession !== null && stats.lowOfSession !== null ? (stats.highOfSession - stats.lowOfSession).toFixed(5) : "-"}</strong></li><li><span>Status</span><strong>${session.status}</strong></li></ul>`;
}

function renderPastSessions() {
  if (!els.pastSessions) return;
  if (!state.sessions.length) { els.pastSessions.innerHTML = '<p class="muted">Sin historial de sesiones.</p>'; return; }
  els.pastSessions.innerHTML = state.sessions.slice().reverse().map((session) => `<article class="panel-soft"><div class="note-head"><h4>${session.date}</h4><span class="badge">${session.status}</span></div><p class="muted">${session.asset || "-"} ${session.tf || ""} · ${session.stats.totalCandles} velas</p><div class="button-row compact"><button class="ghost" data-view-session="${session.id}">View</button><button class="ghost" data-reopen-session="${session.id}">Reopen</button><button class="ghost" data-delete-session="${session.id}">Delete</button></div></article>`).join("");
  els.pastSessions.querySelectorAll('[data-view-session]').forEach((btn) => btn.addEventListener('click', () => { sessionHistoryId = btn.dataset.viewSession; refreshSessionCandlesTab(); }));
  els.pastSessions.querySelectorAll('[data-reopen-session]').forEach((btn) => btn.addEventListener('click', () => {
    replaceSessions(state.sessions.map((s) => s.id === btn.dataset.reopenSession ? normalizeSession({ ...s, status: 'active', endedAt: null }) : s));
    setActiveSessionId(btn.dataset.reopenSession);
    persist();
    refreshSessionCandlesTab();
  }));
  els.pastSessions.querySelectorAll('[data-delete-session]').forEach((btn) => btn.addEventListener('click', () => {
    if (!window.confirm('Delete session?')) return;
    replaceSessions(state.sessions.filter((s) => s.id !== btn.dataset.deleteSession));
    persist();
    refreshSessionCandlesTab();
  }));
}

function refreshSessionCandlesTab() {
  const active = getActiveSession();
  const viewed = state.sessions.find((s) => s.id === sessionHistoryId) || active;
  const explanations = viewed ? buildSessionCandleExplanations(viewed.candles, sessionAnalysisConfig) : [];
  if (viewed?.candles?.length && !selectedSessionCandleIndex) selectedSessionCandleIndex = viewed.candles[viewed.candles.length - 1].index;
  if (!viewed?.candles?.some((c) => c.index === selectedSessionCandleIndex)) selectedSessionCandleIndex = viewed?.candles?.[viewed.candles.length - 1]?.index || null;
  renderSessionHeader();
  drawSessionCandles(viewed, explanations);
  renderSessionTable(viewed, explanations);
  renderSessionAnalysisPanel(viewed, explanations);
  renderSessionSummary(viewed);
  renderPastSessions();
  if (els.sessionPrevBtn) els.sessionPrevBtn.disabled = !viewed?.candles?.length;
  if (els.sessionNextBtn) els.sessionNextBtn.disabled = !viewed?.candles?.length;
  if (els.sessionPlayBtn) els.sessionPlayBtn.disabled = !viewed?.candles?.length || !sessionAnalysisPrefs.replayMode;
  if (els.sessionPauseBtn) els.sessionPauseBtn.disabled = !sessionReplayTimer;
}

function refreshSharedOptions() {
  const assets = [...new Set(state.signals.map((s) => s.asset))].sort();
  const patterns = [...new Set([
    ...state.signals.map((s) => s.patternName),
    ...patternVersionsRegistry.filter((entry) => !entry.isArchived).map((entry) => entry.patternName),
  ])].sort();
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
    const versions = [...new Set([
      ...state.signals.filter((row) => row.patternName === robustnessPattern).map((row) => row.patternVersion || "v1"),
      ...getQuickAddVersionOptions(patternVersionsRegistry, robustnessPattern),
    ])].sort();
    els.robustnessVersion.innerHTML = `<option value="all">Todas las versiones</option>${versions.map((version) => `<option value="${version}">${version}</option>`).join("")}`;
  } else {
    els.robustnessVersion.innerHTML = '<option value="all">Todas las versiones</option>';
  }

  renderFilterOptions(els.quickAddPattern, patterns, "Selecciona patrón");
  if (!els.quickAddPattern.value && patterns.length) {
    els.quickAddPattern.value = patterns[0];
  }
  refreshQuickAddVersionOptions();
  refreshLivePatternSelector();
  const isV3 = (els.quickAddVersion?.value || "").toLowerCase().includes("v3");
  if (els.quickAddV3Toggle) els.quickAddV3Toggle.open = isV3;
  const activeSession = getActiveSession();
  if (els.quickAddAttachSession) {
    els.quickAddAttachSession.disabled = !activeSession;
    if (!activeSession) els.quickAddAttachSession.checked = false;
  }
  if (els.quickAddSessionCandle) {
    const candles = activeSession?.candles || [];
    els.quickAddSessionCandle.innerHTML = `<option value="">Última vela</option>${candles.map((c) => `<option value="${c.index}">#${c.index}</option>`).join("")}`;
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
  const srStats = computeSrStats(state.signals);
  renderSrContextAnalysis(els.srAnalysisWrap, srStats, buildSrInsights(srStats));
  els.kpiTotal.textContent = stats.total;
  els.kpiPending.textContent = stats.pending;
  els.kpiWins.textContent = stats.wins;
  els.kpiLosses.textContent = stats.losses;
  els.kpiWinrate.textContent = `${stats.winrate}%`;

  if (els.v3SignalStats) {
    const completeOHLC = state.signals.filter((s) => [s?.candleData?.open, s?.candleData?.high, s?.candleData?.low, s?.candleData?.close].every((v) => typeof v === "number"));
    const withExcursion = state.signals.filter((s) => typeof s?.excursion?.mfe === "number" || typeof s?.excursion?.mae === "number");
    const avg = (rows, key) => rows.length ? (rows.reduce((acc, row) => acc + (Number(row?.excursion?.[key]) || 0), 0) / rows.length).toFixed(4) : "-";
    els.v3SignalStats.innerHTML = `<div class="stat-card"><span>% OHLC completo</span><strong>${state.signals.length ? ((completeOHLC.length / state.signals.length) * 100).toFixed(1) : 0}%</strong></div><div class="stat-card"><span>Avg MFE</span><strong>${avg(withExcursion, "mfe")}</strong></div><div class="stat-card"><span>Avg MAE</span><strong>${avg(withExcursion, "mae")}</strong></div>`;
  }
  if (els.sessionStats) {
    const sessions = state.sessions;
    const totalCandles = sessions.reduce((acc, s) => acc + (s.stats?.totalCandles || 0), 0);
    const ranges = sessions.map((s) => (s.stats?.highOfSession ?? 0) - (s.stats?.lowOfSession ?? 0)).filter((v) => v > 0);
    const avgRange = ranges.length ? (ranges.reduce((a, b) => a + b, 0) / ranges.length).toFixed(5) : "-";
    const withSignals = sessions.filter((s) => state.signals.some((sig) => sig.sessionRef?.sessionId === s.id)).length;
    els.sessionStats.innerHTML = `<div class="stat-card"><span>Sesiones</span><strong>${sessions.length}</strong></div><div class="stat-card"><span>Velas totales</span><strong>${totalCandles}</strong></div><div class="stat-card"><span>Rango promedio</span><strong>${avgRange}</strong></div><div class="stat-card"><span>Sesiones con señales</span><strong>${withSignals}</strong></div>`;
  }
}

function refreshFeed() { renderFeedRows(els.feedBody, getFilteredSignals(state.signals, state.filters), openReview, quickReview); }
function refreshReviewQueue() { renderReviewQueue(els.reviewQueue, state.signals.filter((s) => s.outcome.status === "pending"), openReview); }

function refreshFuturesSnapshots() {
  const reviewed = state.signals.filter((s) => s.futuresPolicy?.replay && s.outcome?.status !== "pending");
  if (!reviewed.length) return;
  const pnlRows = reviewed.map((s) => Number(s.futuresPolicy?.replay?.pnlR || 0));
  const avgPnlR = pnlRows.reduce((a, b) => a + b, 0) / pnlRows.length;
  const noTradeCount = reviewed.filter((s) => s.futuresPolicy?.action === "NO_TRADE").length;
  const snapshot = {
    createdAt: new Date().toISOString(),
    sample: reviewed.length,
    avgPnlR: Number(avgPnlR.toFixed(4)),
    noTradeRate: Number((noTradeCount / reviewed.length).toFixed(4)),
    policyVersion: reviewed[0]?.futuresPolicy?.policyVersion || "phase1-shadow-v1",
  };
  futuresPolicySnapshots = [snapshot, ...futuresPolicySnapshots].slice(0, 200);
}

function refreshCompare() {
  const selectedPatterns = [...els.comparePatterns.selectedOptions].map((o) => o.value);
  renderCompareCards(els.compareResults, computePatternCompare(withCompareFilters(state.signals, compareFilters), selectedPatterns));
}

function refreshVersions() {
  renderPatternVersionsTable(els.versionsWrap, computePatternVersionComparison(state.signals, patternVersionsRegistry, activePatternVersionId), {
    createMessage: patternVersionCreateMessage,
    onCreate: handleCreatePatternVersion,
    onEditNotes: handleEditPatternVersionNotes,
    onArchive: handleArchivePatternVersion,
    onActivate: handleActivatePatternVersion,
  }, [...new Set(patternVersionsRegistry.map((entry) => entry.patternName))].sort());
}

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
  rows.sort((a, b) => ((b.radarFuturesScore ?? b.radarScore) + ((b.patternMeta?.robustness?.robustnessScore || 0) * 0.12)) - ((a.radarFuturesScore ?? a.radarScore) + ((a.patternMeta?.robustness?.robustnessScore || 0) * 0.12)));
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
  refreshSessionCandlesTab();
  refreshStorageStatusUI();
  renderPatternReviewPanel();
  renderSeededPatternLab();
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

function handleValidate() {
  const preview = importerMode === "live"
    ? buildLiveImportPreview(els.jsonInput.value.trim(), livePatternSignals)
    : buildImportPreview(els.jsonInput.value.trim(), state.signals);
  setImportPreview(preview);
  rerender();
}


async function handleExportMemory() {
  downloadFullMemory();
  setSettingsStatus("Exportación completa descargada.", "ok");
}

async function handleValidateMemoryFile() {
  const file = els.settingsImportFile?.files?.[0];
  if (!file) {
    setSettingsStatus("Selecciona un archivo JSON primero.", "warn");
    return;
  }
  const raw = await file.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    setSettingsStatus("JSON inválido.", "error");
    return;
  }
  const result = validateMemoryPayload(parsed);
  if (!result.ok) {
    pendingMemoryImport = null;
    els.settingsImportPreview.textContent = result.error;
    setSettingsStatus("Import validation failed", "error");
    return;
  }
  pendingMemoryImport = parsed;
  els.settingsImportPreview.textContent = `Archivo válido. Señales: ${result.summary.signals} · Sesiones: ${result.summary.sessions} · Versions: ${result.summary.patternVersions}`;
  setSettingsStatus("Archivo validado correctamente.", "ok");
}

async function handleImportMemory() {
  if (!pendingMemoryImport) {
    setSettingsStatus("Primero valida un archivo de memoria.", "warn");
    return;
  }
  if (!window.confirm("Vas a importar memoria completa. Se creará un backup automático antes del reemplazo. ¿Continuar?")) return;
  const mode = els.settingsImportMode?.value || "replace";
  try {
    await importMemory(pendingMemoryImport, mode);
    replaceSignals(loadSignals());
    replaceSessions(loadSessions(normalizeSession));
    patternVersionsRegistry = loadPatternVersionsRegistry();
    activePatternVersionId = loadActivePatternVersionId();
    notes = loadNotes();
    rerender();
    setSettingsStatus("Importación completada con éxito.", "ok");
  } catch (error) {
    setSettingsStatus(`Error al importar: ${error.message}`, "error");
  }
}



function getSessionByLocalHour(hour = new Date().getHours()) {
  if (hour >= 0 && hour < 8) return "ASIA";
  if (hour >= 8 && hour < 13) return "LONDON";
  if (hour >= 13 && hour < 21) return "NY";
  return "OFF";
}

function parseQuickSignal(text) {
  const input = String(text || "").trim();
  const directionMatch = input.match(/\b(CALL|PUT)\b/i);
  if (!directionMatch) return { ok: false, error: "Dirección no detectada" };

  const rsiMatch = input.match(/-?\d+(?:\.\d+)?/);
  if (!rsiMatch) return { ok: false, error: "No se detectó RSI" };

  const rsi = Number(rsiMatch[0]);
  if (!Number.isFinite(rsi) || rsi < 0 || rsi > 100) return { ok: false, error: "RSI fuera de rango" };

  return {
    ok: true,
    direction: directionMatch[1].toUpperCase(),
    rsi,
  };
}

function getActiveAssetAndTimeframe() {
  const latest = state.signals[state.signals.length - 1] || null;
  return {
    asset: els.filterAsset?.value || latest?.asset || "EURUSD",
    timeframe: els.filterTimeframe?.value || latest?.timeframe || "5m",
  };
}

function buildSignalFromQuickInput(parsed) {
  const { asset, timeframe } = getActiveAssetAndTimeframe();
  const srContext = buildSrContextFromQuickAdd({
    nearSupport: Boolean(els.quickAddNearSupport?.checked),
    nearResistance: Boolean(els.quickAddNearResistance?.checked),
    srComment: els.quickAddSrComment?.value || "",
  });
  const candleData = normalizeCandleData({
    open: normalizeOHLCInput(els.quickAddOpen?.value),
    high: normalizeOHLCInput(els.quickAddHigh?.value),
    low: normalizeOHLCInput(els.quickAddLow?.value),
    close: normalizeOHLCInput(els.quickAddClose?.value),
    source: "manual",
  });
  const excursion = normalizeExcursion({
    mfe: normalizeOHLCInput(els.quickAddMfe?.value),
    mae: normalizeOHLCInput(els.quickAddMae?.value),
    unit: els.quickAddExcursionUnit?.value || null,
    source: "manual",
  });
  const activeSession = getActiveSession();
  const attachToSession = Boolean(els.quickAddAttachSession?.checked && activeSession);
  const linkedIndex = attachToSession
    ? (Number(els.quickAddSessionCandle?.value) || activeSession?.candles?.[activeSession.candles.length - 1]?.index || null)
    : null;
  return {
    asset,
    timeframe,
    patternName: els.quickAddPattern?.value || "RSI EMA Reclaim",
    patternVersion: els.quickAddVersion?.value || "v1",
    direction: parsed.direction,
    timestamp: Date.now(),
    srContext,
    candleData,
    excursion,
    sessionRef: normalizeSessionRef({ sessionId: attachToSession ? activeSession.id : null, candleIndex: linkedIndex }),
    v3Meta: normalizeV3Meta({ enabled: Boolean(els.quickAddV3Toggle?.open), notes: "" }),
    context: {
      rsi: parsed.rsi,
      session: getSessionByLocalHour(),
    },
  };
}

function setQuickAddFeedback(message, isError = false) {
  if (!els.quickAddFeedback) return;
  els.quickAddFeedback.textContent = message;
  els.quickAddFeedback.classList.toggle("error", isError);
}

function importSignalsFromPreview(preview, importedMessage) {
  if (!preview?.ok) return false;
  const selectedRows = els.includeDuplicates.checked ? preview.valid : preview.uniqueValid;
  selectedRows.forEach((row) => {
    const result = ensurePatternVersionExists(patternVersionsRegistry, row.patternName, row.patternVersion);
    patternVersionsRegistry = result.entries;
  });
  replaceSignals([...state.signals, ...selectedRows]);
  syncPatternVersionsWithSignals([...state.signals]);
  try {
    persist();
    saveLastImportReport({
      createdAt: new Date().toISOString(),
      total: preview.total,
      valid: preview.valid.length,
      invalid: preview.invalid.length,
      duplicates: preview.duplicates.length,
      imported: selectedRows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar en almacenamiento local.";
    setQuickAddFeedback(message, true);
    setImportPreview({ ...preview, message, ok: false });
    return false;
  }
  setImportPreview({ ...preview, message: importedMessage || `Importadas ${selectedRows.length} señales.` });
  return true;
}
function handleImport() {
  if (importerMode === "live") {
    handleLiveImport();
    return;
  }
  if (!state.importPreview || !state.importPreview.ok) handleValidate();
  if (!state.importPreview?.ok) return;
  importSignalsFromPreview(state.importPreview);
  rerender();
}

function handleCreatePatternVersion({ patternName, version, notes }) {
  const cleanPatternName = String(patternName || "").trim();
  const cleanVersion = String(version || "").trim();
  if (!cleanPatternName) {
    patternVersionCreateMessage = "Pattern Name es obligatorio.";
    rerender();
    return;
  }
  if (!cleanVersion) {
    patternVersionCreateMessage = "Version no puede estar vacía.";
    rerender();
    return;
  }
  const result = ensurePatternVersionExists(patternVersionsRegistry, cleanPatternName, cleanVersion, notes);
  if (!result.created) {
    patternVersionCreateMessage = "Ya existe esa combinación pattern + version.";
    rerender();
    return;
  }
  patternVersionsRegistry = result.entries;
  persistPatternVersions();
  activePatternVersionId = result.entry.id;
  saveActivePatternVersionId(activePatternVersionId);
  patternVersionCreateMessage = `Versión creada: ${result.entry.displayName}`;
  refreshSharedOptions();
  rerender();
}

function handleEditPatternVersionNotes(versionId) {
  const current = patternVersionsRegistry.find((entry) => entry.id === versionId);
  if (!current) return;
  const nextNotes = window.prompt(`Editar notes para ${current.displayName}`, current.notes || "");
  if (nextNotes === null) return;
  patternVersionsRegistry = updatePatternVersionNotes(patternVersionsRegistry, versionId, nextNotes);
  persistPatternVersions();
  rerender();
}

function handleArchivePatternVersion(versionId, shouldArchive) {
  patternVersionsRegistry = archivePatternVersion(patternVersionsRegistry, versionId, shouldArchive);
  persistPatternVersions();
  if (activePatternVersionId === versionId && shouldArchive) {
    const fallback = patternVersionsRegistry.find((entry) => !entry.isArchived);
    activePatternVersionId = fallback?.id || "";
    saveActivePatternVersionId(activePatternVersionId);
  }
  refreshSharedOptions();
  rerender();
}

function handleActivatePatternVersion(versionId) {
  activePatternVersionId = setActivePatternVersion(patternVersionsRegistry, versionId);
  saveActivePatternVersionId(activePatternVersionId);
  const active = patternVersionsRegistry.find((entry) => entry.id === activePatternVersionId);
  if (active && els.quickAddPattern && els.quickAddVersion) {
    els.quickAddPattern.value = active.patternName;
    refreshQuickAddVersionOptions();
  refreshLivePatternSelector();
    els.quickAddVersion.value = active.version;
  }
  rerender();
}

function handleQuickAdd() {
  if (!els.quickAddPattern?.value || !els.quickAddVersion?.value) {
    setQuickAddFeedback("Selecciona pattern y versión antes de guardar.", true);
    return;
  }

  const parsed = parseQuickSignal(els.quickAddInput?.value);
  if (!parsed.ok) {
    setQuickAddFeedback(parsed.error, true);
    return;
  }

  const rawSignal = buildSignalFromQuickInput(parsed);
  const ohlcCheck = validateOHLCConsistency(rawSignal.candleData);
  if (!ohlcCheck.valid) {
    setQuickAddFeedback(ohlcCheck.message, true);
    return;
  }
  const preview = buildImportPreview(JSON.stringify(rawSignal), state.signals);
  if (!preview.ok || !preview.uniqueValid.length) {
    const firstError = preview.invalid?.[0]?.errors?.[0] || preview.message || "No se pudo guardar la señal";
    setQuickAddFeedback(firstError, true);
    setImportPreview(preview);
    rerender();
    return;
  }

  importSignalsFromPreview(preview, "Señal guardada");
  els.quickAddInput.value = "";
  if (els.quickAddNearSupport) els.quickAddNearSupport.checked = false;
  if (els.quickAddNearResistance) els.quickAddNearResistance.checked = false;
  if (els.quickAddSrComment) els.quickAddSrComment.value = "";
  [els.quickAddOpen, els.quickAddHigh, els.quickAddLow, els.quickAddClose, els.quickAddMfe, els.quickAddMae, els.quickAddSessionCandle].forEach((el) => { if (el) el.value = ""; });
  if (els.quickAddAttachSession) els.quickAddAttachSession.checked = false;
  setQuickAddFeedback("Señal guardada");
  els.quickAddInput.focus();
  rerender();
}

function openReview(signalId) {
  const signal = state.signals.find((s) => s.id === signalId);
  if (!signal) return;
  state.activeSignalId = signalId;
  const fp = signal.futuresPolicy;
  const fpSummary = fp ? `Futures policy: ${fp.action} (${Math.round((fp.confidence || 0) * 100)}%)\nEntry: ${fp.executionPlan?.entryPrice ?? "-"} | SL: ${fp.executionPlan?.stopLoss ?? "-"} | TP: ${fp.executionPlan?.takeProfit ?? "-"} | RR: ${fp.executionPlan?.riskReward ? fp.executionPlan.riskReward.toFixed(2) : "-"}\nReplay: ${fp.replay?.outcomeType || "pending"} | PnL R: ${Number(fp.replay?.pnlR || 0).toFixed(2)}\nReason: ${fp.reason || "-"}\n\n` : "";
  els.reviewDetails.textContent = `${fpSummary}${JSON.stringify(signal, null, 2)}`;
  els.reviewStatus.value = signal.outcome.status;
  els.reviewComment.value = signal.outcome.comment || "";
  els.reviewExpiryClose.value = signal.outcome.expiryClose ?? "";
  els.reviewLabels.value = signal.reviewMeta?.labels?.join(", ") || "";
  els.reviewExecutionError.checked = Boolean(signal.reviewMeta?.executionError);
  els.reviewLateEntry.checked = Boolean(signal.reviewMeta?.lateEntry);
  const srContext = normalizeSrContext(signal.srContext);
  els.reviewNearSupport.checked = srContext.nearSupport;
  els.reviewNearResistance.checked = srContext.nearResistance;
  els.reviewSrComment.value = srContext.srComment;
  const candleData = normalizeCandleData(signal.candleData);
  els.reviewOpen.value = candleData.open ?? "";
  els.reviewHigh.value = candleData.high ?? "";
  els.reviewLow.value = candleData.low ?? "";
  els.reviewClose.value = candleData.close ?? "";
  const excursion = normalizeExcursion(signal.excursion);
  els.reviewMfe.value = excursion.mfe ?? "";
  els.reviewMae.value = excursion.mae ?? "";
  els.reviewExcursionUnit.value = excursion.unit || "price";
  els.reviewSessionLink.checked = Boolean(signal.sessionRef?.sessionId);
  els.reviewSessionCandle.value = signal.sessionRef?.candleIndex ?? "";
  els.reviewV3Notes.value = signal.v3Meta?.notes || "";
  els.reviewV3Toggle.open = (signal.patternVersion || "").toLowerCase().includes("v3") || Boolean(signal.v3Meta?.enabled);
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
    srContext: {
      nearSupport: els.reviewNearSupport.checked,
      nearResistance: els.reviewNearResistance.checked,
      srComment: els.reviewSrComment.value.trim(),
    },
    candleData: normalizeCandleData({ open: els.reviewOpen.value, high: els.reviewHigh.value, low: els.reviewLow.value, close: els.reviewClose.value, source: "manual" }),
    excursion: normalizeExcursion({ mfe: els.reviewMfe.value, mae: els.reviewMae.value, unit: els.reviewExcursionUnit.value, source: "manual" }),
    sessionRef: normalizeSessionRef({ sessionId: els.reviewSessionLink.checked ? (getActiveSession()?.id || null) : null, candleIndex: els.reviewSessionCandle.value ? Number(els.reviewSessionCandle.value) : null }),
    v3Meta: normalizeV3Meta({ enabled: Boolean(els.reviewV3Toggle.open), notes: els.reviewV3Notes.value.trim() }),
  };
  const check = validateOHLCConsistency(payload.candleData);
  if (!check.valid) { window.alert(check.message); return; }
  replaceSignals(state.signals.map((s) => {
    if (s.id !== state.activeSignalId) return s;
    const reviewed = applyReview(s, payload);
    return { ...reviewed, candleData: payload.candleData, excursion: payload.excursion, sessionRef: payload.sessionRef, v3Meta: payload.v3Meta };
  }));
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
  replaceSignals(state.signals.map((s) => (s.id === signalId ? applyReview(s, { status, comment: s.outcome.comment || "", expiryClose: s.outcome.expiryClose, labels: s.reviewMeta?.labels || [], executionError: s.reviewMeta?.executionError, lateEntry: s.reviewMeta?.lateEntry, srContext: s.srContext || {} }) : s)));
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
      const rows = Array.isArray(parsed) ? parsed : parsed?.signals;
      const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions.map(normalizeSession) : [];
      if (!Array.isArray(rows)) throw new Error("El dataset debe ser un array de señales o un objeto con signals.");
      replaceSignals(rows.map(migrateStoredSignal));
      if (sessions.length) replaceSessions(sessions);
      syncPatternVersionsWithSignals(state.signals);
      persist();
      setImportPreview({ ok: true, message: `Dataset cargado: ${rows.length} señales`, total: rows.length, valid: rows, uniqueValid: rows, duplicates: [], invalid: [], missingCritical: [], assets: [], patterns: [] });
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
  els.importerMode?.addEventListener("change", (event) => {
    importerMode = event.target.value === "live" ? "live" : "research";
    applyImporterMode();
    setImportPreview(null);
    rerender();
  });
  els.liveValidateBtn?.addEventListener("click", handleLiveValidate);
  els.liveImportBtn?.addEventListener("click", handleLiveImport);
  els.liveSaveBtn?.addEventListener("click", handleLiveSave);
  els.liveClearBtn?.addEventListener("click", () => { els.jsonInput.value = ""; clearLiveForm(); setImportPreview(null); rerender(); });
  els.livePatternSelector?.addEventListener("change", () => {
    const selected = promotedPatterns.find((row) => (row.sourceCandidateId || row.id) === els.livePatternSelector.value);
    if (!selected) return;
    if (els.livePatternId) els.livePatternId.value = selected.sourceCandidateId || selected.id || "";
    if (els.livePatternName) els.livePatternName.value = selected.sourceCandidateId || selected.id || "";
    if (els.liveDirection) els.liveDirection.value = selected.direction || "CALL";
    if (els.liveExpiryBars && selected.expiry) els.liveExpiryBars.value = selected.expiry;
  });
  els.quickAddPattern?.addEventListener("change", refreshQuickAddVersionOptions);
  els.quickAddVersion?.addEventListener("change", refreshSharedOptions);
  els.quickAddBtn?.addEventListener("click", handleQuickAdd);
  els.quickAddInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleQuickAdd();
    }
  });
  els.importBtn.addEventListener("click", handleImport);
  els.clearBtn.addEventListener("click", () => { els.jsonInput.value = ""; setImportPreview(null); rerender(); });
  els.loadDemoBtn.addEventListener("click", loadDemoJson);
  els.search.addEventListener("input", (e) => { setFilter("search", e.target.value); refreshFeed(); });
  els.filterAsset.addEventListener("change", (e) => { setFilter("asset", e.target.value); refreshFeed(); });
  els.filterDirection.addEventListener("change", (e) => { setFilter("direction", e.target.value); refreshFeed(); });
  els.filterPattern.addEventListener("change", (e) => { setFilter("patternName", e.target.value); refreshFeed(); });
  els.filterStatus.addEventListener("change", (e) => { setFilter("status", e.target.value); refreshFeed(); });
  els.filterTimeframe.addEventListener("change", (e) => { setFilter("timeframe", e.target.value); refreshFeed(); });
  els.filterNearSupport.addEventListener("change", (e) => { setFilter("nearSupport", e.target.value); refreshFeed(); });
  els.filterNearResistance.addEventListener("change", (e) => { setFilter("nearResistance", e.target.value); refreshFeed(); });
  els.filterHasOHLC?.addEventListener("change", (e) => { setFilter("hasOHLC", e.target.value); refreshFeed(); });
  els.filterHasExcursion?.addEventListener("change", (e) => { setFilter("hasExcursion", e.target.value); refreshFeed(); });
  els.filterHasSession?.addEventListener("change", (e) => { setFilter("hasSession", e.target.value); refreshFeed(); });
  els.filterMfeMin?.addEventListener("input", (e) => { setFilter("mfeMin", e.target.value); refreshFeed(); });
  els.filterMaeMax?.addEventListener("input", (e) => { setFilter("maeMax", e.target.value); refreshFeed(); });
  els.saveReviewBtn.addEventListener("click", saveReviewChanges);
  els.reviewNextBtn.addEventListener("click", () => moveReview(1));
  els.reviewPrevBtn.addEventListener("click", () => moveReview(-1));
  els.exportBtn.addEventListener("click", () => exportDataset({ signals: state.signals, sessions: state.sessions }));
  els.datasetFile.addEventListener("change", (e) => handleDatasetImport(e.target.files[0]));
  els.settingsExportMemoryBtn?.addEventListener("click", handleExportMemory);
  els.settingsValidateMemoryBtn?.addEventListener("click", handleValidateMemoryFile);
  els.settingsImportMemoryBtn?.addEventListener("click", handleImportMemory);
  els.settingsBackupNowBtn?.addEventListener("click", async () => {
    await createBackupNow();
    refreshStorageStatusUI();
    setSettingsStatus("Backup creado.", "ok");
  });
  els.settingsDownloadBackupBtn?.addEventListener("click", () => {
    try {
      downloadBackup();
      setSettingsStatus("Backup descargado.", "ok");
    } catch (error) {
      setSettingsStatus(error.message, "warn");
    }
  });
  els.settingsRestoreBackupBtn?.addEventListener("click", async () => {
    if (!window.confirm("¿Restaurar último backup? Esta acción reemplaza la memoria actual.")) return;
    try {
      await restoreBackup();
      replaceSignals(loadSignals());
      replaceSessions(loadSessions(normalizeSession));
      patternVersionsRegistry = loadPatternVersionsRegistry();
      activePatternVersionId = loadActivePatternVersionId();
      notes = loadNotes();
      rerender();
      setSettingsStatus("Backup restaurado.", "ok");
    } catch (error) {
      setSettingsStatus(error.message, "error");
    }
  });
  els.settingsClearLegacyBtn?.addEventListener("click", async () => {
    if (!window.confirm("Esto limpiará localStorage legado. Solo continuar si la migración ya está validada. ¿Confirmar?")) return;
    try {
      await clearLegacyStorage();
      setSettingsStatus("localStorage legado limpiado.", "ok");
    } catch (error) {
      setSettingsStatus(error.message, "error");
    }
  });

  [els.comparePatterns, els.compareAsset, els.compareDirection, els.compareTimeframe, els.compareRangeMode, els.compareRangeValue, els.compareNearSupport, els.compareNearResistance].forEach((el) => {
    el.addEventListener("input", () => {
      compareFilters.asset = els.compareAsset.value;
      compareFilters.direction = els.compareDirection.value;
      compareFilters.timeframe = els.compareTimeframe.value;
      compareFilters.rangeMode = els.compareRangeMode.value;
      compareFilters.rangeValue = Number(els.compareRangeValue.value) || 0;
      compareFilters.nearSupport = els.compareNearSupport.value;
      compareFilters.nearResistance = els.compareNearResistance.value;
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

  els.quickAddAutoExcursion?.addEventListener("click", () => {
    const draft = {
      direction: parseQuickSignal(els.quickAddInput?.value).direction || "CALL",
      entryPrice: normalizeOHLCInput(els.quickAddOpen.value),
      candleData: normalizeCandleData({ open: els.quickAddOpen.value, high: els.quickAddHigh.value, low: els.quickAddLow.value, close: els.quickAddClose.value }),
      excursion: { unit: els.quickAddExcursionUnit.value || "price" },
    };
    const result = computeExcursionFromSignal(draft, { unit: els.quickAddExcursionUnit.value || "price" });
    els.quickAddMfe.value = result.mfe ?? "";
    els.quickAddMae.value = result.mae ?? "";
  });

  els.reviewAutoExcursion?.addEventListener("click", () => {
    const signal = state.signals.find((s) => s.id === state.activeSignalId);
    if (!signal) return;
    const result = computeExcursionFromSignal({ ...signal, entryPrice: signal.entryPrice ?? normalizeOHLCInput(els.reviewOpen.value), candleData: normalizeCandleData({ open: els.reviewOpen.value, high: els.reviewHigh.value, low: els.reviewLow.value, close: els.reviewClose.value }), excursion: { unit: els.reviewExcursionUnit.value || "price" } }, { unit: els.reviewExcursionUnit.value || "price" });
    els.reviewMfe.value = result.mfe ?? "";
    els.reviewMae.value = result.mae ?? "";
  });

  els.sessionNewBtn?.addEventListener("click", () => {
    const session = normalizeSession({ date: els.sessionDate.value || new Date().toISOString().slice(0,10), asset: els.sessionAsset.value || null, tf: els.sessionTf.value || null, notes: els.sessionNotes.value || "", status: "active" });
    replaceSessions([...state.sessions, session]);
    setActiveSessionId(session.id);
    persist();
    refreshSessionCandlesTab();
  });
  els.sessionCloseBtn?.addEventListener("click", () => {
    const active = getActiveSession();
    if (!active) return;
    replaceSessions(state.sessions.map((s) => s.id === active.id ? normalizeSession({ ...s, status: "closed", endedAt: new Date().toISOString() }) : s));
    persist();
    refreshSessionCandlesTab();
  });
  els.sessionDuplicateOpenBtn?.addEventListener("click", () => {
    const active = getActiveSession();
    const prev = active?.candles?.[active.candles.length - 1];
    if (prev?.close !== null && prev?.close !== undefined) els.sessionCandleOpen.value = prev.close;
  });
  els.sessionClearCandleBtn?.addEventListener("click", () => { [els.sessionCandleTime, els.sessionCandleOpen, els.sessionCandleHigh, els.sessionCandleLow, els.sessionCandleClose].forEach((el) => { if (el) el.value = ""; }); });
  els.sessionAddCandleBtn?.addEventListener("click", () => {
    const active = getActiveSession();
    if (!active || active.status !== "active") return;
    const candle = {
      index: active.candles.length + 1,
      timeLabel: els.sessionCandleTime.value || null,
      timestamp: null,
      open: normalizeOHLCInput(els.sessionCandleOpen.value),
      high: normalizeOHLCInput(els.sessionCandleHigh.value),
      low: normalizeOHLCInput(els.sessionCandleLow.value),
      close: normalizeOHLCInput(els.sessionCandleClose.value),
    };
    const check = validateOHLCConsistency(candle);
    if (!check.valid) { window.alert(check.message); return; }
    candle.colorHint = deriveCandleColor(candle);
    replaceSessions(state.sessions.map((s) => s.id === active.id ? normalizeSession({ ...s, candles: [...s.candles, candle] }) : s));
    persist();
    refreshSessionCandlesTab();
  });

  els.sessionToggleOverlay?.addEventListener("change", () => {
    sessionAnalysisPrefs.showOverlay = Boolean(els.sessionToggleOverlay.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionToggleNarratives?.addEventListener("change", () => {
    sessionAnalysisPrefs.showNarratives = Boolean(els.sessionToggleNarratives.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionToggleNear?.addEventListener("change", () => {
    sessionAnalysisPrefs.showNear = Boolean(els.sessionToggleNear.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionToggleMetrics?.addEventListener("change", () => {
    sessionAnalysisPrefs.showMetrics = Boolean(els.sessionToggleMetrics.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionToggleReplay?.addEventListener("change", () => {
    sessionAnalysisPrefs.replayMode = Boolean(els.sessionToggleReplay.checked);
    if (!sessionAnalysisPrefs.replayMode) stopSessionReplay();
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionPrevBtn?.addEventListener("click", () => {
    const viewed = state.sessions.find((row) => row.id === sessionHistoryId) || getActiveSession();
    if (!viewed?.candles?.length) return;
    const current = selectedSessionCandleIndex || viewed.candles[viewed.candles.length - 1].index;
    const idx = viewed.candles.findIndex((c) => c.index === current);
    const target = viewed.candles[Math.max(0, idx - 1)] || viewed.candles[0];
    selectedSessionCandleIndex = target.index;
    refreshSessionCandlesTab();
  });
  els.sessionNextBtn?.addEventListener("click", () => {
    const viewed = state.sessions.find((row) => row.id === sessionHistoryId) || getActiveSession();
    if (!viewed?.candles?.length) return;
    const current = selectedSessionCandleIndex || viewed.candles[0].index;
    const idx = viewed.candles.findIndex((c) => c.index === current);
    const target = viewed.candles[Math.min(viewed.candles.length - 1, idx + 1)] || viewed.candles[viewed.candles.length - 1];
    selectedSessionCandleIndex = target.index;
    refreshSessionCandlesTab();
  });
  els.sessionPlayBtn?.addEventListener("click", () => {
    const viewed = state.sessions.find((row) => row.id === sessionHistoryId) || getActiveSession();
    if (!viewed?.candles?.length || !sessionAnalysisPrefs.replayMode) return;
    stopSessionReplay();
    let i = Math.max(0, viewed.candles.findIndex((c) => c.index === selectedSessionCandleIndex));
    sessionReplayTimer = window.setInterval(() => {
      if (i >= viewed.candles.length) {
        stopSessionReplay();
        refreshSessionCandlesTab();
        return;
      }
      selectedSessionCandleIndex = viewed.candles[i].index;
      i += 1;
      refreshSessionCandlesTab();
    }, 800);
  });
  els.sessionPauseBtn?.addEventListener("click", () => {
    stopSessionReplay();
    refreshSessionCandlesTab();
  });
}

function setMarketDataStatus(message, kind = "muted") {
  if (!els.mdStatus) return;
  els.mdStatus.className = `quick-add-feedback ${kind}`;
  els.mdStatus.textContent = message || "";
}

function renderMarketDataDiagnostics() {
  if (!els.mdDiagnostics) return;
  if (!marketDataDiagnostics) {
    els.mdDiagnostics.className = "panel-soft muted tiny";
    els.mdDiagnostics.textContent = "Integrity check pendiente.";
    return;
  }

  const healthBadge = marketDataDiagnostics.isHealthy
    ? '<span class="badge health-ok">healthy</span>'
    : '<span class="badge health-warn">warning</span>';

  els.mdDiagnostics.className = "panel-soft tiny";
  els.mdDiagnostics.innerHTML = `
    <div class="market-data-diagnostics">
      <span class="item">Total: <strong>${marketDataDiagnostics.total}</strong></span>
      <span class="item">Duplicates: <strong>${marketDataDiagnostics.duplicates}</strong></span>
      <span class="item">Out-of-order: <strong>${marketDataDiagnostics.outOfOrder}</strong></span>
      <span class="item">Gaps: <strong>${marketDataDiagnostics.gaps.length}</strong></span>
      ${healthBadge}
    </div>
  `;
}

function renderNeuronSummaryPanel() {
  if (!els.mdNeuronSummary) return;
  if (!neuronSummary) {
    els.mdNeuronSummary.className = "panel-soft muted tiny";
    els.mdNeuronSummary.textContent = "Neuron summary pendiente.";
    return;
  }

  const top5 = getTopNeuronTypes(neuronSummary, 5);
  const pineActive = neuronSummary.pineCompatibleCounts?.active || 0;

  els.mdNeuronSummary.className = "panel-soft tiny";
  els.mdNeuronSummary.innerHTML = `
    <div class="neuron-summary-grid">
      <span class="item">Candles: <strong>${neuronSummary.candlesProcessed}</strong></span>
      <span class="item">Neuron types: <strong>${neuronSummary.neuronTypesEvaluated}</strong></span>
      <span class="item">Active events: <strong>${neuronSummary.totalActivations}</strong></span>
      <span class="item">Pine-compatible active: <strong>${pineActive}</strong></span>
    </div>
    <div class="tiny muted">Top neurons: ${top5.map((row) => `${row.neuronId} (${row.count})`).join(" · ") || "-"}</div>
  `;
}

function renderNeuronLatestPreview() {
  if (!els.mdNeuronPreviewBody) return;
  if (!neuronActivations.length || !marketDataCandles.length) {
    els.mdNeuronPreviewBody.innerHTML = `<tr><td colspan="5" class="muted">No neuron activations yet.</td></tr>`;
    return;
  }

  const latestIndex = marketDataCandles.length - 1;
  const latestRows = neuronActivations
    .filter((row) => row.index === latestIndex)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.score - a.score || a.neuronId.localeCompare(b.neuronId));

  els.mdNeuronPreviewBody.innerHTML = latestRows.map((row) => `
    <tr>
      <td>${row.neuronId}</td>
      <td>${row.category}</td>
      <td>${row.active ? '<span class="badge health-ok">yes</span>' : '<span class="badge health-warn">no</span>'}</td>
      <td>${row.score.toFixed(1)}</td>
      <td class="muted tiny">${row.explanation}</td>
    </tr>
  `).join("");
}

function renderNeuronGraphSummary() {
  if (!els.mdGraphSummary) return;
  if (!neuronGraph) {
    els.mdGraphSummary.className = "panel-soft muted tiny";
    els.mdGraphSummary.textContent = "Neuron graph pendiente.";
    return;
  }

  const strongest = getStrongestEdges(neuronGraph, 3);
  const central = getTopConnectedNeurons(neuronGraph, 3);

  els.mdGraphSummary.className = "panel-soft tiny";
  els.mdGraphSummary.innerHTML = `
    <div class="neuron-summary-grid">
      <span class="item">Nodes shown: <strong>${neuronGraph.nodes.length}</strong></span>
      <span class="item">Edges shown: <strong>${neuronGraph.edges.length}</strong></span>
      <span class="item">Strongest: <strong>${strongest.map((e) => `${e.source}↔${e.target} (${e.weight})`).join(" · ") || "-"}</strong></span>
      <span class="item">Central: <strong>${central.map((n) => `${n.id} (${n.totalConnectionWeight})`).join(" · ") || "-"}</strong></span>
    </div>
  `;
}

function renderNeuronGraphDetails() {
  if (!els.mdGraphDetails) return;

  if (!neuronGraph) {
    els.mdGraphDetails.className = "panel-soft muted tiny";
    els.mdGraphDetails.textContent = "Click a node or edge to inspect details.";
    return;
  }

  if (selectedGraphNodeId) {
    const node = neuronGraph.nodes.find((row) => row.id === selectedGraphNodeId);
    if (!node) {
      selectedGraphNodeId = "";
    } else {
      const topConnections = getNodeTopConnections(neuronGraph, node.id, 8)
        .map((entry) => `${entry.neuronId} (${entry.weight})`)
        .join(" · ");
      els.mdGraphDetails.className = "panel-soft tiny";
      els.mdGraphDetails.innerHTML = `
        <h4>Neuron: ${node.id}</h4>
        <div class="tiny">Category: <strong>${node.category}</strong></div>
        <div class="tiny">Activation count: <strong>${node.activationCount}</strong></div>
        <div class="tiny">Pine compatible: <strong>${node.pineCompatible ? "yes" : "no"}</strong></div>
        <div class="tiny muted">Top connections: ${topConnections || "-"}</div>
      `;
      return;
    }
  }

  if (selectedGraphEdgeKey) {
    const [source, target] = selectedGraphEdgeKey.split("::");
    const edge = neuronGraph.edges.find((row) => row.source === source && row.target === target);
    if (edge) {
      els.mdGraphDetails.className = "panel-soft tiny";
      els.mdGraphDetails.innerHTML = `
        <h4>Edge Detail</h4>
        <div class="tiny">Source: <strong>${edge.source}</strong></div>
        <div class="tiny">Target: <strong>${edge.target}</strong></div>
        <div class="tiny">Co-activation count: <strong>${edge.weight}</strong></div>
      `;
      return;
    }
  }

  els.mdGraphDetails.className = "panel-soft muted tiny";
  els.mdGraphDetails.textContent = "Click a node or edge to inspect details.";
}

function renderNeuronGraphPanel() {
  renderNeuronGraphSummary();
  renderNeuronGraphDetails();

  if (!els.mdGraphContainer) return;
  if (!neuronGraph) {
    els.mdGraphContainer.innerHTML = '<div class="muted tiny">Build neuron graph to visualize co-activations.</div>';
    return;
  }

  renderNeuronGraph(els.mdGraphContainer, neuronGraph, {
    onNodeClick: (node) => {
      selectedGraphNodeId = node.id;
      selectedGraphEdgeKey = "";
      renderNeuronGraphDetails();
    },
    onEdgeClick: (edge) => {
      selectedGraphNodeId = "";
      selectedGraphEdgeKey = `${edge.source}::${edge.target}`;
      renderNeuronGraphDetails();
    },
  });
}

function handleBuildNeuronGraph() {
  if (!marketDataCandles.length) {
    setMarketDataStatus("Load or import candles before building graph.", "warning");
    return;
  }

  if (!neuronActivations.length) {
    handleComputeNeurons();
  }
  if (!neuronActivations.length) {
    setMarketDataStatus("Neuron activations unavailable.", "error");
    return;
  }

  const neuronMatrix = marketDataCandles.map((candle, index) => ({
    index,
    timestamp: candle?.timestamp || null,
    neurons: {},
  }));

  neuronActivations.forEach((activation) => {
    if (!activation?.active) return;
    const row = neuronMatrix[activation.index];
    if (!row) return;
    row.neurons[activation.neuronId] = {
      active: true,
      category: activation.category,
      pineCompatible: activation.pineCompatible,
    };
  });

  neuronGraph = buildNeuronCoactivationGraph(neuronMatrix, {
    minNodeActivations: 3,
    minEdgeWeight: 2,
    maxNodes: 40,
    maxEdges: 140,
  });
  selectedGraphNodeId = "";
  selectedGraphEdgeKey = "";
  renderNeuronGraphPanel();
  setMarketDataStatus(`Neuron graph built: ${neuronGraph.nodes.length} nodes / ${neuronGraph.edges.length} edges.`, "success");
}



function renderPatternDiscoveryPanel() {
  if (!els.mdPatternSummary || !els.mdPatternBody || !els.mdPatternDetails) return;
  if (!patternDiscoveryResult) {
    els.mdPatternSummary.className = "panel-soft muted tiny";
    els.mdPatternSummary.textContent = "Pattern discovery pendiente.";
    els.mdPatternBody.innerHTML = `<tr><td colspan="10" class="muted">No candidate patterns yet.</td></tr>`;
    els.mdPatternDetails.className = "panel-soft muted tiny";
    els.mdPatternDetails.textContent = "Selecciona un candidato para ver explicación y ejemplos.";
    return;
  }

  const summary = patternDiscoveryResult.summary || {};
  els.mdPatternSummary.className = "panel-soft tiny";
  els.mdPatternSummary.innerHTML = `
    <div class="neuron-summary-grid">
      <span class="item">Candles scanned: <strong>${summary.candlesScanned || 0}</strong></span>
      <span class="item">Occurrences: <strong>${summary.occurrencesBuilt || 0}</strong></span>
      <span class="item">Candidate groups: <strong>${summary.candidateGroups || 0}</strong></span>
      <span class="item">Ranked: <strong>${summary.candidatesRanked || 0}</strong></span>
    </div>
  `;

  const candidates = patternDiscoveryResult.candidates || [];
  if (!candidates.length) {
    els.mdPatternBody.innerHTML = `<tr><td colspan="10" class="muted">No strong candidates with current filters.</td></tr>`;
    els.mdPatternDetails.className = "panel-soft muted tiny";
    els.mdPatternDetails.textContent = "Prueba con más velas o ajusta minSamples.";
    return;
  }

  if (!selectedPatternCandidateId || !candidates.some((row) => row.patternId === selectedPatternCandidateId)) {
    selectedPatternCandidateId = candidates[0].patternId;
  }

  const topRows = candidates.slice(0, 20);
  els.mdPatternBody.innerHTML = topRows.map((row, i) => `
    <tr class="${row.patternId === selectedPatternCandidateId ? "session-row-selected" : ""}" data-pattern-id="${row.patternId}">
      <td>${i + 1}</td>
      <td>${row.direction}</td>
      <td>${row.neurons.join(" + ")}</td>
      <td>${row.context.session || "-"}${row.context.localPush ? ` · ${row.context.localPush}` : ""}</td>
      <td>${row.sampleCount}</td>
      <td>${(row.winRate * 100).toFixed(1)}%</td>
      <td>${(row.avgFavorableMovePct * 100).toFixed(2)}%</td>
      <td>${(row.avgAdverseMovePct * 100).toFixed(2)}%</td>
      <td>${row.score.toFixed(3)}</td>
      <td>${row.pineCompatible ? "yes" : "no"}</td>
    </tr>
  `).join("");

  els.mdPatternBody.querySelectorAll("tr[data-pattern-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      selectedPatternCandidateId = tr.getAttribute("data-pattern-id") || "";
      renderPatternDiscoveryPanel();
    });
  });

  const selected = candidates.find((row) => row.patternId === selectedPatternCandidateId) || candidates[0];
  const exampleList = (selected.examples || []).map((ex) => {
    const ts = ex.timestamp ? new Date(ex.timestamp).toLocaleString() : "-";
    return `<li>${ts} · idx ${ex.index} · ${ex.outcomeLabel} · fav ${(ex.maxFavorableMovePct * 100).toFixed(2)}% / adv ${(ex.maxAdverseMovePct * 100).toFixed(2)}%</li>`;
  }).join("");

  els.mdPatternDetails.className = "panel-soft tiny";
  els.mdPatternDetails.innerHTML = `
    <strong>${selected.patternId}</strong>
    <p class="muted">${selected.explanation}</p>
    <div class="tiny">Neurons: ${selected.neurons.join(" + ")}</div>
    <div class="tiny">Context: ${Object.entries(selected.context).map(([k,v]) => `${k}=${v}`).join(", ") || "-"}</div>
    <ul class="tiny">${exampleList || "<li>No examples</li>"}</ul>
  `;
}


function formatOutcomeLabel(label) {
  const value = String(label || "").toUpperCase();
  if (value === "WIN" || value === "LOSS") return value;
  return "LOSS";
}

function renderPatternReviewInspector(candidate) {
  if (!els.prInspect) return;
  if (!candidate) {
    els.prInspect.className = "panel-soft muted tiny";
    els.prInspect.textContent = "Click Inspect on a candidate to review pattern details and examples.";
    return;
  }

  const decision = patternReviewDecisions[candidate.patternId] || "pending";
  const direction = candidate.binaryDirection || candidate.direction || "-";
  const expiry = candidate.preferredExpiryCandles ? `${candidate.preferredExpiryCandles}c` : "-";
  const examples = (candidate.examples || []).slice(0, 10).map((ex) => {
    const ts = ex.timestamp ? new Date(ex.timestamp).toLocaleString() : "-";
    const favorable = ((Number(ex.favorableMovePct) || 0) * 100).toFixed(2);
    const adverse = ((Number(ex.adverseMovePct) || 0) * 100).toFixed(2);
    return `
      <tr>
        <td>${ts}</td>
        <td>${ex.index ?? "-"}</td>
        <td>${formatOutcomeLabel(ex.outcomeLabel)}</td>
        <td>${favorable}%</td>
        <td>${adverse}%</td>
      </tr>
    `;
  }).join("");

  els.prInspect.className = "panel-soft tiny";
  els.prInspect.innerHTML = `
    <div class="note-head"><strong>Pattern Inspector · ${candidate.patternId}</strong><span class="badge">${decision}</span></div>
    <div class="pr-inspector-grid">
      <p><strong>patternId:</strong> ${candidate.patternId}</p>
      <p><strong>direction:</strong> ${direction}</p>
      <p><strong>expiry:</strong> ${expiry}</p>
      <p><strong>sample count:</strong> ${candidate.sampleCount ?? 0}</p>
      <p><strong>consistency:</strong> ${((candidate.consistencyScore || 0) * 100).toFixed(1)}%</p>
      <p><strong>score:</strong> ${Number(candidate.score || 0).toFixed(3)}</p>
    </div>
    <p><strong>neuron list:</strong> ${(candidate.neurons || []).join(", ") || "-"}</p>
    <div class="table-wrap pr-inspector-table-wrap">
      <table class="pr-inspector-table">
        <thead>
          <tr><th>Timestamp</th><th>Candle Index</th><th>Outcome</th><th>Favorable Move</th><th>Adverse Move</th></tr>
        </thead>
        <tbody>${examples || '<tr><td colspan="5" class="muted">No examples available.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="button-row compact">
      <button type="button" class="primary" data-pr-action="promoted">Promote</button>
      <button type="button" class="ghost" data-pr-action="rejected">Reject</button>
      <button type="button" class="ghost" data-pr-action="ignored">Ignore</button>
    </div>
  `;

  els.prInspect.querySelectorAll("button[data-pr-action]").forEach((btn) => {
    btn.addEventListener("click", () => applyPatternReviewDecision(btn.getAttribute("data-pr-action") || ""));
  });
}

function renderPatternReviewPanel() {
  if (!els.prSummary || !els.prTableBody || !els.prInspect || !els.prPromotedSummary) return;

  const candidates = patternDiscoveryResult?.candidates || [];
  const summary = summarizeReviewState(candidates, patternReviewDecisions, promotedPatterns);
  els.prSummary.className = "panel-soft tiny";
  els.prSummary.innerHTML = `
    <div class="neuron-summary-grid">
      <span class="item">Candidates: <strong>${summary.candidates}</strong></span>
      <span class="item">Promoted: <strong>${summary.promoted}</strong></span>
      <span class="item">Rejected: <strong>${summary.rejected}</strong></span>
      <span class="item">Ignored: <strong>${summary.ignored}</strong></span>
    </div>
  `;

  if (!candidates.length) {
    els.prTableBody.innerHTML = '<tr><td colspan="9" class="muted">No candidate patterns yet. Run Discover Patterns first.</td></tr>';
    renderPatternReviewInspector(null);
    els.prPromotedSummary.className = "panel-soft muted tiny";
    els.prPromotedSummary.textContent = "Sin patrones promovidos.";
    return;
  }

  els.prTableBody.innerHTML = candidates.slice(0, 50).map((row, index) => {
    const decision = patternReviewDecisions[row.patternId] || "pending";
    const expiry = row.preferredExpiryCandles ? `${row.preferredExpiryCandles}c` : "-";
    return `
      <tr class="${row.patternId === selectedReviewCandidateId ? "session-row-selected" : ""}" data-review-candidate-id="${row.patternId}">
        <td>${index + 1}</td>
        <td>${row.binaryDirection || row.direction || "-"}</td>
        <td>${expiry}</td>
        <td>${row.neurons.join(" + ")}</td>
        <td>${row.sampleCount}</td>
        <td>${(row.consistencyScore * 100).toFixed(1)}%</td>
        <td>${row.score.toFixed(3)}</td>
        <td><span class="badge">${decision}</span></td>
        <td><button type="button" class="ghost pr-inspect-btn" data-pr-inspect-id="${row.patternId}">Inspect</button></td>
      </tr>
    `;
  }).join("");

  els.prTableBody.querySelectorAll("tr[data-review-candidate-id]").forEach((tr) => {
    tr.addEventListener("click", (event) => {
      if (event.target?.closest("button[data-pr-inspect-id]")) return;
      selectedReviewCandidateId = tr.getAttribute("data-review-candidate-id") || "";
      renderPatternReviewPanel();
    });
  });

  els.prTableBody.querySelectorAll("button[data-pr-inspect-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedReviewCandidateId = btn.getAttribute("data-pr-inspect-id") || "";
      renderPatternReviewPanel();
    });
  });

  const selected = candidates.find((row) => row.patternId === selectedReviewCandidateId) || null;
  renderPatternReviewInspector(selected);

  els.prPromotedSummary.className = "panel-soft tiny";
  const promotedRows = promotedPatterns.slice(0, 8).map((row) => `<li>${row.id} · ${row.direction} · expiry ${row.expiry || "-"}c · ${row.neurons.join(" + ")} · W/L ${row.liveStats.wins}/${row.liveStats.losses}</li>`).join("");
  els.prPromotedSummary.innerHTML = promotedPatterns.length
    ? `<strong>Promoted pattern store (${promotedPatterns.length})</strong><ul class="tiny">${promotedRows}</ul>`
    : "Sin patrones promovidos.";
}

function rebuildClusterMap() {
  const candidates = patternDiscoveryResult?.candidates || [];
  const bounds = getWeightBounds(candidates);

  if (els.clusterMinEdge) {
    els.clusterMinEdge.max = String(Math.max(1, bounds.maxEdgeWeight));
    clusterMapFilters.minEdgeWeight = Math.min(clusterMapFilters.minEdgeWeight, Number(els.clusterMinEdge.max) || 1);
    syncRangeInput(els.clusterMinEdge, els.clusterMinEdgeValue, clusterMapFilters.minEdgeWeight);
  }
  if (els.clusterMinNode) {
    els.clusterMinNode.max = String(Math.max(1, bounds.maxNodeWeight));
    clusterMapFilters.minNodeWeight = Math.min(clusterMapFilters.minNodeWeight, Number(els.clusterMinNode.max) || 1);
    syncRangeInput(els.clusterMinNode, els.clusterMinNodeValue, clusterMapFilters.minNodeWeight);
  }

  clusterGraph = buildClusterGraph(candidates, clusterMapFilters);
  if (!clusterGraph.nodes.some((node) => node.id === selectedClusterNodeId)) selectedClusterNodeId = "";

  renderClusterSummary(els.clusterMapSummary, clusterGraph);
  renderClusterInspector(els.clusterMapInspector, clusterGraph, selectedClusterNodeId, candidates, {
    onSendToSeededLab: (neurons) => {
      selectedSeededNeurons = [...new Set([...(selectedSeededNeurons || []), ...(neurons || [])])].slice(0, 4);
      if (els.seededStatus) {
        els.seededStatus.className = "quick-add-feedback success";
        els.seededStatus.textContent = `Sent ${selectedSeededNeurons.length} neuron(s) to Seeded Lab.`;
      }
      renderSeededPatternLab();
    },
  });
  renderClusterMap(els.clusterMapContainer, clusterGraph, {
    onNodeClick: (node) => {
      selectedClusterNodeId = node.id;
      renderClusterInspector(els.clusterMapInspector, clusterGraph, selectedClusterNodeId, candidates, {
    onSendToSeededLab: (neurons) => {
      selectedSeededNeurons = [...new Set([...(selectedSeededNeurons || []), ...(neurons || [])])].slice(0, 4);
      if (els.seededStatus) {
        els.seededStatus.className = "quick-add-feedback success";
        els.seededStatus.textContent = `Sent ${selectedSeededNeurons.length} neuron(s) to Seeded Lab.`;
      }
      renderSeededPatternLab();
    },
  });
    },
  });
}

function refreshClusterMapPanel() {
  if (!patternDiscoveryResult?.candidates?.length) {
    clusterGraph = null;
    selectedClusterNodeId = "";
    renderClusterSummary(els.clusterMapSummary, null);
    renderClusterInspector(els.clusterMapInspector, null, "", []);
    if (els.clusterMapContainer) {
      els.clusterMapContainer.innerHTML = '<div class="muted tiny">Run Discover Patterns to build neuron clusters.</div>';
    }
    return;
  }

  rebuildClusterMap();
}


function getSeededExpiriesFromUI() {
  const selected = [];
  if (els.seededExpiry1?.checked) selected.push(1);
  if (els.seededExpiry2?.checked) selected.push(2);
  if (els.seededExpiry3?.checked) selected.push(3);
  if (els.seededExpiry5?.checked) selected.push(5);
  return selected.length ? selected : [1, 2, 3, 5];
}

function refreshSeededNeuronPicker() {
  if (!els.seededNeuronSelect) return;
  const previous = new Set(selectedSeededNeurons);
  const ids = NEURON_DEFINITIONS.map((row) => row.id).sort((a, b) => a.localeCompare(b));
  els.seededNeuronSelect.innerHTML = ids.map((id) => `<option value="${id}" ${previous.has(id) ? "selected" : ""}>${id}</option>`).join("");
}

function renderSeededExamples(examples, expiries) {
  if (!els.seededExamplesBody) return;
  if (!examples?.length) {
    els.seededExamplesBody.innerHTML = '<tr><td colspan="7" class="muted">No examples yet.</td></tr>';
    return;
  }
  els.seededExamplesBody.innerHTML = examples.map((ex) => {
    const ts = ex.timestamp ? new Date(ex.timestamp).toLocaleString() : "-";
    const outcomeText = expiries.map((expiry) => `${expiry}c:${(ex.outcomes?.[`${expiry}c`]?.outcome || "-").toUpperCase()}`).join(" · ");
    return `<tr><td>${ts}</td><td>${ex.index}</td><td>${ex.direction}</td><td>${ex.session}</td><td>${outcomeText}</td><td>${(ex.favorableMove * 100).toFixed(2)}%</td><td>${(ex.adverseMove * 100).toFixed(2)}%</td></tr>`;
  }).join("");
}

function renderSeededPatternLab() {
  refreshSeededNeuronPicker();
  if (els.seededSelected) {
    els.seededSelected.textContent = selectedSeededNeurons.length ? selectedSeededNeurons.join(" + ") : "No neurons selected";
  }

  if (!els.seededSummary || !els.seededTableBody || !els.seededInspector) return;

  if (!seededPatternResult || seededPatternResult.status !== "ok") {
    els.seededSummary.className = "panel-soft muted tiny";
    els.seededSummary.textContent = "Select 2-4 neurons and run evaluation.";
    els.seededTableBody.innerHTML = '<tr><td colspan="9" class="muted">No seeded result yet.</td></tr>';
    els.seededInspector.className = "panel-soft muted tiny";
    els.seededInspector.textContent = "Inspector will show first 10 occurrences once evaluated.";
    renderSeededExamples([], []);
    return;
  }

  els.seededSummary.className = "panel-soft tiny";
  els.seededSummary.innerHTML = `
    <div class="neuron-summary-grid">
      <span class="item">Combo: <strong>${seededPatternResult.selectedNeurons.join(" + ")}</strong></span>
      <span class="item">Direction: <strong>${seededPatternResult.directionMode}</strong></span>
      <span class="item">Session: <strong>${seededPatternResult.sessionFilter}</strong></span>
      <span class="item">Triggers: <strong>${seededPatternResult.sampleCount}</strong></span>
    </div>
  `;

  els.seededTableBody.innerHTML = seededPatternResult.summaryByExpiry.map((row) => `
    <tr>
      <td>${row.expiry}c</td>
      <td>${row.sampleCount}</td>
      <td>${row.wins}</td>
      <td>${row.losses}</td>
      <td>${(row.winRate * 100).toFixed(1)}%</td>
      <td>${(row.avgFavorableMove * 100).toFixed(3)}%</td>
      <td>${(row.avgAdverseMove * 100).toFixed(3)}%</td>
      <td>${(row.consistency * 100).toFixed(1)}%</td>
      <td>${Object.entries(row.sessionBreakdown || {}).map(([k, v]) => `${k}:${v.wins}/${v.sampleCount}`).join(" · ") || "-"}</td>
    </tr>
  `).join("");

  els.seededInspector.className = "panel-soft tiny";
  els.seededInspector.innerHTML = `
    <strong>Inspector</strong>
    <div class="tiny">Showing first ${Math.min(10, seededPatternResult.examples.length)} examples. Binary outcome by expiry and directional move stats.</div>
  `;
  renderSeededExamples(seededPatternResult.examples, seededPatternResult.expiries);
}

function handleRunSeededLab() {
  const fromPicker = Array.from(els.seededNeuronSelect?.selectedOptions || []).map((option) => option.value);
  selectedSeededNeurons = [...new Set([...(selectedSeededNeurons || []), ...fromPicker])].slice(0, 4);
  if (selectedSeededNeurons.length > 4) selectedSeededNeurons = selectedSeededNeurons.slice(0, 4);

  const result = evaluateSeededPattern(marketDataCandles, neuronActivations, {
    selectedNeurons: selectedSeededNeurons,
    directionMode: els.seededDirectionMode?.value || "auto",
    expiries: getSeededExpiriesFromUI(),
    sessionFilter: els.seededSessionFilter?.value || "all",
  });

  seededPatternResult = result;
  if (els.seededStatus) {
    els.seededStatus.className = `quick-add-feedback ${result.status === "ok" ? "success" : "warning"}`;
    els.seededStatus.textContent = result.status === "ok"
      ? `Seeded evaluation complete. ${result.sampleCount} triggers found.`
      : (result.reason || "Seeded evaluation failed.");
  }
  if (result.status === "ok") {
    const stamped = { id: `seeded_result_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), config: {
      selectedNeurons: result.selectedNeurons,
      directionMode: result.directionMode,
      sessionFilter: result.sessionFilter,
      expiries: result.expiries,
    }, result };
    seededPatternResults = [stamped, ...seededPatternResults].slice(0, 100);
    saveSeededPatternResults(seededPatternResults);
  }
  renderSeededPatternLab();
}

function handleSaveSeededCandidate() {
  if (!seededPatternResult || seededPatternResult.status !== "ok") return;
  const candidate = buildSeededCandidatePayload(seededPatternResult, { source: "manual-save" });
  if (!candidate) return;
  seededPatterns = [candidate, ...seededPatterns.filter((row) => row.patternId !== candidate.patternId)].slice(0, 200);
  saveSeededPatterns(seededPatterns);
  if (els.seededStatus) {
    els.seededStatus.className = "quick-add-feedback success";
    els.seededStatus.textContent = `Saved seeded candidate ${candidate.patternId}.`;
  }
}

function handlePromoteSeededCandidate() {
  if (!seededPatternResult || seededPatternResult.status !== "ok") return;
  const candidate = buildSeededCandidatePayload(seededPatternResult, { source: "promote-review" });
  if (!candidate) return;
  promotedPatterns = upsertPromotedPattern(promotedPatterns, candidate, "promoted").map((row) => normalizePromotedPattern(row));
  persistPromotedPatterns();
  if (els.seededStatus) {
    els.seededStatus.className = "quick-add-feedback success";
    els.seededStatus.textContent = `Promoted seeded combo to review queue as ${candidate.patternId}.`;
  }
  renderPatternReviewPanel();
  renderSeededPatternLab();
}

function handleExportSeededDefinition() {
  if (!seededPatternResult || seededPatternResult.status !== "ok") return;
  const payload = {
    kind: "seededPatternDefinition",
    exportedAt: new Date().toISOString(),
    combo: seededPatternResult.selectedNeurons,
    directionMode: seededPatternResult.directionMode,
    sessionFilter: seededPatternResult.sessionFilter,
    expiries: seededPatternResult.expiries,
    summaryByExpiry: seededPatternResult.summaryByExpiry,
  };
  exportDataset(payload);
  if (els.seededStatus) {
    els.seededStatus.className = "quick-add-feedback success";
    els.seededStatus.textContent = "Seeded combo definition exported.";
  }
}

function applyPatternReviewDecision(decision) {
  const normalizedDecision = ["promoted", "rejected", "ignored"].includes(decision) ? decision : "";
  if (!normalizedDecision) return;

  const candidates = patternDiscoveryResult?.candidates || [];
  const selected = candidates.find((row) => row.patternId === selectedReviewCandidateId);
  if (!selected) return;

  if (normalizedDecision === "promoted") {
    promotedPatterns = upsertPromotedPattern(promotedPatterns, selected, "promoted").map((row) => normalizePromotedPattern(row));
    persistPromotedPatterns();
  }
  patternReviewDecisions = { ...patternReviewDecisions, [selected.patternId]: normalizedDecision };
  renderPatternReviewPanel();
  renderSeededPatternLab();
}

async function handleDiscoverPatterns() {
  if (!marketDataCandles.length) {
    setMarketDataStatus("Load or import candles before discovering patterns.", "warning");
    return;
  }
  if (!neuronActivations.length) {
    handleComputeNeurons();
  }

  if (!neuronActivations.length) {
    setMarketDataStatus("Neuron activations unavailable.", "error");
    return;
  }

  const startedAt = performance.now();
  patternDiscoveryResult = discoverCandidatePatterns(marketDataCandles, neuronActivations, {
    minSamples: 5,
    maxCombinationSize: 4,
    lookaheadCandles: 6,
    maxExamplesPerCandidate: 10,
  });
  const elapsed = performance.now() - startedAt;
  renderPatternDiscoveryPanel();
  renderPatternReviewPanel();
  refreshClusterMapPanel();
  setMarketDataStatus(`Pattern discovery complete: ${patternDiscoveryResult.summary.candidatesRanked} ranked candidates (${elapsed.toFixed(1)}ms).`, "success");
}


function getSelectedMarketDataSource() {
  return (els.mdSource?.value || marketDataMeta?.source || MARKET_DATA_SOURCES.YAHOO);
}

function getSelectedMarketDataSymbol() {
  return (els.mdAsset?.value || marketDataMeta?.selectedSymbol || "EURUSD=X").trim();
}

function getSelectedMarketDataTimeframe() {
  return (els.mdTimeframe?.value || marketDataMeta?.selectedTimeframe || "5m").trim();
}


function refreshMarketDataTimeframes() {
  if (!els.mdTimeframe) return;
  const source = getSelectedMarketDataSource();
  const isBinance = source === MARKET_DATA_SOURCES.BINANCE_FUTURES;
  const options = isBinance
    ? ["1m", "3m", "5m", "15m", "1h"]
    : ["1m", "2m", "5m", "15m", "30m", "1h", "1d"];
  const selected = marketDataMeta?.selectedTimeframe || getSelectedMarketDataTimeframe();
  els.mdTimeframe.innerHTML = options.map((value) => `<option value="${value}">${value}</option>`).join("");
  els.mdTimeframe.value = options.includes(selected) ? selected : (options.includes("5m") ? "5m" : options[0]);
  marketDataMeta = { ...marketDataMeta, selectedTimeframe: els.mdTimeframe.value };
}

async function refreshMarketDataSymbols() {
  const source = getSelectedMarketDataSource();
  refreshMarketDataTimeframes();
  const symbols = await getAvailableSymbols({ source });
  if (!els.mdAsset) return;
  const current = marketDataMeta?.selectedSymbol || getSelectedMarketDataSymbol();
  els.mdAsset.innerHTML = symbols.map((row) => `<option value="${row.symbol}">${row.symbol}</option>`).join("");
  const next = symbols.some((row) => row.symbol === current) ? current : (symbols[0]?.symbol || current);
  els.mdAsset.value = next;
  marketDataMeta = { ...marketDataMeta, selectedSymbol: next };
}

function renderMarketLiveStatus() {
  if (!els.mdLiveStatus) return;
  const status = getSourceStatus({ source: getSelectedMarketDataSource() });
  const live = marketDataMeta?.liveStatus || {};
  const connected = Boolean(status?.connected || live.connected);
  const reconnectAttempts = Number(status?.reconnectAttempts ?? live.reconnectAttempts ?? 0);
  const lastMessage = status?.lastMessageAt || live.lastMessageAt;
  const lastClose = marketDataMeta?.lastLiveCandleCloseAt;
  els.mdLiveStatus.className = `quick-add-feedback ${connected ? "success" : "muted"}`;
  els.mdLiveStatus.innerHTML = `Live ${connected ? "connected" : "idle/disconnected"} · reconnects ${reconnectAttempts} · last tick ${lastMessage ? new Date(lastMessage).toLocaleTimeString() : "-"} · last close ${lastClose ? new Date(lastClose).toLocaleTimeString() : "-"}`;
}

function persistLiveShadowState() {
  return saveLiveShadowState({
    records: liveShadowMonitor.getRecords(),
    filters: liveShadowFilters,
    latestStats: liveShadowStats,
    context: { source: getSelectedMarketDataSource(), symbol: getSelectedMarketDataSymbol(), timeframe: getSelectedMarketDataTimeframe() },
  });
}

// UI subscription point for live updates from the shadow monitor.
function renderLiveShadowPanel() {
  const allRecords = liveShadowMonitor.getRecords();
  liveShadowTimeline.setRecords(allRecords);
  const symbols = ["all", ...new Set(allRecords.map((row) => row.symbol).filter(Boolean))];
  const timeframes = ["all", ...new Set(allRecords.map((row) => row.timeframe).filter(Boolean))];
  if (els.mdLiveShadowFilterSymbol) {
    els.mdLiveShadowFilterSymbol.innerHTML = symbols.map((value) => `<option value="${value}">${value}</option>`).join("");
    if (!symbols.includes(liveShadowFilters.symbol)) liveShadowFilters.symbol = "all";
    els.mdLiveShadowFilterSymbol.value = liveShadowFilters.symbol;
  }
  if (els.mdLiveShadowFilterTimeframe) {
    els.mdLiveShadowFilterTimeframe.innerHTML = timeframes.map((value) => `<option value="${value}">${value}</option>`).join("");
    if (!timeframes.includes(liveShadowFilters.timeframe)) liveShadowFilters.timeframe = "all";
    els.mdLiveShadowFilterTimeframe.value = liveShadowFilters.timeframe;
  }
  if (els.mdLiveShadowFilterAction) els.mdLiveShadowFilterAction.value = liveShadowFilters.action || "all";
  if (els.mdLiveShadowFilterResult) els.mdLiveShadowFilterResult.value = liveShadowFilters.result || "all";
  const filtered = liveShadowTimeline.getFiltered(liveShadowFilters);
  liveShadowStats = computeLiveShadowStats(filtered);
  const latest = filtered[0] || null;
  const pendingCount = filtered.filter((row) => row.outcome?.status === "pending").length;
  const source = getSelectedMarketDataSource();
  const sourceStatus = getSourceStatus({ source });
  const live = marketDataMeta?.liveStatus || {};
  const streamConnected = source === MARKET_DATA_SOURCES.BINANCE_FUTURES && Boolean(sourceStatus?.connected || live.connected);
  const lastClosed = marketDataCandles[marketDataCandles.length - 1];

  if (els.mdLiveShadowStatus) {
    els.mdLiveShadowStatus.innerHTML = source !== MARKET_DATA_SOURCES.BINANCE_FUTURES
      ? "Live Shadow monitor is idle. Switch source to Binance Futures to enable."
      : `Binance Futures · ${getSelectedMarketDataSymbol()} ${getSelectedMarketDataTimeframe()} · stream ${streamConnected ? "connected" : "disconnected"} · candle ${marketDataOpenCandle ? "open/updating" : "awaiting"} · last close ${lastClosed ? formatNumber(lastClosed.close, 4) : "-"} · update ${formatTs(marketDataMeta?.lastSyncAt)}`;
  }

  if (els.mdLiveShadowPolicy) {
    els.mdLiveShadowPolicy.innerHTML = latest
      ? `<p><span class="badge ${latest.policy.action === "LONG" ? "call" : latest.policy.action === "SHORT" ? "put" : "tag"}">${latest.policy.action}</span> <span class="badge">${formatConfidence(latest.policy.confidence)}</span> ${Number.isFinite(latest.plan.riskReward) ? `<span class="badge">RR ${formatNumber(latest.plan.riskReward, 2)}</span>` : ""}</p><p class="muted">${latest.policy.reason || "-"}</p><p class="muted">Ref ${formatNumber(latest.plan.referencePrice, 4)} · SL ${formatNumber(latest.plan.stopLoss, 4)} · TP ${formatNumber(latest.plan.takeProfit, 4)}</p><p>${(latest.policy.thesisTags || []).slice(0, 4).map((tag) => `<span class="badge">${tag}</span>`).join(" ")}</p>`
      : `<p class="muted">No policy decisions yet.</p>`;
  }

  if (els.mdLiveShadowPending) {
    const nextPending = filtered.find((row) => row.outcome?.status === "pending");
    const elapsedBars = nextPending ? Math.max(0, marketDataCandles.length - 1 - Number(nextPending.candleIndex || 0)) : 0;
    els.mdLiveShadowPending.innerHTML = `<p><strong>Pending:</strong> ${pendingCount}</p><p class="muted">${nextPending ? `${nextPending.symbol} ${nextPending.timeframe} · ${nextPending.policy.action} · elapsed bars ${elapsedBars}` : "No pending outcome."}</p>`;
  }

  if (els.mdLiveShadowStats) {
    els.mdLiveShadowStats.innerHTML = `<p>Decisions ${liveShadowStats.totalDecisions} · Wins ${liveShadowStats.wins} · Losses ${liveShadowStats.losses} · Win rate ${formatPct((liveShadowStats.winRate || 0) * 100, 1)}</p><p class="muted">Avg confidence ${formatConfidence(liveShadowStats.avgConfidence)} · Avg R ${formatNumber(liveShadowStats.avgRMultiple, 2)} · Avg pnl ${formatPct(liveShadowStats.avgPnlPct, 2)} · Max streak W${liveShadowStats.maxWinStreak}/L${liveShadowStats.maxLossStreak}</p>`;
  }

  if (els.mdLiveShadowTimelineBody) {
    els.mdLiveShadowTimelineBody.innerHTML = filtered.length
      ? filtered.slice(0, 30).map((row) => `<tr data-live-shadow-id="${row.id}"><td>${new Date(row.timestamp).toLocaleTimeString()}</td><td>${row.symbol}</td><td>${row.timeframe}</td><td><span class="badge ${row.policy.action === "LONG" ? "call" : row.policy.action === "SHORT" ? "put" : "tag"}">${row.policy.action}</span></td><td>${formatConfidence(row.policy.confidence)}</td><td>${row.outcome.status === "resolved" ? `<span class="badge ${getOutcomeBadgeClass(row.outcome.result)}">${row.outcome.result}</span>` : `<span class="badge">pending</span>`}</td><td>${row.outcome.status === "resolved" ? formatNumber(row.outcome.rMultiple, 2) : "-"}</td></tr>`).join("")
      : `<tr><td colspan="7" class="muted">No live decisions for current filter.</td></tr>`;
  }

  const selected = filtered.find((row) => row.id === liveShadowSelectedId) || latest;
  if (els.mdLiveShadowDetail) {
    els.mdLiveShadowDetail.innerHTML = selected
      ? `<p><strong>${selected.symbol} ${selected.timeframe}</strong> · ${formatTs(selected.timestamp)}</p><p class="muted">${selected.policy.reason || "-"}</p><p class="muted">Warnings: ${(selected.policy.warnings || []).join(", ") || "none"}</p><p class="muted">Neurons: ${(selected.stateSummary.activeNeurons || []).slice(0, 8).join(", ") || "none"}</p><p class="muted">Action scores: ${JSON.stringify(selected.policy.actionScores || {})}</p><p class="muted">Outcome ${selected.outcome.status}${selected.outcome.result ? ` · ${selected.outcome.result}` : ""} · bars ${selected.outcome.barsElapsed ?? "-"}</p>`
      : `<p class="muted">Select a live decision row to inspect full details.</p>`;
  }
}

async function applyLiveFuturesPolicyOnClose(closedCandle) {
  if (!closedCandle || !futuresPolicyConfig?.enabled) return;
  const record = liveShadowMonitor.createSnapshot({
    candle: closedCandle,
    candles: marketDataCandles,
    neuronActivations,
    seededPatterns,
    policyConfig: futuresPolicyConfig,
    sourceStatus: getSourceStatus({ source: closedCandle.source }),
  });
  if (record) liveShadowMonitor.upsertRecord(record);
  liveShadowMonitor.resolvePending({ candles: marketDataCandles, maxHoldBars: Number(futuresPolicyConfig.maxHoldBars || 24) });

  const latestRecords = liveShadowMonitor.getRecords();
  futuresPolicySnapshots = latestRecords.slice(0, 300).map((row) => ({
    id: row.id,
    type: "live-shadow-decision",
    timestamp: row.timestamp,
    source: row.source,
    asset: row.symbol,
    timeframe: row.timeframe,
    action: row.policy?.action,
    confidence: row.policy?.confidence,
    reason: row.policy?.reason,
    executionPlan: row.plan,
    evidence: row.policy?.supportingEvidence,
    replay: row.outcome,
    policyVersion: row._meta?.policyVersion,
  }));
  await Promise.all([saveFuturesPolicySnapshots(futuresPolicySnapshots), persistLiveShadowState()]);
  renderLiveShadowPanel();
}

async function handleLiveCandleUpdate(candle) {
  marketDataOpenCandle = candle;
  const idx = marketDataCandles.findIndex((row) => row.id === candle.id);
  if (idx >= 0) {
    marketDataCandles[idx] = { ...marketDataCandles[idx], ...candle, closed: false };
  } else {
    marketDataCandles = [...marketDataCandles, candle].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  marketDataMeta = { ...marketDataMeta, lastSyncAt: new Date().toISOString(), source: candle.source };
  refreshMarketDataUI();
}

async function handleLiveCandleClose(candle) {
  marketDataOpenCandle = null;
  const existingIdx = marketDataCandles.findIndex((row) => row.id === candle.id);
  if (existingIdx >= 0) {
    marketDataCandles[existingIdx] = { ...marketDataCandles[existingIdx], ...candle, closed: true };
  } else {
    marketDataCandles = mergeCandles(marketDataCandles, [{ ...candle, closed: true }]);
  }

  marketDataMeta = {
    ...marketDataMeta,
    source: candle.source,
    lastSyncAt: new Date().toISOString(),
    lastCandleTimestamp: getLatestCandleTimestamp(marketDataCandles),
    lastLiveCandleCloseAt: candle.timestamp,
  };

  neuronActivations = calculateNeuronActivations(marketDataCandles);
  neuronSummary = summarizeNeuronActivations(neuronActivations);
  patternDiscoveryResult = null;
  selectedPatternCandidateId = "";
  selectedReviewCandidateId = "";
  patternReviewDecisions = {};

  await applyLiveFuturesPolicyOnClose(candle);
  await Promise.all([saveMarketData(marketDataCandles), saveMarketDataMeta(marketDataMeta)]);
  refreshMarketDataUI();
}

async function ensureLiveSubscription() {
  const source = getSelectedMarketDataSource();
  unsubscribeLiveCandles();
  marketDataLiveToken = null;
  if (source !== MARKET_DATA_SOURCES.BINANCE_FUTURES) {
    renderMarketLiveStatus();
    return;
  }
  const symbol = getSelectedMarketDataSymbol();
  const timeframe = getSelectedMarketDataTimeframe();
  const result = await subscribeLiveCandles({ source, symbol, timeframe }, {
    onCandleUpdate: handleLiveCandleUpdate,
    onCandleClose: handleLiveCandleClose,
    onStatus: async (status) => {
      marketDataMeta = {
        ...marketDataMeta,
        liveStatus: {
          connected: Boolean(status.connected),
          reconnectAttempts: Number(status.reconnectAttempts || 0),
          lastMessageAt: status.at ? new Date(status.at).toISOString() : marketDataMeta?.liveStatus?.lastMessageAt || null,
          statusType: status.type,
        },
      };
      if (status.type === "open" && marketDataCandles.length) {
        const resynced = await resyncLatestCandles({ source, symbol, timeframe, limit: 3 });
        marketDataCandles = mergeCandles(marketDataCandles, resynced);
      }
      saveMarketDataMeta(marketDataMeta);
      renderMarketLiveStatus();
      renderLiveShadowPanel();
    },
  });
  marketDataLiveToken = result?.token || null;
  renderMarketLiveStatus();
}

function refreshMarketDataUI() {
  const newlyResolved = liveShadowMonitor.resolvePending({ candles: marketDataCandles, maxHoldBars: Number(futuresPolicyConfig.maxHoldBars || 24) });
  if (newlyResolved.length) persistLiveShadowState();
  const total = marketDataCandles.length;
  const first = getEarliestCandleTimestamp(marketDataCandles);
  const last = getLatestCandleTimestamp(marketDataCandles);
  const lastSync = marketDataMeta?.lastSyncAt;

  if (!els.mdStatus) return;
  const infoLines = [
    `Source: ${marketDataMeta?.source || "yahoo"}`,
    `Velas almacenadas: ${total}`,
    first ? `Primera: ${new Date(first).toLocaleString()}` : "Primera: -",
    last ? `Última: ${new Date(last).toLocaleString()}` : "Última: -",
    lastSync ? `Último sync: ${new Date(lastSync).toLocaleString()}` : "Último sync: -",
  ];
  els.mdStatus.className = "quick-add-feedback muted";
  els.mdStatus.innerHTML = infoLines.join(" &nbsp;·&nbsp; ");

  renderMarketLiveStatus();
  renderLiveShadowPanel();
  renderMarketDataDiagnostics();
  renderNeuronSummaryPanel();
  renderNeuronLatestPreview();
  renderPatternDiscoveryPanel();
  renderPatternReviewPanel();
  renderNeuronGraphPanel();
  refreshClusterMapPanel();
  renderSeededPatternLab();

  if (!els.mdPreviewBody) return;
  const preview = marketDataCandles.slice(-20);
  const enrichedPreview = enrichCandles(preview);
  if (preview.length === 0) {
    els.mdPreviewBody.innerHTML = `<tr><td colspan="8" class="muted">Sin datos.</td></tr>`;
    return;
  }
  els.mdPreviewBody.innerHTML = enrichedPreview
    .map(
      (c) =>
        `<tr><td>${new Date(c.timestamp).toLocaleString()}</td><td>${c.open}</td><td>${c.high}</td><td>${c.low}</td><td>${c.close}</td><td class="md-extra-col">${c.range?.toFixed?.(5) ?? "-"}</td><td class="md-extra-col">${c.bodySize?.toFixed?.(5) ?? "-"}</td><td class="md-extra-col">${c.bodyPercentOfRange?.toFixed?.(2) ?? "-"}%</td></tr>`
    )
    .join("");
}

async function handleMarketDataFetch() {
  const source = getSelectedMarketDataSource();
  const symbol = getSelectedMarketDataSymbol();
  const timeframe = getSelectedMarketDataTimeframe();
  const range = els.mdRange?.value || "5d";

  setMarketDataStatus("Obteniendo velas...", "muted");
  try {
    const candles = await loadHistoricalCandles({ source, symbol, timeframe, interval: timeframe, range, limit: source === MARKET_DATA_SOURCES.BINANCE_FUTURES ? 1000 : undefined });
    if (candles.length === 0) {
      setMarketDataStatus("Sin velas válidas en la respuesta.", "warning");
      return;
    }
    marketDataCandles = mergeCandles([], candles);
    neuronActivations = [];
    neuronSummary = null;
    neuronGraph = null;
    selectedGraphNodeId = "";
    selectedGraphEdgeKey = "";
    patternDiscoveryResult = null;
    selectedPatternCandidateId = "";
    selectedReviewCandidateId = "";
    patternReviewDecisions = {};
    marketDataMeta = {
      ...marketDataMeta,
      source,
      selectedSymbol: symbol,
      selectedTimeframe: timeframe,
      lastSyncAt: new Date().toISOString(),
      lastCandleTimestamp: getLatestCandleTimestamp(marketDataCandles),
    };
    await Promise.all([saveMarketData(marketDataCandles), saveMarketDataMeta(marketDataMeta)]);
    await ensureLiveSubscription();
    refreshMarketDataUI();
    setMarketDataStatus(`✓ ${candles.length} velas recibidas (${source}).`, "success");
  } catch (err) {
    console.error("[MarketData] Fetch error:", err);
    setMarketDataStatus(`Error: ${err.message}`, "error");
  }
}

async function handleMarketDataSync() {
  const source = getSelectedMarketDataSource();
  const symbol = getSelectedMarketDataSymbol();
  const timeframe = getSelectedMarketDataTimeframe();

  setMarketDataStatus("Sincronizando velas más recientes...", "muted");
  try {
    const candles = await resyncLatestCandles({ source, symbol, timeframe, interval: timeframe, range: source === MARKET_DATA_SOURCES.BINANCE_FUTURES ? undefined : "1d", limit: 250 });
    if (candles.length === 0) {
      setMarketDataStatus("Sin velas nuevas en el sync.", "warning");
      return;
    }
    const prevCount = marketDataCandles.length;
    marketDataCandles = mergeCandles(marketDataCandles, candles);
    const added = marketDataCandles.length - prevCount;
    neuronActivations = [];
    neuronSummary = null;
    neuronGraph = null;
    selectedGraphNodeId = "";
    selectedGraphEdgeKey = "";
    patternDiscoveryResult = null;
    selectedPatternCandidateId = "";
    selectedReviewCandidateId = "";
    patternReviewDecisions = {};
    marketDataMeta = {
      ...marketDataMeta,
      source,
      selectedSymbol: symbol,
      selectedTimeframe: timeframe,
      lastSyncAt: new Date().toISOString(),
      lastCandleTimestamp: getLatestCandleTimestamp(marketDataCandles),
    };
    await Promise.all([saveMarketData(marketDataCandles), saveMarketDataMeta(marketDataMeta)]);
    await ensureLiveSubscription();
    refreshMarketDataUI();
    setMarketDataStatus(`✓ Sync completado. ${added} velas nuevas agregadas (${marketDataCandles.length} total).`, "success");
  } catch (err) {
    console.error("[MarketData] Sync error:", err);
    setMarketDataStatus(`Error en sync: ${err.message}`, "error");
  }
}

function handleMarketDataIntegrityCheck() {
  const timeframe = els.mdTimeframe?.value || "5m";
  marketDataDiagnostics = runMarketDataIntegrityCheck(marketDataCandles, timeframe);
  console.log("[marketData] integrity diagnostics:", marketDataDiagnostics);
  refreshMarketDataUI();

  const summary = `Integrity check: ${marketDataDiagnostics.total} candles · ${marketDataDiagnostics.duplicates} duplicates · ${marketDataDiagnostics.outOfOrder} out-of-order · ${marketDataDiagnostics.gaps.length} gaps`;
  setMarketDataStatus(summary, marketDataDiagnostics.isHealthy ? "success" : "warning");
}

function handleComputeNeurons() {
  if (!marketDataCandles.length) {
    setMarketDataStatus("Load or import candles before computing neurons.", "warning");
    return;
  }

  console.log("[neuronEngine] neuron engine started");
  console.log("[neuronEngine] candles loaded", marketDataCandles.length);
  neuronActivations = calculateNeuronActivations(marketDataCandles);
  neuronSummary = summarizeNeuronActivations(neuronActivations);
  neuronGraph = null;
  selectedGraphNodeId = "";
  selectedGraphEdgeKey = "";
  patternDiscoveryResult = null;
  selectedPatternCandidateId = "";
    selectedReviewCandidateId = "";
    patternReviewDecisions = {};
  console.log("[neuronEngine] activations computed", neuronActivations.length);
  console.log("[neuronEngine] summary built", neuronSummary);

  refreshMarketDataUI();

  const top = getTopNeuronTypes(neuronSummary, 5);
  const topText = top.map((row) => `${row.neuronId} (${row.count})`).join(" · ") || "-";
  setMarketDataStatus(`Neurons computed: ${neuronSummary.totalActivations} active events. Top: ${topText}`, "success");
}

function handleMarketDataExport() {
  if (marketDataCandles.length === 0) {
    setMarketDataStatus("Sin datos para exportar.", "warning");
    return;
  }
  const payload = { app: "PatternLab", exportedAt: new Date().toISOString(), type: "marketData", meta: marketDataMeta, candles: marketDataCandles };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `patternlab-marketdata-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setMarketDataStatus(`✓ Exportado: ${marketDataCandles.length} velas.`, "success");
}

async function handleMarketDataClear() {
  if (!window.confirm("¿Borrar todas las velas de market data almacenadas?")) return;
  marketDataCandles = [];
  unsubscribeLiveCandles();
  marketDataMeta = { ...marketDataMeta, lastSyncAt: null, lastCandleTimestamp: null, source: getSelectedMarketDataSource(), lastLiveCandleCloseAt: null };
  marketDataDiagnostics = null;
  neuronActivations = [];
  neuronSummary = null;
  neuronGraph = null;
  selectedGraphNodeId = "";
  selectedGraphEdgeKey = "";
  patternDiscoveryResult = null;
  selectedPatternCandidateId = "";
    selectedReviewCandidateId = "";
    patternReviewDecisions = {};
  await Promise.all([saveMarketData([]), saveMarketDataMeta(marketDataMeta)]);
  refreshMarketDataUI();
  setMarketDataStatus("Market data borrado.", "muted");
}

async function handleMarketDataImport(file) {
  setMarketDataStatus("Importing candles...", "muted");
  const asset = (els.mdAsset?.value || "EURUSD").replace(/=X$/i, "").toUpperCase();
  const timeframe = els.mdTimeframe?.value || "5m";
  try {
    const result = await importCandlesFromFile(file, { asset, timeframe, source: "import" });
    if (result.invalid > 0) {
      console.warn("[MarketData] Import skipped rows:", result.errors);
    }
    if (result.candles.length === 0) {
      setMarketDataStatus("No valid candles found in the file.", "warning");
      return;
    }
    console.log("[marketData] candles parsed:", result.total);
    const prevCount = marketDataCandles.length;
    marketDataCandles = mergeCandles(marketDataCandles, result.candles);
    const newCount = marketDataCandles.length - prevCount;
    const duplicates = result.valid - newCount;
    neuronActivations = [];
    neuronSummary = null;
    neuronGraph = null;
    selectedGraphNodeId = "";
    selectedGraphEdgeKey = "";
    patternDiscoveryResult = null;
    selectedPatternCandidateId = "";
    selectedReviewCandidateId = "";
    patternReviewDecisions = {};
    console.log("[marketData] candles merged:", marketDataCandles.length);
    marketDataMeta = { ...marketDataMeta, lastSyncAt: new Date().toISOString(), lastCandleTimestamp: getLatestCandleTimestamp(marketDataCandles) };
    await Promise.all([saveMarketData(marketDataCandles), saveMarketDataMeta(marketDataMeta)]);
    console.log("[marketData] candles saved");
    refreshMarketDataUI();
    setMarketDataStatus(`Imported ${result.valid} candles (${newCount} new, ${duplicates} duplicates skipped)`, "success");
  } catch (err) {
    console.error("[MarketData] Import error:", err);
    setMarketDataStatus(`Error: ${err.message}`, "error");
  }
}

function setupMarketDataEvents() {
  els.mdSource?.addEventListener("change", async () => {
    await refreshMarketDataSymbols();
    marketDataMeta = { ...marketDataMeta, source: getSelectedMarketDataSource(), selectedSymbol: getSelectedMarketDataSymbol(), selectedTimeframe: getSelectedMarketDataTimeframe() };
    await saveMarketDataMeta(marketDataMeta);
    await ensureLiveSubscription();
    refreshMarketDataUI();
  });
  els.mdAsset?.addEventListener("change", async () => {
    marketDataMeta = { ...marketDataMeta, selectedSymbol: getSelectedMarketDataSymbol() };
    await saveMarketDataMeta(marketDataMeta);
    await ensureLiveSubscription();
    renderMarketLiveStatus();
  });
  els.mdTimeframe?.addEventListener("change", async () => {
    marketDataMeta = { ...marketDataMeta, selectedTimeframe: getSelectedMarketDataTimeframe() };
    await saveMarketDataMeta(marketDataMeta);
    await ensureLiveSubscription();
    renderMarketLiveStatus();
  });
  els.mdLiveShadowFilterSymbol?.addEventListener("change", async () => {
    liveShadowFilters = { ...liveShadowFilters, symbol: els.mdLiveShadowFilterSymbol.value || "all" };
    renderLiveShadowPanel();
    await persistLiveShadowState();
  });
  els.mdLiveShadowFilterTimeframe?.addEventListener("change", async () => {
    liveShadowFilters = { ...liveShadowFilters, timeframe: els.mdLiveShadowFilterTimeframe.value || "all" };
    renderLiveShadowPanel();
    await persistLiveShadowState();
  });
  els.mdLiveShadowFilterAction?.addEventListener("change", async () => {
    liveShadowFilters = { ...liveShadowFilters, action: els.mdLiveShadowFilterAction.value || "all" };
    renderLiveShadowPanel();
    await persistLiveShadowState();
  });
  els.mdLiveShadowFilterResult?.addEventListener("change", async () => {
    liveShadowFilters = { ...liveShadowFilters, result: els.mdLiveShadowFilterResult.value || "all" };
    renderLiveShadowPanel();
    await persistLiveShadowState();
  });
  els.mdLiveShadowTimelineBody?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-live-shadow-id]");
    if (!row) return;
    liveShadowSelectedId = row.getAttribute("data-live-shadow-id") || "";
    renderLiveShadowPanel();
  });

  els.mdFetchBtn?.addEventListener("click", handleMarketDataFetch);
  els.mdSyncBtn?.addEventListener("click", handleMarketDataSync);
  els.mdImportBtn?.addEventListener("click", () => els.mdImportFile?.click());
  els.mdImportFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleMarketDataImport(file);
    e.target.value = "";
  });
  els.mdExportBtn?.addEventListener("click", handleMarketDataExport);
  els.mdIntegrityBtn?.addEventListener("click", handleMarketDataIntegrityCheck);
  els.mdNeuronBtn?.addEventListener("click", handleComputeNeurons);
  els.mdBuildGraphBtn?.addEventListener("click", handleBuildNeuronGraph);
  els.mdDiscoverPatternsBtn?.addEventListener("click", handleDiscoverPatterns);
  els.mdClearBtn?.addEventListener("click", handleMarketDataClear);
  els.prPromoteBtn?.addEventListener("click", () => applyPatternReviewDecision("promoted"));
  els.prRejectBtn?.addEventListener("click", () => applyPatternReviewDecision("rejected"));
  els.prIgnoreBtn?.addEventListener("click", () => applyPatternReviewDecision("ignored"));

  els.clusterMinEdge?.addEventListener("input", () => {
    clusterMapFilters.minEdgeWeight = Number(els.clusterMinEdge.value) || 1;
    syncRangeInput(els.clusterMinEdge, els.clusterMinEdgeValue, clusterMapFilters.minEdgeWeight);
    refreshClusterMapPanel();
  });
  els.clusterMinNode?.addEventListener("input", () => {
    clusterMapFilters.minNodeWeight = Number(els.clusterMinNode.value) || 1;
    syncRangeInput(els.clusterMinNode, els.clusterMinNodeValue, clusterMapFilters.minNodeWeight);
    refreshClusterMapPanel();
  });
  els.clusterSessionFilter?.addEventListener("change", () => {
    clusterMapFilters.session = els.clusterSessionFilter.value || "all";
    refreshClusterMapPanel();
  });

  els.seededNeuronSelect?.addEventListener("change", () => {
    selectedSeededNeurons = Array.from(els.seededNeuronSelect.selectedOptions || []).map((option) => option.value).slice(0, 4);
    renderSeededPatternLab();
  });
  els.seededRunBtn?.addEventListener("click", handleRunSeededLab);
  els.seededSaveBtn?.addEventListener("click", handleSaveSeededCandidate);
  els.seededPromoteBtn?.addEventListener("click", handlePromoteSeededCandidate);
  els.seededExportBtn?.addEventListener("click", handleExportSeededDefinition);
}


async function init() {
  await initializeStorage();
  const loadedSignals = loadSignals();
  replaceSessions(loadSessions(normalizeSession));
  metaFeedback = loadMetaFeedback();
  botCompilerState = loadBotCompilerState();
  const activeSession = state.sessions.find((session) => session.status === "active");
  setActiveSessionId(activeSession?.id || null);
  patternVersionsRegistry = loadPatternVersionsRegistry();
  patternVersionsRegistry = rebuildPatternVersionsFromSignals(state.signals, patternVersionsRegistry);
  if (!patternVersionsRegistry.length) {
    const demo = ensurePatternVersionExists(patternVersionsRegistry, "RSI EMA Reclaim", "v2", "Manual S/R experiment");
    patternVersionsRegistry = demo.entries;
  }
  persistPatternVersions();
  activePatternVersionId = loadActivePatternVersionId();
  if (!activePatternVersionId || !patternVersionsRegistry.some((entry) => entry.id === activePatternVersionId && !entry.isArchived)) {
    activePatternVersionId = patternVersionsRegistry.find((entry) => !entry.isArchived)?.id || "";
    saveActivePatternVersionId(activePatternVersionId);
  }
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
  loadSessionAnalysisPrefs();
  syncSessionAnalysisToggleUI();
  if (els.sessionDate) els.sessionDate.value = new Date().toISOString().slice(0, 10);
  marketDataCandles = loadMarketData();
  marketDataMeta = { ...marketDataMeta, ...(loadMarketDataMeta() || {}) };
  if (els.mdSource) els.mdSource.value = marketDataMeta.source || MARKET_DATA_SOURCES.YAHOO;
  if (els.mdTimeframe) els.mdTimeframe.value = marketDataMeta.selectedTimeframe || "5m";
  futuresPolicyConfig = { ...futuresPolicyConfig, ...(loadFuturesPolicyConfig() || {}) };
  futuresPolicySnapshots = loadFuturesPolicySnapshots();
  const storedLiveShadow = loadLiveShadowState() || {};
  liveShadowFilters = { ...liveShadowFilters, ...(storedLiveShadow.filters || {}) };
  liveShadowStats = storedLiveShadow.latestStats || liveShadowStats;
  liveShadowMonitor.setRecords(Array.isArray(storedLiveShadow.records) ? storedLiveShadow.records : []);
  promotedPatterns = loadPromotedPatterns().map((row) => normalizePromotedPattern(row));
  seededPatterns = loadSeededPatterns();
  seededPatternResults = loadSeededPatternResults();
  replaceSignals(loadedSignals);
  livePatternSignals = loadLivePatternSignals();
  livePatternSummary = loadLivePatternSummary();
  setupTabs();
  setupEvents();
  setupMarketDataEvents();
  await refreshMarketDataSymbols();
  if (els.mdAsset && marketDataMeta.selectedSymbol) els.mdAsset.value = marketDataMeta.selectedSymbol;
  await ensureLiveSubscription();
  importerMode = els.importerMode?.value === "live" ? "live" : "research";
  applyImporterMode();
  refreshMarketDataUI();
  rerender();
  if (activePatternVersionId) {
    const active = patternVersionsRegistry.find((entry) => entry.id === activePatternVersionId);
    if (active) {
      els.quickAddPattern.value = active.patternName;
      refreshQuickAddVersionOptions();
      els.quickAddVersion.value = active.version;
    }
  }

  if (!els.botPattern.value && BOT_DEMO_PATTERNS.length) {
    els.botPattern.value = BOT_DEMO_PATTERNS[0].name;
    handleBotPatternChange();
    handleBuildPatternDefinition();
    handleGenerateSchema();
  }
}

window.addEventListener("beforeunload", () => unsubscribeLiveCandles());

init();
