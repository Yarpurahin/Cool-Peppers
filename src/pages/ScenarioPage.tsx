import { useRef, useState } from 'react';
import { api, actionErrorMessage } from '../api/client.ts';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useCatalog } from '../app/DataProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { ScenarioArt } from '../components/scenarios/ScenarioArt.tsx';
import { ScenarioMeta } from '../components/scenarios/ScenarioMeta.tsx';
import { useNegotiation } from '../features/negotiation/NegotiationProvider.tsx';
import { ErrorPage } from './ErrorPage.tsx';
import { useGamification } from '../features/gamification/GamificationProvider.tsx';
import { MasteryStars } from '../features/gamification/MasteryStars.tsx';

export function ScenarioPage() {
  const { findScenario, findNegotiation, user } = useCatalog();
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  const negotiation = findNegotiation(scenarioId);
  const { entries, ensure } = useNegotiation();
  const { masteryFor } = useGamification();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = entries.get(scenarioId ?? '')?.attempt;
  const completed = attempt?.status === 'completed';
  const canResume = attempt?.status === 'in-progress' && attempt.history.length > 0;
  const mastery = masteryFor(scenarioId ?? '');
  if (!scenario || !negotiation) return <ErrorPage />;
  return (
    <div className="container page scenario-page">
      <Link to="/scenarios" className="back-link">
        <Icon name="back" size={16} />
        Все сценарии
      </Link>
      <div className="scenario-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" />
            {scenario.category}
          </p>
          <h1>{scenario.title}</h1>
          <ScenarioMeta scenario={scenario} />
          {mastery && (
            <div className="scenario-page-mastery">
              <span>Ваш лучший результат</span>
              <MasteryStars value={mastery.bestStars} />
              <small>{mastery.completedAttempts} прохожд.</small>
            </div>
          )}
        </div>
        <div className={`heading-art cover--${scenario.art}`}>
          <ScenarioArt kind={scenario.art} image={scenario.coverImage} />
        </div>
      </div>
      <div className="preview-grid">
        <div className="preview-content">
          <section className="panel context-panel">
            <h2>Представьте ситуацию</h2>
            <p>{scenario.context}</p>
            <div className="task-box">
              <Icon name="target" size={24} />
              <div>
                <h3>Ваша задача</h3>
                <p>{scenario.goal}</p>
              </div>
            </div>
            <hr />
            <h2>Как пройдёт разговор</h2>
            <p>
              Выбирайте реплики и подтверждайте ответ. Ваш выбор меняет ход разговора. После
              завершения вы получите разбор своих решений. Прогресс сохраняется в вашем аккаунте.
            </p>
            {negotiation && Boolean(negotiation.definition.settings.failureRule) && (
              <p className="negotiation-rules">
                {negotiation.definition.settings.assessmentNote} Порог провала —{' '}
                {negotiation.failureThreshold} штрафных баллов: половина всех{' '}
                {negotiation.totalQuestions} вопросов с округлением вверх.
              </p>
            )}
          </section>
          <section className="tip-box">
            <Icon name="bulb" size={24} />
            <div>
              <h3>Совет перед началом</h3>
              <p>{scenario.tip}</p>
            </div>
          </section>
        </div>
        <aside className="panel counterpart-card">
          <p className="eyebrow">Ваш собеседник</p>
          <div className={`counterpart-portrait cover--${scenario.art}`}>
            <span className="portrait-orbit" />
            <span className="avatar portrait-avatar">{scenario.person.initials}</span>
            <span className="portrait-bubble">
              <Icon name="message" size={30} />
            </span>
            <span className="portrait-label">ДРУГАЯ СТОРОНА ДИАЛОГА</span>
          </div>
          <h2>{scenario.person.name}</h2>
          <p className="person-role">{scenario.person.role}</p>
          <p>{scenario.person.character}</p>
          <blockquote>«{scenario.person.quote}»</blockquote>
          <div className="counterpart-bottom">
            <p className="eyebrow">Ваша роль</p>
            <strong>{scenario.role}</strong>
            <Button
              disabled={busy}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError('');
                try {
                  if (!user) {
                    await api('/health');
                    navigate(`/login?next=${encodeURIComponent(`/scenarios/${scenario.id}/play`)}`);
                  } else {
                    const value = await ensure(scenario.id, true);
                    navigate(
                      `/scenarios/${scenario.id}/${value.attempt.status === 'completed' ? 'result' : 'play'}`,
                    );
                  }
                } catch (cause) {
                  setError(actionErrorMessage(cause));
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
              className="button--full"
            >
              {negotiation
                ? completed
                  ? 'Посмотреть результат'
                  : canResume
                    ? 'Продолжить переговоры'
                    : 'Начать переговоры'
                : 'Открыть диалог'}{' '}
              <Icon name="arrow" size={18} />
            </Button>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <p className="subtle-caption">
              {negotiation ? 'Можно сделать паузу и вернуться' : 'Демонстрация экрана переговоров'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
