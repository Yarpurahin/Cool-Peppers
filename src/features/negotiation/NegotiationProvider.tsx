import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, errorMessage } from '../../api/client.ts';
import { useCatalog } from '../../app/DataProvider.tsx';
import type { AttemptDetail } from '../../types/api.ts';
import { compileScenario } from './model/engine.ts';
import type { CompiledScenario } from './model/engine.ts';
import type { Feedback, ScenarioAttempt } from './model/types.ts';

interface Entry extends AttemptDetail {
  scenario: CompiledScenario;
}
interface ContextValue {
  entries: ReadonlyMap<string, Entry>;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  ensure: (id: string, refresh?: boolean) => Promise<Entry>;
  submit: (id: string, nodeId: string, answerId: string) => Promise<ScenarioAttempt>;
  restart: (id: string) => Promise<void>;
  saveFeedback: (
    attemptId: string,
    input: { helpful: boolean; comment: string },
  ) => Promise<Feedback>;
}
const Context = createContext<ContextValue | null>(null);
const entry = (value: AttemptDetail): Entry => ({
  ...value,
  scenario: compileScenario(value.definition),
});

export function NegotiationProvider({ children }: { children: ReactNode }) {
  const { user } = useCatalog();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(new Map());
  const latest = useRef(entries);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');
  const pending = useRef(new Map<string, Promise<Entry>>());
  const write = (value: AttemptDetail) => {
    const nextEntry = entry(value);
    const next = new Map(latest.current);
    next.set(value.attempt.scenarioId, nextEntry);
    latest.current = next;
    setEntries(next);
    return nextEntry;
  };
  const reload = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const values = await api<AttemptDetail[]>('/attempts/current');
      const next = new Map(values.map((v) => [v.attempt.scenarioId, entry(v)]));
      latest.current = next;
      setEntries(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    if (user)
      api<AttemptDetail[]>('/attempts/current')
        .then((values) => {
          if (cancelled) return;
          const next = new Map(values.map((v) => [v.attempt.scenarioId, entry(v)]));
          for (const [id, value] of latest.current) next.set(id, value);
          latest.current = next;
          setEntries(next);
        })
        .catch((cause) => {
          if (!cancelled) setError(errorMessage(cause));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  return (
    <Context.Provider
      value={{
        entries,
        loading,
        error,
        reload,
        ensure: async (id, refresh = false) => {
          const existing = latest.current.get(id);
          if (existing && !refresh) return existing;
          const running = pending.current.get(id);
          if (running) return running;
          const promise = api<AttemptDetail>(`/scenarios/${encodeURIComponent(id)}/attempts`, {
            method: 'POST',
          })
            .then(write)
            .finally(() => pending.current.delete(id));
          pending.current.set(id, promise);
          return promise;
        },
        submit: async (id, nodeId, answerId) => {
          const current = latest.current.get(id);
          if (!current) throw new Error('Попытка не загружена');
          const saved = await api<AttemptDetail>(`/attempts/${current.attempt.id}/answers`, {
            method: 'POST',
            body: { nodeId, answerId, expectedAnswers: current.attempt.history.length },
          });
          return write(saved).attempt;
        },
        restart: async (id) => {
          const current = latest.current.get(id);
          const saved = await api<AttemptDetail>(`/scenarios/${encodeURIComponent(id)}/attempts`, {
            method: 'POST',
            body: { restart: true, expectedAttemptId: current?.attempt.id },
          });
          write(saved);
        },
        saveFeedback: async (attemptId, input) => {
          const saved = await api<Feedback>(`/attempts/${attemptId}/feedback`, {
            method: 'PUT',
            body: input,
          });
          const current = [...latest.current.values()].find((v) => v.attempt.id === attemptId);
          if (current) write({ ...current, feedback: saved });
          return saved;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useNegotiation() {
  const value = useContext(Context);
  if (!value) throw new Error('NegotiationProvider is required');
  return value;
}
