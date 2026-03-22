export const state = {
  signals: [],
  filters: {
    asset: "",
    direction: "",
    patternName: "",
    source: "",
    strategyId: "",
    status: "",
    timeframe: "",
    search: "",
    nearSupport: "",
    nearResistance: "",
    hasOHLC: "",
    hasExcursion: "",
    hasSession: "",
    mfeMin: "",
    maeMax: "",
  },
  sessions: [],
  activeSessionId: null,
  importPreview: null,
  activeSignalId: null,
};

export function setSignals(signals) {
  state.signals = signals;
}

export function setFilter(key, value) {
  state.filters[key] = value;
}

export function setImportPreview(preview) {
  state.importPreview = preview;
}


export function setSessions(sessions) {
  state.sessions = sessions;
}

export function setActiveSessionId(sessionId) {
  state.activeSessionId = sessionId || null;
}
