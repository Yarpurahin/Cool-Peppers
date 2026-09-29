import type { MakerDefinition } from './types.ts';

export interface ThresholdCheck {
  threshold: number;
  penaltyEndingReachable: boolean;
  normalEndingReachable: boolean;
  minStepsToPenalty: number | null;
}

export interface PenaltyRecommendations {
  strict?: number;
  recommended: number;
  soft?: number;
  range: { min: number; max: number };
}

export interface PenaltyAnalysis {
  minReachablePenalty: number;
  maxReachablePenalty: number;
  maxThresholdReachablePenalty: number;
  reachableFinalPenalties: number[];
  thresholdValues: number[];
  unbounded: boolean;
  recommendations: PenaltyRecommendations | null;
  current?: ThresholdCheck;
  singleReactionCanEnd: boolean;
}

interface State {
  nodeId: string;
  penalty: number;
  steps: number;
}

function reachableNodes(def: MakerDefinition) {
  const nodes = new Map(def.nodes.map((node) => [node.id, node]));
  const reachable = new Set<string>();
  const pending = [def.startNodeId];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id) || !nodes.has(id)) continue;
    reachable.add(id);
    for (const reaction of nodes.get(id)!.reactions)
      if (reaction.nextNodeId) pending.push(reaction.nextNodeId);
  }
  return { nodes, reachable };
}

/** A positive cycle makes the theoretical maximum penalty unbounded. */
function hasPositiveCycle(def: MakerDefinition) {
  const { nodes, reachable } = reachableNodes(def);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let nextIndex = 0;
  let positive = false;

  const visit = (id: string) => {
    index.set(id, nextIndex);
    low.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const reaction of nodes.get(id)?.reactions ?? []) {
      const target = reaction.nextNodeId;
      if (!target || !reachable.has(target)) continue;
      if (!index.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (onStack.has(target)) {
        low.set(id, Math.min(low.get(id)!, index.get(target)!));
      }
    }

    if (low.get(id) !== index.get(id)) return;
    const component: string[] = [];
    while (stack.length) {
      const current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
      if (current === id) break;
    }
    const set = new Set(component);
    const cyclic =
      component.length > 1 ||
      (nodes.get(component[0])?.reactions.some((r) => r.nextNodeId === component[0]) ?? false);
    if (!cyclic) return;
    if (
      component.some((nodeId) =>
        nodes
          .get(nodeId)
          ?.reactions.some((reaction) => reaction.nextNodeId && set.has(reaction.nextNodeId) && reaction.penalty > 0),
      )
    )
      positive = true;
  };

  if (reachable.has(def.startNodeId)) visit(def.startNodeId);
  return positive;
}

