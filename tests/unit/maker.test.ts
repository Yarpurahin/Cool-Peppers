import test from 'node:test';
import assert from 'node:assert/strict';
import { employmentScenario } from '../../src/features/negotiation/data/employment.ts';
import {
  compileScenario,
  startAttempt,
  answerQuestion,
  questionText,
} from '../../src/features/negotiation/model/engine.ts';
import { createBlankDefinition } from '../../src/features/maker/model/adapter.ts';
import { compileMaker, startMaker, submitIntent } from '../../src/features/maker/model/engine.ts';
import { validateMaker } from '../../src/features/maker/model/validation.ts';
import {
  addBlock,
  addReaction,
  connectReaction,
  duplicateBlock,
  layoutGraph,
  removeBlocks,
  removeReaction,
} from '../../src/features/maker/model/commands.ts';
import { scenarios } from '../../src/data/scenarios.ts';
import { documentSchema, normalizeDocument } from '../../src/types/validation.ts';
import type { MakerDocument, MakerDraft } from '../../src/features/maker/model/types.ts';
import {
  createScenarioFile,
  parseScenarioFile,
} from '../../src/features/maker/model/scenarioFile.ts';
const now = '2026-09-21T10:00:00.000Z';
function fixture(): MakerDocument {
  const definition = createBlankDefinition('test_maker', 'Тест');
  definition.metadata.description = 'Проверка переговоров';
  definition.nodes[0].text = 'Какую зарплату вы ожидаете?';
  definition.endings = [
    {
      id: 'agreement',
      type: 'success',
      title: 'Договорились',
      description: 'Стороны пришли к соглашению.',
    },
  ];
  definition.nodes[0].reactions = [
    {
      id: 'salary_reaction',
      intent: 'salary_offer',
      label: 'Назвать сумму',
      examples: ['Около 200 тысяч'],
      evaluation: { grade: 'strong', penalty: 0, feedback: 'Конкретный ориентир.' },
      endingId: 'agreement',
    },
  ];
  return {
    definition,
    preview: { ...structuredClone(scenarios[0]), id: 'test_maker' },
    editor: { positions: {} },
  };
}

test('built-in scenario uses the same canonical maker graph as authored scenarios', () => {
  assert.deepEqual(validateMaker(employmentScenario), []);
  const engine = compileMaker(employmentScenario);
  const attempt = startMaker(engine, 'template-terms', now);
  assert.equal(attempt.status, 'in-progress');
  if (attempt.status === 'in-progress') assert.equal(attempt.currentNodeId, employmentScenario.startNodeId);
  assert.equal(scenarios[0].id, employmentScenario.metadata.id);
});

test('maker engine and negotiation runtime traverse the same canonical graph', () => {
  const original = structuredClone(employmentScenario);
  const direct = compileScenario(employmentScenario);
  const maker = compileMaker(employmentScenario);
  let endings = 0;
  function walk(a: ReturnType<typeof startAttempt>, b: typeof a) {
    assert.deepEqual(a, b);
    if (a.status === 'completed') {
      endings++;
      return;
    }
    const node = direct.nodes.get(a.currentNodeId)!;
    assert.equal(questionText(node, a), questionText(maker.runtime.nodes.get(a.currentNodeId)!, b));
    for (const reaction of node.reactions) {
      walk(
        answerQuestion(direct, a, node.id, reaction.id, now),
        submitIntent(maker, b, node.id, reaction.intent, now),
      );
    }
  }
  walk(startAttempt(direct, 'same-attempt', now), startMaker(maker, 'same-attempt', now));
  assert.equal(endings, 180);
  assert.deepEqual(employmentScenario, original);
});

