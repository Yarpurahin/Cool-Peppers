import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { PasswordField } from '../components/ui/PasswordField.tsx';
import { api, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import type { User } from '../types/api.ts';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { user, setUser } = useCatalog();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('next') ?? '/profile';
  const destination =
    requested.startsWith('/') &&
    !requested.startsWith('//') &&
    !requested.includes('\\') &&
    !/^\/(login|register)(?:[/?#]|$)/.test(requested)
      ? requested
      : '/profile';
  if (user) return <Navigate to={destination} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (register && fields.get('password') !== fields.get('confirmPassword')) {
      setError('Пароли не совпадают. Проверьте повторный ввод.');
      return;
    }
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const account = await api<User>(register ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: {
          email: fields.get('email'),
          password: fields.get('password'),
          ...(register ? { name: fields.get('name') } : {}),
        },
      });
      setUser(account);
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page auth-page">
      <aside className="auth-story">
        <p className="eyebrow">{register ? 'Ваш первый шаг' : 'Продолжим практику'}</p>
        <h2>
          {register ? (
            <>
              Один разговор.
              <br />
              Много
              <br />
              <span>возможностей.</span>
            </>
          ) : (
            <>
              Новый взгляд
              <br />
              на знакомый
              <br />
              <span>разговор.</span>
            </>
          )}
        </h2>
        <p>
          {register
            ? 'Пробуйте новые подходы и замечайте, как меняется ваш диалог.'
            : 'Возвращайтесь к важным разговорам и пробуйте ещё один путь к решению.'}
        </p>
        <div className="auth-conversation" aria-hidden="true">
          <div className="mini-message">
            <span className="mini-avatar">Вы</span>
            <p>{register ? 'Хочу найти общий язык.' : 'Попробуем другой подход?'}</p>
          </div>
          <div className="mini-message mini-message--reply">
            <p>
              {register
                ? 'Давайте начнём с того, что важно для вас.'
                : 'Да. Давайте сначала разберёмся в интересах.'}
            </p>
            <span className="mini-avatar mini-avatar--orange">
              <Icon name="message" size={19} />
            </span>
          </div>
          <div className="conversation-divider">
            <span />
            <Icon name="branch" size={19} />
            <span />
          </div>
          <div className="conversation-note">
            <Icon name="check" size={18} />
            Разные подходы. Больше возможностей.
          </div>
        </div>
        <div className="story-bottom">
          <span>ПРАКТИКА БЕЗ ДАВЛЕНИЯ</span>
          <Icon name="upRight" size={21} />
        </div>
      </aside>
      <section className="auth-form">
        <p className="eyebrow">{register ? 'Начнём с знакомства' : 'С возвращением'}</p>
        <h1>{register ? 'Создайте профиль' : 'Рады видеть вас'}</h1>
        <p className="auth-description">
          {register
            ? 'Чтобы сохранять результаты и замечать свой прогресс.'
            : 'Войдите, чтобы вернуться к своей практике.'}
        </p>
        <form
          className="form-stack"
          onSubmit={submit}
          onChange={() => {
            if (error) setError('');
          }}
        >
          {register && (
            <label className="field">
              Как к вам обращаться
              <input
                name="name"
                placeholder="Ваше имя"
                autoComplete="name"
                required
                maxLength={100}
              />
            </label>
          )}
          <label className="field">
            Электронная почта
            <input
              name="email"
              type="email"
              placeholder="name@example.ru"
              autoComplete="email"
              required
            />
          </label>
          <PasswordField newPassword={register} />
          {register && (
            <PasswordField label="Повторите пароль" name="confirmPassword" newPassword />
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="button--full">
            {register ? 'Создать аккаунт' : 'Войти'}
            <Icon name="arrow" size={19} />
          </Button>
          <p className="subtle-caption">Профиль и результаты сохраняются в вашем аккаунте.</p>
        </form>
        <p className="auth-switch">
          {register ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <Link to={`${register ? '/login' : '/register'}?next=${encodeURIComponent(destination)}`}>
            {register ? 'Войти' : 'Зарегистрироваться'}
          </Link>
        </p>
      </section>
    </div>
  );
}
