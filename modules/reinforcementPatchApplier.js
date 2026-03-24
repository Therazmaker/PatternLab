function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function toFiniteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeScenarioProbability(probability, confidence) {
  const direct = clamp(probability, 0, 1);
  if (direct !== null) return direct;
  return clamp(confidence, 0, 1);
}

function byPriority(a, b) {
  const ap = Number.isFinite(a?.priority) ? a.priority : 999;
  const bp = Number.isFinite(b?.priority) ? b.priority : 999;
  return ap - bp;
}

export function applyReinforcementPatch({
  reinforcement = {},
  brainVerdict = {},
  scenarioSet = {},
  brainMemoryStore = null,
  contextSignature = null,
  linkage = {},
  riskCaps = {},
  log = () => {},
} = {}) {
  const nextVerdict = { ...(brainVerdict || {}) };
  const baseConfidenceBeforePatch = toFiniteNumber(nextVerdict.confidence, 0);
  const nextScenarioSet = { ...(scenarioSet || {}), scenarios: Array.isArray(scenarioSet?.scenarios) ? scenarioSet.scenarios.map((row) => ({ ...row })) : [] };
  const appliedFields = [];
  const logs = [];

  const addLog = (line) => {
    logs.push(line);
    log(line);
  };

  const verdictPatch = reinforcement?.verdict_patch || {};
  const allowedVerdictKeys = ["confidence", "confidence_delta", "posture", "entry_quality", "bias", "no_trade_reason", "allow_trade"];
  allowedVerdictKeys.forEach((key) => {
    if (verdictPatch[key] === undefined) return;
    if (key === "confidence") {
      nextVerdict.confidence = clamp(verdictPatch[key], 0, 1) ?? nextVerdict.confidence;
    } else if (key === "confidence_delta") {
      const delta = toFiniteNumber(verdictPatch[key], 0);
      const base = toFiniteNumber(nextVerdict.confidence, 0);
      nextVerdict.confidence = clamp(base + delta, 0, 1) ?? base;
      nextVerdict.reinforcement_confidence_delta = Number(delta.toFixed(3));
      addLog(`[Confidence] applied reinforcement delta ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`);
    } else if (key === "allow_trade") {
      const wantsAllowTrade = Boolean(verdictPatch[key]);
      if (!wantsAllowTrade) {
        nextVerdict.allow_trade = false;
      } else {
        const activePlan = nextVerdict?.next_candle_plan || {};
        if (activePlan?.invalidation && (activePlan?.trigger_long || activePlan?.trigger_short)) {
          nextVerdict.allow_trade = true;
        } else {
          addLog("[Assist] allow_trade=true ignored (missing trigger/invalidation)");
        }
      }
    } else {
      nextVerdict[key] = verdictPatch[key];
    }
    appliedFields.push(`verdict_patch.${key}`);
  });

  const riskPatch = reinforcement?.risk_patch || {};
  ["danger_score", "friction", "context_score", "familiarity"].forEach((key) => {
    if (riskPatch[key] === undefined) return;
    const normalized = clamp(riskPatch[key], 0, 1);
    if (normalized !== null) {
      nextVerdict[key] = normalized;
      appliedFields.push(`risk_patch.${key}`);
    }
  });

  const nextPlanPatch = reinforcement?.next_candle_patch || {};
  const disallowedExecutionKeys = ["open_trade", "execute_trade", "send_order", "force_entry", "authority_bypass"];
  const blockedExecutionPatch = disallowedExecutionKeys.some((key) => nextPlanPatch[key] !== undefined);
  if (!blockedExecutionPatch) {
    const currentPlan = { ...(nextVerdict?.next_candle_plan || {}) };
    ["posture", "trigger_long", "trigger_short", "invalidation", "reasoning_summary", "entry_quality", "bias_hint"].forEach((key) => {
      if (nextPlanPatch[key] !== undefined) {
        if ((key === "trigger_long" || key === "trigger_short" || key === "invalidation") && !String(nextPlanPatch[key] || "").trim()) return;
        currentPlan[key] = nextPlanPatch[key];
        appliedFields.push(`next_candle_patch.${key}`);
      }
    });
    if (!currentPlan?.invalidation || (!currentPlan?.trigger_long && !currentPlan?.trigger_short)) {
      addLog("[Assist] trigger/invalidation patch ignored to preserve safety constraints");
    } else {
      nextVerdict.next_candle_plan = currentPlan;
    }
  }

  const ruleUpdates = Array.isArray(reinforcement?.rule_updates) ? reinforcement.rule_updates : [];
  let rulesUpdated = 0;
  ruleUpdates.forEach((update) => {
    const id = update?.rule_id;
    if (!id) return;
    const current = brainMemoryStore?.getSnapshot?.().rules?.[id] || {};
    const nextRule = { ...current, id };
    if (update.action === "activate") {
      nextRule.active = true;
      addLog(`[Assist] Rule activated: ${id}`);
    } else if (update.action === "deactivate") {
      nextRule.active = false;
      addLog(`[Assist] Rule deactivated: ${id}`);
    } else if (update.action === "adjust_weight") {
      nextRule.weight = toFiniteNumber(update.weight, nextRule.weight ?? 1);
      addLog(`[Assist] Rule weight adjusted: ${id} -> ${nextRule.weight}`);
    }
    if (update.reason) nextRule.reason = update.reason;
    brainMemoryStore?.upsertRule?.(id, nextRule, { ...linkage, context_signature: contextSignature });
    rulesUpdated += 1;
  });

  const updatesByScenario = (reinforcement?.scenario_updates || []).slice().sort(byPriority);
  if (nextScenarioSet.scenarios.length && updatesByScenario.length) {
    const updatedScenarios = nextScenarioSet.scenarios.map((scenario, idx) => {
      const update = updatesByScenario.find((row) => row.scenario_id === scenario.id || row.scenario_name === scenario.name || row.scenario_name === scenario.type);
      if (!update) return { ...scenario, _priority: idx + 1 };
      const next = { ...scenario, _priority: Number.isFinite(update.priority) ? update.priority : idx + 1 };
      const nextProb = normalizeScenarioProbability(update.probability, update.confidence_delta !== null ? (scenario.confidence || 0) + Number(update.confidence_delta || 0) : null);
      if (nextProb !== null) {
        next.probability = nextProb;
        next.confidence = nextProb;
      } else if (Number.isFinite(update.confidence_delta)) {
        next.confidence = clamp((Number(scenario.confidence || 0) + Number(update.confidence_delta)), 0, 1);
      }
      if (Number.isFinite(update.weight_delta)) next.weight = Number(scenario.weight || 1) + Number(update.weight_delta);
      if (update.reason) next.assist_reason = update.reason;
      return next;
    }).sort((a, b) => Number(a._priority || 999) - Number(b._priority || 999)).map((row, idx) => ({ ...row, rank: idx + 1 }));
    nextScenarioSet.scenarios = updatedScenarios;
    appliedFields.push("scenario_updates");
    addLog("[Assist] Scenario updated");
  }

  if (riskPatch.size_multiplier !== undefined) {
    const incomingSize = toFiniteNumber(riskPatch.size_multiplier, null);
    if (incomingSize !== null) {
      const hardCap = Number.isFinite(riskCaps?.maxSizeMultiplier) ? riskCaps.maxSizeMultiplier : 1;
      nextVerdict.risk_size_multiplier = Math.max(0, Math.min(hardCap, incomingSize));
      appliedFields.push("risk_patch.size_multiplier");
    }
  }
  if (riskPatch.max_size_cap !== undefined) {
    const incomingCap = toFiniteNumber(riskPatch.max_size_cap, null);
    if (incomingCap !== null) {
      const hardCap = Number.isFinite(riskCaps?.maxSizeMultiplier) ? riskCaps.maxSizeMultiplier : 1;
      nextVerdict.risk_size_cap = Math.max(0, Math.min(hardCap, incomingCap));
      appliedFields.push("risk_patch.max_size_cap");
    }
  }

  const learningPatch = reinforcement?.learning_patch || {};
  const lessonTags = Array.isArray(learningPatch?.lesson_tags) ? learningPatch.lesson_tags.filter(Boolean) : [];
  const contextPatch = {};
  if (learningPatch?.learned_bias) {
    nextVerdict.learned_bias = learningPatch.learned_bias;
    contextPatch.learned_bias = learningPatch.learned_bias;
    appliedFields.push("learning_patch.learned_bias");
  }
  if (learningPatch?.preferred_posture) {
    contextPatch.preferredPosture = learningPatch.preferred_posture;
    appliedFields.push("learning_patch.preferred_posture");
  }
  if (learningPatch?.danger_score !== null && learningPatch?.danger_score !== undefined) {
    const score = clamp(learningPatch?.danger_score, 0, 1);
    if (score !== null) {
      nextVerdict.danger_score = score;
      contextPatch.danger_score = score;
      appliedFields.push("learning_patch.danger_score");
    }
  }
  if (learningPatch?.familiarity !== null && learningPatch?.familiarity !== undefined) {
    const familiarity = clamp(learningPatch?.familiarity, 0, 1);
    if (familiarity !== null) {
      nextVerdict.familiarity = familiarity;
      contextPatch.familiarity = familiarity;
      appliedFields.push("learning_patch.familiarity");
    }
  }
  if (lessonTags.length) {
    const existing = Array.isArray(nextVerdict.lesson_tags) ? nextVerdict.lesson_tags : [];
    nextVerdict.lesson_tags = Array.from(new Set([...existing, ...lessonTags]));
    contextPatch.lesson_tags = nextVerdict.lesson_tags;
    appliedFields.push("learning_patch.lesson_tags");
  }
  if (Object.keys(contextPatch).length && contextSignature) {
    brainMemoryStore?.upsertContext?.(contextSignature, contextPatch, { ...linkage, context_signature: contextSignature });
  }
  if (contextSignature) {
    brainMemoryStore?.upsertContext?.(contextSignature, {
      reinforcement_confidence_delta: toFiniteNumber(nextVerdict.reinforcement_confidence_delta, 0),
      reinforcement_confidence: toFiniteNumber(nextVerdict.confidence, 0),
    }, { ...linkage, context_signature: contextSignature });
  }
  if (Object.keys(contextPatch).length) addLog("[Assist] Learning patch applied");

  const summaryHeadline = reinforcement?.assistant_summary?.headline || reinforcement?.assistant_summary?.summary || "Reinforcement applied";

  return {
    brainVerdict: nextVerdict,
    scenarioSet: nextScenarioSet,
    appliedFields,
    logs,
    stats: {
      rulesUpdated,
      scenarioChanges: updatesByScenario.length,
      lessonTagsAdded: lessonTags,
      confidenceDelta: toFiniteNumber(nextVerdict.confidence, 0) - baseConfidenceBeforePatch,
      headline: summaryHeadline,
    },
  };
}