test('intent controls transitions independent of label, examples and canvas position', () => {
  const doc = fixture();
  const first = compileMaker(doc.definition);
  const attempt = startMaker(first, 'test', now);
  doc.definition.nodes[0].reactions[0].label = 'Обсудить ожидания';
  doc.definition.nodes[0].reactions[0].examples = ['Мой ориентир — 190 тысяч'];
  doc.editor.positions.node_1 = { x: -200, y: 900 };
  const second = compileMaker(doc.definition);
  assert.deepEqual(
    submitIntent(first, attempt, 'node_1', 'salary_offer', now),
    submitIntent(second, attempt, 'node_1', 'salary_offer', now),
  );
  const result = submitIntent(second, attempt, 'node_1', 'salary_offer', now);
  assert.equal(result.status, 'completed');
  assert.equal(result.penalties, 0);
  assert.throws(() => submitIntent(first, result, 'node_1', 'salary_offer', now), /завершена/);
  assert.throws(() => submitIntent(first, attempt, 'stale_node', 'salary_offer', now));
  assert.throws(() => submitIntent(first, attempt, 'node_1', 'unknown', now));
});

test('draft shape permits unfinished graph; compilation rejects it with navigable issues', () => {
  const doc = fixture();
  const reaction = doc.definition.nodes[0].reactions[0];
  delete reaction.endingId;
  assert.ok(documentSchema.safeParse(doc).success);
  assert.ok(
    validateMaker(doc.definition).some(
      (i) => i.code === 'target' && i.nodeId === 'node_1' && i.reactionId === reaction.id,
    ),
  );
  assert.throws(() => compileMaker(doc.definition));
  reaction.endingId = 'missing';
  assert.ok(validateMaker(doc.definition).some((i) => i.code === 'missing-ending'));
  reaction.endingId = 'agreement';
  reaction.nextNodeId = 'node_1';
  assert.ok(validateMaker(doc.definition).some((i) => i.code === 'target'));
  delete reaction.nextNodeId;
  doc.definition.nodes[0].reactions.push({ ...reaction, id: 'different' });
  assert.ok(validateMaker(doc.definition).some((i) => i.code === 'intent-duplicate'));
});

test('cycles with exits are valid, closed loops fail, unreachable blocks are warnings', () => {
  const doc = fixture();
  doc.definition.nodes[0].reactions.push({
    id: 'again',
    intent: 'ask_again',
    label: 'Уточнить',
    examples: [],
    evaluation: { grade: 'acceptable', penalty: 0, feedback: '' },
    nextNodeId: 'node_1',
  });
  const engine = compileMaker(doc.definition);
  let attempt = startMaker(engine, 'loop', now);
  attempt = submitIntent(engine, attempt, 'node_1', 'ask_again', now);
  assert.equal(attempt.status, 'in-progress');
  assert.equal(submitIntent(engine, attempt, 'node_1', 'salary_offer', now).status, 'completed');
  doc.definition.nodes[0].reactions.shift();
  assert.ok(validateMaker(doc.definition).some((i) => i.code === 'no-ending-path'));
  const other = fixture();
  duplicateBlock(other, 'node_1', 'orphan');
  assert.ok(
    validateMaker(other.definition).some(
      (i) => i.code === 'unreachable' && i.severity === 'warning',
    ),
  );
  assert.doesNotThrow(() => compileMaker(other.definition));
});

test('block commands keep references and IDs consistent; movement changes editor only', () => {
  const doc = fixture();
  const before = structuredClone(doc.definition);
  doc.editor.positions = layoutGraph(doc.definition);
  assert.deepEqual(doc.definition, before);
  assert.ok(doc.editor.positions.agreement.x > doc.editor.positions.node_1.x);
  addBlock(doc, 'node', { x: 12, y: 35 }, 'next');
  doc.definition.nodes[1].text = 'Продолжим';
  const r = addReaction(doc.definition, 'next')!;
  connectReaction(doc.definition, 'next', r.id, { type: 'ending', id: 'agreement' });
  connectReaction(doc.definition, 'node_1', 'salary_reaction', { type: 'node', id: 'next' });
  assert.equal(doc.definition.nodes[0].reactions[0].endingId, undefined);
  duplicateBlock(doc, 'next', 'next_copy');
  assert.notEqual(doc.definition.nodes[1].reactions[0].id, doc.definition.nodes[2].reactions[0].id);
  assert.equal(
    doc.definition.nodes[1].reactions[0].intent,
    doc.definition.nodes[2].reactions[0].intent,
  );
  removeBlocks(doc, ['next']);
  assert.equal(doc.definition.nodes[0].reactions[0].nextNodeId, undefined);
  assert.equal(doc.editor.positions.next, undefined);
  assert.equal(doc.definition.nodes.length, 2);
  removeBlocks(doc, ['node_1']);
  assert.equal(doc.definition.startNodeId, '');
});

