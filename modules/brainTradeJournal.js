const MAX_JOURNAL_ROWS = 1200;

function nowIso() {
  return new Date().toISOString();
}

export function createBrainTradeJournal(seed = []) {
  const rows = Array.isArray(seed) ? [...seed] : [];

  function append(entry = {}) {
    const row = {
      id: entry.id || entry.trade_id || `journal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: entry.ts || nowIso(),
      ...entry,
    };
    rows.unshift(row);
    if (rows.length > MAX_JOURNAL_ROWS) rows.length = MAX_JOURNAL_ROWS;
    return row;
  }

  function list(limit = 100) {
    return rows.slice(0, Math.max(0, Number(limit) || 0));
  }

  function getAll() {
    return [...rows];
  }

  return {
    append,
    list,
    getAll,
  };
}
