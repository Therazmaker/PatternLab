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
    "Usa el JSON adjunto para analizar contexto, estructura, momentum, triggers e intervención humana.",
    "Entrega respuesta compacta con: (1) lectura del régimen, (2) escenarios principal/alterno, (3) invalidaciones,",
    "(4) plan operativo sugerido con gatillos claros, (5) riesgos y sesgos cognitivos detectados, (6) qué confirmaciones faltan.",
    `Caso: ${caseLabel}. Prioriza claridad y decisión asistida por humano.`,
  ].join(" ");
}

export function buildChatGPTAssistedExport(currentSessionContext = {}) {
  const metadata = compactObject({
    schema: "patternlab_assisted_v1",
    exportedAt: new Date().toISOString(),
    mode: currentSessionContext.mode || "manual_session",
    sessionId: currentSessionContext.session?.id || null,
    sessionStatus: currentSessionContext.session?.status || null,
    symbol: currentSessionContext.marketView?.symbol || currentSessionContext.session?.asset || null,
    timeframe: currentSessionContext.marketView?.timeframe || currentSessionContext.session?.tf || null,
    source: currentSessionContext.marketView?.source || null,
    selectedCandleIndex: currentSessionContext.selectedCandleIndex || null,
  });

  const analysis = currentSessionContext.analysis || {};
  const overlays = analysis.overlays || {};
  const pseudoMl = analysis.pseudoMl || {};
  const probability = pseudoMl.probability || {};
  const regime = pseudoMl.regime || {};
  const operatorState = currentSessionContext.operatorState || {};
  const currentSignal = operatorState.currentSignal || {};
  const currentCtx = operatorState.currentContext || {};
  const livePlan = currentSessionContext.livePlanRecord || null;

  const payload = {
    metadata,
    market_current: compactObject({
      currentPrice: asNumber(overlays.currentPrice),
      recentHigh: asNumber(overlays.recentHigh),
      recentLow: asNumber(overlays.recentLow),
      candleCount: asNumber(analysis.candleCount),
      lastCandleSummary: analysis.lastCandleSummary || null,
      pushState: analysis.pushState || null,
      continuationContext: analysis.continuationContext || null,
    }),
    regime_context: compactObject({
      regime: regime.regime || currentCtx.regime || null,
      strength: asNumber(regime.strength),
      explanation: regime.explanation || null,
      volatilityCondition: analysis.volatilityCondition || currentCtx.volatilityCondition || null,
      sequenceFlags: compactList(analysis.sequenceFlags || [], 5),
    }),
    scores: compactObject({
      bullishScore: asNumber(probability.bullishScore),
      bearishScore: asNumber(probability.bearishScore),
      neutralScore: asNumber(probability.neutralScore),
      confidence: asNumber(probability.confidence),
      bias: probability.bias || null,
      machineDirection: currentSignal.direction || null,
    }),
    momentum_volatility_compression: compactObject({
      momentum: analysis.momentumCondition || null,
      volatility: analysis.volatilityCondition || null,
      compressionState: (analysis.sequenceFlags || []).includes("inside bar compression") ? "inside_bar_compression" : "none",
      latestConfirmsMove: Boolean(analysis.latestConfirmsMove),
    }),
    levels_and_triggers: {
      supports: compactList((overlays.supportZones || []).map((row) => compactObject({
        price: asNumber(row.price),
        strength: asNumber(row.strength),
        source: row.source || null,
      })), 5),
      resistances: compactList((overlays.resistanceZones || []).map((row) => compactObject({
        price: asNumber(row.price),
        strength: asNumber(row.strength),
        source: row.source || null,
      })), 5),
      triggerLines: compactList((currentSessionContext.triggerLines || []).map((row) => compactObject({
        id: row.id || null,
        level: asNumber(row.level ?? row.price),
        role: row.triggerConfig?.role || null,
        condition: row.triggerConfig?.condition || null,
        biasOnTrigger: row.triggerConfig?.biasOnTrigger || null,
        status: row.runtimeState?.status || null,
        note: row.triggerConfig?.note || row.label || null,
      })), 8),
    },
    manual_drawings: compactList((currentSessionContext.manualDrawings || []).map((row) => compactObject({
      id: row.id || null,
      type: row.type || null,
      label: row.label || null,
      price: asNumber(row.price),
      points: Array.isArray(row.points) ? row.points.slice(0, 2).map((point) => compactObject({ time: asNumber(point?.time), price: asNumber(point?.price) })) : null,
      metadata: compactObject({ symbol: row.metadata?.symbol, timeframe: row.metadata?.timeframe }),
    })), 12),
    human_insights: compactList((currentSessionContext.humanInsights || []).map((row) => compactObject({
      id: row.id || null,
      linkedDrawingId: row.linkedDrawingId || null,
      insightType: row.insightType || null,
      conditionType: row.condition?.type || null,
      directionBias: row.condition?.directionBias || null,
      requireConfirmation: Boolean(row.condition?.requireConfirmation),
      effect: compactObject({
        boostBias: asNumber(row.effect?.boostBias),
        reduceOpposite: asNumber(row.effect?.reduceOpposite),
        confidenceWeight: asNumber(row.effect?.confidenceWeight),
      }),
      note: row.note || row.metadata?.label || null,
    })), 10),
    analyst_narrative: compactObject({
      marketObservations: compactList(analysis.observations || [], 8),
      analystNarrative: currentSessionContext.analystData?.narrative || null,
      setupType: currentSessionContext.analystData?.setupType || null,
      tradePosture: currentSessionContext.analystData?.tradePosture || null,
      contextLabel: currentSessionContext.analystData?.contextLabel || null,
    }),
    operator_actions_and_note: compactObject({
      selectedActions: compactList(operatorState.operatorSelection || [], 6),
      operatorNote: operatorState.operatorNote || null,
      lastOperatorActionId: operatorState.lastOperatorActionId || null,
      recalculatedDecision: operatorState.recalculatedDecision || null,
      recalculatedDecisionExplanation: operatorState.recalculatedDecisionExplanation || null,
    }),
    learning_impact: compactObject({
      learningModifier: asNumber(operatorState.recalculatedDecision?.decisionBreakdown?.learningComponent),
      humanInsightSummary: currentCtx.humanInsightEvaluation?.summaryText || null,
      triggerSummary: currentCtx.triggerLineEvaluation?.summaryText || null,
      operatorInfluence: compactList(currentSessionContext.livePlanRecord?.decisionTrace?.operatorCorrected?.operatorInfluence || [], 5),
    }),
    decision_breakdown: compactObject({
      before: currentSignal.baseDecision || null,
      after: operatorState.recalculatedDecision || currentSignal.baseDecision || null,
      breakdown: operatorState.recalculatedDecision?.decisionBreakdown || currentSignal.baseDecision?.decisionBreakdown || null,
    }),
    trade_proposal: compactObject({
      action: livePlan?.policy?.action || null,
      confidence: asNumber(livePlan?.policy?.confidence),
      thesis: livePlan?.policy?.reason || null,
      tags: compactList(livePlan?.policy?.thesisTags || [], 6),
      entry: asNumber(livePlan?.plan?.referencePrice),
      stopLoss: asNumber(livePlan?.plan?.stopLoss),
      takeProfit: asNumber(livePlan?.plan?.takeProfit),
      status: livePlan?.outcome?.status || null,
    }),
  };

  payload.chatgpt_final_question = "Con este contexto, ¿cuál sería tu plan asistido (escenario base + alterno), qué gatillos confirmarías, y qué invalidación te haría no operar por ahora?";

  const prompt_ready_text = buildPromptReadyText(payload);

  return {
    schema_version: "patternlab_assisted_v1",
    prompt_ready_text,
    payload,
  };
}
