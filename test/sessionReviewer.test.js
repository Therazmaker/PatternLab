import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadJournalExport,
  reviewSessionExport,
  validateJournalExportSchema,
  buildRecommendedFixes,
} from '../src/reviewer/sessionReviewer.js';

test('valida schema en modo best effort', () => {
  const payload = { schema: 'other_schema', trades: [{ id: 't1', outcome: 'loss' }] };
  const validation = validateJournalExportSchema(payload);
  assert.equal(validation.tradesCount, 1);
  assert.equal(validation.sourceSchema, 'other_schema');
  assert.equal(validation.limitedConfidence, true);
});

test('loadJournalExport parsea string JSON', async () => {
  const loaded = await loadJournalExport('{"schema":"patternlab_microbot_journal_export_v1","trades":[]}');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.schema, 'patternlab_microbot_journal_export_v1');
});

test('reviewSessionExport produce estructura completa', () => {
  const payload = {
    schema: 'patternlab_microbot_journal_export_v1',
    sessionSummary: { totalTrades: 2, wins: 1, losses: 1, winRate: 50, expectancy: -0.1 },
    trades: [
      {
        id: 'w',
        outcome: 'win',
        status: 'closed',
        setup: 'pattern_a',
        direction: 'long',
        riskReward: 1.8,
        decisionSnapshot: { confidence: 0.64, warnings: [], matchedLibraryItems: ['pattern_a'] },
        libraryContextSnapshot: { contexts: [{ id: 'high_danger_late_move' }] },
        learningOutput: {},
        markers: [],
        lifecycleHistory: [],
      },
      {
        id: 'l',
        outcome: 'loss',
        status: 'closed',
        setup: 'pattern_a',
        direction: 'long',
        riskReward: 1.1,
        decisionSnapshot: { confidence: 0.65, warnings: [] },
        libraryContextSnapshot: { contexts: [{ id: 'avoidChase' }] },
        learningOutput: {},
        markers: [],
        lifecycleHistory: [],
      },
    ],
  };

  const review = reviewSessionExport(payload);
  assert.equal(review.schema, 'patternlab_session_review_v1');
  assert.equal(review.sessionOverview.totalTrades, 2);
  assert.ok(Array.isArray(review.criticalFindings));
  assert.ok(Array.isArray(review.recommendedFixes));
  assert.ok(typeof review.scores.contextDiscipline === 'number');
  assert.equal(review.winningDNA.schema, 'patternlab_positive_qualifiers_v1');
  assert.ok(Array.isArray(review.winningDNA.positiveQualifiers));
});

test('buildRecommendedFixes prioriza contexto y aprendizaje', () => {
  const fixes = buildRecommendedFixes({
    contextAnalysis: { highDangerTrades: 3, highRiskNoWarningTrades: 2, avoidChaseTrades: 4 },
    setupAnalysis: { monocultureDetected: true },
    learningAnalysis: { emptyLearningOutputPct: 80 },
  });
  assert.ok(fixes.some((item) => item.priority === 'critical'));
  assert.ok(fixes.some((item) => item.title.includes('learningOutput')));
});
