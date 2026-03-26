import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTradeDiagnostics, buildDiagnosticPerformanceSummary } from '../modules/microBotDiagnosis.js';

test('diagnostica trade y genera reason codes de pérdida', () => {
  const candles = [
    { open: 100, high: 101.2, low: 99.8, close: 101, volume: 120 },
    { open: 101, high: 101.1, low: 100.1, close: 100.3, volume: 80 },
    { open: 100.3, high: 100.5, low: 99.6, close: 99.8, volume: 70 },
  ];
  const trade = {
    direction: 'long',
    timeframe: '1m',
    setup: 'bullish_consecutive_candles',
    decisionSnapshot: { confidence: 0.62 },
    entry: 101,
    stopLoss: 100,
    takeProfit: 103,
    exitPrice: 100,
    outcome: 'loss',
    closeReason: 'no_followthrough',
    candlesInTrade: 1,
    mfe: 0.1,
    mae: 1.1,
    createdCandleIndex: 1,
  };

  const diagnosis = buildTradeDiagnostics(trade, candles, candles[2]);
  assert.equal(diagnosis.patternName, 'bullish_consecutive_candles');
  assert.equal(diagnosis.actualOutcome, 'loss');
  assert.ok(diagnosis.failureReasonCodes.includes('late_entry'));
  assert.ok(diagnosis.failureReasonCodes.includes('no_followthrough'));
});

test('resume razones por patrón y timeframe', () => {
  const summary = buildDiagnosticPerformanceSummary([
    { outcome: 'loss', timeframe: '1m', setup: 'p1', diagnostics: { patternName: 'p1', actualOutcome: 'loss', timeframe: '1m', failureReasonCodes: ['late_entry', 'no_followthrough'], successReasonCodes: [] } },
    { outcome: 'win', timeframe: '1m', setup: 'p1', diagnostics: { patternName: 'p1', actualOutcome: 'win', timeframe: '1m', failureReasonCodes: [], successReasonCodes: ['confirmation_followthrough'] } },
  ]);

  assert.equal(summary.byPattern.p1.trades, 2);
  assert.equal(summary.byPattern.p1.losses, 1);
  assert.equal(summary.byTimeframe['1m'].wins, 1);
  assert.equal(summary.topLossReasons[0].code, 'late_entry');
  assert.equal(summary.patternsMostAffectedByLateEntry[0].code, 'p1');
});
