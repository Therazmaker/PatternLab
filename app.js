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
  loadStrategyRuns,
  loadStrategyLifecycle,
  loadNotes,
  loadJournalTrades,
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
  saveStrategyRuns,
  saveStrategyLifecycle,
  saveMetaFeedback,
  saveNotes,
  saveJournalTrades,
  savePatternVersionsRegistry,
  savePromotedPatterns,
  saveSeededPatternResults,
  saveSeededPatterns,
  saveSessions,
  saveSignals,
  validateMemoryPayload,
  loadCopilotFeedback,
  saveCopilotFeedback,
  loadLibraryItems,
  saveLibraryItems,
} from "./modules/storage.js";
import { importCopilotFeedback, getCopilotFeedback, getCopilotFeedbackHistory, hydrateCopilotFeedbackStore, serializeCopilotFeedbackStore } from "./modules/copilotFeedbackStore.js";
import { evaluateCopilotFeedback } from "./modules/copilotFeedbackEvaluator.js";
import { buildCopilotFeedbackEffects } from "./modules/copilotFeedbackBridge.js";
import { renderCopilotFeedbackBlock, renderCopilotFeedbackTabPanel } from "./modules/copilotFeedbackPanel.js";
import { renderBrainDashboard } from "./modules/brainDashboard.js";
import { openTradeVisualizerModal } from "./src/ui/tradeVisualizerModal.js";
import { buildSessionContextSignature, getCurrentPacket, runSessionBrainOrchestrator, updateCurrentPacket } from "./modules/sessionBrainOrchestrator.js";
import { getManualControls, hasActiveManualOverrides, resetManualControls, setManualControls } from "./modules/manualControlsStore.js";
import { persistHumanOverrideMemory, persistLearnedContext } from "./modules/brainLearningWriter.js";
import { createBrainMemoryStore, createBrainEvent } from "./modules/brainMemoryStore.js";
import { createBrainModeController } from "./modules/brainModeController.js";
import { createExecutorStateStore } from "./modules/executorStateStore.js";
import { createBrainExecutor } from "./modules/brainExecutor.js";
import { createTradeOutcomeLogger } from "./modules/tradeOutcomeLogger.js";
import { createBrainTradeJournal, normalizeJournalTrade } from "./modules/brainTradeJournal.js";
import { createBrainLearningUpdater } from "./modules/brainLearningUpdater.js";
import { computeLearningProgressPacket } from "./modules/learningProgressEngine.js";
import { buildDecisionTrace } from "./modules/decisionTraceBuilder.js";
import { addDecisionTrace, getDecisionTraces, getAggregatedTraceStats, updateDecisionTrace } from "./modules/decisionTraceStore.js";
import { evaluateForwardOutcome } from "./modules/forwardOutcomeEvaluator.js";
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
import { buildImportPreview, importStrategySignal } from "./modules/importer.js";
import { ingestSyntheticTrades } from "./modules/syntheticTradeIngestor.js";
import { applySyntheticTradesToLearning, getSyntheticLearningSnapshot } from "./modules/syntheticLearningIntegrator.js";
import { computeSyntheticLearningRatio, getSyntheticTrades } from "./modules/syntheticTradeStore.js";
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
import { SessionChart } from "./modules/sessionChart.js";
import { buildSessionCandleExplanations, getDefaultSessionAnalysisConfig } from "./modules/sessionAnalysis.js";
import { buildSessionCandleAnalysis } from "./modules/sessionCandleAnalysis.js";
import { resolveScenarioSet } from "./modules/scenarioResolver.js";
import { getLastResolvedScenarios, getScenarioMemoryRows } from "./modules/scenarioMemoryStore.js";
import { updateScenarioContextStats } from "./modules/scenarioProbabilityUpdater.js";
import { buildChatGPTAssistedExport } from "./modules/chatgptAssistedExport.js";
import { buildBrainAssistPacket } from "./modules/brainAssistExport.js";
import { applyReinforcement, ingestCopilotReinforcement } from "./modules/copilotReinforcementIngestor.js";
import { applyReinforcementPatch } from "./modules/reinforcementPatchApplier.js";
import { computeRiskSizing } from "./modules/riskSizingEngine.js";
import { analyzeSessionCandles } from "./modules/sessionAnalystEngine.js";
import { renderAnalystPanel } from "./modules/analystPanel.js";
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
  DEFAULT_EXECUTION_CONTROL_STATE,
  blockShadowTrade,
  canModuleExecuteTrade,
  canShadowExecuteTrade,
  getExecutionAuthority,
  getExecutionPacket,
  normalizeExecutionControlState,
  blockExecution,
  blockCurrentSetup,
} from "./modules/executionAuthority.js";
import { getOperatorActions } from "./modules/operatorFeedback.js";
import { computeOperatorModifier } from "./modules/operatorModifierEngine.js";
import { combineFinalDecision } from "./modules/finalDecisionCombiner.js";
import { createHumanInsightDraft, finalizeHumanInsightDraft, toggleHumanInsightTag, updateHumanInsightDraft } from "./modules/humanInsightCapture.js";
import { evaluateHumanInsights } from "./modules/humanInsightEngine.js";
import { reconcileHumanInsights, validateHumanInsight } from "./modules/humanInsightValidation.js";
import { runHumanInsightDemoScenarios, runHumanInsightE2EChecklist } from "./modules/humanInsightDebug.js";
import {
  createTriggerLineFromDrawing,
  deleteTriggerLineByDrawingId,
  loadTriggerLines,
  saveTriggerLines,
  updateTriggerLine,
} from "./modules/triggerLineCapture.js";
import { evaluateTriggerLines } from "./modules/triggerLineEvaluator.js";
import { buildTriggerLineEffects } from "./modules/triggerLineSignalBridge.js";
import { renderTriggerLinePanel } from "./modules/triggerLinePanel.js";
import { logOperatorAction } from "./modules/operatorActionLogger.js";
import { buildOperatorActionRecord, createSessionOperatorState } from "./modules/operatorFeedbackPanel.js";
import { listStrategies, getDefaultParams, getStrategyById } from "./modules/strategyRegistry.js";
import { buildStrategyFeatures } from "./modules/strategyFeatures.js";
import { runStrategyBacktest } from "./modules/strategyBacktest.js";
import { getSavedStrategyRuns, persistStrategyRun } from "./modules/strategyPersistence.js";
import { compareStrategyRuns } from "./modules/strategyRunCompare.js";
import { validateRuleBasedStrategyDefinition } from "./modules/strategyJson.js";
import { addValidationResult, computeLiveMetrics, createStrategyVersion, detectDegradation, ensureVersionFromDefinition, getVersionLineage, normalizeLifecycleState, promoteVersionToLiveShadow, updateLiveInstanceMetrics, updateVersionStatus } from "./modules/strategyLifecycle.js";
import { RlEnvironmentAdapter } from "./modules/rlEnvironmentAdapter.js";
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
import { LIBRARY_EXAMPLES, normalizeLibraryItem, resolveLibraryMatches } from "./modules/libraryMemory.js";
import { createMicroBotTab } from "./modules/microBotTab.js";
import { createSessionReviewerTab } from "./src/ui/sessionReviewerTab.js";
import { createGeminiBotController } from "./modules/geminiBot/GeminiBotController.js";
import { GeminiBotChart } from "./modules/geminiBot/GeminiBotChart.js";
import { LibraryBridge } from "./modules/geminiBot/LibraryBridge.js";
import { NeuronModal } from "./modules/geminiBot/NeuronModal.js";

