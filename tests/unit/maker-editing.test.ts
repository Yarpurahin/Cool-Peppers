import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from '../../src/data/scenarios.ts';
import { createBlankDefinition } from '../../src/features/maker/model/adapter.ts';
import type { MakerDraft } from '../../src/features/maker/model/types.ts';
import {
  fingerprint,
  recoverDraft,
  serializeRecovery,
} from '../../src/features/maker/model/draftRecovery.ts';
import { DraftHistory } from '../../src/features/maker/model/history.ts';
import { statusLabel, statusOf } from '../../src/features/maker/model/publication.ts';
import { previewSchema } from '../../src/types/validation.ts';

function draft(): MakerDraft {
  return {
    preview: { ...structuredClone(scenarios[0]), id: 'recovery' },
    definition: createBlankDefinition('recovery', 'Несохранённый сценарий'),
    editor: { positions: { node_1: { x: 150, y: 50 } } },
    revision: 1,
    publishedVersion: null,
    hasUnpublishedChanges: true,
  };
}

test('reload recovers unfinished text, graph, settings, cover and viewport without saving to server', () => {
  const server = draft();
  const local = structuredClone(server);
  local.definition.nodes[0].text = 'Несохранённая реплика';
  local.definition.settings.allowRestart = false;
  local.definition.characters[0].name = 'Мария';
  local.definition.nodes[0].reactions.push({
    id: 'reply',
    intent: '',
    label: '',
    examples: [],
    penalty: 0, feedback: '',
  });
  local.preview.coverImage = { src: 'data:image/png;base64,aGVsbG8=', alt: 'Описание' };
  local.editor.viewport = { x: -120, y: 98, zoom: 0.8 };
  const restored = recoverDraft(serializeRecovery(local, fingerprint(server)), server);
  assert.equal(fingerprint(restored.draft), fingerprint(local));
  assert.equal(restored.restored, true);
  assert.equal(restored.conflict, false);
  assert.equal(server.definition.nodes[0].text, '');
});

test('recovery detects revision conflicts and does not replace current server revision silently', () => {
  const server = draft();
  const local = structuredClone(server);
  local.definition.nodes[0].text = 'Локальная работа';
  const record = serializeRecovery(local, fingerprint(server));
  server.revision = 3;
  server.definition.nodes[0].text = 'Из другой вкладки';
  const result = recoverDraft(record, server);
  assert.equal(result.conflict, true);
  assert.equal(result.draft.revision, 1);
  assert.equal(result.draft.definition.nodes[0].text, 'Локальная работа');
  assert.equal(server.definition.nodes[0].text, 'Из другой вкладки');
});

test('saved, reordered and reverted snapshots do not resurrect stale changes; corrupt/wrong IDs are rejected', () => {
  const server = draft();
  const record = serializeRecovery(server, fingerprint(server));
  assert.equal(recoverDraft(record, server).restored, false);
  const updated = structuredClone(server);
  updated.definition.nodes[0].text = 'Сохранено';
  assert.equal(
    recoverDraft(serializeRecovery(updated, fingerprint(server)), { ...updated, revision: 2 })
      .restored,
    false,
  );
  assert.throws(() => recoverDraft('{bad-json', server));
  const other = structuredClone(server);
  other.preview.id = 'other';
  assert.throws(() => recoverDraft(serializeRecovery(other, ''), server));
});

test('undo removes one complete field edit or command; redo is discarded after new work', () => {
  const history = new DraftHistory<string>();
  const field = {};
  history.record('', field);
  history.record('П', field);
  history.record('Пр', field);
  history.breakGroup();
  history.record('Привет'); // Add a block.
  assert.equal(history.travel('undo', 'Привет + блок'), 'Привет');
  assert.equal(history.travel('undo', 'Привет'), '');
  assert.equal(history.travel('redo', ''), 'Привет');
  history.record('Привет', field);
  assert.equal(history.travel('redo', 'Другой текст'), undefined);
  assert.equal(history.travel('undo', 'Другой текст'), 'Привет');
});

test('status distinguishes unpublished draft v2 from public v1, including archive', () => {
  const row = { publishedVersion: 1, hasUnpublishedChanges: true };
  assert.equal(statusOf(row), 'draft');
  assert.equal(statusLabel(row), 'Черновик v2 · опубликовано v1');
  assert.equal(statusOf({ ...row, hasUnpublishedChanges: false }), 'published');
  assert.equal(statusOf({ ...row, archivedAt: '2026-09-22' }), 'archived');
});

test('cover schema refuses executable URLs, SVG and oversized images', () => {
  const preview = structuredClone(scenarios[0]);
  for (const src of [
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,' + 'A'.repeat(710000),
  ])
    assert.equal(
      previewSchema.safeParse({ ...preview, coverImage: { src, alt: '' } }).success,
      false,
    );
});
