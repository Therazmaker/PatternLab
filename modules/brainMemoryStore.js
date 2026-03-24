function nowIso() {
  return new Date().toISOString();
}

function cloneBase(base = {}) {
  return {
    contexts: base?.contexts && typeof base.contexts === "object" ? { ...base.contexts } : {},
    rules: base?.rules && typeof base.rules === "object" ? { ...base.rules } : {},
    overrides: base?.overrides && typeof base.overrides === "object" ? { ...base.overrides } : {},
    decisions: Array.isArray(base?.decisions) ? [...base.decisions] : [],
    scenarios: Array.isArray(base?.scenarios) ? [...base.scenarios] : [],
    trades: Array.isArray(base?.trades) ? [...base.trades] : [],
    statsCache: base?.statsCache && typeof base.statsCache === "object" ? { ...base.statsCache } : {},
    events: Array.isArray(base?.events) ? [...base.events] : [],
  };
}

export function createBrainEvent(type, payload = {}, linkage = {}) {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: nowIso(),
    type,
    sessionId: linkage.sessionId || null,
    symbol: linkage.symbol || null,
    timeframe: linkage.timeframe || null,
    context_signature: linkage.context_signature || null,
    payload,
  };
}

export function createBrainMemoryStore(seed = {}) {
  const memory = cloneBase(seed);

  function upsertContext(signature, context = {}, linkage = {}) {
    if (!signature) return null;
    memory.contexts[signature] = {
      ...(memory.contexts[signature] || {}),
      ...context,
      context_signature: signature,
      sessionId: linkage.sessionId || memory.contexts?.[signature]?.sessionId || null,
      symbol: linkage.symbol || memory.contexts?.[signature]?.symbol || null,
      timeframe: linkage.timeframe || memory.contexts?.[signature]?.timeframe || null,
      updatedAt: nowIso(),
    };
    return memory.contexts[signature];
  }

  function upsertRule(id, rule = {}, linkage = {}) {
    if (!id) return null;
    memory.rules[id] = {
      ...(memory.rules[id] || {}),
      ...rule,
      id,
      updatedAt: nowIso(),
      context_signature: linkage.context_signature || memory.rules?.[id]?.context_signature || null,
    };
    return memory.rules[id];
  }

  function appendDecision(decision = {}, linkage = {}) {
    const row = {
      id: decision.id || `decision_${Date.now()}_${memory.decisions.length + 1}`,
      ts: decision.ts || nowIso(),
      ...decision,
      sessionId: linkage.sessionId || decision.sessionId || null,
      symbol: linkage.symbol || decision.symbol || null,
      timeframe: linkage.timeframe || decision.timeframe || null,
      context_signature: linkage.context_signature || decision.context_signature || null,
      tradeId: linkage.tradeId || decision.tradeId || null,
      scenarioId: linkage.scenarioId || decision.scenarioId || null,
    };
    memory.decisions.push(row);
    return row;
  }

  function appendScenario(scenario = {}, linkage = {}) {
    const row = {
      id: scenario.id || `scenario_${Date.now()}_${memory.scenarios.length + 1}`,
      ts: scenario.ts || nowIso(),
      ...scenario,
      sessionId: linkage.sessionId || scenario.sessionId || null,
      symbol: linkage.symbol || scenario.symbol || null,
      timeframe: linkage.timeframe || scenario.timeframe || null,
      context_signature: linkage.context_signature || scenario.context_signature || null,
      tradeId: linkage.tradeId || scenario.tradeId || null,
    };
    memory.scenarios.push(row);
    return row;
  }

  function appendTrade(trade = {}, linkage = {}) {
    const row = {
      id: trade.id || trade.tradeId || `trade_${Date.now()}_${memory.trades.length + 1}`,
      ts: trade.ts || nowIso(),
      ...trade,
      sessionId: linkage.sessionId || trade.sessionId || null,
      symbol: linkage.symbol || trade.symbol || null,
      timeframe: linkage.timeframe || trade.timeframe || null,
      context_signature: linkage.context_signature || trade.context_signature || null,
      scenarioId: linkage.scenarioId || trade.scenarioId || null,
    };
    memory.trades.push(row);
    return row;
  }

  function upsertOverride(id, override = {}, linkage = {}) {
    const key = id || override.id || `override_${Date.now()}`;
    memory.overrides[key] = {
      ...(memory.overrides[key] || {}),
      ...override,
      id: key,
      updatedAt: nowIso(),
      sessionId: linkage.sessionId || override.sessionId || null,
      symbol: linkage.symbol || override.symbol || null,
      timeframe: linkage.timeframe || override.timeframe || null,
      context_signature: linkage.context_signature || override.context_signature || null,
      tradeId: linkage.tradeId || override.tradeId || null,
      scenarioId: linkage.scenarioId || override.scenarioId || null,
    };
    return memory.overrides[key];
  }

  function cacheStats(key, value) {
    if (!key) return null;
    memory.statsCache[key] = {
      updatedAt: nowIso(),
      value,
    };
    return memory.statsCache[key];
  }

  function addEvent(event) {
    if (!event?.type) return null;
    memory.events.push(event);
    if (memory.events.length > 1500) memory.events.shift();
    return event;
  }

  function getSnapshot() {
    return cloneBase(memory);
  }

  function hydrateFromLegacy({ learningModel = null, scenarioRows = [], decisionRows = [], tradeRows = [], overrideRows = [] } = {}) {
    const contexts = learningModel?.learnedContexts || {};
    Object.entries(contexts).forEach(([signature, row]) => {
      upsertContext(signature, row, { context_signature: signature });
    });
    (learningModel?.learnedRules || []).forEach((rule) => upsertRule(rule?.id, rule, { context_signature: rule?.context_signature || null }));
    (learningModel?.humanOverrideMemory || []).forEach((row) => upsertOverride(row?.id, row, { context_signature: row?.contextSignature || row?.context_signature || null }));
    scenarioRows.forEach((row) => appendScenario(row));
    decisionRows.forEach((row) => appendDecision(row));
    tradeRows.forEach((row) => appendTrade(row));
    overrideRows.forEach((row) => upsertOverride(row?.id, row));
  }

  return {
    upsertContext,
    upsertRule,
    appendDecision,
    appendScenario,
    appendTrade,
    upsertOverride,
    cacheStats,
    addEvent,
    getSnapshot,
    hydrateFromLegacy,
  };
}
