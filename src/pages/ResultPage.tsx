import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { findScenario } from '../data/scenarios.ts';
import type { Scenario } from '../types/scenario.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { DemoNotice } from '../components/ui/DemoNotice.tsx';
import { useDemoMessage } from '../app/DemoProvider.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function ResultPage() {
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  return scenario ? <ResultScreen scenario={scenario} key={scenario.id} /> : <ErrorPage />;
}

function ResultScreen({ scenario }: { scenario: Scenario }) {
  const [helpful, setHelpful] = useState<string | null>(null);
  const show = useDemoMessage();
  return (
    <div className="container page result-page">
      <Link to="/scenarios" className="back-link">
        <Icon name="back" size={16} />К сценариям
      </Link>
      <DemoNotice>
        Пример обратной связи. Этот разбор и баллы подготовлены заранее и не оценивают ваши
        действия.
      </DemoNotice>
      <section className="result-hero">
        <div>
          <p className="eyebrow">
            <Icon name="check" size={17} />
            Пример результата
          </p>
          <h1>{scenario.example.outcome}</h1>
          <p>
            {scenario.title}
            <span> · </span>
            {scenario.skill}
          </p>
        </div>
        <div
          className="score-circle"
          style={{ '--score': `${scenario.example.score}%` } as CSSProperties}
        >
          <div>
            <strong>{scenario.example.score}</strong>
            <span>из 100 · пример</span>
          </div>
        </div>
      </section>
      <div className="result-grid">
        <div className="result-content">
          <section className="panel next-step">
            <Icon name="flag" size={23} />
            <div>
              <h2>Следующий шаг в примере</h2>
              <p>{scenario.example.nextStep}</p>
            </div>
          </section>
          <section className="panel review-panel">
            <p className="eyebrow">Замечать. Пробовать. Договариваться.</p>
            <h2>Разбор решений</h2>
            {scenario.example.observations.map((item, index) => (
              <article className="review-item" key={item.title}>
                <span className="review-number">0{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <blockquote>«{item.quote}»</blockquote>
                </div>
              </article>
            ))}
          </section>
          <div className="button-row">
            <ButtonLink to={`/scenarios/${scenario.id}/play`}>
              <Icon name="reset" size={18} />К примеру диалога
            </ButtonLink>
            <ButtonLink to="/scenarios" variant="outline">
              Другие сценарии <Icon name="arrow" size={18} />
            </ButtonLink>
          </div>
        </div>
        <aside className="panel feedback-panel">
          <p className="eyebrow">Ваша обратная связь</p>
          <h2>Полезная практика?</h2>
          <p>Каким вам кажется этот пример разбора?</p>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              show(
                'Отправка отзыва пока недоступна',
                'Ваш отзыв никуда не отправлен. Форма показана для знакомства с интерфейсом.',
              );
            }}
          >
            <fieldset className="feedback-options">
              <legend className="sr-only">Полезен ли пример?</legend>
              {['Да', 'Не совсем'].map((value) => (
                <label className={helpful === value ? 'is-selected' : ''} key={value}>
                  <input
                    type="radio"
                    name="helpful"
                    value={value}
                    checked={helpful === value}
                    onChange={() => setHelpful(value)}
                  />
                  {value}
                </label>
              ))}
            </fieldset>
            <label className="field">
              Что можно улучшить?
              <textarea
                name="feedback"
                rows={5}
                placeholder="Поделитесь впечатлением"
                maxLength={2000}
              />
            </label>
            <Button type="submit" variant="secondary" className="button--full">
              Отправить отзыв <Icon name="arrow" size={17} />
            </Button>
            <p className="subtle-caption">Демонстрационная форма</p>
          </form>
        </aside>
      </div>
    </div>
  );
}
