export function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function toISODate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function hourFromTimestamp(value) {
  const iso = toISODate(value);
  if (!iso) return null;
  return new Date(iso).getUTCHours();
}

export function formatHourBucket(hour) {
  if (!Number.isInteger(hour)) return "-";
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatDate(value) {
  const iso = toISODate(value);
  if (!iso) return "invalid-date";
  return new Date(iso).toLocaleString();
}

export function calcWinrate(wins, losses) {
  const total = wins + losses;
  if (!total) return 0;
  return Math.round((wins / total) * 10000) / 100;
}

export function makeSignalId(signal) {
  const key = [signal.asset, signal.timestamp, signal.direction, signal.patternName || "unknown"].join("|");
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return `signal_${Math.abs(hash)}_${Date.now().toString(36).slice(-5)}`;
}

export function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}
