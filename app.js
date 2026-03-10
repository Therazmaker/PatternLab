import { state, setFilter, setImportPreview, setSignals } from "./modules/state.js";
import { loadSignals, saveSignals, exportSignals } from "./modules/storage.js";
import { buildImportPreview } from "./modules/importer.js";
import { dedupeSignals, migrateStoredSignal } from "./modules/normalizer.js";
import { getFilteredSignals, renderFeedRows, renderFilterOptions } from "./modules/feed.js";
import { applyReview } from "./modules/review.js";
import { computeStats } from "./modules/stats.js";
import { computeAssetAnalysis, computeHourAnalysis, computePatternCompare, computePatternRanking, withCompareFilters } from "./modules/analytics.js";
import { buildNote, filterNotes, loadNotes, saveNotes, upsertNote } from "./modules/journal.js";
import { renderAssetTable, renderCompareCards, renderHourTable, renderList, renderNotes, renderPreview, renderRankingTable, renderStatsOverview } from "./modules/ui.js";

const els = {
  jsonInput: document.getElementById("json-input"), preview: document.getElementById("preview"), validateBtn: document.getElementById("btn-validate"), importBtn: document.getElementById("btn-import"), clearBtn: document.getElementById("btn-clear"), loadDemoBtn: document.getElementById("btn-load-demo"),
  feedBody: document.getElementById("feed-body"), search: document.getElementById("search"), filterAsset: document.getElementById("filter-asset"), filterDirection: document.getElementById("filter-direction"), filterPattern: document.getElementById("filter-pattern"), filterStatus: document.getElementById("filter-status"), exportBtn: document.getElementById("btn-export"), datasetFile: document.getElementById("dataset-file"),
  modal: document.getElementById("review-modal"), reviewDetails: document.getElementById("review-details"), reviewStatus: document.getElementById("review-status"), reviewComment: document.getElementById("review-comment"), saveReviewBtn: document.getElementById("btn-save-review"),
  statsOverview: document.getElementById("stats-overview"), topAssets: document.getElementById("top-assets"), topPatterns: document.getElementById("top-patterns"), directionDist: document.getElementById("direction-dist"),
  rankingWrap: document.getElementById("ranking-wrap"), hourWrap: document.getElementById("hour-wrap"), assetWrap: document.getElementById("asset-wrap"),
  kpiTotal: document.getElementById("kpi-total"), kpiPending: document.getElementById("kpi-pending"), kpiWins: document.getElementById("kpi-wins"), kpiLosses: document.getElementById("kpi-losses"), kpiWinrate: document.getElementById("kpi-winrate"),
  tabs: [...document.querySelectorAll(".tab-btn")], panels: [...document.querySelectorAll(".tab-panel")],
  comparePatterns: document.getElementById("compare-patterns"), compareAsset: document.getElementById("compare-asset"), compareDirection: document.getElementById("compare-direction"), compareTimeframe: document.getElementById("compare-timeframe"), compareRangeMode: document.getElementById("compare-range-mode"), compareRangeValue: document.getElementById("compare-range-value"), compareResults: document.getElementById("compare-results"),
  noteId: document.getElementById("note-id"), noteTitle: document.getElementById("note-title"), noteContent: document.getElementById("note-content"), noteTags: document.getElementById("note-tags"), notePattern: document.getElementById("note-pattern"), noteAsset: document.getElementById("note-asset"), noteSignal: document.getElementById("note-signal"), noteForm: document.getElementById("journal-form"), noteResetBtn: document.getElementById("btn-note-reset"),
  noteSearch: document.getElementById("note-search"), noteFilterTag: document.getElementById("note-filter-tag"), noteFilterPattern: document.getElementById("note-filter-pattern"), noteFilterAsset: document.getElementById("note-filter-asset"), notesList: document.getElementById("notes-list"),
};

const compareFilters = { asset: "", direction: "", timeframe: "", rangeMode: "all", rangeValue: 30 };
const noteFilters = { search: "", tag: "", patternName: "", asset: "" };
let notes = [];

function persist() { saveSignals(state.signals); }
function persistNotes() { saveNotes(notes); }

function refreshSharedOptions() {
  const assets = [...new Set(state.signals.map((s) => s.asset))].sort();
  const patterns = [...new Set(state.signals.map((s) => s.patternName))].sort();
  const timeframes = [...new Set(state.signals.map((s) => s.timeframe))].sort();

  renderFilterOptions(els.filterAsset, assets, "Todos los activos");
  renderFilterOptions(els.filterPattern, patterns, "Todos los patrones");
  renderFilterOptions(els.compareAsset, assets, "Todos los activos");
  renderFilterOptions(els.compareTimeframe, timeframes, "Todos los TF");
  renderFilterOptions(els.notePattern, patterns, "-");
  renderFilterOptions(els.noteAsset, assets, "-");
  renderFilterOptions(els.noteFilterPattern, patterns, "Todos los patrones");
  renderFilterOptions(els.noteFilterAsset, assets, "Todos los assets");

  const selected = new Set([...els.comparePatterns.selectedOptions].map((o) => o.value));
  els.comparePatterns.innerHTML = patterns.map((p) => `<option value="${p}" ${selected.has(p) ? "selected" : ""}>${p}</option>`).join("");
  els.noteSignal.innerHTML = `<option value="">-</option>${state.signals.slice(0, 120).map((s) => `<option value="${s.id}">${s.id} · ${s.patternName}</option>`).join("")}`;
}

