import { test } from 'node:test';
import assert from 'node:assert/strict';
import { employmentScenario } from '../../src/features/negotiation/data/employment.ts';
import {
  answerQuestion,
  compileScenario,
  getReview,
  questionText,
  startAttempt,
} from '../../src/features/negotiation/model/engine.ts';
import type {
  ScenarioAttempt,
  ScenarioDefinition,
} from '../../src/features/negotiation/model/types.ts';
import {
  attemptKey,
  createAttemptRepository,
  restoreAttempt,
} from '../../src/features/negotiation/storage/attemptRepository.ts';
import { toPlayView, toResultView } from '../../src/features/negotiation/presentation.ts';

const scenario = compileScenario(employmentScenario);
const now = '2026-09-19T12:00:00.000Z';
const fresh = () => startAttempt(scenario, 'test-attempt', now);
const answer = (attempt: ScenarioAttempt, index: number) => {
  assert.equal(attempt.status, 'in-progress');
  if (attempt.status !== 'in-progress') throw new Error('Unexpected ending');
  const node = scenario.nodes.get(attempt.currentNodeId)!;
  return answerQuestion(scenario, attempt, node.id, node.answers[index].id, now);
};
const saved = (attempt: ScenarioAttempt) => ({ schemaVersion: 1, attempt });

function linear(count: number): ScenarioDefinition {
  return {
    ...employmentScenario,
    startNodeId: 'linear-0',
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `linear-${index}`,
      stageId: 'stage-1',
      title: 'Вопрос',
      speakerId: 'employer',
      text: 'Реплика',
      answers: [
        {
          id: `answer-${index}`,
          text: 'Ответ',
          feedback: 'Разбор',
          penalty: 1,
          next:
            index === count - 1
              ? { type: 'ending', endingId: 'agreed' }
              : { type: 'node', nodeId: `linear-${index + 1}` },
        },
      ],
    })),
  };
}

test('counts all 11 questions, not 12 contextual variants or four visited steps', () => {
  assert.equal(scenario.totalQuestions, 11);
  assert.equal(scenario.failureThreshold, 6);
  assert.equal(scenario.nodes.get('q3')!.textVariants!.length, 12);
  for (const node of scenario.nodes.values()) {
    assert.equal(node.answers.filter((item) => item.penalty === 1).length, 1);
    assert.ok(node.answers.every((item) => item.penalty === 0 || item.penalty === 1));
  }
});

test('all 180 paths terminate correctly, replay exactly and preserve every reply', () => {
  let total = 0,
    success = 0,
    neutral = 0;
  function visit(attempt: ScenarioAttempt) {
    assert.deepEqual(restoreAttempt(scenario, saved(attempt)), attempt);
    if (attempt.status === 'completed') {
      total++;
      assert.equal(attempt.history.length, 4);
      assert.ok(attempt.penalties <= 4);
      const result = toResultView(scenario, attempt);
      assert.equal(result.reviews.length, 4);
      assert.equal(result.metric.value, attempt.penalties);
      if (attempt.endingId === 'agreed') success++;
      else {
        assert.equal(attempt.endingId, 'discussion');
        neutral++;
      }
      const review = getReview(scenario, attempt);
      assert.equal(
        review.reduce((sum, item) => sum + item.answer.penalty, 0),
        attempt.penalties,
      );
      assert.ok(review[2].question.includes('Спасибо, зафиксировал:'));
      return;
    }
    const node = scenario.nodes.get(attempt.currentNodeId)!;
    assert.equal(toPlayView(scenario, attempt).step, attempt.history.length + 1);
    for (let index = 0; index < node.answers.length; index++) visit(answer(attempt, index));
  }
  visit(fresh());
  assert.deepEqual({ total, success, neutral }, { total: 180, success: 60, neutral: 120 });
});

test('stage three uses the exact variant for all 12 preceding choices', () => {
  for (let branch = 0; branch < 4; branch++)
    for (let choice = 0; choice < 3; choice++) {
      const attempt = answer(answer(fresh(), branch), choice);
      assert.equal(attempt.status, 'in-progress');
      const node = scenario.nodes.get('q3')!;
      const expected = node.textVariants!.find(
        (variant) => variant.afterAnswerId === attempt.history.at(-1)!.answerId,
      )!;
      assert.equal(questionText(node, attempt), expected.text);
    }
});

test('penalties cannot change the normal question route', () => {
  for (const node of scenario.nodes.values())
    for (const option of node.answers) {
      // The graph, not accumulated penalties, selects the next question below the failure threshold.
      const attempt: ScenarioAttempt = {
        ...fresh(),
        status: 'in-progress',
        currentNodeId: node.id,
        penalties: 3,
      };
      const next = answerQuestion(scenario, attempt, node.id, option.id, now);
      if (option.next.type === 'node') {
        assert.equal(next.status, 'in-progress');
        if (next.status === 'in-progress') assert.equal(next.currentNodeId, option.next.nodeId);
      }
    }
});