test('publication projection is valid for a subsequent edit with optional metadata left blank', () => {
  const doc = fixture();
  doc.definition.nodes[0].title = '';
  const normalized = normalizeDocument(documentSchema.parse(doc));
  assert.ok(documentSchema.safeParse(normalized).success);
  assert.deepEqual(normalized.definition, doc.definition);
  assert.deepEqual(normalized.editor, doc.editor);
  assert.equal(normalized.preview.title, doc.definition.metadata.title);
  assert.equal(normalized.preview.person.name, 'Анна');
});


test('reaction deletion removes the reaction and route but preserves the destination block', () => {
  const doc = fixture();
  const beforeEndings = doc.definition.endings.length;
  assert.equal(removeReaction(doc.definition, 'node_1', 'salary_reaction'), true);
  assert.equal(doc.definition.nodes[0].reactions.length, 0);
  assert.equal(doc.definition.endings.length, beforeEndings);
  assert.equal(removeReaction(doc.definition, 'node_1', 'missing'), false);
});

test('auto layout keeps converging branches around their shared destination', () => {
  const doc = fixture();
  addBlock(doc, 'node', { x: 0, y: 0 }, 'upper');
  addBlock(doc, 'node', { x: 0, y: 0 }, 'lower');
  addBlock(doc, 'node', { x: 0, y: 0 }, 'merge');
  const start = doc.definition.nodes[0];
  start.reactions = [
    { id: 'to_upper', intent: 'upper', label: 'Верхняя ветка', examples: [], evaluation: { grade: 'acceptable', penalty: 0, feedback: '' }, nextNodeId: 'upper' },
    { id: 'to_lower', intent: 'lower', label: 'Нижняя ветка', examples: [], evaluation: { grade: 'acceptable', penalty: 0, feedback: '' }, nextNodeId: 'lower' },
  ];
  doc.definition.nodes.find((node) => node.id === 'upper')!.reactions = [
    { id: 'upper_merge', intent: 'upper_merge', label: 'Дальше', examples: [], evaluation: { grade: 'acceptable', penalty: 0, feedback: '' }, nextNodeId: 'merge' },
  ];
  doc.definition.nodes.find((node) => node.id === 'lower')!.reactions = [
    { id: 'lower_merge', intent: 'lower_merge', label: 'Дальше', examples: [], evaluation: { grade: 'acceptable', penalty: 0, feedback: '' }, nextNodeId: 'merge' },
  ];
  doc.definition.nodes.find((node) => node.id === 'merge')!.reactions = [
    { id: 'finish', intent: 'finish', label: 'Финиш', examples: [], evaluation: { grade: 'acceptable', penalty: 0, feedback: '' }, endingId: 'agreement' },
  ];
  const positions = layoutGraph(doc.definition);
  assert.ok(positions.upper.x === positions.lower.x);
  assert.ok(positions.merge.x > positions.upper.x);
  assert.ok(positions.merge.y > Math.min(positions.upper.y, positions.lower.y));
  assert.ok(positions.merge.y < Math.max(positions.upper.y, positions.lower.y));
});

test('new maker reactions start with a neutral editable evaluation', () => {
  const doc = fixture();
  doc.definition.nodes[0].reactions = [];
  const reaction = addReaction(doc.definition, 'node_1')!;
  reaction.endingId = 'agreement';
  assert.deepEqual(reaction.evaluation, { grade: 'acceptable', penalty: 0, feedback: '' });
  const runtime = compileScenario(doc.definition);
  assert.equal(runtime.nodes.get('node_1')!.reactions[0].evaluation.feedback, '');
  assert.equal(runtime.nodes.get('node_1')!.reactions[0].evaluation.grade, 'acceptable');
});


