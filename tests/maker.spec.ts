import { test, expect } from '@playwright/test';
import { loginAdmin } from './helpers.ts';

test('maker: create, connect, validate, test, save positions, publish and play', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 950 });
  await loginAdmin(page);
  await page.goto('/admin/scenarios');
  await page.getByRole('combobox', { name: 'Основа сценария' }).click();
  await page.getByRole('option', { name: 'Пустой сценарий', exact: true }).click();
  await page.getByLabel('Название сценария', { exact: true }).fill('Переговоры о зарплате — maker');
  await page.getByRole('button', { name: 'Создать сценарий', exact: true }).click();
  await expect(page.locator('.maker-card')).toBeVisible();
  const scenarioId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Основное', exact: true }).click();
  await page.getByLabel('Короткое описание').fill('Обсудите ожидания и найдите общий вариант.');
  await page.locator('.maker-node-list').first().getByRole('button').first().click();
  await page.getByLabel('Реплика персонажа').fill('Какую зарплату вы ожидаете?');
  await page.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
  await page.getByLabel('Название реакции').fill('Назвать сумму');
  await page.getByRole('button', { name: 'Добавить пример', exact: true }).click();
  await page.getByLabel('Пример фразы 1').fill('Рассчитываю на 200 тысяч');
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /У реакции должен быть ровно один переход/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть проверку' }).click();
  // Drag the reaction port into empty canvas: new block and connection are created together.
  const handle = page.locator('.react-flow__handle.source').first();
  const port = (await handle.boundingBox())!;
  const canvas = (await page.getByTestId('maker-canvas').boundingBox())!;
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.78, canvas.y + canvas.height * 0.76, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Создать переход' })).toBeVisible();
  await page.getByRole('button', { name: 'Новый финал', exact: true }).click();
  await expect(page.getByLabel('Описание финала')).toBeFocused();
  await page.getByLabel('Название финала').fill('Договорились');
  await page.getByRole('combobox', { name: 'Тип финала' }).click();
  await page.getByRole('option', { name: 'Успех', exact: true }).click();
  await page.getByLabel('Описание финала').fill('Стороны согласовали предложение.');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  // Saving an end position must not change the graph.
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.locator('.maker-notice')).toHaveText('Черновик сохранён.');
  const initial = await (await page.request.get(`/api/editor/${scenarioId}`)).json();
  const endId = initial.definition.endings[0].id;
  const endCard = page.locator(`[data-id="${endId}"].react-flow__node`);
  await page.getByRole('button', { name: 'Показать весь граф' }).click();
  await expect(endCard).toBeInViewport();
  const rect = (await endCard.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 20);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + 65, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.locator('.maker-notice')).toHaveText('Черновик сохранён.');
  const moved = await (await page.request.get(`/api/editor/${scenarioId}`)).json();
  expect(moved.definition).toEqual(initial.definition);
  expect(moved.editor.positions[endId]).not.toEqual(initial.editor.positions[endId]);
  await page.reload();
  await expect(page.locator('.maker-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('Сценарий готов к прохождению')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть проверку' }).click();
  await page.getByRole('button', { name: 'Тестировать', exact: true }).click();
  await expect(page.locator('.maker-test-speech')).toContainText('Какую зарплату вы ожидаете?');
  await expect(page.locator('.maker-test-drawer')).not.toContainText('Рассчитываю на 200 тысяч');
  await page.locator('.maker-test-choices').getByRole('button', { name: 'Назвать сумму' }).click();
  await expect(page.locator('.maker-test-ending')).toContainText('Договорились');
  await page.getByRole('button', { name: 'Закрыть тест' }).click();
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.maker-notice')).toHaveText('Опубликована версия 1.');
  await page.screenshot({ path: 'test-results/maker-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Свойства', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Закрыть свойства' }).click();
  await page.screenshot({ path: 'test-results/maker-mobile.png' });
  await page.goto(`/scenarios/${scenarioId}`);
  await page.getByRole('button', { name: 'Начать переговоры', exact: true }).click();
  await expect(page.locator('.dialogue-message')).toContainText('Какую зарплату вы ожидаете?');
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Договорились');
  await expect(page.locator('.result-page')).not.toContainText('Infinity');
  expect(errors).toEqual([]);
});

test('maker: duplicate, delete, undo and reaction editing preserve IDs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await loginAdmin(page);
  const result = await page.request.post('/api/editor', {
    headers: { 'X-Arena-Request': '1' },
    data: { sourceId: 'terms' },
  });
  const { id } = await result.json();
  await page.goto(`/editor/${id}`);
  await expect(page.locator('.maker-card')).toHaveCount(14);
  await page.getByRole('button', { name: 'Дублировать блок' }).click();
  await expect(page.locator('.maker-card')).toHaveCount(15);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByRole('button', { name: /Блок недостижим/ })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть проверку' }).click();
  await page.getByRole('button', { name: 'Удалить блок', exact: true }).click();
  await expect(page.locator('.maker-card')).toHaveCount(14);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.locator('.maker-card')).toHaveCount(15);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('.maker-card')).toHaveCount(14);
  await page.locator('.maker-node-list').first().getByRole('button').first().click();
  await page.locator('.maker-reaction-list').getByRole('button').first().click();
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
  const reactionCount = await page.locator('.maker-card-reaction').count();
  await page.keyboard.press('Delete');
  await expect(page.locator('.maker-card-reaction')).toHaveCount(reactionCount - 1);
  await expect(page.locator('.maker-card')).toHaveCount(14);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.locator('.maker-card-reaction')).toHaveCount(reactionCount);
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.locator('.maker-notice')).toHaveText('Черновик сохранён.');
  const saved = await (await page.request.get(`/api/editor/${id}`)).json();
  expect(saved.definition.schemaVersion).toBe(2);
  expect(saved.definition.nodes[0].reactions[0].evaluation).toBeDefined();
  await page.getByRole('button', { name: 'Тестировать', exact: true }).click();
  await expect(page.locator('.maker-test-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.maker-test-drawer')).toHaveCount(0);
});
