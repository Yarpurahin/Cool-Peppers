import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { findScenario } from '../data/scenarios.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { findNegotiation } from '../features/negotiation/data/registry.ts';
import { useNegotiation } from '../features/negotiation/NegotiationProvider.tsx';
import { toPlayView } from '../features/negotiation/presentation.ts';
import type { CompiledScenario } from '../features/negotiation/model/engine.ts';
import { PlayView } from '../features/negotiation/ui/PlayView.tsx';
import { DemoPlayPage } from '../features/negotiation/ui/DemoPlayPage.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function PlayPage() {
  const { scenarioId } = useParams();
  const scenario = findNegotiation(scenarioId);
  if (scenario) return <ActivePlay scenario={scenario} key={scenarioId} />;
  return findScenario(scenarioId) ? <DemoPlayPage /> : <ErrorPage />;
}

function ActivePlay({ scenario }: { scenario: CompiledScenario }) {
  const { entries, submit, restart, save } = useNegotiation();
  const scenarioId = scenario.definition.metadata.id;
  const { attempt, message } = entries.get(scenarioId)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  if (attempt.status === 'completed')
    return (
      <div className="container page negotiation-empty">
        <h1>Эта тренировка уже завершена</h1>
        <p>Посмотрите разбор или попробуйте другой путь в новой попытке.</p>
        {message && (
          <p className="negotiation-notice" role="status">
            {message}
          </p>
        )}
        <div className="button-row">
          <ButtonLink to={`/scenarios/${scenarioId}/result`}>Посмотреть результат</ButtonLink>
          {scenario.definition.settings.allowRestart && (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setError('');
                restart(scenario);
              }}
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
      onSelect={(id) => {
        setSelected(id);
        setError('');
      }}
      message={error || message}
      onSaveExit={() => {
        if (save(scenarioId)) navigate(`/scenarios/${scenarioId}`);
      }}
      onAnswer={() => {
        if (selected === null) return;
        try {
          const next = submit(scenario, attempt.id, attempt.currentNodeId, selected);
          setSelected(null);
          setError('');
          if (next.status === 'completed') navigate(`/scenarios/${scenarioId}/result`);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Не удалось подтвердить ответ.');
        }
      }}
    />
  );
}
