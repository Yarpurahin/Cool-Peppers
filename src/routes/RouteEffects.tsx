import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCatalog } from '../app/DataProvider.tsx';
import { getPublicMetadata, getSiteUrl, pageStructuredData } from './metadata.ts';

const description =
  'Арена — тренажёр переговоров: практические ситуации, разные стратегии общения и разбор решений. Учитесь договариваться в своём темпе.';

function setMeta(attribute: 'name' | 'property', name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, name);
    document.head.append(element);
  }
  element.content = content;
}

export function RouteEffects() {
  const { pathname } = useLocation();
  const { scenarios } = useCatalog();
  const previous = useRef(pathname);
  useEffect(() => {
    const moved = previous.current !== pathname;
    previous.current = pathname;
    let scrolled = !moved;
    const path = pathname.replace(/\/$/, '') || '/';
    const metadata = getPublicMetadata(path);
    const siteUrl = getSiteUrl() || window.location.origin;
    const scenario = scenarios.find((item) => pathname === `/scenarios/${item.id}`);
    const isPublic = path === '/' || path === '/scenarios' || !!scenario || !!metadata;
    const pageDescription =
      metadata?.description ||
      scenario?.description ||
      (pathname === '/scenarios'
        ? 'Сценарии переговоров: обсуждение сроков, условий работы и сотрудничества. Выберите ситуацию и потренируйтесь вести диалог.'
        : description);
    const url = new URL(path, siteUrl).href;
    const update = () => {
      const heading = document.querySelector('h1');
      const title = scenario?.title || heading?.textContent?.trim() || 'Практика переговоров';
      document.title = metadata?.title ?? `${title} — Арена`;
      setMeta('name', 'description', pageDescription.slice(0, 300));
      setMeta('name', 'robots', isPublic ? 'index,follow' : 'noindex,nofollow');
      setMeta('property', 'og:title', document.title);
      setMeta('property', 'og:description', pageDescription.slice(0, 300));
      setMeta('property', 'og:type', 'website');
      setMeta('property', 'og:locale', 'ru_RU');
      setMeta('property', 'og:site_name', 'Арена переговоров');
      setMeta('property', 'og:url', url);
      setMeta('name', 'twitter:card', 'summary');
      setMeta('name', 'twitter:title', document.title);
      setMeta('name', 'twitter:description', pageDescription.slice(0, 300));
      let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (isPublic) {
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.rel = 'canonical';
          document.head.append(canonical);
        }
        canonical.href = url;
      } else canonical?.remove();
      document.getElementById('page-structured-data')?.remove();
      const structuredData = pageStructuredData(path, siteUrl);
      if (structuredData) {
        const script = document.createElement('script');
        script.id = 'page-structured-data';
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(structuredData);
        document.head.append(script);
      }
      if (!scrolled) {
        scrolled = true;
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
      }
    };
    update();
    // Lazy pages and async scenario titles may appear after the navigation effect.
    const observer = new MutationObserver(update);
    const root = document.getElementById('root');
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, scenarios]);
  return null;
}