test('portable Arena JSON imports content but preserves the current scenario identity', () => {
  const source = fixture();
  source.definition.metadata.id = 'source_scenario';
  source.definition.metadata.title = 'Импортированный сценарий';
  source.editor.positions = { node_1: { x: 321, y: 123 } };
  const file = createScenarioFile(source);

  const currentDocument = fixture();
  currentDocument.definition.metadata.id = 'current_scenario';
  currentDocument.definition.metadata.version = 7;
  currentDocument.preview.id = 'current_scenario';
  const current: MakerDraft = {
    ...currentDocument,
    revision: 4,
    publishedVersion: 6,
  };

  const imported = parseScenarioFile(file, current);
  assert.equal(imported.source, 'arena-scenario');
  assert.equal(imported.document.definition.metadata.id, 'current_scenario');
  assert.equal(imported.document.definition.metadata.version, 7);
  assert.equal(imported.document.preview.id, 'current_scenario');
  assert.equal(imported.document.definition.metadata.title, 'Импортированный сценарий');
  assert.deepEqual(imported.document.editor.positions.node_1, { x: 321, y: 123 });
});

test('scenario JSON importer also accepts a raw schemaVersion 2 definition', () => {
  const currentDocument = fixture();
  const current: MakerDraft = {
    ...currentDocument,
    revision: 1,
    publishedVersion: null,
  };
  const definition = structuredClone(sourceDefinitionForImport());
  const imported = parseScenarioFile(definition, current);
  assert.equal(imported.source, 'definition');
  assert.equal(imported.document.definition.metadata.id, current.definition.metadata.id);
  assert.equal(imported.document.definition.metadata.title, definition.metadata.title);
});


test('old Arena assessment fields are normalized at the import boundary', () => {
  const currentDocument = fixture();
  const current: MakerDraft = {
    ...currentDocument,
    revision: 1,
    publishedVersion: null,
  };
  const old = structuredClone(sourceDefinitionForImport()) as any;
  const reaction = old.nodes[0].reactions[0];
  delete reaction.evaluation;
  reaction.legacy = { penalty: 2, feedback: 'Старое пояснение' };
  delete old.settings.feedbackMode;
  old.settings.legacyFailure = { rule: 'half-all-questions', endingId: 'agreement' };

  const imported = parseScenarioFile(old, current);
  const normalized = imported.document.definition;
  assert.deepEqual(normalized.nodes[0].reactions[0].evaluation, {
    grade: 'critical',
    penalty: 2,
    feedback: 'Старое пояснение',
  });
  assert.equal(normalized.settings.feedbackMode, 'summary');
  assert.equal(normalized.settings.failureRule?.endingId, 'agreement');
  assert.equal('legacy' in normalized.nodes[0].reactions[0], false);
  assert.equal('legacyFailure' in normalized.settings, false);
});

function sourceDefinitionForImport() {
  const definition = fixture().definition;
  definition.metadata.id = 'external_id';
  definition.metadata.title = 'Definition без оболочки';
  return definition;
}

test('scenario JSON importer stays compatible with the previous full draft export', () => {
  const source = fixture();
  source.definition.metadata.id = 'old_export';
  source.preview.id = 'old_export';
  const currentDocument = fixture();
  currentDocument.definition.metadata.id = 'current_for_old_export';
  currentDocument.preview.id = 'current_for_old_export';
  const current: MakerDraft = {
    ...currentDocument,
    revision: 2,
    publishedVersion: null,
  };
  const imported = parseScenarioFile(
    { preview: source.preview, definition: source.definition, editor: source.editor },
    current,
  );
  assert.equal(imported.source, 'exported-draft');
  assert.equal(imported.document.definition.metadata.id, 'current_for_old_export');
  assert.equal(imported.document.preview.id, 'current_for_old_export');
});
