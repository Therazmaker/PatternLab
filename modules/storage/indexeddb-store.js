const DB_NAME = "patternlab-storage";
const DB_VERSION = 2;
const STORE = "kv";
const BRAIN_EVENTS_STORE = "brain_events";
const BRAIN_STATS_STORE = "brain_stats";
const BRAIN_GROWTH_STORE = "brain_growth_series";
const BRAIN_STATE_STORE = "brain_state";

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
