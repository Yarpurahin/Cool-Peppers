import type { MakerDocument, MakerDefinition, UserReaction } from './types.ts';

export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
export function reactionById(def: MakerDefinition, nodeId: string, reactionId: string) {
  return def.nodes.find((n) => n.id === nodeId)?.reactions.find((r) => r.id === reactionId);
}
export function cleanVariants(def: MakerDefinition) {
  const destinations = new Map(
    def.nodes.flatMap((n) => n.reactions.map((r) => [r.id, r.nextNodeId] as const)),
  );
  for (const node of def.nodes)
    if (node.textVariants)
      node.textVariants = node.textVariants.filter(
        (v) => destinations.get(v.afterReactionId) === node.id,
      );
}
export function connectReaction(
  def: MakerDefinition,
  nodeId: string,
  reactionId: string,
  target?: { type: 'node' | 'ending'; id: string },
) {
  const reaction = reactionById(def, nodeId, reactionId);
  if (!reaction) return;
  delete reaction.nextNodeId;
  delete reaction.endingId;
  if (target?.type === 'node') reaction.nextNodeId = target.id;
  if (target?.type === 'ending') reaction.endingId = target.id;
  cleanVariants(def);
}
export function removeReaction(def: MakerDefinition, nodeId: string, reactionId: string) {
  const node = def.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const before = node.reactions.length;
  node.reactions = node.reactions.filter((reaction) => reaction.id !== reactionId);
  if (node.reactions.length === before) return false;
  cleanVariants(def);
  return true;
}

export function addReaction(def: MakerDefinition, nodeId: string): UserReaction | undefined {
  const node = def.nodes.find((n) => n.id === nodeId);
  if (!node || node.reactions.length >= 30) return;
  const id = newId('reaction');
  const reaction: UserReaction = {
    id,
    intent: id,
    label: 'Новая реакция',
    examples: [],
    evaluation: { grade: 'acceptable', penalty: 0, feedback: '' },
  };
  node.reactions.push(reaction);
  return reaction;
}
export function addBlock(
  doc: MakerDocument,
  type: 'node' | 'ending',
  position: { x: number; y: number },
  id = newId(type),
) {
  if (type === 'node') {
    doc.definition.nodes.push({
      id,
      title: 'Новая реплика',
      characterId: doc.definition.characters[0]?.id ?? '',
      stageId: doc.definition.stages[0]?.id,
      text: '',
      reactions: [],
    });
    if (!doc.definition.startNodeId) doc.definition.startNodeId = id;
  } else
    doc.definition.endings.push({ id, type: 'neutral', title: 'Новый финал', description: '' });
  doc.editor.positions[id] = position;
  return id;
}
export function removeBlocks(doc: MakerDocument, ids: readonly string[]) {
  const removing = new Set(ids);
  doc.definition.nodes = doc.definition.nodes.filter((n) => !removing.has(n.id));
  doc.definition.endings = doc.definition.endings.filter((e) => !removing.has(e.id));
  for (const node of doc.definition.nodes)
    for (const r of node.reactions) {
      if (r.nextNodeId && removing.has(r.nextNodeId)) delete r.nextNodeId;
      if (r.endingId && removing.has(r.endingId)) delete r.endingId;
    }
  if (removing.has(doc.definition.startNodeId)) doc.definition.startNodeId = '';
  // A removed assessment failure ending remains an explicit validation error until the rule is disabled/reassigned.
  for (const id of ids) delete doc.editor.positions[id];
  cleanVariants(doc.definition);
}
export function duplicateBlock(doc: MakerDocument, id: string, copyId = newId('copy')) {
  const node = doc.definition.nodes.find((n) => n.id === id);
  const ending = doc.definition.endings.find((e) => e.id === id);
  if (!node && !ending) return;
  if (node) {
    const copy = structuredClone(node);
    copy.id = copyId;
    copy.title += ' — копия';
    delete copy.textVariants;
    copy.reactions = copy.reactions.map((r) => ({ ...r, id: newId('reaction') }));
    doc.definition.nodes.push(copy);
    // Preserve contextual wording on each copied outgoing route.
    for (const target of doc.definition.nodes) {
      const variants =
        target.textVariants?.flatMap((v) => {
          const index = node.reactions.findIndex((r) => r.id === v.afterReactionId);
          return index < 0 ? [] : [{ ...v, afterReactionId: copy.reactions[index].id }];
        }) ?? [];
      if (variants.length) target.textVariants = [...(target.textVariants ?? []), ...variants];
    }
  } else
    doc.definition.endings.push({
      ...structuredClone(ending!),
      id: copyId,
      title: ending!.title + ' — копия',
    });
  const pos = doc.editor.positions[id] ?? { x: 0, y: 0 };
  doc.editor.positions[copyId] = { x: pos.x + 70, y: pos.y + 90 };
  return copyId;
}

/**
 * Deterministic layered placement from left to right.
 *
 * Besides assigning dialogue depth to columns, the layout repeatedly reorders
 * nodes inside neighbouring columns by the median position of their parents
 * and children. This is a lightweight Sugiyama-style crossing-reduction pass:
 * converging branches stay close together and reaction order is only used as a
 * stable tie-breaker instead of forcing long vertical detours.
 */
