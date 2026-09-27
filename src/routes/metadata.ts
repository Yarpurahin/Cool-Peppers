export const defaultDescription =
  'Арена — пространство для практики переговоров. Пробуйте разные подходы и находите свой способ договариваться.';
export const publicPageMetadata = {
  '/about': {
    title: 'О проекте — Арена переговоров',
    description:
      'Узнайте, как Арена помогает готовиться к важным разговорам: жизненные ситуации, выбор реплик, разные подходы и разбор собственных решений.',
    type: 'AboutPage',
  },
  '/feedback': {
    title: 'Обратная связь — Арена переговоров',
    description:
      'Свяжитесь с командой Арены: задайте вопрос о тренажёре, сообщите об ошибке, предложите сценарий или сотрудничество. Регистрация не требуется.',
    type: 'ContactPage',
  },
} as const;

export function getPublicMetadata(pathname: string) {
  return publicPageMetadata[pathname.replace(/\/$/, '') as keyof typeof publicPageMetadata];
}

export function getSiteUrl() {
  const value = import.meta.env.VITE_SITE_URL?.trim();
  if (!value) return '';
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'VITE_SITE_URL must be an http(s) origin without a path, query or credentials.',
    );
  return url.origin;
}

export function pageStructuredData(pathname: string, siteUrl: string) {
  const metadata = getPublicMetadata(pathname);
  if (!metadata) return null;
  return {
    '@context': 'https://schema.org',
    '@type': metadata.type,
    name: metadata.title,
    description: metadata.description,
    inLanguage: 'ru',
    ...(siteUrl ? { url: `${siteUrl}${pathname}` } : {}),
    isPartOf: {
      '@type': 'WebSite',
      name: 'Арена переговоров',
      ...(siteUrl ? { url: `${siteUrl}/` } : {}),
    },
  };
}
