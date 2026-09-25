import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo.tsx';
import { useCatalog } from '../../app/DataProvider.tsx';
import { Icon } from '../ui/Icon.tsx';

export function Header() {
  const { user, logout } = useCatalog();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const account = useRef<HTMLDetailsElement>(null);

  const closeMenus = () => {
    setOpen(false);
    account.current?.removeAttribute('open');
  };
  const initials =
    user?.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'У';

  useEffect(() => {
    const closeAccount = (event: PointerEvent) => {
      if (account.current?.open && !account.current.contains(event.target as Node))
        account.current.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeAccount);
    return () => document.removeEventListener('pointerdown', closeAccount);
  }, []);

  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        const mobileWasOpen = open;
        closeMenus();
        if (mobileWasOpen) toggle.current?.focus();
      }}
    >
      <div className="container header-inner">
        <div onClick={closeMenus}>
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
            if ((event.target as HTMLElement).closest('a')) closeMenus();
          }}
        >
          <div className="nav-pages">
            <NavLink to="/scenarios">Сценарии</NavLink>
            {user?.role === 'admin' && <NavLink to="/admin">Админ-панель</NavLink>}
          </div>
          <div className="nav-account">
            {user ? (
              <details ref={account} className="account-menu">
                <summary
                  className="account-trigger"
                  aria-label={`Аккаунт: ${user.name}, ${user.role === 'admin' ? 'администратор' : 'участник'}`}
                >
                  <span className="account-trigger-name">{user.name}</span>
                  <span className="account-avatar account-avatar--trigger" aria-hidden="true">
                    {initials}
                    {user.role === 'admin' && (
                      <span className="account-admin-mark">
                        <Icon name="shield" size={11} />
                      </span>
                    )}
                  </span>
                </summary>
                <div className="account-menu-popover">
                  <div className="account-profile-card">
                    <span className="account-avatar account-avatar--large" aria-hidden="true">
                      {initials}
                      {user.role === 'admin' && (
                        <span className="account-admin-mark account-admin-mark--large">
                          <Icon name="shield" size={12} />
                        </span>
                      )}
                    </span>
                    <div className="account-profile-copy">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                      <em className="account-role-badge">
                        <Icon name={user.role === 'admin' ? 'shield' : 'user'} size={12} />
                        {user.role === 'admin' ? 'Администратор' : 'Участник'}
                      </em>
                    </div>
                  </div>
                  <div className="account-menu-actions">
                    <NavLink to="/profile" onClick={closeMenus}>
                      <Icon name="lock" size={16} />
                      Профиль и безопасность
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => {
                        closeMenus();
                        void logout();
                      }}
                    >
                      <Icon name="back" size={16} />
                      Выйти
                    </button>
                  </div>
                </div>
              </details>
            ) : (
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
