const DB_NAME = "patternlab-storage";
const DB_VERSION = 1;
const STORE = "kv";

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
