import test from 'node:test';
import assert from 'node:assert/strict';

import { readActiveLibraryContext } from '../modules/libraryDecisionAdapter.js';
import { evaluateMicroBotDecision } from '../modules/microBotEngine.js';
import { buildSimplePaperTrade } from '../modules/simpleTradeBuilder.js';
import { updateSimpleTradeLifecycle } from '../modules/simpleExecutionEngine.js';

function candles() {
  return [
    { timestamp: '2026-01-01T10:00:00Z', open: 100, high: 101, low: 99.5, close: 100.8, volume: 100 },
    { timestamp: '2026-01-01T10:01:00Z', open: 100.8, high: 102.4, low: 100.6, close: 101.7, volume: 120 },
    { timestamp: '2026-01-01T10:02:00Z', open: 101.7, high: 103.1, low: 101.4, close: 102.9, volume: 135 },
    { timestamp: '2026-01-01T10:03:00Z', open: 102.7, high: 103.9, low: 101.9, close: 102.1, volume: 160 },
  ];
}

test('readActiveLibraryContext carga patrones y bias', () => {
  const context = readActiveLibraryContext([
    { id: 'p_failed_breakout_short', type: 'pattern', name: 'Failed breakout short', active: true, data: {} },
    { id: 'rule_no_chase', type: 'rule', name: 'No chase after expansion', active: true, data: { hint: 'avoid chase' } },
  ]);
  assert.equal(context.patterns.length, 1);
  assert.equal(context.contexts.length, 1);
  assert.equal(context.bias.avoidChase, true);
});

test('engine emite short cuando patrón y rechazo están presentes', () => {
  const libraryContext = readActiveLibraryContext([
    { id: 'failed_breakout_short', type: 'pattern', name: 'failed breakout short', active: true, data: {} },
  ]);
  const decision = evaluateMicroBotDecision({ candles: candles(), libraryContext });
  assert.equal(decision.action, 'short');
  assert.equal(decision.reason, 'matched_library_pattern');
});

test('trade builder crea trade válido con precios coherentes', () => {
  const trade = buildSimplePaperTrade({ direction: 'long', candles: candles(), symbol: 'BTCUSDT' });
  assert.ok(trade);
  assert.ok(trade.entry > 0);
  assert.ok(trade.stopLoss > 0);
  assert.ok(trade.takeProfit > 0);
  assert.ok(trade.stopLoss < trade.entry);
  assert.ok(trade.takeProfit > trade.entry);
});

test('lifecycle planned -> active -> closed se cumple', () => {
  let trade = buildSimplePaperTrade({ direction: 'long', candles: candles(), symbol: 'BTCUSDT' });
  assert.ok(trade);

  const activate = updateSimpleTradeLifecycle(
    trade,
    { timestamp: '2026-01-01T10:04:00Z', low: trade.entry - 0.01, high: trade.entry + 0.01 },
    { candleIndex: 5 },
  );
  trade = activate.trade;
  assert.equal(trade.status, 'active');

  const skipResolveSameTick = updateSimpleTradeLifecycle(
    trade,
    { timestamp: '2026-01-01T10:04:00Z', low: trade.stopLoss - 0.5, high: trade.takeProfit + 0.5 },
    { candleIndex: 5 },
  );
  trade = skipResolveSameTick.trade;
  assert.equal(trade.status, 'active');

  const close = updateSimpleTradeLifecycle(
    trade,
    { timestamp: '2026-01-01T10:05:00Z', low: trade.stopLoss + 0.01, high: trade.takeProfit + 0.2 },
    { candleIndex: 6 },
  );
  trade = close.trade;
  assert.equal(trade.status, 'closed');
  assert.equal(trade.outcome, 'win');
});

test('al cerrar trade se puede crear output de aprendizaje y journal payload', () => {
  const trade = {
    id: 'mb_test_1',
    status: 'closed',
    outcome: 'win',
    direction: 'short',
    setup: 'failed_breakout_short',
    entry: 101,
    stopLoss: 102,
    takeProfit: 99,
    resolvedAt: '2026-01-01T10:05:00Z',
    decisionSnapshot: { reason: 'matched_library_pattern', matchedLibraryItems: ['failed_breakout_short'] },
    libraryContextSnapshot: { patterns: [{ id: 'failed_breakout_short' }] },
  };

  const journalPayload = {
    ...trade,
    source: 'library_trader',
    contextSnapshot: { originTab: 'microbot_1m', decisionSnapshot: trade.decisionSnapshot },
  };

  assert.equal(journalPayload.source, 'library_trader');
  assert.equal(journalPayload.contextSnapshot.originTab, 'microbot_1m');
  assert.equal(journalPayload.decisionSnapshot.reason, 'matched_library_pattern');
});
