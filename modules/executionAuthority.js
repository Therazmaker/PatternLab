const AUTHORITIES = new Set(["shadow", "copilot", "manual_only"]);

export const DEFAULT_EXECUTION_CONTROL_STATE = Object.freeze({
  shadowExecutionEnabled: false,
  executionAuthority: "copilot",
  manualConfirmationRequired: true,
});

function normalizeAuthority(value) {
  return AUTHORITIES.has(value) ? value : "manual_only";
}

export function normalizeExecutionControlState(raw = {}) {
  const normalized = {
    shadowExecutionEnabled: Boolean(raw?.shadowExecutionEnabled),
    executionAuthority: normalizeAuthority(raw?.executionAuthority),
    manualConfirmationRequired: raw?.manualConfirmationRequired !== false,
  };

  if (!AUTHORITIES.has(raw?.executionAuthority)) {
    normalized.executionAuthority = "manual_only";
  }

  return normalized;
}

export function getExecutionAuthority(state = DEFAULT_EXECUTION_CONTROL_STATE) {
  const authority = normalizeAuthority(state?.executionAuthority);
  if (!AUTHORITIES.has(authority)) return "manual_only";
  return authority;
}

export function getExecutionPacket(state = DEFAULT_EXECUTION_CONTROL_STATE) {
  const authority = getExecutionAuthority(state);
  const normalized = normalizeExecutionControlState(state);
  console.info(`[Execution] authority = ${authority}`);
  return {
    authority,
    shadowExecutionEnabled: normalized.shadowExecutionEnabled,
    manualConfirmationRequired: normalized.manualConfirmationRequired,
    autoExecutionAllowed: authority !== "manual_only" && (authority !== "shadow" || normalized.shadowExecutionEnabled),
  };
}

export function canModuleExecuteTrade(source = "copilot", state = DEFAULT_EXECUTION_CONTROL_STATE) {
  const authority = getExecutionAuthority(state);
  const normalized = normalizeExecutionControlState(state);

  if (authority === "manual_only") {
    console.info("[Execution] manual_only prevents all auto-entry");
    return false;
  }

  if (source === "shadow") {
    const allowed = authority === "shadow" && normalized.shadowExecutionEnabled;
    if (!allowed) console.info(`[Shadow] execution blocked because authority belongs to ${authority}`);
    return allowed;
  }

  if (source === "copilot") return authority === "copilot" || authority === "shadow";
  return false;
}

export function canShadowExecuteTrade(state = DEFAULT_EXECUTION_CONTROL_STATE) {
  return canModuleExecuteTrade("shadow", state);
}

export function blockExecution(source = "unknown", reason = "execution blocked") {
  console.info(`[${String(source || "Execution").replace(/^./, (s) => s.toUpperCase())}] execution blocked: ${reason}`);
  return { allowed: false, reason, source };
}

export function blockShadowTrade(reason = "shadow execution paused") {
  return blockExecution("Shadow", reason);
}
