import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button.tsx';
import { Icon } from '../../../components/ui/Icon.tsx';
import type { PlayViewModel } from './types.ts';

interface Props {
  busy?: boolean;
  model: PlayViewModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAnswer: () => void;
  onSaveExit: () => void;
  notice?: ReactNode;
  footer?: ReactNode;
  message?: string;
}

export function PlayView({
  busy = false,
  model,
  selectedId,
  onSelect,
  onAnswer,
  onSaveExit,
  notice,
  footer,
  message,
}: Props) {
  return (
    <div className="container page play-page negotiation-play">
      <div className="section-heading">
        <div>
          <Link to={`/scenarios/${model.scenarioId}`} className="back-link">
            <Icon name="back" size={16} />К сценарию
          </Link>
          <h1>{model.title}</h1>
          <p>{model.question.title}</p>
        </div>
        <Button variant="outline" onClick={onSaveExit} disabled={busy}>
          <Icon name="save" size={17} />
          Сохранить и выйти
        </Button>
      </div>
      {notice}
      {message && (
        <p className="negotiation-notice" role="status">
          {message}
        </p>
      )}
      <div className="play-grid">
        <section className="panel dialogue-panel" aria-label="Переговоры">
          <div className="dialogue-header">
            <span className="avatar" aria-hidden="true">
              {model.character.initials}
            </span>
            <div>
              <strong>{model.character.name}</strong>
              <p>{model.character.role}</p>
            </div>
            <span className="badge">Шаг {model.step}</span>
          </div>
          {model.history.length > 0 && (
            <details className="dialogue-history">
              <summary>История разговора · {model.history.length}</summary>
              <ol>
                {model.history.map((item) => (
                  <li key={item.id}>
                    <p>{item.question}</p>
                    <blockquote>
                      <strong>Вы:</strong> {item.answer}
                    </blockquote>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <div
            className="dialogue-message"
            aria-live="polite"
            aria-label={`Реплика: ${model.character.name}`}
          >
            <span>{model.character.name}</span>
            <p>{model.question.text}</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedId !== null) onAnswer();
            }}
          >
            <fieldset className="answer-list" disabled={busy}>
              <legend>Как вы ответите?</legend>
              <p className="muted answer-help">Выберите одну реплику</p>
              {model.answers.map((answer, index) => (
                <label
                  className={`answer-option ${selectedId === answer.id ? 'is-selected' : ''}`}
                  key={answer.id}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={answer.id}
                    checked={selectedId === answer.id}
                    onChange={() => onSelect(answer.id)}
                  />
                  <span className="answer-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{answer.text}</span>
                  <span className="answer-check" aria-hidden="true">
                    <Icon name="check" size={16} />
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="dialogue-submit">
              <p>Реплика станет частью диалога после подтверждения.</p>
              <Button type="submit" disabled={selectedId === null || busy}>
                Ответить <Icon name="arrow" size={18} />
              </Button>
            </div>
          </form>
        </section>
        <aside className="play-aside">
          <section className="panel negotiation-goal">
            <h2>
              <Icon name="target" size={20} />
              Ваша цель
            </h2>
            <p>{model.goal}</p>
            <p className="eyebrow">Ваша роль</p>
            <strong>{model.role}</strong>
          </section>
          {model.stages.length > 0 && (
            <section className="panel negotiation-stages">
              <h2>По ходу разговора</h2>
              <ol>
                {model.stages.map((stage, index) => (
                  <li
                    key={stage.id}
                    className={`stage--${stage.state}`}
                    aria-current={stage.state === 'current' ? 'step' : undefined}
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    {stage.title}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="negotiation-tip">
            <Icon name="bulb" size={20} />
            <div>
              <h3>Можно по-разному</h3>
              <p>{model.tip}</p>
            </div>
          </section>
          {footer}
        </aside>
      </div>
    </div>
  );
}
