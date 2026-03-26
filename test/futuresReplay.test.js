import test from 'node:test';
import assert from 'node:assert/strict';

import { replayFuturesDecision } from '../modules/futuresReplay.js';

function buildDecision(action, entryPrice, stopLoss, takeProfit) {
  return {
    action,
    patternName: 'test_pattern',
    executionPlan: { entryPrice, stopLoss, takeProfit },
  };
}

test('LONG: gana cuando high toca TP antes de SL', () => {
  const decision = buildDecision('LONG', 100, 99, 102);
  const candles = [
    { open: 100, high: 100.4, low: 99.8, close: 100.1 },
    { open: 100.1, high: 102.2, low: 99.9, close: 101.9 },
  ];

  const replay = replayFuturesDecision(decision, candles, 0, { maxBarsHold: 5 });
  assert.equal(replay.outcomeType, 'tp');
  assert.ok(replay.pnlR > 0);
});

test('SHORT: gana cuando low toca TP antes de SL', () => {
  const decision = buildDecision('SHORT', 100, 101, 98);
  const candles = [
    { open: 100, high: 100.2, low: 99.8, close: 99.9 },
    { open: 99.9, high: 100.1, low: 97.9, close: 98.1 },
  ];

  const replay = replayFuturesDecision(decision, candles, 0, { maxBarsHold: 5 });
  assert.equal(replay.outcomeType, 'tp');
  assert.ok(replay.pnlR > 0);
});

test('cuando TP y SL tocan en la misma vela no se fuerza loss por defecto', () => {
  const decision = buildDecision('LONG', 100, 99, 101);
  const candles = [
    { open: 100, high: 100.3, low: 99.8, close: 100.1 },
    { open: 100.8, high: 101.3, low: 98.8, close: 100.2 },
  ];

  const replay = replayFuturesDecision(decision, candles, 0, { maxBarsHold: 5, intrabarPolicy: 'time-proxy' });
  assert.equal(replay.outcomeType, 'tp');
  assert.ok(replay.pnlR > 0);
});

test('valida niveles invertidos y devuelve invalid-plan (no loss implícito)', () => {
  const badLong = buildDecision('LONG', 100, 101, 99);
  const replay = replayFuturesDecision(badLong, [{ open: 100, high: 101, low: 99, close: 100 }], 0, { maxBarsHold: 5 });
  assert.equal(replay.outcomeType, 'invalid-plan');
  assert.equal(replay.pnlR, 0);
});
