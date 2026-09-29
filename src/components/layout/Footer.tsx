import { Logo } from './Logo.tsx';
import { NavLink } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>Навык, который остаётся с вами.</p>
        </div>
        <nav className="footer-links" aria-label="О проекте и связь с командой">
          <NavLink to="/about">О проекте</NavLink>
          <NavLink to="/feedback">Обратная связь</NavLink>
          <span>© Арена, 2026</span>
        </nav>
      </div>
    </footer>
  );
}
