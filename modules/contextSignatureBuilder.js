const VALID_REGIMES = ["trending_up", "trending_down", "ranging", "volatile"];
const VALID_SWING = ["HH_HL", "LH_LL", "range", "unknown"];
const VALID_STRENGTH = ["weak", "medium", "strong"];

function normalizeText(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeFromSet(value, validValues, fallback) {
  const normalized = normalizeText(value, fallback);
  return validValues.includes(normalized) ? normalized : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

export function buildContextSignature(context = {}) {
  return {
    regime: normalizeFromSet(context.regime, VALID_REGIMES, "ranging"),
    swingStructure: normalizeFromSet(context.swingStructure, VALID_SWING, "unknown"),
    nearResistance: asBoolean(context.nearResistance, false),
    nearSupport: asBoolean(context.nearSupport, false),
    momentumState: normalizeFromSet(context.momentumState, VALID_STRENGTH, "medium"),
    followThroughState: normalizeFromSet(context.followThroughState, VALID_STRENGTH, "medium"),
  };
}

export function toContextSignatureKey(signature = {}) {
  const normalized = buildContextSignature(signature);
  return [
    normalized.regime,
    normalized.swingStructure,
    normalized.nearResistance ? "nr1" : "nr0",
    normalized.nearSupport ? "ns1" : "ns0",
    normalized.momentumState,
    normalized.followThroughState,
  ].join("|");
}
