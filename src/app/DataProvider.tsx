import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import type { ScenarioDocument, User } from '../types/api.ts';
import { compileScenario } from '../features/negotiation/model/engine.ts';
import type { CompiledScenario } from '../features/negotiation/model/engine.ts';
import type { ScenarioPreview } from '../types/scenario.ts';
import { Button } from '../components/ui/Button.tsx';

interface DataContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  scenarios: ScenarioPreview[];
  findScenario: (id: string | undefined) => ScenarioPreview | undefined;
  findNegotiation: (id: string | undefined) => CompiledScenario | undefined;
  refreshCatalog: () => Promise<void>;
  logout: () => Promise<void>;
}
const DataContext = createContext<DataContextValue | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<ScenarioDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      api<User | null>('/auth/me', { signal: controller.signal }),
      api<ScenarioDocument[]>('/scenarios', { signal: controller.signal }),
    ])
      .then(([account, docs]) => {
        if (!controller.signal.aborted) {
          setUser(account);
          setDocuments(docs);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  const refreshCatalog = useCallback(async () => {
    setDocuments(await api<ScenarioDocument[]>('/scenarios'));
  }, []);
  const scenarios = useMemo(() => documents.map((d) => d.preview), [documents]);
  const compiled = useMemo(
    () => documents.flatMap((d) => (d.definition ? [compileScenario(d.definition)] : [])),
    [documents],
  );
  if (loading || error)
    return (
      <main className="container page negotiation-empty">
        <h1>Арена переговоров</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Загружаем сценарии…'}</p>
        {error && <Button onClick={() => setRetry((n) => n + 1)}>Повторить</Button>}
      </main>
    );
  return (
    <DataContext.Provider
      value={{
        user,
        setUser,
        scenarios,
        refreshCatalog,
        findScenario: (id) => scenarios.find((s) => s.id === id),
        findNegotiation: (id) => compiled.find((s) => s.definition.metadata.id === id),
        logout: async () => {
          await api('/auth/logout', { method: 'POST' });
          setUser(null);
        },
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
export function useCatalog() {
  const value = useContext(DataContext);
  if (!value) throw new Error('DataProvider is required');
  return value;
}
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useCatalog();
  const location = useLocation();
  return user ? (
    children
  ) : (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useCatalog();
  const location = useLocation();
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return user.role === 'admin' ? children : <Navigate to="/profile" replace />;
}
