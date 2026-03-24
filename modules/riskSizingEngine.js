function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function avg(values = []) {
  if (!Array.isArray(values) || !values.length) return 0;
  return values.reduce((acc, row) => acc + toNumber(row, 0), 0) / values.length;
}

function modeFromInputs({ learningMode, autoShift = {}, verdict = {} } = {}) {
  const mode = String(learningMode || autoShift?.learning_mode || verdict?.learning_mode || "mixed").toLowerCase();
  if (["exploration", "mixed", "exploitation", "blocked"].includes(mode)) return mode;
  return "mixed";
}

function contextMaturityFromInputs({ autoShift = {}, verdict = {}, contextMemory = {}, profile = {} } = {}) {
  const explicit = String(autoShift?.context_maturity || verdict?.context_maturity || "").toLowerCase();
  if (["immature", "growing", "mature"].includes(explicit)) return explicit;
  const samples = Math.max(0, toNumber(contextMemory?.samples ?? contextMemory?.counts, 0));
  if (samples < toNumber(profile?.min_samples_before_strict_block, 10)) return "immature";
  if (samples < toNumber(profile?.min_samples_before_context_maturity, 20)) return "growing";
  return "mature";
}

function resolveScenarioReliability({ scenarioReliability, contextMemory = {}, learningProgress = {}, scenario = {} } = {}) {
  const direct = toNumber(scenarioReliability, NaN);
  if (Number.isFinite(direct)) return clamp(direct, 0, 1);
  const scenarioMap = contextMemory?.scenarioReliability || {};
  const scenarioType = scenario?.type || scenario?.name || "unknown";
  const mapped = toNumber(scenarioMap?.[scenarioType], NaN);
  if (Number.isFinite(mapped)) return clamp(mapped, 0, 1);
  const mapAvg = avg(Object.values(scenarioMap));
  if (mapAvg > 0) return clamp(mapAvg, 0, 1);
  return clamp(toNumber(learningProgress?.scenarioReliability, 0.5), 0, 1);
}

const DEFAULT_CAPITAL_BANDS = Object.freeze({
  exploration: { min: 0.002, max: 0.004 },
  mixed: { min: 0.004, max: 0.007 },
  exploitation: { min: 0.007, max: 0.01 },
  blocked: { min: 0, max: 0 },
});

function computeCapitalFraction(mode, sizeMultiplier, config = {}) {
  const bands = { ...DEFAULT_CAPITAL_BANDS, ...(config?.capitalBands || {}) };
  const selected = bands?.[mode] || bands.mixed;
  const min = clamp(toNumber(selected?.min, 0), 0, 1);
  const max = clamp(toNumber(selected?.max, min), min, 1);
  if (max <= min) return Number(min.toFixed(4));
  const normalized = clamp((clamp(sizeMultiplier, 0, 1) - 0) / 1, 0, 1);
  return Number((min + (max - min) * normalized).toFixed(4));
}

