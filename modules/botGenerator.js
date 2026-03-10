import { calcWinrate } from "./utils.js";

function parseVersionId(version) {
  const match = String(version || "v1").match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function inferDirection(rows = []) {
  const counts = rows.reduce((acc, row) => {
    const key = row.direction || "CALL";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return (counts.CALL || 0) >= (counts.PUT || 0) ? "CALL" : "PUT";
}

function inferRegime(rows = []) {
  const counts = rows.reduce((acc, row) => {
    const key = row.marketRegime || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "range-like";
}

function inferSession(rows = []) {
  const byHour = rows.reduce((acc, row) => {
    if (!Number.isInteger(row.hourBucket)) return acc;
    if (row.hourBucket >= 6 && row.hourBucket < 12) acc.London += 1;
    else if (row.hourBucket >= 12 && row.hourBucket < 18) acc["New York"] += 1;
    else acc.Asia += 1;
    return acc;
  }, { London: 0, "New York": 0, Asia: 0 });
  return Object.entries(byHour).sort((a, b) => b[1] - a[1])[0]?.[0] || "London";
}

function inferExpiry(rows = []) {
  const values = rows.map((row) => Number(row.expiryMinutes || 0)).filter((value) => value > 0);
  if (!values.length) return 5;
  const sorted = values.sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 5;
}

function inferConditions(patternName = "") {
  const lower = patternName.toLowerCase();
  if (lower.includes("rsi")) {
    return [
      { type: "indicator", field: "RSI", rule: "<", value: 25 },
      { type: "event", rule: "crossUp" },
      { type: "indicator", field: "EMA50", rule: "priceAbove" },
    ];
  }
  if (lower.includes("bollinger")) {
    return [
      { type: "indicator", field: "BOLLINGER_LOWER", rule: "touch" },
      { type: "event", rule: "rejectionCandle" },
      { type: "indicator", field: "RSI", rule: ">", value: 30 },
    ];
  }
  if (lower.includes("ema")) {
    return [
      { type: "indicator", field: "EMA20", rule: "priceAbove" },
      { type: "indicator", field: "EMA50", rule: "priceAbove" },
      { type: "event", rule: "pullbackResume" },
    ];
  }
  return [
    { type: "indicator", field: "RSI", rule: "<", value: 30 },
    { type: "event", rule: "crossUp" },
  ];
}

export const BOT_DEMO_PATTERNS = [
  { name: "RSI reclaim", version: "v1" },
  { name: "Bollinger rejection", version: "v1" },
  { name: "EMA continuation", version: "v1" },
];

export function buildPatternDefinition(signals = [], input = {}) {
  const patternName = input.patternName || "Unnamed Pattern";
  const patternVersion = input.patternVersion || "v1";
  const rows = signals.filter((row) => row.patternName === patternName && (row.patternVersion || "v1") === patternVersion);
  const reviewed = rows.filter((row) => ["win", "loss"].includes(row.outcome?.status));
  const wins = reviewed.filter((row) => row.outcome?.status === "win").length;
  const losses = reviewed.filter((row) => row.outcome?.status === "loss").length;
  const contextAvg = reviewed.length
    ? reviewed.reduce((acc, row) => acc + Number(row.contextScore || 0), 0) / reviewed.length
    : 55;

  return {
    name: patternName,
    version: patternVersion,
    description: input.description || `${patternName} compiled from PatternLab evidence (${rows.length} signals, ${calcWinrate(wins, losses)}% winrate reviewed).`,
    direction: input.direction || inferDirection(rows),
    conditions: input.conditions || inferConditions(patternName),
    filters: input.filters || [
      { type: "session", value: inferSession(rows) },
      { type: "contextScore", min: Math.max(40, Math.round(contextAvg || 55)) },
      { type: "regime", value: inferRegime(rows) },
    ],
    execution: {
      expiryMinutes: Number(input.execution?.expiryMinutes || inferExpiry(rows) || 5),
    },
    notes: input.notes || "",
  };
}

export function generateJSONSchema(definition = {}, sampleSignal = {}) {
  return {
    asset: sampleSignal.asset || "EURUSD",
    timeframe: sampleSignal.timeframe || "5m",
    patternName: definition.name || "Unnamed Pattern",
    patternVersion: definition.version || "v1",
    direction: definition.direction || "CALL",
    timestamp: "{{timenow}}",
    context: {
      rsi: "{{rsi}}",
      emaBias: "{{emaBias}}",
      session: "{{session}}",
      regime: "{{regime}}",
      contextScore: "{{contextScore}}",
    },
  };
}

function conditionToText(condition = {}) {
  if (condition.type === "indicator") return `${condition.field} ${condition.rule} ${condition.value ?? ""}`.trim();
  if (condition.type === "event") return `event: ${condition.rule}`;
  return JSON.stringify(condition);
}

export function buildPinePrompt(definition = {}, schema = {}) {
  const conditionsText = (definition.conditions || []).map((condition, index) => `${index + 1}. ${conditionToText(condition)}`).join("\n");
  const filtersText = (definition.filters || []).map((filter, index) => `${index + 1}. ${filter.type}: ${JSON.stringify(filter)}`).join("\n");

  return `You are writing Pine Script v5.

Write a Pine Script v5 indicator that detects the following pattern:
- Name: ${definition.name || "Unnamed Pattern"}
- Version: ${definition.version || "v1"}
- Direction: ${definition.direction || "CALL"}
- Description: ${definition.description || ""}

Pattern conditions:
${conditionsText || "1. Define at least one condition"}

Filters:
${filtersText || "1. No extra filters"}

Execution:
- expiryMinutes: ${definition.execution?.expiryMinutes || 5}

When detected:
- trigger alertcondition()
- output a JSON alert payload exactly in this structure:
${JSON.stringify(schema, null, 2)}

Constraints:
- no repaint
- use fixed timeframe logic
- clean readable code with comments
- do not place any trade orders, only detection + alerts`;
}

export function clonePatternVersion(versionRow = {}, overrides = {}) {
  const versionId = parseVersionId(versionRow.version || "v1") + 1;
  return {
    ...versionRow,
    version: overrides.version || `v${versionId}`,
    createdAt: new Date().toISOString(),
    notes: overrides.notes || `Clone from ${versionRow.version || "v1"}`,
    generatedPromptHistory: Array.isArray(versionRow.generatedPromptHistory) ? [...versionRow.generatedPromptHistory] : [],
    definition: {
      ...versionRow.definition,
      version: overrides.version || `v${versionId}`,
    },
  };
}

export function comparePatternVersions(left = {}, right = {}) {
  const leftDef = left.definition || {};
  const rightDef = right.definition || {};

  return {
    from: left.version || "v1",
    to: right.version || "v1",
    changedDirection: leftDef.direction !== rightDef.direction,
    changedConditions: JSON.stringify(leftDef.conditions || []) !== JSON.stringify(rightDef.conditions || []),
    changedFilters: JSON.stringify(leftDef.filters || []) !== JSON.stringify(rightDef.filters || []),
    changedExecution: JSON.stringify(leftDef.execution || {}) !== JSON.stringify(rightDef.execution || {}),
    notesDelta: `${left.notes || ""} -> ${right.notes || ""}`,
  };
}
