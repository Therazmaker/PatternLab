/**
 * Genetic Optimizer — core GA engine for GeminiBot
 * Optimizes pattern weights, thresholds and scoring parameters
 * against historical brain data stored in IndexedDB.
 */

export const GENOME_SCHEMA = {
  // Pattern detection weights (how much each pattern type influences scoring)
  bullish_consecutive_weight:    { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },
  bearish_consecutive_weight:    { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },
  bullish_engulfing_weight:      { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },
  bearish_engulfing_weight:      { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },
  doji_weight:                   { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },
  volume_spike_weight:           { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },
  momentum_acceleration_weight:  { min: 0.1, max: 2.0, default: 1.0, step: 0.05 },

  // Quality gates / thresholds
  min_sample_threshold:   { min: 3,    max: 30,   default: 5,    step: 1,    isInt: true },
  win_rate_bias_threshold:{ min: 0.35, max: 0.80, default: 0.50, step: 0.01 },
  confidence_gate:        { min: 0.50, max: 0.80, default: 0.55, step: 0.01 },

  // Context penalties (0 = no penalty applied, higher = stronger penalty)
  low_volume_penalty:     { min: 0.0,  max: 0.8,  default: 0.3,  step: 0.05 },
  overbought_penalty:     { min: 0.0,  max: 0.8,  default: 0.3,  step: 0.05 },

  // Context bonuses
  ema_aligned_bonus:      { min: 0.0,  max: 0.8,  default: 0.2,  step: 0.05 },
  volume_spike_bonus:     { min: 0.0,  max: 0.8,  default: 0.2,  step: 0.05 },
};

const PATTERN_WEIGHT_KEYS = {
  bullish_consecutive_candles: "bullish_consecutive_weight",
  bearish_consecutive_candles: "bearish_consecutive_weight",
  bullish_engulfing:           "bullish_engulfing_weight",
  bearish_engulfing:           "bearish_engulfing_weight",
  doji:                        "doji_weight",
  volume_spike:                "volume_spike_weight",
  momentum_acceleration:       "momentum_acceleration_weight",
};

function clampGene(value, schema) {
  const n = schema.isInt ? Math.round(Number(value)) : Number(value);
  if (!Number.isFinite(n)) return schema.default;
  return Math.max(schema.min, Math.min(schema.max, n));
}

export function buildBaselineGenome() {
  const genome = {};
  for (const [key, schema] of Object.entries(GENOME_SCHEMA)) {
    genome[key] = schema.default;
  }
  return genome;
}

export function validateGenome(genome) {
  const validated = {};
  for (const [key, schema] of Object.entries(GENOME_SCHEMA)) {
    validated[key] = clampGene(
      genome[key] !== undefined ? genome[key] : schema.default,
      schema,
    );
  }
  return validated;
}

function initIndividual(baseGenome) {
  const individual = {};
  for (const [key, schema] of Object.entries(GENOME_SCHEMA)) {
    const base = baseGenome?.[key] ?? schema.default;
    const spread = (schema.max - schema.min) * 0.15;
    const raw = base + (Math.random() * 2 - 1) * spread;
    individual[key] = clampGene(raw, schema);
  }
  return individual;
}

