import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useDemoMessage } from '../app/DemoProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { PasswordField } from '../components/ui/PasswordField.tsx';
import { DemoNotice } from '../components/ui/DemoNotice.tsx';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register';
  const show = useDemoMessage();
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (register && fields.get('password') !== fields.get('confirmPassword')) {
      setError('Пароли не совпадают. Проверьте повторный ввод.');
      return;
    }
    setError('');
    event.currentTarget.reset();
    show(
      register ? 'Регистрация появится позже' : 'Вход пока недоступен',
      register
        ? 'Это демонстрационная форма. Аккаунт не создан, введённые данные никуда не отправлены. Поля очищены.'
        : 'Это демонстрационная форма. Вход не выполнен, введённые данные никуда не отправлены. Поля очищены.',
    );
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
          {register && (
            <label className="checkbox-field">
              <input type="checkbox" name="consent" required />
              <span>
                Принимаю{' '}
                <button
                  type="button"
                  className="inline-link"
                  onClick={() =>
                    show(
                      'Условия использования',
                      'Документ будет добавлен перед запуском регистрации. Сейчас аккаунты не создаются и данные не собираются.',
                    )
                  }
                >
                  условия использования
                </button>{' '}
                и{' '}
                <button
                  type="button"
                  className="inline-link"
                  onClick={() =>
                    show(
                      'Конфиденциальность',
                      'В этой версии введённые данные не отправляются и не сохраняются. Политика сервиса появится до запуска регистрации.',
                    )
                  }
                >
                  политику конфиденциальности
                </button>
              </span>
            </label>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="button--full">
            {register ? 'Создать аккаунт' : 'Войти'}
            <Icon name="arrow" size={19} />
          </Button>
          <DemoNotice>
            Демонстрационная форма. {register ? 'Создание аккаунтов' : 'Авторизация'} пока
            недоступно.
          </DemoNotice>
        </form>
        <p className="auth-switch">
          {register ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <Link to={register ? '/login' : '/register'}>
            {register ? 'Войти' : 'Зарегистрироваться'}
          </Link>
        </p>
      </section>
    </div>
  );
}
