import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import type { AttemptDetail } from '../types/api.ts';
import { compileScenario, getReview } from '../features/negotiation/model/engine.ts';
import { toResultView } from '../features/negotiation/presentation.ts';
import { ResultView } from '../features/negotiation/ui/ResultView.tsx';
import { FeedbackForm } from '../features/negotiation/ui/FeedbackForm.tsx';
import { ButtonLink } from '../components/ui/Button.tsx';
import { useCatalog } from '../app/DataProvider.tsx';
import { RewardPanel } from '../features/gamification/RewardPanel.tsx';

export function AttemptPage() {
  const { attemptId } = useParams();
  const { findScenario } = useCatalog();
  const [data, setData] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    api<AttemptDetail>(`/attempts/${encodeURIComponent(attemptId ?? '')}`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [attemptId]);
  if (!data)
    return (
      <div className="container page">
        <p role="status">{error || 'Загружаем историю…'}</p>
        <ButtonLink to="/profile">К профилю</ButtonLink>
      </div>
    );
  const scenario = compileScenario(data.definition);
  const { attempt } = data;
  if (attempt.status !== 'completed')
    return (
      <div className="container page">
        <h1>{data.abandonedAt ? 'Попытка прервана' : 'Тренировка не завершена'}</h1>
        <p>
          {data.definition.metadata.title} · версия {attempt.scenarioVersion}
        </p>
        <ol>
          {getReview(scenario, attempt).map((row) => (
            <li key={row.node.id}>
              <p>{row.question}</p>
              <blockquote>{row.reaction.label}</blockquote>
            </li>
          ))}
        </ol>
        <div className="button-row">
          <ButtonLink to="/profile" variant="outline">
            К профилю
          </ButtonLink>
          {data.isCurrent && findScenario(attempt.scenarioId) && (
            <ButtonLink to={`/scenarios/${attempt.scenarioId}/play`}>
              Продолжить переговоры
            </ButtonLink>
          )}
        </div>
      </div>
    );
  return (
    <ResultView
      model={toResultView(scenario, attempt)}
      notice={<p>Сохранённая попытка · версия сценария {attempt.scenarioVersion}</p>}
      reward={data.reward ? <RewardPanel reward={data.reward} /> : undefined}
      feedback={
        scenario.definition.settings.collectFeedback ? (
          <FeedbackForm
            key={attempt.id}
            initial={data.feedback}
            caption="Отзыв сохранится в вашем аккаунте"
            onSubmit={async (input) => {
              await api(`/attempts/${attempt.id}/feedback`, { method: 'PUT', body: input });
            }}
          />
        ) : undefined
      }
    />
  );
}
