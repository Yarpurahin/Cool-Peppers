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

const now = '2026-09-19T12:00:00.000Z';
const noPenaltyDefinition: MakerDefinition = structuredClone(employmentScenario) as MakerDefinition;
noPenaltyDefinition.settings.penalty.enabled = false;
const scenario = compileScenario(noPenaltyDefinition);
const liveScenario = compileScenario(employmentScenario);

const fresh = () => startAttempt(scenario, 'test-attempt', now);
const answer = (attempt: ScenarioAttempt, index: number) => {
  assert.equal(attempt.status, 'in-progress');
  if (attempt.status !== 'in-progress') throw new Error('Unexpected ending');
  const node = scenario.nodes.get(attempt.currentNodeId)!;
  return answerQuestion(scenario, attempt, node.id, node.reactions[index].id, now);
};

function linear(count: number, threshold: number): MakerDefinition {
  const definition: MakerDefinition = structuredClone(employmentScenario) as MakerDefinition;
  definition.startNodeId = 'linear-0';
  definition.settings.penalty = {
    enabled: true,
    threshold,
    failureEndingId: 'ending_penalty',
  };
  definition.nodes = Array.from({ length: count }, (_, index) => ({
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
        penalty: 1 as const,
        feedback: 'Разбор',
        ...(index === count - 1
          ? { endingId: 'ending_a_1' }
          : { nextNodeId: `linear-${index + 1}` }),
      },
    ],
  }));
  return definition;
}

test('built-in scenario uses configured penalty threshold and direct 0/1/2 reaction penalties', () => {
  assert.equal(liveScenario.totalQuestions, 11);
  assert.equal(liveScenario.failureThreshold, employmentScenario.settings.penalty.threshold);
  assert.equal(liveScenario.failureThreshold, 2);
  assert.equal(liveScenario.nodes.get('q3')!.textVariants!.length, 12);
  const penalties = [...liveScenario.nodes.values()].flatMap((node) =>
    node.reactions.map((reaction) => reaction.penalty),
  );
  assert.ok(penalties.every((penalty) => penalty === 0 || penalty === 1 || penalty === 2));
  assert.ok(penalties.includes(0));
  assert.ok(penalties.includes(1));
});

test('all 180 normal routes terminate correctly when early penalty ending is disabled', () => {
  let total = 0;
  let success = 0;
  let neutral = 0;
  function visit(attempt: ScenarioAttempt) {
    if (attempt.status === 'completed') {
      total++;
      assert.equal(attempt.history.length, 4);
      assert.ok(attempt.penalties <= 4);
      const result = toResultView(scenario, attempt);
      assert.equal(result.reviews.length, 4);
      assert.equal(result.metric.value, attempt.penalties);
      const ending = scenario.endings.get(attempt.endingId)!;
      if (ending.type === 'success') success++;
      else if (ending.type === 'neutral') neutral++;
      else assert.fail(`Unexpected failure ending: ${attempt.endingId}`);
      const review = getReview(scenario, attempt);
      assert.equal(
        review.reduce((sum, item) => sum + item.reaction.penalty, 0),
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
  assert.equal(total, 180);
  assert.equal(success + neutral, 180);
  assert.ok(success > 0);
  assert.ok(neutral > 0);
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

test('accumulated penalties do not alter the normal route when early ending is disabled', () => {
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

test('global penalty ending triggers exactly at configured threshold', () => {
  const fixture = compileScenario(linear(5, 3));
  let attempt = startAttempt(fixture, 'failure-case', now);
  for (let index = 0; index < 3; index++) {
    assert.equal(attempt.status, 'in-progress');
    attempt = answerQuestion(fixture, attempt, `linear-${index}`, `answer-${index}`, now);
  }
  assert.equal(attempt.status, 'completed');
  if (attempt.status === 'completed') assert.equal(attempt.endingId, 'ending_penalty');
  assert.equal(attempt.penalties, 3);
});

test('an explicit reaction ending has priority over the shared penalty ending', () => {
  const definition = linear(3, 2);
  definition.nodes[1].reactions.unshift({
    id: 'explicit-finish',
    intent: 'explicit_finish',
    label: 'Закончить по сюжету',
    examples: [],
    penalty: 1,
    feedback: '',
    endingId: 'ending_a_1',
  });
  const fixture = compileScenario(definition);
  let attempt = startAttempt(fixture, 'explicit-ending', now);
  attempt = answerQuestion(fixture, attempt, 'linear-0', 'answer-0', now);
  assert.equal(attempt.status, 'in-progress');
  attempt = answerQuestion(fixture, attempt, 'linear-1', 'explicit-finish', now);
  assert.equal(attempt.status, 'completed');
  if (attempt.status === 'completed') assert.equal(attempt.endingId, 'ending_a_1');
  assert.equal(attempt.penalties, 2);
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

test('invalid graphs fail before playback while zero-penalty loops with an exit are allowed', () => {
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

  const closedLoop = linear(1, 1);
  closedLoop.settings.penalty = { enabled: false, threshold: 1 };
  closedLoop.nodes[0].reactions[0].penalty = 0;
  closedLoop.nodes[0].reactions[0].nextNodeId = closedLoop.nodes[0].id;
  delete closedLoop.nodes[0].reactions[0].endingId;
  assert.throws(() => compileScenario(closedLoop));

  const loopWithExit = structuredClone(closedLoop);
  loopWithExit.nodes[0].reactions.push({
    id: 'finish-loop',
    intent: 'finish_loop',
    label: 'Завершить',
    examples: [],
    penalty: 0,
    feedback: '',
    endingId: 'ending_a_1',
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
