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

test('engine bloquea short prematuro en strong_uptrend sin ruptura confirmada', () => {
  const libraryContext = readActiveLibraryContext([
    { id: 'failed_breakout_short', type: 'pattern', name: 'failed breakout short', active: true, data: {} },
  ]);
  const decision = evaluateMicroBotDecision({ candles: candles(), libraryContext });
  assert.equal(decision.action, 'no_trade');
  assert.equal(decision.reason, 'context_veto');
  assert.equal(decision.blockedReason, 'short_blocked_strong_uptrend');
  assert.equal(decision.contextState, 'strong_uptrend');
});

test('engine permite short cuando hay breakdown y followthrough bajista', () => {
  const libraryContext = readActiveLibraryContext([
    { id: 'failed_breakout_short', type: 'pattern', name: 'failed breakout short', active: true, data: {} },
  ]);
  const decision = evaluateMicroBotDecision({
    candles: [
      { timestamp: '2026-01-01T10:00:00Z', open: 105.2, high: 105.4, low: 103.8, close: 104.1, volume: 120 },
      { timestamp: '2026-01-01T10:01:00Z', open: 104.1, high: 104.3, low: 102.6, close: 103.0, volume: 145 },
      { timestamp: '2026-01-01T10:02:00Z', open: 103.0, high: 103.2, low: 101.1, close: 101.6, volume: 165 },
      { timestamp: '2026-01-01T10:03:00Z', open: 102.2, high: 103.3, low: 100.8, close: 100.9, volume: 190 },
    ],
    libraryContext,
  });

  assert.equal(decision.action, 'short');
  assert.equal(decision.reason, 'matched_library_pattern');
  assert.ok(decision.reversalEvidenceScore >= 0.55);
  assert.equal(decision.blockedReason, null);
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

test('lifecycle cierra por early_rejection cuando MAE supera MFE en primeras 2 velas', () => {
  let trade = buildSimplePaperTrade({ direction: 'long', candles: candles(), symbol: 'BTCUSDT' });
  assert.ok(trade);

  trade = updateSimpleTradeLifecycle(
    trade,
    { timestamp: '2026-01-01T10:04:00Z', low: trade.entry - 0.01, high: trade.entry + 0.01, close: trade.entry },
    { candleIndex: 5 },
  ).trade;
  assert.equal(trade.status, 'active');

  trade = updateSimpleTradeLifecycle(
    trade,
    {
      timestamp: '2026-01-01T10:05:00Z',
      low: trade.entry - 0.45,
      high: trade.entry + 0.08,
      close: trade.entry - 0.2,
    },
    { candleIndex: 6 },
  ).trade;
  assert.equal(trade.status, 'active');

  trade = updateSimpleTradeLifecycle(
    trade,
    {
      timestamp: '2026-01-01T10:06:00Z',
      low: trade.entry - 0.45,
      high: trade.entry + 0.08,
      close: trade.entry - 0.2,
    },
    { candleIndex: 7 },
  ).trade;

  assert.equal(trade.status, 'closed');
  assert.equal(trade.closeReason, 'early_rejection');
  assert.equal(trade.earlyCloseReason, 'early_rejection');
  assert.ok(Number.isFinite(trade.earlyCloseMfe));
  assert.ok(Number.isFinite(trade.earlyCloseMae));
  assert.ok(Number.isFinite(trade.earlyCloseCandlesInTrade));
});

test('lifecycle cierra por no_followthrough entre velas 2-3 cuando MFE es bajo', () => {
  let trade = buildSimplePaperTrade({ direction: 'long', candles: candles(), symbol: 'BTCUSDT' });
  assert.ok(trade);

  trade = updateSimpleTradeLifecycle(
    trade,
    { timestamp: '2026-01-01T10:04:00Z', low: trade.entry - 0.01, high: trade.entry + 0.01, close: trade.entry },
    { candleIndex: 5 },
  ).trade;
  assert.equal(trade.status, 'active');

  trade = updateSimpleTradeLifecycle(
    trade,
    {
      timestamp: '2026-01-01T10:05:00Z',
      low: trade.entry - 0.02,
      high: trade.entry + 0.03,
      close: trade.entry + 0.01,
    },
    { candleIndex: 6 },
  ).trade;
  assert.equal(trade.status, 'active');

  trade = updateSimpleTradeLifecycle(
    trade,
    {
      timestamp: '2026-01-01T10:06:00Z',
      low: trade.entry - 0.02,
      high: trade.entry + 0.04,
      close: trade.entry + 0.01,
    },
    { candleIndex: 7 },
  ).trade;

  assert.equal(trade.status, 'closed');
  assert.equal(trade.closeReason, 'no_followthrough');
  assert.equal(trade.earlyCloseReason, 'no_followthrough');
});

test('lifecycle marca trade débil cuando ratio mfe/mae es menor a 1.2', () => {
  const trade = {
    id: 'weak_quality_trade',
    status: 'active',
    direction: 'long',
    entry: 100,
    stopLoss: 98,
    takeProfit: 105,
    justActivated: false,
    candlesInTrade: 3,
    mfe: 0,
    mae: 0,
  };

  const next = updateSimpleTradeLifecycle(
    trade,
    {
      timestamp: '2026-01-01T10:06:00Z',
      low: 99.8,
      high: 100.2,
      close: 100.05,
    },
    { candleIndex: 7, noFollowThroughPct: 0.01 },
  ).trade;

  assert.equal(next.status, 'active');
  assert.equal(next.isWeakTradeQuality, true);
  assert.ok(next.favorableDominanceRatio < 1.2);
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


test('engine aplica context_veto cuando high danger y late extension coinciden con patrón', () => {
  const libraryContext = readActiveLibraryContext([
    { id: 'failed_breakout_short', type: 'pattern', name: 'failed breakout short', active: true, data: {} },
    { id: 'ctx_high_danger', type: 'context', name: 'high danger context', active: true, data: {} },
  ]);

  const decision = evaluateMicroBotDecision({
    candles: [
      { timestamp: '2026-01-01T10:00:00Z', open: 100, high: 100.4, low: 99.8, close: 100.2, volume: 100 },
      { timestamp: '2026-01-01T10:01:00Z', open: 100.2, high: 100.6, low: 100.0, close: 100.4, volume: 130 },
      { timestamp: '2026-01-01T10:02:00Z', open: 100.4, high: 100.8, low: 100.2, close: 100.55, volume: 250 },
      { timestamp: '2026-01-01T10:03:00Z', open: 101.5, high: 102.5, low: 100.1, close: 100.2, volume: 260 },
    ],
    libraryContext,
  });

  assert.equal(decision.action, 'no_trade');
  assert.equal(decision.reason, 'context_veto');
  assert.ok(decision.blockingReason.includes('high_danger_late_extension'));
  assert.ok(decision.warnings.includes('high_danger_context'));
  assert.ok(decision.warnings.includes('late_entry_risk'));
});

test('engine devuelve no_match limpio cuando no hay patrón claro', () => {
  const decision = evaluateMicroBotDecision({
    candles: [
      { timestamp: '2026-01-01T10:00:00Z', open: 100, high: 100.4, low: 99.8, close: 100.1, volume: 100 },
      { timestamp: '2026-01-01T10:01:00Z', open: 100.1, high: 100.5, low: 99.9, close: 100.2, volume: 110 },
      { timestamp: '2026-01-01T10:02:00Z', open: 100.2, high: 100.6, low: 100.0, close: 100.3, volume: 120 },
    ],
    libraryContext: readActiveLibraryContext([]),
  });

  assert.equal(decision.action, 'no_trade');
  assert.equal(decision.reason, 'no_match');
  assert.deepEqual(decision.matchedLibraryItems, []);
  assert.deepEqual(decision.blockingReason, []);
  assert.deepEqual(decision.warnings, []);
});
