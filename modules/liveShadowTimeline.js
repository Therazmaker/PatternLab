const DEFAULT_LIMIT = 300;

function normalizeFilters(filters = {}) {
  return {
    symbol: String(filters.symbol || "all"),
    timeframe: String(filters.timeframe || "all"),
    action: String(filters.action || "all"),
    result: String(filters.result || "all"),
  };
}

export function createLiveShadowTimeline(options = {}) {
  let limit = Math.max(25, Number(options.limit) || DEFAULT_LIMIT);
  let records = [];

  function sortDesc(rows = []) {
    return [...rows].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }

  function setRecords(nextRows = []) {
    records = sortDesc(nextRows).slice(0, limit);
    return records;
  }

  function upsert(record) {
    if (!record?.id) return records;
    const idx = records.findIndex((row) => row.id === record.id);
    if (idx >= 0) {
      const next = [...records];
      next[idx] = record;
      return setRecords(next);
    }
    return setRecords([record, ...records]);
  }

  function getFiltered(filters = {}) {
    const normalized = normalizeFilters(filters);
    return records.filter((row) => {
      if (normalized.symbol !== "all" && row.symbol !== normalized.symbol) return false;
      if (normalized.timeframe !== "all" && row.timeframe !== normalized.timeframe) return false;
      if (normalized.action !== "all" && row.policy?.action !== normalized.action) return false;
      if (normalized.result !== "all") {
        if (normalized.result === "pending") return row.outcome?.status === "pending";
        return row.outcome?.result === normalized.result;
      }
      return true;
    });
  }

  function getLatest(filters = {}) {
    return getFiltered(filters)[0] || null;
  }

  function getCounts(filters = {}) {
    const rows = getFiltered(filters);
    return rows.reduce((acc, row) => {
      if (row.outcome?.status === "pending") acc.pending += 1;
      else acc.resolved += 1;
      return acc;
    }, { total: rows.length, pending: 0, resolved: 0 });
  }

  function configure(next = {}) {
    if (Number.isFinite(next.limit)) {
      limit = Math.max(25, Number(next.limit));
      records = records.slice(0, limit);
    }
  }

  return {
    configure,
    getRecords: () => [...records],
    setRecords,
    upsert,
    getFiltered,
    getLatest,
    getCounts,
  };
}
