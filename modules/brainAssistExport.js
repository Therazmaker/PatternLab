function toFiniteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function compactList(rows, limit = 20) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row !== undefined && row !== null).slice(0, limit);
}

export function buildBrainAssistPacket(currentSessionContext = {}) {
  const marketView = currentSessionContext.marketView || {};
  const analysis = currentSessionContext.analysis || {};
  const overlays = analysis.overlays || {};
  const brainVerdict = currentSessionContext.brainVerdict || {};
  const scenarioSet = currentSessionContext.scenarioProjection || currentSessionContext.scenarioSet || {};
  const riskProfile = currentSessionContext.riskProfile || {};
  const learningProgress = currentSessionContext.learningProgress || {};
  const manualControls = currentSessionContext.manualControls || {};

  return {
    schema: "patternlab_brain_assist_packet_v1",
    metadata: compactObject({
      exported_at: new Date().toISOString(),
      mode: currentSessionContext.mode || "manual_session",
      session_id: currentSessionContext.session?.id || null,
      symbol: marketView.symbol || currentSessionContext.session?.asset || null,
      timeframe: marketView.timeframe || currentSessionContext.session?.tf || null,
      source: marketView.source || null,
      candle_count: Array.isArray(marketView.candles) ? marketView.candles.length : 0,
      context_signature: scenarioSet?.context_signature || brainVerdict?.learningEffects?.signature || null,
    }),
    brain_state: compactObject({
      posture: brainVerdict?.posture || null,
      bias: brainVerdict?.bias || null,
      confidence: toFiniteNumber(brainVerdict?.confidence),
      confidence_label: brainVerdict?.confidence_label || null,
      entry_quality: brainVerdict?.entry_quality || null,
      friction: toFiniteNumber(brainVerdict?.friction),
      danger_score: toFiniteNumber(brainVerdict?.danger_score),
      familiarity: toFiniteNumber(brainVerdict?.familiarity),
      learned_bias: brainVerdict?.learned_bias || null,
      learning_mode: brainVerdict?.learning_mode || null,
      no_trade_reason: brainVerdict?.no_trade_reason || null,
      active_rules: compactList((brainVerdict?.active_rules || []).map((rule) => ({
        id: rule?.id || null,
        text: rule?.text || null,
        weight: toFiniteNumber(rule?.weight),
        active: rule?.active !== false,
      })), 32),
    }),
    market_state: compactObject({
      current_price: toFiniteNumber(overlays.currentPrice),
      nearest_support: toFiniteNumber(overlays.nearestSupport),
      nearest_resistance: toFiniteNumber(overlays.nearestResistance),
      momentum: analysis.momentumCondition || null,
      volatility: analysis.volatilityCondition || null,
      push_state: analysis.pushState || null,
      continuation_context: analysis.continuationContext || null,
      latest_confirms_move: Boolean(analysis.latestConfirmsMove),
      scenarios: compactList((scenarioSet?.scenarios || []).map((scenario, idx) => compactObject({
        id: scenario?.id || null,
        type: scenario?.type || null,
        name: scenario?.name || null,
        probability: toFiniteNumber(scenario?.probability),
        confidence: toFiniteNumber(scenario?.confidence),
        rank: idx + 1,
      })), 12),
    }),
    next_trade: compactObject({
      allow_trade: brainVerdict?.allow_trade !== false,
      posture: brainVerdict?.next_candle_plan?.posture || brainVerdict?.posture || null,
      trigger_long: brainVerdict?.next_candle_plan?.trigger_long || null,
      trigger_short: brainVerdict?.next_candle_plan?.trigger_short || null,
      invalidation: brainVerdict?.next_candle_plan?.invalidation || null,
      reasoning_summary: brainVerdict?.next_candle_plan?.reasoning_summary || null,
    }),
    risk_profile: compactObject({
      risk_mode: riskProfile?.risk_mode || null,
      size_multiplier: toFiniteNumber(riskProfile?.size_multiplier),
      capital_fraction: toFiniteNumber(riskProfile?.capital_fraction),
      risk_score: toFiniteNumber(riskProfile?.risk_score),
      manual_confirmation_required: currentSessionContext.executionControlState?.manualConfirmationRequired !== false,
      execution_authority: currentSessionContext.executionControlState?.executionAuthority || "manual_only",
    }),
    learning_state: compactObject({
      learned_contexts: toFiniteNumber(learningProgress?.learnedContexts, 0),
      active_rules: toFiniteNumber(learningProgress?.activeRules, 0),
      learning_velocity: toFiniteNumber(learningProgress?.learningVelocity, 0),
      scenario_reliability: toFiniteNumber(learningProgress?.scenarioReliability),
      wait_accuracy: toFiniteNumber(learningProgress?.waitAccuracy),
      last_lessons: compactList(learningProgress?.lastLessons || [], 10),
    }),
    operator_context: compactObject({
      selected_actions: compactList(currentSessionContext.operatorState?.operatorSelection || [], 12),
      last_operator_action_id: currentSessionContext.operatorState?.lastOperatorActionId || null,
      manual_controls: compactObject({
        confidence_boost: toFiniteNumber(manualControls?.confidence_boost, 0),
        risk_multiplier_override: toFiniteNumber(manualControls?.risk_multiplier_override, 1),
        exploration_bias_override: toFiniteNumber(manualControls?.exploration_bias_override, 0.7),
        exploitation_bias_override: toFiniteNumber(manualControls?.exploitation_bias_override, 0.3),
        max_risk_cap: toFiniteNumber(manualControls?.max_risk_cap, 1),
        disable_context_blocking: Boolean(manualControls?.disable_context_blocking),
        force_learning_mode: manualControls?.force_learning_mode || null,
      }),
    }),
  };
}
