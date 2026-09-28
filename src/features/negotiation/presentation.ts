import { getReview, questionText } from './model/engine.ts';
import type { CompiledScenario } from './model/engine.ts';
import type { ScenarioAttempt } from './model/types.ts';
import type { ReactionGrade, UserReaction } from '../maker/model/types.ts';
import type { PlayViewModel, ResultViewModel } from './ui/types.ts';

function gradeTitle(grade: ReactionGrade) {
  if (grade === 'strong') return 'Сильный ответ';
  if (grade === 'weak') return 'Слабый ответ';
  if (grade === 'critical') return 'Критическая ошибка';
  return 'Допустимый ответ';
}

function hasAssessment(reaction: UserReaction) {
  const evaluation = reaction.evaluation;
  return Boolean(evaluation.feedback.trim()) || evaluation.penalty > 0 || evaluation.grade !== 'acceptable';
}

export function toPlayView(scenario: CompiledScenario, attempt: ScenarioAttempt): PlayViewModel {
  if (attempt.status !== 'in-progress') throw new Error('Попытка завершена');
  const { definition } = scenario;
  const node = scenario.nodes.get(attempt.currentNodeId)!;
  const character = definition.characters.find((item) => item.id === node.characterId)!;
  const visitedStages = new Set(
    attempt.history
      .map((item) => scenario.nodes.get(item.nodeId)?.stageId)
      .filter((id): id is string => Boolean(id)),
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
            grade: latest.reaction.evaluation.grade,
            title: gradeTitle(latest.reaction.evaluation.grade),
            text: latest.reaction.evaluation.feedback,
            penalty: latest.reaction.evaluation.penalty,
          },
        }
      : {}),
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
  const feedbackMode = definition.settings.feedbackMode;
  const review = getReview(scenario, attempt);
  const assessed =
    feedbackMode !== 'hidden' && review.some(({ reaction }) => hasAssessment(reaction));
  const failureThreshold = Number.isFinite(scenario.failureThreshold)
    ? scenario.failureThreshold
    : undefined;
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
          label: failureThreshold ? `штрафы · порог ${failureThreshold}` : 'штрафных баллов',
          percent: failureThreshold
            ? (attempt.penalties / failureThreshold) * 100
            : Math.min(100, attempt.penalties * 20),
        }
      : { value: attempt.history.length, label: 'шагов диалога', percent: 100 },
    note: feedbackMode === 'hidden' ? undefined : definition.settings.assessmentNote,
    reviews: review.map(({ node, reaction, question }, index) => {
      const evaluation = reaction.evaluation;
      const showEvaluation = feedbackMode !== 'hidden' && hasAssessment(reaction);
      return {
        id: `${node.id}-${index}`,
        title: showEvaluation ? gradeTitle(evaluation.grade) : 'Ваш выбор',
        text: showEvaluation ? evaluation.feedback : '',
        quote: reaction.label,
        question,
        penalty: showEvaluation ? evaluation.penalty : 0,
        ...(showEvaluation ? { grade: evaluation.grade } : {}),
      };
    }),
  };
}
