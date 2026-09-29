import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button.tsx';
import { Icon } from '../../../components/ui/Icon.tsx';
import type { FeedbackInput } from './types.ts';

export function FeedbackForm({
  onSubmit,
  caption = 'Отзыв необязателен',
  initial,
}: {
  /** Resolve only after persistence succeeds; reject to keep the form and its draft. */
  onSubmit: (input: FeedbackInput) => void | Promise<void>;
  caption?: string;
  initial?: FeedbackInput;
}) {
  const id = useId();
  const [helpful, setHelpful] = useState<boolean | null>(initial?.helpful ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(!!initial);
  const sending = useRef(false);
  const justSubmitted = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (submitted && justSubmitted.current) {
      justSubmitted.current = false;
      confirmation.current?.focus();
    }
  }, [submitted]);
  return (
    <aside className={`panel feedback-panel ${submitted ? 'is-submitted' : ''}`}>
      <div className="feedback-form-content" aria-hidden={submitted || undefined} inert={submitted}>
        <p className="eyebrow">Ваша обратная связь</p>
        <h2>Полезная практика?</h2>
        <p className="feedback-question">Помог ли сценарий посмотреть на разговор по-новому?</p>
        <form
          ref={form}
          className="form-stack"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (sending.current || submitted) return;
            if (helpful === null) {
              setMessage('Выберите «Да» или «Не совсем».');
              form.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
              return;
            }
            sending.current = true;
            setBusy(true);
            setMessage('');
            try {
              const input = { helpful, comment: comment.trim() };
              await onSubmit(input);
              setComment(input.comment);
              justSubmitted.current = true;
              setSubmitted(true);
            } catch (cause) {
              setMessage(
                cause instanceof Error
                  ? cause.message
                  : 'Не удалось сохранить отзыв. Попробуйте ещё раз.',
              );
            } finally {
              sending.current = false;
              setBusy(false);
            }
          }}
        >
          <fieldset className="feedback-fields form-stack" disabled={busy}>
            <legend className="sr-only">Ваш отзыв о сценарии</legend>
            <fieldset
              className="feedback-options"
              aria-describedby={message ? `${id}-error` : undefined}
            >
              <legend className="sr-only">Полезна ли практика?</legend>
              {[
                { value: true, text: 'Да' },
                { value: false, text: 'Не совсем' },
              ].map(({ value, text }) => (
                <label className={helpful === value ? 'is-selected' : ''} key={text}>
                  <input
                    type="radio"
                    name={`${id}-helpful`}
                    checked={helpful === value}
                    onChange={() => {
                      setHelpful(value);
                      setMessage('');
                    }}
                  />
                  {text}
                </label>
              ))}
            </fieldset>
            <label className="field">
              Что можно улучшить?
              <textarea
                ref={textarea}
                rows={5}
                maxLength={2000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Поделитесь впечатлением"
              />
            </label>
            <Button type="submit" disabled={busy} variant="secondary" className="button--full">
              {busy ? 'Отправляем…' : 'Отправить отзыв'} <Icon name="arrow" size={17} />
            </Button>
          </fieldset>
          <p className="subtle-caption">{caption}</p>
          {message && (
            <p id={`${id}-error`} role="alert" className="feedback-message">
              {message}
            </p>
          )}
        </form>
      </div>
      {submitted && (
        <div
          ref={confirmation}
          className="feedback-success"
          tabIndex={-1}
          role="status"
          aria-labelledby={`${id}-thanks`}
        >
          <span className="feedback-success-mark">
            <Icon name="check" size={29} />
          </span>
          <p className="eyebrow">Отзыв получен</p>
          <h2 id={`${id}-thanks`}>Спасибо, ваш отзыв отправлен</h2>
          <p>Ваше мнение поможет сделать практику полезнее.</p>
          <Button
            variant="outline"
            onClick={() => {
              setSubmitted(false);
              setMessage('');
              requestAnimationFrame(() => textarea.current?.focus({ preventScroll: true }));
            }}
          >
            Изменить отзыв
          </Button>
        </div>
      )}
    </aside>
  );
}
