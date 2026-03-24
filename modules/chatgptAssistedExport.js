function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compactList(values = [], limit = 8) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => value !== null && value !== undefined && value !== "").slice(0, limit);
}

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function buildPromptReadyText(payload) {
  const caseLabel = `${payload.metadata?.symbol || "UNKNOWN"} ${payload.metadata?.timeframe || "5m"}`;
  return [
    "Actúa como copiloto de trading discrecional en modo asistido.",
    "No asumas ejecución automática ni envíes órdenes.",
    "Usa el JSON adjunto para analizar contexto, veredicto del brain, escenarios, autoridad de ejecución y overrides.",
    "Entrega respuesta compacta con escenario base/alterno, gatillos, invalidaciones y por qué esperar/operar.",
    `Caso: ${caseLabel}. Prioriza machine proposes / human decides.`,
  ].join(" ");
}

export function buildChatGPTAssistedExport(currentSessionContext = {}) {
  const metadata = compactObject({
    schema: "patternlab_assisted_v2",
    exportedAt: new Date().toISOString(),
    mode: currentSessionContext.mode || "manual_session",
    sessionId: currentSessionContext.session?.id || null,
    symbol: currentSessionContext.marketView?.symbol || currentSessionContext.session?.asset || null,
    timeframe: currentSessionContext.marketView?.timeframe || currentSessionContext.session?.tf || null,
    source: currentSessionContext.marketView?.source || null,
  });

  const analysis = currentSessionContext.analysis || {};
  const overlays = analysis.overlays || {};
  const brainVerdict = currentSessionContext.brainVerdict || null;
  const scenarioSet = currentSessionContext.scenarioProjection || currentSessionContext.scenarioSet || null;
  const execution = currentSessionContext.executionPacket || {};
  const operatorState = currentSessionContext.operatorState || {};
  const latestPolicy = currentSessionContext.livePlanRecord || null;

  const payload = {
    metadata,
    context_signature: scenarioSet?.context_signature || brainVerdict?.learningEffects?.signature || null,
    market_context_packet: compactObject({
      currentPrice: asNumber(overlays.currentPrice),
      nearestSupport: asNumber(overlays.nearestSupport),
      nearestResistance: asNumber(overlays.nearestResistance),
      supportDistance: asNumber(overlays.currentPrice) && asNumber(overlays.nearestSupport) ? Number((asNumber(overlays.currentPrice) - asNumber(overlays.nearestSupport)).toFixed(6)) : null,
      resistanceDistance: asNumber(overlays.currentPrice) && asNumber(overlays.nearestResistance) ? Number((asNumber(overlays.nearestResistance) - asNumber(overlays.currentPrice)).toFixed(6)) : null,
      momentum: analysis.momentumCondition || null,
      volatility: analysis.volatilityCondition || null,
      pushState: analysis.pushState || null,
      continuationContext: analysis.continuationContext || null,
    }),
    brain_verdict: brainVerdict,
    scenario_set: scenarioSet,
    execution_authority: compactObject({
      authority: execution.authority || currentSessionContext.executionControlState?.executionAuthority || null,
      shadowExecutionEnabled: execution.shadowExecutionEnabled,
      manualConfirmationRequired: execution.manualConfirmationRequired,
    }),
    operator_override_info: compactObject({
      selectedActions: compactList(operatorState.operatorSelection || [], 10),
      lastOperatorActionId: operatorState.lastOperatorActionId || null,
      overrideDecision: operatorState.recalculatedDecision?.finalDecision || null,
    }),
    why_wait: brainVerdict?.no_trade_reason || null,
    why_trade: brainVerdict?.next_candle_plan?.reasoning_summary || latestPolicy?.policy?.reason || null,
    late_entry: analysis.pushState === "pushing" || analysis.continuationContext === "late",
    rejection_detected: (analysis.sequenceFlags || []).some((row) => String(row).toLowerCase().includes("rejection")),
    confirmation_present: Boolean(analysis.latestConfirmsMove),
    friction: asNumber(brainVerdict?.friction),
    active_rules: compactList((brainVerdict?.active_rules || []).map((row) => row.id || row.text), 12),
    matched_learned_contexts: compactList((brainVerdict?.learned_context_match || []).map((row) => compactObject({ signature: row.signature, sampleCount: row.sampleCount, confidenceAdjustment: row.confidenceAdjustment })), 8),
    trade_taken_by: currentSessionContext.tradeTakenBy || (latestPolicy?.source === "shadow" ? "shadow" : "manual"),
    event_timeline: compactList(currentSessionContext.eventTimeline || [], 80),
    outcome: latestPolicy?.outcome?.status === "resolved" ? latestPolicy.outcome : null,
  };

  payload.chatgpt_final_question = "Con este contexto unificado, ¿qué plan asistido propones (base + alterno), qué confirmación falta y cuándo esperarías en vez de operar?";

  return {
    schema_version: "patternlab_assisted_v2",
    prompt_ready_text: buildPromptReadyText(payload),
    payload,
  };
}
