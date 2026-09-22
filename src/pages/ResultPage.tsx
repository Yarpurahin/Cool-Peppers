import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RequireAuth, useCatalog } from '../app/DataProvider.tsx';
import { errorMessage } from '../api/client.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { useNegotiation } from '../features/negotiation/NegotiationProvider.tsx';
import { toResultView } from '../features/negotiation/presentation.ts';
import { ResultView } from '../features/negotiation/ui/ResultView.tsx';
import { FeedbackForm } from '../features/negotiation/ui/FeedbackForm.tsx';
import { DemoResultPage } from '../features/negotiation/ui/DemoResultPage.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function ResultPage() {
  const { scenarioId } = useParams();
  const { findNegotiation, findScenario } = useCatalog();
  if (findNegotiation(scenarioId))
    return (
      <RequireAuth>
        <ActiveResult id={scenarioId!} key={scenarioId} />
      </RequireAuth>
    );
  return findScenario(scenarioId) ? <DemoResultPage /> : <ErrorPage />;
}
function ActiveResult({ id }: { id: string }) {
  const { entries, restart, saveFeedback, loading, error: loadError, reload } = useNegotiation();
  const value = entries.get(id);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading || loadError)
    return (
      <div className="container page">
        <p role="status">{loadError || 'Загружаем результат…'}</p>
        {loadError && <Button onClick={() => void reload()}>Повторить</Button>}
      </div>
    );
  if (!value || value.attempt.status !== 'completed')
    return (
      <div className="container page negotiation-empty">
        <h1>Результата пока нет</h1>
        <p>Пройдите тренировку, чтобы увидеть разбор своих решений.</p>
        <ButtonLink to={`/scenarios/${id}/play`}>
          {value?.attempt.history.length ? 'Продолжить переговоры' : 'Начать переговоры'}
        </ButtonLink>
      </div>
    );
  const { scenario, attempt, feedback } = value;
  return (
    <ResultView
      model={toResultView(scenario, attempt)}
      onRestart={
        scenario.definition.settings.allowRestart && !busy
          ? () => {
              setBusy(true);
              setError('');
              void restart(id)
                .then(() => navigate(`/scenarios/${id}/play`))
                .catch((cause) => setError(errorMessage(cause)))
                .finally(() => setBusy(false));
            }
          : undefined
      }
      notice={error ? <p role="alert">{error}</p> : undefined}
      feedback={
        scenario.definition.settings.collectFeedback ? (
          <FeedbackForm
            key={attempt.id}
            initial={feedback}
            caption="Отзыв сохранится в вашем аккаунте"
            onSubmit={async (input) => {
              await saveFeedback(attempt.id, input);
              return 'Спасибо! Отзыв сохранён.';
            }}
          />
        ) : undefined
      }
    />
  );
}
