import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, errorMessage } from '../../api/client.ts';
import { useCatalog } from '../../app/DataProvider.tsx';
import type { GamificationSummary, ScenarioMastery } from '../../types/api.ts';

interface GamificationContextValue {
  summary: GamificationSummary | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  masteryFor: (scenarioId: string) => ScenarioMastery | undefined;
}

const Context = createContext<GamificationContextValue | null>(null);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const { user } = useCatalog();
  const [summary, setSummary] = useState<GamificationSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) {
      setSummary(null);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setSummary(await api<GamificationSummary>('/me/gamification'));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mastery = useMemo(
    () => new Map(summary?.mastery.map((item) => [item.scenarioId, item]) ?? []),
    [summary],
  );

  return (
    <Context.Provider
      value={{
        summary,
        loading,
        error,
        refresh,
        masteryFor: (scenarioId) => mastery.get(scenarioId),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useGamification() {
  const value = useContext(Context);
  if (!value) throw new Error('GamificationProvider is required');
  return value;
}
