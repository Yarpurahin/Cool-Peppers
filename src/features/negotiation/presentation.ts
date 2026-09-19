import { getReview, questionText } from './model/engine.ts';
import type { CompiledScenario } from './model/engine.ts';
import type { ScenarioAttempt } from './model/types.ts';
import type { PlayViewModel, ResultViewModel } from './ui/types.ts';

export function toPlayView(scenario: CompiledScenario, attempt: ScenarioAttempt): PlayViewModel {
  if (attempt.status !== 'in-progress') throw new Error('Попытка завершена');
  const { definition } = scenario;
  const node = scenario.nodes.get(attempt.currentNodeId)!;
  const character = definition.characters.find((item) => item.id === node.speakerId)!;
  const visitedStages = new Set(
    attempt.history.map((item) => scenario.nodes.get(item.nodeId)!.stageId),
  );
  return {
    scenarioId: definition.metadata.id,
    title: definition.metadata.title,
    goal: definition.metadata.goal,
    role: definition.metadata.playerRole,
    tip: definition.metadata.tip,
    character,
    question: { id: node.id, title: node.title, text: questionText(node, attempt) },
    answers: node.answers,
    step: attempt.history.length + 1,
    history: getReview(scenario, attempt).map(({ node: previous, answer, question }, index) => ({
      id: `${previous.id}-${index}`,
      question,
      answer: answer.text,
    })),
    stages: definition.stages.map((stage) => ({
      ...stage,
      state:
        stage.id === node.stageId ? 'current' : visitedStages.has(stage.id) ? 'past' : 'future',
    })),
  };
}

export function toResultView(
  scenario: CompiledScenario,
  attempt: ScenarioAttempt,
): ResultViewModel {
  if (attempt.status !== 'completed') throw new Error('Попытка ещё не завершена');
  const ending = scenario.endings.get(attempt.endingId)!;
  const definition = scenario.definition;
  return {
    scenarioId: definition.metadata.id,
    title: definition.metadata.title,
    outcome: ending.title,
    outcomeType: ending.type,
    subtitle: `Ответов: ${attempt.history.length} · Штрафных баллов: ${attempt.penalties}`,
    nextStep: `${ending.description} ${ending.nextStep}`,
    metric: {
      value: attempt.penalties,
      label: `штрафы · порог ${scenario.failureThreshold}`,
      percent: (attempt.penalties / scenario.failureThreshold) * 100,
    },
    note: definition.settings.assessmentNote,
    reviews: getReview(scenario, attempt).map(({ node, answer, question }, index) => ({
      id: `${node.id}-${index}`,
      title: answer.penalty > 0 ? 'Обратите внимание' : 'Удачный шаг',
      text: answer.feedback,
      quote: answer.text,
      question,
      penalty: answer.penalty,
    })),
  };
}
