function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function hasDangerContext(trade = {}) {
  const context = toObject(trade.libraryContextSnapshot);
  const contexts = toArray(context.contexts);
  const activeItems = toArray(context.activeItems);
  const combined = [
    ...contexts.map((row) => safeString(row?.id || row?.name || row?.label)),
    ...activeItems.map((row) => safeString(row?.id || row?.name || row?.label)),
  ].map((item) => item.toLowerCase());
  return combined.some((item) => item.includes("danger") || item.includes("late move") || item.includes("avoidchase") || item.includes("avoid_chase") || item.includes("chase"));
}

function hasAvoidChaseSignal(trade = {}) {
  const context = toObject(trade.libraryContextSnapshot);
  const decision = toObject(trade.decisionSnapshot);
  const matched = toArray(decision.matchedLibraryItems).map((item) => safeString(item).toLowerCase());
  const tags = [
    ...toArray(context.contexts).map((row) => safeString(row?.id || row?.name || row?.label).toLowerCase()),
    ...toArray(context.lessons).map((row) => safeString(row?.id || row?.name || row?.label).toLowerCase()),
    ...matched,
  ];
  return tags.some((item) => item.includes("avoidchase") || item.includes("avoid_chase") || item.includes("no chase") || item.includes("chase"));
}

function warningsEmpty(trade = {}) {
  const decision = toObject(trade.decisionSnapshot);
  return toArray(decision.warnings).length === 0;
}

function hasLearningOutput(trade = {}) {
  const learning = toObject(trade.learningOutput);
  return Object.keys(learning).length > 0;
}

function parseTime(value) {
  const str = safeString(value);
  if (!str) return null;
  const ts = Date.parse(str);
  return Number.isFinite(ts) ? ts : null;
}

export {
  toArray,
  toObject,
  toNumber,
  safeString,
  hasDangerContext,
  hasAvoidChaseSignal,
  warningsEmpty,
  hasLearningOutput,
  parseTime,
};
