import { Logo } from './Logo.tsx';
import { useDemoMessage } from '../../app/DemoProvider.tsx';

export function Footer() {
  const show = useDemoMessage();
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>Навык, который остаётся с вами.</p>
        </div>
        <div className="footer-links">
          <button
            type="button"
            onClick={() =>
              show(
                'О проекте',
                'Арена — тренажёр переговоров: практика сложных разговоров, разные подходы и разбор решений. Сейчас перед вами демонстрационный интерфейс будущего приложения.',
              )
            }
          >
            О проекте
          </button>
          <button
            type="button"
            onClick={() =>
              show(
                'Обратная связь',
                'Форма связи с командой появится позже. Сейчас отправка сообщений недоступна.',
              )
            }
          >
            Обратная связь
          </button>
          <span>© Арена, 2026</span>
        </div>
      </div>
    </footer>
  );
}