export function evaluateFitness(genome, patternStats) {
  const entries = Object.entries(patternStats || {});
  const minThreshold = Number(genome.min_sample_threshold) || GENOME_SCHEMA.min_sample_threshold.default;
  const winRateBias = Number(genome.win_rate_bias_threshold) || GENOME_SCHEMA.win_rate_bias_threshold.default;

  const validPatterns = entries.filter(([, s]) => {
    const resolved = Number(s.wins || 0) + Number(s.losses || 0);
    return resolved >= minThreshold;
  });

  if (!validPatterns.length) {
    return { fitness: 0, metrics: { reason: "insufficient_data", validPatternCount: 0 } };
  }

  let totalWeight = 0;
  let weightedWinSum = 0;
  let stabilityCount = 0;
  const winRates = [];

  for (const [name, stats] of validPatterns) {
    const weightKey = PATTERN_WEIGHT_KEYS[name];
    const weight = weightKey ? Number(genome[weightKey] || 1.0) : 1.0;
    const winRate = Number(stats.winRate || 0);

    totalWeight += weight;
    weightedWinSum += weight * winRate;
    if (winRate >= winRateBias) stabilityCount += 1;
    winRates.push(winRate);
  }

  const weightedWinRate = totalWeight > 0 ? weightedWinSum / totalWeight : 0;

  const totalResolved = validPatterns.reduce(
    (acc, [, s]) => acc + Number(s.wins || 0) + Number(s.losses || 0),
    0,
  );
  const sampleCoverage = Math.min(1.0, totalResolved / Math.max(1, minThreshold * 10));

  const stabilityScore = validPatterns.length > 0 ? stabilityCount / validPatterns.length : 0;
  const robustnessScore = Math.min(1, validPatterns.length / 5);

  const mean = winRates.reduce((a, b) => a + b, 0) / winRates.length;
  const variance = winRates.reduce((acc, x) => acc + (x - mean) ** 2, 0) / winRates.length;
  const consistencyScore = Math.max(0, 1 - Math.sqrt(variance) * 2);

  // Overfit: patterns with very high win rate but few resolved samples
  const overfitPatterns = validPatterns.filter(([, s]) => {
    const resolved = Number(s.wins || 0) + Number(s.losses || 0);
    return Number(s.winRate || 0) > 0.8 && resolved < minThreshold * 2;
  });
  const overfitPenalty = (overfitPatterns.length / Math.max(1, validPatterns.length)) * 0.15;

  // Extreme config penalty: penalise values far from defaults
  let extremePenalty = 0;
  for (const [gene, schema] of Object.entries(GENOME_SCHEMA)) {
    const range = schema.max - schema.min;
    if (range > 0) {
      const normalizedDiff = Math.abs((genome[gene] ?? schema.default) - schema.default) / range;
      extremePenalty += normalizedDiff * 0.008;
    }
  }

  const fitness =
    weightedWinRate * 0.35 +
    stabilityScore  * 0.20 +
    robustnessScore * 0.20 +
    sampleCoverage  * 0.15 +
    consistencyScore * 0.10 -
    overfitPenalty -
    Math.min(0.1, extremePenalty);

  return {
    fitness: Math.max(0, Math.min(1, fitness)),
    metrics: {
      weightedWinRate,
      stabilityScore,
      robustnessScore,
      sampleCoverage,
      consistencyScore,
      overfitPenalty,
      extremePenalty: Math.min(0.1, extremePenalty),
      validPatternCount: validPatterns.length,
      totalResolved,
    },
  };
}

function tournamentSelect(population, tournamentSize) {
  const candidates = Array.from({ length: tournamentSize }, () =>
    population[Math.floor(Math.random() * population.length)],
  );
  return candidates.reduce((best, c) => (c.fitness > best.fitness ? c : best));
}

function crossover(parentA, parentB) {
  const child = {};
  for (const key of Object.keys(GENOME_SCHEMA)) {
    child[key] = Math.random() < 0.5 ? parentA.genes[key] : parentB.genes[key];
  }
  return child;
}

function mutate(genome, mutationRate) {
  const mutated = { ...genome };
  for (const [key, schema] of Object.entries(GENOME_SCHEMA)) {
    if (Math.random() < mutationRate) {
      const spread = (schema.max - schema.min) * 0.1;
      const delta = (Math.random() * 2 - 1) * spread;
      mutated[key] = clampGene(mutated[key] + delta, schema);
    }
  }
  return mutated;
}

