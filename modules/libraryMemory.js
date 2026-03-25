const SUPPORTED_LIBRARY_TYPES = new Set(["pattern", "context", "lesson", "rule"]);

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function normalizeTags(value) {
  const tags = toArray(value)
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

function toType(value) {
  return String(value || "").trim().toLowerCase();
}

function toPriority(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function normalizeLibraryItem(rawJson = {}) {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return { ok: false, error: "Library item must be a JSON object." };
  }

  const id = String(rawJson.id || "").trim();
  const type = toType(rawJson.type);
  const name = String(rawJson.name || "").trim();

  if (!id) return { ok: false, error: "Missing required field: id" };
  if (!type) return { ok: false, error: "Missing required field: type" };
  if (!SUPPORTED_LIBRARY_TYPES.has(type)) {
    return { ok: false, error: `Unsupported type '${type}'. Allowed: pattern, context, lesson, rule.` };
  }
  if (!name) return { ok: false, error: "Missing required field: name" };

  const item = {
    id,
    type,
    name,
    active: rawJson.active === undefined ? true : Boolean(rawJson.active),
    priority: toPriority(rawJson.priority),
    tags: normalizeTags(rawJson.tags),
    data: {},
  };

  const reserved = new Set(["id", "type", "name", "active", "priority", "tags", "data"]);
  const hasDataObject = rawJson.data && typeof rawJson.data === "object" && !Array.isArray(rawJson.data);
  const richData = hasDataObject ? { ...rawJson.data } : {};
  Object.entries(rawJson).forEach(([key, value]) => {
    if (!reserved.has(key)) richData[key] = value;
  });
  item.data = richData;

  if (!item.tags.length) {
    item.tags = normalizeTags(item.data?.tags || item.data?.context_labels || item.data?.labels || item.data?.setup_tags);
  }

  return { ok: true, item };
}

function extractContextTokens(currentContext = {}) {
  const tags = normalizeTags([
    ...(currentContext.tags || []),
    ...(currentContext.contextLabels || []),
    ...(currentContext.labels || []),
    ...(currentContext.setupTags || []),
  ]);
  const setupName = String(currentContext.setupName || currentContext.setup_name || "").trim().toLowerCase();
  const direction = String(currentContext.direction || currentContext.bias || "").trim().toLowerCase();
  return { tags, setupName, direction };
}

function extractItemTokens(item = {}) {
  const data = item?.data || {};
  return {
    tags: normalizeTags([...(item.tags || []), ...(data.tags || []), ...(data.context_labels || []), ...(data.labels || [])]),
    setupName: String(data.setup_name || data.setupName || item.name || "").trim().toLowerCase(),
    direction: String(data.direction || data.bias || "").trim().toLowerCase(),
    contextLabels: normalizeTags(data.context_labels || data.labels || []),
  };
}

export function resolveLibraryMatches(currentContext = {}, libraryItems = []) {
  const activeItems = Array.isArray(libraryItems) ? libraryItems.filter((item) => item?.active !== false) : [];
  const ctx = extractContextTokens(currentContext);
  const rows = [];

  for (const item of activeItems) {
    const itemTokens = extractItemTokens(item);
    let score = 0;
    const reasons = [];

    const sharedTags = itemTokens.tags.filter((tag) => ctx.tags.includes(tag));
    if (sharedTags.length) {
      score += sharedTags.length * 1.5;
      reasons.push(`tags:${sharedTags.join(",")}`);
    }
    if (ctx.setupName && itemTokens.setupName && (ctx.setupName === itemTokens.setupName || ctx.setupName.includes(itemTokens.setupName) || itemTokens.setupName.includes(ctx.setupName))) {
      score += 2;
      reasons.push("setup");
    }
    if (ctx.direction && itemTokens.direction && ctx.direction === itemTokens.direction) {
      score += 1;
      reasons.push("direction");
    }
    const sharedLabels = itemTokens.contextLabels.filter((label) => ctx.tags.includes(label));
    if (sharedLabels.length) {
      score += sharedLabels.length;
      reasons.push(`context:${sharedLabels.join(",")}`);
    }

    score += Number(item.priority || 0) * 0.6;

    if (score > 0) {
      rows.push({ item, score: Number(score.toFixed(3)), reasons });
    }
  }

  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 8);
  const lessons = top.filter((row) => row.item.type === "lesson").map((row) => row.item);
  const biasHints = top
    .map((row) => ({
      id: row.item.id,
      hint: row.item.data?.hint || row.item.data?.bias_hint || row.item.name,
      bias: row.item.data?.bias || row.item.data?.direction || null,
      score: row.score,
    }))
    .filter((row) => row.hint)
    .slice(0, 3);

  const warnings = [];
  if (!activeItems.length) warnings.push("No active library items.");
  if (!top.length && activeItems.length) warnings.push("No relevant library matches for current context.");

  return {
    matches: top,
    warnings,
    lessons,
    biasHints,
  };
}

export const LIBRARY_EXAMPLES = [
  {
    id: "pattern_london_open_sweep",
    type: "pattern",
    name: "London Open Liquidity Sweep",
    active: true,
    priority: 0.82,
    tags: ["london", "sweep", "reversal", "m5"],
    data: {
      setup_name: "liquidity_sweep_reversal",
      direction: "long",
      context_labels: ["session:london", "volatility:high"],
      trigger: "Sweep low + reclaim previous candle body",
      invalidation: "Close below sweep low",
      lesson: "Avoid chasing the first impulse candle. Wait for reclaim confirmation.",
      hint: "If sweep + reclaim appears, favor long continuation for 1-3 candles.",
    },
  },
  {
    id: "context_ny_lunch_chop",
    type: "context",
    name: "NY Lunch Chop Context",
    active: true,
    priority: 0.67,
    tags: ["ny", "low-volume", "chop"],
    data: {
      context_labels: ["session:ny", "time:lunch", "volatility:low"],
      bias: "neutral",
      risk_note: "Reduce size and require confirmation.",
      hint: "When volatility compresses near NY lunch, avoid breakout entries.",
    },
  },
  {
    id: "lesson_three_loss_pause",
    type: "lesson",
    name: "Pause After 3 Similar Losses",
    active: true,
    priority: 0.9,
    tags: ["risk", "discipline", "loss-streak"],
    data: {
      context_labels: ["risk:high", "behavioral"],
      rule: "After 3 losses in same setup+direction, force wait mode for 2 candles.",
      bias_hint: "Prefer wait",
      hint: "Stacked losses in same context usually mean structure changed.",
    },
  },
];