export function computeRiskSizing({
  brainVerdict = {},
  autoShift = {},
  contextMemory = {},
  learningProgress = {},
  scenarioReliability = null,
  executorMode = "paper",
  scenario = {},
  executionPacket = {},
  config = {},
} = {}) {
  const riskMode = modeFromInputs({
    learningMode: brainVerdict?.learning_mode,
    autoShift,
    verdict: brainVerdict,
  });
  const baseByMode = { exploration: 0.35, mixed: 0.6, exploitation: 0.9, blocked: 0 };
  const base = toNumber(baseByMode[riskMode], 0.6);

  const confidence = clamp(toNumber(autoShift?.final_confidence, brainVerdict?.confidence), 0, 1);
  const familiarity = clamp(toNumber(autoShift?.familiarity, brainVerdict?.familiarity), 0, 1);
  const scenarioScore = resolveScenarioReliability({ scenarioReliability, contextMemory, learningProgress, scenario });
  const danger = clamp(toNumber(brainVerdict?.danger_score, autoShift?.danger_score), 0, 1);
  const friction = clamp(toNumber(brainVerdict?.friction, 0), 0, 1);

  const activeRules = Array.isArray(brainVerdict?.active_rules) ? brainVerdict.active_rules : [];
  const rulePenalty = clamp(
    activeRules.reduce((acc, rule) => {
      const effect = rule?.effect || {};
      const penalty = toNumber(effect?.friction, 0) + Math.abs(toNumber(effect?.confidencePenalty, 0));
      return acc + penalty;
    }, 0) * 0.05,
    0,
    0.2,
  );

  const confidenceBonus = confidence * 0.2;
  const familiarityBonus = familiarity * 0.15;
  const scenarioBonus = scenarioScore * 0.15;
  const dangerPenalty = danger * 0.2;
  const frictionPenalty = clamp((friction * 0.2) + rulePenalty, 0, 0.35);

  let sizeMultiplier = clamp(base + confidenceBonus + familiarityBonus + scenarioBonus - dangerPenalty - frictionPenalty, 0, 1);
  const reasons = [];
  const maturity = contextMaturityFromInputs({
    autoShift,
    verdict: brainVerdict,
    contextMemory,
    profile: config?.learningProfile || {},
  });

  if (riskMode === "blocked") {
    sizeMultiplier = 0;
    reasons.push("blocked_mode_zero_size");
    const riskScoreBlocked = clamp(
      (confidence * 0.2)
      + (scenarioScore * 0.15)
      + (familiarity * 0.1)
      - (danger * 0.2)
      - (friction * 0.15),
      0,
      1,
    );
    return {
      risk_mode: riskMode,
      size_multiplier: 0,
      risk_score: Number(riskScoreBlocked.toFixed(3)),
      capital_fraction: computeCapitalFraction(riskMode, 0, config),
      reason: reasons,
      components: {
        base: Number(base.toFixed(3)),
        confidence_bonus: Number(confidenceBonus.toFixed(3)),
        familiarity_bonus: Number(familiarityBonus.toFixed(3)),
        scenario_bonus: Number(scenarioBonus.toFixed(3)),
        danger_penalty: Number(dangerPenalty.toFixed(3)),
        friction_penalty: Number(frictionPenalty.toFixed(3)),
      },
    };
  }

  if (riskMode === "exploration" || brainVerdict?.exploration_override_applied) {
    const explorationMin = 0.2;
    const explorationMax = 0.4;
    if (sizeMultiplier < explorationMin) reasons.push("exploration_floor_applied");
    if (sizeMultiplier > explorationMax) reasons.push("exploration_cap_applied");
    sizeMultiplier = clamp(sizeMultiplier, explorationMin, explorationMax);
  } else if (maturity === "immature") {
    if (sizeMultiplier > 0.5) reasons.push("immature_context_cap_applied");
    sizeMultiplier = Math.min(sizeMultiplier, 0.5);
  }
  if (sizeMultiplier <= 0) {
    sizeMultiplier = riskMode === "mixed" ? 0.05 : riskMode === "exploitation" ? 0.1 : 0.2;
    reasons.push("non_blocked_min_size_applied");
  }

  const manualConfirmationRequired = executionPacket?.manualConfirmationRequired !== false;
  if (String(executorMode).toLowerCase() === "live" && manualConfirmationRequired && !executionPacket?.manualConfirmed) {
    reasons.push("live_manual_confirmation_missing");
  }

  if (frictionPenalty > 0.12 || dangerPenalty > 0.12) {
    reasons.push("reduced_by_friction_danger");
  }
  if ((familiarityBonus + scenarioBonus) > 0.12) {
    reasons.push("boosted_by_familiarity_scenario");
  }
  if (!reasons.length) reasons.push("balanced_risk_profile");

  const riskScore = clamp(
    (sizeMultiplier * 0.55)
    + (confidence * 0.2)
    + (scenarioScore * 0.15)
    + (familiarity * 0.1)
    - (danger * 0.2)
    - (friction * 0.15),
    0,
    1,
  );
  const capitalFraction = computeCapitalFraction(riskMode, sizeMultiplier, config);

  return {
    risk_mode: riskMode,
    size_multiplier: Number(sizeMultiplier.toFixed(3)),
    risk_score: Number(riskScore.toFixed(3)),
    capital_fraction: capitalFraction,
    reason: reasons,
    components: {
      base: Number(base.toFixed(3)),
      confidence_bonus: Number(confidenceBonus.toFixed(3)),
      familiarity_bonus: Number(familiarityBonus.toFixed(3)),
      scenario_bonus: Number(scenarioBonus.toFixed(3)),
      danger_penalty: Number(dangerPenalty.toFixed(3)),
      friction_penalty: Number(frictionPenalty.toFixed(3)),
    },
  };
}
