export class NeuronStore {
  constructor(config = {}) {
    this.config = {
      maxRows: Number(config.maxRows) > 10 ? Number(config.maxRows) : 1000,
    };
    this.rows = [];
  }

  appendPattern(pattern, prediction = null) {
    const row = {
      id: pattern?.id || `neuron-${Date.now()}`,
      type: pattern?.type || "unknown_pattern",
      symbol: pattern?.symbol || "UNKNOWN",
      timeframe: pattern?.timeframe || "unknown",
      detectedAt: pattern?.detectedAt || new Date().toISOString(),
      candles: pattern?.candles || [],
      features: {
        bullishStreakSize: pattern?.size || 0,
        customIndicators: [],
      },
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
}
