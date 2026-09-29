import { analyzePenalty } from './penaltyAnalysis.ts';
import type { GraphIssue, MakerDefinition } from './types.ts';

/** Shared by canvas, test mode and server publication. Draft saving needs only shape validation. */
export function validateMaker(def: MakerDefinition): GraphIssue[] {
  const issues: GraphIssue[] = [];
  function error(code: string, message: string, nodeId?: string, reactionId?: string) {
    issues.push({ severity: 'error', code, message, nodeId, reactionId });
  }
  function warning(code: string, message: string, nodeId?: string, reactionId?: string) {
    issues.push({ severity: 'warning', code, message, nodeId, reactionId });
  }

  const nodes = new Map(def.nodes.map((n) => [n.id, n]));
  const endings = new Map(def.endings.map((e) => [e.id, e]));
  const characters = new Set(def.characters.map((c) => c.id));
  const stages = new Set(def.stages.map((s) => s.id));
  const ids = new Set<string>();
  for (const item of [
    ...def.nodes,
    ...def.endings,
    ...def.characters,
    ...def.stages,
    ...def.nodes.flatMap((n) => n.reactions),
  ]) {
    if (!item.id.trim() || ids.has(item.id))
      error(
        'duplicate-id',
        `ID должен быть уникальным: ${item.id}`,
        nodes.has(item.id) || endings.has(item.id) ? item.id : undefined,
      );
    ids.add(item.id);
  }

  if (!def.metadata.title.trim()) error('title', 'Укажите название сценария.');
  if (!def.metadata.description.trim())
    error('description', 'Добавьте описание сценария в разделе «Основное».');
  if (!nodes.has(def.startNodeId)) error('start', 'Выберите стартовую реплику.');
  if (!endings.size) error('endings', 'Добавьте хотя бы один финал.');
  for (const character of def.characters)
    if (!character.name.trim()) error('character-name', 'Укажите имя персонажа.');

  for (const node of def.nodes) {
    if (!characters.has(node.characterId)) error('character', 'У реплики не выбран персонаж.', node.id);
    if (node.stageId && !stages.has(node.stageId)) error('stage', 'Указанный этап не существует.', node.id);
    if (!node.text.trim()) error('text', 'Заполните текст реплики.', node.id);
    if (!node.reactions.length) error('reactions', 'Добавьте реакцию пользователя.', node.id);
    const intents = new Set<string>();
    for (const reaction of node.reactions) {
      if (!reaction.label.trim()) error('label', 'У реакции нет названия.', node.id, reaction.id);
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(reaction.intent))
        error('intent', 'Intent: латинские буквы, цифры и _, начало с буквы.', node.id, reaction.id);
      if (intents.has(reaction.intent))
        error('intent-duplicate', 'Intent должен быть уникальным внутри реплики.', node.id, reaction.id);
      intents.add(reaction.intent);
      if (![0, 1, 2].includes(reaction.penalty))
        error('reaction-penalty', 'Оценка реакции должна быть 0, 1 или 2.', node.id, reaction.id);
      if (reaction.feedback.length > 10000)
        error('reaction-feedback', 'Обратная связь реакции слишком длинная.', node.id, reaction.id);
      if (Boolean(reaction.nextNodeId) === Boolean(reaction.endingId))
        error('target', 'У реакции должен быть ровно один переход.', node.id, reaction.id);
      if (reaction.nextNodeId && !nodes.has(reaction.nextNodeId))
        error('missing-node', 'Связанная реплика не существует.', node.id, reaction.id);
      if (reaction.endingId && !endings.has(reaction.endingId))
        error('missing-ending', 'Связанный финал не существует.', node.id, reaction.id);
    }
    const variantIds = new Set<string>();
    for (const variant of node.textVariants ?? []) {
      const source = def.nodes.flatMap((n) => n.reactions).find((r) => r.id === variant.afterReactionId);
      if (source?.nextNodeId !== node.id || !variant.text.trim() || variantIds.has(variant.afterReactionId))
        error('variant', 'Некорректный унаследованный вариант реплики.', node.id);
      variantIds.add(variant.afterReactionId);
    }
  }

  for (const ending of def.endings) {
    if (!ending.title.trim() || !ending.description.trim())
      error('ending-text', 'Заполните название и описание финала.', ending.id);
  }

  const penalty = def.settings.penalty;
  if (!Number.isInteger(penalty.threshold) || penalty.threshold < 1)
    error('penalty-threshold', 'Лимит штрафов должен быть положительным целым числом.');
  if (penalty.enabled) {
    if (!penalty.failureEndingId || endings.get(penalty.failureEndingId)?.type !== 'failure')
      error('penalty-ending', 'Выберите существующий отрицательный финал для исчерпания лимита.');
    const analysis = analyzePenalty(def);
    if (analysis.unbounded)
      error(
        'penalty-unbounded',
        'Нельзя надёжно рассчитать лимит: в достижимом цикле можно повторно накапливать штрафы. Уберите штраф из цикла или отключите досрочное завершение.',
      );
    else if (!analysis.current?.penaltyEndingReachable)
      error(
        'penalty-threshold-unreachable',
        `Лимит ${penalty.threshold} недостижим для системного финала. Максимум до обычного перехода — ${analysis.maxThresholdReachablePenalty}.`,
      );
    if (analysis.singleReactionCanEnd)
      warning(
        'penalty-single-reaction',
        'Одна нежелательная реакция может немедленно исчерпать лимит штрафов. Это допустимо, если сценарий задуман как строгий.',
      );
    const recommended = analysis.recommendations;
    if (recommended && penalty.threshold > recommended.range.max)
      warning(
        'penalty-soft',
        `Лимит мягче рекомендуемого диапазона ${recommended.range.min}–${recommended.range.max}; системный финал будет встречаться реже.`,
      );
  }

  const reachable = new Set<string>();
  const pending = [def.startNodeId];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id) || (!nodes.has(id) && !endings.has(id))) continue;
    reachable.add(id);
    for (const reaction of nodes.get(id)?.reactions ?? []) {
      if (reaction.nextNodeId) pending.push(reaction.nextNodeId);
      if (reaction.endingId) pending.push(reaction.endingId);
    }
  }
  if (penalty.enabled && penalty.failureEndingId) reachable.add(penalty.failureEndingId);
  for (const block of [...def.nodes, ...def.endings]) {
    if (!reachable.has(block.id))
      warning('unreachable', 'Блок недостижим из стартовой реплики.', block.id);
  }

  // Cycles with an exit are valid. Closed loops and branches without a path to an ending are not.
  const canFinish = new Set(def.endings.map((e) => e.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of def.nodes) {
      if (!canFinish.has(node.id) && node.reactions.some((r) => canFinish.has(r.nextNodeId || r.endingId || ''))) {
        canFinish.add(node.id);
        changed = true;
      }
    }
  }
  for (const node of def.nodes) {
    if (reachable.has(node.id) && !canFinish.has(node.id))
      error('no-ending-path', 'Из этой реплики нельзя добраться до финала.', node.id);
  }
  return issues;
}
