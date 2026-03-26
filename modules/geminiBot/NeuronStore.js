export class NeuronStore {
  constructor(config = {}) {
    this.config = {
      maxRows: Number(config.maxRows) > 10 ? Number(config.maxRows) : 1000,
    };
    this.rows = [];
  }

  appendPattern(pattern, prediction = null, sequenceFeatures = []) {
    const row = {
      id: pattern?.id || `neuron-${Date.now()}`,
      type: pattern?.type || "unknown_pattern",
      symbol: pattern?.symbol || "UNKNOWN",
      timeframe: pattern?.timeframe || "unknown",
      detectedAt: pattern?.detectedAt || new Date().toISOString(),
      candles: pattern?.candles || [],
      indicators: pattern?.indicators || {},
      features: sequenceFeatures,
      prediction: prediction || { direction: "neutral", confidence: 0 },
      outcome: {
        result: "pending",
        updatedAt: null,
      },
    };

    this.rows.push(row);
    while (this.rows.length > this.config.maxRows) this.rows.shift();
    return row;
  }

  updateOutcome(id, result) {
    const target = this.rows.find((row) => row.id === id);
    if (!target) return null;
    target.outcome = {
      result,
      updatedAt: new Date().toISOString(),
    };
    return target;
  }

  getPendingOutcomes(maxAgeMs = 5 * 60 * 1000) {
    const now = Date.now();
    return this.rows.filter((row) => {
      if (row?.outcome?.result !== "pending") return false;
      const detectedAt = new Date(row.detectedAt).getTime();
      if (!Number.isFinite(detectedAt)) return false;
      return (now - detectedAt) >= maxAgeMs;
    });
  }

  resolveOutcome(id, currentClose) {
    const target = this.rows.find((row) => row.id === id);
    if (!target) return null;
    const entryClose = Number(target.candles?.[target.candles.length - 1]?.close || 0);
    const liveClose = Number(currentClose || 0);
    if (!entryClose || !liveClose) return null;

    const actualDirection = liveClose >= entryClose ? "up" : "down";
    const predictedDirection = target.prediction?.direction || "neutral";
    const result = predictedDirection === actualDirection ? "win" : "loss";

    target.outcome = {
      result,
      updatedAt: new Date().toISOString(),
      entryClose,
      resolvedClose: liveClose,
      actualDirection,
    };
    return target;
  }

  getStats() {
    const summary = {
      total: this.rows.length,
      pending: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      byPattern: {},
      byTimeframe: {},
    };

    const ensureBucket = (obj, key) => {
      if (!obj[key]) obj[key] = { count: 0, wins: 0, losses: 0, winRate: 0 };
      return obj[key];
    };

    this.rows.forEach((row) => {
      const result = row?.outcome?.result || "pending";
      if (result === "pending") summary.pending += 1;
      if (result === "win") summary.wins += 1;
      if (result === "loss") summary.losses += 1;

      const patternBucket = ensureBucket(summary.byPattern, row.type || "unknown");
      patternBucket.count += 1;
      if (result === "win") patternBucket.wins += 1;
      if (result === "loss") patternBucket.losses += 1;

      const tfBucket = ensureBucket(summary.byTimeframe, row.timeframe || "unknown");
      tfBucket.count += 1;
      if (result === "win") tfBucket.wins += 1;
      if (result === "loss") tfBucket.losses += 1;
    });

    const resolved = summary.wins + summary.losses;
    summary.winRate = resolved ? summary.wins / resolved : 0;
    [summary.byPattern, summary.byTimeframe].forEach((group) => {
      Object.values(group).forEach((bucket) => {
        const bucketResolved = bucket.wins + bucket.losses;
        bucket.winRate = bucketResolved ? bucket.wins / bucketResolved : 0;
      });
    });

    return summary;
  }

  toTrainingDataset() {
    const rows = this.rows
      .filter((row) => ["win", "loss"].includes(row?.outcome?.result))
      .map((row) => ({
        features: Array.isArray(row.features) ? row.features : [],
        label: row.outcome.result === "win" ? 1 : 0,
      }))
      .filter((row) => row.features.length > 0);

    return {
      schema: "gemini.training.v1",
      exportedAt: new Date().toISOString(),
      rows,
    };
  }

  toJson() {
    return {
      schema: "gemini.neuron.v1",
      exportedAt: new Date().toISOString(),
      rows: [...this.rows],
    };
  }

  download(filename = `gemini-neuron-${Date.now()}.json`) {
    const content = JSON.stringify(this.toJson(), null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
  }

  downloadTrainingDataset(filename = `gemini-training-${Date.now()}.json`) {
    const content = JSON.stringify(this.toTrainingDataset(), null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
  }
}
