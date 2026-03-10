export const state = {
  signals: [],
  filters: {
    asset: "",
    direction: "",
    patternName: "",
    status: "",
    timeframe: "",
    search: "",
  },
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