/** Simulates the runtime rule. Explicit reaction endings have priority over penalty ending. */
export function checkPenaltyThreshold(def: MakerDefinition, threshold: number): ThresholdCheck {
  const nodes = new Map(def.nodes.map((node) => [node.id, node]));
  const queue: State[] = [{ nodeId: def.startNodeId, penalty: 0, steps: 0 }];
  const visited = new Set<string>();
  let penaltyEndingReachable = false;
  let normalEndingReachable = false;
  let minStepsToPenalty: number | null = null;

  while (queue.length) {
    const state = queue.shift()!;
    const key = `${state.nodeId}:${state.penalty}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodes.get(state.nodeId);
    if (!node) continue;

    for (const reaction of node.reactions) {
      const penalty = state.penalty + reaction.penalty;
      const steps = state.steps + 1;
      if (reaction.endingId) {
        normalEndingReachable = true;
        continue;
      }
      if (penalty >= threshold) {
        penaltyEndingReachable = true;
        minStepsToPenalty = minStepsToPenalty === null ? steps : Math.min(minStepsToPenalty, steps);
        continue;
      }
      if (reaction.nextNodeId)
        queue.push({ nodeId: reaction.nextNodeId, penalty, steps });
    }
  }

  return { threshold, penaltyEndingReachable, normalEndingReachable, minStepsToPenalty };
}

function nearest(values: readonly number[], target: number, predicate: (value: number) => boolean) {
  return values
    .filter(predicate)
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
}

function buildRecommendations(def: MakerDefinition, max: number): PenaltyRecommendations | null {
  if (max < 1) return null;
  const candidates = Array.from({ length: max }, (_, index) => index + 1).filter((threshold) => {
    const check = checkPenaltyThreshold(def, threshold);
    return check.penaltyEndingReachable && check.normalEndingReachable;
  });
  if (!candidates.length) return null;

  const recommendedTarget = Math.max(1, Math.round(max * 0.65));
  const recommended = nearest(candidates, recommendedTarget, () => true) ?? candidates[0];
  const strict = nearest(candidates, Math.max(1, Math.round(max * 0.45)), (v) => v < recommended);
  const soft = nearest(candidates, Math.max(1, Math.round(max * 0.8)), (v) => v > recommended);
  const rangeCandidates = candidates.filter(
    (value) => value >= Math.ceil(max * 0.5) && value <= Math.max(1, Math.floor(max * 0.75)),
  );
  const range = rangeCandidates.length
    ? { min: rangeCandidates[0], max: rangeCandidates.at(-1)! }
    : { min: recommended, max: recommended };
  return { ...(strict ? { strict } : {}), recommended, ...(soft ? { soft } : {}), range };
}

export function analyzePenalty(def: MakerDefinition): PenaltyAnalysis {
  const nodes = new Map(def.nodes.map((node) => [node.id, node]));
  const unbounded = hasPositiveCycle(def);
  const queue: State[] = [{ nodeId: def.startNodeId, penalty: 0, steps: 0 }];
  const visited = new Set<string>();
  const finalPenalties = new Set<number>();
  const thresholdValues = new Set<number>();
  let maxReachablePenalty = 0;
  let maxThresholdReachablePenalty = 0;

  // With positive cycles we only need bounded structural information for warnings;
  // threshold validation itself is handled by checkPenaltyThreshold().
  const safetyPenaltyCap = Math.max(2, def.nodes.length * 2);
  while (queue.length) {
    const state = queue.shift()!;
    const key = `${state.nodeId}:${state.penalty}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodes.get(state.nodeId);
    if (!node) continue;
    for (const reaction of node.reactions) {
      const nextPenalty = state.penalty + reaction.penalty;
      maxReachablePenalty = Math.max(maxReachablePenalty, nextPenalty);
      if (reaction.endingId) {
        finalPenalties.add(nextPenalty);
        continue;
      }
      if (reaction.nextNodeId) {
        thresholdValues.add(nextPenalty);
        maxThresholdReachablePenalty = Math.max(maxThresholdReachablePenalty, nextPenalty);
        if (!unbounded || nextPenalty <= safetyPenaltyCap)
          queue.push({ nodeId: reaction.nextNodeId, penalty: nextPenalty, steps: state.steps + 1 });
      }
    }
  }

  const finals = [...finalPenalties].sort((a, b) => a - b);
  const recommendations = unbounded ? null : buildRecommendations(def, maxThresholdReachablePenalty);
  const current = def.settings.penalty.enabled
    ? checkPenaltyThreshold(def, def.settings.penalty.threshold)
    : undefined;
  const threshold = def.settings.penalty.threshold;
  return {
    minReachablePenalty: finals[0] ?? 0,
    maxReachablePenalty: unbounded ? Number.POSITIVE_INFINITY : maxReachablePenalty,
    maxThresholdReachablePenalty: unbounded ? Number.POSITIVE_INFINITY : maxThresholdReachablePenalty,
    reachableFinalPenalties: finals,
    thresholdValues: [...thresholdValues].sort((a, b) => a - b),
    unbounded,
    recommendations,
    ...(current ? { current } : {}),
    singleReactionCanEnd:
      def.settings.penalty.enabled &&
      def.nodes.some((node) => node.reactions.some((reaction) => reaction.penalty >= threshold)),
  };
}
