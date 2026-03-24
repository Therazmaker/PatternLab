function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function countTrailingLosses(outcomes = []) {
  const rows = Array.isArray(outcomes) ? outcomes : [];
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (String(rows[i]).toLowerCase() === "loss") streak += 1;
    else break;
  }
  return streak;
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLearningMetrics(metrics = {}, contextRow = {}) {
  const familiarity = clamp(
    normalizeNumber(metrics.familiarity, normalizeNumber(contextRow.familiarity, 0)),
    0,
    1,
  );
  return {
    familiarity,
  };
}

function calcFinalConfidence({ baseConfidence = 0, friction = 0, explorationWeight = 0.5, exploitationWeight = 0.5 } = {}) {
  return clamp(
    (normalizeNumber(baseConfidence, 0) * normalizeNumber(exploitationWeight, 0.5))
    + ((1 - clamp(normalizeNumber(friction, 0), 0, 1)) * normalizeNumber(explorationWeight, 0.5)),
    0,
    1,
  );
}

export function evaluateAutoShift({
  contextSignature = null,
  contextMemory = {},
  learningProgress = {},
  verdict = {},
  profile = {},
} = {}) {
  const samples = Math.max(0, normalizeNumber(contextMemory?.samples ?? contextMemory?.counts, 0));
  const winrate = clamp(normalizeNumber(contextMemory?.winrate, 0), 0, 1);
  const dangerScore = clamp(normalizeNumber(contextMemory?.danger_score, 0), 0, 1);
  const lastOutcomes = Array.isArray(contextMemory?.last_outcomes) ? contextMemory.last_outcomes.slice(-8) : [];
  const { familiarity } = normalizeLearningMetrics(learningProgress, contextMemory);
  const trailingLosses = countTrailingLosses(lastOutcomes);

  const reasons = [];
  let learningMode = "mixed";
  let explorationWeight = 0.5;
  let exploitationWeight = 0.5;
  let blockTrading = false;
  let requiresConfirmation = "moderate";
  let frictionPenaltyMultiplier = 1;
  let confidenceBoost = 0;

  const maturedBadContext = samples >= 10 && winrate <= 0.35 && trailingLosses >= 3;
  const exploratoryContext = samples < 8 || familiarity < 0.4;
  const exploitationContext = samples >= 20 && winrate >= 0.55;
  const mixedContext = (samples >= 8 && samples <= 20) || (winrate >= 0.4 && winrate <= 0.6);

  if (maturedBadContext) {
    learningMode = "blocked";
    explorationWeight = 0;
    exploitationWeight = 1;
    blockTrading = true;
    requiresConfirmation = "none";
    reasons.push("matured_bad_context", "repeated_losses");
  } else if (exploratoryContext) {
    learningMode = "exploration";
    explorationWeight = familiarity < 0.25 ? 0.9 : 0.8;
    exploitationWeight = 1 - explorationWeight;
    frictionPenaltyMultiplier = 0.35;
    reasons.push(samples < 8 ? "low_sample_context" : "low_familiarity_context");
  } else if (exploitationContext) {
    learningMode = "exploitation";
    exploitationWeight = winrate >= 0.65 ? 0.9 : 0.8;
    explorationWeight = 1 - exploitationWeight;
    requiresConfirmation = "strong";
    frictionPenaltyMultiplier = 0.75;
    confidenceBoost = 0.08;
    reasons.push("proven_edge", "high_winrate_context");
  } else if (mixedContext) {
    learningMode = "mixed";
    explorationWeight = 0.5;
    exploitationWeight = 0.5;
    requiresConfirmation = "moderate";
    reasons.push("uncertain_edge");
  } else {
    reasons.push("balanced_context");
  }

  const finalConfidence = calcFinalConfidence({
    baseConfidence: verdict?.confidence,
    friction: verdict?.friction,
    explorationWeight,
    exploitationWeight,
  });

  const baseTriggerOk = Boolean(verdict?.next_candle_plan?.trigger_long || verdict?.next_candle_plan?.trigger_short);
  const invalidationOk = Boolean(verdict?.next_candle_plan?.invalidation);
  const isPaper = (verdict?.modeState?.executorMode || verdict?.mode || "paper") !== "live";
  const moderateConfirmation = Boolean(baseTriggerOk && invalidationOk);
  const strongConfirmation = Boolean(
    moderateConfirmation
    && normalizeNumber(verdict?.context_score, 0) >= 0.58
    && normalizeNumber(verdict?.danger_score, 0) <= 0.55
    && normalizeNumber(verdict?.friction, 1) <= 0.65,
  );

  let allowTrade = false;
  let entryQuality = String(verdict?.entry_quality || "wait");

  if (learningMode === "blocked") {
    allowTrade = false;
    entryQuality = "wait";
  } else if (learningMode === "exploration") {
    allowTrade = Boolean(baseTriggerOk && invalidationOk && isPaper);
    if (allowTrade && entryQuality === "wait") entryQuality = profile?.exploration_entry_quality_floor || "C";
  } else if (learningMode === "mixed") {
    allowTrade = moderateConfirmation;
    if (!allowTrade) entryQuality = "wait";
  } else {
    allowTrade = strongConfirmation;
    if (allowTrade) entryQuality = ["A", "B"].includes(String(entryQuality).toUpperCase()) ? entryQuality : "B";
    else entryQuality = "wait";
  }

  if (learningMode === "exploration") {
    console.info(`[AutoShift] Mode: exploration (${reasons[0] || "low sample context"})`);
  } else if (learningMode === "mixed") {
    console.info(`[AutoShift] Mode: mixed (${reasons[0] || "uncertain edge"})`);
  } else if (learningMode === "exploitation") {
    console.info(`[AutoShift] Mode: exploitation (${reasons[0] || "proven edge"})`);
  } else {
    console.info(`[AutoShift] Mode: blocked (${reasons[0] || "repeated losses"})`);
  }

  return {
    context_signature: contextSignature,
    learning_mode: learningMode,
    exploration_weight: Number(clamp(explorationWeight, 0, 1).toFixed(3)),
    exploitation_weight: Number(clamp(exploitationWeight, 0, 1).toFixed(3)),
    block_trading: blockTrading,
    reason: reasons,
    context_maturity: samples < 8 ? "immature" : samples < 20 ? "growing" : "mature",
    trailing_losses: trailingLosses,
    familiarity: Number(familiarity.toFixed(3)),
    samples,
    winrate: Number(winrate.toFixed(3)),
    danger_score: Number(dangerScore.toFixed(3)),
    final_confidence: Number(finalConfidence.toFixed(3)),
    allow_trade: allowTrade,
    entry_quality: entryQuality,
    requires_confirmation: requiresConfirmation,
    friction_penalty_multiplier: Number(frictionPenaltyMultiplier.toFixed(3)),
    confidence_boost: Number(confidenceBoost.toFixed(3)),
    context_pause_candles: blockTrading ? Number(profile?.context_pause_candles || 5) : 0,
    prevent_exploration: blockTrading,
  };
}
