function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function tokenize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/[\s_-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function collectItemText(item = {}) {
  const data = item?.data && typeof item.data === "object" ? item.data : {};
  const chunks = [item.id, item.name, ...(item.tags || [])];
  Object.values(data).forEach((value) => {
    if (typeof value === "string") chunks.push(value);
    else if (Array.isArray(value)) chunks.push(...value.filter((row) => typeof row === "string"));
  });
  return chunks.join(" ").trim().toLowerCase();
}

function hasAny(text = "", tokens = []) {
  return tokens.some((token) => text.includes(token));
}

function deriveBias(activeItems = []) {
  const bias = {
    longAllowed: true,
    shortAllowed: true,
    avoidChase: false,
    warnings: [],
  };

  activeItems.forEach((item) => {
    const text = collectItemText(item);
    const explicitBias = String(item?.data?.bias || item?.data?.direction || "").toLowerCase();
    if (explicitBias === "long") bias.shortAllowed = false;
    if (explicitBias === "short") bias.longAllowed = false;

    if (hasAny(text, ["no_chase", "avoid chase", "avoid_chase", "no chase", "dont chase"])) {
      bias.avoidChase = true;
    }
    if (hasAny(text, ["block long", "long blocked", "avoid long"])) {
      bias.longAllowed = false;
      bias.warnings.push(`long blocked by ${item.id}`);
    }
    if (hasAny(text, ["block short", "short blocked", "avoid short"])) {
      bias.shortAllowed = false;
      bias.warnings.push(`short blocked by ${item.id}`);
    }
  });

  return bias;
}

export function readActiveLibraryContext(libraryItems = []) {
  const activeItems = Array.isArray(libraryItems) ? libraryItems.filter((item) => item?.active !== false) : [];
  const patterns = activeItems.filter((item) => item?.type === "pattern");
  const contexts = activeItems.filter((item) => item?.type === "context" || item?.type === "rule");
  const lessons = activeItems.filter((item) => item?.type === "lesson");
  const warnings = [];

  if (!activeItems.length) warnings.push("Library unavailable or empty");

  return {
    patterns,
    contexts,
    lessons,
    warnings,
    bias: deriveBias(activeItems),
    activeCount: activeItems.length,
    activeItems,
  };
}

export function itemContains(item = {}, terms = []) {
  const text = collectItemText(item);
  return hasAny(text, toArray(terms).map((term) => String(term || "").toLowerCase()));
}

export function getItemTokens(item = {}) {
  return tokenize(collectItemText(item));
}
