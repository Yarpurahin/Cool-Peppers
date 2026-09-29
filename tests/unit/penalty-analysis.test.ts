import test from 'node:test';
import assert from 'node:assert/strict';
import { employmentScenario } from '../../src/features/negotiation/data/employment.ts';
import { deadlineScenario } from '../../src/features/negotiation/data/deadline.ts';
import { analyzePenalty, checkPenaltyThreshold } from '../../src/features/maker/model/penaltyAnalysis.ts';
import type { MakerDefinition } from '../../src/features/maker/model/types.ts';

function smallGraph(): MakerDefinition {
  const definition = structuredClone(employmentScenario) as MakerDefinition;
  definition.settings.penalty = { enabled: true, threshold: 3, failureEndingId: 'ending_penalty' };
  definition.startNodeId = 'a';
  definition.nodes = [
    {
      id: 'a', title: 'A', text: 'A', characterId: 'employer', stageId: 'stage-1', reactions: [
        { id: 'a0', intent: 'a0', label: '0', examples: [], penalty: 0, feedback: '', nextNodeId: 'b' },
        { id: 'a2', intent: 'a2', label: '2', examples: [], penalty: 2, feedback: '', nextNodeId: 'b' },
      ],
    },
    {
      id: 'b', title: 'B', text: 'B', characterId: 'employer', stageId: 'stage-1', reactions: [
        { id: 'b1', intent: 'b1', label: '1', examples: [], penalty: 1, feedback: '', nextNodeId: 'c' },
        { id: 'b2', intent: 'b2', label: '2', examples: [], penalty: 2, feedback: '', endingId: 'ending_a_1' },
      ],
    },
    {
      id: 'c', title: 'C', text: 'C', characterId: 'employer', stageId: 'stage-1', reactions: [
        { id: 'c0', intent: 'c0', label: '0', examples: [], penalty: 0, feedback: '', endingId: 'ending_a_1' },
        { id: 'c2', intent: 'c2', label: '2', examples: [], penalty: 2, feedback: '', nextNodeId: 'd' },
      ],
    },
    {
      id: 'd', title: 'D', text: 'D', characterId: 'employer', stageId: 'stage-1', reactions: [
        { id: 'd0', intent: 'd0', label: '0', examples: [], penalty: 0, feedback: '', endingId: 'ending_a_1' },
      ],
    },
  ];
  return definition;
}

test('analyzer derives reachable ranges from graph routes, not node count', () => {
  const result = analyzePenalty(smallGraph());
  assert.equal(result.unbounded, false);
  assert.equal(result.minReachablePenalty, 1);
  assert.equal(result.maxReachablePenalty, 5);
  assert.equal(result.maxThresholdReachablePenalty, 5);
  assert.deepEqual(result.reachableFinalPenalties, [1, 2, 3, 4, 5]);
  assert.ok(result.thresholdValues.includes(3));
  assert.equal(result.current?.penaltyEndingReachable, true);
  assert.equal(result.current?.normalEndingReachable, true);
});

test('explicit endings are not counted as a route to the shared penalty ending', () => {
  const definition = smallGraph();
  definition.settings.penalty.threshold = 5;
  const check = checkPenaltyThreshold(definition, 5);
  assert.equal(check.penaltyEndingReachable, true);
  assert.equal(check.normalEndingReachable, true);

  definition.nodes[2].reactions[1].endingId = 'ending_a_1';
  delete definition.nodes[2].reactions[1].nextNodeId;
  const explicitOnly = checkPenaltyThreshold(definition, 5);
  assert.equal(explicitOnly.penaltyEndingReachable, false);
  assert.equal(explicitOnly.normalEndingReachable, true);
});

test('positive reachable penalty cycles are reported as unbounded', () => {
  const definition = smallGraph();
  definition.nodes[1].reactions[0] = {
    id: 'loop', intent: 'loop', label: 'loop', examples: [], penalty: 1, feedback: '', nextNodeId: 'a',
  };
  assert.equal(analyzePenalty(definition).unbounded, true);
});

test('published built-in scenarios receive stable graph-based recommendations', () => {
  const terms = analyzePenalty(employmentScenario);
  const deadline = analyzePenalty(deadlineScenario);
  assert.equal(deadline.maxReachablePenalty, 7);
  assert.equal(deadline.maxThresholdReachablePenalty, 5);
  assert.deepEqual(terms.recommendations, {
    strict: 1,
    recommended: 2,
    soft: 3,
    range: { min: 2, max: 3 },
  });
  assert.deepEqual(deadline.recommendations, {
    strict: 2,
    recommended: 3,
    soft: 4,
    range: { min: 3, max: 4 },
  });
  assert.equal(terms.current?.penaltyEndingReachable, true);
  assert.equal(deadline.current?.penaltyEndingReachable, true);
  for (const definition of [employmentScenario, deadlineScenario, smallGraph()]) {
    const range = analyzePenalty(definition).recommendations!.range;
    for (let threshold = range.min; threshold <= range.max; threshold += 1) {
      const check = checkPenaltyThreshold(definition, threshold);
      assert.equal(check.penaltyEndingReachable, true);
      assert.equal(check.normalEndingReachable, true);
    }
  }
});
