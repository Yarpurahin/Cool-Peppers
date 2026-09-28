import { test, expect } from '@playwright/test';
import { loginAdmin } from './helpers.ts';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSf8AAAAASUVORK5CYII=',
  'base64',
);
const headers = { 'X-Arena-Request': '1' };

test('unsaved work survives reload; editing a field is one undo step and panel width persists', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1440, height: 950 });
  await loginAdmin(page);
  const { id } = await (
    await page.request.post('/api/editor', { headers, data: { title: 'Восстановление' } })
  ).json();
  await page.goto(`/admin/scenarios/${id}`);
  const text = page.getByLabel('Реплика персонажа');
  await text.pressSequentially('Добрый день');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(text).toHaveValue('');
  await page.keyboard.press('Control+y');
  await expect(text).toHaveValue('Добрый день');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(text).toHaveValue('');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(text).toHaveValue('Добрый день');
  await page.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
  await page.getByLabel('Название реакции').fill('Обсудить условия');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(text).toHaveValue('Добрый день');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Разрешить повторное прохождение').uncheck();
  await page.getByRole('button', { name: 'Основное', exact: true }).click();
  await page.getByLabel('Название сценария', { exact: true }).fill('Работа до сохранения');
  await page
    .getByLabel('Загрузить картинку')
    .setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.maker-cover-preview')).toBeVisible();
  await page.getByLabel('Описание изображения', { exact: true }).fill('Обложка переговоров');
  const separator = page.getByRole('separator', { name: 'Ширина панели свойств' });
  await separator.focus();
  const oldWidth = Number(await separator.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', String(oldWidth + 16));
  const bounds = (await separator.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 80, bounds.y + 80, { steps: 10 });
  await page.mouse.up();
  const resized = Number(await separator.getAttribute('aria-valuenow'));
  expect(resized).toBeGreaterThan(oldWidth + 60);
  await page.reload();
  await expect(text).toHaveValue('Добрый день');
  await expect(page.locator('.maker-heading h1')).toHaveText('Работа до сохранения');
  await expect(separator).toHaveAttribute('aria-valuenow', String(resized));
  await expect(page.locator('.maker-reaction-list')).toContainText('Обсудить условия');
  await expect(page.locator('.maker-inspector-heading code')).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('Разрешить повторное прохождение')).not.toBeChecked();
  await page.getByRole('button', { name: 'Основное', exact: true }).click();
  await expect(page.getByLabel('Описание изображения', { exact: true })).toHaveValue(
    'Обложка переговоров',
  );
  await expect(page.locator('.maker-cover-preview')).toHaveJSProperty('naturalWidth', 1);
  const server = await (await page.request.get(`/api/editor/${id}`)).json();
  expect(server.definition.nodes[0].text).toBe('');
  await page.getByLabel('Поиск реплики').focus();
  await expect(page.locator('.maker-search')).not.toHaveCSS('box-shadow', 'none');
  await expect(page.getByLabel('Поиск реплики')).toHaveCSS('outline-style', 'none');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.locator('.maker-notice')).toHaveText('Черновик сохранён.');
  await page.reload();
  await expect(text).toHaveValue('Добрый день');
  await expect(page.locator('.maker-save-status')).toHaveText('Сохранено на сервере');
  await text.fill('Локальная версия во время конфликта');
  const remote = await (await page.request.get(`/api/editor/${id}`)).json();
  remote.definition.nodes[0].text = 'Работа из другой вкладки';
  await page.request.put(`/api/editor/${id}`, {
    headers,
    data: {
      preview: remote.preview,
      definition: remote.definition,
      editor: remote.editor,
      revision: remote.revision,
    },
  });
  await page.reload();
  await expect(text).toHaveValue('Локальная версия во время конфликта');
  await expect(
    page.getByRole('button', { name: 'Сохранить черновик', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Загрузить серверную версию' }).click();
  await page.locator('.maker-node-list').first().getByRole('button').first().click();
  await expect(text).toHaveValue('Работа из другой вкладки');
});

test('maker sections stay selected and React Flow initializes before interaction', async ({
  page,
}) => {
  const flowWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('[React Flow]'))
      flowWarnings.push(message.text());
  });
  await page.setViewportSize({ width: 1180, height: 820 });
  await loginAdmin(page);
  const { id } = await (
    await page.request.post('/api/editor', { headers, data: { title: 'Проверка полотна' } })
  ).json();
  await page.goto(`/admin/scenarios/${id}`);
  await expect(page.getByTestId('maker-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть свойства' }).click();
  await page.getByRole('button', { name: 'Подсказки по работе с полотном' }).click();
  const help = page.getByRole('dialog', { name: 'Справка по полотну' });
  await help.getByRole('button', { name: 'История', exact: true }).click();
  await expect(help).toContainText('Ctrl + Y');
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 1280, height: 590 },
  ]) {
    await page.setViewportSize(viewport);
    for (const section of ['Полотно', 'Связи', 'История']) {
      await help.getByRole('button', { name: section, exact: true }).click();
      const bounds = (await help.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      await expect(help).toHaveCSS('overflow-y', 'visible');
    }
  }
  await page.screenshot({ path: 'test-results/maker-help-compact.png' });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Справка по полотну' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(150);
  await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Основное', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Основное', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(flowWarnings.filter((text) => /error#(?:004|015)/.test(text))).toEqual([]);
});

test('public version stays v1 until republish; test dismisses on backdrop and deletion hides the scenario', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1440, height: 950 });
  await loginAdmin(page);
  const { id } = await (
    await page.request.post('/api/editor', { headers, data: { sourceId: 'terms' } })
  ).json();
  await page.goto(`/admin/scenarios/${id}`);
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.maker-status')).toHaveText('Опубликовано · v1');
  await page.getByLabel('Реплика персонажа').fill('Новая редакция, ещё не опубликованная');
  await expect(page.locator('.maker-status')).toHaveText('Черновик v2 · опубликовано v1');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.locator('.maker-notice')).toHaveText('Черновик сохранён.');
  await page.reload();
  await expect(page.locator('.maker-status')).toHaveText('Черновик v2 · опубликовано v1');
  await page.getByRole('button', { name: 'Тестировать', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.maker-test-note').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(20, 160);
  await expect(page.locator('.maker-test-drawer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Тестировать', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'К списку сценариев' }).click();
  const row = page
    .locator('.admin-scenario-row')
    .filter({ has: page.locator(`a[href="/admin/scenarios/${id}"]`) });
  await expect(row).toContainText('Черновик v2 · опубликовано v1');
  await row.getByRole('button', { name: /Удалить сценарий/ }).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/editor/${id}`)).status()).toBe(404);
  const catalog = await (await page.request.get('/api/scenarios')).json();
  expect(catalog.some((item: { preview: { id: string } }) => item.preview.id === id)).toBe(false);
});

test('reaction ports switch sides when a target moves; the start port is hidden', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1440, height: 950 });
  await loginAdmin(page);
  const { id } = await (
    await page.request.post('/api/editor', { headers, data: { title: 'Направления' } })
  ).json();
  const draft = await (await page.request.get(`/api/editor/${id}`)).json();
  draft.definition.nodes[0].text = 'Первая реплика';
  draft.definition.nodes[0].reactions = [
    {
      id: 'left_reply',
      intent: 'continue',
      label: 'Продолжить',
      examples: [],
      evaluation: { grade: 'acceptable', penalty: 0, feedback: '' },
      nextNodeId: 'node_2',
    },
  ];
  draft.definition.nodes.push({
    ...structuredClone(draft.definition.nodes[0]),
    id: 'node_2',
    title: 'Вторая реплика',
    reactions: [],
  });
  draft.editor.positions = { node_1: { x: 380, y: 100 }, node_2: { x: 40, y: 320 } };
  await page.request.put(`/api/editor/${id}`, {
    headers,
    data: {
      preview: draft.preview,
      definition: draft.definition,
      editor: draft.editor,
      revision: draft.revision,
    },
  });
  await page.goto(`/admin/scenarios/${id}`);
  const handle = page.getByTestId('handle-left_reply');
  await expect(handle).toHaveClass(/react-flow__handle-left/);
  await expect(page.locator('[data-id="node_1"] .react-flow__handle.target')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Автораскладка', exact: true })).toHaveCount(0);
  const target = page.locator('.react-flow__node[data-id="node_2"]');
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Название блока')).toHaveValue('Вторая реплика');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveClass(/react-flow__handle-right/);
  await page.reload();
  await expect(handle).toHaveClass(/react-flow__handle-right/);
});

test('creation form recovers its fields and fits narrow screens; metadata and account remain accessible', async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto('/admin/scenarios');
  await page.getByRole('combobox', { name: 'Основа сценария' }).click();
  await page.getByRole('option', { name: 'Пустой сценарий', exact: true }).click();
  await page.getByLabel('Название сценария', { exact: true }).fill('Мобильный сценарий');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Основа сценария' })).toHaveAttribute(
    'value',
    '',
  );
  await expect(page.getByLabel('Название сценария', { exact: true })).toHaveValue(
    'Мобильный сценарий',
  );
  await expect(page.locator('.admin-sidebar-user')).toHaveCount(0);
  await expect(page.locator('summary.account-trigger')).toHaveAttribute(
    'aria-label',
    /администратор/,
  );
  await page.locator('summary.account-trigger').click();
  await expect(page.getByRole('link', { name: 'Профиль и безопасность' })).toBeVisible();
  await page.locator('summary.account-trigger').click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const button = page.getByRole('button', { name: 'Создать сценарий', exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-create-${width}.png`, fullPage: true });
  }
  await page.goto('/scenarios/terms');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Арена/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/scenarios\/terms$/,
  );
});