export function createGeneticOptimizer(config = {}) {
  const settings = {
    populationSize: Math.max(5, Number(config.populationSize) || 20),
    generations:    Math.max(1, Number(config.generations)    || 30),
    mutationRate:   Number(config.mutationRate)   > 0 ? Number(config.mutationRate)   : 0.15,
    crossoverRate:  Number(config.crossoverRate)  > 0 ? Number(config.crossoverRate)  : 0.70,
    eliteCount:     Math.max(1, Number(config.eliteCount)     || 2),
    minSampleThreshold: Math.max(1, Number(config.minSampleThreshold) || 5),
    tournamentSize: 3,
  };

  let running = false;
  let abortFlag = false;

  async function evolve(patternStats, callbacks = {}) {
    const { onGeneration, onComplete, onAbort, onLog } = callbacks;

    const log = (msg) => {
      console.info(`[GeneticOptimizer] ${msg}`);
      onLog?.(msg);
    };

    // Guard: check sufficient data
    const validForEval = Object.entries(patternStats || {}).filter(([, s]) => {
      const resolved = Number(s.wins || 0) + Number(s.losses || 0);
      return resolved >= settings.minSampleThreshold;
    });

    if (!validForEval.length) {
      log(`insufficient data, run aborted (need ≥${settings.minSampleThreshold} resolved samples per pattern)`);
      onAbort?.("insufficient_data");
      return null;
    }

    log("run started");
    running = true;
    abortFlag = false;

    const baselineGenome = buildBaselineGenome();
    const baselineResult = evaluateFitness(baselineGenome, patternStats);

    let population = [
      { genes: baselineGenome, ...baselineResult },
      ...Array.from({ length: settings.populationSize - 1 }, () => {
        const genes = initIndividual(baselineGenome);
        return { genes, ...evaluateFitness(genes, patternStats) };
      }),
    ];
    population.sort((a, b) => b.fitness - a.fitness);

    const history = [];

    for (let gen = 0; gen < settings.generations; gen += 1) {
      if (abortFlag) {
        log("run aborted by user");
        running = false;
        onAbort?.("user_abort");
        return null;
      }

      // Yield to browser event loop so UI stays responsive
      await new Promise((resolve) => setTimeout(resolve, 0));

      const elites = population.slice(0, settings.eliteCount);
      const newPopulation = elites.map((e) => ({ ...e }));

      while (newPopulation.length < settings.populationSize) {
        const parentA = tournamentSelect(population, settings.tournamentSize);
        let genes;
        if (Math.random() < settings.crossoverRate) {
          const parentB = tournamentSelect(population, settings.tournamentSize);
          genes = crossover(parentA, parentB);
        } else {
          genes = { ...parentA.genes };
        }
        genes = mutate(genes, settings.mutationRate);
        genes = validateGenome(genes);
        newPopulation.push({ genes, ...evaluateFitness(genes, patternStats) });
      }

      newPopulation.sort((a, b) => b.fitness - a.fitness);
      population = newPopulation;

      const bestFitness = population[0].fitness;
      const avgFitness = population.reduce((acc, ind) => acc + ind.fitness, 0) / population.length;
      history.push({ generation: gen + 1, bestFitness, avgFitness });

      log(`generation ${gen + 1} completed · best=${bestFitness.toFixed(4)} avg=${avgFitness.toFixed(4)}`);

      onGeneration?.({
        generation: gen + 1,
        totalGenerations: settings.generations,
        bestFitness,
        avgFitness,
        bestIndividual: population[0],
        top5: population.slice(0, 5),
        history,
      });
    }

    const best = population[0];
    log(`best fitness updated: ${best.fitness.toFixed(4)}`);
    log("run completed");
    running = false;

    const result = {
      bestGenome:       best.genes,
      bestFitness:      best.fitness,
      bestMetrics:      best.metrics,
      baselineGenome,
      baselineFitness:  baselineResult.fitness,
      top5:             population.slice(0, 5),
      history,
      settings,
    };

    onComplete?.(result);
    return result;
  }

  function abort() {
    abortFlag = true;
  }

  function isRunning() {
    return running;
  }

  return { evolve, abort, isRunning, settings };
}
