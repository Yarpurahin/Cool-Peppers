import { test, expect } from '@playwright/test';
import { loginAdmin } from './helpers.ts';
import type { AuthoringDraft } from '../src/features/maker/model/types.ts';
import { createBlankDefinition } from '../src/features/maker/model/adapter.ts';
import { config } from '../server/config.ts';

const headers = { 'X-Arena-Request': '1' };

test('theme menu works with keyboard, outside click, touch-sized layouts and saved preference', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Тема оформления:/ });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Системная', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(trigger).toBeFocused();
  await page.reload();
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: 'Тёмная', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Тема оформления' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('h1').click();
  await expect(page.getByRole('menu', { name: 'Тема оформления' })).toHaveCount(0);
  await expect(page.locator('.site-header').getByRole('link', { name: 'О проекте' })).toHaveCount(
    0,
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Тема оформления' });
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/refinements-theme-${width}.png`,
      animations: 'disabled',
    });
    await page.getByRole('menuitemradio', { name: 'Тёмная', exact: true }).click();
  }
});

test('FAQ animates its height and footer in both directions, with reduced motion support', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/feedback');
  await page.evaluate(() => document.fonts.ready);
  const question = page.getByRole('button', { name: 'С чего начать тренировку?' });
  const measureTransition = () =>
    page.evaluate(async () => {
      const item = document.querySelector('.accordion-item')!;
      const button = item.querySelector('button')!;
      const content = item.querySelector('.accordion-content')!;
      const footer = document.querySelector('footer')!;
      const measure = () => ({
        height: content.getBoundingClientRect().height,
        footer: footer.getBoundingClientRect().top + scrollY,
      });
      const frames = [measure()];
      button.click();
      const start = performance.now();
      while (performance.now() - start < 450) {
        await new Promise(requestAnimationFrame);
        frames.push(measure());
      }
      return frames;
    });
  const opening = await measureTransition();
  await expect(question).toHaveAttribute('aria-expanded', 'true');
  expect(opening.at(-1)!.height).toBeGreaterThan(60);
  expect(
    opening.some((frame) => frame.height > 3 && frame.height < opening.at(-1)!.height - 3),
  ).toBe(true);
  expect(
    opening.some(
      (frame) => frame.footer > opening[0].footer + 3 && frame.footer < opening.at(-1)!.footer - 3,
    ),
  ).toBe(true);
  const closing = await measureTransition();
  expect(closing.at(-1)!.height).toBe(0);
  expect(
    closing.some(
      (frame) => frame.footer < closing[0].footer - 3 && frame.footer > closing.at(-1)!.footer + 3,
    ),
  ).toBe(true);
  await expect(question).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.accordion-content').first()).toHaveAttribute('inert', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await question.click();
  expect(
    await page
      .locator('.accordion-content')
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration)),
  ).toBeLessThan(0.01);
  await page.goto('/about');
  await expect(
    page.locator('.about-page img, .about-page .panel, .about-page a[href="/scenarios"]'),
  ).toHaveCount(0);
});

test('double-click opens a different reaction from a closed drawer without moving the target', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await loginAdmin(page);
  const { id } = await (
    await page.request.post('/api/editor', { headers, data: { title: 'Реакции' } })
  ).json();
  const draft = (await (await page.request.get(`/api/editor/${id}`)).json()) as AuthoringDraft;
  const definition = createBlankDefinition(id, 'Реакции');
  definition.nodes[0].text = 'Обсудим условия?';
  definition.nodes[0].reactions = [
    { id: 'reaction-a', intent: 'a', label: 'Обсудить условия', examples: [], endingId: 'ending' },
    { id: 'reaction-b', intent: 'b', label: 'Уточнить предложение', examples: [] },
  ];
  definition.endings = [
    { id: 'ending', title: 'Продолжить обсуждение', description: '', type: 'neutral' },
  ];
  const saved = await page.request.put(`/api/editor/${id}`, {
    headers,
    data: {
      ...draft,
      definition,
      revision: draft.revision,
      editor: { positions: { node_1: { x: 0, y: 0 }, ending: { x: 420, y: 0 } } },
      // Only accepted draft fields belong in the request.
      publishedVersion: undefined,
      hasUnpublishedChanges: undefined,
      archivedAt: undefined,
    },
  });
  expect(saved.status()).toBe(200);
  await page.goto(`/admin/scenarios/${id}`);
  await expect(page.locator('.maker-card-reaction button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Закрыть свойства' }).click();
  const linked = page
    .locator('.maker-card-reaction button')
    .filter({ hasText: 'Обсудить условия' });
  const before = (await linked.boundingBox())!;
  await linked.click();
  await expect(page.locator('#maker-inspector')).toHaveCount(0);
  const after = (await linked.boundingBox())!;
  expect(Math.abs(before.x - after.x)).toBeLessThan(1);
  // Real spaced clicks, not a synthetic dblclick event.
  await linked.dblclick({ delay: 100 });
  await expect(page.getByLabel('Название реакции')).toBeFocused();
  await expect(page.getByLabel('Название реакции')).toHaveValue('Обсудить условия');
  await page.getByRole('button', { name: 'Закрыть свойства' }).click();
  await page
    .locator('.maker-card-reaction button')
    .filter({ hasText: 'Уточнить предложение' })
    .dblclick({ delay: 100 });
  await expect(page.getByLabel('Название реакции')).toBeFocused();
  await expect(page.getByLabel('Название реакции')).toHaveValue('Уточнить предложение');
  await linked.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Название реакции')).toBeFocused();
  await expect(page.getByLabel('Название реакции')).toHaveValue('Обсудить условия');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Скачать JSON' })).toHaveClass('maker-secondary');
  await expect(page.locator('body')).not.toContainText('Поддерживаются Arena JSON');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: /^Тема оформления:/ }).click();
  const menu = page.getByRole('menu', { name: 'Тема оформления' });
  await expect(menu).toBeVisible();
  const themeBox = (await menu.boundingBox())!;
  expect(themeBox.x).toBeGreaterThanOrEqual(0);
  expect(themeBox.x + themeBox.width).toBeLessThanOrEqual(390);
  await page.getByRole('menuitemradio', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/refinements-maker-mobile.png',
    animations: 'disabled',
  });
});

test('root sees created admins, can cancel or retry revocation, and list stays correct', async ({
  page,
}) => {
  if (process.env.PGLITE_UI) await loginAdmin(page);
  else {
    if (!config.bootstrapAdmin) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD for this test');
    const login = await page.request.post('/api/auth/login', {
      headers,
      data: { email: config.bootstrapAdmin.email, password: config.bootstrapAdmin.password },
    });
    expect(login.status()).toBe(200);
  }
  const created = await (
    await page.request.post('/api/admin/accounts', {
      headers,
      data: {
        name: 'Коллега',
        email: `remove-${crypto.randomUUID()}@example.test`,
        password: 'Editor-password-2026',
      },
    })
  ).json();
  await page.goto('/admin/accounts');
  const row = page.locator('.admin-accounts-list li').filter({ hasText: created.email });
  await expect(row).toBeVisible();
  await page.screenshot({
    path: 'test-results/refinements-accounts.png',
    animations: 'disabled',
    fullPage: true,
  });
  await row.getByRole('button', { name: 'Удалить администратора Коллега' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('button', { name: 'Отмена' })).toBeFocused();
  await page.screenshot({ path: 'test-results/refinements-revoke.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(row).toBeVisible();
  await row.getByRole('button').click();
  await page.route(
    `**/api/admin/accounts/${created.id}`,
    (route) => route.fulfill({ status: 500, json: { error: 'Temporary failure' } }),
    { times: 1 },
  );
  await modal.getByRole('button', { name: 'Снять права', exact: true }).click();
  await expect(modal.locator('.field-error')).toContainText('Сервис временно недоступен');
  await expect(page.getByRole('alert', { name: 'Уведомление сервиса' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
  await expect(page.getByRole('alert', { name: 'Уведомление сервиса' })).toHaveCount(0);
  await expect(row).toBeVisible();
  await modal.getByRole('button', { name: 'Снять права', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(page.locator('.account-notice')).toContainText('Права администратора Коллега сняты');
  await expect(page.getByRole('heading', { name: 'Команда администраторов' })).toBeFocused();
  await page.reload();
  await expect(row).toHaveCount(0);
});

test('inbox pagination is usable at mobile width', async ({ page }) => {
  await loginAdmin(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/admin/messages?*', (route) => {
    const second = new URL(route.request().url()).searchParams.get('offset') === '30';
    return route.fulfill({
      json: {
        messages: [
          {
            id: crypto.randomUUID(),
            topic: 'idea',
            email: 'participant@example.test',
            message: second ? 'Обращение на второй странице' : 'Обращение на первой странице',
            createdAt: '2026-09-27T10:00:00Z',
          },
        ],
        hasMore: !second,
      },
    });
  });
  await page.goto('/admin/messages');
  const pages = page.getByRole('navigation', { name: 'Страницы обращений' });
  await expect(pages.getByRole('button', { name: 'Назад' })).toBeDisabled();
  await pages.getByRole('button', { name: 'Далее' }).click();
  await expect(page.locator('.contact-inbox-text')).toHaveText('Обращение на второй странице');
  await expect(pages.locator('[aria-current="page"]')).toHaveText('Страница 2');
  await expect(pages.getByRole('button', { name: 'Далее' })).toBeDisabled();
  await pages.getByRole('button', { name: 'Назад' }).click();
  await expect(page.locator('.contact-inbox-text')).toHaveText('Обращение на первой странице');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/refinements-pagination.png', fullPage: true });
});
