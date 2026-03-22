import { OPERATOR_ACTION_TYPES, normalizeOperatorActionType } from "./operatorActionTypes.js";
import { buildContextSignature, toContextSignatureKey } from "./contextSignatureBuilder.js";

function emptyActionMetrics() {
  return { count: 0, correctRate: 0, avgCorrectnessScore: 0 };
}

function toVerdictBucket(verdict) {
  if (verdict === "correct") return "correct";
  if (verdict === "incorrect") return "incorrect";
  if (verdict === "partially_correct") return "partiallyCorrect";
  return "neutral";
}

function summarizeGroup(rows = []) {
  if (!rows.length) return emptyActionMetrics();
  const correctLike = rows.filter((row) => ["correct", "partially_correct"].includes(row?.laterEvaluation?.verdict)).length;
  const avgScore = rows.reduce((sum, row) => sum + Number(row?.laterEvaluation?.correctnessScore || 0), 0) / rows.length;
  return {
    count: rows.length,
    correctRate: Number((correctLike / rows.length).toFixed(4)),
    avgCorrectnessScore: Number(avgScore.toFixed(4)),
  };
}

function interpretationForPattern(pattern) {
  if (pattern.correctRate >= 0.75) return "High-value operator edge in this context.";
  if (pattern.correctRate <= 0.35) return "Operator action underperforms in this context; down-weight in live flow.";
  return "Mixed signal quality; keep as soft contextual input.";
}

export function analyzeOperatorPatterns(operatorActions = [], trades = [], decisions = []) {
  const rows = Array.isArray(operatorActions) ? operatorActions : [];
  const evaluated = rows.filter((row) => row?.laterEvaluation?.evaluated);

  const totals = {
    totalActions: rows.length,
    evaluatedActions: evaluated.length,
    correct: 0,
    incorrect: 0,
    neutral: 0,
    partiallyCorrect: 0,
  };

  evaluated.forEach((row) => {
    const bucket = toVerdictBucket(row?.laterEvaluation?.verdict);
    totals[bucket] += 1;
  });

  const byActionType = OPERATOR_ACTION_TYPES.reduce((acc, actionType) => {
    const actionRows = evaluated.filter((row) => normalizeOperatorActionType(row?.operatorAction?.type, "none") === actionType);
    acc[actionType] = summarizeGroup(actionRows);
    return acc;
  }, {});

  const byContext = {};
  const contextActionBuckets = new Map();

  evaluated.forEach((row) => {
    const signature = buildContextSignature(row?.context20?.contextSignature || row?.context20 || {});
    const contextRegime = signature.regime;
    const actionType = normalizeOperatorActionType(row?.operatorAction?.type, "none");
    const key = `${contextRegime}::${actionType}`;
    if (!contextActionBuckets.has(key)) contextActionBuckets.set(key, []);
    contextActionBuckets.get(key).push(row);
  });

  contextActionBuckets.forEach((groupRows, key) => {
    const [regime, actionType] = key.split("::");
    if (!byContext[regime]) byContext[regime] = {};
    byContext[regime][actionType] = summarizeGroup(groupRows);
  });

  const patternBuckets = new Map();
  evaluated.forEach((row) => {
    const actionType = normalizeOperatorActionType(row?.operatorAction?.type, "none");
    const signature = buildContextSignature(row?.context20?.contextSignature || row?.context20 || {});
    const patternKey = `${actionType}::${toContextSignatureKey(signature)}`;
    if (!patternBuckets.has(patternKey)) {
      patternBuckets.set(patternKey, { actionType, signature, rows: [] });
    }
    patternBuckets.get(patternKey).rows.push(row);
  });

  const highValuePatterns = Array.from(patternBuckets.entries())
    .map(([patternId, value]) => {
      const stats = summarizeGroup(value.rows);
      return {
        patternId,
        actionType: value.actionType,
        contextSignature: {
          regime: value.signature.regime,
          swingStructure: value.signature.swingStructure,
          proximity: value.signature.nearResistance ? "near_resistance" : value.signature.nearSupport ? "near_support" : "none",
          momentumState: value.signature.momentumState,
        },
        sampleSize: stats.count,
        correctRate: stats.correctRate,
        avgCorrectnessScore: stats.avgCorrectnessScore,
        interpretation: interpretationForPattern(stats),
      };
    })
    .filter((pattern) => pattern.sampleSize >= 3)
    .sort((a, b) => (b.correctRate * b.sampleSize) - (a.correctRate * a.sampleSize))
    .slice(0, 15);

  return {
    totals,
    byActionType,
    byContext,
    highValuePatterns,
    metadata: {
      generatedAt: new Date().toISOString(),
      linkedTradesCount: Array.isArray(trades) ? trades.length : 0,
      linkedDecisionsCount: Array.isArray(decisions) ? decisions.length : 0,
    },
  };
}
