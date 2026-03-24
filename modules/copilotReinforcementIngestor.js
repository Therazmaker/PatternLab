function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRuleUpdate(row = {}) {
  const action = ["activate", "deactivate", "adjust_weight"].includes(row?.action) ? row.action : null;
  return {
    rule_id: row?.rule_id || row?.id || null,
    action,
    weight: toFiniteNumber(row?.weight),
    reason: row?.reason || null,
  };
}

function normalizeScenarioUpdate(row = {}) {
  return {
    scenario_id: row?.scenario_id || row?.id || null,
    scenario_name: row?.scenario_name || row?.name || null,
    action: row?.action || null,
    probability: toFiniteNumber(row?.probability),
    confidence_delta: toFiniteNumber(row?.confidence_delta),
    weight_delta: toFiniteNumber(row?.weight_delta),
    reason: row?.reason || null,
    priority: toFiniteNumber(row?.priority),
  };
}

const REQUIRED_FIELDS = [
  "verdict_patch",
  "rule_updates",
  "scenario_updates",
  "risk_patch",
  "learning_patch",
  "next_candle_patch",
  "assistant_summary",
];

export function ingestCopilotReinforcement(raw = "") {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ["Invalid JSON format."], reinforcement: null };
    }
  }

  const payload = asObject(parsed);
  const schema = String(payload?.schema || "");
  if (schema !== "patternlab_copilot_reinforcement_v1") {
    return { ok: false, errors: ["Schema must be patternlab_copilot_reinforcement_v1."], reinforcement: null };
  }
  const missingFields = REQUIRED_FIELDS.filter((field) => payload?.[field] === undefined);
  if (missingFields.length) {
    return { ok: false, errors: [`Missing fields: ${missingFields.join(", ")}.`], reinforcement: null };
  }

  const reinforcement = {
    schema,
    source: payload?.source || "external_assistant",
    generated_at: payload?.generated_at || new Date().toISOString(),
    verdict_patch: asObject(payload?.verdict_patch),
    rule_updates: asArray(payload?.rule_updates).map(normalizeRuleUpdate).filter((row) => row.rule_id && row.action),
    scenario_updates: asArray(payload?.scenario_updates).map(normalizeScenarioUpdate),
    risk_patch: asObject(payload?.risk_patch),
    learning_patch: {
      ...asObject(payload?.learning_patch),
      lesson_tags: asArray(payload?.learning_patch?.lesson_tags).map((tag) => String(tag)).filter(Boolean),
      danger_score: toFiniteNumber(payload?.learning_patch?.danger_score),
      familiarity: toFiniteNumber(payload?.learning_patch?.familiarity),
    },
    next_candle_patch: asObject(payload?.next_candle_patch),
    assistant_summary: asObject(payload?.assistant_summary),
  };

  return { ok: true, errors: [], reinforcement };
}

export function applyReinforcement(raw, { patchApplier, patchOptions = {} } = {}) {
  const ingested = ingestCopilotReinforcement(raw);
  if (!ingested.ok) return { ok: false, errors: ingested.errors, result: null, reinforcement: null };
  if (typeof patchApplier !== "function") {
    return { ok: false, errors: ["Patch applier is required."], result: null, reinforcement: ingested.reinforcement };
  }
  const result = patchApplier({ reinforcement: ingested.reinforcement, ...(patchOptions || {}) });
  return { ok: true, errors: [], result, reinforcement: ingested.reinforcement };
}
