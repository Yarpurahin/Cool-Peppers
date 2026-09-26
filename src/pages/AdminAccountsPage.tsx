import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useCatalog } from '../app/DataProvider.tsx';
import { api, actionErrorMessage } from '../api/client.ts';
import { registerSchema } from '../types/validation.ts';
import type { User } from '../types/api.ts';
import { Button } from '../components/ui/Button.tsx';
import { PasswordField } from '../components/ui/PasswordField.tsx';
import { Icon } from '../components/ui/Icon.tsx';

export function AdminAccountsPage() {
  const { user } = useCatalog();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (!user?.isSuperAdmin) return <Navigate to="/admin" replace />;
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Доступ к управлению</p>
          <h1>Администраторы</h1>
          <p>Создайте аккаунт для участника, который будет работать со сценариями.</p>
        </div>
      </div>
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
          } catch (cause) {
            setError(actionErrorMessage(cause));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <h2>Новый администратор</h2>
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
          Новый администратор сможет создавать и редактировать свои сценарии. Создание
          администраторов доступно только вам.
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Создаём…' : 'Создать администратора'}
          <Icon name="arrow" size={18} />
        </Button>
      </form>
    </section>
  );
}
