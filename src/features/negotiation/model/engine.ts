import type {
  AnswerId,
  AnswerOption,
  DialogueNode,
  Ending,
  NodeId,
  ScenarioAttempt,
  ScenarioDefinition,
} from './types.ts';

export interface CompiledScenario {
  definition: ScenarioDefinition;
  nodes: ReadonlyMap<NodeId, DialogueNode>;
  endings: ReadonlyMap<string, Ending>;
  totalQuestions: number;
  failureThreshold: number;
}

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Validate authored data once, before offering the scenario to a player. */
export function compileScenario(definition: ScenarioDefinition): CompiledScenario {
  const unique = <T extends { id: string }>(items: readonly T[], label: string) => {
    const map = new Map(items.map((item) => [item.id, item]));
    requireValid(
      map.size === items.length && items.every((item) => item.id.trim()),
      `Повторяющиеся или пустые ID: ${label}`,
    );
    return map;
  };
  requireValid(
    definition.metadata.id.trim() &&
      Number.isInteger(definition.metadata.version) &&
      definition.metadata.version > 0,
    'Некорректная версия сценария',
  );
  const nodes = unique(definition.nodes, 'вопросы');
  const endings = unique(definition.endings, 'концовки');
  const characters = unique(definition.characters, 'персонажи');
  const stages = unique(definition.stages, 'этапы');
  requireValid(nodes.has(definition.startNodeId), 'Нет начального вопроса');
  requireValid(
    definition.settings.failure.rule === 'half-all-questions',
    'Неизвестное правило оценки',
  );
  requireValid(
    endings.get(definition.settings.failure.endingId)?.type === 'failure',
    'Нет концовки провала',
  );
  const answers = new Map<string, AnswerOption>();
  for (const node of nodes.values()) {
    requireValid(
      characters.has(node.speakerId) && stages.has(node.stageId),
      `Неизвестный персонаж или этап: ${node.id}`,
    );
    requireValid(
      node.text.trim() && node.answers.length > 0,
      `Вопрос без реплики или ответов: ${node.id}`,
    );
    for (const answer of node.answers) {
      requireValid(
        answer.id.trim() && !answers.has(answer.id),
        `Повторяющийся или пустой ID ответа: ${answer.id}`,
      );
      requireValid(
        answer.text.trim() && answer.feedback.trim(),
        `Пустой ответ или разбор: ${answer.id}`,
      );
      requireValid(
        Number.isInteger(answer.penalty) && answer.penalty >= 0,
        `Неверный штраф: ${answer.id}`,
      );
      if (answer.next.type === 'node')
        requireValid(nodes.has(answer.next.nodeId), `Неизвестный переход: ${answer.id}`);
      else
        requireValid(
          answer.next.type === 'ending' && endings.has(answer.next.endingId),
          `Неизвестная концовка: ${answer.id}`,
        );
      answers.set(answer.id, answer);
    }
  }
  for (const node of nodes.values()) {
    const variants = new Set<string>();
    for (const variant of node.textVariants ?? []) {
      const source = answers.get(variant.afterAnswerId);
      requireValid(
        source?.next.type === 'node' &&
          source.next.nodeId === node.id &&
          variant.text.trim() &&
          !variants.has(variant.afterAnswerId),
        `Неверный вариант реплики: ${node.id}`,
      );
      variants.add(variant.afterAnswerId);
    }
  }
  // A finite, acyclic graph keeps attempts bounded and makes the total unambiguous.
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string) {
    requireValid(!active.has(id), `Цикл в сценарии: ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    const node = nodes.get(id)!;
    for (const answer of node.answers) if (answer.next.type === 'node') visit(answer.next.nodeId);
    active.delete(id);
    visited.add(id);
  }
  visit(definition.startNodeId);
  requireValid(visited.size === nodes.size, 'В сценарии есть недостижимые вопросы');
  return {
    definition,
    nodes,
    endings,
    totalQuestions: visited.size,
    failureThreshold: Math.ceil(visited.size / 2),
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
  return (
    node.textVariants?.find((variant) => variant.afterAnswerId === previous?.answerId)?.text ??
    node.text
  );
}

/** Pure transition. The caller supplies the expected node to reject stale/double submissions. */
export function answerQuestion(
  scenario: CompiledScenario,
  attempt: ScenarioAttempt,
  nodeId: NodeId,
  answerId: AnswerId,
  now: string,
): ScenarioAttempt {
  requireValid(
    attempt.scenarioId === scenario.definition.metadata.id &&
      attempt.scenarioVersion === scenario.definition.metadata.version,
    'Версия сценария изменилась',
  );
  requireValid(attempt.status === 'in-progress', 'Попытка уже завершена');
  requireValid(attempt.currentNodeId === nodeId, 'Этот вопрос уже обработан');
  requireValid(
    Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(attempt.updatedAt),
    'Некорректное время ответа',
  );
  const node = scenario.nodes.get(nodeId);
  const answer = node?.answers.find((item) => item.id === answerId);
  requireValid(answer, 'Ответ не принадлежит текущему вопросу');
  const penalties = attempt.penalties + answer.penalty;
  const base = {
    id: attempt.id,
    scenarioId: attempt.scenarioId,
    scenarioVersion: attempt.scenarioVersion,
    startedAt: attempt.startedAt,
    updatedAt: now,
    penalties,
    history: [...attempt.history, { nodeId, answerId, answeredAt: now }],
  };
  // Failure overrides a normal ending on the same answer.
  if (penalties >= scenario.failureThreshold)
    return {
      ...base,
      status: 'completed',
      endingId: scenario.definition.settings.failure.endingId,
      completedAt: now,
    };
  if (answer.next.type === 'ending')
    return { ...base, status: 'completed', endingId: answer.next.endingId, completedAt: now };
  return { ...base, status: 'in-progress', currentNodeId: answer.next.nodeId };
}

export function getReview(scenario: CompiledScenario, attempt: ScenarioAttempt) {
  return attempt.history.map((item, index) => {
    const node = scenario.nodes.get(item.nodeId)!;
    const answer = node.answers.find((candidate) => candidate.id === item.answerId)!;
    const previousId = attempt.history[index - 1]?.answerId;
    return {
      node,
      answer,
      question:
        node.textVariants?.find((variant) => variant.afterAnswerId === previousId)?.text ??
        node.text,
    };
  });
}
