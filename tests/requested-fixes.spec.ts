import { test, expect } from '@playwright/test';
import { loginAdmin, register } from './helpers.ts';
import { deadlineScenario } from '../src/features/negotiation/data/deadline.ts';

const headers = { 'X-Arena-Request': '1' };

test('achievements show six readable cards on desktop and three on mobile, including resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await register(page);
  await page.goto('/profile');
  const panel = page.locator('.achievements-card');
  const cards = panel.locator('.achievement-item');
  const pages = panel.getByRole('navigation', { name: 'Страницы достижений' });
  await expect(cards).toHaveCount(6);
  await expect(pages).toContainText('Страница 1 из 2');
  const positions = await cards.evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y) };
    }),
  );
  expect(new Set(positions.map((box) => box.x)).size).toBe(2);
  expect(new Set(positions.map((box) => box.y)).size).toBe(3);
  await expect(cards.first().locator('.achievement-title-row strong')).toHaveCSS(
    'font-size',
    '16px',
  );
  await expect(cards.first().locator('p')).toHaveCSS('font-size', '14px');
  await expect(cards.first()).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: /^Тема оформления:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Тёмная', exact: true }).click();
  await panel.screenshot({ path: 'test-results/fixes-achievements-desktop.png' });
  await pages.getByRole('button', { name: 'Далее' }).click();
  await expect(cards).toHaveCount(2);
  const lastPageTitle = await cards.first().locator('.achievement-title-row strong').innerText();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(pages).toContainText('Страница 3 из 3');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText(lastPageTitle);
  await pages.getByRole('button', { name: 'Назад' }).click();
  await pages.getByRole('button', { name: 'Назад' }).click();
  await expect(cards).toHaveCount(3);
  expect(
    await cards.evaluateAll(
      (items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().x))).size,
    ),
  ).toBe(1);
  await panel.screenshot({ path: 'test-results/fixes-achievements-mobile.png' });
  for (const width of [320, 620, 621, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(cards).toHaveCount(width <= 620 ? 3 : 6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('reaction rating keeps the scroll position and fits narrow and wide inspector panels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await loginAdmin(page);
  const created = await page.request.post('/api/editor', {
    headers,
    data: { sourceId: deadlineScenario.metadata.id },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await page.goto(`/admin/scenarios/${id}`);
  await page.locator('.maker-reaction-list button').first().click();
  const inspector = page.locator('.maker-inspector');
  const choices = page.locator('.maker-penalty-choice');
  const separator = page.getByRole('separator', { name: 'Ширина панели свойств' });

  for (const size of ['Home', 'End']) {
    await separator.focus();
    await page.keyboard.press(size);
    await choices.scrollIntoViewIfNeeded();
    const before = await inspector.evaluate((element) => ({
      top: element.scrollTop,
      page: scrollY,
    }));
    expect(before.top).toBeGreaterThan(0);
    await choices.locator('label').nth(2).click();
    await expect(choices.getByRole('radio').nth(2)).toBeChecked();
    await expect
      .poll(() =>
        inspector.evaluate((element, top) => Math.abs(element.scrollTop - top), before.top),
      )
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => scrollY)).toBe(before.page);
    await page.keyboard.press('ArrowLeft');
    await expect(choices.getByRole('radio').nth(1)).toBeChecked();
    expect(
      await inspector.evaluate((element, top) => Math.abs(element.scrollTop - top), before.top),
    ).toBeLessThanOrEqual(1);
    const fits = await choices.locator('label').evaluateAll((labels) =>
      labels.every((label) => {
        const box = label.getBoundingClientRect();
        return (
          [...label.querySelectorAll('span,strong')].every((child) => {
            const text = child.getBoundingClientRect();
            return text.left >= box.left && text.right <= box.right && text.bottom <= box.bottom;
          }) && label.scrollWidth <= label.clientWidth
        );
      }),
    );
    expect(fits).toBe(true);
    await choices.screenshot({ path: `test-results/fixes-reaction-${size}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await choices.scrollIntoViewIfNeeded();
  const beforeMobile = await inspector.evaluate((element) => element.scrollTop);
  await choices.locator('label').first().click();
  await expect(choices.getByRole('radio').first()).toBeChecked();
  expect(
    await inspector.evaluate((element, top) => Math.abs(element.scrollTop - top), beforeMobile),
  ).toBeLessThanOrEqual(1);
});

test('published built-ins appear in management, open directly and show the 3–4 recommendation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAdmin(page);
  await page.goto('/admin/scenarios');
  await page.getByRole('button', { name: /^Опубликованные/ }).click();
  const row = page
    .locator('.admin-scenario-row')
    .filter({ has: page.locator(`a[href="/admin/scenarios/${deadlineScenario.metadata.id}"]`) });
  await expect(row).toContainText(deadlineScenario.metadata.title);
  await expect(row).toContainText('Опубликовано');
  await row.getByRole('link', { name: 'Открыть', exact: true }).click();
  await expect(page.locator('.maker-status')).toContainText('Опубликовано');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const range = page
    .locator('.maker-penalty-analysis > span')
    .filter({ hasText: 'Рекомендуемый диапазон' });
  await expect(range.locator('strong')).toHaveText('3–4');
  await page
    .locator('.maker-penalty-rule')
    .screenshot({ path: 'test-results/fixes-penalty-rule.png' });
});
