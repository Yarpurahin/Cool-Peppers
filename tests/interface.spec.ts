import { test, expect } from '@playwright/test';
import { register } from './helpers.ts';

for (const width of [390, 1440])
  test(`pages fit at ${width}px and use database-backed content`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await register(page);
    for (const path of ['/', '/scenarios', '/scenarios/terms', '/profile', '/editor', '/404']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Загружаем сценарии…');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
  });

test('catalog filters and SPA navigation preserve the document', async ({ page }) => {
  await page.goto('/scenarios');
  await expect(page.locator('h1')).toContainText('У каждого разговора');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__documentMarker = 'same-document';
  });
  await page.getByRole('searchbox').fill('условия');
  await expect(page.locator('.scenario-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('абракадабра');
  await expect(page.locator('.scenario-card')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page
    .getByRole('link', { name: 'Переговоры об условиях работы — открыть сценарий' })
    .click();
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__documentMarker),
  ).toBe('same-document');
  await page.goBack();
  await expect(page).toHaveURL('/scenarios');
});

test('registration form, profile editing, logout and login work', async ({ page }) => {
  const email = `form-${crypto.randomUUID()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Как к вам обращаться').fill('Андрей');
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Test-password-2026');
  await page.getByLabel('Повторите пароль', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page.getByRole('alert')).toContainText('Пароли не совпадают');
  await page.getByLabel('Повторите пароль', { exact: true }).fill('Test-password-2026');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page).toHaveURL('/profile');
  await page.getByLabel('Имя', { exact: true }).fill('Андрей Тест');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('status')).toContainText('Изменения сохранены');
  await page.reload();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Андрей Тест');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Test-password-2026');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Андрей Тест');
});

test('editor saves drafts, publishes and shows a persisted new scenario', async ({ page }) => {
  await register(page);
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Создать копию' }).click();
  await expect(page).toHaveURL(/\/editor\/custom-/);
  const title = `Сценарий ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('textbox', { name: 'Название сценария', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Черновик сохранён.');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Название сценария', exact: true })).toHaveValue(
    title,
  );
  await page.getByRole('tab', { name: 'Диалог', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Реплика персонажа', exact: true })
    .fill('Что для вас важно в новом предложении?');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Опубликована версия 1.');
  await page.getByRole('link', { name: 'Опубликованная версия' }).click();
  await expect(page.locator('h1')).toHaveText(title);
  await page.getByRole('link', { name: 'Начать переговоры', exact: true }).click();
  await expect(page.locator('.dialogue-message')).toContainText(
    'Что для вас важно в новом предложении?',
  );
});
