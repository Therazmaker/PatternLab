const DB_NAME = "patternlab-storage";
const DB_VERSION = 3;
const STORE = "kv";
const BRAIN_EVENTS_STORE = "brain_events";
const BRAIN_STATS_STORE = "brain_stats";
const BRAIN_GROWTH_STORE = "brain_growth_series";
const BRAIN_STATE_STORE = "brain_state";
const GENETIC_RUNS_STORE = "genetic_runs";
const GENETIC_GENOMES_STORE = "genetic_genomes";
const GENETIC_STATE_STORE = "genetic_state";

function wrapRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

export function isIndexedDbSupported() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export async function openIndexedDb() {
  if (!isIndexedDbSupported()) throw new Error("IndexedDB no está disponible en este navegador.");

  const request = window.indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains(BRAIN_EVENTS_STORE)) {
      const eventsStore = db.createObjectStore(BRAIN_EVENTS_STORE, { keyPath: "id", autoIncrement: true });
      eventsStore.createIndex("timestamp", "timestamp", { unique: false });
      eventsStore.createIndex("type", "type", { unique: false });
      eventsStore.createIndex("patternName", "patternName", { unique: false });
    }
    if (!db.objectStoreNames.contains(BRAIN_STATS_STORE)) {
      db.createObjectStore(BRAIN_STATS_STORE, { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains(BRAIN_GROWTH_STORE)) {
      const growthStore = db.createObjectStore(BRAIN_GROWTH_STORE, { keyPath: "id", autoIncrement: true });
      growthStore.createIndex("timestamp", "timestamp", { unique: false });
    }
    if (!db.objectStoreNames.contains(BRAIN_STATE_STORE)) {
      db.createObjectStore(BRAIN_STATE_STORE, { keyPath: "key" });
    }
    // Genetic optimizer stores (added in DB version 3)
    if (!db.objectStoreNames.contains(GENETIC_RUNS_STORE)) {
      const runsStore = db.createObjectStore(GENETIC_RUNS_STORE, { keyPath: "id", autoIncrement: true });
      runsStore.createIndex("createdAt", "createdAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(GENETIC_GENOMES_STORE)) {
      const genomesStore = db.createObjectStore(GENETIC_GENOMES_STORE, { keyPath: "id", autoIncrement: true });
      genomesStore.createIndex("runId", "runId", { unique: false });
    }
    if (!db.objectStoreNames.contains(GENETIC_STATE_STORE)) {
      db.createObjectStore(GENETIC_STATE_STORE, { keyPath: "key" });
    }
  };

  return wrapRequest(request);
}

export async function getMany(db, keys) {
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const result = {};
  await Promise.all(keys.map(async (key) => {
    const row = await wrapRequest(store.get(key));
    result[key] = row?.value;
  }));
  return result;
}

export async function setValue(db, key, value) {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await wrapRequest(store.put({ key, value, updatedAt: new Date().toISOString() }));
}

export async function removeValue(db, key) {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await wrapRequest(store.delete(key));
}

export async function addBrainEvent(db, event = {}) {
  const tx = db.transaction(BRAIN_EVENTS_STORE, "readwrite");
  const store = tx.objectStore(BRAIN_EVENTS_STORE);
  return wrapRequest(store.add(event));
}

export async function getBrainEvents(db, limit = 50) {
  const tx = db.transaction(BRAIN_EVENTS_STORE, "readonly");
  const store = tx.objectStore(BRAIN_EVENTS_STORE);
  const rows = await wrapRequest(store.getAll());
  const safeLimit = Number(limit) > 0 ? Number(limit) : 50;
  return rows
    .sort((a, b) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime())
    .slice(0, safeLimit);
}

export async function putBrainStats(db, stats = {}) {
  const tx = db.transaction(BRAIN_STATS_STORE, "readwrite");
  const store = tx.objectStore(BRAIN_STATS_STORE);
  return wrapRequest(store.put({ ...stats, key: "global" }));
}

export async function getBrainStats(db) {
  const tx = db.transaction(BRAIN_STATS_STORE, "readonly");
  const store = tx.objectStore(BRAIN_STATS_STORE);
  const row = await wrapRequest(store.get("global"));
  return row || null;
}

export async function addBrainGrowthPoint(db, point = {}) {
  const tx = db.transaction(BRAIN_GROWTH_STORE, "readwrite");
  const store = tx.objectStore(BRAIN_GROWTH_STORE);
  return wrapRequest(store.add(point));
}

export async function getBrainGrowthSeries(db, limit = 240) {
  const tx = db.transaction(BRAIN_GROWTH_STORE, "readonly");
  const store = tx.objectStore(BRAIN_GROWTH_STORE);
  const rows = await wrapRequest(store.getAll());
  const safeLimit = Number(limit) > 0 ? Number(limit) : 240;
  return rows
    .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime())
    .slice(-safeLimit);
}

export async function putBrainState(db, state = {}) {
  const tx = db.transaction(BRAIN_STATE_STORE, "readwrite");
  const store = tx.objectStore(BRAIN_STATE_STORE);
  return wrapRequest(store.put({ ...state, key: "main" }));
}

export async function getBrainState(db) {
  const tx = db.transaction(BRAIN_STATE_STORE, "readonly");
  const store = tx.objectStore(BRAIN_STATE_STORE);
  const row = await wrapRequest(store.get("main"));
  return row || null;
}

// ── Genetic Optimizer stores ──────────────────────────────────────────────────

export async function addGeneticRun(db, run = {}) {
  const tx = db.transaction(GENETIC_RUNS_STORE, "readwrite");
  const store = tx.objectStore(GENETIC_RUNS_STORE);
  return wrapRequest(store.add(run));
}

export async function getGeneticRuns(db, limit = 20) {
  const tx = db.transaction(GENETIC_RUNS_STORE, "readonly");
  const store = tx.objectStore(GENETIC_RUNS_STORE);
  const rows = await wrapRequest(store.getAll());
  const safeLimit = Number(limit) > 0 ? Number(limit) : 20;
  return rows
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    .slice(0, safeLimit);
}

export async function addGeneticGenome(db, genome = {}) {
  const tx = db.transaction(GENETIC_GENOMES_STORE, "readwrite");
  const store = tx.objectStore(GENETIC_GENOMES_STORE);
  return wrapRequest(store.add(genome));
}

export async function getGeneticGenomesForRun(db, runId) {
  const tx = db.transaction(GENETIC_GENOMES_STORE, "readonly");
  const store = tx.objectStore(GENETIC_GENOMES_STORE);
  const index = store.index("runId");
  return wrapRequest(index.getAll(runId));
}

export async function putGeneticState(db, state = {}) {
  const tx = db.transaction(GENETIC_STATE_STORE, "readwrite");
  const store = tx.objectStore(GENETIC_STATE_STORE);
  return wrapRequest(store.put({ ...state, key: "main" }));
}

export async function getGeneticState(db) {
  const tx = db.transaction(GENETIC_STATE_STORE, "readonly");
  const store = tx.objectStore(GENETIC_STATE_STORE);
  const row = await wrapRequest(store.get("main"));
  return row || null;
}
