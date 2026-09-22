import { NavLink, Outlet } from 'react-router-dom';
import { useCatalog } from '../../app/DataProvider.tsx';
import { Icon } from '../ui/Icon.tsx';

export function AdminLayout() {
  const { user } = useCatalog();

  return (
    <div className="container admin-shell">
      <aside className="admin-sidebar" aria-label="Навигация администратора">
        <div className="admin-sidebar-heading">
          <span className="admin-sidebar-mark">
            <Icon name="lock" size={18} />
          </span>
          <div>
            <strong>Админ-панель</strong>
            <span>Арена переговоров</span>
          </div>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end>
            <Icon name="chart" size={18} />
            <span>Обзор</span>
          </NavLink>
          <NavLink to="/admin/scenarios">
            <Icon name="book" size={18} />
            <span>Сценарии</span>
          </NavLink>
        </nav>

        <div className="admin-sidebar-user">
          <span className="avatar">{user?.name.trim().charAt(0).toUpperCase() || 'A'}</span>
          <div>
            <strong>{user?.name}</strong>
            <span>Администратор</span>
          </div>
        </div>
      </aside>

      <div className="admin-workspace">
        <Outlet />
      </div>
    </div>
  );
}
