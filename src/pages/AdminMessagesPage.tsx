import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { contactTopics, type ContactInbox } from '../types/contact.ts';

export function AdminMessagesPage() {
  const [inbox, setInbox] = useState<ContactInbox>({ messages: [], hasMore: false });
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<ContactInbox>(`/admin/messages?offset=${offset}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setInbox(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, retry]);
  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" /> Связь с участниками
          </p>
          <h1>Обращения</h1>
          <p>Сообщения со страницы «Обратная связь». Новые — сверху.</p>
        </div>
        <Button variant="outline" onClick={() => setRetry((value) => value + 1)} disabled={loading}>
          <Icon name="reset" size={17} /> Обновить
        </Button>
      </div>
      {loading && <p role="status">Загружаем обращения…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && (
        <>
          {!inbox.messages.length && <p className="panel">Здесь пока нет обращений.</p>}
          <div className="contact-inbox">
            {inbox.messages.map((message) => (
              <article className="panel contact-inbox-message" key={message.id}>
                <div className="panel-heading">
                  <h2>{contactTopics[message.topic]}</h2>
                  <time dateTime={message.createdAt}>
                    {new Intl.DateTimeFormat('ru-RU', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(message.createdAt))}
                  </time>
                </div>
                <p className="contact-inbox-text">{message.message}</p>
                <a
                  className="text-link"
                  href={`mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(`Арена: ${contactTopics[message.topic]}`)}`}
                >
                  <Icon name="message" size={18} />
                  Ответить: {message.email}
                </a>
                <p className="contact-receipt">Обращение {message.id}</p>
              </article>
            ))}
          </div>
        </>
      )}
      <nav className="contact-pagination" aria-label="Страницы обращений">
        <Button
          variant="outline"
          disabled={loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 30))}
        >
          <Icon name="back" size={16} /> Назад
        </Button>
        <span className="contact-page-number" aria-current="page">
          Страница {Math.floor(offset / 30) + 1}
        </span>
        <Button
          variant="outline"
          disabled={loading || Boolean(error) || !inbox.hasMore}
          onClick={() => setOffset((value) => value + 30)}
        >
          Далее <Icon name="arrow" size={16} />
        </Button>
      </nav>
    </div>
  );
}
