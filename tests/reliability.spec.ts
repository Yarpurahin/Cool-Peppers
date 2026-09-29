import { test, expect } from '@playwright/test';
import { loginAdmin, register } from './helpers.ts';
import { config } from '../server/config.ts';
const notice = (page: import('@playwright/test').Page) =>
  page.getByRole('alert', { name: 'Уведомление сервиса' });

test('leaving an error replaces its history entry', async ({ page }) => {
  for (const error of ['/missing-route', '/scenarios/missing', '/404', '/500']) {
    await page.goto('/scenarios');
    await expect(page.locator('h1')).toContainText('У каждого разговора');
    await page.goto(error);
    await expect(page.locator('.error-page')).toBeVisible();
    await page.getByRole('link', { name: 'На главную', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.goBack();
    await expect(page).toHaveURL('/scenarios');
  }
});

test('offline startup preserves public pages and error routes with one dismissible notice', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(notice(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.goto('/missing');
  await expect(page.locator('.error-code')).toHaveText('404');
  await expect(notice(page)).toHaveCount(1);
});

test('failed server actions show one popup, preserve the page and can be attempted again', async ({
  page,
}) => {
  await register(page);
  await page.goto('/scenarios/terms');
  await expect(page.getByRole('button', { name: 'Начать переговоры' })).toBeEnabled();
  await page.route('**/api/scenarios/terms/attempts', (route) => route.abort());
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Начать переговоры' }).click();
    await expect(notice(page)).toHaveCount(1);
    await expect(page).toHaveURL('/scenarios/terms');
    await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
    await expect(notice(page)).toHaveCount(0);
  }
  await page.unroute('**/api/scenarios/terms/attempts');
  await page.getByRole('button', { name: 'Начать переговоры' }).click();
  await expect(page).toHaveURL('/scenarios/terms/play');
  await page.route('**/api/attempts/*/answers', (route) =>
    route.fulfill({ status: 500, contentType: 'text/html', body: 'private error details' }),
  );
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(notice(page)).toContainText('На сервере произошла ошибка');
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 1');
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.locator('body')).not.toContainText('private error details');
});

test('password validation is inline, avatar persists and history has no links or retry', async ({
  page,
}) => {
  await register(page);
  await page.goto('/profile');
  const change = page.getByRole('button', { name: 'Изменить пароль' });
  await expect(change).toBeDisabled();
  await page.getByLabel('Текущий пароль', { exact: true }).fill('Test-password-2026');
  await expect(change).toBeEnabled();
  await change.click();
  await expect(page.locator('.security-panel [role="alert"]')).toContainText('от 8 до 128');
  await page.getByLabel('Текущий пароль', { exact: true }).fill('');
  await expect(change).toBeDisabled();
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c34a27';
    context.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png');
  });
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page
    .getByLabel('Фото профиля', { exact: true })
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.locator('.avatar-settings')).toContainText('Фото профиля сохранено');
  await page.reload();
  await expect(page.locator('.account-trigger img')).toBeVisible();
  await expect(page.locator('.account-admin-mark')).toHaveCount(0);
  await expect(page.locator('.history-panel a')).toHaveCount(0);
  await page.route('**/api/me/history*', (route) => route.abort());
  await page.reload();
  await expect(notice(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0);
});

test('system theme, explicit choice, responsive pages and hero fallback', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('**/conversation-*.png', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.hero-image-fallback')).toBeVisible();
  await expect(page.locator('.visual-index')).toHaveCount(0);
  const theme = async (name: string) => {
    await page.getByRole('button', { name: /^Тема оформления:/ }).click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
  };
  await theme('Светлая');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await theme('Системная');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await theme('Тёмная');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/theme-${width}.png`, fullPage: true });
  }
});

test('root creates an admin without switching their own session', async ({ page }) => {
  if (process.env.PGLITE_UI) await loginAdmin(page);
  else {
    if (!config.bootstrapAdmin)
      throw new Error(
        'Для проверки главного администратора задайте ADMIN_EMAIL и ADMIN_PASSWORD в тестовом окружении и выполните db:setup.',
      );
    const login = await page.request.post('/api/auth/login', {
      headers: { 'X-Arena-Request': '1' },
      data: { email: config.bootstrapAdmin.email, password: config.bootstrapAdmin.password },
    });
    expect(login.status()).toBe(200);
  }
  await page.goto('/admin/accounts');
  await expect(page.locator('h1')).toHaveText('Администраторы');
  const email = `admin-${crypto.randomUUID()}@example.test`;
  await page.getByLabel('Имя', { exact: true }).fill('Новый администратор');
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('New-admin-password');
  await page.getByRole('button', { name: 'Создать администратора' }).click();
  await expect(page.locator('.account-notice')).toContainText(email);
  expect((await (await page.request.get('/api/auth/me')).json()).isSuperAdmin).toBe(true);
});

test('editor keeps drafts without dialogs, hides technical fields and edits reactions on double click', async ({
  page,
}) => {
  await loginAdmin(page);
  await page.setViewportSize({ width: 1440, height: 950 });
  const response = await page.request.post('/api/editor', {
    headers: { 'X-Arena-Request': '1' },
    data: { title: 'Проверка редактора' },
  });
  const { id } = await response.json();
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await page.goto(`/admin/scenarios/${id}`);
  await page.getByLabel('Реплика персонажа', { exact: true }).fill('Сохранённый текст');
  await expect(page.getByRole('combobox', { name: 'Этап', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Этапы/ })).toHaveCount(0);
  await expect(page.locator('.maker-card .react-flow__handle.target')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Реплика персонажа', { exact: true })).toHaveValue(
    'Сохранённый текст',
  );
  await page.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
  await page.getByLabel('Название реакции').fill('Обсудить');
  await expect(page.getByLabel(/intent/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть свойства' }).click();
  await page.locator('.maker-card-reaction button').dblclick();
  await expect(page.getByLabel('Название реакции')).toBeFocused();
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Проверка сценария' });
  const before = (await panel.boundingBox())!;
  const handle = page.getByRole('separator', { name: 'Размер панели проверки' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y - 70, { steps: 10 });
  await page.mouse.up();
  const after = (await panel.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width);
  expect(after.height).toBeGreaterThan(before.height);
  await page.screenshot({ path: 'test-results/maker-validation.png' });
  await page.getByRole('button', { name: 'Закрыть проверку' }).click();
  await page.getByRole('button', { name: 'К списку сценариев' }).click();
  await expect(page).toHaveURL('/admin/scenarios');
  expect(dialogs).toEqual([]);
});