test('maker imports Arena JSON from settings and keeps the database scenario id', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 860 });
  await loginAdmin(page);
  const { id } = await (
    await page.request.post('/api/editor', { headers, data: { title: 'До импорта' } })
  ).json();
  const draft = await (await page.request.get(`/api/editor/${id}`)).json();
  draft.definition.metadata.id = 'external_scenario_id';
  draft.definition.metadata.title = 'Сценарий из JSON';
  draft.definition.metadata.description = 'Импортированная структура';
  draft.definition.nodes[0].text = 'Реплика из JSON';
  draft.definition.nodes[0].reactions = [
    {
      id: 'json_reaction',
      intent: 'continue_discussion',
      label: 'Продолжить',
      examples: ['Продолжим'],
      evaluation: { grade: 'acceptable', penalty: 0, feedback: 'Продолжает обсуждение.' },
      endingId: 'json_ending',
    },
  ];
  draft.definition.endings = [
    {
      id: 'json_ending',
      title: 'JSON-финал',
      description: 'Финал импортированного сценария',
      type: 'success',
      nextStep: 'Сохранить результат',
    },
  ];
  const file = {
    format: 'arena-scenario',
    formatVersion: 1,
    definition: draft.definition,
  };

  await page.goto(`/admin/scenarios/${id}`);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/maker-json-dark.png' });
  await page.getByLabel('Выбрать JSON-файл сценария').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });

  await expect(page.locator('.maker-heading h1')).toHaveText('Сценарий из JSON');
  await expect(page.locator('.maker-notice')).toContainText('JSON импортирован');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  const saved = await (await page.request.get(`/api/editor/${id}`)).json();
  expect(saved.definition.metadata.id).toBe(id);
  expect(saved.definition.metadata.title).toBe('Сценарий из JSON');
  expect(saved.definition.nodes[0].text).toBe('Реплика из JSON');
});
