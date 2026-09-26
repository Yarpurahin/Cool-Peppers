import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api/client.ts';
import type { ScenarioDocument, User } from '../types/api.ts';
import { compileScenario } from '../features/negotiation/model/engine.ts';
import type { CompiledScenario } from '../features/negotiation/model/engine.ts';
import type { ScenarioPreview } from '../types/scenario.ts';
import { RequestFailure } from '../components/ui/RequestFailure.tsx';

type LoadStatus = 'loading' | 'ready' | 'error';
interface DataContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  authStatus: LoadStatus;
  catalogStatus: LoadStatus;
  authError: unknown;
  catalogError: unknown;
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
  const [authStatus, setAuthStatus] = useState<LoadStatus>('loading');
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>('loading');
  const [authError, setAuthError] = useState<unknown>(null);
  const [catalogError, setCatalogError] = useState<unknown>(null);
  const acceptCatalog = useCallback((docs: ScenarioDocument[]) => {
    if (!Array.isArray(docs)) throw new ApiError(500, 'Некорректный ответ сервера');
    for (const doc of docs) if (doc.definition) compileScenario(doc.definition);
    setDocuments(docs);
    setCatalogStatus('ready');
    setCatalogError(null);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // A failed catalog must not unmount all pages, forms and error screens.
    const load = () => {
      void api<User | null>('/auth/me', { signal: controller.signal })
        .then((account) => {
          if (controller.signal.aborted) return;
          setUser(account);
          setAuthStatus('ready');
          setAuthError(null);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setAuthStatus('error');
            setAuthError(cause);
          }
        });
      void api<ScenarioDocument[]>('/scenarios', { signal: controller.signal })
        .then((docs) => {
          if (!controller.signal.aborted) acceptCatalog(docs);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setCatalogStatus('error');
            setCatalogError(cause);
          }
        });
    };
    load();
    window.addEventListener('online', load);
    return () => {
      controller.abort();
      window.removeEventListener('online', load);
    };
  }, [acceptCatalog]);
  const refreshCatalog = useCallback(async () => {
    try {
      acceptCatalog(await api<ScenarioDocument[]>('/scenarios'));
    } catch (cause) {
      setCatalogStatus('error');
      setCatalogError(cause);
      throw cause;
    }
  }, [acceptCatalog]);
  const scenarios = useMemo(() => documents.map((d) => d.preview), [documents]);
  const compiled = useMemo(
    () => documents.flatMap((d) => (d.definition ? [compileScenario(d.definition)] : [])),
    [documents],
  );
  return (
    <DataContext.Provider
      value={{
        user,
        setUser: (account) => {
          setUser(account);
          setAuthStatus('ready');
          setAuthError(null);
        },
        authStatus,
        catalogStatus,
        authError,
        catalogError,
        scenarios,
        refreshCatalog,
        findScenario: (id) => scenarios.find((s) => s.id === id),
        findNegotiation: (id) => compiled.find((s) => s.definition.metadata.id === id),
        logout: async () => {
          await api('/auth/logout', { method: 'POST' });
          setUser(null);
          setAuthStatus('ready');
          setAuthError(null);
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
  const { user, authStatus, authError } = useCatalog();
  const location = useLocation();
  if (user) return children;
  if (authStatus === 'loading')
    return (
      <main className="container page" role="status">
        Проверяем вход…
      </main>
    );
  if (authStatus === 'error') return <RequestFailure error={authError} />;
  return (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useCatalog();
  return (
    <RequireAuth>
      {user?.role === 'admin' ? children : <Navigate to="/profile" replace />}
    </RequireAuth>
  );
}
