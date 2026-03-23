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

export function canShadowExecuteTrade(state = DEFAULT_EXECUTION_CONTROL_STATE) {
  const authority = getExecutionAuthority(state);
  return Boolean(state?.shadowExecutionEnabled) && authority === "shadow";
}

export function blockShadowTrade(reason = "shadow execution paused") {
  console.info(`[Shadow] Execution blocked: ${reason}`);
  return { allowed: false, reason };
}
