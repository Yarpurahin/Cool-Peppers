import { build } from 'vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

// Reuse the real React tree so copy, links and form markup cannot drift from the SPA.
const temporary = new URL('../.prerender/', import.meta.url);
await build({
  build: { ssr: 'src/prerender.tsx', outDir: '.prerender', emptyOutDir: true },
  logLevel: 'warn',
});
try {
  const { render, getPublicMetadata, getSiteUrl, pageStructuredData } =
    await import('../.prerender/prerender.js');
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const siteUrl = getSiteUrl();
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  for (const pathname of ['/about', '/feedback']) {
    const metadata = getPublicMetadata(pathname);
    const structured = JSON.stringify(pageStructuredData(pathname, siteUrl)).replaceAll(
      '<',
      '\\u003c',
    );
    const tags = [
      `<meta name="robots" content="index, follow" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Арена переговоров" />`,
      `<meta property="og:locale" content="ru_RU" />`,
      `<meta property="og:title" content="${escape(metadata.title)}" />`,
      `<meta property="og:description" content="${escape(metadata.description)}" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${escape(metadata.title)}" />`,
      `<meta name="twitter:description" content="${escape(metadata.description)}" />`,
      `<script type="application/ld+json" id="page-structured-data">${structured}</script>`,
      ...(siteUrl
        ? [
            `<link rel="canonical" href="${escape(siteUrl + pathname)}" />`,
            `<meta property="og:url" content="${escape(siteUrl + pathname)}" />`,
          ]
        : []),
    ].join('\n    ');
    const html = template
      // Replace the common shell metadata instead of producing two OG/Twitter sets.
      .replace(/<meta\s+(?:name|property)="(?:robots|og:[^"]+|twitter:[^"]+)"[^>]*\/?>/g, '')
      .replace(/<title>.*?<\/title>/s, `<title>${escape(metadata.title)}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
        `<meta name="description" content="${escape(metadata.description)}" />`,
      )
      .replace('</head>', `    ${tags}\n  </head>`)
      .replace(
        '<div id="root"></div>',
        () => `<div id="root" data-prerendered="true">${render(pathname)}</div>`,
      );
    const directory = new URL(`../dist${pathname}/`, import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('index.html', directory), html);
  }
  const robots =
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /admin',
      'Disallow: /editor',
      'Disallow: /profile',
      'Disallow: /attempts/',
      ...(siteUrl ? [`Sitemap: ${siteUrl}/sitemap.xml`] : []),
    ].join('\n') + '\n';
  await writeFile(new URL('../dist/robots.txt', import.meta.url), robots);
  if (siteUrl) {
    const urls = ['/', '/scenarios', '/about', '/feedback']
      .map((path) => `  <url><loc>${escape(siteUrl + path)}</loc></url>`)
      .join('\n');
    await writeFile(
      new URL('../dist/sitemap.xml', import.meta.url),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  }
  console.log(
    'Prerendered /about and /feedback.' +
      (siteUrl
        ? ' Canonicals and sitemap generated.'
        : ' Set VITE_SITE_URL for production canonicals and sitemap.'),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