const els = {
  quickAddPattern: document.getElementById("quick-add-pattern"), quickAddVersion: document.getElementById("quick-add-version"), quickAddInput: document.getElementById("quick-add-input"), quickAddBtn: document.getElementById("btn-quick-add"), quickAddFeedback: document.getElementById("quick-add-feedback"), quickAddNearSupport: document.getElementById("quick-add-near-support"), quickAddNearResistance: document.getElementById("quick-add-near-resistance"), quickAddSrComment: document.getElementById("quick-add-sr-comment"), quickAddV3Toggle: document.getElementById("quick-add-v3-toggle"), quickAddOpen: document.getElementById("quick-add-open"), quickAddHigh: document.getElementById("quick-add-high"), quickAddLow: document.getElementById("quick-add-low"), quickAddClose: document.getElementById("quick-add-close"), quickAddMfe: document.getElementById("quick-add-mfe"), quickAddMae: document.getElementById("quick-add-mae"), quickAddExcursionUnit: document.getElementById("quick-add-excursion-unit"), quickAddAttachSession: document.getElementById("quick-add-attach-session"), quickAddSessionCandle: document.getElementById("quick-add-session-candle"), quickAddAutoExcursion: document.getElementById("btn-quick-add-auto-excursion"),
  jsonInput: document.getElementById("json-input"), preview: document.getElementById("preview"), validateBtn: document.getElementById("btn-validate"), importBtn: document.getElementById("btn-import"), clearBtn: document.getElementById("btn-clear"), loadDemoBtn: document.getElementById("btn-load-demo"), injectSyntheticBtn: document.getElementById("btn-inject-synthetic"),
  includeDuplicates: document.getElementById("import-allow-duplicates"), importReport: document.getElementById("import-report"), syntheticLearningRatio: document.getElementById("synthetic-learning-ratio"),
  feedBody: document.getElementById("feed-body"), search: document.getElementById("search"), filterAsset: document.getElementById("filter-asset"), filterDirection: document.getElementById("filter-direction"), filterPattern: document.getElementById("filter-pattern"), filterSource: document.getElementById("filter-source"), filterStrategy: document.getElementById("filter-strategy"), filterStrategyVersion: document.getElementById("filter-strategy-version"), filterStatus: document.getElementById("filter-status"), filterTimeframe: document.getElementById("filter-timeframe"), filterNearSupport: document.getElementById("filter-near-support"), filterNearResistance: document.getElementById("filter-near-resistance"), filterHasOHLC: document.getElementById("filter-has-ohlc"), filterHasExcursion: document.getElementById("filter-has-excursion"), filterHasSession: document.getElementById("filter-has-session"), filterMfeMin: document.getElementById("filter-mfe-min"), filterMaeMax: document.getElementById("filter-mae-max"), exportBtn: document.getElementById("btn-export"), datasetFile: document.getElementById("dataset-file"),
  modal: document.getElementById("review-modal"), reviewDetails: document.getElementById("review-details"), reviewStatus: document.getElementById("review-status"), reviewComment: document.getElementById("review-comment"), reviewExpiryClose: document.getElementById("review-expiry-close"), reviewLabels: document.getElementById("review-labels"), reviewExecutionError: document.getElementById("review-execution-error"), reviewLateEntry: document.getElementById("review-late-entry"), reviewNearSupport: document.getElementById("review-near-support"), reviewNearResistance: document.getElementById("review-near-resistance"), reviewSrComment: document.getElementById("review-sr-comment"), reviewV3Toggle: document.getElementById("review-v3-toggle"), reviewOpen: document.getElementById("review-open"), reviewHigh: document.getElementById("review-high"), reviewLow: document.getElementById("review-low"), reviewClose: document.getElementById("review-close"), reviewMfe: document.getElementById("review-mfe"), reviewMae: document.getElementById("review-mae"), reviewExcursionUnit: document.getElementById("review-excursion-unit"), reviewSessionLink: document.getElementById("review-session-link"), reviewSessionCandle: document.getElementById("review-session-candle"), reviewV3Notes: document.getElementById("review-v3-notes"), reviewAutoExcursion: document.getElementById("btn-review-auto-excursion"), saveReviewBtn: document.getElementById("btn-save-review"), reviewNextBtn: document.getElementById("btn-review-next"), reviewPrevBtn: document.getElementById("btn-review-prev"),
  statsOverview: document.getElementById("stats-overview"), v3SignalStats: document.getElementById("v3-signal-stats"), sessionStats: document.getElementById("session-stats"), topAssets: document.getElementById("top-assets"), topPatterns: document.getElementById("top-patterns"), directionDist: document.getElementById("direction-dist"), statsBySource: document.getElementById("stats-by-source"), statsByStrategy: document.getElementById("stats-by-strategy"), statsBySymbol: document.getElementById("stats-by-symbol"), statsByTimeframe: document.getElementById("stats-by-timeframe"), statsByAction: document.getElementById("stats-by-action"), statsByResult: document.getElementById("stats-by-result"), statsFilterSource: document.getElementById("stats-filter-source"), statsFilterStrategy: document.getElementById("stats-filter-strategy"), statsFilterVersion: document.getElementById("stats-filter-version"), statsFilterSymbol: document.getElementById("stats-filter-symbol"), statsFilterTimeframe: document.getElementById("stats-filter-timeframe"), srAnalysisWrap: document.getElementById("sr-analysis-wrap"),
  rankingWrap: document.getElementById("ranking-wrap"), hourWrap: document.getElementById("hour-wrap"), assetWrap: document.getElementById("asset-wrap"),
  kpiTotal: document.getElementById("kpi-total"), kpiPending: document.getElementById("kpi-pending"), kpiWins: document.getElementById("kpi-wins"), kpiLosses: document.getElementById("kpi-losses"), kpiWinrate: document.getElementById("kpi-winrate"),
  tabs: [...document.querySelectorAll(".tab-btn")], panels: [...document.querySelectorAll(".tab-panel")],
  comparePatterns: document.getElementById("compare-patterns"), compareAsset: document.getElementById("compare-asset"), compareDirection: document.getElementById("compare-direction"), compareTimeframe: document.getElementById("compare-timeframe"), compareRangeMode: document.getElementById("compare-range-mode"), compareRangeValue: document.getElementById("compare-range-value"), compareNearSupport: document.getElementById("compare-near-support"), compareNearResistance: document.getElementById("compare-near-resistance"), compareResults: document.getElementById("compare-results"),
  versionsWrap: document.getElementById("versions-wrap"), confidencePattern: document.getElementById("confidence-pattern"), confidenceWindow: document.getElementById("confidence-window"), confidenceWrap: document.getElementById("confidence-wrap"),
  radarAsset: document.getElementById("radar-asset"), radarDirection: document.getElementById("radar-direction"), radarPattern: document.getElementById("radar-pattern"), radarTimeframe: document.getElementById("radar-timeframe"), radarMode: document.getElementById("radar-range-mode"), radarRangeValue: document.getElementById("radar-range-value"), radarResults: document.getElementById("radar-results"),
  robustnessPattern: document.getElementById("robustness-pattern"), robustnessVersion: document.getElementById("robustness-version"), robustnessWindow: document.getElementById("robustness-window"), mcMethod: document.getElementById("mc-method"), mcSimulations: document.getElementById("mc-simulations"), runMonteCarloBtn: document.getElementById("btn-run-montecarlo"), robustnessStatus: document.getElementById("robustness-status"), overfitWrap: document.getElementById("overfit-wrap"), stressWrap: document.getElementById("stress-wrap"), montecarloWrap: document.getElementById("montecarlo-wrap"), robustnessWrap: document.getElementById("robustness-wrap"),
  noteId: document.getElementById("note-id"), noteTitle: document.getElementById("note-title"), noteContent: document.getElementById("note-content"), noteTags: document.getElementById("note-tags"), notePattern: document.getElementById("note-pattern"), noteAsset: document.getElementById("note-asset"), noteSignal: document.getElementById("note-signal"), noteForm: document.getElementById("journal-form"), noteResetBtn: document.getElementById("btn-note-reset"),
  noteSearch: document.getElementById("note-search"), noteFilterTag: document.getElementById("note-filter-tag"), noteFilterPattern: document.getElementById("note-filter-pattern"), noteFilterAsset: document.getElementById("note-filter-asset"), notesList: document.getElementById("notes-list"),
  journalTradesList: document.getElementById("journal-trades-list"), journalTradeDetail: document.getElementById("journal-trade-detail"), journalTradeFilterStatus: document.getElementById("journal-trade-filter-status"), journalTradeFilterDirection: document.getElementById("journal-trade-filter-direction"), journalTradeFilterSource: document.getElementById("journal-trade-filter-source"), journalTradeFilterSetup: document.getElementById("journal-trade-filter-setup"), journalTradeSearch: document.getElementById("journal-trade-search"),
  microBotRoot: document.querySelector('[data-panel="microbot"]'), microBotStatus: document.getElementById("microbot-status"), microBotSymbol: document.getElementById("microbot-symbol"), microBotTimeframe: document.getElementById("microbot-timeframe"), microBotTradesCount: document.getElementById("microbot-trades-count"), microBotPnl: document.getElementById("microbot-pnl"), microBotAutoLabel: document.getElementById("microbot-auto-label"), microBotChart: document.getElementById("microbot-chart"), microBotLibraryRules: document.getElementById("microbot-library-rules"), microBotLastDecision: document.getElementById("microbot-last-decision"), microBotLastNoTrade: document.getElementById("microbot-last-no-trade"), microBotVetoCount: document.getElementById("microbot-veto-count"), microBotNoMatchCount: document.getElementById("microbot-no-match-count"), microBotTradeDecisionCount: document.getElementById("microbot-trade-decision-count"), microBotExecutedTradeCount: document.getElementById("microbot-executed-trade-count"), microBotJournalStatus: document.getElementById("microbot-journal-status"), microBotActiveTrade: document.getElementById("microbot-active-trade"), microBotJournalPreview: document.getElementById("microbot-journal-preview"), microBotLearningPreview: document.getElementById("microbot-learning-preview"), microBotJournalToolsTradesCount: document.getElementById("microbot-export-trades-count"), microBotJournalToolsWinrate: document.getElementById("microbot-export-winrate"), microBotJournalToolsLastExport: document.getElementById("microbot-export-last"), microBotExportStatus: document.getElementById("microbot-export-status"), microBotStartBtn: document.getElementById("btn-microbot-start"), microBotPauseBtn: document.getElementById("btn-microbot-pause"), microBotResetBtn: document.getElementById("btn-microbot-reset"), microBotToggleAutoBtn: document.getElementById("btn-microbot-toggle-auto"), microBotRefreshLibraryBtn: document.getElementById("btn-microbot-refresh-library"), microBotExportJournalBtn: document.getElementById("btn-microbot-export-journal"),
  sessionReviewerFileInput: document.getElementById("session-reviewer-file"), sessionReviewerInput: document.getElementById("session-reviewer-input"), sessionReviewerLoadPastedBtn: document.getElementById("btn-session-reviewer-load-pasted"), sessionReviewerExportBtn: document.getElementById("btn-session-reviewer-export"), sessionReviewerFileName: document.getElementById("session-reviewer-file-name"), sessionReviewerSchema: document.getElementById("session-reviewer-schema"), sessionReviewerStatus: document.getElementById("session-reviewer-status"), sessionReviewerSummary: document.getElementById("session-reviewer-summary"), sessionReviewerFindings: document.getElementById("session-reviewer-findings"), sessionReviewerSetup: document.getElementById("session-reviewer-setup"), sessionReviewerContext: document.getElementById("session-reviewer-context"), sessionReviewerLearning: document.getElementById("session-reviewer-learning"), sessionReviewerWinningDna: document.getElementById("session-reviewer-winning-dna"), sessionReviewerFixes: document.getElementById("session-reviewer-fixes"),
  geminiSymbol: document.getElementById("gemini-symbol"), geminiStreakSize: document.getElementById("gemini-streak-size"), geminiBearishStreakSize: document.getElementById("gemini-bearish-streak-size"), geminiTfSelector: document.getElementById("gemini-tf-selector"), geminiChartTf: document.getElementById("gemini-chart-tf"), geminiPatternFilter: document.getElementById("gemini-pattern-filter"), geminiStartBtn: document.getElementById("btn-gemini-start"), geminiStopBtn: document.getElementById("btn-gemini-stop"), geminiExportBtn: document.getElementById("btn-gemini-export"), geminiExportTrainingBtn: document.getElementById("btn-gemini-export-training"), geminiSaveModelBtn: document.getElementById("btn-gemini-save-model"), geminiStatus: document.getElementById("gemini-status"), geminiPrediction: document.getElementById("gemini-prediction"), geminiLog: document.getElementById("gemini-log"), geminiIndicatorRow: document.getElementById("gemini-indicator-row"), geminiStatGrid: document.getElementById("gemini-stat-grid"), geminiPatternTbody: document.getElementById("gemini-pattern-tbody"), geminiTfTbody: document.getElementById("gemini-tf-tbody"), geminiTrainingTotal: document.getElementById("gt-total"), geminiTrainingLoss: document.getElementById("gt-loss"), geminiTrainingAcc: document.getElementById("gt-acc"), geminiChart: document.getElementById("gemini-chart"), geminiStatsContainer: document.getElementById("gemini-stats-container"),
  reviewQueue: document.getElementById("review-queue"),
  forwardSplitMode: document.getElementById("forward-split-mode"), forwardRatio: document.getElementById("forward-ratio"), forwardDate: document.getElementById("forward-date"), forwardWrap: document.getElementById("forward-wrap"),
  errorClustersWrap: document.getElementById("error-clusters-wrap"), errorClusterDetails: document.getElementById("error-cluster-details"),
  hypothesisWrap: document.getElementById("hypothesis-wrap"),
  suggestionsWrap: document.getElementById("suggestions-wrap"),
  settingsStorageSummary: document.getElementById("settings-storage-summary"), settingsStorageStatus: document.getElementById("settings-storage-status"), settingsStorageBackend: document.getElementById("settings-storage-backend"), settingsMigrationStatus: document.getElementById("settings-migration-status"), settingsLastBackup: document.getElementById("settings-last-backup"), settingsExportMemoryBtn: document.getElementById("btn-export-memory"), settingsImportFile: document.getElementById("settings-import-file"), settingsImportMode: document.getElementById("settings-import-mode"), settingsImportPreview: document.getElementById("settings-import-preview"), settingsImportMemoryBtn: document.getElementById("btn-import-memory"), settingsBackupNowBtn: document.getElementById("btn-backup-now"), settingsDownloadBackupBtn: document.getElementById("btn-download-backup"), settingsRestoreBackupBtn: document.getElementById("btn-restore-backup"), settingsValidateMemoryBtn: document.getElementById("btn-validate-memory"), settingsClearLegacyBtn: document.getElementById("btn-clear-legacy-storage"), settingsStatus: document.getElementById("settings-status"),
  botPattern: document.getElementById("bot-pattern"), botVersion: document.getElementById("bot-version"), botDefinitionEditor: document.getElementById("bot-definition-editor"), botVersionNotes: document.getElementById("bot-version-notes"),
  botBuildDefinitionBtn: document.getElementById("btn-bot-build-definition"), botCloneVersionBtn: document.getElementById("btn-bot-clone-version"), botSaveVersionBtn: document.getElementById("btn-bot-save-version"), botCompareVersionsBtn: document.getElementById("btn-bot-compare-versions"),
  botGenerateSchemaBtn: document.getElementById("btn-bot-generate-schema"), botGeneratePromptBtn: document.getElementById("btn-bot-generate-prompt"), botCopySchemaBtn: document.getElementById("btn-bot-copy-schema"), botCopyPromptBtn: document.getElementById("btn-bot-copy-prompt"),
  botSchemaEditor: document.getElementById("bot-schema-editor"), botPromptEditor: document.getElementById("bot-prompt-editor"), botOutputStatus: document.getElementById("bot-output-status"), botVersionCompare: document.getElementById("bot-version-compare"), botIntegrationHints: document.getElementById("bot-integration-hints"), sessionNewBtn: document.getElementById("btn-new-session"), sessionCloseBtn: document.getElementById("btn-close-session"), sessionDate: document.getElementById("session-date"), sessionAsset: document.getElementById("session-asset"), sessionTf: document.getElementById("session-tf"), sessionNotes: document.getElementById("session-notes"), sessionCandleTime: document.getElementById("session-candle-time"), sessionCandleOpen: document.getElementById("session-candle-open"), sessionCandleHigh: document.getElementById("session-candle-high"), sessionCandleLow: document.getElementById("session-candle-low"), sessionCandleClose: document.getElementById("session-candle-close"), sessionAddCandleBtn: document.getElementById("btn-add-candle"), sessionClearCandleBtn: document.getElementById("btn-clear-candle"), sessionDuplicateOpenBtn: document.getElementById("btn-duplicate-open"), sessionActiveHeader: document.getElementById("session-active-header"), sessionSvg: document.getElementById("session-canvas"), sessionAnalysisPanel: document.getElementById("session-analysis-panel"), sessionSummary: document.getElementById("session-summary"), sessionCandleStatus: document.getElementById("session-candle-status"), sessionLivePlan: document.getElementById("session-live-plan"), sessionHumanInsightPanel: document.getElementById("session-human-insight-panel"), sessionHumanInsightClassification: document.getElementById("session-human-insight-classification"), sessionHumanInsightTags: document.getElementById("session-human-insight-tags"), sessionHumanInsightMeaning: document.getElementById("session-human-insight-meaning"), sessionHumanInsightExpectation: document.getElementById("session-human-insight-expectation"), sessionHumanInsightCondition: document.getElementById("session-human-insight-condition"), sessionHumanInsightDirection: document.getElementById("session-human-insight-direction"), sessionHumanInsightConfirmation: document.getElementById("session-human-insight-confirmation"), sessionHumanInsightSaveBtn: document.getElementById("btn-session-human-insight-save"), sessionHumanInsightSkipBtn: document.getElementById("btn-session-human-insight-skip"), sessionHumanInsightSummary: document.getElementById("session-human-insight-summary"), sessionCandlesBody: document.getElementById("session-candles-body"), pastSessions: document.getElementById("past-sessions"), sessionToggleOverlay: document.getElementById("session-toggle-overlay"), sessionToggleNarratives: document.getElementById("session-toggle-narratives"), sessionToggleNear: document.getElementById("session-toggle-near"), sessionToggleMetrics: document.getElementById("session-toggle-metrics"), sessionToggleReplay: document.getElementById("session-toggle-replay"), sessionPrevBtn: document.getElementById("btn-session-prev"), sessionNextBtn: document.getElementById("btn-session-next"), sessionPlayBtn: document.getElementById("btn-session-play"), sessionPauseBtn: document.getElementById("btn-session-pause"), sessionExportChatgptBtn: document.getElementById("btn-session-export-chatgpt"),
  mdSource: document.getElementById("md-source"), mdAsset: document.getElementById("md-asset"), mdTimeframe: document.getElementById("md-timeframe"), mdRange: document.getElementById("md-range"), mdLiveStatus: document.getElementById("md-live-status"), mdFetchBtn: document.getElementById("btn-md-fetch"), mdSyncBtn: document.getElementById("btn-md-sync"), mdImportBtn: document.getElementById("btn-md-import"), mdImportFile: document.getElementById("md-import-file"), mdExportBtn: document.getElementById("btn-md-export"), mdIntegrityBtn: document.getElementById("btn-md-integrity"), mdNeuronBtn: document.getElementById("btn-md-neurons"), mdBuildGraphBtn: document.getElementById("btn-md-build-graph"), mdDiscoverPatternsBtn: document.getElementById("btn-md-discover-patterns"), mdClearBtn: document.getElementById("btn-md-clear"), mdStatus: document.getElementById("md-status"), mdDiagnostics: document.getElementById("md-diagnostics"), mdNeuronSummary: document.getElementById("md-neuron-summary"), mdPatternSummary: document.getElementById("md-pattern-summary"), mdPatternBody: document.getElementById("md-pattern-body"), mdPatternDetails: document.getElementById("md-pattern-details"), mdGraphSummary: document.getElementById("md-graph-summary"), mdGraphContainer: document.getElementById("md-graph-container"), mdGraphDetails: document.getElementById("md-graph-details"), mdNeuronPreviewBody: document.getElementById("md-neuron-preview-body"), mdPreviewBody: document.getElementById("md-preview-body"), mdLiveShadowStatus: document.getElementById("md-live-shadow-status"), mdLiveShadowPolicy: document.getElementById("md-live-shadow-policy"), mdLiveShadowPending: document.getElementById("md-live-shadow-pending"), mdLiveShadowStats: document.getElementById("md-live-shadow-stats"), mdLiveShadowTimelineBody: document.getElementById("md-live-shadow-timeline-body"), mdLiveShadowDetail: document.getElementById("md-live-shadow-detail"), mdLiveShadowFilterSymbol: document.getElementById("md-live-shadow-filter-symbol"), mdLiveShadowFilterTimeframe: document.getElementById("md-live-shadow-filter-timeframe"), mdLiveShadowFilterAction: document.getElementById("md-live-shadow-filter-action"), mdLiveShadowFilterResult: document.getElementById("md-live-shadow-filter-result"), mdLiveShadowAutoIngest: document.getElementById("md-live-shadow-auto-ingest"), mdLiveShadowImportSelectedBtn: document.getElementById("btn-live-shadow-import-selected"), prSummary: document.getElementById("pr-summary"), prTableBody: document.getElementById("pr-table-body"), prInspect: document.getElementById("pr-inspect"), prPromoteBtn: document.getElementById("btn-pr-promote"), prRejectBtn: document.getElementById("btn-pr-reject"), prIgnoreBtn: document.getElementById("btn-pr-ignore"), prPromotedSummary: document.getElementById("pr-promoted-summary"), clusterMinEdge: document.getElementById("cluster-min-edge"), clusterMinEdgeValue: document.getElementById("cluster-min-edge-value"), clusterMinNode: document.getElementById("cluster-min-node"), clusterMinNodeValue: document.getElementById("cluster-min-node-value"), clusterSessionFilter: document.getElementById("cluster-session-filter"), clusterMapSummary: document.getElementById("cluster-map-summary"), clusterMapContainer: document.getElementById("cluster-map-container"), clusterMapInspector: document.getElementById("cluster-map-inspector"),
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
els.mdOperatorActions = document.getElementById("md-operator-actions");
els.mdOperatorNote = document.getElementById("md-operator-note");
els.mdOperatorRecalculateBtn = document.getElementById("btn-operator-recalculate");
els.mdOperatorFeedbackStatus = document.getElementById("md-operator-feedback-status");
els.mdLearningFeedback = document.getElementById("md-learning-feedback");
els.sessionOperatorActions = document.getElementById("session-operator-actions");
els.sessionOperatorNote = document.getElementById("session-operator-note");
els.sessionOperatorRecalculateBtn = document.getElementById("btn-session-operator-recalculate");
els.sessionOperatorFeedbackStatus = document.getElementById("session-operator-feedback-status");
els.sessionOperatorDecision = document.getElementById("session-operator-decision");
els.sessionCopilotFeedbackBlock = document.getElementById("session-copilot-feedback-block");
els.sessionBrainDashboard = document.getElementById("session-brain-dashboard");
els.copilotFeedbackPanel = document.getElementById("copilot-feedback-panel");
els.libraryJsonInput = document.getElementById("library-json-input");
els.libraryValidateBtn = document.getElementById("btn-library-validate");
els.librarySaveBtn = document.getElementById("btn-library-save");
els.libraryClearBtn = document.getElementById("btn-library-clear");
els.libraryLoadExampleBtn = document.getElementById("btn-library-load-example");
els.libraryInputStatus = document.getElementById("library-input-status");
els.libraryFilterType = document.getElementById("library-filter-type");
els.libraryFilterActive = document.getElementById("library-filter-active");
els.libraryFilterSearch = document.getElementById("library-filter-search");
els.libraryItemsBody = document.getElementById("library-items-body");
els.libraryDetailView = document.getElementById("library-detail-view");

els.slSymbol = document.getElementById("sl-symbol");
els.slTimeframe = document.getElementById("sl-timeframe");
els.slRangeBars = document.getElementById("sl-range-bars");
els.slStrategy = document.getElementById("sl-strategy");
els.slParams = document.getElementById("sl-params");
els.slJsonMode = document.getElementById("sl-json-mode");
els.slJsonStatus = document.getElementById("sl-json-status");
els.slDataStatus = document.getElementById("sl-data-status");
els.slLoadHistoryBtn = document.getElementById("btn-sl-load-history");
els.slRunNotes = document.getElementById("sl-run-notes");
els.slRunBtn = document.getElementById("btn-sl-run");
els.slSaveBtn = document.getElementById("btn-sl-save");
els.slLoadBtn = document.getElementById("btn-sl-load");
els.slApproveBtn = document.getElementById("btn-sl-approve");
els.slStatus = document.getElementById("sl-status");
els.slApprovedStatus = document.getElementById("sl-approved-status");
els.slMetrics = document.getElementById("sl-metrics");
els.slRunsBody = document.getElementById("sl-runs-body");
els.slTradesBody = document.getElementById("sl-trades-body");
els.slScoreBullMin = document.getElementById("sl-score-bull-min");
els.slScoreBearMin = document.getElementById("sl-score-bear-min");
els.slVersion = document.getElementById("sl-version");
els.slVersionStatus = document.getElementById("sl-version-status");
els.slVersionLineage = document.getElementById("sl-version-lineage");
els.slValidateBtn = document.getElementById("btn-sl-validate");
els.slPromoteLiveBtn = document.getElementById("btn-sl-promote-live");
els.slCloneDegradingBtn = document.getElementById("btn-sl-clone-degrading");
els.slValidationBody = document.getElementById("sl-validation-body");
els.slLiveBody = document.getElementById("sl-live-body");
els.strategyLifecycleWrap = document.getElementById("strategy-lifecycle-wrap");
els.sessionEventStrip = document.getElementById("session-event-strip");
els.sessionToggleStructure = document.getElementById("session-toggle-structure");
els.sessionToggleMa = document.getElementById("session-toggle-ma");
els.sessionToggleLiveAnnotations = document.getElementById("session-toggle-live-annotations");
els.sessionWindowSize = document.getElementById("session-window-size");
els.sessionScenarioCard = document.getElementById("session-scenario-card");
els.sessionScenarioSummary = document.getElementById("session-scenario-summary");
els.sessionScenarioAcceptBtn = document.getElementById("btn-scenario-accept");
els.sessionScenarioRejectBtn = document.getElementById("btn-scenario-reject");
els.sessionScenarioInterestingBtn = document.getElementById("btn-scenario-interesting");
els.sessionScenarioFollowSelect = document.getElementById("session-scenario-follow-select");

const compareFilters = { asset: "", direction: "", timeframe: "", rangeMode: "all", rangeValue: 30, nearSupport: "", nearResistance: "" };
const radarFilters = { asset: "", direction: "", patternName: "", timeframe: "", rangeMode: "24h", rangeValue: 25 };
const noteFilters = { search: "", tag: "", patternName: "", asset: "" };
const journalTradeFilters = { status: "", direction: "", source: "", setup: "", search: "" };
const forwardConfig = { splitMode: "ratio", ratio: 0.7, splitDate: "" };
let statsFilters = { source: "", strategyId: "", versionId: "", symbol: "", timeframe: "" };
let notes = [];
let journalTrades = [];
let selectedJournalTradeId = "";
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
let _sessionChart = null; // SessionChart Canvas instance
const SESSION_DRAWINGS_KEY = "patternlab.sessionDrawings.v1";
const SESSION_SR_KEY_LEGACY = "patternlab.sessionManualSR.v1";
const SESSION_HUMAN_INSIGHTS_KEY = "patternlab.sessionHumanInsights.v1";
let _sessionManualSR = []; // [{id,price,type,label}]
let _sessionHumanInsights = [];
let _sessionTriggerLines = [];
let _sessionTriggerEvaluation = { activeTriggerEffects: [], aggregateEffect: {}, summaryText: "Trigger lines idle." };
let _lastCopilotEvaluation = null;
let _lastCopilotEffects = null;
let _lastBrainVerdict = null;
let microBotTab = null;
let sessionReviewerTab = null;
let geminiBotController = null;
let manualControlsState = getManualControls();
const brainMemoryStore = createBrainMemoryStore();
const brainModeController = createBrainModeController({ mode: "executor", autoExecutionEnabled: true });
const brainTradeJournal = createBrainTradeJournal([], {
  onChange: (rows = []) => {
    journalTrades = Array.isArray(rows) ? rows : [];
    saveJournalTrades(journalTrades).catch((error) => console.error("[Storage] saveJournalTrades failed", error));
    refreshJournalTrades();
  },
});
const executorStateStore = createExecutorStateStore({
  enabled: true,
  mode: "paper",
  autoArm: true,
  cooldownCandles: 1,
  learningProfile: {
    profile: "aggressive_learning",
    enabled: true,
    paper_only: true,
    exploration_mode: true,
    exploration_bias: 0.7,
    exploitation_bias: 0.3,
    allow_trade_on_wait_in_paper: true,
    allow_high_danger_exploration: true,
    allow_low_confidence_exploration: true,
    min_samples_before_strict_block: 10,
    min_samples_before_context_maturity: 20,
    friction_block_live_only: true,
    danger_block_live_only: true,
    max_exploratory_trades_per_context: 5,
    max_consecutive_losses_before_context_pause: 3,
    context_pause_candles: 5,
    cooldown_candles: 1,
    one_trade_per_candle: true,
    one_active_trade_max: true,
    exploration_entry_quality_floor: "C",
    exploration_requires_trigger: true,
    exploration_requires_invalidation: true,
  },
});
const tradeOutcomeLogger = createTradeOutcomeLogger({ brainMemoryStore, brainTradeJournal });
const brainLearningUpdater = createBrainLearningUpdater({ brainMemoryStore });
let learningProgressPacket = computeLearningProgressPacket({ memorySnapshot: brainMemoryStore.getSnapshot(), tradeJournalRows: brainTradeJournal.getAll() });

let sessionHumanInsightDraft = null;
let sessionAnalystState = { analystData: null, addedLevels: [], collapsed: false };
let scenarioProjectionState = {
  activeSet: null,
  lastContextSignature: "",
  lastCreationCandleTs: null,
  humanSelection: { action: "none", override: "none", followedScenarioId: null },
  dashboardSnapshot: null,
};
const sessionAnalysisConfig = getDefaultSessionAnalysisConfig();
const SESSION_PREFS_KEY = "patternlab.sessionAnalysisPrefs.v2";
const ASSISTED_REINFORCEMENT_HISTORY_KEY = "localStorage.patternlab.reinforcementHistory";
const ASSISTED_UI_STATE_KEY = "sessionStorage.patternlab.assistedUiState.v1";
let sessionAnalysisPrefs = {
  showOverlay: true,
  showNarratives: true,
  showNear: true,
  showMetrics: true,
  replayMode: false,
  showStructure: true,
  showMa: true,
  showLiveAnnotations: true,
  showScenarioProjection: true,
  windowSize: 80,
};

let robustnessState = { overfit: null, stress: null, monteCarlo: { simulations: 0, insight: "Ejecuta simulación para ver resultados." }, summary: null };
let pendingMemoryImport = null;
let storageStatus = null;
let assistedReinforcementState = {
  lastSummary: null,
  history: [],
  lastAppliedAt: null,
};
let assistedUiState = {
  reinforcementInput: "",
  reinforcementValid: false,
  reinforcementError: "",
  syntheticInput: "",
  syntheticValid: false,
  syntheticError: "",
  syntheticLastImportAt: null,
};

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
let liveShadowAutoIngest = true;
let liveShadowStats = computeLiveShadowStats([]);
let liveShadowSelectedId = "";
let executionControlState = { ...DEFAULT_EXECUTION_CONTROL_STATE };
const BRAIN_LIVE_GATE = { minPaperTrades: 30, minPaperWinRate: 0.55, minLearnedContexts: 12, minScenarioReliability: 0.52 };

function evaluateExecutorLiveGate(progress = learningProgressPacket, controlState = executionControlState) {
  const reasons = [];
  if (Number(progress?.tradesLearned || 0) < BRAIN_LIVE_GATE.minPaperTrades) reasons.push(`Needs at least ${BRAIN_LIVE_GATE.minPaperTrades} paper trades.`);
  if (Number(progress?.executorPaperWinRate || 0) < BRAIN_LIVE_GATE.minPaperWinRate) reasons.push(`Paper win rate below ${(BRAIN_LIVE_GATE.minPaperWinRate * 100).toFixed(0)}%.`);
  if (Number(progress?.learnedContexts || 0) < BRAIN_LIVE_GATE.minLearnedContexts) reasons.push(`Needs at least ${BRAIN_LIVE_GATE.minLearnedContexts} learned contexts.`);
  if (Number(progress?.scenarioReliability || 0) < BRAIN_LIVE_GATE.minScenarioReliability) reasons.push(`Scenario reliability below ${(BRAIN_LIVE_GATE.minScenarioReliability * 100).toFixed(0)}%.`);
  if (controlState?.manualConfirmationRequired !== false) reasons.push("Manual confirmation must be explicitly disabled for live mode.");
  return { allowed: reasons.length === 0, reasons };
}

const brainExecutor = createBrainExecutor({
  stateStore: executorStateStore,
  brainMemoryStore,
  outcomeLogger: tradeOutcomeLogger,
  brainTradeJournal,
  learningUpdater: brainLearningUpdater,
  getExecutionPacket: () => getExecutionPacket(executionControlState),
  getLearningProgress: () => learningProgressPacket,
  liveGateEvaluator: () => evaluateExecutorLiveGate(),
});

const OPERATOR_FEEDBACK_ACTIONS = getOperatorActions();
let sessionOperatorState = createSessionOperatorState();
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
let libraryItems = [];
let selectedLibraryItemId = "";
const libraryFilters = { type: "", active: "all", search: "" };
let libraryInputLastValidation = null;
let latestLibraryResolution = { matches: [], warnings: [], lessons: [], biasHints: [] };
let strategyRuns = [];
let strategyLifecycleState = normalizeLifecycleState();
let selectedStrategyVersionId = "";
let latestStrategyResult = null;
let latestStrategyBatchResults = [];
let selectedStrategyRunId = "";
let strategyLabJsonMode = "parameters";
let strategyLabConfig = { strategyId: "sma_rsi_trend", params: {}, risk: {}, execution: { feeBps: 4, slippageBps: 2, initialEquity: 10000 } };
let strategyLabRlProbe = null;
let strategyLabCandles = [];
let strategyLabDataState = { loading: false, lastLoadedCount: 0, lastLoadedSymbol: "", lastLoadedTimeframe: "", lastLoadedAt: null, error: "" };

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
    <li><span>Strategy Runs</span><strong>${counts.strategyRuns || 0}</strong></li>
    <li><span>Synthetic Trades</span><strong>${counts.syntheticTrades || 0}</strong></li>
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
      showStructure: parsed?.showStructure !== false,
      showMa: parsed?.showMa !== false,
      showLiveAnnotations: parsed?.showLiveAnnotations !== false,
      showScenarioProjection: parsed?.showScenarioProjection !== false,
      windowSize: [40, 60, 80, 120].includes(Number(parsed?.windowSize)) ? Number(parsed.windowSize) : 80,
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
  if (els.sessionToggleStructure) els.sessionToggleStructure.checked = sessionAnalysisPrefs.showStructure;
  if (els.sessionToggleMa) els.sessionToggleMa.checked = sessionAnalysisPrefs.showMa;
  if (els.sessionToggleLiveAnnotations) els.sessionToggleLiveAnnotations.checked = sessionAnalysisPrefs.showLiveAnnotations;
  if (els.sessionWindowSize) els.sessionWindowSize.value = String(sessionAnalysisPrefs.windowSize || 80);
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

function hasManualLevel(price, type) {
  const p = Number(price);
  if (!Number.isFinite(p)) return false;
  return _sessionManualSR.some((line) => {
    const role = line.structureRole || line.type;
    return role === type && Math.abs(Number(line.price) - p) <= Math.max(Math.abs(p) * 0.0002, 1e-9);
  });
}

function addManualLevel({ price, type, source = "analyst_auto", confirmedBy = "operator" }) {
  const p = Number(price);
  if (!Number.isFinite(p)) return false;
  if (hasManualLevel(p, type)) return false;
  const id = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marketView = getSessionMarketView();
  const anchor = marketView?.candles?.[marketView.candles.length - 1];
  const anchorTime = Number(anchor?.timestamp ?? anchor?.index ?? Date.now());
  const line = {
    id,
    type: "horizontal_line",
    points: [{ time: anchorTime, price: Number(p.toFixed(6)) }],
    price: Number(p.toFixed(6)),
    label: type === "support" ? "S" : "R",
    extra: { channelOffset: null },
    source,
    confirmedBy,
    metadata: {
      symbol: marketView?.symbol || "UNKNOWN",
      timeframe: marketView?.timeframe || "UNKNOWN",
      createdAt: new Date().toISOString(),
      source: "operator_manual",
      active: true,
    },
    structureRole: type === "support" ? "support" : "resistance",
  };
  _sessionManualSR = [..._sessionManualSR, line];
  sessionAnalystState.addedLevels = [...sessionAnalystState.addedLevels, line];
  try { localStorage.setItem(SESSION_DRAWINGS_KEY, JSON.stringify(_sessionManualSR)); } catch {}
  if (_sessionChart) _sessionChart.setManualSR(_sessionManualSR);
  console.debug("[SessionAnalyst] + chart level added", line);
  return true;
}

function getHumanInsightContext(analysis, marketView) {
  const overlays = analysis?.overlays || {};
  const currentPrice = Number(overlays.currentPrice ?? marketView?.candles?.[marketView.candles.length - 1]?.close);
  const breakoutState = overlays.structureSummary?.breakState === "breakout" ? "break" : overlays.structureSummary?.breakState === "rejection" ? "fail" : "none";
  const momentumStrength = Number(analysis?.pseudoMl?.regime?.strength || 0) / 100;
  const followthroughStrength = Number(analysis?.pseudoMl?.probability?.confidence || 0);
  const rejectionWick = /wick|reject/i.test(String(analysis?.pushState || "")) || breakoutState === "fail";
  const candles = marketView?.candles || [];
  const currentCandle = candles[candles.length - 1] || null;
  const previousCandle = candles[candles.length - 2] || null;
  return {
    currentPrice,
    breakoutState,
    momentumStrength,
    followthroughStrength,
    rejectionWick,
    hasConfirmation: followthroughStrength >= 0.62,
    drawings: _sessionManualSR,
    candles,
    currentCandle,
    previousCandle,
  };
}

function getSessionDrawingIds() {
  return (Array.isArray(_sessionManualSR) ? _sessionManualSR : []).map((line) => line.id).filter(Boolean);
}

function normalizeStoredSessionDrawings(rows = [], marketView = null) {
  const anchor = marketView?.candles?.[marketView.candles.length - 1];
  const anchorTime = Number(anchor?.timestamp ?? anchor?.index ?? Date.now());
  return (Array.isArray(rows) ? rows : []).map((line) => {
    if (Array.isArray(line?.points) && line.points.length) return line;
    const price = Number(line?.price);
    return {
      id: line?.id || `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "horizontal_line",
      points: [{ time: anchorTime, price: Number.isFinite(price) ? price : 0 }],
      price: Number.isFinite(price) ? price : 0,
      extra: { channelOffset: null },
      label: line?.label || "H",
      structureRole: line?.type === "support" ? "support" : line?.type === "resistance" ? "resistance" : line?.structureRole,
      metadata: {
        symbol: line?.metadata?.symbol || marketView?.symbol || "UNKNOWN",
        timeframe: line?.metadata?.timeframe || marketView?.timeframe || "UNKNOWN",
        createdAt: line?.metadata?.createdAt || new Date().toISOString(),
        source: "operator_manual",
        active: true,
      },
    };
  }).filter((line) => Number.isFinite(Number(line?.price)));
}

function openTriggerSetupForm(drawing = {}) {
  const isFailedBreakoutShort = window.confirm("Trigger setup preset: Failed breakout -> short bias? (OK = yes, Cancel = custom)");
  if (isFailedBreakoutShort) {
    return {
      role: "failed_breakout_trigger",
      condition: "if_not_break",
      biasOnTrigger: "short",
      importance: "high",
      confirmationMode: "candle_close",
      note: "Failed breakout trigger active -> short bias",
    };
  }
  const roleInput = window.prompt("Trigger role: breakout_confirmation | failed_breakout_trigger | rejection_trigger | invalidation_line", "failed_breakout_trigger");
  const conditionInput = window.prompt("Condition: if_break | if_not_break | if_rejects | if_stays_below | if_stays_above", "if_not_break");
  const biasInput = window.prompt("Bias on trigger: long | short | neutral", "short");
  const importanceInput = window.prompt("Importance: low | medium | high", "medium");
  const confirmationInput = window.prompt("Confirmation mode: immediate | candle_close | follow_through", "candle_close");
  const noteInput = window.prompt("Optional note", drawing?.label === "Trigger" ? "Trigger level from chart" : "");
  return {
    role: String(roleInput || "failed_breakout_trigger").trim(),
    condition: String(conditionInput || "if_not_break").trim(),
    biasOnTrigger: String(biasInput || "short").trim(),
    importance: String(importanceInput || "medium").trim(),
    confirmationMode: String(confirmationInput || "candle_close").trim(),
    note: String(noteInput || "").trim(),
  };
}

function syncTriggerRuntimeState(evaluation = null) {
  if (!evaluation?.activeTriggerEffects?.length) return;
  evaluation.activeTriggerEffects.forEach((row) => {
    const target = _sessionTriggerLines.find((line) => line.id === row.triggerLineId);
    if (!target) return;
    updateTriggerLine(row.triggerLineId, {
      runtimeState: {
        status: row.status,
        lastEvaluation: new Date().toISOString(),
        lastReason: row.summaryText,
      },
    });
  });
}

function persistSessionHumanInsights() {
  try { localStorage.setItem(SESSION_HUMAN_INSIGHTS_KEY, JSON.stringify(_sessionHumanInsights)); } catch {}
}

function reconcileSessionHumanInsightState({ reason = "sync", keepOrphaned = true } = {}) {
  const marketView = getSessionMarketView();
  _sessionHumanInsights = reconcileHumanInsights(_sessionHumanInsights, {
    drawingIds: getSessionDrawingIds(),
    symbol: marketView.symbol,
    timeframe: marketView.timeframe,
    keepOrphaned,
  });
  sessionOperatorState.humanInsights = [..._sessionHumanInsights];
  persistSessionHumanInsights();
  if (reason) {
    console.debug("Human insight restored from storage", {
      reason,
      totalInsights: _sessionHumanInsights.length,
      orphaned: _sessionHumanInsights.filter((insight) => insight?.metadata?.isOrphaned).length,
    });
  }
}

function evaluateSessionHumanInsights({ analysis = null, marketView = null, reason = "update" } = {}) {
  if (!analysis || !marketView) return null;
  const evaluation = evaluateHumanInsights(_sessionHumanInsights, getHumanInsightContext(analysis, marketView));
  sessionOperatorState.activeHumanInsightEffects = evaluation.effects;
  sessionOperatorState.humanInsights = [..._sessionHumanInsights];
  console.debug("Insight evaluated", {
    insightId: evaluation.activeInsights?.[0]?.id || null,
    drawingId: evaluation.activeInsights?.[0]?.linkedDrawingId || null,
    conditionType: evaluation.activeInsights?.[0]?.condition?.type || null,
    directionBias: evaluation.activeInsights?.[0]?.condition?.directionBias || null,
    activationResult: (evaluation.activeInsights || []).length > 0,
    effectSummary: evaluation.summaryText,
    reason,
  });
  return evaluation;
}

function buildHumanInsightOperatorModifier(machineSignal = {}, humanEvaluation = { effects: {} }) {
  const effects = humanEvaluation.effects || {};
  const direction = String(machineSignal.direction || "NONE").toUpperCase();
  let modifierScore = 0;
  if (direction === "LONG") modifierScore = Number(effects.longModifier || 0) + Math.min(0, Number(effects.shortModifier || 0) * 0.5);
  if (direction === "SHORT") modifierScore = Number(effects.shortModifier || 0) + Math.min(0, Number(effects.longModifier || 0) * 0.5);
  modifierScore = Math.max(-0.45, Math.min(0.45, modifierScore));

  let effectOnDecision = "none";
  if ((direction === "LONG" && effects.blockLong) || (direction === "SHORT" && effects.blockShort)) effectOnDecision = "block";
  else if (effects.requireConfirmation) effectOnDecision = "require_confirmation";
  else if (modifierScore >= 0.2) effectOnDecision = "boost_confidence";
  else if (modifierScore <= -0.12) effectOnDecision = "soft_warn";

  if (Math.abs(modifierScore) > 0.01 || effectOnDecision !== "none") {
    console.debug("Drawing affected decision", { modifierScore, effectOnDecision, direction, summaryText: humanEvaluation.summaryText });
  }

  return {
    modifierScore: Number(modifierScore.toFixed(4)),
    effectOnDecision,
    summaryText: humanEvaluation.summaryText || "Human insight layer idle.",
  };
}

function renderHumanInsightSummary() {
  if (!els.sessionHumanInsightSummary) return;
  if (!_sessionHumanInsights.length) {
    els.sessionHumanInsightSummary.innerHTML = '<p class="muted tiny">No human insights saved yet. Draw a line and attach one.</p>';
    return;
  }
  els.sessionHumanInsightSummary.innerHTML = _sessionHumanInsights.slice(-5).reverse().map((insight) => `
    <div class="tiny ${sessionOperatorState.selectedDrawingId === insight.linkedDrawingId ? "session-insight-selected" : ""}">
      <span class="badge">${insight.insightType}</span>
      <span class="badge">${insight.condition?.type}/${insight.condition?.directionBias}</span>
      <span class="badge">${insight.metadata?.isOrphaned ? "orphaned" : `line:${insight.linkedDrawingId || "-"}`}</span>
      ${sessionOperatorState.selectedDrawingId === insight.linkedDrawingId ? '<span class="badge v3-session">selected drawing</span>' : ""}
      <span class="muted">${insight.metadata?.symbol || "-"} ${insight.metadata?.timeframe || "-"} · ${new Date(insight.metadata?.createdAt || Date.now()).toLocaleTimeString()}</span>
    </div>
  `).join("");
}

function renderHumanInsightDraftPanel() {
  if (!els.sessionHumanInsightPanel) return;
  const draft = sessionHumanInsightDraft;
  sessionOperatorState.humanInsightDraft = draft || null;
  if (!draft) {
    els.sessionHumanInsightPanel.classList.add("hidden");
    return;
  }
  els.sessionHumanInsightPanel.classList.remove("hidden");
  if (els.sessionHumanInsightClassification) {
    const label = draft.classification?.label || "manual level";
    els.sessionHumanInsightClassification.textContent = `This looks like: ${label}`;
  }
  if (els.sessionHumanInsightMeaning) els.sessionHumanInsightMeaning.value = draft.meaningSelection || "resistance";
  if (els.sessionHumanInsightExpectation) els.sessionHumanInsightExpectation.value = draft.expectationSelection || "rejection";
  if (els.sessionHumanInsightCondition) els.sessionHumanInsightCondition.value = draft.conditionSelection || "if_fail_reverse";
  if (els.sessionHumanInsightDirection) els.sessionHumanInsightDirection.value = draft.directionBias || "short";
  if (els.sessionHumanInsightConfirmation) els.sessionHumanInsightConfirmation.checked = Boolean(draft.requireConfirmation);
  if (els.sessionHumanInsightTags) {
    els.sessionHumanInsightTags.querySelectorAll("[data-human-tag]").forEach((btn) => {
      btn.classList.toggle("operator-action-active", (draft.selectedTags || []).includes(btn.dataset.humanTag));
    });
  }
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

function getSessionMarketView() {
  const source = getSelectedMarketDataSource();
  const symbol = getSelectedMarketDataSymbol();
  const timeframe = getSelectedMarketDataTimeframe();
  const rows = (marketDataCandles || [])
    .filter((row) => {
      const rowSymbol = row.symbol || row.asset || marketDataMeta?.selectedSymbol;
      const rowTf = row.timeframe || marketDataMeta?.selectedTimeframe;
      const rowSource = row.source || marketDataMeta?.source;
      return rowSymbol === symbol && rowTf === timeframe && rowSource === source;
    })
    .slice(-Math.max(30, Number(sessionAnalysisPrefs.windowSize || 80)))
    .map((row, index) => ({
      index: index + 1,
      timestamp: row.timestamp,
      timeLabel: new Date(row.timestamp).toLocaleTimeString(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      closed: row.closed !== false,
    }));
  const liveStatus = marketDataMeta?.liveStatus || {};
  return {
    source,
    symbol,
    timeframe,
    candles: rows,
    connected: Boolean(liveStatus.connected),
    openCandle: marketDataOpenCandle && (marketDataOpenCandle.symbol || marketDataMeta?.selectedSymbol) === symbol && (marketDataOpenCandle.timeframe || marketDataMeta?.selectedTimeframe) === timeframe
      ? marketDataOpenCandle
      : null,
  };
}

function renderSessionMarketAnalysisPanel(analysis, marketView) {
  if (!els.sessionAnalysisPanel) return;
  if (!analysis || !analysis.candleCount) {
    els.sessionAnalysisPanel.innerHTML = '<p class="muted">Load market candles to activate the live analyst workspace.</p>';
    return;
  }
  const policy = liveShadowMonitor.getRecords().find((row) => row.symbol === marketView.symbol && row.timeframe === marketView.timeframe) || null;
  const policyAction = policy?.policy?.action || "NO_TRADE";
  const policyConfidence = formatConfidence(policy?.policy?.confidence || 0);
  const pendingAgainstPlan = policy?.outcome?.status === "pending"
    ? ((policyAction === "LONG" && analysis.overlays.currentPrice < policy.plan.referencePrice) || (policyAction === "SHORT" && analysis.overlays.currentPrice > policy.plan.referencePrice))
    : null;
  els.sessionAnalysisPanel.innerHTML = `
    <div class="session-analysis-header">
      <h3>${analysis.symbol} · ${analysis.timeframe} · ${analysis.source}</h3>
      <span class="badge session-state ${analysis.bias === "bullish" ? "call" : analysis.bias === "bearish" ? "put" : "none"}">${analysis.bias.toUpperCase()}</span>
    </div>
    <div class="session-analysis-grid">
      <div class="cell"><strong>Last candle</strong><p class="muted tiny">${analysis.lastCandleSummary}</p></div>
      <div class="cell"><strong>Volatility</strong><p class="muted tiny">${analysis.volatilityCondition}</p></div>
      <div class="cell"><strong>Momentum</strong><p class="muted tiny">${analysis.momentumCondition}</p></div>
      <div class="cell"><strong>Price behavior</strong><p class="muted tiny">${analysis.pushState}</p></div>
      <div class="cell"><strong>Latest candle effect</strong><p class="muted tiny">${analysis.latestConfirmsMove ? "confirms recent move" : "weakens/does not confirm"}</p></div>
      <div class="cell"><strong>Continuation context</strong><p class="muted tiny">${analysis.continuationContext}</p></div>
    </div>
    <div class="session-analysis-tags">
      <span class="badge">Policy: ${policyAction}</span>
      <span class="badge">Confidence: ${policyConfidence}</span>
      ${analysis.pseudoMl?.regime ? `<span class="badge">Market: ${analysis.pseudoMl.regime.regime} (${formatNumber(analysis.pseudoMl.regime.strength, 0)})</span>` : ""}
      ${analysis.pseudoMl?.probability ? `<span class="badge">Bull ${formatNumber(analysis.pseudoMl.probability.bullishScore, 1)} / Bear ${formatNumber(analysis.pseudoMl.probability.bearishScore, 1)}</span><span class="badge">Bias ${analysis.pseudoMl.probability.bias} · conf ${formatNumber(analysis.pseudoMl.probability.confidence, 1)}</span>` : ""}
      ${pendingAgainstPlan !== null ? `<span class="badge">${pendingAgainstPlan ? "Against shadow plan" : "Aligned with shadow plan"}</span>` : ""}
      ${(policy?.policy?.thesisTags || []).slice(0, 3).map((tag) => `<span class="badge">${tag}</span>`).join("")}
      ${analysis.overlays?.structureSummary ? `<span class="badge">Structure ${analysis.overlays.structureSummary.bias}/${analysis.overlays.structureSummary.breakState}</span><span class="badge">SQ ${formatNumber(analysis.overlays.structureSummary.supportQuality, 0)} · RQ ${formatNumber(analysis.overlays.structureSummary.resistanceQuality, 0)}</span><span class="badge">TP room ${formatNumber(analysis.overlays.structureSummary.roomForTp, 0)}</span><span class="badge">Entry ${formatNumber(analysis.overlays.structureSummary.entryQuality, 0)}</span>` : ""}
    </div>
    <div class="session-analysis-block">
      <h4>Market reading</h4>
      <ul class="mini-list">${analysis.observations.map((item) => `<li><span>${item}</span></li>`).join("")}</ul>
    </div>
  `;
}

function renderSessionAlwaysOnAnalystPanel({ viewed, marketView, latestPolicy }) {
  if (!els.sessionAnalysisPanel) return;
  const manualCandles = viewed?.candles || [];
  const sourceCandles = marketView?.candles?.length >= 3 ? marketView.candles : manualCandles;
  if (!sourceCandles.length || sourceCandles.length < 3) {
    sessionAnalystState.analystData = null;
    els.sessionAnalysisPanel.innerHTML = '<p class="muted">Always-On Analyst activates when sessionCandles.length >= 3.</p>';
    return;
  }

  const policyMode = latestPolicy?.policy?.versionId || latestPolicy?.policy?.policyMode || (marketView?.connected ? "live_v1" : "manual_session");
  const analystData = analyzeSessionCandles(sourceCandles, { policyMode });
  sessionAnalystState.analystData = analystData;
  console.debug("[SessionAnalyst] Analyst activated", { candles: sourceCandles.length, trend: analystData.trend, score: analystData.globalScore });
  if ((analystData.patterns || []).length) console.debug("[SessionAnalyst] Patterns detected", analystData.patterns);
  if ((analystData.zones || []).length) console.debug("[SessionAnalyst] Zones detected", analystData.zones);
  if (analystData.divergence) console.debug("[SessionAnalyst] Divergence detected", analystData.divergence);

  renderAnalystPanel({
    container: els.sessionAnalysisPanel,
    symbol: viewed?.asset || marketView?.symbol || "-",
    timeframe: viewed?.tf || marketView?.timeframe || "5m",
    data: analystData,
    collapsed: sessionAnalystState.collapsed,
    addedLevels: _sessionManualSR,
    onToggle: () => {
      sessionAnalystState.collapsed = !sessionAnalystState.collapsed;
      renderSessionAlwaysOnAnalystPanel({ viewed, marketView, latestPolicy });
    },
    onAddToChart: (zone) => {
      const ok = addManualLevel({
        price: zone.price,
        type: zone.type,
        source: "analyst_auto",
        confirmedBy: "operator",
      });
      if (ok) refreshSessionCandlesTab();
    },
  });
}

function renderSessionEventStrip(events = []) {
  if (!els.sessionEventStrip) return;
  if (!sessionAnalysisPrefs.showLiveAnnotations) {
    els.sessionEventStrip.innerHTML = '<span class="muted tiny">Live annotations hidden.</span>';
    return;
  }
  if (!events.length) {
    els.sessionEventStrip.innerHTML = '<span class="muted tiny">No recent market events.</span>';
    return;
  }
  els.sessionEventStrip.innerHTML = events.map((event) => `<span class="session-event-chip ${event.type || ""}">${event.label}</span>`).join("");
}

function resolveLivePlanStatus(record) {
  if (!record) return "pending";
  if (record.outcome?.status === "pending") return "pending";
  if (record.policy?.action === "NO_TRADE") return "skipped";
  const result = String(record.outcome?.result || "").toLowerCase();
  if (result === "win") return "win";
  if (result === "loss") return "loss";
  return "skipped";
}

function getSessionLivePlanRecord(marketView) {
  const rows = liveShadowMonitor.getRecords()
    .filter((row) => row.symbol === marketView.symbol && row.timeframe === marketView.timeframe && ["LONG", "SHORT"].includes(row.policy?.action))
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return rows.find((row) => row.outcome?.status === "pending") || rows[0] || null;
}

function renderSessionLivePlanPanel(record, marketView) {
  if (!els.sessionLivePlan) return;
  if (!record) {
    els.sessionLivePlan.innerHTML = `No active live trade plan for ${marketView.symbol} ${marketView.timeframe}.`;
    return;
  }
  const status = resolveLivePlanStatus(record);
  const confidenceText = typeof record.policy?.confidence === "number" ? formatConfidence(record.policy.confidence) : "-";
  els.sessionLivePlan.innerHTML = `
    <div class="session-live-plan-head">
      <span class="badge ${record.policy?.action === "LONG" ? "call" : "put"}">${record.policy?.action}</span>
      <span class="badge ${getOutcomeBadgeClass(status)}">${status}</span>
      <span class="badge">Entry ${formatNumber(record.plan?.referencePrice, 4)}</span>
      <span class="badge">SL ${formatNumber(record.plan?.stopLoss, 4)}</span>
      <span class="badge">TP ${formatNumber(record.plan?.takeProfit, 4)}</span>
      <span class="badge">Confidence ${confidenceText}</span>
    </div>
    <p class="muted tiny">${record.policy?.strategyName || "Live Shadow Policy"} · ${formatTs(record.timestamp)} · ${(record.policy?.reason || "No thesis text").slice(0, 160)}</p>
    <p class="muted tiny">${(record.policy?.thesisTags || []).slice(0, 4).map((tag) => `#${tag}`).join(" ")}</p>
  `;
}

function inferChartDecimals(candles) {
  const sample = (candles || []).map(c => c.close).filter(Number.isFinite).slice(0, 10);
  if (!sample.length) return 4;
  const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
  if (avg > 5000) return 1;
  if (avg > 100)  return 2;
  if (avg > 1)    return 4;
  return 5;
}

function drawSessionCandles(session, explanations = [], marketAnalysis = null, livePlanRecord = null) {
  if (!els.sessionSvg) return;
  const marketRows = marketAnalysis?.marketView?.candles || [];
  const useMarket  = marketRows.length > 0;
  const candles    = useMarket ? marketRows : (session?.candles || []);

  // Boot or re-use the Canvas chart instance
  if (!_sessionChart) {
    _sessionChart = new SessionChart(els.sessionSvg, {
      onCandleClick: (idx) => {
        selectedSessionCandleIndex = idx;
        refreshSessionCandlesTab();
      },
      onSRChange: (lines, eventMeta = null) => {
        _sessionManualSR = lines;
        try { localStorage.setItem(SESSION_DRAWINGS_KEY, JSON.stringify(lines)); } catch {}
        if (eventMeta?.type === "created" && eventMeta.line) {
          console.debug("Drawing completed", {
            drawingId: eventMeta.line.id,
            type: eventMeta.line.type,
            points: eventMeta.line.points || [],
            symbol: eventMeta.line?.metadata?.symbol || null,
            timeframe: eventMeta.line?.metadata?.timeframe || null,
          });
          const marketView = getSessionMarketView();
          sessionHumanInsightDraft = createHumanInsightDraft({
            drawing: eventMeta.line,
            symbol: marketView.symbol,
            timeframe: marketView.timeframe,
          });
          sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
          sessionOperatorState.selectedDrawingId = eventMeta.line.id;
          console.debug("Human Insight draft opened for drawing", {
            insightId: sessionHumanInsightDraft.id,
            drawingId: eventMeta.line.id,
            conditionType: sessionHumanInsightDraft.conditionSelection,
            directionBias: sessionHumanInsightDraft.directionBias,
            activationResult: false,
            effectSummary: `draft_created:${sessionHumanInsightDraft.classification?.label || "manual"}`,
          });
          renderHumanInsightDraftPanel();
          if (eventMeta.line.type === "trigger_line") {
            const formData = openTriggerSetupForm(eventMeta.line);
            const createdTrigger = createTriggerLineFromDrawing(eventMeta.line, formData);
            if (createdTrigger) {
              _sessionTriggerLines = saveTriggerLines([...
                _sessionTriggerLines.filter((row) => row.linkedDrawingId !== createdTrigger.linkedDrawingId),
                createdTrigger,
              ]);
              setSessionOperatorFeedbackStatus(`Trigger line created @ ${Number(createdTrigger.level).toFixed(2)} (${createdTrigger.triggerConfig.condition} -> ${createdTrigger.triggerConfig.biasOnTrigger}).`, "success");
            }
          }
        } else if (eventMeta?.type === "removed" && eventMeta.lineId) {
          _sessionHumanInsights = _sessionHumanInsights.filter((insight) => insight.linkedDrawingId !== eventMeta.lineId);
          if (deleteTriggerLineByDrawingId(eventMeta.lineId)) {
            _sessionTriggerLines = loadTriggerLines();
          }
          if (sessionHumanInsightDraft?.drawing?.id === eventMeta.lineId) sessionHumanInsightDraft = null;
          sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
          if (sessionOperatorState.selectedDrawingId === eventMeta.lineId) sessionOperatorState.selectedDrawingId = null;
          reconcileSessionHumanInsightState({ reason: "drawing_removed", keepOrphaned: true });
          console.debug("Drawing deleted", {
            insightId: null,
            drawingId: eventMeta.lineId,
            conditionType: null,
            directionBias: null,
            activationResult: false,
            effectSummary: "linked_insights_removed",
          });
          refreshSessionCandlesTab();
          renderHumanInsightSummary();
        } else if (eventMeta?.type === "cleared") {
          const removedIds = Array.isArray(eventMeta.lineIds) ? eventMeta.lineIds : [];
          _sessionHumanInsights = _sessionHumanInsights.filter((insight) => !removedIds.includes(insight.linkedDrawingId));
          if (removedIds.length) {
            removedIds.forEach((drawingId) => deleteTriggerLineByDrawingId(drawingId));
            _sessionTriggerLines = loadTriggerLines();
          }
          if (sessionHumanInsightDraft?.drawing?.id && removedIds.includes(sessionHumanInsightDraft.drawing.id)) sessionHumanInsightDraft = null;
          sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
          if (sessionOperatorState.selectedDrawingId && removedIds.includes(sessionOperatorState.selectedDrawingId)) {
            sessionOperatorState.selectedDrawingId = null;
          }
          reconcileSessionHumanInsightState({ reason: "drawing_cleared", keepOrphaned: true });
          console.debug("Drawing deleted", {
            insightId: null,
            drawingId: removedIds.join(","),
            conditionType: null,
            directionBias: null,
            activationResult: false,
            effectSummary: "all_drawings_removed",
          });
          refreshSessionCandlesTab();
          renderHumanInsightSummary();
        }
      },
      onSRSelect: (line) => {
        sessionOperatorState.selectedDrawingId = line?.id || null;
        if (line) {
          console.debug("Drawing selected", {
            drawingId: line.id,
            type: line.type,
            points: line.points || [],
            symbol: line?.metadata?.symbol || null,
            timeframe: line?.metadata?.timeframe || null,
          });
        }
        const linked = _sessionHumanInsights.find((insight) => insight.linkedDrawingId === line?.id);
        if (linked) {
          setSessionOperatorFeedbackStatus(`Drawing selected: ${linked.insightType} (${linked.condition?.directionBias}).`, "muted");
        }
        renderHumanInsightSummary();
      },
      onCandleHover: (idx) => {
        // Update toolbar OHLC bar
        const allC = candles;
        const c = allC.find(c => c.index === idx);
        if (c) {
          const dec = inferChartDecimals(allC);
          const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Number.isFinite(v) ? v.toFixed(dec) : '—'; };
          set('chart-o', c.open); set('chart-h', c.high); set('chart-l', c.low); set('chart-c', c.close);
        }
        if (selectedSessionCandleIndex !== idx) {
          selectedSessionCandleIndex = idx;
          refreshSessionCandlesTab();
        }
      },
    });
  }

  const overlays = {
    ...(marketAnalysis?.analysis?.overlays || {}),
    scenarioProjection: scenarioProjectionState.activeSet,
    symbol: marketAnalysis?.marketView?.symbol || session?.asset || "UNKNOWN",
    timeframe: marketAnalysis?.marketView?.timeframe || "UNKNOWN",
    _explanations: explanations,
  };

  // Update toolbar symbol label
  const _chartSymbolEl = document.getElementById('chart-symbol');
  if (_chartSymbolEl) {
    const mv = marketAnalysis?.marketView;
    _chartSymbolEl.textContent = mv?.symbol ? (mv.symbol + '  ' + (mv.timeframe || '')) : (session?.asset || '—');
  }

  const selectedDrawingId = sessionOperatorState.selectedDrawingId;
  const activeInsightIds = new Set((sessionOperatorState.currentContext?.humanInsightEvaluation?.activeInsights || []).map((insight) => insight.linkedDrawingId));
  const triggeredInsightIds = new Set((sessionOperatorState.currentContext?.humanInsightEvaluation?.activeInsights || [])
    .filter((insight) => insight.isTriggered)
    .map((insight) => insight.linkedDrawingId));
  const triggerByDrawingId = new Map(_sessionTriggerLines.map((line) => [line.linkedDrawingId, line]));
  const triggerEvalById = new Map((_sessionTriggerEvaluation?.activeTriggerEffects || []).map((row) => [row.triggerLineId, row]));
  const linesWithInsightMeta = _sessionManualSR.map((line) => ({
    ...line,
    humanInsightLinked: _sessionHumanInsights.some((insight) => insight.linkedDrawingId === line.id && !insight?.metadata?.isOrphaned),
    humanInsightActive: activeInsightIds.has(line.id),
    humanInsightTriggered: triggeredInsightIds.has(line.id),
    triggerStatus: triggerByDrawingId.get(line.id)?.id ? (triggerEvalById.get(triggerByDrawingId.get(line.id).id)?.status || "watching") : null,
    triggerBias: triggerByDrawingId.get(line.id)?.triggerConfig?.biasOnTrigger || null,
    isSelected: selectedDrawingId === line.id,
  }));

  _sessionChart.setData({
    candles,
    overlays,
    livePlan:    livePlanRecord,
    explanations,
    selectedIdx: selectedSessionCandleIndex,
    prefs: {
      showOverlay:   sessionAnalysisPrefs.showOverlay,
      showNear:      sessionAnalysisPrefs.showNear,
      showStructure: sessionAnalysisPrefs.showStructure,
      showMa:        sessionAnalysisPrefs.showMa,
      showScenarioProjection: sessionAnalysisPrefs.showScenarioProjection,
    },
  });
  _sessionChart.setManualSR(linesWithInsightMeta);
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

function getScenarioRegimeNotes(scenarioSet) {
  if (!scenarioSet?.scenarios?.length) return "Scenario engine idle.";
  const primary = scenarioSet.scenarios[0];
  const confidenceBand = primary?.probability >= 50 ? "high conviction context" : primary?.probability >= 35 ? "balanced outcomes" : "low conviction / split paths";
  return `${confidenceBand} · matched contexts ${scenarioSet.matched_similar_contexts || 0}`;
}

function renderScenarioProjectionCard() {
  if (!els.sessionScenarioCard || !els.sessionScenarioSummary) return;
  const set = scenarioProjectionState.activeSet;
  if (!set?.scenarios?.length) {
    els.sessionScenarioCard.innerHTML = '<p class="muted tiny">Scenario Projection waits for at least 3 market candles.</p>';
    els.sessionScenarioSummary.innerHTML = '<p class="muted tiny">Brain dashboard scenario summary unavailable.</p>';
    return;
  }
  const sorted = set.scenarios.slice().sort((a, b) => b.probability - a.probability);
  const primary = sorted[0];
  const secondary = sorted[1] || null;
  const noTrade = sorted.find((row) => row.type === "chop_no_trade");
  const recent = getLastResolvedScenarios(5);
  els.sessionScenarioCard.innerHTML = `
    <div class="note-head">
      <h4>Scenario Projection</h4>
      <span class="badge">${primary?.status || "pending"}</span>
    </div>
    <p><strong>${primary?.name || "-"}</strong> · <span class="badge">${(primary?.probability || 0).toFixed(2)}%</span></p>
    <p class="muted tiny"><strong>Next trigger:</strong> ${primary?.trigger || "-"}<br /><strong>Invalidation:</strong> ${primary?.invalidation || "-"}</p>
    <p class="muted tiny">${getScenarioRegimeNotes(set)} · assist-only mode (auto execution OFF).</p>
    <div class="button-row compact">
      <button id="btn-scenario-accept" type="button" class="ghost">accept scenario</button>
      <button id="btn-scenario-reject" type="button" class="ghost">reject scenario</button>
      <button id="btn-scenario-interesting" type="button" class="ghost">interesting / no trade</button>
      <select id="session-scenario-follow-select">
        <option value="">followed scenario…</option>
        ${sorted.map((row) => `<option value="${row.id}" ${scenarioProjectionState.humanSelection.followedScenarioId === row.id ? "selected" : ""}>${row.name}</option>`).join("")}
      </select>
    </div>
  `;

  els.sessionScenarioSummary.innerHTML = `
    <div class="session-analysis-tags">
      <span class="badge">Primary: ${primary?.name || "-"}</span>
      <span class="badge">Secondary: ${secondary?.name || "-"}</span>
      <span class="badge">No-trade: ${((noTrade?.probability || set.no_trade_probability || 0)).toFixed(2)}%</span>
      <span class="badge">Matched contexts: ${set.matched_similar_contexts || 0}</span>
    </div>
    <ul class="mini-list">
      ${recent.length ? recent.map((row) => `<li><span>${row.scenario_type} · ${row.final_status}</span><strong>${row.resolution_candles}c</strong></li>`).join("") : '<li><span class="muted">No resolved scenarios yet.</span></li>'}
    </ul>
  `;

  els.sessionScenarioAcceptBtn = document.getElementById("btn-scenario-accept");
  els.sessionScenarioRejectBtn = document.getElementById("btn-scenario-reject");
  els.sessionScenarioInterestingBtn = document.getElementById("btn-scenario-interesting");
  els.sessionScenarioFollowSelect = document.getElementById("session-scenario-follow-select");

  els.sessionScenarioAcceptBtn?.addEventListener("click", () => {
    scenarioProjectionState.humanSelection.action = "accept";
    scenarioProjectionState.humanSelection.override = "accepted";
    setSessionCandleStatus("Scenario marked as accepted by operator.", "success");
  });
  els.sessionScenarioRejectBtn?.addEventListener("click", () => {
    scenarioProjectionState.humanSelection.action = "reject";
    scenarioProjectionState.humanSelection.override = "rejected";
    setSessionCandleStatus("Scenario set rejected by operator.", "warning");
  });
  els.sessionScenarioInterestingBtn?.addEventListener("click", () => {
    scenarioProjectionState.humanSelection.action = "interesting_no_trade";
    scenarioProjectionState.humanSelection.override = "no_trade";
    setSessionCandleStatus("Scenario logged as interesting/no-trade.", "muted");
  });
  els.sessionScenarioFollowSelect?.addEventListener("change", () => {
    scenarioProjectionState.humanSelection.followedScenarioId = els.sessionScenarioFollowSelect?.value || null;
  });
}

function renderSessionSummary(session) {
  if (!els.sessionSummary) return;
  if (!session) { els.sessionSummary.innerHTML = '<p class="muted">Sin sesión activa.</p>'; return; }
  const stats = computeSessionStats(session.candles);
  const marketView = getSessionMarketView();
  const live = marketDataMeta?.liveStatus || {};
  const triggerPanel = renderTriggerLinePanel(_sessionTriggerLines, _sessionTriggerEvaluation);
  els.sessionSummary.innerHTML = `<ul class="mini-list"><li><span>Total candles</span><strong>${stats.totalCandles}</strong></li><li><span>Green/Red/Doji</span><strong>${stats.greenCandles}/${stats.redCandles}/${stats.dojiCandles}</strong></li><li><span>High/Low</span><strong>${stats.highOfSession ?? "-"} / ${stats.lowOfSession ?? "-"}</strong></li><li><span>Range</span><strong>${stats.highOfSession !== null && stats.lowOfSession !== null ? (stats.highOfSession - stats.lowOfSession).toFixed(5) : "-"}</strong></li><li><span>Status</span><strong>${session.status}</strong></li><li><span>Live source</span><strong>${marketView.source} · ${marketView.symbol} ${marketView.timeframe}</strong></li><li><span>Live stream</span><strong>${live.connected ? "connected" : "offline/history only"}</strong></li></ul>${triggerPanel}`;
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

function updateScenarioProjectionEngine({ analysis, marketView, latestPolicy }) {
  const candles = marketView?.candles || [];
  if (!analysis || candles.length < 3) {
    scenarioProjectionState.activeSet = null;
    return null;
  }

  const lastCandleTs = candles[candles.length - 1]?.timestamp || candles[candles.length - 1]?.index || Date.now();
  if (scenarioProjectionState.activeSet && !scenarioProjectionState.activeSet.resolved) {
    const resolution = resolveScenarioSet({
      scenarioSet: scenarioProjectionState.activeSet,
      candles,
      analysis,
      humanSelection: {
        ...scenarioProjectionState.humanSelection,
        followedScenarioId: scenarioProjectionState.humanSelection.followedScenarioId,
      },
    });
    scenarioProjectionState.activeSet = resolution.updatedSet;
    if (resolution.resolved && Array.isArray(resolution.resolvedRows)) {
      resolution.resolvedRows.forEach((row) => {
        brainMemoryStore.updateContextFromOutcome(row.context_signature, {
          scenario: row.scenario,
          resolution: row.resolution,
          operatorOverride: row.operatorOverride,
        }, {
          sessionId: getActiveSession()?.id || null,
          symbol: marketView.symbol,
          timeframe: marketView.timeframe,
          context_signature: row.context_signature,
        });
      });
      brainMemoryStore.addEvent(createBrainEvent("scenario_resolved", {
        winner: resolution.winner?.id || null,
        count: resolution.resolvedRows.length,
      }, {
        sessionId: getActiveSession()?.id || null,
        symbol: marketView.symbol,
        timeframe: marketView.timeframe,
        context_signature: scenarioProjectionState.activeSet?.context_signature || null,
      }));
    }
  }

  const shouldCreateNewSet = !scenarioProjectionState.activeSet
    || scenarioProjectionState.activeSet.resolved
    || scenarioProjectionState.lastCreationCandleTs !== lastCandleTs;

  if (shouldCreateNewSet) {
    const reinforcementOverlay = brainMemoryStore.getReinforcementOverlay?.(
      buildSessionContextSignature({
        analysis,
        symbol: marketView?.symbol || getActiveSession()?.asset,
        timeframe: marketView?.timeframe || getActiveSession()?.tf,
      }),
    );
    const orchestrated = runSessionBrainOrchestrator({
      session: getActiveSession(),
      marketView,
      analysis,
      modeState: { ...brainModeController.getState(), executorMode: executorStateStore.getState().mode },
      operatorState: sessionOperatorState,
      learnedContexts: getScenarioMemoryRows().slice(-200),
      humanOverrideMemory: scenarioProjectionState.humanSelection.override
        ? { [scenarioProjectionState.humanSelection.followedScenarioId]: scenarioProjectionState.humanSelection.override }
        : null,
      executionControlState,
      reinforcementOverlay,
    });
    _lastBrainVerdict = orchestrated.brainPacket;
    scenarioProjectionState.activeSet = orchestrated.scenarioPacket;
    scenarioProjectionState.lastCreationCandleTs = lastCandleTs;
    scenarioProjectionState.lastContextSignature = scenarioProjectionState.activeSet?.context_signature || "";
    brainMemoryStore.appendScenario(scenarioProjectionState.activeSet || {}, {
      sessionId: getActiveSession()?.id || null,
      symbol: marketView.symbol,
      timeframe: marketView.timeframe,
      context_signature: scenarioProjectionState.activeSet?.context_signature || null,
    });
    brainMemoryStore.addEvent(createBrainEvent("scenario_generated", scenarioProjectionState.activeSet || {}, {
      sessionId: getActiveSession()?.id || null,
      symbol: marketView.symbol,
      timeframe: marketView.timeframe,
      context_signature: scenarioProjectionState.activeSet?.context_signature || null,
    }));
  }

  scenarioProjectionState.dashboardSnapshot = {
    primary: scenarioProjectionState.activeSet?.scenarios?.[0] || null,
    secondary: scenarioProjectionState.activeSet?.scenarios?.[1] || null,
    noTradeProbability: scenarioProjectionState.activeSet?.no_trade_probability || 0,
    matchedContexts: scenarioProjectionState.activeSet?.matched_similar_contexts || 0,
    lastResolved: getLastResolvedScenarios(5),
  };
  return scenarioProjectionState.activeSet;
}

function refreshSessionCandlesTab() {
  const active = getActiveSession();
  const viewed = state.sessions.find((s) => s.id === sessionHistoryId) || active;
  const explanations = viewed ? buildSessionCandleExplanations(viewed.candles, sessionAnalysisConfig) : [];
  const marketView = getSessionMarketView();
  const latestPolicy = liveShadowMonitor.getRecords().find((row) => row.symbol === marketView.symbol && row.timeframe === marketView.timeframe) || null;
  const livePlanRecord = getSessionLivePlanRecord(marketView);
  const marketAnalysis = {
    marketView,
    analysis: buildSessionCandleAnalysis(marketView.candles, {
      symbol: marketView.symbol,
      timeframe: marketView.timeframe,
      source: marketView.source,
      policy: latestPolicy ? { action: latestPolicy.policy?.action, confidence: latestPolicy.policy?.confidence, timestamp: latestPolicy.timestamp } : null,
      shadow: latestPolicy
        ? {
          status: latestPolicy.outcome?.status,
          action: latestPolicy.policy?.action,
          operatorAction: latestPolicy.decisionTrace?.operatorCorrected?.finalAction || null,
          operatorState: latestPolicy.decisionTrace?.operatorCorrected?.finalState || null,
          operatorInfluence: latestPolicy.decisionTrace?.operatorCorrected?.operatorInfluence || [],
          timestamp: latestPolicy.timestamp,
        }
        : null,
    }),
  };
  const scenarioSet = updateScenarioProjectionEngine({ analysis: marketAnalysis.analysis, marketView, latestPolicy });
  reconcileSessionHumanInsightState({ reason: "refresh", keepOrphaned: true });
  if (viewed?.candles?.length && !selectedSessionCandleIndex) selectedSessionCandleIndex = viewed.candles[viewed.candles.length - 1].index;
  if (!viewed?.candles?.some((c) => c.index === selectedSessionCandleIndex)) selectedSessionCandleIndex = viewed?.candles?.[viewed.candles.length - 1]?.index || null;
  renderSessionHeader();
  drawSessionCandles(viewed, explanations, marketAnalysis, livePlanRecord);
  renderSessionTable(viewed, explanations);
  renderSessionLivePlanPanel(livePlanRecord, marketView);
  renderScenarioProjectionCard();
  renderHumanInsightDraftPanel();
  renderHumanInsightSummary();
  updateSessionOperatorContext(marketAnalysis.analysis, marketView, livePlanRecord);
  renderSessionAlwaysOnAnalystPanel({ viewed, marketView, latestPolicy });
  // Compact timeline strip with policy/rejection/volatility events from recent candles.
  renderSessionEventStrip(marketAnalysis.analysis?.events || []);
  renderSessionSummary(viewed);
  renderPastSessions();
  if (els.sessionPrevBtn) els.sessionPrevBtn.disabled = !viewed?.candles?.length;
  if (els.sessionNextBtn) els.sessionNextBtn.disabled = !viewed?.candles?.length;
  if (els.sessionPlayBtn) els.sessionPlayBtn.disabled = !viewed?.candles?.length || !sessionAnalysisPrefs.replayMode;
  if (els.sessionPauseBtn) els.sessionPauseBtn.disabled = !sessionReplayTimer;
}

function refreshSharedOptions() {
  const assets = [...new Set(state.signals.map((s) => s.asset))].sort();
  const sources = [...new Set(state.signals.map((s) => s.source).filter(Boolean))].sort();
  const strategies = [...new Set(state.signals.map((s) => s.strategyId).filter(Boolean))].sort();
  const strategyVersions = [...new Set(state.signals.map((s) => s.strategyVersionId || s.strategySignal?.versionId).filter(Boolean))].sort();
  const patterns = [...new Set([
    ...state.signals.map((s) => s.patternName),
    ...patternVersionsRegistry.filter((entry) => !entry.isArchived).map((entry) => entry.patternName),
  ])].sort();
  const timeframes = [...new Set(state.signals.map((s) => s.timeframe))].sort();

  renderFilterOptions(els.filterAsset, assets, "Todos los activos");
  renderFilterOptions(els.filterPattern, patterns, "Todos los patrones");
  renderFilterOptions(els.filterSource, sources, "Todas las fuentes");
  renderFilterOptions(els.filterStrategy, strategies, "Todas las estrategias");
  renderFilterOptions(els.filterStrategyVersion, strategyVersions, "Todas las versiones");
  renderFilterOptions(els.filterTimeframe, timeframes, "Todos los TF");
  renderFilterOptions(els.statsFilterSource, sources, "Todas las fuentes");
  renderFilterOptions(els.statsFilterStrategy, strategies, "Todas las estrategias");
  renderFilterOptions(els.statsFilterVersion, strategyVersions, "Todas las versiones");
  renderFilterOptions(els.statsFilterSymbol, assets, "Todos los símbolos");
  renderFilterOptions(els.statsFilterTimeframe, timeframes, "Todos los TF");
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


function refreshSyntheticLearningRatio() {
  if (!els.syntheticLearningRatio) return;
  const syntheticRows = getSyntheticTrades();
  const reviewedReal = state.signals.filter((s) => s.outcome?.status && s.outcome.status !== "pending").length;
  const ratio = computeSyntheticLearningRatio(reviewedReal, syntheticRows);
  els.syntheticLearningRatio.textContent = `Synthetic vs Real Learning Ratio: ${(ratio.ratioSynthetic * 100).toFixed(1)}% synthetic / ${(ratio.ratioReal * 100).toFixed(1)}% real (weighted synthetic samples: ${ratio.syntheticWeighted})`;
}

function refreshStats() {
  let scopedSignals = [...state.signals];
  if (statsFilters.source) scopedSignals = scopedSignals.filter((row) => row.source === statsFilters.source);
  if (statsFilters.strategyId) scopedSignals = scopedSignals.filter((row) => row.strategyId === statsFilters.strategyId);
  if (statsFilters.versionId) scopedSignals = scopedSignals.filter((row) => (row.strategyVersionId || row.strategySignal?.versionId || "") === statsFilters.versionId);
  if (statsFilters.symbol) scopedSignals = scopedSignals.filter((row) => row.asset === statsFilters.symbol);
  if (statsFilters.timeframe) scopedSignals = scopedSignals.filter((row) => row.timeframe === statsFilters.timeframe);
  const stats = computeStats(scopedSignals);
  renderStatsOverview(els.statsOverview, stats);
  renderList(els.topAssets, stats.topAssets);
  renderList(els.topPatterns, stats.topPatterns);
  renderList(els.directionDist, stats.directionDist);
  renderList(els.statsBySource, stats.bySource || []);
  renderList(els.statsByStrategy, stats.byStrategy || []);
  renderList(els.statsBySymbol, stats.bySymbol || []);
  renderList(els.statsByTimeframe, stats.byTimeframe || []);
  renderList(els.statsByAction, stats.byAction || []);
  renderList(els.statsByResult, stats.byResult || []);
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

  if (els.versionsWrap) {
    const grouped = Object.values((strategyLifecycleState.versions || []).reduce((acc, row) => {
      if (!acc[row.strategyId]) acc[row.strategyId] = { strategyId: row.strategyId, name: row.name, rows: [] };
      acc[row.strategyId].rows.push(row);
      return acc;
    }, {}));
    const lifecycleHtml = grouped.length
      ? grouped.map((group) => {
        const lineage = getVersionLineage(group.rows, group.strategyId);
        const rows = group.rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((row) => `<li>${row.versionId} · ${row.status} · ${new Date(row.createdAt).toLocaleString()}</li>`).join("");
        return `<article class="panel-soft"><h3>${group.name} <span class="tiny muted">(${group.strategyId})</span></h3><p class="tiny muted">${lineage || "-"}</p><ul class="tiny">${rows}</ul></article>`;
      }).join("")
      : '<div class="panel-soft muted tiny">No strategy lifecycle versions yet.</div>';
    els.versionsWrap.insertAdjacentHTML("beforeend", `<h3>Strategy Lifecycle Versions</h3>${lifecycleHtml}`);
  }
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

function formatJournalTradeTime(seconds = null) {
  const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : null;
  if (safe === null) return "-";
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function fmtJournalPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "-";
}

function getJournalBadgeClass(value = "") {
  if (["win", "target_hit"].includes(value)) return "badge-green";
  if (["loss", "stopped"].includes(value)) return "badge-red";
  if (["cancelled"].includes(value)) return "badge-yellow";
  if (["active", "triggered"].includes(value)) return "badge-blue";
  return "badge-muted";
}

function isExploratoryPaperTrade(row = {}) {
  const type = String(row?.tradeMeta?.type || row?.trade_type || "").toLowerCase();
  const tags = Array.isArray(row?.tags) ? row.tags.map((v) => String(v).toLowerCase()) : [];
  return type === "exploratory" || tags.includes("exploratory");
}

function filterJournalTrades(rows = []) {
  const term = String(journalTradeFilters.search || "").trim().toLowerCase();
  return rows.filter((row) => {
    if (journalTradeFilters.status && row.status !== journalTradeFilters.status) return false;
    if (journalTradeFilters.direction && row.direction !== journalTradeFilters.direction) return false;
    if (journalTradeFilters.source && row.source !== journalTradeFilters.source) return false;
    if (journalTradeFilters.setup && row.setup !== journalTradeFilters.setup) return false;
    if (term) {
      const haystack = [row.id, row.notes, row.setup].join(" ").toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

function refreshJournalTrades() {
  if (!els.journalTradesList) return;
  const orphanTrade = getCurrentPacket()?.visual_trade || null;
  if (orphanTrade?.id && !journalTrades.some((row) => row.id === orphanTrade.id)) {
    console.warn("[Journal] Recovered orphan visual trade into journal.", orphanTrade.id);
    syncTradeToJournal(orphanTrade, { status: orphanTrade.status || "planned" });
  }
  const filtered = filterJournalTrades(journalTrades);
  const setups = [...new Set(journalTrades.map((row) => row.setup).filter(Boolean))].sort();
  const statuses = [...new Set(journalTrades.map((row) => row.status).filter(Boolean))].sort();
  renderFilterOptions(els.journalTradeFilterSetup, setups, "All setups");
  renderFilterOptions(els.journalTradeFilterStatus, statuses, "All status");
  if (journalTradeFilters.setup) els.journalTradeFilterSetup.value = journalTradeFilters.setup;
  if (journalTradeFilters.status) els.journalTradeFilterStatus.value = journalTradeFilters.status;
  if (!filtered.length) {
    els.journalTradesList.innerHTML = `<p class="muted tiny">No paper trades journaled yet.</p>`;
    return;
  }
  els.journalTradesList.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Status</th><th>Source</th><th>Setup</th><th>Dir</th><th>Entry / SL / TP</th><th>RR</th><th>Conf</th><th>Outcome</th><th>Time</th><th>Candles</th><th>MFE / MAE</th></tr></thead>
      <tbody>
      ${filtered.slice(0, 250).map((row) => `
        <tr data-journal-trade-id="${row.id}">
          <td>${row.id}</td>
          <td><span class="${getJournalBadgeClass(row.status)}">${row.status}</span></td>
          <td><span class="badge ${getJournalBadgeClass(row.source)}">${row.source}</span></td>
          <td>${row.setup || "-"} ${isExploratoryPaperTrade(row) ? '<span class="badge badge-yellow">Exploratory Paper Trade</span>' : ""}</td>
          <td>${row.direction || "-"}</td>
          <td>${fmtJournalPrice(row.entry)} / ${fmtJournalPrice(row.stopLoss)} / ${fmtJournalPrice(row.takeProfit)}</td>
          <td>${Number.isFinite(Number(row.riskReward)) ? Number(row.riskReward).toFixed(2) : "-"}</td>
          <td>${Number.isFinite(Number(row.confidence)) ? Number(row.confidence).toFixed(2) : "-"}</td>
          <td><span class="${getJournalBadgeClass(row.outcome || "")}">${row.outcome || "-"}</span></td>
          <td>${formatJournalTradeTime(row.timeInTradeSec)}</td>
          <td>${Number.isFinite(Number(row.candlesInTrade)) ? row.candlesInTrade : "-"}</td>
          <td>${Number.isFinite(Number(row.mfe)) ? Number(row.mfe).toFixed(2) : "-"} / ${Number.isFinite(Number(row.mae)) ? Number(row.mae).toFixed(2) : "-"}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  els.journalTradesList.querySelectorAll("[data-journal-trade-id]").forEach((node) => {
    node.addEventListener("click", () => {
      selectedJournalTradeId = node.getAttribute("data-journal-trade-id") || "";
      const selected = journalTrades.find((row) => row.id === selectedJournalTradeId) || null;
      if (!selected || !els.journalTradeDetail) return;
      els.journalTradeDetail.classList.remove("muted");
      els.journalTradeDetail.textContent = JSON.stringify(selected, null, 2);
    });
  });
}

function syncTradeToJournal(trade = {}, context = {}) {
  const normalized = normalizeJournalTrade(trade, context);
  if (!normalized.id) {
    console.warn("[Journal] Trade created without id; generated fallback id.");
  }
  const upserted = brainTradeJournal.upsertJournalTrade(normalized);
  if (!upserted) console.warn("[Journal] Failed to upsert trade state change.", trade?.id);
  return upserted;
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


function setStrategyLabStatus(message, kind = "muted") {
  if (!els.slStatus) return;
  els.slStatus.className = `quick-add-feedback ${kind}`;
  els.slStatus.textContent = message || "";
}

function parseStrategyParamsInput() {
  try {
    const raw = String(els.slParams?.value || "{}").trim();
    if (!raw) return { params: {}, risk: {}, execution: strategyLabConfig.execution, variants: [] };
    const parsed = JSON.parse(raw);
    const variants = Array.isArray(parsed.variants)
      ? parsed.variants
        .filter((row) => row && typeof row === "object")
        .map((row, index) => ({
          label: String(row.label || `Variant ${index + 1}`),
          strategyId: row.strategyId ? String(row.strategyId) : null,
          params: row.params && typeof row.params === "object" ? row.params : {},
          risk: row.risk && typeof row.risk === "object" ? row.risk : {},
          execution: row.execution && typeof row.execution === "object" ? row.execution : {},
        }))
      : [];
    return {
      params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
      risk: parsed.risk && typeof parsed.risk === "object" ? parsed.risk : {},
      execution: parsed.execution && typeof parsed.execution === "object" ? { ...strategyLabConfig.execution, ...parsed.execution } : { ...strategyLabConfig.execution },
      variants,
    };
  } catch (error) {
    throw new Error(`Invalid strategy JSON params: ${error.message}`);
  }
}

function parseStrategyLabJsonInput() {
  const raw = String(els.slParams?.value || "").trim();
  if (!raw) return { mode: strategyLabJsonMode, paramsPayload: { params: {}, risk: {}, execution: { ...strategyLabConfig.execution }, variants: [] }, strategyDefinition: null, summary: "Empty JSON. Using defaults." };
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
  if (strategyLabJsonMode === "strategy") {
    const validation = validateRuleBasedStrategyDefinition(parsed);
    if (!validation.valid) throw new Error(`Strategy JSON invalid: ${validation.errors.join(" ")}`);
    return {
      mode: "strategy",
      strategyDefinition: validation.definition,
      paramsPayload: {
        params: {},
        risk: {
          stopAtrMult: validation.definition.risk.stopLossAtr,
          takeProfitAtrMult: validation.definition.risk.takeProfitAtr,
          maxHoldBars: validation.definition.exit.maxBarsInTrade,
        },
        execution: {
          ...strategyLabConfig.execution,
          feeBps: validation.definition.risk.feeBps,
          slippageBps: validation.definition.risk.slippageBps,
          initialEquity: validation.definition.risk.initialEquity,
        },
        variants: [],
      },
      summary: `Strategy JSON detected (${validation.definition.strategyId}).`,
    };
  }
  const paramsPayload = parseStrategyParamsInput();
  return { mode: "parameters", strategyDefinition: null, paramsPayload, summary: "Parameter JSON detected." };
}

function getStrategyLabDatasetSummary() {
  const symbol = els.slSymbol?.value || marketDataMeta.selectedSymbol;
  const timeframe = els.slTimeframe?.value || marketDataMeta.selectedTimeframe;
  const rangeBars = Number(els.slRangeBars?.value || 500);
  const matchingCandles = (strategyLabCandles || []).filter((row) => {
    const rowSymbol = row.symbol || row.asset || marketDataMeta.selectedSymbol;
    const rowTf = row.timeframe || marketDataMeta.selectedTimeframe;
    return rowSymbol === symbol && rowTf === timeframe;
  });
  const selectedCount = matchingCandles.slice(-Math.max(1, rangeBars)).length;
  return {
    symbol,
    timeframe,
    rangeBars,
    matchingTotal: matchingCandles.length,
    selectedCount,
    sufficient: selectedCount >= 100,
    mismatch: strategyLabDataState.lastLoadedSymbol && (strategyLabDataState.lastLoadedSymbol !== symbol || strategyLabDataState.lastLoadedTimeframe !== timeframe),
  };
}

async function loadStrategyLabHistory() {
  const { symbol, timeframe, rangeBars } = getStrategyLabDatasetSummary();
  const limit = Math.min(5000, Math.max(500, rangeBars));
  strategyLabDataState = { ...strategyLabDataState, loading: true, error: "" };
  setStrategyLabStatus(`Fetching ${limit} ${symbol} ${timeframe} candles from Binance Futures...`, "muted");
  renderStrategyLab();
  try {
    const fetched = await loadHistoricalCandles({
      source: MARKET_DATA_SOURCES.BINANCE_FUTURES,
      symbol,
      timeframe,
      interval: timeframe,
      limit,
    });
    if (!Array.isArray(fetched) || !fetched.length) throw new Error("No candles received from Binance Futures loader.");
    strategyLabCandles = mergeCandles(strategyLabCandles, fetched);
    strategyLabDataState = {
      loading: false,
      error: "",
      lastLoadedCount: fetched.length,
      lastLoadedSymbol: symbol,
      lastLoadedTimeframe: timeframe,
      lastLoadedAt: new Date().toISOString(),
    };
    setStrategyLabStatus(`Loaded ${fetched.length} ${symbol} ${timeframe} candles from Binance Futures.`, "success");
    renderStrategyLab();
    return fetched;
  } catch (error) {
    strategyLabDataState = { ...strategyLabDataState, loading: false, error: error.message };
    setStrategyLabStatus(`Historical load failed: ${error.message}`, "error");
    renderStrategyLab();
    return [];
  }
}

function buildStrategySignalContextMap() {
  const map = new Map();
  const feed = [...state.signals, ...livePatternSignals].filter((row) => row?.timestamp);
  feed.forEach((row) => {
    const key = typeof row.timestamp === "string" ? row.timestamp : new Date(row.timestamp).toISOString();
    map.set(key, row);
  });
  return map;
}

function buildStrategyRuntimeContext(symbol, timeframe) {
  const strategyRows = (strategyLabCandles || []).filter((row) => {
    const rowSymbol = row.symbol || row.asset || marketDataMeta.selectedSymbol;
    const rowTf = row.timeframe || marketDataMeta.selectedTimeframe;
    return (!symbol || rowSymbol === symbol) && (!timeframe || rowTf === timeframe);
  });
  const sourceCandles = (strategyRows.length ? strategyRows : (marketDataCandles || [])).filter((row) => {
    const rowSymbol = row.symbol || row.asset || marketDataMeta.selectedSymbol;
    const rowTf = row.timeframe || marketDataMeta.selectedTimeframe;
    return (!symbol || rowSymbol === symbol) && (!timeframe || rowTf === timeframe);
  });

  const signalContextByTimestamp = buildStrategySignalContextMap();
  return {
    candles: sourceCandles,
    symbol,
    timeframe,
    neuronActivations,
    seededPatterns,
    signalContextByTimestamp,
    supportResistanceByTimestamp: new Map(sourceCandles.map((c) => [c.timestamp, signalContextByTimestamp.get(c.timestamp)?.srContext || {}])),
    seededMatchesByIndex: new Map(sourceCandles.map((_, i) => [i, []])),
  };
}

function persistStrategyLifecycle() { saveStrategyLifecycle(strategyLifecycleState).catch((error) => console.error("[Storage] saveStrategyLifecycle failed", error)); }

function getStrategyVersions(strategyId) {
  return (strategyLifecycleState.versions || []).filter((row) => row.strategyId === strategyId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getSelectedStrategyVersion(strategyId) {
  const versions = getStrategyVersions(strategyId);
  return versions.find((row) => row.versionId === selectedStrategyVersionId) || versions[versions.length - 1] || null;
}

function buildVersionDefinitionFromConfig(strategyId, parsedInput) {
  return {
    strategyId,
    jsonMode: parsedInput?.mode || strategyLabJsonMode,
    strategyDefinition: parsedInput?.strategyDefinition || null,
    paramsPayload: parsedInput?.paramsPayload || {},
  };
}

function ensureLifecycleVersion(strategyId, parsedInput, status = "draft") {
  const strategy = getStrategyById(strategyId);
  const payload = {
    strategyId,
    name: parsedInput?.strategyDefinition?.name || strategy?.name || strategyId,
    description: parsedInput?.strategyDefinition?.description || `Lifecycle version for ${strategyId}`,
    definition: buildVersionDefinitionFromConfig(strategyId, parsedInput),
    status,
    parentVersionId: selectedStrategyVersionId || null,
  };
  const result = ensureVersionFromDefinition(strategyLifecycleState, payload);
  strategyLifecycleState = result.state;
  selectedStrategyVersionId = result.version.versionId;
  persistStrategyLifecycle();
  return result.version;
}

function renderStrategyLab() {
  const strategies = listStrategies();
  if (els.slStrategy && !els.slStrategy.options.length) {
    els.slStrategy.innerHTML = strategies.map((row) => `<option value="${row.id}">${row.name} (${row.type})</option>`).join("");
    els.slStrategy.value = strategyLabConfig.strategyId;
  }
  const strategyId = els.slStrategy?.value || strategyLabConfig.strategyId;
  const versions = getStrategyVersions(strategyId);
  if (els.slVersion) {
    const current = selectedStrategyVersionId;
    els.slVersion.innerHTML = versions.length
      ? versions.map((row) => `<option value="${row.versionId}">${row.versionId} · ${row.status}</option>`).join("")
      : '<option value="">v1 (new)</option>';
    els.slVersion.value = versions.some((row) => row.versionId === current) ? current : (versions[versions.length - 1]?.versionId || "");
    selectedStrategyVersionId = els.slVersion.value || selectedStrategyVersionId;
  }
  const selectedVersion = getSelectedStrategyVersion(strategyId);
  if (els.slVersionStatus) els.slVersionStatus.textContent = selectedVersion ? `${selectedVersion.versionId} · ${selectedVersion.status} · ${new Date(selectedVersion.createdAt).toLocaleString()}` : "No strategy version yet.";
  if (els.slVersionLineage) els.slVersionLineage.textContent = versions.length ? `Lineage: ${getVersionLineage(versions, strategyId)}` : "Lineage: -";

  if (els.slSymbol) {
    const previous = els.slSymbol.value;
    const symbolOptions = [...new Set([...(marketDataCandles || []), ...(strategyLabCandles || [])].map((c) => c.symbol || c.asset || marketDataMeta.selectedSymbol).filter(Boolean))];
    const all = symbolOptions.length ? symbolOptions : [...new Set([marketDataMeta.selectedSymbol || "BTCUSDT", "BTCUSDT", "ETHUSDT"])];
    els.slSymbol.innerHTML = all.map((symbol) => `<option value="${symbol}">${symbol}</option>`).join("");
    els.slSymbol.value = all.includes(previous) ? previous : (all.includes(marketDataMeta.selectedSymbol) ? marketDataMeta.selectedSymbol : all[0]);
  }

  if (els.slParams && !els.slParams.value) {
    const defaults = getDefaultParams(strategyLabConfig.strategyId);
    els.slParams.value = JSON.stringify({ params: defaults, risk: {}, execution: strategyLabConfig.execution, structureFilter: { enabled: true } }, null, 2);
  }
  if (els.slJsonMode) els.slJsonMode.value = strategyLabJsonMode;
  if (els.slJsonStatus) {
    if (!els.slJsonStatus.textContent || els.slJsonStatus.classList.contains("muted")) {
      els.slJsonStatus.className = "quick-add-feedback muted";
      els.slJsonStatus.textContent = strategyLabJsonMode === "strategy"
        ? "Strategy JSON mode: define rule-based entry/exit/risk config."
        : "Parameter JSON mode: tune selected registered strategy.";
    }
  }

  const dataSummary = getStrategyLabDatasetSummary();
  if (els.slDataStatus) {
    const lines = [];
    if (strategyLabDataState.loading) lines.push("Loading Binance Futures candles...");
    if (dataSummary.matchingTotal) lines.push(`Loaded ${dataSummary.matchingTotal} ${dataSummary.symbol} ${dataSummary.timeframe} candles in store.`);
    else lines.push(`No ${dataSummary.symbol} ${dataSummary.timeframe} candles loaded yet.`);
    if (dataSummary.mismatch) lines.push("Dataset symbol/timeframe does not match current selection.");
    if (dataSummary.sufficient) lines.push(`Ready: ${dataSummary.selectedCount}/${dataSummary.rangeBars} bars available for run window.`);
    else lines.push(`Need at least 100 candles, only ${dataSummary.selectedCount} are loaded for current range.`);
    if (strategyLabDataState.lastLoadedAt) lines.push(`Last fetch: ${new Date(strategyLabDataState.lastLoadedAt).toLocaleString()}`);
    if (strategyLabDataState.error) lines.push(`Error: ${strategyLabDataState.error}`);
    els.slDataStatus.className = `panel-soft tiny ${dataSummary.sufficient ? "success" : "muted"}`;
    els.slDataStatus.innerHTML = lines.join(" · ");
  }

  const approvedRuns = strategyRuns.filter((row) => row.approvedForLiveShadow).sort((a, b) => new Date(b.approvedAt || 0) - new Date(a.approvedAt || 0));
  if (els.slApprovedStatus) {
    const approved = approvedRuns[0];
    els.slApprovedStatus.innerHTML = approved
      ? `<strong>Approved for Live Shadow:</strong> ${approved.strategyId} · ${approved.symbol} ${approved.timeframe} · ${new Date(approved.approvedAt || approved.timestamp).toLocaleString()}`
      : "No approved strategy run yet.";
  }

  const metrics = latestStrategyResult?.metrics || null;
  const batchSummary = latestStrategyBatchResults.length > 1
    ? `<div class="panel-soft tiny">Batch runs: ${latestStrategyBatchResults.map((row) => `${row.label || row.strategyId}: ${(row.metrics?.winRate * 100 || 0).toFixed(1)}% WR / ${formatNumber(row.metrics?.netPnl || 0, 2)} PnL`).join(" · ")}</div>`
    : "";
  els.slMetrics.innerHTML = metrics
    ? `<div class="kpi"><span>Total Trades</span><strong>${metrics.totalTrades}</strong></div>
      <div class="kpi"><span>Win Rate</span><strong>${(metrics.winRate * 100).toFixed(1)}%</strong></div>
      <div class="kpi"><span>Avg PnL</span><strong>${formatNumber(metrics.avgPnl, 2)}</strong></div>
      <div class="kpi"><span>Avg R</span><strong>${formatNumber(metrics.avgR, 2)}</strong></div>
      <div class="kpi"><span>Expectancy</span><strong>${formatNumber(metrics.expectancy, 2)}</strong></div>
      <div class="kpi"><span>Max DD</span><strong>${formatNumber(metrics.maxDrawdown, 2)}</strong></div>
      <div class="kpi"><span>Profit Factor</span><strong>${Number.isFinite(metrics.profitFactor) ? formatNumber(metrics.profitFactor, 2) : "∞"}</strong></div>
      <div class="kpi"><span>Win/Loss Streak</span><strong>${metrics.longestWinStreak}/${metrics.longestLossStreak}</strong></div>
      ${batchSummary}`
    : '<div class="panel-soft muted tiny">Run a backtest to populate metrics.</div>';

  const compareRows = compareStrategyRuns(strategyRuns).slice(0, 20);
  els.slRunsBody.innerHTML = compareRows.length
    ? compareRows.map((row) => `<tr data-strategy-run="${row.id}"><td><input type="radio" name="sl-run-select" ${selectedStrategyRunId === row.id ? "checked" : ""} /></td><td>${new Date(row.timestamp).toLocaleString()}</td><td>${row.strategyId}</td><td>${row.versionId || "v1"}</td><td>${row.symbol}</td><td>${row.timeframe}</td><td>${row.totalTrades}</td><td>${(row.winRate * 100).toFixed(1)}%</td><td>${formatNumber(row.netPnl, 2)}</td><td>${formatNumber(row.maxDrawdown, 2)}</td><td>${row.approvedForLiveShadow ? '<span class="badge call">approved</span>' : '<span class="muted tiny">-</span>'}</td></tr>`).join("")
    : '<tr><td colspan="11" class="muted">No runs saved.</td></tr>';

  const trades = latestStrategyResult?.trades || [];
  const bullMin = Number(els.slScoreBullMin?.value || 0);
  const bearMin = Number(els.slScoreBearMin?.value || 0);
  const filteredTrades = trades.filter((trade) => Number(trade.bullishScore || 0) >= bullMin && Number(trade.bearishScore || 0) >= bearMin);
  els.slTradesBody.innerHTML = filteredTrades.length
    ? filteredTrades.slice(0, 200).map((t) => `<tr><td>${new Date(t.entryTimestamp).toLocaleString()}</td><td>${new Date(t.exitTimestamp).toLocaleString()}</td><td><span class="badge ${t.side === "LONG" ? "call" : "put"}">${t.side}</span></td><td>${t.reason || "-"}<div class="muted tiny">${t.regime || "ranging"} · ${t.probabilityBias || "neutral"} (${formatNumber(t.probabilityConfidence, 1)})</div><div class="muted tiny">${t.scoreExplanation || "Score explanation not available."}</div><div class="muted tiny">Structure ${t.structureDecision || "allow"}${(t.structureReasons || []).length ? ` · ${(t.structureReasons || []).slice(0, 1).join(" ")}` : ""}</div></td><td>${t.outcomeType}</td><td>${formatNumber(t.pnl, 2)}</td><td>${formatNumber(t.rMultiple, 2)}</td><td>${t.holdBars}</td><td>B ${formatNumber(t.bullishScore, 1)} / Br ${formatNumber(t.bearishScore, 1)} / N ${formatNumber(t.neutralScore, 1)}</td></tr>`).join("")
    : `<tr><td colspan="9" class="muted">No trades match score filters (bull ≥ ${formatNumber(bullMin, 0)} / bear ≥ ${formatNumber(bearMin, 0)}).</td></tr>`;

  const validations = (strategyLifecycleState.validations || []).filter((row) => row.strategyId === strategyId).slice(0, 20);
  if (els.slValidationBody) {
    els.slValidationBody.innerHTML = validations.length
      ? validations.map((row) => `<tr><td>${new Date(row.timestamp).toLocaleString()}</td><td>${row.versionId}</td><td>${row.range?.from || "-"} → ${row.range?.to || "-"}</td><td>${((row.metrics?.winRate || 0) * 100).toFixed(1)}%</td><td>${formatNumber(row.metrics?.maxDrawdown || 0, 2)}</td><td><span class="badge ${row.pass ? "call" : "put"}">${row.pass ? "pass" : "fail"}</span></td></tr>`).join("")
      : '<tr><td colspan="6" class="muted">No out-of-sample validations yet.</td></tr>';
  }

  const liveInstances = (strategyLifecycleState.liveInstances || []).filter((row) => row.strategyId === strategyId).slice(0, 20);
  if (els.slLiveBody) {
    els.slLiveBody.innerHTML = liveInstances.length
      ? liveInstances.map((row) => `<tr><td>${row.instanceId}</td><td>${row.versionId}</td><td>${row.symbol}</td><td>${row.timeframe}</td><td>${row.status}</td><td>${((row.liveMetrics?.rollingWinrate || 0) * 100).toFixed(1)}%</td><td>${formatNumber(row.liveMetrics?.rollingExpectancy || 0, 2)}</td><td>${formatNumber(row.liveMetrics?.drawdown || 0, 2)}</td><td>${row.degrading ? '<span class="badge put">degrading</span>' : '<span class="badge call">ok</span>'}</td></tr>`).join("")
      : '<tr><td colspan="9" class="muted">No live shadow instances yet.</td></tr>';
  }

  if (els.strategyLifecycleWrap) {
    const alerts = (strategyLifecycleState.degradationAlerts || []).slice(0, 5);
    els.strategyLifecycleWrap.innerHTML = alerts.length
      ? alerts.map((row) => `<div class="panel-soft tiny"><strong>${row.strategyId} ${row.versionId}</strong> · ${new Date(row.timestamp).toLocaleString()} · ${row.message}</div>`).join("")
      : '<div class="panel-soft muted tiny">No degradation alerts.</div>';
  }
}

async function runStrategyLabBacktest() {
  try {
    const selectedStrategyId = els.slStrategy?.value || strategyLabConfig.strategyId;
    const symbol = els.slSymbol?.value || marketDataMeta.selectedSymbol;
    const timeframe = els.slTimeframe?.value || marketDataMeta.selectedTimeframe;
    const rangeBars = Number(els.slRangeBars?.value || 500);
    const parsedInput = parseStrategyLabJsonInput();
    const lifecycleVersion = ensureLifecycleVersion(parsedInput.strategyDefinition?.strategyId || selectedStrategyId, parsedInput, "draft");
    let runtime = buildStrategyRuntimeContext(symbol, timeframe);
    let candles = runtime.candles.slice(-Math.max(100, rangeBars));
    if (candles.length < 100) {
      setStrategyLabStatus(`No valid dataset loaded. Fetch ${Math.min(5000, Math.max(500, rangeBars))} ${symbol} ${timeframe} candles now...`, "muted");
      await loadStrategyLabHistory();
      runtime = buildStrategyRuntimeContext(symbol, timeframe);
      candles = runtime.candles.slice(-Math.max(100, rangeBars));
    }
    if (candles.length < 100) {
      setStrategyLabStatus(`Need at least 100 candles, only ${candles.length} are loaded for ${symbol} ${timeframe}.`, "warn");
      return;
    }
    const features = buildStrategyFeatures(candles, runtime);
    const parsed = parsedInput.paramsPayload;
    const customStrategyId = parsedInput.strategyDefinition?.strategyId || selectedStrategyId;
    strategyLabConfig = {
      strategyId: customStrategyId,
      jsonMode: parsedInput.mode,
      customStrategyDefinition: parsedInput.strategyDefinition || null,
      ...parsed,
    };
    const variants = parsed.variants?.length
      ? parsed.variants
      : [{
        label: "Base",
        strategyId: customStrategyId,
        params: parsed.params,
        risk: parsed.risk,
        execution: parsed.execution,
        customStrategyDefinition: parsedInput.strategyDefinition || null,
      }];
    latestStrategyBatchResults = variants.map((variant) => {
      const runStrategyId = variant.strategyId || customStrategyId;
      const runConfig = {
        strategyId: runStrategyId,
        params: variant.params || parsed.params,
        risk: variant.risk || parsed.risk,
        execution: { ...strategyLabConfig.execution, ...(variant.execution || {}) },
        customStrategyDefinition: variant.customStrategyDefinition || parsedInput.strategyDefinition || null,
      };
      const result = runStrategyBacktest({ strategyId: runStrategyId, candles, features, strategyConfig: runConfig, runtimeContext: runtime });
      return { label: variant.label, strategyId: runStrategyId, config: runConfig, metrics: result.metrics, trades: result.trades };
    });
    latestStrategyBatchResults.sort((a, b) => (Number(b.metrics?.netPnl || 0) - Number(a.metrics?.netPnl || 0)));
    const best = latestStrategyBatchResults[0];
    latestStrategyResult = { metrics: best?.metrics || {}, trades: best?.trades || [] };
    strategyLabConfig = best?.config || strategyLabConfig;
    strategyLabRlProbe = new RlEnvironmentAdapter({ candles, features, windowSize: 20 });
    const firstState = strategyLabRlProbe.reset();
    setStrategyLabStatus(`Backtest completed (${latestStrategyBatchResults.length} run${latestStrategyBatchResults.length > 1 ? "s" : ""}). ${parsedInput.summary} Best: ${best?.label || best?.strategyId} · version ${lifecycleVersion?.versionId || selectedStrategyVersionId} · ${best?.trades?.length || 0} trades · RL state window ${firstState?.candlesWindow?.length || 0}.`, "success");
    renderStrategyLab();
  } catch (error) {
    console.error("[StrategyLab] run failed", error);
    setStrategyLabStatus(error.message, "error");
  }
}

async function handleSaveStrategyRun() {
  if (!latestStrategyResult) {
    setStrategyLabStatus("Run a backtest first.", "warn");
    return;
  }
  const strategy = getStrategyById(strategyLabConfig.strategyId);
  const run = await persistStrategyRun({
    strategyId: strategyLabConfig.strategyId,
    versionId: selectedStrategyVersionId || "v1",
    strategyName: strategyLabConfig.customStrategyDefinition?.name || strategy?.name || strategyLabConfig.strategyId,
    strategyType: strategyLabConfig.customStrategyDefinition ? "rule-based-json" : strategy?.type,
    parameters: strategyLabConfig,
    symbol: els.slSymbol?.value || marketDataMeta.selectedSymbol,
    timeframe: els.slTimeframe?.value || marketDataMeta.selectedTimeframe,
    candleRange: { bars: Number(els.slRangeBars?.value || 500) },
    metrics: latestStrategyResult.metrics,
    trades: latestStrategyResult.trades,
    notes: els.slRunNotes?.value || "",
    batchSummary: latestStrategyBatchResults.length > 1
      ? latestStrategyBatchResults.map((row) => ({ label: row.label, strategyId: row.strategyId, metrics: row.metrics }))
      : null,
  });
  strategyRuns = [run, ...strategyRuns.filter((row) => row.id !== run.id)].slice(0, 200);
  await saveStrategyRuns(strategyRuns);
  strategyLifecycleState = updateVersionStatus(strategyLifecycleState, run.strategyId, run.versionId || selectedStrategyVersionId || "v1", "tested");
  persistStrategyLifecycle();
  if (strategyLabConfig.customStrategyDefinition) {
    const defs = Array.isArray(botCompilerState.strategyJsonDefinitions) ? botCompilerState.strategyJsonDefinitions : [];
    const nextDefs = [
      { ...strategyLabConfig.customStrategyDefinition, savedAt: new Date().toISOString() },
      ...defs.filter((row) => row.strategyId !== strategyLabConfig.customStrategyDefinition.strategyId),
    ].slice(0, 100);
    botCompilerState = { ...botCompilerState, strategyJsonDefinitions: nextDefs };
    persistBotCompiler();
  }
  selectedStrategyRunId = run.id;
  setStrategyLabStatus("Strategy run saved.", "success");
  renderStrategyLab();
}

function handleLoadStrategyRun() {
  const row = strategyRuns.find((run) => run.id === selectedStrategyRunId);
  if (!row) {
    setStrategyLabStatus("Select a saved run first.", "warn");
    return;
  }
  latestStrategyResult = { metrics: row.metrics || {}, trades: row.trades || [] };
  latestStrategyBatchResults = [];
  strategyLabConfig = row.parameters || strategyLabConfig;
  strategyLabJsonMode = strategyLabConfig.customStrategyDefinition ? "strategy" : (strategyLabConfig.jsonMode || "parameters");
  if (els.slStrategy) els.slStrategy.value = row.strategyId;
  if (els.slSymbol) els.slSymbol.value = row.symbol;
  if (els.slTimeframe) els.slTimeframe.value = row.timeframe;
  if (els.slRangeBars) els.slRangeBars.value = String(row.candleRange?.bars || 500);
  if (els.slParams) els.slParams.value = JSON.stringify(strategyLabConfig, null, 2);
  selectedStrategyVersionId = row.versionId || selectedStrategyVersionId;
  if (els.slRunNotes) els.slRunNotes.value = row.notes || "";
  setStrategyLabStatus(`Loaded run ${row.id}.`, "success");
  renderStrategyLab();
}

async function handleValidateStrategyVersion() {
  const strategyId = els.slStrategy?.value || strategyLabConfig.strategyId;
  const versionId = selectedStrategyVersionId;
  if (!versionId) {
    setStrategyLabStatus("Select a strategy version first.", "warn");
    return;
  }
  const run = strategyRuns.find((row) => row.strategyId === strategyId && (row.versionId || "v1") === versionId);
  if (!run) {
    setStrategyLabStatus("Save an in-sample backtest run first.", "warn");
    return;
  }
  const runtime = buildStrategyRuntimeContext(run.symbol, run.timeframe);
  const candles = runtime.candles.slice(-(Number(els.slRangeBars?.value || 500)));
  const split = Math.max(100, Math.floor(candles.length * 0.3));
  const outSample = candles.slice(-split);
  if (outSample.length < 60) {
    setStrategyLabStatus("Need at least 60 out-of-sample candles.", "warn");
    return;
  }
  const features = buildStrategyFeatures(outSample, { ...runtime, candles: outSample });
  const result = runStrategyBacktest({ strategyId, candles: outSample, features, strategyConfig: run.parameters || strategyLabConfig, runtimeContext: runtime });
  const back = run.metrics || {};
  const metrics = result.metrics || {};
  const pass = (metrics.winRate || 0) >= 0.45
    && (back.winRate ? (metrics.winRate >= Math.max(0, back.winRate - 0.12)) : true)
    && Math.abs(Number(metrics.maxDrawdown || 0)) <= Math.abs(Number(back.maxDrawdown || 0)) * 1.25;

  const validationResult = addValidationResult(strategyLifecycleState, {
    strategyId,
    versionId,
    range: { from: outSample[0]?.timestamp || null, to: outSample[outSample.length - 1]?.timestamp || null },
    metrics,
    pass,
    comparedBacktest: back,
  });
  strategyLifecycleState = validationResult.state;
  persistStrategyLifecycle();
  setStrategyLabStatus(`Validation ${pass ? "passed" : "failed"} for ${strategyId} ${versionId}.`, pass ? "success" : "warn");
  renderStrategyLab();
}

async function handlePromoteStrategyVersionLive() {
  const strategyId = els.slStrategy?.value || strategyLabConfig.strategyId;
  const versionId = selectedStrategyVersionId;
  const validated = (strategyLifecycleState.validations || []).find((row) => row.strategyId === strategyId && row.versionId === versionId && row.pass);
  if (!validated) {
    setStrategyLabStatus("Only validated strategy versions can be promoted.", "warn");
    return;
  }
  const baselineBacktest = strategyRuns.find((row) => row.strategyId === strategyId && (row.versionId || "v1") === versionId)?.metrics || null;
  const promoted = promoteVersionToLiveShadow(strategyLifecycleState, {
    strategyId,
    versionId,
    symbol: els.slSymbol?.value || marketDataMeta.selectedSymbol,
    timeframe: els.slTimeframe?.value || marketDataMeta.selectedTimeframe,
    baselineBacktest,
    baselineValidation: validated.metrics,
  });
  strategyLifecycleState = promoted.state;
  persistStrategyLifecycle();
  setStrategyLabStatus(`Promoted ${strategyId} ${versionId} to Live Shadow.`, "success");
  renderStrategyLab();
}

function handleCloneDegradingVersion() {
  const degrading = (strategyLifecycleState.liveInstances || []).find((row) => row.degrading);
  if (!degrading) {
    setStrategyLabStatus("No degrading live version detected.", "warn");
    return;
  }
  const base = (strategyLifecycleState.versions || []).find((row) => row.strategyId === degrading.strategyId && row.versionId === degrading.versionId);
  if (!base) return;
  const created = createStrategyVersion(strategyLifecycleState, {
    strategyId: base.strategyId,
    name: base.name,
    description: `${base.description || ""} (clone from degrading ${base.versionId})`.trim(),
    definition: base.definition,
    parentVersionId: base.versionId,
    status: "draft",
  });
  strategyLifecycleState = created.state;
  selectedStrategyVersionId = created.version.versionId;
  persistStrategyLifecycle();
  if (els.slParams) els.slParams.value = JSON.stringify(base.definition?.paramsPayload || strategyLabConfig, null, 2);
  setStrategyLabStatus(`Cloned ${base.versionId} into ${created.version.versionId}.`, "success");
  renderStrategyLab();
}

async function handleApproveStrategyRun() {
  const row = strategyRuns.find((run) => run.id === selectedStrategyRunId);
  if (!row) {
    setStrategyLabStatus("Select a saved run before approving.", "warn");
    return;
  }
  const approvedAt = new Date().toISOString();
  strategyRuns = strategyRuns.map((run) => run.id === row.id
    ? { ...run, approvedForLiveShadow: true, approvedAt }
    : run);
  await saveStrategyRuns(strategyRuns);
  strategyLifecycleState = updateVersionStatus(strategyLifecycleState, row.strategyId, row.versionId || "v1", "approved");
  persistStrategyLifecycle();
  setStrategyLabStatus(`Run ${row.id} approved for Live Shadow.`, "success");
  renderStrategyLab();
}

function rerender() {
  renderPreview(els.preview, state.importPreview);
  renderImportReport(els.importReport, loadLastImportReport());
  refreshSyntheticLearningRatio();
  refreshSharedOptions();
  refreshFeed();
  refreshReviewQueue();
  refreshRadar();
  refreshStats();
  refreshCompare();
  refreshVersions();
  refreshConfidenceEvolution();
  refreshNotes();
  refreshJournalTrades();
  refreshV5();
  refreshBotGenerator();
  refreshRobustnessLab();
  refreshSessionCandlesTab();
  refreshStorageStatusUI();
  refreshLibraryPanel();
  renderStrategyLab();
  renderPatternReviewPanel();
  renderSeededPatternLab();
  microBotTab?.render?.();
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
    journalTrades = loadJournalTrades();
    brainTradeJournal.hydrate(journalTrades);
    libraryItems = loadLibraryItems();
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

function importStrategyRecordToSignals(record, options = {}) {
  if (options?.origin === "shadow" && !allowShadowTradeExecution()) return false;
  const result = importStrategySignal(record, state.signals, options);
  if (!result.changed) return false;
  replaceSignals(result.signals);
  return true;
}

function syncLiveShadowToUnifiedPipeline(records = [], options = {}) {
  if (options?.origin === "shadow" && !allowShadowTradeExecution()) return false;
  if (!Array.isArray(records) || !records.length) return false;
  let changed = false;
  let nextSignals = state.signals;
  records.forEach((record) => {
    const imported = importStrategySignal(record, nextSignals, options);
    if (imported.changed) {
      changed = true;
      nextSignals = imported.signals;
    }
  });
  if (changed) replaceSignals(nextSignals);
  return changed;
}

function getSyntheticExample() {
  return {
    schema: "patternlab_synthetic_trades_v1",
    origin: "assistant_demo",
    rows: [
      {
        symbol: "EURUSD",
        timeframe: "5m",
        direction: "PUT",
        entryTimestamp: new Date().toISOString(),
        outcome: "win",
        confidence: 0.64,
        lessonTags: ["failed_breakout", "mean_reversion"],
      },
    ],
  };
}

function handleInjectSyntheticTrades(rawInput = null) {
  const raw = String(rawInput ?? assistedUiState.syntheticInput ?? els.jsonInput?.value ?? "").trim();
  if (!raw) {
    setQuickAddFeedback("Pega un JSON con schema patternlab_synthetic_trades_v1.", true);
    return;
  }
  const result = ingestSyntheticTrades(raw, { origin: "ui-import" });
  if (!result.ok) {
    assistedUiState = {
      ...assistedUiState,
      syntheticValid: false,
      syntheticError: result.message || "No se pudo validar synthetic trades.",
    };
    persistAssistedUiState();
    setQuickAddFeedback(result.message || "No se pudo validar synthetic trades.", true);
    return;
  }
  assistedUiState = {
    ...assistedUiState,
    syntheticInput: raw,
    syntheticValid: true,
    syntheticError: "",
    syntheticLastImportAt: new Date().toISOString(),
  };
  persistAssistedUiState();

  const applied = applySyntheticTradesToLearning(result.rows || []);
  const snapshot = getSyntheticLearningSnapshot();
  const tagCount = Object.keys(snapshot.lessonTags || {}).length;
  console.info("[Synthetic] Trades injected");
  setQuickAddFeedback(`Synthetic trades importadas: ${result.imported}. Learning weighted +${applied.weightedApplied}. Lesson tags: ${tagCount}.`, false);
  rerender();
}

function handleClearSyntheticInput() {
  updateSyntheticInput("");
}

function handleLoadSyntheticExample() {
  updateSyntheticInput(JSON.stringify(getSyntheticExample(), null, 2));
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

async function copySessionExportText(value) {
  if (!value) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  return false;
}

function buildSessionAssistedExportContext() {
  const active = getActiveSession();
  const viewed = state.sessions.find((row) => row.id === sessionHistoryId) || active;
  const marketView = getSessionMarketView();
  const latestPolicy = liveShadowMonitor.getRecords().find((row) => row.symbol === marketView.symbol && row.timeframe === marketView.timeframe) || null;
  const livePlanRecord = getSessionLivePlanRecord(marketView);
  const analysis = buildSessionCandleAnalysis(marketView.candles, {
    symbol: marketView.symbol,
    timeframe: marketView.timeframe,
    source: marketView.source,
    policy: latestPolicy ? { action: latestPolicy.policy?.action, confidence: latestPolicy.policy?.confidence, timestamp: latestPolicy.timestamp } : null,
    shadow: latestPolicy
      ? {
        status: latestPolicy.outcome?.status,
        action: latestPolicy.policy?.action,
        operatorAction: latestPolicy.decisionTrace?.operatorCorrected?.finalAction || null,
        operatorState: latestPolicy.decisionTrace?.operatorCorrected?.finalState || null,
        operatorInfluence: latestPolicy.decisionTrace?.operatorCorrected?.operatorInfluence || [],
        timestamp: latestPolicy.timestamp,
      }
      : null,
  });
  return {
    mode: marketView.connected ? "live_session" : "manual_session",
    session: viewed || active || null,
    marketView,
    analysis,
    analystData: sessionAnalystState.analystData || null,
    livePlanRecord,
    operatorState: sessionOperatorState,
    manualDrawings: _sessionManualSR || [],
    triggerLines: _sessionTriggerLines || [],
    humanInsights: _sessionHumanInsights || [],
    selectedCandleIndex: selectedSessionCandleIndex || null,
    brainVerdict: _lastBrainVerdict,
    scenarioProjection: scenarioProjectionState.activeSet,
    executionPacket: getExecutionPacket(executionControlState),
    executionControlState,
    eventTimeline: brainMemoryStore.getSnapshot().events,
    tradeTakenBy: latestPolicy ? "shadow" : "manual",
  };
}

function loadAssistedReinforcementHistory() {
  try {
    const raw = localStorage.getItem(ASSISTED_REINFORCEMENT_HISTORY_KEY) || localStorage.getItem("patternlab.assistedReinforcementHistory.v1");
    const parsed = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(parsed) ? parsed.slice(-80) : [];
    assistedReinforcementState = {
      ...assistedReinforcementState,
      history,
      lastSummary: history.length ? history[history.length - 1]?.reinforcement_summary || null : null,
      lastAppliedAt: history.length ? history[history.length - 1]?.timestamp || null : null,
    };
  } catch {
    assistedReinforcementState = { ...assistedReinforcementState, history: [], lastSummary: null, lastAppliedAt: null };
  }
}

function loadAssistedUiState() {
  try {
    const raw = sessionStorage.getItem(ASSISTED_UI_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    assistedUiState = {
      ...assistedUiState,
      reinforcementInput: String(parsed?.reinforcementInput || ""),
      syntheticInput: String(parsed?.syntheticInput || ""),
    };
  } catch {}
  updateReinforcementInput(assistedUiState.reinforcementInput);
  updateSyntheticInput(assistedUiState.syntheticInput);
}

function persistAssistedReinforcementHistory() {
  try {
    localStorage.setItem(ASSISTED_REINFORCEMENT_HISTORY_KEY, JSON.stringify((assistedReinforcementState.history || []).slice(-80)));
  } catch {}
}

function persistAssistedUiState() {
  try {
    sessionStorage.setItem(ASSISTED_UI_STATE_KEY, JSON.stringify({
      reinforcementInput: assistedUiState.reinforcementInput || "",
      syntheticInput: assistedUiState.syntheticInput || "",
    }));
  } catch {}
}

function downloadJsonFile(payload, fileName = "patternlab-brain-assist.json") {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 50);
}

function updateReinforcementInput(rawText = assistedUiState.reinforcementInput || "") {
  const text = String(rawText || "");
  const trimmed = text.trim();
  if (!trimmed) {
    assistedUiState = {
      ...assistedUiState,
      reinforcementInput: "",
      reinforcementValid: false,
      reinforcementError: "",
    };
    persistAssistedUiState();
    return;
  }
  const ingested = ingestCopilotReinforcement(trimmed);
  assistedUiState = {
    ...assistedUiState,
    reinforcementInput: text,
    reinforcementValid: ingested.ok,
    reinforcementError: ingested.ok ? "" : ingested.errors.join("; "),
  };
  persistAssistedUiState();
}

function updateSyntheticInput(rawText = assistedUiState.syntheticInput || "") {
  const text = String(rawText || "");
  const trimmed = text.trim();
  if (!trimmed) {
    assistedUiState = {
      ...assistedUiState,
      syntheticInput: "",
      syntheticValid: false,
      syntheticError: "",
    };
    persistAssistedUiState();
    return;
  }
  try {
    JSON.parse(trimmed);
    assistedUiState = {
      ...assistedUiState,
      syntheticInput: text,
      syntheticValid: true,
      syntheticError: "",
    };
    console.info("[Synthetic] JSON validated");
  } catch (error) {
    assistedUiState = {
      ...assistedUiState,
      syntheticInput: text,
      syntheticValid: false,
      syntheticError: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
  persistAssistedUiState();
}

function getReinforcementExample() {
  return {
    schema: "patternlab_copilot_reinforcement_v1",
    verdict_patch: { confidence_delta: 0.08, bias: "short", posture: "wait_for_retest", allow_trade: false },
    rule_updates: [{ rule_id: "failed_breakout_short", action: "activate", weight: 1.2, reason: "Recent failed breakout behavior repeated." }],
    scenario_updates: [{ scenario_name: "failed_breakout", probability: 0.58, priority: 1, reason: "Momentum exhaustion at resistance." }],
    risk_patch: { size_multiplier: 0.82, max_size_cap: 0.9 },
    learning_patch: { learned_bias: "fade_failed_breakout", danger_score: 0.42, familiarity: 0.67, lesson_tags: ["failed_breakout", "momentum_shift", "risk_compact"] },
    next_candle_patch: { posture: "wait_for_retest", trigger_short: "break below session low after retest", invalidation: "close above local failed-breakout high", reasoning_summary: "Short only after confirmation retest." },
    assistant_summary: { headline: "Reduce aggression and favor failed-breakout short confirmation." },
  };
}

async function handleSessionExportBrainAssist() {
  const context = buildSessionAssistedExportContext();
  const exportPacket = buildBrainAssistPacket({
    ...context,
    learningProgress: learningProgressPacket,
    riskProfile: executorStateStore.getState()?.lastRiskProfile || null,
    manualControls: manualControlsState,
  });
  const payloadText = JSON.stringify(exportPacket, null, 2);
  const copied = await copySessionExportText(payloadText);
  console.info("[Assist] Brain Assist exported");
  const symbol = context.marketView?.symbol || "asset";
  const tf = context.marketView?.timeframe || "tf";
  downloadJsonFile(exportPacket, `patternlab-brain-assist-${symbol}-${tf}.json`);
  if (copied) {
    setSessionCandleStatus("Brain Assist JSON copied", "success");
    return;
  }
  window.prompt("Copy Brain Assist packet", payloadText);
  setSessionCandleStatus("Clipboard unavailable: Brain Assist JSON opened in prompt.", "warning");
}

function handleApplyReinforcementJSON() {
  const raw = assistedUiState.reinforcementInput;
  if (!raw?.trim()) return;
  const marketView = getSessionMarketView();
  const contextSignature = buildSessionContextSignature({
    analysis: sessionOperatorState?.currentContext?.analysisSnapshot || null,
    symbol: marketView?.symbol || null,
    timeframe: marketView?.timeframe || null,
  });
  const reinforcementContextSignature = scenarioProjectionState.activeSet?.context_signature || _lastBrainVerdict?.learningEffects?.signature || contextSignature || null;
  const linkage = {
    sessionId: getActiveSession()?.id || null,
    symbol: getSessionMarketView()?.symbol || null,
    timeframe: getSessionMarketView()?.timeframe || null,
    context_signature: reinforcementContextSignature,
  };
  const result = applyReinforcement(raw, {
    patchApplier: applyReinforcementPatch,
    patchOptions: {
      brainVerdict: _lastBrainVerdict,
      scenarioSet: scenarioProjectionState.activeSet,
      brainMemoryStore,
      contextSignature: reinforcementContextSignature,
      linkage,
      riskCaps: { maxSizeMultiplier: Number(manualControlsState?.max_risk_cap ?? 1) },
      log: (line) => console.info(line),
    },
  });
  if (!result.ok) {
    assistedUiState = {
      ...assistedUiState,
      reinforcementValid: false,
      reinforcementError: result.errors.join("; "),
    };
    persistAssistedUiState();
    setSessionCandleStatus(`Invalid reinforcement JSON: ${result.errors.join("; ")}`, "error");
    return;
  }
  console.info("[Assist] Reinforcement received");
  const applied = result.result;
  _lastBrainVerdict = applied.brainVerdict;
  console.info(`[Confidence] applied reinforcement delta ${applied.stats.confidenceDelta >= 0 ? "+" : ""}${applied.stats.confidenceDelta.toFixed(3)}`);
  const executorState = executorStateStore.getState();
  const currentPlan = executorState?.currentPlan || null;
  if (currentPlan) {
    const nextRiskProfile = computeRiskSizing({
      brainVerdict: _lastBrainVerdict,
      autoShift: _lastBrainVerdict?.auto_shift || {},
      contextMemory: currentPlan?.context_signature ? (brainMemoryStore.getSnapshot()?.contexts?.[currentPlan.context_signature] || {}) : {},
      learningProgress: learningProgressPacket || {},
      scenarioReliability: currentPlan?.scenario_primary?.reliability,
      executorMode: executorState?.mode || "paper",
      scenario: currentPlan?.scenario_primary || {},
      executionPacket: getExecutionPacket(executionControlState),
      config: {
        learningProfile: executorState?.learningProfile,
      },
    });
    executorStateStore.setState({
      lastRiskProfile: nextRiskProfile,
      currentPlan: {
        ...currentPlan,
        setup_name: applied?.brainVerdict?.next_candle_plan?.posture || currentPlan.setup_name,
        trigger: applied?.brainVerdict?.next_candle_plan?.trigger_long || applied?.brainVerdict?.next_candle_plan?.trigger_short || currentPlan.trigger,
        invalidation: applied?.brainVerdict?.next_candle_plan?.invalidation || currentPlan.invalidation,
        scenario_primary: applied?.scenarioSet?.scenarios?.[0] || currentPlan.scenario_primary,
        brain_verdict_snapshot: _lastBrainVerdict,
        risk_profile: nextRiskProfile,
      },
    });
  }
  if (scenarioProjectionState.activeSet) scenarioProjectionState.activeSet = applied.scenarioSet;
  const historyRow = {
    timestamp: new Date().toISOString(),
    source: result.reinforcement?.source || "external_assistant",
    summary: [
      `confidence ${applied.stats.confidenceDelta >= 0 ? "+" : ""}${applied.stats.confidenceDelta.toFixed(2)}`,
      applied.stats.rulesUpdated ? `rules ${applied.stats.rulesUpdated}` : null,
      applied.stats.scenarioChanges ? `scenarios ${applied.stats.scenarioChanges}` : null,
      (applied.stats.lessonTagsAdded || []).length ? `tags ${(applied.stats.lessonTagsAdded || []).length}` : null,
    ].filter(Boolean).join(" · "),
    changes: applied.appliedFields,
    raw_json: result.reinforcement,
    reinforcement_summary: {
      headline: applied.stats.headline,
      rulesUpdated: applied.stats.rulesUpdated,
      confidenceDelta: applied.stats.confidenceDelta,
      scenarioChanges: applied.stats.scenarioChanges,
      lessonTagsAdded: applied.stats.lessonTagsAdded,
    },
    applied_fields: applied.appliedFields,
  };
  assistedReinforcementState.history = [...(assistedReinforcementState.history || []).slice(-79), historyRow];
  assistedReinforcementState.lastSummary = historyRow.reinforcement_summary;
  assistedReinforcementState.lastAppliedAt = historyRow.timestamp;
  persistAssistedReinforcementHistory();
  brainMemoryStore.addEvent(createBrainEvent("assist_reinforcement_applied", historyRow, linkage));
  setSessionCandleStatus(`Reinforcement applied:
+ confidence ${applied.stats.confidenceDelta >= 0 ? "+" : ""}${applied.stats.confidenceDelta.toFixed(2)}
+ rules updated ${applied.stats.rulesUpdated}
+ scenario changes ${applied.stats.scenarioChanges}
+ learning tags added ${(applied.stats.lessonTagsAdded || []).length}`, "success");
}

function handleClearReinforcementInput() {
  updateReinforcementInput("");
}

function handleLoadReinforcementExample() {
  updateReinforcementInput(JSON.stringify(getReinforcementExample(), null, 2));
}

function handleResetLastReinforcement() {
  const history = Array.isArray(assistedReinforcementState.history) ? [...assistedReinforcementState.history] : [];
  history.pop();
  assistedReinforcementState.history = history;
  assistedReinforcementState.lastSummary = history.length ? history[history.length - 1].reinforcement_summary : null;
  persistAssistedReinforcementHistory();
  setSessionCandleStatus("Last reinforcement reset.", "warning");
}

async function handleSessionExportForChatGPT() {
  const context = buildSessionAssistedExportContext();
  const hasSession = Boolean(context.session?.id);
  const hasMarket = Boolean(context.marketView?.candles?.length);
  if (!hasSession && !hasMarket) {
    setSessionCandleStatus("Nothing to export yet. Create a session or load market candles.", "warning");
    return;
  }
  const exportBundle = buildChatGPTAssistedExport(context);
  const payloadText = JSON.stringify(exportBundle, null, 2);
  const clipboardText = `${exportBundle.prompt_ready_text}

${payloadText}`;
  const copied = await copySessionExportText(clipboardText);
  if (copied) {
    setSessionCandleStatus("Export for ChatGPT copied to clipboard (prompt + JSON).", "success");
    return;
  }
  window.prompt("Copy ChatGPT assisted export (prompt + JSON)", clipboardText);
  setSessionCandleStatus("Clipboard unavailable: export opened in prompt modal.", "warning");
}


function setLibraryInputStatus(message, tone = "muted") {
  if (!els.libraryInputStatus) return;
  els.libraryInputStatus.className = `quick-add-feedback ${tone}`;
  els.libraryInputStatus.textContent = message;
}

function getLibraryItems() {
  return Array.isArray(libraryItems) ? libraryItems : [];
}

function upsertLibraryItem(item) {
  const next = [...getLibraryItems()];
  const index = next.findIndex((row) => row.id === item.id);
  if (index >= 0) next[index] = item;
  else next.unshift(item);
  libraryItems = next;
  saveLibraryItems(libraryItems).catch((error) => console.error("[Library] save failed", error));
}

function removeLibraryItem(id) {
  libraryItems = getLibraryItems().filter((item) => item.id !== id);
  if (selectedLibraryItemId === id) selectedLibraryItemId = "";
  saveLibraryItems(libraryItems).catch((error) => console.error("[Library] save failed", error));
}

function toggleLibraryItemActive(id) {
  libraryItems = getLibraryItems().map((item) => item.id === id ? { ...item, active: !item.active } : item);
  saveLibraryItems(libraryItems).catch((error) => console.error("[Library] save failed", error));
}

function getFilteredLibraryItems() {
  const search = String(libraryFilters.search || "").trim().toLowerCase();
  return getLibraryItems().filter((item) => {
    if (libraryFilters.type && item.type !== libraryFilters.type) return false;
    if (libraryFilters.active === "active" && item.active === false) return false;
    if (libraryFilters.active === "inactive" && item.active !== false) return false;
    if (!search) return true;
    const haystack = [item.id, item.name, ...(item.tags || [])].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

function refreshLibraryPanel() {
  if (!els.libraryItemsBody) return;
  const rows = getFilteredLibraryItems();
  if (!rows.length) {
    els.libraryItemsBody.innerHTML = '<tr><td colspan="7" class="muted tiny">No library items found.</td></tr>';
  } else {
    els.libraryItemsBody.innerHTML = rows.map((item) => {
      const statusClass = item.active === false ? "library-status-inactive" : "library-status-active";
      return `<tr>
        <td>${item.id}</td>
        <td>${item.type}</td>
        <td>${item.name}</td>
        <td>${Number(item.priority || 0).toFixed(2)}</td>
        <td>${(item.tags || []).join(", ") || "-"}</td>
        <td class="${statusClass}">${item.active === false ? "inactive" : "active"}</td>
        <td>
          <div class="button-row compact">
            <button class="ghost" data-library-action="toggle" data-library-id="${item.id}">${item.active === false ? "Activate" : "Deactivate"}</button>
            <button class="ghost" data-library-action="inspect" data-library-id="${item.id}">Inspect</button>
            <button class="ghost" data-library-action="delete" data-library-id="${item.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  const selected = getLibraryItems().find((item) => item.id === selectedLibraryItemId) || null;
  if (els.libraryDetailView) {
    els.libraryDetailView.textContent = selected
      ? JSON.stringify(selected, null, 2)
      : "Select an item to inspect full JSON.";
  }

  els.libraryItemsBody.querySelectorAll("[data-library-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.libraryAction;
      const id = btn.dataset.libraryId;
      if (!id) return;
      if (action === "toggle") {
        toggleLibraryItemActive(id);
        refreshLibraryPanel();
        return;
      }
      if (action === "inspect") {
        selectedLibraryItemId = id;
        refreshLibraryPanel();
        return;
      }
      if (action === "delete") {
        if (!window.confirm(`Delete library item '${id}'?`)) return;
        removeLibraryItem(id);
        refreshLibraryPanel();
      }
    });
  });
}

function parseLibraryInput() {
  const raw = String(els.libraryJsonInput?.value || "").trim();
  if (!raw) return { ok: false, error: "Library JSON is empty." };
  try {
    const parsed = JSON.parse(raw);
    return normalizeLibraryItem(parsed);
  } catch (error) {
    return { ok: false, error: error.message || "Invalid JSON." };
  }
}

function handleLibraryValidate() {
  const result = parseLibraryInput();
  libraryInputLastValidation = result;
  if (!result.ok) {
    setLibraryInputStatus(`Validation error: ${result.error}`, "error");
    return;
  }
  setLibraryInputStatus(`Valid ${result.item.type} · ${result.item.id}`, "success");
}

function handleLibrarySave() {
  const result = parseLibraryInput();
  libraryInputLastValidation = result;
  if (!result.ok) {
    setLibraryInputStatus(`Cannot save: ${result.error}`, "error");
    return;
  }
  upsertLibraryItem(result.item);
  selectedLibraryItemId = result.item.id;
  setLibraryInputStatus(`Saved ${result.item.id} to library.`, "success");
  refreshLibraryPanel();
}

function handleLibraryLoadExample() {
  const next = LIBRARY_EXAMPLES[Math.floor(Math.random() * LIBRARY_EXAMPLES.length)];
  if (els.libraryJsonInput) els.libraryJsonInput.value = JSON.stringify(next, null, 2);
  setLibraryInputStatus("Loaded example JSON.", "muted");
}

function setupTabs() {
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.tabs.forEach((b) => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      els.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
      if (tab === "session-candles") {
        // Destroy old chart so it re-mounts with correct size
        if (_sessionChart) { _sessionChart.destroy(); _sessionChart = null; }
        requestAnimationFrame(() => refreshSessionCandlesTab());
      }
      if (tab === "copilot-feedback") {
        renderCopilotFeedbackTabUI();
      }
      if (tab === "library") {
        refreshLibraryPanel();
      }
      if (tab === "microbot") {
        microBotTab?.render?.();
      }
      if (tab === "session-reviewer") {
        sessionReviewerTab?.render?.();
      }
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
  els.slStrategy?.addEventListener("change", () => {
    strategyLabConfig.strategyId = els.slStrategy.value;
    const defaults = getDefaultParams(strategyLabConfig.strategyId);
    if (els.slParams && strategyLabJsonMode === "parameters") els.slParams.value = JSON.stringify({ params: defaults, risk: {}, execution: strategyLabConfig.execution }, null, 2);
    renderStrategyLab();
  });
  els.slJsonMode?.addEventListener("change", () => {
    strategyLabJsonMode = els.slJsonMode.value === "strategy" ? "strategy" : "parameters";
    if (els.slParams) {
      if (strategyLabJsonMode === "strategy") {
        els.slParams.value = JSON.stringify({
          strategyId: "custom_rule_strategy",
          name: "Custom Rule Strategy",
          type: "rule-based",
          entry: { long: ["close > sma20", "rsi14 > 55"], short: ["close < sma50", "rsi14 < 45"] },
          exit: { maxBarsInTrade: 24 },
          risk: { stopLossAtr: 1, takeProfitAtr: 1.8, feeBps: 4, slippageBps: 2, initialEquity: 10000 },
          filters: { session: [], allowLong: true, allowShort: true },
        }, null, 2);
      } else {
        const defaults = getDefaultParams(strategyLabConfig.strategyId);
        els.slParams.value = JSON.stringify({ params: defaults, risk: {}, execution: strategyLabConfig.execution }, null, 2);
      }
    }
    renderStrategyLab();
  });
  els.slLoadHistoryBtn?.addEventListener("click", loadStrategyLabHistory);
  els.slSymbol?.addEventListener("change", renderStrategyLab);
  els.slTimeframe?.addEventListener("change", renderStrategyLab);
  els.slRangeBars?.addEventListener("change", renderStrategyLab);
  els.slParams?.addEventListener("input", () => {
    if (!els.slJsonStatus) return;
    try {
      const parsed = parseStrategyLabJsonInput();
      els.slJsonStatus.className = "quick-add-feedback success";
      els.slJsonStatus.textContent = parsed.summary;
    } catch (error) {
      els.slJsonStatus.className = "quick-add-feedback error";
      els.slJsonStatus.textContent = error.message;
    }
  });
  els.slRunBtn?.addEventListener("click", runStrategyLabBacktest);
  els.slSaveBtn?.addEventListener("click", handleSaveStrategyRun);
  els.slVersion?.addEventListener("change", () => { selectedStrategyVersionId = els.slVersion.value || ""; renderStrategyLab(); });
  els.slValidateBtn?.addEventListener("click", handleValidateStrategyVersion);
  els.slPromoteLiveBtn?.addEventListener("click", handlePromoteStrategyVersionLive);
  els.slCloneDegradingBtn?.addEventListener("click", handleCloneDegradingVersion);

els.slScoreBullMin?.addEventListener("input", () => renderStrategyLab());
els.slScoreBearMin?.addEventListener("input", () => renderStrategyLab());
  els.slLoadBtn?.addEventListener("click", handleLoadStrategyRun);
  els.slApproveBtn?.addEventListener("click", handleApproveStrategyRun);
  els.slRunsBody?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-strategy-run]");
    if (!row) return;
    selectedStrategyRunId = row.getAttribute("data-strategy-run") || "";
    renderStrategyLab();
  });
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
  els.libraryValidateBtn?.addEventListener("click", handleLibraryValidate);
  els.librarySaveBtn?.addEventListener("click", handleLibrarySave);
  els.libraryClearBtn?.addEventListener("click", () => {
    if (els.libraryJsonInput) els.libraryJsonInput.value = "";
    libraryInputLastValidation = null;
    setLibraryInputStatus("Cleared.", "muted");
  });
  els.libraryLoadExampleBtn?.addEventListener("click", handleLibraryLoadExample);
  els.libraryFilterType?.addEventListener("change", (event) => { libraryFilters.type = event.target.value || ""; refreshLibraryPanel(); });
  els.libraryFilterActive?.addEventListener("change", (event) => { libraryFilters.active = event.target.value || "all"; refreshLibraryPanel(); });
  els.libraryFilterSearch?.addEventListener("input", (event) => { libraryFilters.search = event.target.value || ""; refreshLibraryPanel(); });
  els.loadDemoBtn.addEventListener("click", loadDemoJson);
  els.injectSyntheticBtn?.addEventListener("click", handleInjectSyntheticTrades);
  els.search.addEventListener("input", (e) => { setFilter("search", e.target.value); refreshFeed(); });
  els.filterAsset.addEventListener("change", (e) => { setFilter("asset", e.target.value); refreshFeed(); });
  els.filterDirection.addEventListener("change", (e) => { setFilter("direction", e.target.value); refreshFeed(); });
  els.filterPattern.addEventListener("change", (e) => { setFilter("patternName", e.target.value); refreshFeed(); });
  els.filterSource?.addEventListener("change", (e) => { setFilter("source", e.target.value); refreshFeed(); });
  els.filterStrategy?.addEventListener("change", (e) => { setFilter("strategyId", e.target.value); refreshFeed(); });
  els.filterStrategyVersion?.addEventListener("change", (e) => { setFilter("strategyVersionId", e.target.value); refreshFeed(); });
  els.filterStatus.addEventListener("change", (e) => { setFilter("status", e.target.value); refreshFeed(); });
  els.filterTimeframe.addEventListener("change", (e) => { setFilter("timeframe", e.target.value); refreshFeed(); });
  els.filterNearSupport.addEventListener("change", (e) => { setFilter("nearSupport", e.target.value); refreshFeed(); });
  els.filterNearResistance.addEventListener("change", (e) => { setFilter("nearResistance", e.target.value); refreshFeed(); });
  els.filterHasOHLC?.addEventListener("change", (e) => { setFilter("hasOHLC", e.target.value); refreshFeed(); });
  els.filterHasExcursion?.addEventListener("change", (e) => { setFilter("hasExcursion", e.target.value); refreshFeed(); });
  els.filterHasSession?.addEventListener("change", (e) => { setFilter("hasSession", e.target.value); refreshFeed(); });
  els.filterMfeMin?.addEventListener("input", (e) => { setFilter("mfeMin", e.target.value); refreshFeed(); });
  els.filterMaeMax?.addEventListener("input", (e) => { setFilter("maeMax", e.target.value); refreshFeed(); });
  els.statsFilterSource?.addEventListener("change", (e) => { statsFilters = { ...statsFilters, source: e.target.value || "" }; refreshStats(); });
  els.statsFilterStrategy?.addEventListener("change", (e) => { statsFilters = { ...statsFilters, strategyId: e.target.value || "" }; refreshStats(); });
  els.statsFilterVersion?.addEventListener("change", (e) => { statsFilters = { ...statsFilters, versionId: e.target.value || "" }; refreshStats(); });
  els.statsFilterSymbol?.addEventListener("change", (e) => { statsFilters = { ...statsFilters, symbol: e.target.value || "" }; refreshStats(); });
  els.statsFilterTimeframe?.addEventListener("change", (e) => { statsFilters = { ...statsFilters, timeframe: e.target.value || "" }; refreshStats(); });
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
  els.journalTradeFilterStatus?.addEventListener("change", (e) => { journalTradeFilters.status = e.target.value; refreshJournalTrades(); });
  els.journalTradeFilterDirection?.addEventListener("change", (e) => { journalTradeFilters.direction = e.target.value; refreshJournalTrades(); });
  els.journalTradeFilterSource?.addEventListener("change", (e) => { journalTradeFilters.source = e.target.value; refreshJournalTrades(); });
  els.journalTradeFilterSetup?.addEventListener("change", (e) => { journalTradeFilters.setup = e.target.value; refreshJournalTrades(); });
  els.journalTradeSearch?.addEventListener("input", (e) => { journalTradeFilters.search = e.target.value; refreshJournalTrades(); });

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
  els.sessionOperatorActions?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-operator-action]");
    if (!btn) return;
    const action = btn.dataset.operatorAction;
    if (!OPERATOR_FEEDBACK_ACTIONS.includes(action)) return;
    btn.classList.toggle("operator-action-active");
    sessionOperatorState.operatorSelection = getSelectedSessionOperatorActions();
  });
  els.sessionBrainDashboard?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-brain-action]");
    if (!btn) return;
    const action = btn.dataset.brainAction;
    if (action === "approve") brainModeController.approveSuggestion();
    else if (action === "wait") brainModeController.wait();
    else if (action === "invalidate") brainModeController.invalidateIdea();
    else if (action === "bias-long") brainModeController.setManualBiasOverride("long");
    else if (action === "bias-short") brainModeController.setManualBiasOverride("short");
    else if (action === "mode-observer") brainModeController.setMode("observer");
    else if (action === "mode-copilot") brainModeController.setMode("copilot");
    else if (action === "toggle-shadow-auto") {
      const nextEnabled = !executionControlState.shadowExecutionEnabled;
      const nextAuthority = nextEnabled ? "shadow" : "copilot";
      setExecutionControlState({
        shadowExecutionEnabled: nextEnabled,
        executionAuthority: nextAuthority,
        manualConfirmationRequired: true,
      });
      persistLiveShadowState();
    }
    else if (action === "enable-executor") {
      brainModeController.setMode("executor");
      brainModeController.setExecutorEnabled(true);
    } else if (action === "disable-executor") {
      brainModeController.setExecutorEnabled(false);
      brainModeController.setMode("copilot");
    } else if (action === "executor-toggle") {
      const cur = executorStateStore.getState();
      executorStateStore.setState({ enabled: !cur.enabled, paused: false, lastAction: cur.enabled ? "disabled" : "enabled" });
    } else if (action === "executor-mode-paper") {
      executorStateStore.setState({ mode: "paper", liveBlockedReason: null });
    } else if (action === "executor-mode-live") {
      const gate = evaluateExecutorLiveGate(learningProgressPacket, executionControlState);
      if (!gate.allowed) {
        executorStateStore.setState({ mode: "paper", liveBlockedReason: gate.reasons.join(" ") });
        brainMemoryStore.addEvent(createBrainEvent("live_mode_blocked", { reasons: gate.reasons }, {}));
        setSessionCandleStatus(`Live mode blocked: ${gate.reasons[0]}`, "warning");
      } else {
        executorStateStore.setState({ mode: "live", liveBlockedReason: null });
      }
    } else if (action === "executor-arm") {
      const scenario = scenarioProjectionState.activeSet?.scenarios?.[0] || null;
      brainExecutor.armSetup({
        brainVerdict: _lastBrainVerdict,
        nextCandlePlan: _lastBrainVerdict?.next_candle_plan,
        scenario,
        contextSignature: scenario?.context_signature || null,
      });
      setSessionCandleStatus("Brain Executor armed for next qualified trigger.", "success");
    } else if (action === "open-trade-visualizer") {
      openTradeVisualizerModal(getCurrentPacket(), {
        executor: {
          armTrade: () => {
            const scenario = scenarioProjectionState.activeSet?.scenarios?.[0] || null;
            brainExecutor.armSetup({
              brainVerdict: _lastBrainVerdict,
              nextCandlePlan: _lastBrainVerdict?.next_candle_plan,
              scenario,
              contextSignature: scenario?.context_signature || null,
            });
            setSessionCandleStatus("Setup confirmed: Brain Executor armed.", "success");
          },
          placeManualTrade: (tradeData = {}) => {
            const result = brainExecutor.placeManualTrade(tradeData);
            if (result) {
              setSessionCandleStatus(`Manual trade placed: ${tradeData.direction} @ ${Number(tradeData.entry || 0).toFixed(2)}`, "success");
              refreshSessionCandlesTab?.();
              renderBrainDashboardPanel?.();
            } else {
              setSessionCandleStatus("Manual trade rejected. Check levels or close the active trade first.", "warning");
            }
            return result;
          },
        },
        dispatch: ({ type, payload } = {}) => {
          if (type !== "ADJUST_BIAS") return;
          const dir = String(payload?.directionOverride || "").toLowerCase();
          if (["long", "short"].includes(dir)) {
            brainModeController.setManualBiasOverride(dir);
            setSessionCandleStatus(`Bias override set to ${dir}.`, "info");
          }
        },
        executionAuthority: {
          blockCurrentSetup: () => {
            blockCurrentSetup("operator_blocked_setup");
            brainExecutor.cancelArm("operator_blocked_setup");
            setSessionCandleStatus("Current setup blocked by operator.", "warning");
          },
        },
        saveOperatorNote: (note = "", livePacket = {}) => {
          brainMemoryStore.addEvent(createBrainEvent("operator_note", {
            operator_note: String(note || ""),
            next_trade: livePacket?.next_trade || null,
          }, {
            sessionId: getActiveSession()?.id || null,
            symbol: getSessionMarketView()?.symbol || null,
            timeframe: getSessionMarketView()?.timeframe || null,
            context_signature: scenarioProjectionState.activeSet?.context_signature || _lastBrainVerdict?.learningEffects?.signature || null,
          }));
          setSessionCandleStatus("Operator note saved to brain memory.", "success");
        },
        onTradeSync: (trade = {}, livePacket = {}, reason = "") => {
          const contextSnapshot = {
            symbol: getSessionMarketView()?.symbol || null,
            timeframe: getSessionMarketView()?.timeframe || null,
            setupDirection: livePacket?.next_trade?.direction || null,
            reason,
          };
          syncTradeToJournal(trade, { contextSnapshot, setup: livePacket?.next_trade?.setup || null });
        },
      });
    } else if (action === "executor-cancel-arm") {
      brainExecutor.cancelArm("operator_cancel");
    } else if (action === "executor-pause") {
      const cur = executorStateStore.getState();
      executorStateStore.setState({ paused: !cur.paused, lastAction: cur.paused ? "resumed" : "paused" });
    } else if (action === "executor-reset-cooldown") {
      executorStateStore.setState({ cooldownUntil: null, lastAction: "cooldown_reset" });
    } else if (action === "manual-controls-reset") {
      manualControlsState = resetManualControls();
      console.info("[Manual] controls reset to defaults");
    } else if (action === "assist-export") {
      handleSessionExportBrainAssist();
    } else if (action === "assist-download") {
      const context = buildSessionAssistedExportContext();
      const exportPacket = buildBrainAssistPacket({
        ...context,
        learningProgress: learningProgressPacket,
        riskProfile: executorStateStore.getState()?.lastRiskProfile || null,
        manualControls: manualControlsState,
      });
      const symbol = context.marketView?.symbol || "asset";
      const tf = context.marketView?.timeframe || "tf";
      downloadJsonFile(exportPacket, `patternlab-brain-assist-${symbol}-${tf}.json`);
      setSessionCandleStatus("Brain Assist JSON downloaded", "success");
    } else if (action === "assist-apply") {
      handleApplyReinforcementJSON();
    } else if (action === "assist-clear") {
      handleClearReinforcementInput();
    } else if (action === "assist-example") {
      handleLoadReinforcementExample();
    } else if (action === "assist-synthetic-inject") {
      handleInjectSyntheticTrades(assistedUiState.syntheticInput);
    } else if (action === "assist-synthetic-clear") {
      handleClearSyntheticInput();
    } else if (action === "assist-synthetic-example") {
      handleLoadSyntheticExample();
    } else if (action === "assist-reset") {
      handleResetLastReinforcement();
    }
    refreshSessionCandlesTab();
    renderBrainDashboardPanel();
  });
  els.sessionBrainDashboard?.addEventListener("input", (event) => {
    const reinforcementInput = event.target.closest("[data-brain-control='reinforcement-input']");
    if (reinforcementInput) {
      updateReinforcementInput(reinforcementInput.value);
      syncAssistedInputIndicators();
      return;
    }
    const syntheticInput = event.target.closest("[data-brain-control='synthetic-input']");
    if (syntheticInput) {
      updateSyntheticInput(syntheticInput.value);
      syncAssistedInputIndicators();
      return;
    }
    const input = event.target.closest("[data-manual-control]");
    if (!input) return;
    const key = input.dataset.manualControl;
    let value = input.type === "checkbox" ? Boolean(input.checked) : input.value;
    if (key !== "force_learning_mode" && input.type !== "checkbox") value = Number(value);
    if (key === "force_learning_mode" && !value) value = null;
    manualControlsState = setManualControls({ [key]: value });
    renderBrainDashboardPanel();
  });
  els.sessionBrainDashboard?.addEventListener("change", (event) => {
    const reinforcementInput = event.target.closest("[data-brain-control='reinforcement-input']");
    if (reinforcementInput) {
      const parsed = ingestCopilotReinforcement(reinforcementInput.value);
      if (parsed.ok) {
        updateReinforcementInput(JSON.stringify(parsed.reinforcement, null, 2));
      } else {
        updateReinforcementInput(reinforcementInput.value);
      }
      renderBrainDashboardPanel();
      return;
    }
    const syntheticInput = event.target.closest("[data-brain-control='synthetic-input']");
    if (syntheticInput) {
      updateSyntheticInput(syntheticInput.value);
      renderBrainDashboardPanel();
      return;
    }
    const input = event.target.closest("[data-manual-control]");
    if (!input || input.type === "range") return;
    const key = input.dataset.manualControl;
    let value = input.type === "checkbox" ? Boolean(input.checked) : input.value;
    if (key !== "force_learning_mode" && input.type !== "checkbox") value = Number(value);
    if (key === "force_learning_mode" && !value) value = null;
    manualControlsState = setManualControls({ [key]: value });
    renderBrainDashboardPanel();
  });
  els.sessionBrainDashboard?.addEventListener("paste", (event) => {
    const textInput = event.target.closest("[data-brain-control='reinforcement-input'], [data-brain-control='synthetic-input']");
    if (!textInput) return;
    console.info("[AssistUI] Paste accepted");
  });
  els.sessionHumanInsightTags?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-human-tag]");
    if (!btn || !sessionHumanInsightDraft) return;
    sessionHumanInsightDraft = toggleHumanInsightTag(sessionHumanInsightDraft, btn.dataset.humanTag);
    sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
    renderHumanInsightDraftPanel();
  });

  els.sessionHumanInsightMeaning?.addEventListener("change", () => {
    if (!sessionHumanInsightDraft) return;
    sessionHumanInsightDraft = updateHumanInsightDraft(sessionHumanInsightDraft, {
      meaningSelection: els.sessionHumanInsightMeaning.value,
    });
    sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
  });
  els.sessionHumanInsightExpectation?.addEventListener("change", () => {
    if (!sessionHumanInsightDraft) return;
    sessionHumanInsightDraft = updateHumanInsightDraft(sessionHumanInsightDraft, {
      expectationSelection: els.sessionHumanInsightExpectation.value,
    });
    sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
  });
  els.sessionHumanInsightCondition?.addEventListener("change", () => {
    if (!sessionHumanInsightDraft) return;
    sessionHumanInsightDraft = updateHumanInsightDraft(sessionHumanInsightDraft, {
      conditionSelection: els.sessionHumanInsightCondition.value,
    });
    sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
  });
  els.sessionHumanInsightDirection?.addEventListener("change", () => {
    if (!sessionHumanInsightDraft) return;
    sessionHumanInsightDraft = updateHumanInsightDraft(sessionHumanInsightDraft, {
      directionBias: els.sessionHumanInsightDirection.value,
    });
    sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
  });
  els.sessionHumanInsightConfirmation?.addEventListener("change", () => {
    if (!sessionHumanInsightDraft) return;
    sessionHumanInsightDraft = updateHumanInsightDraft(sessionHumanInsightDraft, {
      requireConfirmation: Boolean(els.sessionHumanInsightConfirmation.checked),
    });
    sessionOperatorState.humanInsightDraft = sessionHumanInsightDraft;
  });
  els.sessionHumanInsightSaveBtn?.addEventListener("click", () => {
    if (!sessionHumanInsightDraft) return;
    const insight = finalizeHumanInsightDraft(sessionHumanInsightDraft);
    if (!insight) return;
    const validation = validateHumanInsight(insight);
    if (!validation.valid) {
      setSessionOperatorFeedbackStatus(`Insight invalid: ${validation.issues.join(", ")}`, "error");
      return;
    }
    _sessionHumanInsights = _sessionHumanInsights.filter((row) => row.linkedDrawingId !== insight.linkedDrawingId);
    _sessionHumanInsights = [..._sessionHumanInsights, insight];
    reconcileSessionHumanInsightState({ reason: "insight_saved", keepOrphaned: true });
    console.debug("Human insight saved", {
      insightId: insight.id,
      drawingId: insight.linkedDrawingId,
      conditionType: insight.condition?.type,
      directionBias: insight.condition?.directionBias,
      activationResult: false,
      effectSummary: `${insight.effect?.boostBias || 0}/${insight.effect?.reduceOpposite || 0}`,
    });
    sessionHumanInsightDraft = null;
    sessionOperatorState.humanInsightDraft = null;
    renderHumanInsightDraftPanel();
    renderHumanInsightSummary();
    refreshSessionCandlesTab();
    setSessionOperatorFeedbackStatus("Human insight saved and ready for live evaluation.", "success");
  });
  els.sessionHumanInsightSkipBtn?.addEventListener("click", () => {
    sessionHumanInsightDraft = null;
    sessionOperatorState.humanInsightDraft = null;
    renderHumanInsightDraftPanel();
  });
  els.sessionOperatorRecalculateBtn?.addEventListener("click", () => {
    refreshSessionCandlesTab();
    const machineSignal = sessionOperatorState.currentSignal;
    const currentContext = sessionOperatorState.currentContext;
    if (!machineSignal || !currentContext) {
      setSessionOperatorFeedbackStatus("No live signal snapshot available to recalculate.", "error");
      return;
    }
    const actions = getSelectedSessionOperatorActions();
    if (!actions.length) {
      setSessionOperatorFeedbackStatus("Choose at least one operator action.", "warning");
      return;
    }
    const operatorNote = String(els.sessionOperatorNote?.value || "").trim();
    sessionOperatorState.operatorSelection = actions;
    sessionOperatorState.operatorNote = operatorNote;
    console.debug("Operator input captured", { actions, note: operatorNote, signal: machineSignal, context: currentContext });

    const operatorPatternSummary = {};
    const perActionModifiers = actions.map((type) => computeOperatorModifier(machineSignal, currentContext, operatorPatternSummary, { type, note: operatorNote }));
    const combinedModifierScore = perActionModifiers.reduce((acc, row) => acc + Number(row.modifierScore || 0), 0);
    const strongestEffect = perActionModifiers.find((row) => ["block", "require_confirmation"].includes(row.effectOnDecision))
      || perActionModifiers.find((row) => row.effectOnDecision !== "none")
      || { effectOnDecision: "none" };
    const baseHumanModifier = machineSignal.humanInsightModifier || { modifierScore: 0, effectOnDecision: "none", summaryText: "" };
    const operatorModifier = {
      modifierScore: Math.max(-0.45, Math.min(0.45, Number(baseHumanModifier.modifierScore || 0) + combinedModifierScore)),
      effectOnDecision: strongestEffect.effectOnDecision !== "none" ? strongestEffect.effectOnDecision : baseHumanModifier.effectOnDecision || "none",
      summaryText: [baseHumanModifier.summaryText, ...perActionModifiers.map((row) => row.summaryText)].filter(Boolean).join(" "),
    };
    console.debug("Operator modifier computed", {
      machineScore: machineSignal.confidence,
      structureScore: currentContext?.structure?.entryQuality,
      operatorModifier,
    });

    const structureFilterResult = { decision: sessionOperatorState.currentSignal?.baseDecision?.finalDecision || "WARN" };
    const recalculated = combineFinalDecision(machineSignal, structureFilterResult, operatorModifier, {}, currentContext?.triggerLineEffects || {}, currentContext?.copilotEffects || {});
    const explanation = `${machineSignal.direction} signal ${operatorModifier.modifierScore < -0.1 ? "weakened" : operatorModifier.modifierScore > 0.1 ? "reinforced" : "adjusted"} due to ${actions.join(" + ")}. ${operatorModifier.summaryText}`;
    sessionOperatorState.recalculatedDecision = recalculated;
    sessionOperatorState.recalculatedDecisionExplanation = explanation;
    console.debug("Decision recalculated", {
      machineScore: recalculated.decisionBreakdown?.machineComponent,
      structureScore: recalculated.decisionBreakdown?.structureComponent,
      operatorModifier: recalculated.decisionBreakdown?.operatorComponent,
      finalDecision: recalculated.finalDecision,
    });

    const now = new Date().toISOString();
    const actionId = `session_operator_${Date.now()}`;
    const linkedTrade = liveShadowMonitor.getRecords().find((row) => row.symbol === currentContext.symbol && row.timeframe === currentContext.timeframe && row.outcome?.status === "pending") || null;
    const actionRecord = buildOperatorActionRecord({
      actionId,
      timestamp: now,
      symbol: currentContext.symbol,
      timeframe: currentContext.timeframe,
      currentSignal: machineSignal,
      currentContext: {
        symbol: currentContext.symbol,
        timeframe: currentContext.timeframe,
        source: currentContext.source,
        regime: currentContext.regime,
        structure: currentContext.structure,
        volatilityCondition: currentContext.volatilityCondition,
      },
      operatorAction: { type: actions[0], note: operatorNote, actions },
      decisionBefore: machineSignal.baseDecision || {},
      decisionAfter: recalculated,
      linkedTradeId: linkedTrade?.tradeId || linkedTrade?.id || null,
      linkedDecisionId: linkedTrade?.id || `session_decision_${Date.now()}`,
    });
    const loggedAction = logOperatorAction(actionRecord);
    sessionOperatorState.lastOperatorActionId = loggedAction?.actionId || actionId;
    console.debug("Operator action logged", {
      actionId: sessionOperatorState.lastOperatorActionId,
      machineScore: recalculated.decisionBreakdown?.machineComponent,
      structureScore: recalculated.decisionBreakdown?.structureComponent,
      operatorModifier: recalculated.decisionBreakdown?.operatorComponent,
      finalDecision: recalculated.finalDecision,
    });
    setSessionOperatorFeedbackStatus("Recalculated · Applied to decision · Operator action logged.", "success");
    renderSessionOperatorDecisionPanel();
  });
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
    sessionOperatorState = createSessionOperatorState();
    syncSessionOperatorActionButtons([]);
    if (els.sessionOperatorNote) els.sessionOperatorNote.value = "";
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
  els.sessionToggleStructure?.addEventListener("change", () => {
    sessionAnalysisPrefs.showStructure = Boolean(els.sessionToggleStructure.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionToggleMa?.addEventListener("change", () => {
    sessionAnalysisPrefs.showMa = Boolean(els.sessionToggleMa.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionToggleLiveAnnotations?.addEventListener("change", () => {
    sessionAnalysisPrefs.showLiveAnnotations = Boolean(els.sessionToggleLiveAnnotations.checked);
    saveSessionAnalysisPrefs();
    refreshSessionCandlesTab();
  });
  els.sessionWindowSize?.addEventListener("change", () => {
    sessionAnalysisPrefs.windowSize = Number(els.sessionWindowSize.value) || 80;
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
  els.sessionExportChatgptBtn?.addEventListener("click", handleSessionExportForChatGPT);
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

function setExecutionControlState(nextState = {}, options = {}) {
  const previous = executionControlState;
  executionControlState = normalizeExecutionControlState({ ...executionControlState, ...nextState });
  const authority = getExecutionAuthority(executionControlState);
  if (!["shadow", "copilot", "manual_only"].includes(authority)) {
    executionControlState = { ...executionControlState, executionAuthority: "manual_only" };
  }
  if (options.log !== false && previous.shadowExecutionEnabled !== executionControlState.shadowExecutionEnabled && !executionControlState.shadowExecutionEnabled) {
    console.info("[Shadow] Execution paused by user");
  }
  if (options.log !== false) {
    console.info(`[Execution] Active authority = ${executionControlState.executionAuthority}`);
    if (executionControlState.executionAuthority === "copilot") console.info("[Brain] Copilot authority active");
  }
  return executionControlState;
}

function allowShadowTradeExecution() {
  const executionPacket = getExecutionPacket(executionControlState);
  if (canModuleExecuteTrade("shadow", executionControlState) && canShadowExecuteTrade(executionControlState)) return true;
  if (executionPacket.authority === "manual_only") {
    blockExecution("Execution", "manual_only prevents all auto-entry");
    return false;
  }
  blockShadowTrade(`authority = ${executionPacket.authority}`);
  console.info(`[Shadow] execution blocked because authority belongs to ${executionPacket.authority}`);
  return false;
}

function persistLiveShadowState() {
  return saveLiveShadowState({
    records: liveShadowMonitor.getRecords(),
    filters: liveShadowFilters,
    latestStats: liveShadowStats,
    context: { source: getSelectedMarketDataSource(), symbol: getSelectedMarketDataSymbol(), timeframe: getSelectedMarketDataTimeframe() },
    autoIngestToSignals: liveShadowAutoIngest,
    executionControlState,
  });
}

function getSelectedOperatorActions() {
  if (!els.mdOperatorActions) return [];
  return [...els.mdOperatorActions.querySelectorAll("[data-operator-action].operator-action-active")]
    .map((btn) => String(btn.dataset.operatorAction || "").trim())
    .filter(Boolean);
}

function setOperatorFeedbackStatus(message, kind = "muted") {
  if (!els.mdOperatorFeedbackStatus) return;
  els.mdOperatorFeedbackStatus.className = `tiny ${kind}`;
  els.mdOperatorFeedbackStatus.textContent = message;
}

function syncOperatorActionButtons(selectedActions = []) {
  if (!els.mdOperatorActions) return;
  const active = new Set(selectedActions);
  els.mdOperatorActions.querySelectorAll("[data-operator-action]").forEach((btn) => {
    btn.classList.toggle("operator-action-active", active.has(btn.dataset.operatorAction));
  });
}

function getSelectedSessionOperatorActions() {
  if (!els.sessionOperatorActions) return [];
  return [...els.sessionOperatorActions.querySelectorAll("[data-operator-action].operator-action-active")]
    .map((btn) => String(btn.dataset.operatorAction || "").trim())
    .filter(Boolean);
}

function syncSessionOperatorActionButtons(selectedActions = []) {
  if (!els.sessionOperatorActions) return;
  const active = new Set(selectedActions);
  els.sessionOperatorActions.querySelectorAll("[data-operator-action]").forEach((btn) => {
    btn.classList.toggle("operator-action-active", active.has(btn.dataset.operatorAction));
  });
}

function setSessionOperatorFeedbackStatus(message, kind = "muted") {
  if (!els.sessionOperatorFeedbackStatus) return;
  els.sessionOperatorFeedbackStatus.className = `${kind} tiny`;
  els.sessionOperatorFeedbackStatus.textContent = message;
}

// ---------------------------------------------------------------------------
// Copilot Feedback Loop helpers
// ---------------------------------------------------------------------------

/**
 * Build a market context object from the current session analysis for the evaluator.
 */
function getCopilotMarketContext(analysis, marketView) {
  const candles = marketView?.candles || [];
  const last = candles[candles.length - 1] || null;
  const structure = analysis?.overlays?.structureSummary || {};
  return {
    price: Number(last?.close || 0),
    currentPrice: Number(analysis?.overlays?.currentPrice || last?.close || 0),
    bias: analysis?.pseudoMl?.probability?.bias || "neutral",
    direction: analysis?.pseudoMl?.probability?.bias === "bullish" ? "LONG" : analysis?.pseudoMl?.probability?.bias === "bearish" ? "SHORT" : "NONE",
    regime: analysis?.pseudoMl?.regime?.regime || "",
    structure,
    candleClosed: Boolean(last && !marketView?.openCandle),
    newHigh: false,
    newLow: false,
  };
}

/**
 * Evaluate copilot feedback against the current market context and emit alerts.
 */
function evaluateAndStoreCopilotFeedback(analysis, marketView) {
  const feedback = getCopilotFeedback();
  if (!feedback) return { feedback: null, evaluation: null, effects: null };

  const marketCtx = getCopilotMarketContext(analysis, marketView);
  const evaluation = evaluateCopilotFeedback(feedback, marketCtx);
  const effects = buildCopilotFeedbackEffects(feedback, evaluation);

  // Emit console alerts when scenario status changes
  const prev = _lastCopilotEvaluation;
  if (prev && prev.primaryStatus !== evaluation.primaryStatus) {
    const primary = feedback.scenario_primary?.name || "primary";
    if (evaluation.primaryStatus === "validated") {
      console.info(`[Copilot] Primary scenario validated: ${primary}`);
    } else if (evaluation.primaryStatus === "invalidated") {
      console.warn(`[Copilot] Primary scenario invalidated: ${primary}`);
    }
  }
  if (prev && evaluation.alternateStatus && prev.alternateStatus !== evaluation.alternateStatus) {
    const alt = feedback.scenario_alternate?.name || "alternate";
    if (evaluation.alternateStatus === "validated") {
      console.info(`[Copilot] Alternate scenario validated: ${alt}`);
    } else if (evaluation.alternateStatus === "invalidated") {
      console.warn(`[Copilot] Alternate scenario invalidated: ${alt}`);
    }
  }
  _lastCopilotEvaluation = evaluation;
  _lastCopilotEffects = effects;

  // Build a decision trace for this candle and store it
  const candles = marketView?.candles || [];
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const trace = buildDecisionTrace({ candle: lastCandle, feedback, evaluation, effects, marketCtx });
  addDecisionTrace(trace);

  // Update forward evaluations for recent pending traces using the current candle history
  const pendingTraces = getDecisionTraces().filter((t) => t.forward_eval?.block_quality === "pending");
  for (const t of pendingTraces) {
    const updated = evaluateForwardOutcome(t, candles);
    if (updated !== t) updateDecisionTrace(t.candle_time, updated);
  }

  return { feedback, evaluation, effects };
}

/**
 * Render the Copilot Feedback block in Session Candle.
 */
function renderSessionCopilotFeedbackBlock(analysis, marketView) {
  if (!els.sessionCopilotFeedbackBlock) return;
  const { feedback, evaluation, effects } = evaluateAndStoreCopilotFeedback(analysis, marketView);
  els.sessionCopilotFeedbackBlock.innerHTML = renderCopilotFeedbackBlock(feedback, evaluation, effects);
}

function syncAssistedInputIndicators() {
  const reinforcementStatus = document.querySelector("#reinforcementInput + p");
  const reinforcementApplyBtn = document.querySelector("[data-brain-action='assist-apply']");
  if (reinforcementStatus) {
    reinforcementStatus.className = `tiny ${assistedUiState.reinforcementValid ? "badge-green" : "badge-muted"}`;
    reinforcementStatus.textContent = assistedUiState.reinforcementInput
      ? (assistedUiState.reinforcementValid ? "Valid JSON" : `Invalid JSON: ${assistedUiState.reinforcementError || "invalid JSON"}`)
      : "No reinforcement applied";
  }
  if (reinforcementApplyBtn) reinforcementApplyBtn.disabled = !assistedUiState.reinforcementValid;

  const syntheticStatus = document.querySelector("#syntheticTradesInput + p");
  const syntheticInjectBtn = document.querySelector("[data-brain-action='assist-synthetic-inject']");
  if (syntheticStatus) {
    syntheticStatus.className = `tiny ${assistedUiState.syntheticValid ? "badge-green" : "badge-muted"}`;
    syntheticStatus.textContent = assistedUiState.syntheticInput
      ? (assistedUiState.syntheticValid ? "Valid JSON" : `Invalid JSON: ${assistedUiState.syntheticError || "invalid JSON"}`)
      : "No synthetic JSON loaded";
  }
  if (syntheticInjectBtn) syntheticInjectBtn.disabled = !assistedUiState.syntheticValid;
}

function renderBrainDashboardPanel() {
  if (!els.sessionBrainDashboard) return;
  const active = document.activeElement;
  const focusState = active && (active.id === "reinforcementInput" || active.id === "syntheticTradesInput")
    ? {
      id: active.id,
      start: active.selectionStart,
      end: active.selectionEnd,
      direction: active.selectionDirection,
      scrollTop: active.scrollTop,
    }
    : null;
  const modeState = brainModeController.getState();
  const executorState = executorStateStore.getState();
  const liveGate = evaluateExecutorLiveGate(learningProgressPacket, executionControlState);
  const secondaryScenario = scenarioProjectionState.activeSet?.scenarios?.[1] || null;
  const contextSignature = _lastBrainVerdict?.learningEffects?.signature || scenarioProjectionState.activeSet?.context_signature || null;
  const memorySnapshot = brainMemoryStore.getSnapshot();
  const contextRow = contextSignature ? (memorySnapshot.contexts?.[contextSignature] || null) : null;
  const reinforcementOverlay = brainMemoryStore.getReinforcementOverlay?.(contextSignature);
  const syntheticRows = getSyntheticTrades();
  const syntheticRatio = computeSyntheticLearningRatio(state.reviewed, syntheticRows);
  updateCurrentPacket({
    risk_profile: executorState?.lastRiskProfile || null,
    learning_state: {
      mode: _lastBrainVerdict?.learning_mode || "mixed",
      familiarity: Number(_lastBrainVerdict?.familiarity || 0),
    },
    brain_state: {
      confidence: Number(_lastBrainVerdict?.confidence || 0),
      familiarity: Number(_lastBrainVerdict?.familiarity || 0),
      danger_score: Number(_lastBrainVerdict?.danger_score || 0),
      scenario_reliability: Number(learningProgressPacket?.scenarioReliability || 0),
    },
  });
  els.sessionBrainDashboard.innerHTML = renderBrainDashboard(_lastBrainVerdict, modeState, executionControlState, {
    executorState,
    activeTrade: brainExecutor.getActiveTrade(),
    learningProgress: learningProgressPacket,
    liveGate,
    secondaryScenario,
    contextRow,
    manualControls: manualControlsState,
    manualOverridesActive: hasActiveManualOverrides(manualControlsState),
    assistedReinforcement: {
      lastSummary: assistedReinforcementState.lastSummary,
      historyCount: (assistedReinforcementState.history || []).length,
      history: assistedReinforcementState.history || [],
      inputText: assistedUiState.reinforcementInput || "",
      inputValid: assistedUiState.reinforcementValid,
      inputError: assistedUiState.reinforcementError,
      lastAppliedAt: assistedReinforcementState.lastAppliedAt,
      syntheticInput: assistedUiState.syntheticInput || "",
      syntheticInputValid: assistedUiState.syntheticValid,
      syntheticInputError: assistedUiState.syntheticError,
      syntheticStoredCount: syntheticRows.length,
      syntheticRatio,
      syntheticLastImportAt: assistedUiState.syntheticLastImportAt,
      overlayActive: Boolean(reinforcementOverlay),
      overlayLastFields: {
        bias: reinforcementOverlay?.verdict_patch?.bias ?? null,
        learned_bias: reinforcementOverlay?.learning_patch?.learned_bias ?? reinforcementOverlay?.verdict_patch?.learned_bias ?? null,
        active_rules: Array.isArray(reinforcementOverlay?.verdict_patch?.active_rules) ? reinforcementOverlay.verdict_patch.active_rules.length : 0,
        scenario_primary: reinforcementOverlay?.scenario_updates?.[0]?.scenario_name || reinforcementOverlay?.scenario_updates?.[0]?.scenario_id || null,
      },
    },
    libraryInsights: latestLibraryResolution,
  });
  if (focusState) {
    const nextInput = document.getElementById(focusState.id);
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(focusState.start, focusState.end, focusState.direction || "none");
      nextInput.scrollTop = focusState.scrollTop || 0;
      console.info("[AssistUI] Reinforcement textarea preserved across rerender");
    }
  }
  const syntheticInputEl = document.getElementById("syntheticTradesInput");
  if (syntheticInputEl) console.info("[AssistUI] Synthetic textarea mounted");
  syncAssistedInputIndicators();
}

/**
 * Render the full Copilot Feedback tab panel and wire dynamic events.
 */
function renderCopilotFeedbackTabUI() {
  if (!els.copilotFeedbackPanel) return;
  const feedback = getCopilotFeedback();
  const evaluation = _lastCopilotEvaluation;
  const effects = _lastCopilotEffects;
  const history = getCopilotFeedbackHistory();
  const traces = getDecisionTraces();
  const stats = getAggregatedTraceStats();
  els.copilotFeedbackPanel.innerHTML = renderCopilotFeedbackTabPanel(feedback, evaluation, effects, history, traces, stats);

  const importBtn = document.getElementById("btn-copilot-import");
  const clearBtn = document.getElementById("btn-copilot-clear");
  const jsonInput = document.getElementById("copilot-json-input");
  const statusEl = document.getElementById("copilot-import-status");

  if (importBtn && jsonInput) {
    importBtn.addEventListener("click", () => {
      const raw = jsonInput.value.trim();
      if (!raw) {
        if (statusEl) { statusEl.textContent = "Please paste a JSON first."; statusEl.className = "quick-add-feedback muted"; }
        return;
      }
      const result = importCopilotFeedback(raw);
      if (!result.ok) {
        if (statusEl) { statusEl.textContent = `Validation errors: ${result.errors.join("; ")}`; statusEl.className = "quick-add-feedback error"; }
        return;
      }
      // Persist to storage
      saveCopilotFeedback(serializeCopilotFeedbackStore());
      if (statusEl) { statusEl.textContent = "Feedback imported and saved successfully."; statusEl.className = "quick-add-feedback success"; }
      // Re-render the panel with the new data
      renderCopilotFeedbackTabUI();
      // Also update Session Candle block if it's visible
      if (els.sessionCopilotFeedbackBlock) {
        const currentFeedback = getCopilotFeedback();
        const noCtx = { feedback: currentFeedback, evaluation: null, effects: null };
        els.sessionCopilotFeedbackBlock.innerHTML = renderCopilotFeedbackBlock(noCtx.feedback, noCtx.evaluation, noCtx.effects);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (jsonInput) jsonInput.value = "";
      if (statusEl) { statusEl.textContent = ""; statusEl.className = "quick-add-feedback muted"; }
    });
  }
}

function renderSessionOperatorDecisionPanel() {
  if (!els.sessionOperatorDecision) return;
  const before = sessionOperatorState.currentSignal;
  const recalculated = sessionOperatorState.recalculatedDecision;
  const humanEval = sessionOperatorState.currentContext?.humanInsightEvaluation || null;
  const hasActiveHuman = Boolean((humanEval?.activeInsights || []).length);
  const activeHuman = humanEval?.activeInsights?.[0] || null;
  const effect = humanEval?.effects || {};
  const triggerEffects = sessionOperatorState.currentContext?.triggerLineEffects || {};
  const triggerSummary = sessionOperatorState.currentContext?.triggerLineEvaluation?.summaryText || "";
  const humanImpact = [
    effect.longModifier > 0.08 ? "boost long" : null,
    effect.shortModifier > 0.08 ? "boost short" : null,
    effect.longModifier < -0.08 ? "reduce long" : null,
    effect.shortModifier < -0.08 ? "reduce short" : null,
    effect.requireConfirmation ? "require confirmation" : null,
    effect.blockLong ? "block long" : null,
    effect.blockShort ? "block short" : null,
  ].filter(Boolean);
  const effectBlock = `
    <div class="panel-soft">
      <p class="tiny"><strong>Human Insight Effect</strong></p>
      <p class="muted tiny">Status: ${hasActiveHuman ? "Active" : "Inactive"} · Bias: ${activeHuman?.condition?.directionBias || "neutral"}</p>
      <p class="muted tiny">Impact: ${humanImpact.length ? humanImpact.join(", ") : "neutral / no active override"}</p>
      <p class="muted tiny">Explanation: ${humanEval?.summaryText || "Human insight layer idle (no active insights)."}</p>
      <p class="muted tiny"><strong>Trigger Effect:</strong> long ${formatNumber(triggerEffects.longModifier, 2)} · short ${formatNumber(triggerEffects.shortModifier, 2)} · ${triggerEffects.requireConfirmation ? "require confirmation" : "standard confirmation"}${triggerSummary ? ` · ${triggerSummary}` : ""}</p>
    </div>
  `;
  if (!before) {
    els.sessionOperatorDecision.innerHTML = `<span class="muted tiny">Waiting for live Session Candle signal context.</span>${effectBlock}`;
    return;
  }
  if (!recalculated) {
    els.sessionOperatorDecision.innerHTML = `<p class="muted tiny">Decision snapshot loaded. Select actions and click recalculate.</p><p class="muted tiny">Machine snapshot → ${before.direction} · confidence ${formatConfidence(before.confidence || 0)} · B ${formatNumber(before.bullishScore, 1)} / Br ${formatNumber(before.bearishScore, 1)}</p>${effectBlock}`;
    return;
  }
  const beforeDecision = before.baseDecision || {};
  const breakdown = recalculated.decisionBreakdown || {};
  const changed = beforeDecision.finalDecision !== recalculated.finalDecision || beforeDecision.finalBias !== recalculated.finalBias;
  const humanSummary = sessionOperatorState.currentContext?.humanInsightEvaluation?.summaryText || before.humanInsightModifier?.summaryText || "";
  els.sessionOperatorDecision.innerHTML = `
    <div class="session-live-plan-head">
      <span class="badge">Decision After Operator Input</span>
      ${changed ? '<span class="operator-influence-badge">Operator Influence Applied</span>' : ""}
      <span class="badge">Before ${beforeDecision.finalDecision || "WARN"} / ${beforeDecision.finalBias || "NONE"} · ${formatConfidence(beforeDecision.confidence || 0)}</span>
      <span class="badge">After ${recalculated.finalDecision} / ${recalculated.finalBias} · ${formatConfidence(recalculated.confidence)}</span>
    </div>
    <p class="muted tiny"><strong>Breakdown:</strong> Machine score ${formatNumber(breakdown.machineComponent, 3)} · Structure score ${formatNumber(breakdown.structureComponent, 3)} · Learning modifier ${formatNumber(breakdown.learningComponent, 3)} · Operator modifier ${formatNumber(breakdown.operatorComponent, 3)} · Trigger modifier ${formatNumber(breakdown.triggerComponent, 3)} · Copilot modifier ${formatNumber(breakdown.copilotComponent, 3)} · Final ${recalculated.finalDecision}</p>
    ${humanSummary ? `<p class="muted tiny"><strong>Human Insight:</strong> ${humanSummary}</p>` : ""}
    ${effectBlock}
    <p class="muted tiny">${recalculated.summaryText || "Decision recalculated with operator layer."}</p>
    <p class="muted tiny">${sessionOperatorState.recalculatedDecisionExplanation || ""}</p>
  `;
}

function updateSessionOperatorContext(analysis, marketView, livePlanRecord = null) {
  if (!analysis?.pseudoMl?.probability || !analysis?.overlays?.structureSummary) {
    sessionOperatorState = createSessionOperatorState();
    _lastBrainVerdict = null;
    if (els.sessionOperatorNote) els.sessionOperatorNote.value = "";
    syncSessionOperatorActionButtons([]);
    setSessionOperatorFeedbackStatus("Operator feedback ready.", "muted");
    renderSessionOperatorDecisionPanel();
    renderBrainDashboardPanel();
    return;
  }
  const machineSignal = {
    direction: analysis.pseudoMl.probability.bias === "bullish" ? "LONG" : analysis.pseudoMl.probability.bias === "bearish" ? "SHORT" : "NONE",
    bullishScore: Number(analysis.pseudoMl.probability.bullishScore || 0),
    bearishScore: Number(analysis.pseudoMl.probability.bearishScore || 0),
    confidence: Number(analysis.pseudoMl.probability.confidence || 0),
    reasonCodes: analysis.observations || [],
  };
  const structureFilterResult = {
    decision: livePlanRecord?.policy?.structureDecision || "ALLOW",
  };
  const humanInsightEvaluation = evaluateSessionHumanInsights({ analysis, marketView, reason: "context_update" }) || evaluateHumanInsights(_sessionHumanInsights, getHumanInsightContext(analysis, marketView));
  const humanInsightModifier = buildHumanInsightOperatorModifier(machineSignal, humanInsightEvaluation);
  const triggerEvaluation = evaluateTriggerLines(_sessionTriggerLines, {
    currentPrice: analysis?.overlays?.currentPrice,
    currentCandle: marketView?.candles?.[marketView.candles.length - 1] || null,
    recentCandles: marketView?.candles?.slice(-8) || [],
    currentSignal: machineSignal,
    manualStructure: _sessionManualSR,
  });
  _sessionTriggerEvaluation = triggerEvaluation;
  syncTriggerRuntimeState(triggerEvaluation);
  _sessionTriggerLines = loadTriggerLines();
  const triggerLineEffects = buildTriggerLineEffects(triggerEvaluation.activeTriggerEffects);
  // Copilot feedback bridge – evaluate and apply as additional decision layer
  const { feedback: copilotFeedback, evaluation: copilotEvaluation, effects: copilotEffectsResult } = evaluateAndStoreCopilotFeedback(analysis, marketView);
  const copilotEffectsForDecision = copilotEffectsResult || {};
  const reinforcementOverlay = brainMemoryStore.getReinforcementOverlay?.(
    buildSessionContextSignature({
      analysis,
      symbol: marketView?.symbol || getActiveSession()?.asset,
      timeframe: marketView?.timeframe || getActiveSession()?.tf,
    }),
  );
  const orchestration = runSessionBrainOrchestrator({
    session: getActiveSession(),
    marketView,
    analysis,
    modeState: { ...brainModeController.getState(), executorMode: executorStateStore.getState().mode },
    operatorState: sessionOperatorState,
    copilotFeedback,
    copilotEvaluation,
    learnedContexts: getScenarioMemoryRows().slice(-200),
    contextMemory: brainMemoryStore.getSnapshot().contexts,
    humanOverrideMemory: null,
    executionControlState,
    reinforcementOverlay,
  });
  _lastBrainVerdict = orchestration.brainPacket;
  if (_lastBrainVerdict?.learningEffects?.signature) {
    const confidenceComponents = _lastBrainVerdict?.confidence_components || {};
    persistLearnedContext({
      signature: _lastBrainVerdict.learningEffects.signature,
      learnedContextCurrent: _lastBrainVerdict.learningEffects.learnedContextCurrent,
    });
    brainMemoryStore.upsertContext(_lastBrainVerdict.learningEffects.signature, {
      ..._lastBrainVerdict.learningEffects.learnedContextCurrent,
      persisted_confidence: Number(_lastBrainVerdict.confidence || 0),
      confidence: Number(_lastBrainVerdict.confidence || 0),
      last_confidence: Number(_lastBrainVerdict.confidence || 0),
      confidence_previous: Number(confidenceComponents.previous_confidence || _lastBrainVerdict.confidence || 0),
      confidence_new: Number(confidenceComponents.new_confidence || _lastBrainVerdict.confidence || 0),
      confidence_blended: Number(confidenceComponents.blended_confidence || _lastBrainVerdict.confidence || 0),
      reinforcement_confidence_delta: Number(confidenceComponents.reinforcement_delta || 0),
    }, {
      sessionId: getActiveSession()?.id || null,
      symbol: marketView.symbol,
      timeframe: marketView.timeframe,
    });
  }
  if (_lastBrainVerdict?.learningEffects?.shouldPersistOverride) {
    persistHumanOverrideMemory(_lastBrainVerdict.learningEffects.overridePatch);
  }
  brainMemoryStore.appendDecision(_lastBrainVerdict, {
    sessionId: getActiveSession()?.id || null,
    symbol: marketView.symbol,
    timeframe: marketView.timeframe,
    context_signature: orchestration.contextPacket?.context_signature,
  });
  brainMemoryStore.addEvent(createBrainEvent("brain_verdict", _lastBrainVerdict, {
    sessionId: getActiveSession()?.id || null,
    symbol: marketView.symbol,
    timeframe: marketView.timeframe,
    context_signature: orchestration.contextPacket?.context_signature,
  }));

  latestLibraryResolution = resolveLibraryMatches({
    setupName: _lastBrainVerdict?.next_candle_plan?.posture || analysis?.overlays?.structureSummary?.entryQuality || "",
    direction: _lastBrainVerdict?.bias || machineSignal.direction || "",
    tags: [
      analysis?.pseudoMl?.regime?.regime,
      analysis?.volatilityCondition,
      analysis?.overlays?.structureSummary?.bias,
      marketView?.timeframe,
      marketView?.symbol,
    ].filter(Boolean),
    contextLabels: [
      `session:${getActiveSession()?.session || ""}`,
      `regime:${analysis?.pseudoMl?.regime?.regime || ""}`,
    ],
  }, libraryItems);

  const latestCandle = marketView?.candles?.[marketView.candles.length - 1] || null;
  brainExecutor.processCandle({
    candle: latestCandle,
    brainVerdict: _lastBrainVerdict,
    nextCandlePlan: _lastBrainVerdict?.next_candle_plan,
    scenario: scenarioProjectionState.activeSet?.scenarios?.[0] || null,
    contextSignature: orchestration.contextPacket?.context_signature,
  });
  learningProgressPacket = computeLearningProgressPacket({
    memorySnapshot: brainMemoryStore.getSnapshot(),
    tradeJournalRows: brainTradeJournal.getAll(),
  });
  const baseDecision = combineFinalDecision(machineSignal, structureFilterResult, humanInsightModifier, {}, triggerLineEffects, copilotEffectsForDecision);
  sessionOperatorState.currentSignal = { ...machineSignal, baseDecision, humanInsightModifier };
  sessionOperatorState.currentContext = {
    analysisSnapshot: analysis,
    symbol: marketView.symbol,
    timeframe: marketView.timeframe,
    source: marketView.source,
    regime: analysis.pseudoMl.regime?.regime || "unknown",
    volatilityCondition: analysis.volatilityCondition || "normal",
    structure: {
      bias: analysis.overlays.structureSummary.bias,
      breakState: analysis.overlays.structureSummary.breakState,
      supportQuality: analysis.overlays.structureSummary.supportQuality,
      resistanceQuality: analysis.overlays.structureSummary.resistanceQuality,
      entryQuality: analysis.overlays.structureSummary.entryQuality,
    },
    context20Snapshot: marketView.candles.slice(-20),
    humanInsightEvaluation,
    triggerLineEvaluation: triggerEvaluation,
    triggerLineEffects,
    copilotFeedback,
    copilotEvaluation,
    copilotEffects: copilotEffectsForDecision,
  };
  sessionOperatorState.humanInsights = [..._sessionHumanInsights];
  sessionOperatorState.activeHumanInsightEffects = humanInsightEvaluation.effects || null;
  if (!sessionOperatorState.recalculatedDecision) setSessionOperatorFeedbackStatus("Operator feedback ready.", "muted");
  renderSessionOperatorDecisionPanel();
  renderSessionCopilotFeedbackBlock(analysis, marketView);
  renderBrainDashboardPanel();
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
  if (els.mdLiveShadowAutoIngest) els.mdLiveShadowAutoIngest.checked = liveShadowAutoIngest;
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
    const corrected = latest?.decisionTrace?.operatorCorrected || null;
    els.mdLiveShadowPolicy.innerHTML = latest
      ? `<p><span class="badge ${latest.policy.action === "LONG" ? "call" : latest.policy.action === "SHORT" ? "put" : "tag"}">Machine ${latest.policy.action}</span> ${corrected ? `<span class="badge ${corrected.finalAction === "LONG" ? "call" : corrected.finalAction === "SHORT" ? "put" : "tag"}">Operator ${corrected.finalAction}</span>` : ""} <span class="badge">${formatConfidence(latest.policy.confidence)}</span> ${Number.isFinite(latest.plan.riskReward) ? `<span class="badge">RR ${formatNumber(latest.plan.riskReward, 2)}</span>` : ""} <span class="badge">Structure ${latest.policy.structureDecision || "allow"}</span></p><p><span class="badge">Regime ${latest.policy.regime || "ranging"} (${formatNumber(latest.policy.regimeStrength, 0)})</span> <span class="badge">Bull ${formatNumber(latest.policy.bullishScore, 1)} / Bear ${formatNumber(latest.policy.bearishScore, 1)}</span> <span class="badge">Bias ${latest.policy.probabilityBias || "neutral"} (${formatNumber(latest.policy.probabilityConfidence, 1)})</span></p><p class="muted">${latest.policy.reason || "-"}</p><p class="muted">${latest.policy.probabilityExplanation || ""}</p><p class="muted">Ref ${formatNumber(latest.plan.referencePrice, 4)} · SL ${formatNumber(latest.plan.stopLoss, 4)} · TP ${formatNumber(latest.plan.takeProfit, 4)}</p><p class="muted">${corrected?.explanation || (latest.policy.structureReasons || []).slice(0, 2).join(" ") || "Structure aligned."}</p><p>${(latest.policy.thesisTags || []).slice(0, 4).map((tag) => `<span class="badge">${tag}</span>`).join(" ")}</p>`
      : `<p class="muted">No policy decisions yet.</p>`;
  }

  if (els.mdLiveShadowPending) {
    const nextPending = filtered.find((row) => row.outcome?.status === "pending");
    const elapsedBars = nextPending ? Math.max(0, marketDataCandles.length - 1 - Number(nextPending.candleIndex || 0)) : 0;
    els.mdLiveShadowPending.innerHTML = `<p><strong>Pending:</strong> ${pendingCount}</p><p class="muted">${nextPending ? `${nextPending.symbol} ${nextPending.timeframe} · ${nextPending.policy.action} · elapsed bars ${elapsedBars}` : "No pending outcome."}</p>`;
  }

  if (els.mdLiveShadowStats) {
    els.mdLiveShadowStats.innerHTML = `<p>Decisions ${liveShadowStats.totalDecisions} · Wins ${liveShadowStats.wins} · Losses ${liveShadowStats.losses} · Win rate ${formatPct((liveShadowStats.winRate || 0) * 100, 1)}</p><p class="muted">Avg confidence ${formatConfidence(liveShadowStats.avgConfidence)} · Avg R ${formatNumber(liveShadowStats.avgRMultiple, 2)} · Avg pnl ${formatPct(liveShadowStats.avgPnlPct, 2)} · Max streak W${liveShadowStats.maxWinStreak}/L${liveShadowStats.maxLossStreak}</p><p class="muted">Machine vs operator comparisons ${liveShadowStats.operatorComparisons || 0} · improved ${liveShadowStats.operatorImproved || 0} · degraded ${liveShadowStats.operatorDegraded || 0}</p>`;
  }

  if (els.mdLiveShadowTimelineBody) {
    els.mdLiveShadowTimelineBody.innerHTML = filtered.length
      ? filtered.slice(0, 30).map((row) => `<tr data-live-shadow-id="${row.id}"><td>${new Date(row.timestamp).toLocaleTimeString()}</td><td>${row.symbol}</td><td>${row.timeframe}</td><td><span class="badge ${row.policy.action === "LONG" ? "call" : row.policy.action === "SHORT" ? "put" : "tag"}">${row.policy.action}</span>${row.decisionTrace?.operatorCorrected?.finalAction ? ` <span class="badge ${row.decisionTrace.operatorCorrected.finalAction === "LONG" ? "call" : row.decisionTrace.operatorCorrected.finalAction === "SHORT" ? "put" : "tag"}">${row.decisionTrace.operatorCorrected.finalAction}</span>` : ""}</td><td>${formatConfidence(row.policy.confidence)}</td><td>${row.outcome.status === "resolved" ? `<span class="badge ${getOutcomeBadgeClass(row.outcome.result)}">${row.outcome.result}</span>` : `<span class="badge">pending</span>`}</td><td>${row.outcome.status === "resolved" ? formatNumber(row.outcome.rMultiple, 2) : "-"}</td></tr>`).join("")
      : `<tr><td colspan="7" class="muted">No live decisions for current filter.</td></tr>`;
  }

  const selected = filtered.find((row) => row.id === liveShadowSelectedId) || latest;
  if (els.mdLiveShadowDetail) {
    const learning = selected?.stateSummary?.learningModifier || {};
    const breakdown = selected?.policy?.decisionBreakdown || selected?.decisionTrace?.operatorCorrected?.decisionBreakdown || {};
    const matchedPatterns = learning?.matchedPatterns || [];
    const penalties = learning?.activePenalties || [];
    const boosts = learning?.activeBoosts || [];
    const learningImpactBlock = selected
      ? `<div class="panel-soft">
          <p><strong>Learning Impact</strong></p>
          <p class="muted tiny">Matched pattern(s): ${matchedPatterns.length ? matchedPatterns.map((row) => row.name).join(", ") : "none"}</p>
          <p class="muted tiny">learningModifierScore: ${formatNumber(learning.learningModifierScore ?? learning.modifierScore, 3)} · effect ${learning.modifierEffect || "none"}</p>
          <p class="muted tiny">Active penalties/boosts: penalties ${penalties.length || 0} · boosts ${boosts.length || 0}</p>
          <p class="muted tiny">Confirmation forced by learning: ${learning.forcedByLearning ? "yes" : "no"}${learning.requiresConfirmation ? " · confirmation active" : ""}</p>
          <p class="muted tiny">Why: ${learning.explanation || "No active learned impact."}</p>
        </div>`
      : "";
    const patternTracingBlock = selected
      ? `<div class="panel-soft">
          <p><strong>Pattern Match Trace</strong></p>
          ${matchedPatterns.length
    ? matchedPatterns.map((row) => `<p class="muted tiny">${row.name} · occurrences ${row.occurrences} · win rate ${formatPct(Number(row.winRate || 0) * 100, 1)} · avg return ${formatNumber(row.avgReturn, 4)} · adjustment ${formatNumber(row.adjustmentApplied, 4)} (${row.evidenceTier})</p>`).join("")
    : `<p class="muted tiny">No learned losing/winning pattern matched this context.</p>`}
        </div>`
      : "";
    els.mdLiveShadowDetail.innerHTML = selected
      ? `<p><strong>${selected.symbol} ${selected.timeframe}</strong> · ${formatTs(selected.timestamp)}</p><p class="muted">Machine action: ${selected.decisionTrace?.machine?.action || selected.policy.action} · confidence ${formatConfidence(selected.decisionTrace?.machine?.confidence ?? selected.policy.confidence)} · reason ${selected.decisionTrace?.machine?.reason || selected.policy.reason || "-"}</p><p class="muted">Operator corrected: ${selected.decisionTrace?.operatorCorrected?.finalAction || "not applied"}${selected.decisionTrace?.operatorCorrected?.finalState ? ` · ${selected.decisionTrace.operatorCorrected.finalState}` : ""}</p><p class="muted">Operator actions: ${(selected.operatorFeedback?.actions || []).join(", ") || "none"}${selected.operatorFeedback?.note ? ` · note: ${selected.operatorFeedback.note}` : ""}</p><p class="muted">Regime: ${selected.policy.regime || "ranging"} (${formatNumber(selected.policy.regimeStrength, 0)}) · ${selected.policy.regimeExplanation || ""}</p><p class="muted">Machine scores → Bullish ${formatNumber(selected.policy.bullishScore, 1)} · Bearish ${formatNumber(selected.policy.bearishScore, 1)} · Neutral ${formatNumber(selected.policy.neutralScore, 1)}</p><p class="muted">${selected.decisionTrace?.operatorCorrected ? `Operator scores → Bullish ${formatNumber(selected.decisionTrace.operatorCorrected.bullishScore, 1)} · Bearish ${formatNumber(selected.decisionTrace.operatorCorrected.bearishScore, 1)} · Neutral ${formatNumber(selected.decisionTrace.operatorCorrected.neutralScore, 1)}` : "Operator scores pending."}</p><p class="muted">${selected.decisionTrace?.operatorCorrected?.explanation || selected.policy.probabilityExplanation || ""}</p><p class="muted">Warnings: ${(selected.policy.warnings || []).join(", ") || "none"}</p><p class="muted">Structure: ${selected.policy.structureDecision || "allow"} · ${(selected.policy.structureReasons || []).join(" ") || "No structure warnings."}</p><p class="muted">Decision breakdown → base machine score ${formatNumber(breakdown.machineComponent, 3)} · structure modifier ${formatNumber(breakdown.structureComponent, 3)} · learning modifier ${formatNumber(breakdown.learningComponent, 3)} · operator modifier ${formatNumber(breakdown.operatorComponent, 3)} · trigger modifier ${formatNumber(breakdown.triggerComponent, 3)} · final decision ${selected.policy.finalDecision || breakdown.finalDecision || "-"}</p><p class="muted">Bias ${selected.stateSummary.structureBias || "-"} · break ${selected.stateSummary.structureBreakState || "-"} · entry ${formatNumber(selected.stateSummary.entryLocationScore, 1)} · S ${formatNumber(selected.stateSummary.supportDistancePct, 2)}% / R ${formatNumber(selected.stateSummary.resistanceDistancePct, 2)}%</p><p class="muted">Neurons: ${(selected.stateSummary.activeNeurons || []).slice(0, 8).join(", ") || "none"}</p><p class="muted">Action scores: ${JSON.stringify(selected.policy.actionScores || {})}</p><p class="muted">Outcome ${selected.outcome.status}${selected.outcome.result ? ` · ${selected.outcome.result}` : ""} · bars ${selected.outcome.barsElapsed ?? "-"}</p><p class="muted">Outcome compare: machine ${selected.outcomeComparison?.machineOnly?.result || "-"} vs operator ${selected.outcomeComparison?.operatorCorrected?.result || "-"} · actual ${selected.outcomeComparison?.actualOutcome?.result || "-"}</p><p class="muted">Learning memory: ${(selected.learningMemory?.patterns || []).join(", ") || "no patterns yet"}</p>${learningImpactBlock}${patternTracingBlock}<p class="muted">Unified pipeline: ${state.signals.some((row) => row.id === selected.id) ? "Imported to Feed/Stats" : "Monitor only"}</p>`
      : `<p class="muted">Select a live decision row to inspect full details.</p>`;
  }

  if (els.mdLearningFeedback) {
    const diag = selected?.learningFeedback?.lastDiagnosis || null;
    const adjustments = selected?.learningFeedback?.adjustmentsApplied || null;
    const patterns = selected?.learningFeedback?.patternsDetected || [];
    const learning = selected?.stateSummary?.learningModifier || {};
    const learningModel = learning?.model || {};
    const currentRules = [
      { name: "penalize long near resistance in compression", value: learningModel?.weights?.longNearResistance },
      { name: "penalize short near support in compression", value: learningModel?.weights?.shortNearSupport },
      { name: "boost short after failed breakout", value: learningModel?.weights?.shortAfterFailedBreakout },
      { name: "require confirmation in weak momentum ranges", value: learningModel?.weights?.momentumWeakPenalty },
    ]
      .filter((row) => Math.abs(Number(row.value || 0)) > 0.02)
      .sort((a, b) => Math.abs(Number(b.value || 0)) - Math.abs(Number(a.value || 0)))
      .slice(0, 6);
    const replay = selected?.learningFeedback?.impactReplay || null;
    els.mdLearningFeedback.innerHTML = diag
      ? `<p><strong>Last trade diagnosis</strong>: ${diag.classification || "unclassified"}.</p>
         <p class="muted">Reason codes: ${(diag.reasonCodes || []).join(", ") || "-"}</p>
         <p class="muted">Adjustment applied: ${Object.keys(adjustments || {}).length ? Object.entries(adjustments).map(([k, v]) => `${k} ${formatNumber(v, 4)}`).join(" · ") : "none yet"}</p>
         <p class="muted">Patterns detected: ${patterns.length ? patterns.join(", ") : "none yet"}</p>
         <p><strong>Current Learned Rules</strong></p>
         ${currentRules.length ? currentRules.map((row) => `<p class="muted tiny">• ${row.name} (${row.value > 0 ? "+" : ""}${formatNumber(row.value, 4)})</p>`).join("") : `<p class="muted tiny">No strong active penalties/boosts yet.</p>`}
         <p><strong>Replay debug (before/after learning)</strong></p>
         ${replay ? `<p class="muted tiny">Before learning: ${replay.before.decision} / ${replay.before.bias} (score ${formatNumber(replay.before.totalScore, 3)}, learning ${formatNumber(replay.before.learningModifier, 3)})</p><p class="muted tiny">After learning: ${replay.after.decision} / ${replay.after.bias} (score ${formatNumber(replay.after.totalScore, 3)}, learning ${formatNumber(replay.after.learningModifier, 3)})</p><p class="muted tiny">Delta: ${replay.changed ? "decision changed" : "score changed without class change"} · ${replay.explanation || ""}</p>` : `<p class="muted tiny">Replay debug populates after decision resolution updates learning.</p>`}`
      : `<p class="muted">Learning feedback will appear after a trade resolves.</p><p><strong>Current Learned Rules</strong></p>${currentRules.length ? currentRules.map((row) => `<p class="muted tiny">• ${row.name} (${row.value > 0 ? "+" : ""}${formatNumber(row.value, 4)})</p>`).join("") : `<p class="muted tiny">No strong active penalties/boosts yet.</p>`}`;
  }

  if (selected) {
    syncOperatorActionButtons(selected.operatorFeedback?.actions || []);
    if (els.mdOperatorNote) els.mdOperatorNote.value = selected.operatorFeedback?.note || "";
    setOperatorFeedbackStatus(selected.decisionTrace?.operatorCorrected?.explanation || "Operator feedback ready.", "muted");
  } else {
    syncOperatorActionButtons([]);
    if (els.mdOperatorNote) els.mdOperatorNote.value = "";
    setOperatorFeedbackStatus("Select a live shadow row, choose actions, and recalculate.", "muted");
  }
}

function refreshLifecycleLiveMonitoring() {
  let next = strategyLifecycleState;
  (strategyLifecycleState.liveInstances || []).forEach((instance) => {
    if (instance.status !== "active") return;
    const related = state.signals.filter((row) => row.strategyId === instance.strategyId && (row.strategyVersionId || row.strategySignal?.versionId || row.patternVersion) === instance.versionId).slice(-80);
    const liveMetrics = computeLiveMetrics(related);
    const baseline = instance.baselineValidation || instance.baselineBacktest || {};
    const degrading = liveMetrics.sampleSize >= 8 ? detectDegradation(liveMetrics, baseline) : false;
    next = updateLiveInstanceMetrics(next, {
      instanceId: instance.instanceId,
      strategyId: instance.strategyId,
      versionId: instance.versionId,
      liveMetrics,
      degrading,
      lastSignalAt: related.at(-1)?.timestamp || null,
    });
  });
  strategyLifecycleState = next;
  persistStrategyLifecycle();
}

function emitLifecycleLiveSignalsFromRecord(record) {
  const active = (strategyLifecycleState.liveInstances || []).filter((row) => row.status === "active" && row.symbol === record.symbol && row.timeframe === record.timeframe);
  let changed = false;
  active.forEach((instance) => {
    const injected = {
      ...record,
      id: `${record.id}:${instance.strategyId}:${instance.versionId}`,
      strategyId: instance.strategyId,
      versionId: instance.versionId,
      strategyName: instance.strategyId,
    };
    changed = importStrategyRecordToSignals(injected, { strategyId: instance.strategyId, strategyName: instance.strategyId, versionId: instance.versionId, origin: "shadow" }) || changed;
  });
  return changed;
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
  let signalsChanged = false;
  if (liveShadowAutoIngest && record) {
    signalsChanged = importStrategyRecordToSignals(record, { strategyId: "live-shadow-policy", strategyName: "Live Shadow Policy", versionId: "policy-v1", origin: "shadow" }) || signalsChanged;
    signalsChanged = emitLifecycleLiveSignalsFromRecord(record) || signalsChanged;
  }
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
    regime: row.policy?.regime,
    regimeStrength: row.policy?.regimeStrength,
    bullishScore: row.policy?.bullishScore,
    bearishScore: row.policy?.bearishScore,
    neutralScore: row.policy?.neutralScore,
    probabilityBias: row.policy?.probabilityBias,
    probabilityConfidence: row.policy?.probabilityConfidence,
    probabilityExplanation: row.policy?.probabilityExplanation,
    decisionTrace: row.decisionTrace || {},
    operatorFeedback: row.operatorFeedback || {},
    outcomeComparison: row.outcomeComparison || {},
    learningMemory: row.learningMemory || {},
  }));
  refreshLifecycleLiveMonitoring();
  await Promise.all([saveFuturesPolicySnapshots(futuresPolicySnapshots), persistLiveShadowState(), signalsChanged ? persist() : Promise.resolve()]);
  renderLiveShadowPanel();
}

async function handleLiveCandleUpdate(candle) {
  // Live tick path: keep the open candle mutable so Session Candle can repaint intra-bar updates.
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
  // Candle-close path: mark the candle as closed/final so Session Candle renders it as finalized structure.
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
  let signalsChanged = false;
  if (liveShadowAutoIngest && newlyResolved.length) {
    signalsChanged = syncLiveShadowToUnifiedPipeline(newlyResolved, { strategyId: "live-shadow-policy", strategyName: "Live Shadow Policy", versionId: "policy-v1", origin: "shadow" });
  }
  if (signalsChanged) persist();
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
  refreshSessionCandlesTab();

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
  els.mdLiveShadowAutoIngest?.addEventListener("change", async () => {
    liveShadowAutoIngest = Boolean(els.mdLiveShadowAutoIngest.checked);
    await persistLiveShadowState();
    renderLiveShadowPanel();
  });
  els.mdLiveShadowImportSelectedBtn?.addEventListener("click", async () => {
    const record = liveShadowMonitor.getRecords().find((row) => row.id === liveShadowSelectedId);
    if (!record) return;
    const changed = importStrategyRecordToSignals(record, { strategyId: "live-shadow-policy", strategyName: "Live Shadow Policy", versionId: "policy-v1", origin: "shadow" });
    if (changed) {
      persist();
      rerender();
    }
  });
  els.mdLiveShadowTimelineBody?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-live-shadow-id]");
    if (!row) return;
    liveShadowSelectedId = row.getAttribute("data-live-shadow-id") || "";
    renderLiveShadowPanel();
  });
  els.mdOperatorActions?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-operator-action]");
    if (!btn) return;
    const action = btn.dataset.operatorAction;
    if (!OPERATOR_FEEDBACK_ACTIONS.includes(action)) return;
    btn.classList.toggle("operator-action-active");
  });
  els.mdOperatorRecalculateBtn?.addEventListener("click", async () => {
    if (!liveShadowSelectedId) {
      setOperatorFeedbackStatus("Select a live shadow record before recalculation.", "error");
      return;
    }
    const actions = getSelectedOperatorActions();
    if (!actions.length) {
      setOperatorFeedbackStatus("Choose at least one operator action.", "warning");
      return;
    }
    const updated = liveShadowMonitor.applyRecordOperatorFeedback(liveShadowSelectedId, {
      actions,
      note: els.mdOperatorNote?.value || "",
      timestamp: new Date().toISOString(),
    });
    if (!updated) {
      setOperatorFeedbackStatus("Unable to apply operator feedback to this record.", "error");
      return;
    }
    const changed = liveShadowAutoIngest ? importStrategyRecordToSignals(updated, { strategyId: "live-shadow-policy", strategyName: "Live Shadow Policy", versionId: "policy-v1", origin: "shadow" }) : false;
    if (changed) persist();
    await persistLiveShadowState();
    renderLiveShadowPanel();
    setOperatorFeedbackStatus(`Recalculated action: ${updated.decisionTrace?.operatorCorrected?.finalAction || "NO_TRADE"} (${updated.decisionTrace?.operatorCorrected?.finalState || "ready"}).`, "success");
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
  manualControlsState = getManualControls();
  loadAssistedReinforcementHistory();
  loadAssistedUiState();
  try {
    _sessionManualSR = JSON.parse(localStorage.getItem(SESSION_DRAWINGS_KEY) || localStorage.getItem(SESSION_SR_KEY_LEGACY) || "[]") || [];
  } catch { _sessionManualSR = []; }
  _sessionManualSR = normalizeStoredSessionDrawings(_sessionManualSR, getSessionMarketView());
  try { localStorage.setItem(SESSION_DRAWINGS_KEY, JSON.stringify(_sessionManualSR)); } catch {}
  _sessionTriggerLines = loadTriggerLines();
  _sessionTriggerLines = _sessionTriggerLines.filter((line) => _sessionManualSR.some((drawing) => drawing.id === line.linkedDrawingId));
  _sessionTriggerLines = saveTriggerLines(_sessionTriggerLines);
  try { _sessionHumanInsights = JSON.parse(localStorage.getItem(SESSION_HUMAN_INSIGHTS_KEY) || "[]") || []; } catch { _sessionHumanInsights = []; }
  reconcileSessionHumanInsightState({ reason: "initial_load", keepOrphaned: true });
  sessionAnalystState.addedLevels = [..._sessionManualSR];
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
  journalTrades = loadJournalTrades();
  brainTradeJournal.hydrate(journalTrades);
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
  updateScenarioContextStats();
  syncSessionAnalysisToggleUI();
  if (els.sessionDate) els.sessionDate.value = new Date().toISOString().slice(0, 10);
  marketDataCandles = loadMarketData();
  window.__patternlabRunHumanInsightChecklist = () => runHumanInsightE2EChecklist();
  window.__patternlabRunHumanInsightDemo = () => runHumanInsightDemoScenarios();
  marketDataMeta = { ...marketDataMeta, ...(loadMarketDataMeta() || {}) };
  if (els.mdSource) els.mdSource.value = marketDataMeta.source || MARKET_DATA_SOURCES.YAHOO;
  if (els.mdTimeframe) els.mdTimeframe.value = marketDataMeta.selectedTimeframe || "5m";
  futuresPolicyConfig = { ...futuresPolicyConfig, ...(loadFuturesPolicyConfig() || {}) };
  futuresPolicySnapshots = loadFuturesPolicySnapshots();
  const storedLiveShadow = loadLiveShadowState() || {};
  liveShadowFilters = { ...liveShadowFilters, ...(storedLiveShadow.filters || {}) };
  liveShadowStats = storedLiveShadow.latestStats || liveShadowStats;
  liveShadowAutoIngest = storedLiveShadow.autoIngestToSignals !== false;
  setExecutionControlState(storedLiveShadow.executionControlState || DEFAULT_EXECUTION_CONTROL_STATE, { log: true });
  liveShadowMonitor.setRecords(Array.isArray(storedLiveShadow.records) ? storedLiveShadow.records : []);
  promotedPatterns = loadPromotedPatterns().map((row) => normalizePromotedPattern(row));
  seededPatterns = loadSeededPatterns();
  seededPatternResults = loadSeededPatternResults();
  replaceSignals(loadedSignals);
  if (liveShadowAutoIngest) {
    const synced = syncLiveShadowToUnifiedPipeline(liveShadowMonitor.getRecords(), { strategyId: "live-shadow-policy", strategyName: "Live Shadow Policy", versionId: "policy-v1", origin: "shadow" });
    if (synced) persist();
  }
  strategyRuns = getSavedStrategyRuns();
  strategyLifecycleState = normalizeLifecycleState(loadStrategyLifecycle());
  if (!strategyLifecycleState.versions.length) {
    const seeded = createStrategyVersion(strategyLifecycleState, { strategyId: "rsi-pullback", name: "RSI Pullback", description: "Initial strategy seed", definition: { paramsPayload: { params: getDefaultParams("rsi-pullback") } }, status: "draft" });
    strategyLifecycleState = seeded.state;
    persistStrategyLifecycle();
  }
  selectedStrategyRunId = strategyRuns[0]?.id || "";
  livePatternSignals = loadLivePatternSignals();
  livePatternSummary = loadLivePatternSummary();
  libraryItems = loadLibraryItems();
  // Hydrate copilot feedback store from persisted state
  const storedCopilot = loadCopilotFeedback();
  if (storedCopilot) hydrateCopilotFeedbackStore(storedCopilot);
  setupTabs();
  setupEvents();
  microBotTab = createMicroBotTab({
    elements: {
      root: els.microBotRoot,
      status: els.microBotStatus,
      symbol: els.microBotSymbol,
      timeframe: els.microBotTimeframe,
      tradesCount: els.microBotTradesCount,
      pnl: els.microBotPnl,
      autoTradeLabel: els.microBotAutoLabel,
      chart: els.microBotChart,
      libraryRules: els.microBotLibraryRules,
      lastDecision: els.microBotLastDecision,
      lastNoTrade: els.microBotLastNoTrade,
      vetoCount: els.microBotVetoCount,
      noMatchCount: els.microBotNoMatchCount,
      tradeDecisionCount: els.microBotTradeDecisionCount,
      executedTradeCount: els.microBotExecutedTradeCount,
      journalStatus: els.microBotJournalStatus,
      activeTrade: els.microBotActiveTrade,
      journalPreview: els.microBotJournalPreview,
      learning: els.microBotLearningPreview,
      startBtn: els.microBotStartBtn,
      pauseBtn: els.microBotPauseBtn,
      resetBtn: els.microBotResetBtn,
      toggleAutoBtn: els.microBotToggleAutoBtn,
      refreshLibraryBtn: els.microBotRefreshLibraryBtn,
      exportJournalBtn: els.microBotExportJournalBtn,
      journalToolsTradesCount: els.microBotJournalToolsTradesCount,
      journalToolsWinrate: els.microBotJournalToolsWinrate,
      journalToolsLastExport: els.microBotJournalToolsLastExport,
      exportStatus: els.microBotExportStatus,
    },
    getLibraryItems: () => getLibraryItems(),
    onJournalWrite: (trade) => {
      const normalized = normalizeJournalTrade(trade, { source: "brain_auto" });
      brainTradeJournal.upsertJournalTrade(normalized);
    },
    getJournalTrades: () => brainTradeJournal.getAll(),
  });

  sessionReviewerTab = createSessionReviewerTab({
    elements: {
      fileInput: els.sessionReviewerFileInput,
      input: els.sessionReviewerInput,
      loadPasteBtn: els.sessionReviewerLoadPastedBtn,
      exportBtn: els.sessionReviewerExportBtn,
      fileName: els.sessionReviewerFileName,
      schema: els.sessionReviewerSchema,
      status: els.sessionReviewerStatus,
      summary: els.sessionReviewerSummary,
      findings: els.sessionReviewerFindings,
      setup: els.sessionReviewerSetup,
      context: els.sessionReviewerContext,
      learning: els.sessionReviewerLearning,
      winningDna: els.sessionReviewerWinningDna,
      fixes: els.sessionReviewerFixes,
    },
  });
  const geminiBotChart = new GeminiBotChart(
    document.getElementById("gemini-chart"),
    {
      maxCandles: 60,
      countdownEl: document.getElementById("gemini-candle-countdown"),
    },
  );

  const geminiBridge = new LibraryBridge({
    libraryItems,
    onVeto: (pattern, matched) => {
      console.log("[Bridge] Vetoed:", pattern.type, matched.map((m) => m.id));
    },
    onApprove: (pattern, matched, weight) => {
      console.log("[Bridge] Approved:", pattern.type, "weight:", weight, matched.map((m) => m.id));
    },
  });

  const geminiNeuronModal = new NeuronModal(
    document.getElementById("gemini-neuron-modal-container"),
    {
      onSave: (item) => {
        const existing = libraryItems.findIndex((i) => i.id === item.id);
        if (existing >= 0) libraryItems[existing] = item;
        else libraryItems.push(item);
        saveLibraryItems(libraryItems).catch((error) => console.error("[Library] save failed", error));
        geminiBridge.setLibraryItems(libraryItems);
        refreshLibraryPanel();
      },
      onDelete: (id) => {
        const idx = libraryItems.findIndex((i) => i.id === id);
        if (idx >= 0) libraryItems.splice(idx, 1);
        saveLibraryItems(libraryItems).catch((error) => console.error("[Library] save failed", error));
        geminiBridge.setLibraryItems(libraryItems);
        refreshLibraryPanel();
      },
      onToggle: (id, active) => {
        const item = libraryItems.find((i) => i.id === id);
        if (item) {
          item.active = active;
          saveLibraryItems(libraryItems).catch((error) => console.error("[Library] save failed", error));
          geminiBridge.setLibraryItems(libraryItems);
          refreshLibraryPanel();
        }
      },
      onExportSchema: () => {},
      getLibraryItems: () => libraryItems,
    },
  );

  document.getElementById("btn-gemini-neuron-modal")?.addEventListener("click", () => {
    geminiNeuronModal.open();
  });

  document.getElementById("btn-gemini-see-all-suggestions")?.addEventListener("click", () => {
    geminiNeuronModal.open();
    geminiNeuronModal.switchTab("suggested");
  });

  geminiBotController = createGeminiBotController({
    symbolInput: els.geminiSymbol,
    streakInput: els.geminiStreakSize,
    bearishStreakInput: document.getElementById("gemini-bearish-streak-size"),
    tfSelector: document.getElementById("gemini-tf-selector"),
    chartTfSelector: document.getElementById("gemini-chart-tf"),
    patternFilter: document.getElementById("gemini-pattern-filter"),
    chartContainer: els.geminiChart,
    statsContainer: els.geminiStatsContainer,
    modelConfig: {},
    startBtn: els.geminiStartBtn,
    stopBtn: els.geminiStopBtn,
    exportBtn: els.geminiExportBtn,
    exportTrainingBtn: document.getElementById("btn-gemini-export-training"),
    saveModelBtn: document.getElementById("btn-gemini-save-model"),
    status: els.geminiStatus,
    prediction: els.geminiPrediction,
    log: els.geminiLog,
    indicatorRow: document.getElementById("gemini-indicator-row"),
    statGrid: document.getElementById("gemini-stat-grid"),
    patternTbody: document.getElementById("gemini-pattern-tbody"),
    tfTbody: document.getElementById("gemini-tf-tbody"),
    trainingStats: {
      total: document.getElementById("gt-total"),
      skipped: document.getElementById("gt-skipped"),
      errors: document.getElementById("gt-errors"),
      loss: document.getElementById("gt-loss"),
      acc: document.getElementById("gt-acc"),
    },
    onStatsUpdate: (stats) => {
      const statGrid = document.getElementById("gemini-stat-grid");
      if (statGrid) {
        statGrid.innerHTML = [
          ["Total", stats.total],
          ["Pending", stats.pending],
          ["Wins", stats.wins],
          ["Losses", stats.losses],
          ["WinRate", `${(stats.winRate * 100).toFixed(1)}%`],
        ].map(([k, v]) => `<div class="stat-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
      }

      const patternTbody = document.getElementById("gemini-pattern-tbody");
      if (patternTbody) {
        patternTbody.innerHTML = Object.entries(stats.byPattern || {}).map(([name, row]) => `
          <tr><td>${name}</td><td>${row.count}</td><td>${row.wins}</td><td>${row.losses}</td><td>${(row.winRate * 100).toFixed(1)}</td></tr>
        `).join("");
      }

      const tfTbody = document.getElementById("gemini-tf-tbody");
      if (tfTbody) {
        tfTbody.innerHTML = Object.entries(stats.byTimeframe || {}).map(([name, row]) => `
          <tr><td>${name}</td><td>${row.count}</td><td>${row.wins}</td><td>${row.losses}</td><td>${(row.winRate * 100).toFixed(1)}</td></tr>
        `).join("");
      }
    },
    onChartUpdate: (timeframe, candles, patterns, indicators) => {
      geminiBotChart.setTimeframe(timeframe);
      geminiBotChart.update(candles, patterns, indicators);
    },
    onIndicatorUpdate: (indicators) => {
      document.getElementById("gi-rsi").textContent = `RSI ${indicators.rsi14?.toFixed(1) ?? "—"}`;
      document.getElementById("gi-ema9").textContent = `EMA9 ${indicators.ema9?.toFixed(2) ?? "—"}`;
      document.getElementById("gi-ema21").textContent = `EMA21 ${indicators.ema21?.toFixed(2) ?? "—"}`;
      document.getElementById("gi-atr").textContent = `ATR ${indicators.atr14?.toFixed(4) ?? "—"}`;
      document.getElementById("gi-vol").textContent = `Vol ×${indicators.volumeRatio?.toFixed(2) ?? "—"}`;
    },
    bridge: geminiBridge,
    bridgeStatusEl: document.getElementById("gemini-bridge-status"),
    onSuggestionsUpdate: (suggestions) => {
      const strip = document.getElementById("gemini-suggestions-strip");
      const pillsContainer = document.getElementById("gemini-suggestions-pills");
      if (!strip || !pillsContainer) return;
      if (!suggestions.length) {
        strip.style.display = "none";
        geminiNeuronModal.updateSuggestions([]);
        return;
      }
      strip.style.display = "flex";
      strip.classList.remove("fresh");
      void strip.offsetWidth;
      strip.classList.add("fresh");
      pillsContainer.innerHTML = suggestions.slice(0, 3).map((sg) => {
        const shortReason = sg.reason.length > 40 ? `${sg.reason.slice(0, 37)}…` : sg.reason;
        return `<span class="suggestion-pill" data-id="${sg.id}" title="${sg.reason}">${shortReason}</span>`;
      }).join("");
      pillsContainer.querySelectorAll(".suggestion-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          geminiNeuronModal.open();
          geminiNeuronModal.switchTab("suggested");
        });
      });
      geminiNeuronModal.updateSuggestions(suggestions);
    },
  });

  geminiNeuronModal.setStoreGetter(() => geminiBotController?.store);

  document.getElementById("gemini-chart-tf")?.addEventListener("change", (e) => {
    geminiBotChart.setTimeframe(e.target.value);
  });
  setupMarketDataEvents();
  await refreshMarketDataSymbols();
  if (els.mdAsset && marketDataMeta.selectedSymbol) els.mdAsset.value = marketDataMeta.selectedSymbol;
  await ensureLiveSubscription();
  importerMode = els.importerMode?.value === "live" ? "live" : "research";
  applyImporterMode();
  refreshMarketDataUI();
  if (els.slTimeframe) els.slTimeframe.value = marketDataMeta.selectedTimeframe || "5m";
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
