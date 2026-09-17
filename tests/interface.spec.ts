import { test, expect } from '@playwright/test';

const routes = [
  '/',
  '/scenarios',
  '/register',
  '/login',
  '/profile',
  '/scenarios/new-deadline',
  '/scenarios/new-deadline/play',
  '/scenarios/new-deadline/result',
  '/scenarios/feedback',
  '/scenarios/feedback/play',
  '/scenarios/feedback/result',
  '/scenarios/terms',
  '/scenarios/terms/play',
  '/scenarios/terms/result',
  '/editor',
  '/editor/new-deadline',
  '/404',
  '/500',
  '/unknown-route',
  '/scenarios/missing',
];

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`direct routes and no horizontal overflow at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    for (const path of routes) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const measurements = await page.evaluate(() => ({
        viewport: window.innerWidth,
        content: document.documentElement.scrollWidth,
        mainCount: document.querySelectorAll('main').length,
        brokenImages: [...document.images]
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.src),
      }));
      expect(measurements.content, `${path}: ${JSON.stringify(measurements)}`).toBeLessThanOrEqual(
        width + 1,
      );
      expect(measurements.mainCount, path).toBe(1);
      expect(measurements.brokenImages, path).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test('SPA transitions preserve the document and support browser history', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.dataset.spaTest = 'original-document';
  });
  await page.getByRole('link', { name: 'Выбрать сценарий' }).click();
  await expect(page).toHaveURL('/scenarios');
  await page.getByLabel('Найти сценарий или навык').fill('обратную');
  await expect(page.locator('.scenario-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Обсудить обратную связь — открыть сценарий' }).click();
  await expect(page).toHaveURL('/scenarios/feedback');
  await page.goBack();
  await expect(page.getByLabel('Найти сценарий или навык')).toHaveValue('обратную');
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Обсудить обратную связь');
  expect(await page.evaluate(() => document.documentElement.dataset.spaTest)).toBe(
    'original-document',
  );
});

test('catalog combines filters, supports empty results and reset', async ({ page }) => {
  await page.goto('/scenarios');
  await page.getByLabel('Категория', { exact: true }).selectOption('Карьера');
  await page.getByLabel('Сложность', { exact: true }).selectOption('Средний');
  await expect(page.locator('.scenario-card')).toHaveCount(1);
  await page.getByLabel('Найти сценарий или навык').fill('несуществующая ситуация');
  await expect(page.getByRole('heading', { name: 'Пока ничего не нашлось' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.locator('.scenario-card')).toHaveCount(3);
  await expect(page).toHaveURL('/scenarios');
});

test('auth validates form without pretending login or sending credentials', async ({ page }) => {
  const submissions: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') submissions.push(request.url());
  });
  await page.goto('/register');
  await page.getByLabel('Как к вам обращаться').fill('Тестовый участник');
  await page.getByLabel('Электронная почта').fill('test@example.ru');
  await page.getByLabel('Пароль', { exact: true }).fill('example123');
  await page.getByLabel('Повторите пароль', { exact: true }).fill('different123');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page.getByRole('alert')).toContainText('Пароли не совпадают');
  await page.getByLabel('Повторите пароль', { exact: true }).fill('example123');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page.getByRole('dialog')).toContainText('Аккаунт не создан');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL('/register');
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
  await page.goto('/login');
  await page.getByLabel('Электронная почта').fill('test@example.ru');
  await page.getByLabel('Пароль', { exact: true }).fill('example123');
  await page.getByRole('button', { name: 'Показать: пароль' }).click();
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Вход не выполнен');
  await expect(page).toHaveURL('/login');
  expect(submissions).toEqual([]);
});

test('dialogue never advances and result is clearly a sample', async ({ page }) => {
  await page.goto('/scenarios/terms/play');
  await expect(page.getByRole('button', { name: 'Ответить' })).toBeDisabled();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Ответить' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ответ не отправлен');
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page).toHaveURL('/scenarios/terms/play');
  await expect(page.locator('.dialogue-message')).toContainText('140 000 рублей');
  await page.getByRole('link', { name: 'Пример разбора' }).click();
  await expect(page.locator('.demo-notice')).toContainText('не оценивают ваши действия');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Нашли вариант для обсуждения');
});

test('mobile menu, keyboard focus and dialog focus return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Открыть меню' });
  await toggle.click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name: 'Сценарии', exact: true }).click();
  await expect(page).toHaveURL('/scenarios');
  await expect(page.getByRole('navigation')).not.toBeVisible();
  const about = page.getByRole('button', { name: 'О проекте' });
  await about.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(about).toBeFocused();
});

test('preview alignment and requested removals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/scenarios/new-deadline');
  const left = await page.locator('.preview-content').boundingBox();
  const right = await page.locator('.counterpart-card').boundingBox();
  expect(Math.abs(left!.y + left!.height - right!.y - right!.height)).toBeLessThan(2);
  await page.goto('/');
  await expect(page.getByText('Как это работает', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Три шага к лучшему разговору')).toHaveCount(0);
  await page.goto('/profile');
  await expect(page.getByText('Ваши сильные стороны')).toHaveCount(0);
  await expect(page.locator('main aside')).toHaveCount(0);
  for (const code of [404, 500]) {
    await page.goto(`/${code}`);
    await expect(page.locator('main').getByRole('link')).toHaveCount(1);
    await expect(page.locator('main').getByRole('link', { name: 'На главную' })).toBeVisible();
  }
});

test('editor switches tabs and nodes, saving is a clear placeholder', async ({ page }) => {
  await page.goto('/editor/new-deadline');
  await page.getByRole('tab', { name: 'Диалог' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Описание' })).toBeFocused();
  await page.getByLabel('Тон собеседника').selectOption('Строгий');
  await page.getByRole('tab', { name: 'Диалог' }).click();
  await page.getByRole('button', { name: '02 Уточнение интересов' }).click();
  await expect(page.getByLabel('Реплика персонажа')).toHaveValue(/встреча с инвестором/);
  await page.getByLabel('Название вопроса').fill('Новый заголовок');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Сценарий не сохранён');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByLabel('Название вопроса')).toHaveValue('Начало разговора');
});
