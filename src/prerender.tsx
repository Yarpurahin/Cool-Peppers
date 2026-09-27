import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppContent } from './app/App.tsx';
export { getPublicMetadata, getSiteUrl, pageStructuredData } from './routes/metadata.ts';

export function render(pathname: string) {
  return renderToString(
    <StaticRouter location={pathname}>
      <AppContent />
    </StaticRouter>,
  );
}
