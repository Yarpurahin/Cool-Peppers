import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findScenario } from '../data/scenarios.ts';
import type { Scenario } from '../types/scenario.ts';
import { Icon } from '../components/ui/Icon.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { DemoNotice } from '../components/ui/DemoNotice.tsx';
import { useDemoMessage } from '../app/DemoProvider.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function PlayPage() {
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  return scenario ? <PlayScreen scenario={scenario} key={scenario.id} /> : <ErrorPage />;
}

function PlayScreen({ scenario }: { scenario: Scenario }) {
  const [selected, setSelected] = useState<number | null>(null);
  const show = useDemoMessage();
  const first = scenario.dialogue[0];
  return (
    <div className="container page play-page">
      <div className="section-heading">
        <div>
          <Link to={`/scenarios/${scenario.id}`} className="back-link">
            <Icon name="back" size={16} />К сценарию
          </Link>
          <h1>{scenario.title}</h1>
          <p>{first.title}</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            show(
              'Сохранение появится позже',
              'Переговоры ещё не запущены. Сохранять пока нечего. Для выхода используйте ссылку «К сценарию».',
            )
          }
        >
          <Icon name="save" size={17} />
          Сохранить и выйти
        </Button>
      </div>
      <DemoNotice>
        Демонстрация диалога. Реплики можно выбирать, но прохождение и оценка пока не подключены.
      </DemoNotice>
      <div className="play-grid">
        <section className="panel dialogue-panel">
          <div className="dialogue-header">
            <span className="avatar">{scenario.person.initials}</span>
            <div>
              <strong>{scenario.person.name}</strong>
              <p>{scenario.person.role}</p>
            </div>
            <span className="badge">Пример · шаг 1</span>
          </div>
          <div className="dialogue-message">
            <span>{scenario.person.name}</span>
            <p>{first.speech}</p>
          </div>
          <fieldset className="answer-list">
            <legend>Как вы ответите?</legend>
            <p className="muted answer-help">Выберите одну реплику</p>
            {first.answers.map((answer, index) => (
              <label
                className={`answer-option ${selected === index ? 'is-selected' : ''}`}
                key={answer.text}
              >
                <input
                  type="radio"
                  name="answer"
                  value={index}
                  checked={selected === index}
                  onChange={() => setSelected(index)}
                />
                <span className="answer-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{answer.text}</span>
                <span className="answer-check">
                  <Icon name="check" size={16} />
                </span>
              </label>
            ))}
          </fieldset>
          <div className="dialogue-submit">
            <p>Выбор ответа не меняет сценарий.</p>
            <Button
              disabled={selected === null}
              onClick={() =>
                show(
                  'Ответ не отправлен',
                  'Это макет экрана. Продолжение диалога и реакция собеседника появятся после подключения логики сценария.',
                )
              }
            >
              Ответить <Icon name="arrow" size={18} />
            </Button>
          </div>
        </section>
        <aside className="play-aside">
          <section className="panel">
            <span className="icon-tile">
              <Icon name="target" />
            </span>
            <h2>Ваша цель</h2>
            <p>{scenario.goal}</p>
            <hr />
            <p className="eyebrow">Ваша роль</p>
            <strong>{scenario.role}</strong>
          </section>
          <div className="result-preview-link">
            <Icon name="chart" size={22} />
            <h3>После разговора — разбор</h3>
            <p>Посмотрите, как будет выглядеть обратная связь.</p>
            <ButtonLink to={`/scenarios/${scenario.id}/result`} variant="outline">
              Пример разбора <Icon name="upRight" size={17} />
            </ButtonLink>
          </div>
        </aside>
      </div>
    </div>
  );
}
