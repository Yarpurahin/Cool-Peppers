import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Select } from '../components/ui/Select.tsx';
import { AccordionItem } from '../components/ui/AccordionItem.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { contactSchema, contactTopics, type ContactInput } from '../types/contact.ts';

const emptyForm: ContactInput = { topic: 'question', email: '', message: '' };
type Errors = Partial<Record<keyof ContactInput, string>>;

export function ContactPage() {
  const [values, setValues] = useState<ContactInput>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const success = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const submission = useRef<{ body: string; id: string } | null>(null);

  useEffect(() => {
    if (receipt) success.current?.focus();
  }, [receipt]);

  function update<K extends keyof ContactInput>(field: K, value: ContactInput[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ContactInput;
        next[field] ??= issue.message;
      }
      setErrors(next);
      const first = Object.keys(next)[0];
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(),
      );
      return;
    }
    setErrors({});
    pending.current = true;
    setBusy(true);
    try {
      const body = JSON.stringify(parsed.data);
      if (submission.current?.body !== body) submission.current = { body, id: crypto.randomUUID() };
      const result = await api<{ id: string }>('/contact', {
        method: 'POST',
        body: { ...parsed.data, requestId: submission.current.id },
      });
      setReceipt(result.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="container page info-page contact-page">
      <header className="page-heading contact-heading">
        <p className="eyebrow">
          <span className="accent-dot" /> Обратная связь
        </p>
        <h1>
          Хорошие изменения
          <br />
          начинаются <em>с разговора.</em>
        </h1>
        <p>Что получилось? Чего не хватило? Расскажите — нам важно вас услышать.</p>
      </header>

      <div className="contact-grid">
        <aside className="contact-aside" aria-labelledby="contact-team-title">
          <section className="contact-team">
            <span className="icon-tile">
              <Icon name="message" size={24} />
            </span>
            <p className="eyebrow">На связи</p>
            <h2 id="contact-team-title">Команда Арены</h2>
            <p>Поможем разобраться с тренажёром, выслушаем идеи и обсудим сотрудничество.</p>
            <ul className="contact-reasons">
              <li>
                <Icon name="info" size={18} />
                <span>
                  <strong>Нужна помощь?</strong>Расскажите, на каком шаге возник вопрос.
                </span>
              </li>
              <li>
                <Icon name="bulb" size={18} />
                <span>
                  <strong>Есть идея?</strong>Предложите улучшение или ситуацию для тренировки.
                </span>
              </li>
              <li>
                <Icon name="user" size={18} />
                <span>
                  <strong>Хотите вместе?</strong>Напишите, чем занимаетесь и что предлагаете.
                </span>
              </li>
            </ul>
            <p className="contact-team-note">
              Написать можно без регистрации.
              <br />
              Оставьте email, чтобы мы могли ответить.
            </p>
          </section>
          <section className="contact-tip" aria-labelledby="contact-tip-title">
            <Icon name="bulb" size={21} />
            <div>
              <h3 id="contact-tip-title">Детали помогают</h3>
              <p>
                Если что-то не работает, укажите страницу, ваше действие и что произошло. Не
                отправляйте пароли и другие секретные данные.
              </p>
            </div>
          </section>
        </aside>

        <section className="panel contact-form-panel" aria-labelledby="contact-form-title">
          {receipt ? (
            <div className="contact-success" ref={success} tabIndex={-1} role="status">
              <span className="contact-success-icon">
                <Icon name="check" size={32} />
              </span>
              <p className="eyebrow">Спасибо, что написали</p>
              <h2 id="contact-form-title">Сообщение получено</h2>
              <p>
                Ваше обращение сохранено и доступно команде Арены. Если понадобится ответ, мы сможем
                связаться с вами по указанной почте.
              </p>
              <p className="contact-receipt">
                Номер обращения <strong>{receipt}</strong>
              </p>
              <div className="button-row">
                <ButtonLink to="/scenarios">
                  К сценариям <Icon name="arrow" />
                </ButtonLink>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReceipt('');
                    setValues(emptyForm);
                    submission.current = null;
                    requestAnimationFrame(() =>
                      form.current?.querySelector<HTMLElement>('#contact-topic')?.focus(),
                    );
                  }}
                >
                  Написать ещё
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Ваш опыт делает нас лучше</p>
                  <h2 id="contact-form-title">Напишите нам</h2>
                </div>
              </div>
              <p className="contact-form-intro" id="contact-required">
                Все три поля обязательны.
              </p>
              <noscript>
                <p className="field-error">
                  Для отправки сообщения включите JavaScript в настройках браузера.
                </p>
              </noscript>
              <form
                ref={form}
                onSubmit={submit}
                noValidate
                aria-labelledby="contact-form-title"
                aria-describedby="contact-required"
                aria-busy={busy}
              >
                <fieldset className="form-stack" disabled={busy}>
                  <legend className="sr-only">Ваше обращение</legend>
                  <div className="field">
                    <label htmlFor="contact-topic">О чём хотите рассказать?</label>
                    <Select
                      id="contact-topic"
                      name="topic"
                      required
                      value={values.topic}
                      onValueChange={(value) => update('topic', value as ContactInput['topic'])}
                      aria-invalid={Boolean(errors.topic)}
                      aria-describedby={errors.topic ? 'contact-topic-error' : undefined}
                    >
                      {Object.entries(contactTopics).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    {errors.topic && (
                      <p className="contact-field-error" id="contact-topic-error">
                        {errors.topic}
                      </p>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="contact-email">Email для ответа</label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      maxLength={254}
                      placeholder="you@example.ru"
                      value={values.email}
                      onChange={(event) => update('email', event.target.value)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={`contact-email-hint${errors.email ? ' contact-email-error' : ''}`}
                    />
                    <p className="contact-field-hint" id="contact-email-hint">
                      Проверьте адрес, чтобы ответ нашёл вас.
                    </p>
                    {errors.email && (
                      <p className="contact-field-error" id="contact-email-error">
                        {errors.email}
                      </p>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="contact-message">Ваше сообщение</label>
                    <textarea
                      id="contact-message"
                      name="message"
                      rows={6}
                      required
                      minLength={20}
                      maxLength={3000}
                      placeholder="Расскажите чуть подробнее…"
                      value={values.message}
                      onChange={(event) => update('message', event.target.value)}
                      aria-invalid={Boolean(errors.message)}
                      aria-describedby={`contact-message-hint${errors.message ? ' contact-message-error' : ''}`}
                    />
                    <div className="contact-message-meta">
                      <p className="contact-field-hint" id="contact-message-hint">
                        От 20 до 3000 символов.
                      </p>
                      <span aria-label={`${values.message.length} из 3000 символов`}>
                        {values.message.length} / 3000
                      </span>
                    </div>
                    {errors.message && (
                      <p className="contact-field-error" id="contact-message-error">
                        {errors.message}
                      </p>
                    )}
                  </div>
                  <p className="contact-privacy">
                    <Icon name="lock" size={17} />
                    <span>
                      Email нужен для ответа. Сообщение доступно администраторам проекта и не
                      публикуется.
                    </span>
                  </p>
                  {error && (
                    <p className="field-error" role="alert">
                      {error} Текст сообщения остался в форме.
                    </p>
                  )}
                  <Button type="submit" className="contact-submit" disabled={busy}>
                    {busy ? 'Отправляем…' : 'Отправить сообщение'}
                    <Icon name="arrow" size={18} />
                  </Button>
                </fieldset>
              </form>
            </>
          )}
        </section>
      </div>

      <section className="contact-faq info-section" aria-labelledby="faq-title">
        <div>
          <p className="eyebrow">Возможно, ответ уже здесь</p>
          <h2 id="faq-title">Пара частых вопросов</h2>
          <Link to="/about" className="text-link">
            Больше об Арене <Icon name="arrow" size={17} />
          </Link>
        </div>
        <div className="contact-faq-list">
          <AccordionItem title="С чего начать тренировку?">
            <p>
              Откройте{' '}
              <Link to="/scenarios" className="inline-link">
                каталог сценариев
              </Link>{' '}
              и выберите доступную тренировку. Для прохождения войдите в аккаунт — так история и
              результаты сохранятся.
            </p>
          </AccordionItem>
          <AccordionItem title="Можно предложить свой сценарий?">
            <p>
              Да. Выберите в форме тему «Идея или новый сценарий» и опишите ситуацию: кто участвует,
              о чём договариваются и в чём сложность.
            </p>
          </AccordionItem>
          <AccordionItem title="Где оставить отзыв о тренировке?">
            <p>
              После завершения тренировки на странице результата есть форма отзыва. А замечания о
              проекте в целом можно отправить здесь.
            </p>
          </AccordionItem>
        </div>
      </section>
    </div>
  );
}
