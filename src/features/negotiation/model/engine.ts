import type { MakerDefinition, DialogueNode, ScenarioEnding, UserReaction } from '../../maker/model/types.ts';
import { validateMaker } from '../../maker/model/validation.ts';
import type { AnswerId, NodeId, ScenarioAttempt } from './types.ts';

export interface CompiledScenario {
  definition: MakerDefinition;
  nodes: ReadonlyMap<NodeId, DialogueNode>;
  endings: ReadonlyMap<string, ScenarioEnding>;
  totalQuestions: number;
  failureThreshold: number;
}

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Validate one canonical maker graph before offering it to a player. */
export function compileScenario(input: MakerDefinition): CompiledScenario {
  const definition = structuredClone(input);
  const issues = validateMaker(definition).filter((issue) => issue.severity === 'error');
  requireValid(!issues.length, issues.map((issue) => issue.message).join('\n'));

  const unique = <T extends { id: string }>(items: readonly T[], label: string) => {
    const map = new Map(items.map((item) => [item.id, item]));
    requireValid(map.size === items.length && items.every((item) => item.id.trim()), `Повторяющиеся или пустые ID: ${label}`);
    return map;
  };

  requireValid(
    definition.metadata.id.trim() && Number.isInteger(definition.metadata.version) && definition.metadata.version > 0,
    'Некорректная версия сценария',
  );

  const nodes = unique(definition.nodes, 'реплики');
  const endings = unique(definition.endings, 'концовки');
  const characters = unique(definition.characters, 'персонажи');
  const stages = unique(definition.stages, 'этапы');
  requireValid(nodes.has(definition.startNodeId), 'Нет начальной реплики');

  if (definition.settings.penalty.enabled) {
    requireValid(
      Boolean(definition.settings.penalty.failureEndingId) &&
        endings.get(definition.settings.penalty.failureEndingId!)?.type === 'failure',
      'Нет концовки провала для лимита штрафов',
    );
  }

  const reactions = new Map<string, UserReaction>();
  for (const node of nodes.values()) {
    requireValid(characters.has(node.characterId), `Неизвестный персонаж: ${node.id}`);
    if (node.stageId) requireValid(stages.has(node.stageId), `Неизвестный этап: ${node.id}`);
    requireValid(node.text.trim() && node.reactions.length > 0, `Реплика без текста или реакций: ${node.id}`);

    for (const reaction of node.reactions) {
      requireValid(reaction.id.trim() && !reactions.has(reaction.id), `Повторяющийся или пустой ID реакции: ${reaction.id}`);
      requireValid(reaction.label.trim(), `Пустая реакция: ${reaction.id}`);
      requireValid([0, 1, 2].includes(reaction.penalty), `Неверный штраф: ${reaction.id}`);
      const hasNode = Boolean(reaction.nextNodeId);
      const hasEnding = Boolean(reaction.endingId);
      requireValid(hasNode !== hasEnding, `У реакции должен быть ровно один переход: ${reaction.id}`);
      if (reaction.nextNodeId) requireValid(nodes.has(reaction.nextNodeId), `Неизвестный переход: ${reaction.id}`);
      if (reaction.endingId) requireValid(endings.has(reaction.endingId), `Неизвестная концовка: ${reaction.id}`);
      reactions.set(reaction.id, reaction);
    }
  }

  for (const node of nodes.values()) {
    const variants = new Set<string>();
    for (const variant of node.textVariants ?? []) {
      const source = reactions.get(variant.afterReactionId);
      requireValid(
        source?.nextNodeId === node.id && variant.text.trim() && !variants.has(variant.afterReactionId),
        `Неверный вариант реплики: ${node.id}`,
      );
      variants.add(variant.afterReactionId);
    }
  }

  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.get(id)!;
    for (const reaction of node.reactions) if (reaction.nextNodeId) visit(reaction.nextNodeId);
  };
  visit(definition.startNodeId);

  return {
    definition,
    nodes,
    endings,
    totalQuestions: visited.size,
    failureThreshold: definition.settings.penalty.enabled ? definition.settings.penalty.threshold : Infinity,
  };
}

export function startAttempt(scenario: CompiledScenario, id: string, now: string): ScenarioAttempt {
  requireValid(id.trim() && Number.isFinite(Date.parse(now)), 'Некорректное начало попытки');
  return {
    id,
    scenarioId: scenario.definition.metadata.id,
    scenarioVersion: scenario.definition.metadata.version,
    status: 'in-progress',
    currentNodeId: scenario.definition.startNodeId,
    startedAt: now,
    updatedAt: now,
    penalties: 0,
    history: [],
  };
}

export function questionText(node: DialogueNode, attempt: ScenarioAttempt): string {
  const previous = attempt.history.at(-1);
  return node.textVariants?.find((variant) => variant.afterReactionId === previous?.answerId)?.text ?? node.text;
}

/** Pure transition. Explicit endingId is intentional story logic and has priority over the shared penalty ending. */
export function answerQuestion(
  scenario: CompiledScenario,
  attempt: ScenarioAttempt,
  nodeId: NodeId,
  answerId: AnswerId,
  now: string,
): ScenarioAttempt {
  requireValid(
    attempt.scenarioId === scenario.definition.metadata.id && attempt.scenarioVersion === scenario.definition.metadata.version,
    'Версия сценария изменилась',
  );
  requireValid(attempt.status === 'in-progress', 'Попытка уже завершена');
  requireValid(attempt.history.length < 500, 'Достигнут лимит 500 шагов. Перезапустите прохождение.');
  requireValid(attempt.currentNodeId === nodeId, 'Эта реплика уже обработана');
  requireValid(Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(attempt.updatedAt), 'Некорректное время ответа');

  const node = scenario.nodes.get(nodeId);
  const reaction = node?.reactions.find((item) => item.id === answerId);
  requireValid(reaction, 'Реакция не принадлежит текущей реплике');

  const penalties = attempt.penalties + reaction.penalty;
  const base = {
    id: attempt.id,
    scenarioId: attempt.scenarioId,
    scenarioVersion: attempt.scenarioVersion,
    startedAt: attempt.startedAt,
    updatedAt: now,
    penalties,
    history: [...attempt.history, { nodeId, answerId, answeredAt: now }],
  };

  if (reaction.endingId)
    return { ...base, status: 'completed', endingId: reaction.endingId, completedAt: now };

  const penalty = scenario.definition.settings.penalty;
  if (penalty.enabled && penalties >= penalty.threshold)
    return {
      ...base,
      status: 'completed',
      endingId: penalty.failureEndingId!,
      completedAt: now,
    };

  requireValid(reaction.nextNodeId, `У реакции нет перехода: ${reaction.id}`);
  return { ...base, status: 'in-progress', currentNodeId: reaction.nextNodeId };
}

export function getReview(scenario: CompiledScenario, attempt: ScenarioAttempt) {
  return attempt.history.map((item, index) => {
    const node = scenario.nodes.get(item.nodeId)!;
    const reaction = node.reactions.find((candidate) => candidate.id === item.answerId)!;
    const previousId = attempt.history[index - 1]?.answerId;
    return {
      node,
      reaction,
      question: node.textVariants?.find((variant) => variant.afterReactionId === previousId)?.text ?? node.text,
    };
  });
}
