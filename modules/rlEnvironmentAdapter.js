/**
 * RL-ready environment adapter.
 * No training is performed here; it only maps PatternLab state/action/reward for future RL integration.
 */
export class RlEnvironmentAdapter {
  constructor({ candles = [], features = [], windowSize = 20, rewardConfig = {} } = {}) {
    this.candles = candles;
    this.features = features;
    this.windowSize = Math.max(5, Number(windowSize) || 20);
    this.rewardConfig = {
      pnlWeight: Number(rewardConfig.pnlWeight ?? 1),
      drawdownPenalty: Number(rewardConfig.drawdownPenalty ?? 0.2),
      badEntryPenalty: Number(rewardConfig.badEntryPenalty ?? 0.1),
      regimeBonus: Number(rewardConfig.regimeBonus ?? 0.05),
    };
    this.reset();
  }

  reset() {
    this.index = this.windowSize;
    this.position = { side: 0, entryPrice: null };
    this.done = this.candles.length <= this.windowSize;
    this.peakEquity = 0;
    this.equity = 0;
    return this.getState(this.index);
  }

  getState(index = this.index) {
    const from = Math.max(0, index - this.windowSize + 1);
    const candlesWindow = this.candles.slice(from, index + 1);
    const featureWindow = this.features.slice(from, index + 1);
    const current = featureWindow[featureWindow.length - 1] || {};
    return {
      index,
      candlesWindow,
      featureWindow,
      indicators: {
        rsi14: current.rsi14,
        sma20: current.sma20,
        sma50: current.sma50,
        atr14: current.atr14,
        slope: current.smaSlope,
      },
      neuronContext: {
        activeNeurons: current.activeNeurons || [],
        neuronCount: current.neuronCount || 0,
        contextScore: current.contextScore,
        radarScore: current.radarScore,
        marketRegime: current.marketRegime,
      },
      position: { ...this.position },
    };
  }

  getReward(result = {}) {
    const pnl = Number(result.pnl || 0);
    const drawdown = Number(result.drawdown || 0);
    const badEntry = Number(result.badEntry || 0);
    const regimeAligned = Boolean(result.regimeAligned);
    return (pnl * this.rewardConfig.pnlWeight)
      - (drawdown * this.rewardConfig.drawdownPenalty)
      - (badEntry * this.rewardConfig.badEntryPenalty)
      + (regimeAligned ? this.rewardConfig.regimeBonus : 0);
  }

  step(action = 0) {
    if (this.done) return { state: this.getState(this.index), reward: 0, done: true, info: { reason: "done" } };

    const candle = this.candles[this.index] || {};
    const feature = this.features[this.index] || {};
    let pnl = 0;
    let badEntry = 0;

    if (action === 1 || action === 2) {
      const side = action === 1 ? 1 : -1;
      const now = Number(candle.close || 0);
      const next = Number(this.candles[this.index + 1]?.close || now);
      pnl = (next - now) * side;
      if ((side > 0 && feature.sma20 < feature.sma50) || (side < 0 && feature.sma20 > feature.sma50)) badEntry = 1;
      this.position = { side, entryPrice: now };
    } else {
      this.position = { side: 0, entryPrice: null };
    }

    this.equity += pnl;
    this.peakEquity = Math.max(this.peakEquity, this.equity);
    const drawdown = Math.max(0, this.peakEquity - this.equity);

    const reward = this.getReward({
      pnl,
      drawdown,
      badEntry,
      regimeAligned: ["trend", "bull", "bear", "breakout"].some((tag) => String(feature.marketRegime || "").includes(tag)),
    });

    this.index += 1;
    this.done = this.index >= this.candles.length - 1;

    return {
      state: this.getState(this.index),
      reward,
      done: this.done,
      info: { action, pnl, drawdown, badEntry },
    };
  }

  isDone() {
    return this.done;
  }
}
