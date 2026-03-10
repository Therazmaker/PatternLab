export function duplicateKey(signal) {
  return [signal.asset, signal.timestamp, signal.direction, signal.patternName].join("|");
}

export function deduplicateSignals(candidates, existing = []) {
  const existingKeys = new Set(existing.map(duplicateKey));
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  candidates.forEach((signal, index) => {
    const key = duplicateKey(signal);
    if (existingKeys.has(key) || seen.has(key)) {
      duplicates.push({ index, signal, key });
      return;
    }
    seen.add(key);
    unique.push(signal);
  });

  return { unique, duplicates };
}
