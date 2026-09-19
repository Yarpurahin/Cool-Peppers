import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '../../../components/ui/Button.tsx';
import { Icon } from '../../../components/ui/Icon.tsx';
import type { ResultViewModel } from './types.ts';

export function ResultView({
  model,
  onRestart,
  notice,
  feedback,
}: {
  model: ResultViewModel;
  onRestart?: () => void;
  notice?: ReactNode;
  feedback?: ReactNode;
}) {
  return (
    <div className="container page result-page negotiation-result">
      <Link to="/scenarios" className="back-link">
        <Icon name="back" size={16} />К сценариям
      </Link>
      {notice}
      <section className={`result-hero result-hero--${model.outcomeType}`}>
        <div>
          <p className="eyebrow">
            <Icon name={model.outcomeType === 'failure' ? 'flag' : 'check'} size={17} />
            Тренировка завершена
          </p>
          <h1>{model.outcome}</h1>
          <p>
            {model.title}
            <span> · </span>
            {model.subtitle}
          </p>
        </div>
        <div
          className="score-circle"
          style={
            { '--score': `${Math.max(0, Math.min(100, model.metric.percent))}%` } as CSSProperties
          }
        >
          <div>
            <strong>{model.metric.value}</strong>
            <span>{model.metric.label}</span>
          </div>
        </div>
      </section>
      {model.note && <p className="negotiation-notice">{model.note}</p>}
      <div className={`result-grid ${feedback ? '' : 'result-grid--single'}`}>
        <div className="result-content">
          <section className="panel next-step">
            <Icon name="flag" size={23} />
            <div>
              <h2>Ваш следующий шаг</h2>
              <p>{model.nextStep}</p>
            </div>
          </section>
          <section className="panel review-panel">
            <h2>Разбор ваших решений</h2>
            {model.reviews.map((item, index) => (
              <article
                className={`review-item ${item.penalty > 0 ? 'review-item--penalty' : ''}`}
                key={item.id}
              >
                <span className="review-number" aria-hidden="true">
                  <Icon name={item.penalty > 0 ? 'bulb' : 'check'} size={16} />
                </span>
                <div>
                  <h3>
                    {item.title} · {index + 1}
                  </h3>
                  {item.question && (
                    <details className="review-question">
                      <summary>Вопрос собеседника</summary>
                      <p>{item.question}</p>
                    </details>
                  )}
                  <p>{item.text}</p>
                  <blockquote>«{item.quote}»</blockquote>
                  {item.penalty > 0 && (
                    <p className="review-penalty">+{item.penalty} штрафной балл</p>
                  )}
                </div>
              </article>
            ))}
          </section>
          <div className="button-row">
            {onRestart && (
              <Button onClick={onRestart}>
                <Icon name="reset" size={18} />
                Попробовать ещё раз
              </Button>
            )}
            <ButtonLink to="/scenarios" variant="outline">
              Другие сценарии <Icon name="arrow" size={18} />
            </ButtonLink>
          </div>
        </div>
        {feedback}
      </div>
    </div>
  );
}
