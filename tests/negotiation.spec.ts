import { test, expect } from '@playwright/test';
import { choose, register } from './helpers.ts';

test('full attempt persists across reload, feedback and restart preserves history', async ({
  page,
}) => {
  await register(page);
  await page.goto('/scenarios/terms/play');
  await expect(page.getByRole('button', { name: 'Ответить', exact: true })).toBeDisabled();
  await choose(page, 0);
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 2');
  await page.reload();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 2');
  await choose(page, 1);
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 3');
  await page.getByRole('button', { name: 'Сохранить и выйти' }).click();
  await page.getByRole('link', { name: 'Продолжить переговоры' }).click();
  await choose(page, 1);
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 4');
  await page.getByRole('radio').nth(0).check();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page).toHaveURL('/scenarios/terms/result');
  await expect(page.locator('.review-item')).toHaveCount(4);
  await page.getByRole('radio', { name: 'Да', exact: true }).check();
  await page.getByLabel('Что можно улучшить?').fill('Больше примеров');
  await page.getByRole('button', { name: 'Отправить отзыв' }).click();
  await expect(page.getByRole('status')).toContainText('Отзыв сохранён');
  await page.reload();
  await expect(page.getByLabel('Что можно улучшить?')).toHaveValue('Больше примеров');
  await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 1');
  await page.goto('/profile');
  await expect(page.locator('.history-row')).toHaveCount(2);
  await page.getByRole('link', { name: 'Разбор', exact: true }).click();
  await expect(page.locator('.review-item')).toHaveCount(4);
});

test('failed save does not advance question and retry persists once', async ({ page }) => {
  await register(page);
  await page.goto('/scenarios/terms/play');
  await page.route('**/api/attempts/*/answers', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Тестовая ошибка соединения' }),
    }),
  );
  await page.getByRole('radio').nth(0).check();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Тестовая ошибка соединения');
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 1');
  await page.unroute('**/api/attempts/*/answers');
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 2');
  await page.reload();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 2');
});

test('all playable built-in scenarios require sign-in', async ({ page }) => {
  for (const id of ['terms', 'new-deadline', 'feedback']) {
    await page.goto(`/scenarios/${id}/play`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.locator('h1')).toHaveText('Рады видеть вас');
  }
});

test('long dialogue fits a mobile viewport', async ({ page }) => {
  await register(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/scenarios/terms/play');
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/negotiation-mobile.png', fullPage: true });
});
