export function logOperatorDebug(logger = console, payload = {}) {
  logger.debug("Operator layer debug", {
    currentOperatorInput: payload.currentOperatorInput || null,
    historicalOperatorStrength: payload.historicalOperatorStrength ?? null,
    resultingModifierScore: payload.resultingModifierScore ?? null,
    contextSignature: payload.contextSignature || null,
  });
}
