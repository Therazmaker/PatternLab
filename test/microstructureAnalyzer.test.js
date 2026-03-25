import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateTo5m,
  buildMicrostructure5m,
  validateInternal5m,
} from '../modules/microstructureAnalyzer.js';

function makeBaseCandles() {
  return [
    { timestamp: '2026-01-01T10:00:00Z', open: 100, high: 101, low: 99.8, close: 100.8, volume: 100 },
    { timestamp: '2026-01-01T10:01:00Z', open: 100.8, high: 102, low: 100.7, close: 101.5, volume: 120 },
    { timestamp: '2026-01-01T10:02:00Z', open: 101.5, high: 102.5, low: 100.2, close: 100.6, volume: 300 },
    { timestamp: '2026-01-01T10:03:00Z', open: 100.6, high: 100.9, low: 99.7, close: 100.1, volume: 110 },
    { timestamp: '2026-01-01T10:04:00Z', open: 100.1, high: 100.4, low: 99.2, close: 99.4, volume: 90 },
  ];
}

test('aggregateTo5m agrega OHLCV correctamente', () => {
  const agg = aggregateTo5m(makeBaseCandles());
  assert.equal(agg.open, 100);
  assert.equal(agg.close, 99.4);
  assert.equal(agg.high, 102.5);
  assert.equal(agg.low, 99.2);
  assert.equal(agg.volume_total, 720);
  assert.equal(agg.direction, 'bearish');
  assert.ok(Math.abs(agg.body - 0.6) < 1e-9);
});

test('detecta internal_volume_anchor con mayor volumen', () => {
  const result = buildMicrostructure5m(makeBaseCandles());
  assert.equal(result.microstructure.internal_volume_anchor.minute_index, 3);
  assert.equal(result.microstructure.internal_volume_anchor.minute_volume, 300);
  assert.ok(['upper_body', 'body_center', 'lower_body', 'upper_wick', 'lower_wick'].includes(
    result.microstructure.internal_volume_anchor.location,
  ));
});

test('detecta minute_of_high y minute_of_low y sesgo vendedor', () => {
  const result = buildMicrostructure5m(makeBaseCandles());
  const ta = result.microstructure.time_aggression;
  assert.equal(ta.minute_of_high, 3);
  assert.equal(ta.minute_of_low, 5);
  assert.equal(ta.aggression_bias, 'balanced');

  const sellerCase = [
    { timestamp: 1, open: 100, high: 103, low: 99.5, close: 102.8, volume: 100 },
    { timestamp: 2, open: 102.8, high: 103, low: 101.6, close: 101.9, volume: 90 },
    { timestamp: 3, open: 101.9, high: 102, low: 100.9, close: 101.1, volume: 95 },
    { timestamp: 4, open: 101.1, high: 101.2, low: 99.8, close: 100.1, volume: 120 },
    { timestamp: 5, open: 100.1, high: 100.5, low: 98.7, close: 99, volume: 130 },
  ];

  const sellerResult = buildMicrostructure5m(sellerCase);
  assert.equal(sellerResult.microstructure.time_aggression.aggression_bias, 'seller_dominance');
});

test('detecta buyer_dominance cuando low es temprano y high tardío', () => {
  const buyerCase = [
    { timestamp: 1, open: 100, high: 100.5, low: 98.8, close: 99.1, volume: 110 },
    { timestamp: 2, open: 99.1, high: 99.7, low: 98.7, close: 99.2, volume: 100 },
    { timestamp: 3, open: 99.2, high: 100.2, low: 99.1, close: 100.1, volume: 105 },
    { timestamp: 4, open: 100.1, high: 101.5, low: 100, close: 101.4, volume: 108 },
    { timestamp: 5, open: 101.4, high: 102, low: 101.2, close: 101.8, volume: 95 },
  ];

  const result = buildMicrostructure5m(buyerCase);
  assert.equal(result.microstructure.time_aggression.aggression_bias, 'buyer_dominance');
});

