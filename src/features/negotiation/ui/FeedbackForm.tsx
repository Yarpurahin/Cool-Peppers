import { useState } from 'react';
import { Button } from '../../../components/ui/Button.tsx';
import { Icon } from '../../../components/ui/Icon.tsx';
import type { FeedbackInput } from './types.ts';

export function FeedbackForm({
  onSubmit,
  caption = 'Отзыв необязателен',
  initial,
}: {
  onSubmit: (input: FeedbackInput) => string | Promise<string>;
  caption?: string;
  initial?: FeedbackInput;
}) {
  const [helpful, setHelpful] = useState<boolean | null>(initial?.helpful ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <aside className="panel feedback-panel">
      <p className="eyebrow">Ваша обратная связь</p>
      <h2>Полезная практика?</h2>
      <p>Помог ли сценарий посмотреть на разговор по-новому?</p>
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (helpful === null) {
            setMessage('Выберите «Да» или «Не совсем».');
            return;
          }
          if (busy) return;
          setBusy(true);
          try {
            setMessage(await onSubmit({ helpful, comment: comment.trim() }));
          } catch (cause) {
            setMessage(
              cause instanceof Error
                ? cause.message
                : 'Не удалось сохранить отзыв. Попробуйте ещё раз.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="feedback-options">
          <legend className="sr-only">Полезна ли практика?</legend>
          {[
            { value: true, text: 'Да' },
            { value: false, text: 'Не совсем' },
          ].map(({ value, text }) => (
            <label className={helpful === value ? 'is-selected' : ''} key={text}>
              <input
                type="radio"
                name="helpful"
                checked={helpful === value}
                onChange={() => setHelpful(value)}
              />
              {text}
            </label>
          ))}
        </fieldset>
        <label className="field">
          Что можно улучшить?
          <textarea
            rows={5}
            maxLength={2000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Поделитесь впечатлением"
          />
        </label>
        <Button type="submit" disabled={busy} variant="secondary" className="button--full">
          Отправить отзыв <Icon name="arrow" size={17} />
        </Button>
        <p className="subtle-caption">{caption}</p>
        {message && (
          <p role="status" className="feedback-message">
            {message}
          </p>
        )}
      </form>
    </aside>
  );
}
