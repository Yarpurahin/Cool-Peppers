import { test, expect } from '@playwright/test';
import { loginAdmin } from './helpers.ts';

for (const width of [320, 390, 768, 1440]) {
  test(`public pages remain usable at ${width}px, even when API is unavailable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', (route) => route.abort());
    for (const path of ['/about', '/feedback']) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page).toHaveTitle(
        path === '/about' ? 'О проекте — Арена переговоров' : 'Обратная связь — Арена переговоров',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(
        page.getByRole('contentinfo').getByRole('link', {
          name: path === '/about' ? 'О проекте' : 'Обратная связь',
          exact: true,
        }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });
}

test('footer navigation updates metadata and moves keyboard focus', async ({ page }) => {
  await page.goto('/about');
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Обратная связь', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/feedback\/?$/);
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
    'content',
    /Свяжитесь с командой Арены/,
  );
  await page.getByText('Можно предложить свой сценарий?', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Можно предложить свой сценарий?' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.goBack();
  await expect(page).toHaveTitle('О проекте — Арена переговоров');
});

test('contact validates fields, preserves a failed draft, saves to the inbox and confirms receipt', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto('/feedback');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByLabel('Email для ответа')).toBeFocused();
  await expect(page.getByLabel('Email для ответа')).toHaveAttribute('aria-invalid', 'true');
  const message = `Предлагаю добавить сценарий обсуждения нагрузки ${crypto.randomUUID()}.`;
  const email = `contact-${crypto.randomUUID()}@example.test`;
  await page.getByLabel('Email для ответа').fill(email);
  await page.getByLabel('Ваше сообщение', { exact: true }).fill(message);
  await page.getByLabel('О чём хотите рассказать?').selectOption('idea');
  await page.route(
    '**/api/contact',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Сервис временно недоступен.' }),
      }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.locator('.contact-form-panel [role="alert"]')).toContainText(
    'Текст сообщения остался в форме',
  );
  await expect(page.getByRole('alert', { name: 'Уведомление сервиса' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
  await expect(page.getByLabel('Ваше сообщение', { exact: true })).toHaveValue(message);
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('heading', { name: 'Сообщение получено' })).toBeVisible();
  await expect(page.locator('.contact-success')).toBeFocused();
  await page.getByRole('button', { name: 'Написать ещё' }).click();
  await expect(page.getByLabel('Ваше сообщение', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('О чём хотите рассказать?')).toBeFocused();
  await loginAdmin(page);
  await page.goto('/admin/messages');
  await expect(page.locator('.contact-inbox-text').filter({ hasText: message })).toBeVisible();
  await expect(page.getByRole('link', { name: `Ответить: ${email}` })).toHaveAttribute(
    'href',
    /^mailto:/,
  );
  expect(problems).toEqual([]);
});

test('production HTML contains readable pages and SEO metadata before JavaScript runs', async ({
  request,
}) => {
  for (const path of ['/about', '/feedback']) {
    const response = await request.get(`http://127.0.0.1:3001${path}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-prerendered="true"');
    expect(html).toContain('<h1');
    expect(html).toContain(path === '/about' ? 'Договариваться' : 'Хорошие изменения');
    expect(html).toContain('application/ld+json');
    expect(html).toContain(path === '/about' ? 'AboutPage' : 'ContactPage');
    expect((html.match(/name="description"/g) ?? []).length).toBe(1);
    expect((html.match(/property="og:title"/g) ?? []).length).toBe(1);
    expect((html.match(/property="og:description"/g) ?? []).length).toBe(1);
    expect((html.match(/name="twitter:card"/g) ?? []).length).toBe(1);
  }
});

test('prerender hydrates with a saved theme and preserves metadata on subsequent routes', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('arena:theme', 'dark'));
  for (const path of ['/about', '/feedback']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Тема оформления: Тёмная' })).toBeVisible();
    await expect(page.locator('#page-structured-data')).toHaveCount(1);
    await page.screenshot({ path: `test-results/info-${path.slice(1)}-dark.png`, fullPage: true });
  }
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Сценарии', exact: true })
    .click();
  await expect(page).toHaveURL('/scenarios');
  await expect(page.locator('#page-structured-data')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/scenarios$/);
  expect(problems).toEqual([]);
});
