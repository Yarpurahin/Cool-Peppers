import { getReview, questionText } from './model/engine.ts';
import type { CompiledScenario } from './model/engine.ts';
import type { ScenarioAttempt } from './model/types.ts';
import type { Penalty, UserReaction } from '../maker/model/types.ts';
import type { PlayViewModel, ResultViewModel } from './ui/types.ts';

export function penaltyTitle(penalty: Penalty) {
  if (penalty === 2) return 'Нежелательная';
  if (penalty === 1) return 'Сомнительная';
  return 'Уместная';
}

function hasAssessment(reaction: UserReaction) {
  return Boolean(reaction.feedback.trim()) || reaction.penalty > 0;
}

export function toPlayView(scenario: CompiledScenario, attempt: ScenarioAttempt): PlayViewModel {
  if (attempt.status !== 'in-progress') throw new Error('Попытка завершена');
  const { definition } = scenario;
  const node = scenario.nodes.get(attempt.currentNodeId)!;
  const character = definition.characters.find((item) => item.id === node.characterId)!;
  const visitedStages = new Set(
    attempt.history.map((item) => scenario.nodes.get(item.nodeId)?.stageId).filter((id): id is string => Boolean(id)),
  );
  const review = getReview(scenario, attempt);
  const latest = review.at(-1);
  const feedbackMode = definition.settings.feedbackMode;
  return {
    scenarioId: definition.metadata.id,
    title: definition.metadata.title,
    goal: definition.metadata.goal,
    role: definition.metadata.playerRole,
    tip: definition.metadata.tip,
    character,
    question: { id: node.id, title: node.title, text: questionText(node, attempt) },
    answers: node.reactions.map((reaction) => ({ id: reaction.id, text: reaction.label })),
    step: attempt.history.length + 1,
    history: review.map(({ node: previous, reaction, question }, index) => ({
      id: `${previous.id}-${index}`,
      question,
      answer: reaction.label,
    })),
    ...(feedbackMode === 'immediate' && latest && hasAssessment(latest.reaction)
      ? {
          evaluation: {
            penalty: latest.reaction.penalty,
            title: penaltyTitle(latest.reaction.penalty),
            text: latest.reaction.feedback,
          },
        }
      : {}),
    stages: definition.stages.map((stage) => ({
      ...stage,
      state: stage.id === node.stageId ? 'current' : visitedStages.has(stage.id) ? 'past' : 'future',
    })),
  };
}

export function toResultView(scenario: CompiledScenario, attempt: ScenarioAttempt): ResultViewModel {
  if (attempt.status !== 'completed') throw new Error('Попытка ещё не завершена');
  const ending = scenario.endings.get(attempt.endingId)!;
  const definition = scenario.definition;
  const feedbackMode = definition.settings.feedbackMode;
  const review = getReview(scenario, attempt);
  const assessed = feedbackMode !== 'hidden' && review.some(({ reaction }) => hasAssessment(reaction));
  const failureThreshold = Number.isFinite(scenario.failureThreshold) ? scenario.failureThreshold : undefined;
  return {
    scenarioId: definition.metadata.id,
    title: definition.metadata.title,
    outcome: ending.title,
    outcomeType: ending.type,
    subtitle: assessed
      ? `Ответов: ${attempt.history.length} · Штрафных баллов: ${attempt.penalties}`
      : `Выбрано реакций: ${attempt.history.length}`,
    nextStep: `${ending.description} ${ending.nextStep ?? ''}`.trim(),
    metric: assessed
      ? {
          value: attempt.penalties,
          label: failureThreshold ? `штрафы · лимит ${failureThreshold}` : 'штрафных баллов',
          percent: failureThreshold ? (attempt.penalties / failureThreshold) * 100 : Math.min(100, attempt.penalties * 20),
        }
      : { value: attempt.history.length, label: 'шагов диалога', percent: 100 },
    reviews: review.map(({ node, reaction, question }, index) => {
      const showEvaluation = feedbackMode !== 'hidden' && hasAssessment(reaction);
      return {
        id: `${node.id}-${index}`,
        title: showEvaluation ? penaltyTitle(reaction.penalty) : 'Ваш выбор',
        text: showEvaluation ? reaction.feedback : '',
        quote: reaction.label,
        question,
        penalty: showEvaluation ? reaction.penalty : 0,
      };
    }),
  };
}
