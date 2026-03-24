import { applyOperatorFeedback, deriveOperatorPatternFeedback } from "./operatorFeedback.js";
import { createOperatorActionLogger } from "./operatorActionLogger.js";
import { evaluateOperatorAction } from "./operatorOutcomeEvaluator.js";
import { analyzeOperatorPatterns } from "./operatorPatternAnalyzer.js";
import { analyzeOutcome } from "./diagnosticEngine.js";
import { updateLearningModel } from "./learningEngine.js";
import { persistOutcomeLearning } from "./brainLearningWriter.js";
import {
  loadDecisionMemories,
  loadOperatorActions,
  loadTradeMemories,
  saveOperatorPatternSummary,
} from "./storage/storage-adapter.js";
import { createLiveShadowSnapshot } from "./liveShadowSnapshotBuilder.js";
import { resolveLiveShadowPending } from "./liveShadowOutcomeResolver.js";
import { buildLiveShadowAnalytics } from "./liveShadowAnalytics.js";

const DEFAULT_MAX_HISTORY = 400;

export function createLiveShadowMonitor(options = {}) {
  const maxHistory = Math.max(100, Number(options.maxHistory) || DEFAULT_MAX_HISTORY);
  const operatorActionLogger = createOperatorActionLogger();
  let records = [];
  const pendingIndex = new Map();

  function syncPendingIndex() {
    pendingIndex.clear();
    records.forEach((record) => {
      if (record?.outcome?.status === "pending") pendingIndex.set(record.id, true);
    });
  }

  function trimAndSort(next = []) {
    return [...next].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, maxHistory);
  }

  function setRecords(nextRecords = []) {
    records = Array.isArray(nextRecords) ? trimAndSort(nextRecords) : [];
    syncPendingIndex();
    return records;
  }

  function getRecords() {
    return [...records];
  }

  function upsertRecord(record) {
    const idx = records.findIndex((row) => row.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records = [record, ...records];
    records = trimAndSort(records);
    if (record?.outcome?.status === "pending") pendingIndex.set(record.id, true);
    else pendingIndex.delete(record.id);
  }

  function createSnapshot({ candle, candles, neuronActivations = [], seededPatterns = [], policyConfig = {}, sourceStatus = null }) {
    const snapshot = createLiveShadowSnapshot({ candle, candles, neuronActivations, seededPatterns, policyConfig, sourceStatus, records });
    if (snapshot) console.info("[Shadow] snapshot created (observer/projector mode)");
    return snapshot;
  }

  function applyRecordOperatorFeedback(id, payload = {}) {
    const idx = records.findIndex((row) => row.id === id);
    if (idx < 0) return null;
    const record = records[idx];
    const applied = applyOperatorFeedback(record, payload);
    if (!applied?.recalculated) return null;

    const next = {
      ...record,
      operatorFeedback: {
        actions: applied.actions,
        note: applied.note,
        timestamp: applied.recalculated.timestamp,
        history: [
          ...(record.operatorFeedback?.history || []),
          { actions: applied.actions, note: applied.note, timestamp: applied.recalculated.timestamp, recalculated: applied.recalculated },
        ].slice(-25),
      },
      decisionTrace: {
        ...(record.decisionTrace || {}),
        operatorCorrected: {
          ...applied.recalculated,
          action: applied.recalculated.finalAction,
        },
      },
      learningMemory: {
        patterns: [...new Set([...(record.learningMemory?.patterns || []), ...deriveOperatorPatternFeedback({ ...record, operatorFeedback: applied })])],
      },
    };

    const actionRecord = operatorActionLogger.logOperatorAction({
      actionId: `op_${record.id}_${Date.now()}`,
      timestamp: applied.recalculated.timestamp,
      symbol: record.symbol,
      timeframe: record.timeframe,
      linkedTradeId: record.id,
      linkedDecisionId: record.id,
      operatorAction: { type: applied.actions?.[0] || "none", note: applied.note || null },
      context20: { contextSignature: record.stateSummary?.contextSignature, regime: record.policy?.regime },
      immediateEffect: { decisionChanged: true },
      laterEvaluation: { evaluated: false },
    });

    next.operatorIntelligence = { actionId: actionRecord.actionId, actionType: actionRecord.operatorAction.type };
    records[idx] = next;
    return next;
  }

  function resolvePending({ candles = [], maxHoldBars = 24 }) {
    const pendingIds = Array.from(pendingIndex.keys());
    if (!pendingIds.length) return [];

    const { nextRecords, resolved } = resolveLiveShadowPending({ records, pendingIds, candles, maxHoldBars });
    records = trimAndSort(nextRecords);

    resolved.forEach((next) => {
      const diagnosticResult = analyzeOutcome(next.decisionContext || {}, {
        outcome: next.outcome.result,
        pnl: next.outcome.pnl,
        duration: next.outcome.barsElapsed,
        exitReason: next.outcome.resolutionReason,
      });
      const learningUpdate = persistOutcomeLearning({
        updater: updateLearningModel,
        diagnosticResult,
        meta: {
          outcomeType: next.outcome.result,
          outcome: next.outcome,
          direction: next.decisionTrace?.machine?.action || next.policy?.action || "NONE",
        },
      });
      next.learningFeedback = {
        lastDiagnosis: diagnosticResult,
        adjustmentsApplied: learningUpdate?.weightAdjustments || {},
      };

      if (next.operatorIntelligence?.actionId) {
        const evaluation = evaluateOperatorAction(
          { actionId: next.operatorIntelligence.actionId, operatorAction: { type: next.operatorIntelligence.actionType || "none" } },
          { result: next.outcome?.result, machineResult: next.outcome?.result },
        );
        operatorActionLogger.updateActionEvaluation(next.operatorIntelligence.actionId, { ...evaluation, marketOutcome: next.outcome || null });
      }
      pendingIndex.delete(next.id);
    });

    if (resolved.length) {
      const patternSummary = analyzeOperatorPatterns(loadOperatorActions(), loadTradeMemories(), loadDecisionMemories());
      saveOperatorPatternSummary(patternSummary);
      console.debug("Operator pattern summary updated", { evaluatedActions: patternSummary?.totals?.evaluatedActions || 0 });
    }
    return resolved;
  }

  return {
    setRecords,
    getRecords,
    createSnapshot,
    applyRecordOperatorFeedback,
    upsertRecord,
    resolvePending,
    getPendingCount: () => pendingIndex.size,
    getAnalytics: () => buildLiveShadowAnalytics(records),
  };
}