export function layoutGraph(def: MakerDefinition) {
  const dialogue = new Map(def.nodes.map((node) => [node.id, node]));
  const endings = new Set(def.endings.map((ending) => ending.id));
  const allIds = new Set([...dialogue.keys(), ...endings]);
  const depth = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [];
  if (dialogue.has(def.startNodeId)) queue.push({ id: def.startNodeId, depth: 0 });

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const previous = depth.get(current.id);
    if (previous !== undefined) continue;
    depth.set(current.id, current.depth);
    const node = dialogue.get(current.id);
    if (!node) continue;
    for (const reaction of node.reactions) {
      if (reaction.nextNodeId && dialogue.has(reaction.nextNodeId))
        queue.push({ id: reaction.nextNodeId, depth: current.depth + 1 });
    }
  }

  // For acyclic reachable parts prefer the longest path. This keeps every forward
  // branch in a later column even when a merge is reachable through both a
  // short and a long route. Cyclic components simply keep their safe BFS depth.
  const indegree = new Map(def.nodes.map((node) => [node.id, 0]));
  for (const node of def.nodes)
    for (const reaction of node.reactions)
      if (reaction.nextNodeId && dialogue.has(reaction.nextNodeId))
        indegree.set(reaction.nextNodeId, (indegree.get(reaction.nextNodeId) ?? 0) + 1);
  const topological = def.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const longest = new Map<string, number>();
  if (dialogue.has(def.startNodeId)) longest.set(def.startNodeId, 0);
  for (let cursor = 0; cursor < topological.length; cursor++) {
    const id = topological[cursor];
    const sourceDepth = longest.get(id);
    const node = dialogue.get(id)!;
    for (const reaction of node.reactions) {
      if (!reaction.nextNodeId || !dialogue.has(reaction.nextNodeId)) continue;
      if (sourceDepth !== undefined)
        longest.set(
          reaction.nextNodeId,
          Math.max(longest.get(reaction.nextNodeId) ?? -1, sourceDepth + 1),
        );
      const left = (indegree.get(reaction.nextNodeId) ?? 1) - 1;
      indegree.set(reaction.nextNodeId, left);
      if (left === 0) topological.push(reaction.nextNodeId);
    }
  }
  for (const [id, value] of longest) depth.set(id, value);

  const deepestReachable = Math.max(0, ...depth.values());
  for (const node of def.nodes) if (!depth.has(node.id)) depth.set(node.id, deepestReachable + 1);
  for (const ending of def.endings) {
    let parentDepth = -1;
    for (const node of def.nodes)
      if (node.reactions.some((reaction) => reaction.endingId === ending.id))
        parentDepth = Math.max(parentDepth, depth.get(node.id) ?? deepestReachable);
    depth.set(ending.id, parentDepth >= 0 ? parentDepth + 1 : deepestReachable + 2);
  }

  const columns = new Map<number, string[]>();
  const stableOrder = new Map<string, number>();
  let sequence = 0;
  for (const node of def.nodes) stableOrder.set(node.id, sequence++);
  for (const ending of def.endings) stableOrder.set(ending.id, sequence++);
  for (const id of allIds) {
    const column = depth.get(id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), id]);
  }

  const outgoing = new Map<string, Array<{ id: string; order: number }>>();
  const incoming = new Map<string, Array<{ id: string; order: number }>>();
  for (const node of def.nodes) {
    node.reactions.forEach((reaction, order) => {
      const target = reaction.nextNodeId ?? reaction.endingId;
      if (!target || !allIds.has(target)) return;
      outgoing.set(node.id, [...(outgoing.get(node.id) ?? []), { id: target, order }]);
      incoming.set(target, [...(incoming.get(target) ?? []), { id: node.id, order }]);
    });
  }

  const orderedDepths = [...columns.keys()].sort((a, b) => a - b);
  const median = (values: number[]) => {
    if (!values.length) return Number.POSITIVE_INFINITY;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const sortColumn = (columnDepth: number, neighbours: Map<string, Array<{ id: string; order: number }>>) => {
    const column = columns.get(columnDepth);
    if (!column || column.length < 2) return;
    const positions = new Map<string, number>();
    for (const values of columns.values()) values.forEach((id, index) => positions.set(id, index));
    column.sort((left, right) => {
      const leftLinks = neighbours.get(left) ?? [];
      const rightLinks = neighbours.get(right) ?? [];
      const leftMedian = median(leftLinks.map((link) => (positions.get(link.id) ?? 0) + link.order * 0.001));
      const rightMedian = median(rightLinks.map((link) => (positions.get(link.id) ?? 0) + link.order * 0.001));
      if (leftMedian !== rightMedian) return leftMedian - rightMedian;
      return (stableOrder.get(left) ?? 0) - (stableOrder.get(right) ?? 0);
    });
  };

  // Alternating sweeps reduce crossings for both diverging and converging branches.
  for (let pass = 0; pass < 6; pass++) {
    for (const columnDepth of orderedDepths.slice(1)) sortColumn(columnDepth, incoming);
    for (const columnDepth of [...orderedDepths].reverse().slice(1)) sortColumn(columnDepth, outgoing);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const columnDepth of orderedDepths) {
    const column = columns.get(columnDepth) ?? [];
    const heights = column.map((id) => {
      const reactions = dialogue.get(id)?.reactions.length ?? 0;
      return dialogue.has(id) ? 195 + reactions * 42 : 135;
    });
    const totalHeight = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, column.length - 1) * 95;
    let y = Math.max(80, 360 - totalHeight / 2);
    column.forEach((id, index) => {
      positions[id] = { x: 80 + columnDepth * 430, y };
      y += heights[index] + 95;
    });
  }
  return positions;
}

