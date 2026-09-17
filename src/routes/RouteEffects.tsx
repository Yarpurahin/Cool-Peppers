import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteEffects() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    const moved = previous.current !== pathname;
    previous.current = pathname;
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector('h1');
      document.title = `${heading?.textContent?.trim() ?? 'Практика переговоров'} — Арена`;
      if (moved) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return null;
}