test('etiqueta absorción cuando hay mucho volumen con cuerpo pequeño', () => {
  const absorptionCase = [
    { timestamp: 1, open: 100, high: 102, low: 99, close: 100.1, volume: 10000 },
    { timestamp: 2, open: 100.1, high: 102.2, low: 99.2, close: 100.2, volume: 9000 },
    { timestamp: 3, open: 100.2, high: 102.1, low: 99.1, close: 100.15, volume: 9500 },
    { timestamp: 4, open: 100.15, high: 102.3, low: 99.3, close: 100.05, volume: 9200 },
    { timestamp: 5, open: 100.05, high: 102.4, low: 99.4, close: 100.12, volume: 9100 },
  ];

  const result = buildMicrostructure5m(absorptionCase);
  assert.ok(['high_absorption', 'moderate_absorption'].includes(result.microstructure.effort_result.label));
});

test('detecta displacement eficiente con cuerpo amplio y volumen moderado', () => {
  const efficientCase = [
    { timestamp: 1, open: 100, high: 100.5, low: 99.8, close: 100.4, volume: 20 },
    { timestamp: 2, open: 100.4, high: 100.9, low: 100.2, close: 100.8, volume: 20 },
    { timestamp: 3, open: 100.8, high: 101.2, low: 100.7, close: 101.1, volume: 20 },
    { timestamp: 4, open: 101.1, high: 101.4, low: 101, close: 101.3, volume: 20 },
    { timestamp: 5, open: 101.3, high: 101.6, low: 101.2, close: 101.5, volume: 20 },
  ];

  const result = buildMicrostructure5m(efficientCase);
  assert.equal(result.microstructure.effort_result.label, 'efficient_displacement');
});

test('tolera rango cero sin divisiones inválidas', () => {
  const flat = [
    { timestamp: 1, open: 100, high: 100, low: 100, close: 100, volume: 10 },
    { timestamp: 2, open: 100, high: 100, low: 100, close: 100, volume: 20 },
    { timestamp: 3, open: 100, high: 100, low: 100, close: 100, volume: 30 },
    { timestamp: 4, open: 100, high: 100, low: 100, close: 100, volume: 40 },
    { timestamp: 5, open: 100, high: 100, low: 100, close: 100, volume: 50 },
  ];
  const result = buildMicrostructure5m(flat);
  assert.equal(result.ohlc_5m.range, 0);
  assert.equal(result.ohlc_5m.body_pct_of_range, 0);
  assert.ok(Number.isFinite(result.microstructure.effort_result.volume_per_point_range));
});

test('tolera body cero en métricas de effort-result', () => {
  const doji = [
    { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 100 },
    { timestamp: 2, open: 100, high: 101, low: 99, close: 100.1, volume: 100 },
    { timestamp: 3, open: 100.1, high: 101, low: 99, close: 99.9, volume: 100 },
    { timestamp: 4, open: 99.9, high: 101, low: 99, close: 100, volume: 100 },
    { timestamp: 5, open: 100, high: 101, low: 99, close: 100, volume: 100 },
  ];
  const result = buildMicrostructure5m(doji);
  assert.equal(result.ohlc_5m.body, 0);
  assert.ok(Number.isFinite(result.microstructure.effort_result.volume_per_point_body));
});

test('marca input inválido/incompleto en quality_flags', () => {
  const invalid = [
    { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 10 },
    { timestamp: 1, open: 100, high: 99, low: 101, close: 100, volume: -1 },
  ];

  const validation = validateInternal5m(invalid);
  assert.equal(validation.ok, false);
  assert.equal(validation.invalid_length, true);

  const result = buildMicrostructure5m(invalid);
  assert.equal(result.quality_flags.integrity_ok, false);
  assert.equal(result.quality_flags.missing_minutes, true);
  assert.ok(result.quality_flags.issues.length > 0);
});

test('detecta highs/lows repetidos y duplicate_extremes', () => {
  const repeated = [
    { timestamp: 1, open: 100, high: 101.5, low: 99, close: 101, volume: 40 },
    { timestamp: 2, open: 101, high: 101.5, low: 99.5, close: 100.7, volume: 40 },
    { timestamp: 3, open: 100.7, high: 101.2, low: 99, close: 100.2, volume: 40 },
    { timestamp: 4, open: 100.2, high: 101.5, low: 99.3, close: 100.5, volume: 40 },
    { timestamp: 5, open: 100.5, high: 101, low: 99, close: 100.4, volume: 40 },
  ];

  const result = buildMicrostructure5m(repeated);
  assert.equal(result.microstructure.time_aggression.retested_high, true);
  assert.equal(result.microstructure.time_aggression.retested_low, true);
  assert.equal(result.quality_flags.duplicate_extremes, true);
});
