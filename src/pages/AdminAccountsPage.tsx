import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useCatalog } from '../app/DataProvider.tsx';
import { api, actionErrorMessage, errorMessage } from '../api/client.ts';
import { registerSchema } from '../types/validation.ts';
import type { AdminAccount, User } from '../types/api.ts';
import { Button } from '../components/ui/Button.tsx';
import { PasswordField } from '../components/ui/PasswordField.tsx';
import { Icon } from '../components/ui/Icon.tsx';

export function AdminAccountsPage() {
  const { user } = useCatalog();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<AdminAccount | null>(null);
  const [removeError, setRemoveError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    api<AdminAccount[]>('/admin/accounts', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setAccounts(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setListError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user?.isSuperAdmin, refresh]);

  useEffect(() => {
    if (removing) {
      dialog.current?.showModal();
      cancel.current?.focus();
    } else dialog.current?.close();
  }, [removing]);

  async function revoke() {
    if (!removing || lock.current) return;
    lock.current = true;
    setBusy(true);
    setRemoveError('');
    setNotice('');
    try {
      await api(`/admin/accounts/${encodeURIComponent(removing.id)}`, { method: 'DELETE' });
      setAccounts((current) => current.filter((account) => account.id !== removing.id));
      setNotice(
        `Права администратора ${removing.name} сняты. Его сценарии теперь доступны вам. Аккаунт и история сохранены.`,
      );
      setRemoving(null);
      requestAnimationFrame(() => listHeading.current?.focus());
    } catch (cause) {
      setRemoveError(errorMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (!user?.isSuperAdmin) return <Navigate to="/admin" replace />;
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Доступ к управлению</p>
          <h1>Администраторы</h1>
          <p>Приглашайте участников команды и управляйте их доступом к сценариям.</p>
        </div>
      </div>
      {notice && (
        <div className="account-notice" role="status">
          <span className="account-notice-icon">
            <Icon name="check" size={20} />
          </span>
          <p>{notice}</p>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть сообщение"
            onClick={() => setNotice('')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="admin-accounts-layout">
        <section className="panel admin-accounts-list" aria-labelledby="accounts-heading">
          <div className="panel-heading">
            <h2 id="accounts-heading" ref={listHeading} tabIndex={-1}>
              Команда администраторов
            </h2>
            <Button
              variant="ghost"
              className="button--small"
              disabled={loading || busy}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <Icon name="reset" size={16} /> Обновить
            </Button>
          </div>
          {loading && (
            <p className="muted" role="status">
              Загружаем список…
            </p>
          )}
          {listError && (
            <p className="field-error" role="alert">
              {listError}
            </p>
          )}
          {!loading && !listError && !accounts.length && (
            <p className="admin-accounts-empty">
              Пока вы единственный администратор. Создайте аккаунт, чтобы подключить коллегу к
              работе.
            </p>
          )}
          {!listError && (
            <ul aria-busy={loading}>
              {accounts.map((account) => (
                <li key={account.id}>
                  <span className="admin-account-mark">
                    <Icon name="shield" size={20} />
                  </span>
                  <div className="admin-account-copy">
                    <h3>{account.name}</h3>
                    <p>{account.email}</p>
                    <small>
                      Создан{' '}
                      {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(
                        new Date(account.createdAt),
                      )}{' '}
                      · Сценариев: {account.scenarioCount}
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    className="button--small admin-account-remove"
                    disabled={busy || loading}
                    aria-label={`Удалить администратора ${account.name}`}
                    onClick={() => {
                      setRemoveError('');
                      setRemoving(account);
                    }}
                  >
                    Удалить
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form
          className="panel admin-account-form"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (lock.current) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            setError('');
            setNotice('');
            const input = registerSchema.safeParse({
              name: data.get('name'),
              email: data.get('email'),
              password: data.get('password'),
            });
            if (!input.success) {
              setError('Укажите имя, корректную почту и пароль от 8 до 128 символов.');
              return;
            }
            lock.current = true;
            setBusy(true);
            try {
              const created = await api<User>('/admin/accounts', {
                method: 'POST',
                body: input.data,
              });
              form.reset();
              setNotice(`Администратор ${created.name} создан. Почта для входа: ${created.email}.`);
              setRefresh((value) => value + 1);
            } catch (cause) {
              setError(actionErrorMessage(cause));
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <h2>Новый администратор</h2>
          <fieldset className="form-stack" disabled={busy}>
            <label className="field">
              Имя
              <input name="name" required maxLength={100} autoComplete="off" />
            </label>
            <label className="field">
              Электронная почта
              <input name="email" type="email" required maxLength={254} autoComplete="off" />
            </label>
            <PasswordField newPassword />
            <p className="subtle-caption">
              Новый администратор сможет создавать и редактировать свои сценарии. Управление
              доступом остаётся у вас.
            </p>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy && !removing ? 'Создаём…' : 'Создать администратора'}
              <Icon name="arrow" size={18} />
            </Button>
          </fieldset>
        </form>
      </div>
      <dialog
        ref={dialog}
        className="account-dialog"
        aria-labelledby="revoke-title"
        aria-describedby="revoke-description"
        onCancel={(event) => {
          event.preventDefault();
          if (!lock.current) setRemoving(null);
        }}
      >
        <span className="account-dialog-icon">
          <Icon name="shield" size={24} />
        </span>
        <h2 id="revoke-title">Снять права администратора?</h2>
        <p id="revoke-description">
          <strong>{removing?.name}</strong> больше не сможет работать в админ-панели. Его активные
          сеансы завершатся, а сценарии перейдут вам. Аккаунт и история тренировок сохранятся.
        </p>
        {removeError && (
          <p className="field-error" role="alert">
            {removeError}
          </p>
        )}
        <div className="button-row">
          <button
            ref={cancel}
            type="button"
            className="button button--outline"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            Отмена
          </button>
          <Button disabled={busy} onClick={() => void revoke()}>
            {busy ? 'Снимаем права…' : 'Снять права'}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
