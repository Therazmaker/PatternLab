import { state, setFilter, setImportPreview, setSignals } from "./modules/state.js";
import { loadSignals, saveSignals, exportSignals } from "./modules/storage.js";
import { buildImportPreview } from "./modules/importer.js";
import { dedupeSignals } from "./modules/normalizer.js";
import { getFilteredSignals, renderFeedRows, renderFilterOptions } from "./modules/feed.js";
import { applyReview } from "./modules/review.js";
import { computeStats } from "./modules/stats.js";
import { renderList, renderPreview, renderStatsOverview } from "./modules/ui.js";

const els = {
  jsonInput: document.getElementById("json-input"),
  preview: document.getElementById("preview"),
  validateBtn: document.getElementById("btn-validate"),
  importBtn: document.getElementById("btn-import"),
  clearBtn: document.getElementById("btn-clear"),
  loadDemoBtn: document.getElementById("btn-load-demo"),
  feedBody: document.getElementById("feed-body"),
  search: document.getElementById("search"),
  filterAsset: document.getElementById("filter-asset"),
  filterDirection: document.getElementById("filter-direction"),
  filterPattern: document.getElementById("filter-pattern"),
  filterStatus: document.getElementById("filter-status"),
  exportBtn: document.getElementById("btn-export"),
  datasetFile: document.getElementById("dataset-file"),
  modal: document.getElementById("review-modal"),
  reviewDetails: document.getElementById("review-details"),
  reviewStatus: document.getElementById("review-status"),
  reviewComment: document.getElementById("review-comment"),
  saveReviewBtn: document.getElementById("btn-save-review"),
  statsOverview: document.getElementById("stats-overview"),
  topAssets: document.getElementById("top-assets"),
  topPatterns: document.getElementById("top-patterns"),
  directionDist: document.getElementById("direction-dist"),
  kpiTotal: document.getElementById("kpi-total"),
  kpiPending: document.getElementById("kpi-pending"),
  kpiWins: document.getElementById("kpi-wins"),
  kpiLosses: document.getElementById("kpi-losses"),
  kpiWinrate: document.getElementById("kpi-winrate"),
};

function persist() {
  saveSignals(state.signals);
}

function refreshFilters() {
  const assets = [...new Set(state.signals.map((s) => s.asset))].sort();
  const patterns = [...new Set(state.signals.map((s) => s.patternName))].sort();
  renderFilterOptions(els.filterAsset, assets, "Todos los activos");
  renderFilterOptions(els.filterPattern, patterns, "Todos los patrones");
}

function refreshStats() {
  const stats = computeStats(state.signals);
  renderStatsOverview(els.statsOverview, stats);
  renderList(els.topAssets, stats.topAssets);
  renderList(els.topPatterns, stats.topPatterns);
  renderList(els.directionDist, stats.directionDist);

  els.kpiTotal.textContent = stats.total;
  els.kpiPending.textContent = stats.pending;
  els.kpiWins.textContent = stats.wins;
  els.kpiLosses.textContent = stats.losses;
  els.kpiWinrate.textContent = `${stats.winrate}%`;
}

function refreshFeed() {
  const filtered = getFilteredSignals(state.signals, state.filters);
  renderFeedRows(els.feedBody, filtered, openReview);
}

function rerender() {
  renderPreview(els.preview, state.importPreview);
  refreshFilters();
  refreshFeed();
  refreshStats();
}

function handleValidate() {
  const preview = buildImportPreview(els.jsonInput.value.trim());
  setImportPreview(preview);
  rerender();
}

function handleImport() {
  if (!state.importPreview || !state.importPreview.ok) handleValidate();
  if (!state.importPreview?.ok) return;

  const merged = dedupeSignals([...state.signals, ...state.importPreview.valid]);
  setSignals(merged);
  persist();
  setImportPreview({ ...state.importPreview, message: `Importadas ${state.importPreview.valid.length} señales válidas.` });
  rerender();
}

function openReview(signalId) {
  const signal = state.signals.find((s) => s.id === signalId);
  if (!signal) return;
  state.activeSignalId = signalId;
  els.reviewDetails.textContent = JSON.stringify(signal, null, 2);
  els.reviewStatus.value = signal.outcome.status;
  els.reviewComment.value = signal.outcome.comment || "";
  els.modal.showModal();
}

function saveReviewChanges() {
  if (!state.activeSignalId) return;
  setSignals(
    state.signals.map((signal) =>
      signal.id === state.activeSignalId ? applyReview(signal, els.reviewStatus.value, els.reviewComment.value.trim()) : signal
    )
  );
  persist();
  els.modal.close();
  rerender();
}

async function loadDemoJson() {
  const response = await fetch("./data/sample-signals.json");
  const text = await response.text();
  els.jsonInput.value = text;
  handleValidate();
}

function handleDatasetImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed)) throw new Error("El dataset debe ser un array de señales.");
      setSignals(dedupeSignals(parsed));
      persist();
      setImportPreview({ ok: true, message: `Dataset cargado: ${parsed.length} señales`, total: parsed.length, valid: parsed, invalid: [], assets: [], patterns: [] });
      rerender();
    } catch (error) {
      setImportPreview({ ok: false, message: `Error importando dataset: ${error.message}` });
      rerender();
    }
  };
  reader.readAsText(file);
}

function setupEvents() {
  els.validateBtn.addEventListener("click", handleValidate);
  els.importBtn.addEventListener("click", handleImport);
  els.clearBtn.addEventListener("click", () => {
    els.jsonInput.value = "";
    setImportPreview(null);
    rerender();
  });
  els.loadDemoBtn.addEventListener("click", loadDemoJson);

  els.search.addEventListener("input", (e) => { setFilter("search", e.target.value); refreshFeed(); });
  els.filterAsset.addEventListener("change", (e) => { setFilter("asset", e.target.value); refreshFeed(); });
  els.filterDirection.addEventListener("change", (e) => { setFilter("direction", e.target.value); refreshFeed(); });
  els.filterPattern.addEventListener("change", (e) => { setFilter("patternName", e.target.value); refreshFeed(); });
  els.filterStatus.addEventListener("change", (e) => { setFilter("status", e.target.value); refreshFeed(); });

  els.saveReviewBtn.addEventListener("click", saveReviewChanges);
  els.exportBtn.addEventListener("click", () => exportSignals(state.signals));
  els.datasetFile.addEventListener("change", (e) => handleDatasetImport(e.target.files[0]));
}

function init() {
  setSignals(loadSignals());
  setupEvents();
  rerender();
}

init();
