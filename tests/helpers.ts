import pg from 'pg';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
export async function register(page: Page) {
  const account = {
    name: 'Тестовый участник',
    email: `ui-${crypto.randomUUID()}@example.test`,
    password: 'Test-password-2026',
  };
  const response = await page.request.post('/api/auth/register', {
    headers: { 'X-Arena-Request': '1' },
    data: account,
  });
  expect(response.status()).toBe(201);
  return account;
}
export async function choose(page: Page, index: number) {
  await page.getByRole('radio').nth(index).check();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ответить', exact: true })).toBeDisabled();
}

export async function promoteToAdmin(email: string) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for admin UI tests');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query(`UPDATE app_users SET role = 'admin', updated_at = now() WHERE email = $1`, [
      email,
    ]);
  } finally {
    await pool.end();
  }
}

export async function loginAdmin(page: Page) {
  if (process.env.PGLITE_UI) {
    const response = await page.request.post('/api/auth/login', {
      headers: { 'X-Arena-Request': '1' },
      data: { email: 'maker-ui@example.test', password: 'Maker-ui-test-2026' },
    });
    expect(response.status()).toBe(200);
  } else {
    const account = await register(page);
    await promoteToAdmin(account.email);
  }
}
