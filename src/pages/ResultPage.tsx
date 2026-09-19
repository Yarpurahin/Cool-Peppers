import { useNavigate, useParams } from 'react-router-dom';
import { findScenario } from '../data/scenarios.ts';
import { ButtonLink } from '../components/ui/Button.tsx';
import { findNegotiation } from '../features/negotiation/data/registry.ts';
import { useNegotiation } from '../features/negotiation/NegotiationProvider.tsx';
import { toResultView } from '../features/negotiation/presentation.ts';
import type { CompiledScenario } from '../features/negotiation/model/engine.ts';
import { ResultView } from '../features/negotiation/ui/ResultView.tsx';
import { FeedbackForm } from '../features/negotiation/ui/FeedbackForm.tsx';
import { DemoResultPage } from '../features/negotiation/ui/DemoResultPage.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function ResultPage() {
  const { scenarioId } = useParams();
  const scenario = findNegotiation(scenarioId);
  if (scenario) return <ActiveResult scenario={scenario} key={scenarioId} />;
  return findScenario(scenarioId) ? <DemoResultPage /> : <ErrorPage />;
}

function ActiveResult({ scenario }: { scenario: CompiledScenario }) {
  const { entries, restart, saveFeedback, loadFeedback } = useNegotiation();
  const scenarioId = scenario.definition.metadata.id;
  const { attempt, message } = entries.get(scenarioId)!;
  const navigate = useNavigate();
  if (attempt.status !== 'completed')
    return (
      <div className="container page negotiation-empty">
        <h1>Результата пока нет</h1>
        <p>
          {attempt.history.length
            ? 'Продолжите сохранённый разговор, чтобы получить разбор.'
            : 'Пройдите тренировку, чтобы увидеть разбор своих решений.'}
        </p>
        {message && (
          <p className="negotiation-notice" role="status">
            {message}
          </p>
        )}
        <ButtonLink to={`/scenarios/${scenarioId}/play`}>
          {attempt.history.length ? 'Продолжить переговоры' : 'Начать переговоры'}
        </ButtonLink>
      </div>
    );
  return (
    <ResultView
      model={toResultView(scenario, attempt)}
      onRestart={
        scenario.definition.settings.allowRestart
          ? () => {
              restart(scenario);
              navigate(`/scenarios/${scenarioId}/play`);
            }
          : undefined
      }
      notice={
        message ? (
          <p className="negotiation-notice" role="status">
            {message}
          </p>
        ) : undefined
      }
      feedback={
        scenario.definition.settings.collectFeedback ? (
          <FeedbackForm
            key={attempt.id}
            initial={loadFeedback(scenarioId, attempt.id)}
            caption="Отзыв сохранится в этом браузере"
            onSubmit={(input) => {
              saveFeedback(scenarioId, input);
              return 'Спасибо! Отзыв сохранён в этом браузере.';
            }}
          />
        ) : undefined
      }
    />
  );
}
