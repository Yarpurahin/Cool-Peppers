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
export function addReaction(def: MakerDefinition, nodeId: string): UserReaction | undefined {
  const node = def.nodes.find((n) => n.id === nodeId);
  if (!node || node.reactions.length >= 30) return;
  const id = newId('reaction');
  const reaction = { id, intent: id, label: 'Новая реакция', examples: [] };
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
  // A removed legacy failure ending remains an explicit validation error until the rule is disabled/reassigned.
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

/** Deterministic breadth-first placement; layout never writes to definition. */
export function layoutGraph(def: MakerDefinition) {
  const depths = new Map<string, number>();
  const nodes = new Map(def.nodes.map((n) => [n.id, n]));
  const queue: { id: string; depth: number }[] = [{ id: def.startNodeId, depth: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const { id, depth } = queue[i];
    if (depths.has(id) || !nodes.has(id)) continue;
    depths.set(id, depth);
    for (const r of nodes.get(id)!.reactions)
      if (r.nextNodeId) queue.push({ id: r.nextNodeId, depth: depth + 1 });
  }
  const orphanDepth = Math.max(0, ...depths.values()) + 1;
  for (const n of def.nodes) if (!depths.has(n.id)) depths.set(n.id, orphanDepth);
  const rows = new Map<number, string[]>();
  for (const node of def.nodes) {
    const depth = depths.get(node.id)!;
    rows.set(depth, [...(rows.get(depth) ?? []), node.id]);
  }
  rows.set(
    Math.max(-1, ...rows.keys()) + 1,
    def.endings.map((e) => e.id),
  );
  const positions: Record<string, { x: number; y: number }> = {};
  let y = 80;
  for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
    row.forEach((id, index) => {
      positions[id] = { x: 80 + index * 370, y };
    });
    y += Math.max(210, ...row.map((id) => 195 + (nodes.get(id)?.reactions.length ?? 0) * 42)) + 110;
  }
  return positions;
}
