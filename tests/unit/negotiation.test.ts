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
import type { ScenarioAttempt } from '../../src/features/negotiation/model/types.ts';
import type { MakerDefinition } from '../../src/features/maker/model/types.ts';
import { toPlayView, toResultView } from '../../src/features/negotiation/presentation.ts';

const scenario = compileScenario(employmentScenario);
const now = '2026-09-19T12:00:00.000Z';
const fresh = () => startAttempt(scenario, 'test-attempt', now);
const answer = (attempt: ScenarioAttempt, index: number) => {
  assert.equal(attempt.status, 'in-progress');
  if (attempt.status !== 'in-progress') throw new Error('Unexpected ending');
  const node = scenario.nodes.get(attempt.currentNodeId)!;
  return answerQuestion(scenario, attempt, node.id, node.reactions[index].id, now);
};

function linear(count: number): MakerDefinition {
  return {
    ...structuredClone(employmentScenario),
    startNodeId: 'linear-0',
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `linear-${index}`,
      stageId: 'stage-1',
      title: 'Вопрос',
      characterId: 'employer',
      text: 'Реплика',
      reactions: [
        {
          id: `answer-${index}`,
          intent: `answer_${index}`,
          label: 'Ответ',
          examples: [],
          evaluation: { grade: 'weak', penalty: 1, feedback: 'Разбор' },
          ...(index === count - 1
            ? { endingId: 'agreed' }
            : { nextNodeId: `linear-${index + 1}` }),
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
    assert.equal(node.reactions.filter((item) => item.evaluation.penalty === 1).length, 1);
    assert.ok(node.reactions.every((item) => item.evaluation.penalty === 0 || item.evaluation.penalty === 1));
  }
});

test('all 180 paths terminate correctly, replay exactly and preserve every reply', () => {
  let total = 0,
    success = 0,
    neutral = 0;
  function visit(attempt: ScenarioAttempt) {
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
        review.reduce((sum, item) => sum + item.reaction.evaluation.penalty, 0),
        attempt.penalties,
      );
      assert.ok(review[2].question.includes('Спасибо, зафиксировал:'));
      return;
    }
    const node = scenario.nodes.get(attempt.currentNodeId)!;
    assert.equal(toPlayView(scenario, attempt).step, attempt.history.length + 1);
    for (let index = 0; index < node.reactions.length; index++) visit(answer(attempt, index));
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
        (variant) => variant.afterReactionId === attempt.history.at(-1)!.answerId,
      )!;
      assert.equal(questionText(node, attempt), expected.text);
    }
});

test('penalties cannot change the normal question route', () => {
  for (const node of scenario.nodes.values())
    for (const reaction of node.reactions) {
      const attempt: ScenarioAttempt = {
        ...fresh(),
        status: 'in-progress',
        currentNodeId: node.id,
        penalties: 3,
      };
      const next = answerQuestion(scenario, attempt, node.id, reaction.id, now);
      if (reaction.nextNodeId) {
        assert.equal(next.status, 'in-progress');
        if (next.status === 'in-progress') assert.equal(next.currentNodeId, reaction.nextNodeId);
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

test('invalid graphs fail before playback while loops with an exit are allowed', () => {
  const missing: MakerDefinition = structuredClone(employmentScenario);
  missing.startNodeId = 'missing';
  assert.throws(() => compileScenario(missing));
  assert.throws(() =>
    compileScenario({
      ...structuredClone(employmentScenario),
      nodes: [...structuredClone(employmentScenario.nodes), structuredClone(employmentScenario.nodes[0])],
    }),
  );
  assert.throws(() =>
    compileScenario({
      ...structuredClone(employmentScenario),
      nodes: employmentScenario.nodes.map((node, index) =>
        index
          ? structuredClone(node)
          : {
              ...structuredClone(node),
              reactions: [
                {
                  ...structuredClone(node.reactions[0]),
                  nextNodeId: 'missing',
                  endingId: undefined,
                },
              ],
            },
      ),
    }),
  );
  const closedLoop = linear(1);
  closedLoop.settings.failureRule = undefined;
  closedLoop.nodes[0].reactions[0].nextNodeId = closedLoop.nodes[0].id;
  delete closedLoop.nodes[0].reactions[0].endingId;
  assert.throws(() => compileScenario(closedLoop));

  const loopWithExit = structuredClone(closedLoop);
  loopWithExit.nodes[0].reactions.push({
    id: 'finish-loop',
    intent: 'finish_loop',
    label: 'Завершить',
    examples: [],
    evaluation: { grade: 'acceptable', penalty: 0, feedback: '' },
    endingId: 'agreed',
  });
  assert.doesNotThrow(() => compileScenario(loopWithExit));
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
