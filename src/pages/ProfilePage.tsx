import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import type { HistoryRow, User } from '../types/api.ts';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';

interface History {
  total: number;
  completed: number;
  penalties: number;
  rows: HistoryRow[];
}
export function ProfilePage() {
  const { user, setUser, logout } = useCatalog();
  const [history, setHistory] = useState<History | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setHistoryError('');
    api<History>(`/me/history?offset=${offset}&limit=20`, { signal: controller.signal })
      .then(setHistory)
      .catch((cause) => {
        if (!controller.signal.aborted) setHistoryError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [offset, retry]);
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <div className="container page profile-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Личное пространство</p>
          <h1>Моя практика</h1>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void logout().catch((cause) => {
              setError(errorMessage(cause));
              setBusy(false);
            });
          }}
        >
          Выйти
        </Button>
      </div>
      <div className="profile-overview">
        <div className="profile-person">
          <span className="avatar avatar--large">{initials}</span>
          <div>
            <h2>{user.name}</h2>
            <p>Участник Арены</p>
          </div>
        </div>
        <div className="stat stat--dark">
          <span>Завершено</span>
          <strong>{history?.completed ?? '—'}</strong>
          <p>Тренировок</p>
        </div>
        <div className="stat">
          <span>Всего попыток</span>
          <strong>{history?.total ?? '—'}</strong>
          <p>Включая незавершённые</p>
        </div>
        <div className="stat">
          <span>Штрафные баллы</span>
          <strong>{history?.penalties ?? '—'}</strong>
          <p>По завершённым попыткам</p>
        </div>
      </div>
      <section className="panel personal-panel">
        <div className="panel-heading">
          <h2>Личные данные</h2>
          <Icon name="user" />
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            setNotice('');
            try {
              setUser(
                await api<User>('/me', {
                  method: 'PATCH',
                  body: { name: data.get('name'), email: data.get('email') },
                }),
              );
              setNotice('Изменения сохранены.');
            } catch (cause) {
              setError(errorMessage(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="two-fields">
            <label className="field">
              Имя
              <input
                name="name"
                defaultValue={user.name}
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label className="field">
              Электронная почта
              <input
                name="email"
                type="email"
                defaultValue={user.email}
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
          </div>
          <div className="form-bottom">
            <Button type="submit" disabled={busy} variant="secondary">
              Сохранить изменения
            </Button>
            {notice && <p role="status">{notice}</p>}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <section className="panel history-panel">
        <div className="panel-heading">
          <h2>История практики</h2>
        </div>
        {historyError && (
          <p role="alert">
            {historyError}{' '}
            <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
              Повторить
            </Button>
          </p>
        )}
        {!history && !historyError && <p role="status">Загружаем историю…</p>}
        {history?.total === 0 && (
          <p>
            История пока пуста. <Link to="/scenarios">Выберите сценарий</Link> и начните тренировку.
          </p>
        )}
        <div className="history-list">
          {history?.rows.map((row) => (
            <article className="history-row" key={row.id}>
              <span className="history-icon">
                <Icon name={row.status === 'completed' ? 'check' : 'clock'} />
              </span>
              <div className="history-title">
                <h3>{row.title}</h3>
                <p>
                  {new Date(row.startedAt).toLocaleString('ru-RU')} · версия {row.scenarioVersion}
                </p>
                <p>
                  {row.outcome ??
                    (row.abandonedAt ? 'Прервана при повторном запуске' : 'В процессе')}{' '}
                  · ответов: {row.answers}
                </p>
              </div>
              <div className="history-score">
                <strong>{row.penalties}</strong>
                <span> штрафов</span>
              </div>
              <Link className="review-link" to={`/attempts/${row.id}`}>
                {row.status === 'completed' ? 'Разбор' : 'История'}{' '}
                <Icon name="upRight" size={18} />
              </Link>
            </article>
          ))}
        </div>
        {history && history.total > 20 && (
          <div className="button-row">
            <Button
              disabled={offset === 0}
              variant="outline"
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              Назад
            </Button>
            <span>
              {offset + 1}–{Math.min(offset + 20, history.total)} из {history.total}
            </span>
            <Button
              disabled={offset + 20 >= history.total}
              variant="outline"
              onClick={() => setOffset((n) => n + 20)}
            >
              Далее
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
