export const MIGRATION_FLAG_KEY = "patternlab.storageMigration.v1";

export function readMigrationFlag() {
  try {
    const raw = localStorage.getItem(MIGRATION_FLAG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeMigrationFlag(payload) {
  localStorage.setItem(MIGRATION_FLAG_KEY, JSON.stringify(payload));
}

export function buildMigrationPayload(status, extra = {}) {
  return {
    status,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}
