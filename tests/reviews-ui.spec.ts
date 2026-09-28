import { test, expect } from '@playwright/test';
import { loginAdmin, register } from './helpers.ts';
import type { AttemptDetail } from '../src/types/api.ts';
import type { ScenarioReviewInbox } from '../src/types/reviews.ts';

test('review confirms only a successful save, survives reload and appears in the admin inbox', async ({
  page,
}) => {
  const account = await register(page);
  const headers = { 'X-Arena-Request': '1' };
  let detail = (await (
    await page.request.post('/api/scenarios/terms/attempts', { headers, data: {} })
  ).json()) as AttemptDetail;
  while (detail.attempt.status === 'in-progress') {
    const currentNodeId = detail.attempt.currentNodeId;
    const node = detail.definition.nodes.find((item) => item.id === currentNodeId)!;
    detail = (await (
      await page.request.post(`/api/attempts/${detail.attempt.id}/answers`, {
        headers,
        data: {
          nodeId: node.id,
          answerId: node.answers[0].id,
          expectedAnswers: detail.attempt.history.length,
        },
      })
    ).json()) as AttemptDetail;
  }
  const attemptId = detail.attempt.id;
  const comment = `Больше примеров для сложных разговоров — ${crypto.randomUUID()}`;
  await page.goto('/scenarios/terms/result');
  await page.getByRole('radio', { name: 'Не совсем', exact: true }).check();
  await page.getByLabel('Что можно улучшить?').fill(comment);
  await page.route(
    '**/api/attempts/*/feedback',
    (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unavailable' }),
      }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Отправить отзыв' }).click();
  await expect(page.locator('.feedback-message')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Спасибо, ваш отзыв отправлен' })).toHaveCount(0);
  await expect(page.getByLabel('Что можно улучшить?')).toHaveValue(comment);
  await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
  let release!: () => void;
  let requests = 0;
  await page.route('**/api/attempts/*/feedback', async (route) => {
    requests += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await page.getByRole('button', { name: 'Отправить отзыв' }).click();
  await expect(page.getByRole('button', { name: 'Отправляем…' })).toBeDisabled();
  await expect(page.getByLabel('Что можно улучшить?')).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  const before = (await page.locator('.feedback-panel').boundingBox())!;
  release();
  const confirmation = page.getByRole('status', { name: 'Спасибо, ваш отзыв отправлен' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Спасибо, ваш отзыв отправлен' }),
  ).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Что можно улучшить?' })).toHaveCount(0);
  expect(
    Math.abs((await page.locator('.feedback-panel').boundingBox())!.height - before.height),
  ).toBeLessThan(2);
  await page.screenshot({
    path: 'test-results/review-confirmation.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.unroute('**/api/attempts/*/feedback');
  await page.reload();
  await expect(confirmation).toBeVisible();
  await page.getByRole('button', { name: 'Изменить отзыв' }).click();
  await expect(page.getByLabel('Что можно улучшить?')).toBeFocused();
  await expect(page.getByLabel('Что можно улучшить?')).toHaveValue(comment);
  await page.getByRole('radio', { name: 'Да', exact: true }).check();
  await page.getByRole('button', { name: 'Отправить отзыв' }).click();
  await expect(confirmation).toBeVisible();
  await page.goto(`/attempts/${attemptId}`);
  await expect(confirmation).toBeVisible();
  await page.getByRole('button', { name: 'Изменить отзыв' }).click();
  await expect(page.getByLabel('Что можно улучшить?')).toHaveValue(comment);

  await loginAdmin(page);
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Отзывы', exact: true }).click();
  const card = page.locator('.review-card').filter({ hasText: comment });
  await expect(card).toContainText(account.name);
  await expect(card.locator('.review-rating')).toHaveText('Полезно');
  await page.getByRole('combobox', { name: 'Оценка практики' }).click();
  await page.getByRole('option', { name: 'Не совсем', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(card).toBeVisible();
});

test('review filters reset pagination; long entries and dropdowns fit light/dark mobile layouts', async ({
  page,
}) => {
  await loginAdmin(page);
  const queries: URLSearchParams[] = [];
  await page.route('**/api/admin/reviews?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const secondPage = Number(query.get('offset')) > 0;
    const filtered = query.has('helpful');
    const data: ScenarioReviewInbox = {
      hasMore: !secondPage && !filtered,
      total: filtered ? 1 : 31,
      helpfulCount: 0,
      scenarios: [{ id: 'terms', title: 'Переговоры об условиях работы' }],
      reviews: [
        {
          attemptId: crypto.randomUUID(),
          scenarioId: 'terms',
          scenarioTitle: 'Переговоры об условиях работы',
          scenarioVersion: 2,
          authorName: 'Участник с длинным именем',
          helpful: false,
          comment: secondPage
            ? 'Вторая страница'
            : 'Хотелось бы больше примеров ответов и подробный разбор сложных ситуаций.\n' +
              'длинноеслово'.repeat(12),
          createdAt: '2026-09-27T10:00:00Z',
          updatedAt: '2026-09-27T12:00:00Z',
          archived: true,
          deleted: false,
        },
      ],
    };
    return route.fulfill({ json: data });
  });
  await page.goto('/admin/reviews');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.locator('.review-comment')).toHaveText('Вторая страница');
  await page.getByRole('combobox', { name: 'Оценка практики' }).click();
  await page.getByRole('option', { name: 'Не совсем', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.get('offset')).toBe('0');
  await expect(page.getByRole('navigation', { name: 'Страницы отзывов' })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.screenshot({
      path: `test-results/reviews-${theme}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByRole('combobox', { name: 'Сценарий', exact: false }).click();
    await expect(page.getByRole('listbox')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/reviews-mobile-${theme}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
  }
});

test('select-only menus support keyboard cancellation, typeahead, labels and native-dialog placement', async ({
  page,
}) => {
  await page.goto('/scenarios');
  const level = page.getByRole('combobox', { name: 'Сложность', exact: true });
  await level.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(level).toHaveText('Любая сложность');
  await expect(level).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(level).not.toHaveText('Любая сложность');
  await expect(page).toHaveURL(/level=/);
  await page.goto('/feedback');
  const topic = page.getByRole('combobox', { name: 'О чём хотите рассказать?' });
  await page.getByText('О чём хотите рассказать?', { exact: true }).click();
  await expect(topic).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(topic).toHaveText('Что-то не работает');
  await expect(page.getByLabel('Email для ответа')).toBeFocused();
  expect(
    await page
      .locator('form[aria-labelledby="contact-form-title"]')
      .evaluate((form) => new FormData(form as HTMLFormElement).get('topic')),
  ).toBe('issue');
  await topic.focus();
  await topic.dispatchEvent('keydown', { key: 'с' });
  await page.keyboard.press('Enter');
  await expect(topic).toHaveText('Сотрудничество');
  await expect(page.locator('select')).toHaveCount(0);

  await loginAdmin(page);
  await page.goto('/admin/achievements');
  await page.getByRole('button', { name: 'Новое достижение', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  const condition = dialog.getByRole('combobox', { name: /^Тип условия/ });
  await condition.click();
  await expect(dialog.getByRole('listbox')).toBeVisible();
  await page.getByRole('option', { name: 'Успех на выбранной сложности', exact: true }).click();
  const difficulty = dialog.getByRole('combobox', { name: /^Сложность сценария/ });
  await difficulty.click();
  await page.getByRole('option', { name: 'Начальный', exact: true }).click();
  await expect(difficulty).toHaveText('Начальный');
  await difficulty.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(difficulty).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await condition.click();
  await expect(dialog.getByRole('listbox')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/achievement-select-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('account card has flat fills and auth panels use subdued colors in both themes', async ({
  page,
}) => {
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    for (const path of ['/login', '/register']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(path);
      await expect(page.locator('.auth-story')).toBeVisible();
      expect(
        await page.locator('.auth-story').evaluate((node) => {
          const style = getComputedStyle(node);
          const sample = document.createElement('span');
          sample.style.background = 'var(--green)';
          node.append(sample);
          const accent = getComputedStyle(sample).backgroundColor;
          sample.remove();
          return style.backgroundColor !== accent;
        }),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/auth-${path.slice(1)}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await register(page);
  await page.goto('/profile');
  await page.locator('summary.account-trigger').click();
  await expect(page.locator('.account-profile-card')).toHaveCSS('background-image', 'none');
  for (const avatar of await page.locator('.account-avatar').all())
    await expect(avatar).toHaveCSS('background-image', 'none');
});
