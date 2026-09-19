import { test, expect } from '@playwright/test';

async function choose(page: import('@playwright/test').Page, index: number) {
  await page.getByRole('radio', { name: /.*/ }).nth(index).check();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
}

test('full branch: confirm, restore, save/exit, result, feedback and restart', async ({ page }) => {
  await page.goto('/scenarios/terms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Переговоры об условиях работы');
  await page.getByRole('link', { name: 'Начать переговоры', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ответить', exact: true })).toBeDisabled();
  await page.getByRole('radio').nth(0).check();
  await expect(page.locator('.dialogue-message')).toContainText('Что для вас важно уточнить');
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.locator('.dialogue-message')).toContainText('180 000');
  await expect(page.locator('.dialogue-message')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Ответить', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 2');
  await choose(page, 1);
  await expect(page.locator('.dialogue-message')).toContainText(
    'письменном пересмотре через шесть месяцев',
  );
  await page.getByRole('button', { name: 'Сохранить и выйти' }).click();
  await expect(page).toHaveURL('/scenarios/terms');
  await page.getByRole('link', { name: 'Продолжить переговоры' }).click();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 3');
  await choose(page, 1);
  await expect(page.locator('.dialogue-message')).toContainText('пакет Б');
  await choose(page, 0);
  await expect(page).toHaveURL('/scenarios/terms/result');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Условия согласованы');
  await expect(page.locator('.score-circle strong')).toHaveText('1');
  await expect(page.locator('.review-item')).toHaveCount(4);
  await expect(page.locator('.review-item--penalty')).toHaveCount(1);
  await expect(page.locator('.review-item').nth(1)).toContainText('письменно зафиксируем');
  await page.reload();
  await expect(page.locator('.score-circle strong')).toHaveText('1');
  await page.getByRole('radio', { name: 'Да', exact: true }).check();
  await page.getByLabel('Что можно улучшить?').fill('Больше примеров');
  await page.getByRole('button', { name: 'Отправить отзыв' }).click();
  await expect(page.getByRole('status')).toContainText('Отзыв сохранён');
  await page.reload();
  await expect(page.getByLabel('Что можно улучшить?')).toHaveValue('Больше примеров');
  await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  await expect(page).toHaveURL('/scenarios/terms/play');
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 1');
  await expect(page.locator('.dialogue-history')).toHaveCount(0);
  await page.goto('/scenarios/terms/result');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Результата пока нет');
});

test('counteroffer and request-data branches end neutrally without a second round', async ({
  page,
}) => {
  for (const index of [3, 4]) {
    await page.goto('/scenarios/terms/play');
    await choose(page, 2);
    await choose(page, 2);
    await choose(page, index);
    await expect(page.locator('.dialogue-message')).toContainText(
      index === 3 ? 'проверить ваш пакет' : 'С этого начнём уточнение',
    );
    await choose(page, 2);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Обсуждение продолжается');
    await expect(page.locator('.review-item')).toHaveCount(4);
    await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  }
});

test('all four penalty choices still finish without failure under the total-questions rule', async ({
  page,
}) => {
  await page.goto('/scenarios/terms/play');
  for (const index of [3, 2, 0, 0]) await choose(page, index);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Условия согласованы');
  await expect(page.locator('.score-circle strong')).toHaveText('4');
  await expect(page.locator('.score-circle')).toContainText('порог 6');
});

test('direct result and damaged or outdated saves never show a fabricated result', async ({
  page,
}) => {
  await page.goto('/scenarios/terms/result');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Результата пока нет');
  await page.evaluate(() => localStorage.setItem('arena:attempt:v1:terms', '{invalid'));
  await page.reload();
  await expect(page.getByRole('status')).toContainText('устарело или повреждено');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Результата пока нет');
  await page.getByRole('link', { name: 'Начать переговоры', exact: true }).click();
  await choose(page, 0);
  await page.evaluate(() => {
    const key = 'arena:attempt:v1:terms';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.attempt.scenarioVersion = 999;
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 1');
  await expect(page.getByRole('status')).toContainText('устарело или повреждено');
});

test('blocked storage retains in-memory progress and save/exit does not falsely succeed', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
  });
  await page.goto('/scenarios/terms/play');
  await choose(page, 0);
  await expect(page.getByRole('status')).toContainText('Не удалось сохранить');
  await page.getByRole('button', { name: 'Сохранить и выйти' }).click();
  await expect(page).toHaveURL('/scenarios/terms/play');
  for (const index of [0, 1, 0]) await choose(page, index);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Условия согласованы');
  await expect(page.locator('.review-item')).toHaveCount(4);
  await expect(page.getByRole('status')).toContainText('Не удалось сохранить');
});

test('completed attempt survives back navigation and duplicate submission cannot skip a step', async ({
  page,
}) => {
  await page.goto('/scenarios/terms/play');
  await page.getByRole('radio').first().check();
  await page
    .getByRole('button', { name: 'Ответить', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator('.dialogue-header .badge')).toHaveText('Шаг 2');
  for (const index of [0, 0, 0]) await choose(page, index);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Эта тренировка уже завершена');
  await page.getByRole('link', { name: 'Посмотреть результат' }).click();
  await expect(page.locator('.review-item')).toHaveCount(4);
});

for (const width of [320, 390, 768, 1440]) {
  test(`long scenario replies and results fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/scenarios/terms/play');
    for (const index of [0, 0, 2, 0]) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1,
      );
      await choose(page, index);
    }
    await expect(page.locator('.review-item')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    );
  });
}