function refreshStats() {
  const stats = computeStats(state.signals);
  renderStatsOverview(els.statsOverview, stats);
  renderList(els.topAssets, stats.topAssets);
  renderList(els.topPatterns, stats.topPatterns);
  renderList(els.directionDist, stats.directionDist);
  renderRankingTable(els.rankingWrap, computePatternRanking(state.signals));
  renderHourTable(els.hourWrap, computeHourAnalysis(state.signals));
  renderAssetTable(els.assetWrap, computeAssetAnalysis(state.signals));
  els.kpiTotal.textContent = stats.total;
  els.kpiPending.textContent = stats.pending;
  els.kpiWins.textContent = stats.wins;
  els.kpiLosses.textContent = stats.losses;
  els.kpiWinrate.textContent = `${stats.winrate}%`;
}

function refreshFeed() { renderFeedRows(els.feedBody, getFilteredSignals(state.signals, state.filters), openReview); }

function refreshCompare() {
  const selectedPatterns = [...els.comparePatterns.selectedOptions].map((o) => o.value);
  const filtered = withCompareFilters(state.signals, compareFilters);
  renderCompareCards(els.compareResults, computePatternCompare(filtered, selectedPatterns));
}

function refreshNotes() {
  const filtered = filterNotes(notes, noteFilters);
  renderNotes(els.notesList, filtered, editNote, removeNote);
  const tags = [...new Set(notes.flatMap((n) => n.tags))].sort();
  renderFilterOptions(els.noteFilterTag, tags, "Todas las etiquetas");
}

function rerender() {
  renderPreview(els.preview, state.importPreview);
  refreshSharedOptions();
  refreshFeed();
  refreshStats();
  refreshCompare();
  refreshNotes();
}

function handleValidate() { setImportPreview(buildImportPreview(els.jsonInput.value.trim())); rerender(); }

function handleImport() {
  if (!state.importPreview || !state.importPreview.ok) handleValidate();
  if (!state.importPreview?.ok) return;
  setSignals(dedupeSignals([...state.signals, ...state.importPreview.valid]));
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
  setSignals(state.signals.map((s) => (s.id === state.activeSignalId ? applyReview(s, els.reviewStatus.value, els.reviewComment.value.trim()) : s)));
  persist();
  els.modal.close();
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
      setSignals(dedupeSignals(parsed.map(migrateStoredSignal)));
      persist();
      setImportPreview({ ok: true, message: `Dataset cargado: ${parsed.length} señales`, total: parsed.length, valid: parsed, invalid: [], assets: [], patterns: [] });
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
  notes = upsertNote(notes, {
    id: els.noteId.value || undefined,
    createdAt: existing?.createdAt,
    title: els.noteTitle.value,
    content: els.noteContent.value,
    tags,
    patternName: els.notePattern.value,
    asset: els.noteAsset.value,
    signalId: els.noteSignal.value,
  });
  persistNotes();
  resetNoteForm();
  refreshNotes();
}

function resetNoteForm() {
  els.noteId.value = "";
  els.noteForm.reset();
}

function editNote(note) {
  els.noteId.value = note.id;
  els.noteTitle.value = note.title;
  els.noteContent.value = note.content;
  els.noteTags.value = note.tags.join(", ");
  els.notePattern.value = note.links.patternName;
  els.noteAsset.value = note.links.asset;
  els.noteSignal.value = note.links.signalId;
}

function removeNote(noteId) {
  notes = notes.filter((n) => n.id !== noteId);
  persistNotes();
  refreshNotes();
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
  els.saveReviewBtn.addEventListener("click", saveReviewChanges);
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

  els.noteForm.addEventListener("submit", submitNote);
  els.noteResetBtn.addEventListener("click", resetNoteForm);
  els.noteSearch.addEventListener("input", (e) => { noteFilters.search = e.target.value; refreshNotes(); });
  els.noteFilterTag.addEventListener("change", (e) => { noteFilters.tag = e.target.value; refreshNotes(); });
  els.noteFilterPattern.addEventListener("change", (e) => { noteFilters.patternName = e.target.value; refreshNotes(); });
  els.noteFilterAsset.addEventListener("change", (e) => { noteFilters.asset = e.target.value; refreshNotes(); });
}

function init() {
  setSignals(loadSignals());
  notes = loadNotes();
  setupTabs();
  setupEvents();
  rerender();
}

init();
