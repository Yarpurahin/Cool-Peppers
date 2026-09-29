import { useEffect, useState } from 'react';
import { Avatar } from '../components/ui/Avatar.tsx';
import { AvatarSettings } from '../components/ui/AvatarSettings.tsx';
import { changePasswordSchema } from '../types/validation.ts';
import { api, actionErrorMessage, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import type { HistoryRow, User } from '../types/api.ts';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { PasswordField } from '../components/ui/PasswordField.tsx';
import { useGamification } from '../features/gamification/GamificationProvider.tsx';
import { GamificationProfile } from '../features/gamification/GamificationProfile.tsx';
import { MasteryStars } from '../features/gamification/MasteryStars.tsx';

const HISTORY_PAGE_SIZE = 10;

interface History {
  total: number;
  completed: number;
  penalties: number;
  rows: HistoryRow[];
}
export function ProfilePage() {
  const { user, setUser, logout } = useCatalog();
  const gamification = useGamification();
  const [history, setHistory] = useState<History | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setHistoryError('');
    api<History>(`/me/history?offset=${offset}&limit=${HISTORY_PAGE_SIZE}`, { signal: controller.signal })
      .then(setHistory)
      .catch((cause) => {
        if (!controller.signal.aborted) setHistoryError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [offset]);
  useEffect(() => {
    if (!history || history.total === 0 || offset < history.total) return;
    setOffset(Math.max(0, Math.floor((history.total - 1) / HISTORY_PAGE_SIZE) * HISTORY_PAGE_SIZE));
  }, [history, offset]);
  if (!user) return null;
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
              setError(actionErrorMessage(cause));
              setBusy(false);
            });
          }}
        >
          Выйти
        </Button>
      </div>
      <div className="profile-overview">
        <div className="profile-person">
          <Avatar name={user.name} image={user.avatar} className="avatar avatar--large" />
          <div>
            <h2>{user.name}</h2>
            <p>{user.role === 'admin' ? 'Администратор Арены' : 'Участник Арены'}</p>
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
      <GamificationProfile
        summary={gamification.summary}
        loading={gamification.loading}
        error={gamification.error}
      />
      <section className="panel personal-panel">
        <div className="panel-heading">
          <h2>Личные данные</h2>
          <Icon name="user" />
        </div>
        <AvatarSettings />
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
              setError(actionErrorMessage(cause));
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
      <section className="panel personal-panel security-panel">
        <div className="panel-heading">
          <div>
            <h2>Безопасность</h2>
            <p>
              Смените пароль аккаунта. После сохранения остальные активные сессии будут завершены.
            </p>
          </div>
          <Icon name="lock" />
        </div>
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (passwordBusy) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            const currentPassword = String(data.get('currentPassword') ?? '');
            const newPassword = String(data.get('newPassword') ?? '');
            const repeatPassword = String(data.get('repeatPassword') ?? '');
            setPasswordError('');
            setPasswordNotice('');
            if (!currentPassword) {
              setPasswordError('Введите текущий пароль.');
              return;
            }
            const input = changePasswordSchema.safeParse({ currentPassword, newPassword });
            if (!input.success) {
              setPasswordError(
                currentPassword === newPassword
                  ? 'Новый пароль должен отличаться от текущего.'
                  : 'Пароль должен содержать от 8 до 128 символов.',
              );
              return;
            }
            if (newPassword !== repeatPassword) {
              setPasswordError('Новые пароли не совпадают.');
              return;
            }
            setPasswordBusy(true);
            try {
              await api('/me/password', {
                method: 'POST',
                body: { currentPassword, newPassword },
              });
              form.reset();
              setCurrentPassword('');
              setPasswordNotice('Пароль изменён. Остальные активные сессии завершены.');
            } catch (cause) {
              setPasswordError(actionErrorMessage(cause));
            } finally {
              setPasswordBusy(false);
            }
          }}
        >
          <div className="password-change-grid">
            <PasswordField
              label="Текущий пароль"
              name="currentPassword"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <PasswordField label="Новый пароль" name="newPassword" newPassword />
            <PasswordField label="Повторите новый пароль" name="repeatPassword" newPassword />
          </div>
          <div className="form-bottom">
            <Button type="submit" disabled={passwordBusy || !currentPassword} variant="secondary">
              <Icon name="lock" size={17} />
              {passwordBusy ? 'Сохраняем…' : 'Изменить пароль'}
            </Button>
            {passwordNotice && <p role="status">{passwordNotice}</p>}
          </div>
          {passwordError && (
            <p className="field-error" role="alert">
              {passwordError}
            </p>
          )}
        </form>
      </section>
      <section className="panel history-panel">
        <div className="panel-heading">
          <h2>История практики</h2>
        </div>
        {historyError && <p role="status">История временно недоступна.</p>}
        {!history && !historyError && <p role="status">Загружаем историю…</p>}
        {history?.total === 0 && <p>История пока пуста. Выберите сценарий и начните тренировку.</p>}
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
                {row.masteryStars ? <MasteryStars value={row.masteryStars} compact /> : null}
                {row.xpEarned != null && <span className="history-xp">+{row.xpEarned} XP</span>}
                <strong>{row.penalties}</strong>
                <span> штрафов</span>
              </div>
            </article>
          ))}
        </div>
        {history && history.total > HISTORY_PAGE_SIZE && (
          <nav className="contact-pagination profile-pagination" aria-label="Страницы истории практики">
            <Button
              disabled={offset === 0}
              variant="outline"
              onClick={() => setOffset((value) => Math.max(0, value - HISTORY_PAGE_SIZE))}
            >
              <Icon name="back" size={16} /> Назад
            </Button>
            <span className="contact-page-number" aria-current="page">
              Страница {Math.floor(offset / HISTORY_PAGE_SIZE) + 1} из {Math.ceil(history.total / HISTORY_PAGE_SIZE)}
            </span>
            <Button
              disabled={offset + HISTORY_PAGE_SIZE >= history.total}
              variant="outline"
              onClick={() => setOffset((value) => value + HISTORY_PAGE_SIZE)}
            >
              Далее <Icon name="arrow" size={16} />
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
