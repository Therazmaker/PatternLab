import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMicroBotJournalExport,
  computeJournalSessionSummary,
  getMicroBotJournalTrades,
  buildMicroBotExportFilename,
} from '../modules/microBotJournalExport.js';

test('exporta journal vacío sin fallar', () => {
  const rows = getMicroBotJournalTrades([], { originTab: 'microbot_1m' });
  const payload = buildMicroBotJournalExport(rows, { symbol: 'BTCUSDT', timeframe: '1m' });
  assert.equal(payload.trades.length, 0);
  assert.equal(payload.sessionSummary.totalTrades, 0);
  assert.equal(payload.schema, 'patternlab_microbot_journal_export_v1');
});

test('summary correcto con win y loss', () => {
  const summary = computeJournalSessionSummary([
    { status: 'closed', outcome: 'win', riskReward: 2, mfe: 1.2, mae: 0.2, invalidReasons: [], tradeMeta: { instant_resolution: true } },
    { status: 'closed', outcome: 'loss', riskReward: 1.5, mfe: 0.3, mae: 0.9, invalidReasons: ['invalid_ordering'], tradeMeta: {} },
  ]);
  assert.equal(summary.totalTrades, 2);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.invalidTrades, 1);
  assert.equal(summary.instantResolutions, 1);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.avgRR, 1.75);
  assert.equal(summary.netPnl, 1);
});

test('filtra originTab microbot y tolera campos faltantes', () => {
  const rows = getMicroBotJournalTrades([
    {
      id: 'a',
      source: 'brain_auto',
      status: 'closed',
      outcome: 'win',
      contextSnapshot: { originTab: 'microbot_1m' },
    },
    {
      id: 'b',
      source: 'brain_auto',
      status: 'closed',
      outcome: 'loss',
      contextSnapshot: { originTab: 'other_tab' },
    },
  ], { originTab: 'microbot_1m' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'a');
  assert.equal(rows[0].entry, null);
  assert.deepEqual(rows[0].invalidReasons, []);
  assert.deepEqual(rows[0].libraryContextSnapshot, {});
});

test('nombre de archivo usa symbol/timeframe y fecha', () => {
  const filename = buildMicroBotExportFilename({
    symbol: 'BTCUSDT',
    timeframe: '1m',
    now: new Date('2026-03-26T10:11:12Z'),
  });
  assert.equal(filename, 'patternlab_microbot_BTCUSDT_1m_2026-03-26_10-11-12.json');
});

test('export payload serializa JSON válido', () => {
  const payload = buildMicroBotJournalExport([
    {
      id: 't1',
      originTab: 'microbot_1m',
      source: 'brain_auto',
      mode: 'paper',
      symbol: 'BTCUSDT',
      timeframe: '1m',
      status: 'closed',
      outcome: 'win',
      direction: 'long',
      entry: 100,
      stopLoss: 99,
      takeProfit: 102,
      riskReward: 2,
      createdAt: '2026-03-26T10:00:00Z',
      triggeredAt: '2026-03-26T10:01:00Z',
      resolvedAt: '2026-03-26T10:02:00Z',
    },
  ]);

  const json = JSON.stringify(payload, null, 2);
  const reparsed = JSON.parse(json);
  assert.equal(reparsed.trades[0].id, 't1');
  assert.equal(reparsed.sessionSummary.totalTrades, 1);
});
