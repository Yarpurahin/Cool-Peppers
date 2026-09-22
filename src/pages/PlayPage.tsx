import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RequireAuth, useCatalog } from '../app/DataProvider.tsx';
import { errorMessage, ApiError } from '../api/client.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { useNegotiation } from '../features/negotiation/NegotiationProvider.tsx';
import { toPlayView } from '../features/negotiation/presentation.ts';
import { PlayView } from '../features/negotiation/ui/PlayView.tsx';
import { DemoPlayPage } from '../features/negotiation/ui/DemoPlayPage.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function PlayPage() {
  const { scenarioId } = useParams();
  const { findNegotiation, findScenario } = useCatalog();
  if (findNegotiation(scenarioId))
    return (
      <RequireAuth>
        <ActivePlay id={scenarioId!} key={scenarioId} />
      </RequireAuth>
    );
  return findScenario(scenarioId) ? <DemoPlayPage /> : <ErrorPage />;
}
function ActivePlay({ id }: { id: string }) {
  const { entries, ensure, submit, restart, loading, error: loadError, reload } = useNegotiation();
  const value = entries.get(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || value || loadError) return;
    let active = true;
    void ensure(id).catch((cause) => {
      if (active) setError(errorMessage(cause));
    });
    return () => {
      active = false;
    };
  }, [id, loading, Boolean(value), loadError]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) {
        await reload();
        setSelected(null);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!value)
    return (
      <div className="container page negotiation-empty">
        <h1>Подготовка тренировки</h1>
        <p role="status">{error || loadError || 'Загружаем сохранённый прогресс…'}</p>
        {(error || loadError) && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await reload();
                await ensure(id);
              })
            }
          >
            Повторить
          </Button>
        )}
      </div>
    );
  const { attempt, scenario } = value;
  if (attempt.status === 'completed')
    return (
      <div className="container page negotiation-empty">
        <h1>Эта тренировка уже завершена</h1>
        <p>Посмотрите разбор или попробуйте другой путь в новой попытке.</p>
        {error && <p role="alert">{error}</p>}
        <div className="button-row">
          <ButtonLink to={`/scenarios/${id}/result`}>Посмотреть результат</ButtonLink>
          {scenario.definition.settings.allowRestart && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void run(async () => {
                  await restart(id);
                  setSelected(null);
                })
              }
            >
              Начать заново
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <PlayView
      model={toPlayView(scenario, attempt)}
      selectedId={selected}
      busy={busy}
      onSelect={(answerId) => {
        setSelected(answerId);
        setError('');
      }}
      message={error}
      onSaveExit={() => {
        if (!busy) navigate(`/scenarios/${id}`);
      }}
      onAnswer={() =>
        void run(async () => {
          if (!selected) return;
          const next = await submit(id, attempt.currentNodeId, selected);
          setSelected(null);
          if (next.status === 'completed') navigate(`/scenarios/${id}/result`);
        })
      }
    />
  );
}
