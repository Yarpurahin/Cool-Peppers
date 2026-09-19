import type { CompiledScenario } from '../model/engine.ts';
import { answerQuestion, startAttempt } from '../model/engine.ts';
import type { Feedback, ScenarioAttempt } from '../model/types.ts';

export interface AttemptRepository {
  load: (scenario: CompiledScenario) => { attempt?: ScenarioAttempt; warning?: string };
  save: (attempt: ScenarioAttempt) => void;
  loadFeedback: (scenarioId: string, attemptId: string) => Feedback | undefined;
  saveFeedback: (scenarioId: string, feedback: Feedback) => void;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const attemptKey = (id: string) => `arena:attempt:v1:${encodeURIComponent(id)}`;
const feedbackKey = (id: string) => `arena:feedback:v1:${encodeURIComponent(id)}`;

/** Never trust stored score, node or ending: reconstruct them from valid answers. */
export function restoreAttempt(scenario: CompiledScenario, value: unknown): ScenarioAttempt {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.attempt))
    throw new Error('Неизвестный формат сохранения');
  const saved = value.attempt;
  if (
    saved.scenarioId !== scenario.definition.metadata.id ||
    saved.scenarioVersion !== scenario.definition.metadata.version
  )
    throw new Error('Сценарий обновлён');
  if (
    typeof saved.id !== 'string' ||
    typeof saved.startedAt !== 'string' ||
    !Array.isArray(saved.history) ||
    saved.history.length > scenario.totalQuestions
  )
    throw new Error('Повреждённая попытка');
  let attempt = startAttempt(scenario, saved.id, saved.startedAt);
  for (const item of saved.history) {
    if (
      !record(item) ||
      typeof item.nodeId !== 'string' ||
      typeof item.answerId !== 'string' ||
      typeof item.answeredAt !== 'string'
    )
      throw new Error('Повреждённая история');
    attempt = answerQuestion(scenario, attempt, item.nodeId, item.answerId, item.answeredAt);
  }
  return attempt;
}

/** The provider owns in-memory state. This adapter is the only localStorage dependency. */
export function createAttemptRepository(
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'>,
): AttemptRepository {
  return {
    load(scenario) {
      let raw: string | null;
      try {
        raw = getStorage().getItem(attemptKey(scenario.definition.metadata.id));
      } catch {
        return {
          warning:
            'Хранилище браузера недоступно. Прогресс сохранится только до закрытия страницы.',
        };
      }
      if (!raw) return {};
      try {
        return { attempt: restoreAttempt(scenario, JSON.parse(raw) as unknown) };
      } catch {
        return { warning: 'Сохранение устарело или повреждено. Начата новая попытка.' };
      }
    },
    save(attempt) {
      getStorage().setItem(
        attemptKey(attempt.scenarioId),
        JSON.stringify({ schemaVersion: 1, attempt }),
      );
    },
    loadFeedback(scenarioId, attemptId) {
      try {
        const raw = getStorage().getItem(feedbackKey(scenarioId));
        if (!raw) return undefined;
        const value: unknown = JSON.parse(raw);
        if (
          !record(value) ||
          value.attemptId !== attemptId ||
          typeof value.helpful !== 'boolean' ||
          typeof value.comment !== 'string' ||
          value.comment.length > 2000 ||
          typeof value.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(value.createdAt))
        )
          return undefined;
        return {
          attemptId,
          helpful: value.helpful,
          comment: value.comment,
          createdAt: value.createdAt,
        };
      } catch {
        return undefined;
      }
    },
    saveFeedback(scenarioId, feedback) {
      getStorage().setItem(
        feedbackKey(scenarioId),
        JSON.stringify({ ...feedback, comment: feedback.comment.slice(0, 2000) }),
      );
    },
  };
}
