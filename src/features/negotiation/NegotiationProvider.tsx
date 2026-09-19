import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { negotiationScenarios } from './data/registry.ts';
import { answerQuestion, startAttempt } from './model/engine.ts';
import type { CompiledScenario } from './model/engine.ts';
import type { Feedback, ScenarioAttempt } from './model/types.ts';
import { createAttemptRepository } from './storage/attemptRepository.ts';
import type { AttemptRepository } from './storage/attemptRepository.ts';

const browserRepository = createAttemptRepository(() => window.localStorage);
interface Entry {
  attempt: ScenarioAttempt;
  message: string;
}
interface ContextValue {
  entries: ReadonlyMap<string, Entry>;
  submit: (
    scenario: CompiledScenario,
    attemptId: string,
    nodeId: string,
    answerId: string,
  ) => ScenarioAttempt;
  restart: (scenario: CompiledScenario) => void;
  save: (scenarioId: string) => boolean;
  loadFeedback: (scenarioId: string, attemptId: string) => Feedback | undefined;
  saveFeedback: (scenarioId: string, input: { helpful: boolean; comment: string }) => void;
}
const NegotiationContext = createContext<ContextValue | null>(null);
const newAttempt = (scenario: CompiledScenario) =>
  startAttempt(scenario, crypto.randomUUID(), new Date().toISOString());

export function NegotiationProvider({
  children,
  repository = browserRepository,
}: {
  children: ReactNode;
  repository?: AttemptRepository;
}) {
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(
    () =>
      new Map(
        negotiationScenarios.map((scenario) => {
          const loaded = repository.load(scenario);
          return [
            scenario.definition.metadata.id,
            { attempt: loaded.attempt ?? newAttempt(scenario), message: loaded.warning ?? '' },
          ];
        }),
      ),
  );
  const latest = useRef(entries);
  const writeEntry = (id: string, entry: Entry) => {
    const next = new Map(latest.current);
    next.set(id, entry);
    latest.current = next;
    setEntries(next);
  };
  const persist = (attempt: ScenarioAttempt) => {
    try {
      repository.save(attempt);
      writeEntry(attempt.scenarioId, { attempt, message: '' });
      return true;
    } catch {
      writeEntry(attempt.scenarioId, {
        attempt,
        message:
          'Не удалось сохранить прогресс в браузере. Можно продолжить здесь; после закрытия или перезагрузки страницы новые ответы могут потеряться.',
      });
      return false;
    }
  };
  const value: ContextValue = {
    entries,
    submit(scenario, attemptId, nodeId, answerId) {
      const entry = latest.current.get(scenario.definition.metadata.id);
      if (!entry || entry.attempt.id !== attemptId)
        throw new Error('Попытка изменилась. Выберите ответ ещё раз.');
      // Synchronous ref prevents two clicks in one render from applying two transitions.
      const now = new Date(Math.max(Date.now(), Date.parse(entry.attempt.updatedAt))).toISOString();
      const next = answerQuestion(scenario, entry.attempt, nodeId, answerId, now);
      persist(next);
      return next;
    },
    restart(scenario) {
      if (!scenario.definition.settings.allowRestart) return;
      persist(newAttempt(scenario));
    },
    save(scenarioId) {
      const entry = latest.current.get(scenarioId);
      return entry ? persist(entry.attempt) : false;
    },
    loadFeedback: repository.loadFeedback,
    saveFeedback(scenarioId, input) {
      const attempt = latest.current.get(scenarioId)?.attempt;
      if (!attempt || attempt.status !== 'completed')
        throw new Error('Сначала завершите тренировку');
      repository.saveFeedback(scenarioId, {
        attemptId: attempt.id,
        ...input,
        createdAt: new Date().toISOString(),
      });
    },
  };
  return <NegotiationContext.Provider value={value}>{children}</NegotiationContext.Provider>;
}

export function useNegotiation() {
  const context = useContext(NegotiationContext);
  if (!context) throw new Error('NegotiationProvider is required');
  return context;
}
