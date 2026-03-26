import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeWinLossComparison,
  deriveTradeFeatures,
  extractWinningPatterns,
  buildPositiveQualifiers,
} from '../src/reviewer/winnerPatternExtractor.js';

test('deriveTradeFeatures calcula métricas derivadas con tolerancia', () => {
  const feature = deriveTradeFeatures({
    id: 't1',
    outcome: 'win',
    setup: 'breakout',
    direction: 'long',
    candlesInTrade: 4,
    mfe: 1.8,
    mae: 0.6,
    decisionSnapshot: { confidence: 0.72, warnings: ['late'] },
    libraryContextSnapshot: { activeItems: [{ id: 'normal' }] },
  });

  assert.equal(feature.outcome, 'win');
  assert.equal(feature.durationBucket, 'medium');
  assert.equal(feature.cleanFollowthrough, true);
  assert.equal(feature.hasWarnings, true);
  assert.equal(feature.hasMatchedLibraryItems, false);
});

test('computeWinLossComparison separa wins/losses/ambiguous', () => {
  const comparison = computeWinLossComparison([
    { outcome: 'win', setup: 's1', direction: 'long', mfe: 2, mae: 0.8, decisionSnapshot: { confidence: 0.7 } },
    { outcome: 'loss', setup: 's2', direction: 'short', mfe: 0.6, mae: 1.1, decisionSnapshot: { confidence: 0.4 } },
    { outcome: 'open', setup: 's2', direction: 'short' },
  ]);

  assert.equal(comparison.totals.wins, 1);
  assert.equal(comparison.totals.losses, 1);
  assert.equal(comparison.totals.ambiguous, 1);
  assert.ok(Array.isArray(comparison.differences));
});

test('buildPositiveQualifiers retorna máximo 8 qualifiers con evidencia', () => {
  const qualifiers = buildPositiveQualifiers({
    totals: { wins: 8, losses: 8 },
    wins: {
      count: 8,
      avgMfeMaeRatio: 2.2,
      favorableDominanceRatio: 0.87,
      warningsRatio: 0.15,
      dangerContextRatio: 0.1,
      avgCandlesInTrade: 5,
      avgConfidence: 0.71,
      durationBuckets: { medium: 6, short: 1, long: 1 },
      topSetupDirection: { setup: 'breakout', direction: 'long', count: 5 },
    },
    losses: {
      count: 8,
      avgMfeMaeRatio: 0.9,
      favorableDominanceRatio: 0.32,
      warningsRatio: 0.5,
      dangerContextRatio: 0.45,
      avgCandlesInTrade: 2.5,
      avgConfidence: 0.55,
      topSetupDirection: { setup: 'reversal', direction: 'short', count: 4 },
    },
  }, { limitedConfidence: false });

  assert.ok(qualifiers.length >= 3);
  assert.ok(qualifiers.length <= 8);
  assert.ok(qualifiers.every((item) => item.id && item.title && item.evidence));
});

test('extractWinningPatterns produce output schema esperado y best effort', () => {
  const result = extractWinningPatterns({
    schema: 'patternlab_microbot_journal_export_v2',
    symbol: 'BTCUSDT',
    timeframe: '1m',
    trades: [
      {
        id: 'w1',
        outcome: 'win',
        setup: 'breakout',
        direction: 'long',
        candlesInTrade: 5,
        mfe: 1.9,
        mae: 0.5,
        decisionSnapshot: { confidence: 0.73, warnings: [], matchedLibraryItems: ['breakout'] },
        libraryContextSnapshot: { activeItems: [{ id: 'trend_ok' }] },
        learningOutput: { lesson: 'wait confirmation' },
      },
      {
        id: 'l1',
        outcome: 'loss',
        setup: 'breakout',
        direction: 'long',
        candlesInTrade: 2,
        mfe: 0.4,
        mae: 1.1,
        decisionSnapshot: { confidence: 0.46, warnings: ['avoidChase'] },
        libraryContextSnapshot: { contexts: [{ id: 'high_danger_late_move' }] },
      },
    ],
  }, { validation: { limitedConfidence: false } });

  assert.equal(result.schema, 'patternlab_positive_qualifiers_v1');
  assert.equal(result.sessionContext.totalTrades, 2);
  assert.ok(Array.isArray(result.positiveQualifiers));
  assert.ok(Array.isArray(result.dataLimitations));
  assert.ok(Array.isArray(result.recommendedNextIntegration));
});
