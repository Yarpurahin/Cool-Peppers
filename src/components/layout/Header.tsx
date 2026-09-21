import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo.tsx';
import { useCatalog } from '../../app/DataProvider.tsx';
import { Icon } from '../ui/Icon.tsx';

export function Header() {
  const { user } = useCatalog();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="container header-inner">
        <div onClick={() => setOpen(false)}>
          <Logo />
        </div>
        <button
          ref={toggle}
          type="button"
          className="icon-button menu-toggle"
          aria-expanded={open}
          aria-controls="site-navigation"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'close' : 'menu'} />
        </button>
        <nav
          id="site-navigation"
          aria-label="Основная навигация"
          className={`site-nav ${open ? 'is-open' : ''}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          <div className="nav-pages">
            <NavLink to="/scenarios">Сценарии</NavLink>
            <NavLink to="/editor">Редактор</NavLink>
          </div>
          <div className="nav-account">
            <NavLink to="/profile" className="profile-link">
              <Icon name="user" size={17} />
              <span>Профиль</span>
            </NavLink>
            {!user && (
              <>
                <NavLink to="/register" className="register-link">
                  Регистрация
                </NavLink>
                <NavLink to="/login" className="button button--primary button--small">
                  Войти <Icon name="arrow" size={16} />
                </NavLink>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
