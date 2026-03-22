export function formatPct(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Number(value).toFixed(digits)}%`;
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

export function formatConfidence(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value) * 100)}%`;
}

export function formatTs(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

export function getOutcomeBadgeClass(result) {
  if (result === "win") return "call";
  if (result === "loss") return "put";
  return "tag";
}
