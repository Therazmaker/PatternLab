/**
 * Genetic Optimizer Store — IndexedDB persistence for GA runs, genomes and state.
 * Uses stores added in indexeddb-store.js (DB version 3).
 */

import {
  openIndexedDb,
  addGeneticRun,
  getGeneticRuns,
  addGeneticGenome,
  getGeneticGenomesForRun,
  getGeneticState,
  putGeneticState,
} from "../storage/indexeddb-store.js";

function nowIso() {
  return new Date().toISOString();
}

export async function createGeneticOptimizerStore() {
  const db = await openIndexedDb();

  async function saveRun(runData = {}) {
    const record = {
      createdAt:      runData.createdAt      || nowIso(),
      generations:    runData.generations    || 0,
      populationSize: runData.populationSize || 0,
      bestFitness:    typeof runData.bestFitness === "number" ? runData.bestFitness : null,
      bestGenome:     runData.bestGenome     || null,
      baselineGenome: runData.baselineGenome || null,
      baselineFitness:typeof runData.baselineFitness === "number" ? runData.baselineFitness : null,
      status:         runData.status         || "completed",
      notes:          runData.notes          || "",
      metrics:        runData.metrics        || {},
      settings:       runData.settings       || {},
    };
    const id = await addGeneticRun(db, record);
    console.info(`[GeneticOptimizer] run saved to IndexedDB (id=${id})`);
    return id;
  }

  async function saveGenome(runId, genomeData = {}) {
    const record = {
      runId,
      generation: genomeData.generation || 0,
      fitness:    typeof genomeData.fitness === "number" ? genomeData.fitness : 0,
      genes:      genomeData.genes       || {},
      metrics:    genomeData.metrics     || {},
      isBest:     Boolean(genomeData.isBest),
      savedAt:    nowIso(),
    };
    const id = await addGeneticGenome(db, record);
    console.info(`[GeneticOptimizer] genome saved to IndexedDB (runId=${runId} isBest=${record.isBest})`);
    return id;
  }

  async function getRuns(limit = 20) {
    const rows = await getGeneticRuns(db, limit);
    return rows;
  }

  async function getGenomesForRun(runId) {
    return getGeneticGenomesForRun(db, runId);
  }

  async function loadState() {
    const state = await getGeneticState(db);
    return state || {
      currentAppliedGenome: null,
      lastBestGenome:       null,
      lastRunId:            null,
      optimizerSettings:    {},
    };
  }

  async function saveState(state = {}) {
    const record = {
      key: "main",
      currentAppliedGenome: state.currentAppliedGenome ?? null,
      lastBestGenome:       state.lastBestGenome       ?? null,
      lastRunId:            state.lastRunId            ?? null,
      optimizerSettings:    state.optimizerSettings    ?? {},
      updatedAt:            nowIso(),
    };
    await putGeneticState(db, record);
    console.info("[GeneticOptimizer] state saved to IndexedDB");
    return record;
  }

  async function applyGenome(genome, runId = null) {
    const current = await loadState();
    const next = {
      ...current,
      previousAppliedGenome: current.currentAppliedGenome || null,
      currentAppliedGenome:  genome,
      lastBestGenome:        genome,
      lastRunId:             runId,
    };
    await saveState(next);
    console.info("[GeneticOptimizer] best genome applied");
    return next;
  }

  async function restoreGenome() {
    const current = await loadState();
    if (!current.previousAppliedGenome) return null;
    const next = {
      ...current,
      currentAppliedGenome: current.previousAppliedGenome,
      previousAppliedGenome: null,
    };
    await saveState(next);
    console.info("[GeneticOptimizer] genome restored to previous");
    return next;
  }

  return { saveRun, saveGenome, getRuns, getGenomesForRun, loadState, saveState, applyGenome, restoreGenome };
}
