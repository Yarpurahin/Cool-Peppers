import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../app/ThemeProvider.tsx';
import { ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Logo } from '../components/layout/Logo.tsx';

export function ErrorPage({ code = 404 }: { code?: 404 | 500 }) {
  const navigate = useNavigate();
  useEffect(() => {
    // Also covers surrounding navigation when an error is rendered inside a layout.
    const leaveError = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || anchor.getAttribute('href')?.startsWith('#')) return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash, { replace: true });
    };
    document.addEventListener('click', leaveError, true);
    return () => document.removeEventListener('click', leaveError, true);
  }, [navigate]);
  return (
    <div className="error-layout">
      <header className="container error-header">
        <Logo replace />
        <ThemeToggle />
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
        <ButtonLink to="/" replace>
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
