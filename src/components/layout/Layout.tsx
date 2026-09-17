import { Outlet } from 'react-router-dom';
import { Header } from './Header.tsx';
import { Footer } from './Footer.tsx';

export function Layout() {
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
