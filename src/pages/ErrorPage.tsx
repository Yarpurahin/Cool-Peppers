import { ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Logo } from '../components/layout/Logo.tsx';

export function ErrorPage({ code = 404 }: { code?: 404 | 500 }) {
  return (
    <div className="error-layout">
      <header className="container error-header">
        <Logo />
      </header>
      <main className="error-page container" id="main-content">
        <span className="eyebrow">
          {code === 404 ? 'Страница не найдена' : 'Техническая пауза'}
        </span>
        <div className="error-code" aria-hidden="true">
          {code}
        </div>
        <h1>
          <span className="sr-only">Ошибка {code}. </span>
          {code === 404 ? 'Кажется, мы разминулись.' : 'Нам нужна минута на ответ.'}
        </h1>
        <p>
          {code === 404
            ? 'Этой страницы нет или её адрес изменился. Но хороший разговор всё ещё можно начать.'
            : 'На стороне сервиса произошла ошибка. Вернитесь на главную и попробуйте продолжить позже.'}
        </p>
        <ButtonLink to="/">
          На главную <Icon name="arrow" />
        </ButtonLink>
      </main>
      <footer className="error-footer container">
        <span>Навык, который остаётся с вами.</span>
        <span>© Арена, 2026</span>
      </footer>
    </div>
  );
}