test('failure triggers at the threshold, rounds odd counts up and overrides success', () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const fixture = compileScenario(linear(count));
    let attempt = startAttempt(fixture, 'failure-case', now);
    const threshold = Math.ceil(count / 2);
    for (let i = 0; i < threshold; i++) {
      assert.equal(attempt.status, 'in-progress');
      attempt = answerQuestion(fixture, attempt, `linear-${i}`, `answer-${i}`, now);
    }
    assert.equal(attempt.status, 'completed');
    if (attempt.status === 'completed') assert.equal(attempt.endingId, 'failed');
    assert.equal(attempt.penalties, threshold);
  }
});

test('rejects unknown answers, stale/double clicks and answers after completion without mutation', () => {
  const first = fresh();
  const copy = structuredClone(first);
  assert.throws(() => answerQuestion(scenario, first, 'q1', 'missing', now));
  assert.deepEqual(first, copy);
  const second = answer(first, 0);
  assert.throws(() => answerQuestion(scenario, second, 'q1', 'q1-a1', now));
  assert.throws(() => answerQuestion(scenario, first, 'q1', 'q1-a1', 'bad-date'));
  const finished = answer(answer(second, 0), 0);
  const complete = answer(finished, 0);
  assert.throws(() => answerQuestion(scenario, complete, 'q4a', 'q4a-a1', now));
});

test('invalid graphs fail before playback', () => {
  const missing: ScenarioDefinition = structuredClone(employmentScenario);
  missing.startNodeId = 'missing';
  assert.throws(() => compileScenario(missing));
  assert.throws(() =>
    compileScenario({
      ...employmentScenario,
      nodes: [...employmentScenario.nodes, employmentScenario.nodes[0]],
    }),
  );
  assert.throws(() =>
    compileScenario({
      ...employmentScenario,
      nodes: [
        ...employmentScenario.nodes,
        {
          ...employmentScenario.nodes[0],
          id: 'orphan',
          answers: [{ ...employmentScenario.nodes[0].answers[0], id: 'orphan-answer' }],
        },
      ],
    }),
  );
  const cycle = linear(1);
  const first = cycle.nodes[0];
  assert.throws(() =>
    compileScenario({
      ...cycle,
      nodes: [
        { ...first, answers: [{ ...first.answers[0], next: { type: 'node', nodeId: first.id } }] },
      ],
    }),
  );
  assert.throws(() =>
    compileScenario({
      ...employmentScenario,
      nodes: employmentScenario.nodes.map((node, i) =>
        i
          ? node
          : {
              ...node,
              answers: [{ ...node.answers[0], next: { type: 'node', nodeId: 'missing' } }],
            },
      ),
    }),
  );
  assert.throws(() =>
    compileScenario({
      ...employmentScenario,
      nodes: employmentScenario.nodes.map((node, i) => (i ? node : { ...node, answers: [] })),
    }),
  );
});

test('restore recalculates penalties and ignores forged derived state', () => {
  const attempt = answer(fresh(), 3);
  const forged = {
    ...attempt,
    penalties: 999,
    currentNodeId: 'q4a',
    status: 'completed',
    endingId: 'agreed',
  };
  assert.deepEqual(restoreAttempt(scenario, saved(forged as ScenarioAttempt)), attempt);
  assert.throws(() => restoreAttempt(scenario, saved({ ...attempt, scenarioVersion: 99 })));
  assert.throws(() => restoreAttempt(scenario, { schemaVersion: 8, attempt }));
  assert.throws(() =>
    restoreAttempt(
      scenario,
      saved({ ...attempt, history: [{ nodeId: 'q4a', answerId: 'q4a-a1', answeredAt: now }] }),
    ),
  );
  assert.throws(() =>
    restoreAttempt(scenario, { schemaVersion: 1, attempt: { ...attempt, history: [null] } }),
  );
});

test('repository handles malformed storage and unavailable/quota-limited storage', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const repository = createAttemptRepository(() => storage);
  const attempt = answer(fresh(), 0);
  repository.save(attempt);
  assert.deepEqual(repository.load(scenario).attempt, attempt);
  memory.set(attemptKey('terms'), '{bad json');
  assert.ok(repository.load(scenario).warning);
  assert.equal(repository.load(scenario).attempt, undefined);
  repository.saveFeedback('terms', {
    attemptId: 'test-attempt',
    helpful: false,
    comment: 'Полезно',
    createdAt: now,
  });
  assert.equal(repository.loadFeedback('terms', 'test-attempt')?.helpful, false);
  assert.equal(repository.loadFeedback('terms', 'different-attempt'), undefined);
  const blocked = createAttemptRepository(() => {
    throw new Error('denied');
  });
  assert.ok(blocked.load(scenario).warning);
  assert.throws(() => blocked.save(attempt));
  const full = createAttemptRepository(() => ({
    getItem: storage.getItem,
    setItem: () => {
      throw new Error('quota');
    },
  }));
  assert.throws(() => full.save(attempt));
});

test('a new attempt clears history and cannot expose a previous result', () => {
  const previous = answer(answer(answer(answer(fresh(), 0), 0), 0), 0);
  const next = startAttempt(scenario, 'next-attempt', now);
  assert.notEqual(previous.id, next.id);
  assert.equal(next.penalties, 0);
  assert.deepEqual(next.history, []);
  assert.throws(() => toResultView(scenario, next));
  assert.throws(() => toPlayView(scenario, previous));
});
