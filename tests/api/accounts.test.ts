import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Pool } from 'pg';
import { createPglitePool } from '../support/pglite.ts';
import { createApp } from '../../server/app.ts';
import { migrate } from '../../server/migrate.ts';
import { seed } from '../../server/seed.ts';
import { config } from '../../server/config.ts';
import type { User } from '../../src/types/api.ts';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('root account, admin creation and private avatar persistence', async () => {
  const pool = await createPglitePool();
  config.bootstrapAdmin = {
    name: 'Root',
    email: 'root@example.test',
    password: 'Root-password-2026',
  };
  await migrate(pool);
  await seed(pool);
  const server = createApp(pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api`;
  const actor = () => {
    let cookie = '';
    return async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          cookie,
          ...(method === 'GET'
            ? {}
            : { 'Content-Type': 'application/json', 'X-Arena-Request': '1' }),
        },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
      return {
        status: response.status,
        data:
          response.status === 204 ? null : ((await response.json()) as User & { error?: string }),
      };
    };
  };
  try {
    const root = actor();
    const ordinary = actor();
    const created = actor();
    const guest = actor();
    assert.equal(
      (
        await root(
          '/auth/login',
          'POST',
          config.bootstrapAdmin && {
            email: config.bootstrapAdmin.email,
            password: config.bootstrapAdmin.password,
          },
        )
      ).data?.isSuperAdmin,
      true,
    );
    const input = {
      name: 'Editor',
      email: 'editor@example.test',
      password: 'Editor-password-2026',
    };
    assert.equal((await guest('/admin/accounts', 'POST', input)).status, 401);
    assert.equal(
      (
        await ordinary('/auth/register', 'POST', {
          ...input,
          email: 'user@example.test',
          role: 'admin',
        })
      ).status,
      422,
    );
    await ordinary('/auth/register', 'POST', { ...input, email: 'user@example.test' });
    assert.equal((await ordinary('/admin/accounts', 'POST', input)).status, 403);
    const saved = await root('/admin/accounts', 'POST', input);
    assert.equal(saved.status, 201);
    assert.equal(saved.data?.role, 'admin');
    assert.equal(saved.data?.isSuperAdmin, false);
    assert.ok(saved.data);
    assert.equal('password' in saved.data, false);
    assert.equal('password_hash' in saved.data, false);
    assert.equal((await root('/auth/me')).data?.email, 'root@example.test');
    assert.equal((await root('/admin/accounts', 'POST', input)).status, 409);
    assert.equal(
      (
        await root('/admin/accounts', 'POST', {
          ...input,
          email: 'short@example.test',
          password: 'short',
        })
      ).status,
      422,
    );
    await created('/auth/login', 'POST', { email: input.email, password: input.password });
    assert.equal(
      (await created('/admin/accounts', 'POST', { ...input, email: 'nested@example.test' })).status,
      403,
    );
    assert.equal(
      (await root('/me', 'PATCH', { name: 'Renamed Root', email: 'new-root@example.test' })).data
        ?.isSuperAdmin,
      true,
    );
    await guest('/auth/register', 'POST', { ...input, email: 'root@example.test' });
    await seed(pool);
    assert.equal((await guest('/auth/me')).data?.isSuperAdmin, false);
    assert.equal(
      (await guest('/admin/accounts', 'POST', { ...input, email: 'forged@example.test' })).status,
      403,
    );
    assert.equal((await ordinary('/me/avatar', 'PATCH', { avatar: png })).data?.avatar, png);
    assert.equal((await ordinary('/auth/me')).data?.avatar, png);
    assert.equal((await root('/auth/me')).data?.avatar, null);
    for (const avatar of [
      'data:image/svg+xml;base64,PHN2Zz4=',
      'https://example.test/a.png',
      'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAA',
    ])
      assert.equal((await ordinary('/me/avatar', 'PATCH', { avatar })).status, 422);
    assert.equal(
      (await ordinary('/me/avatar', 'PATCH', { avatar: null, isSuperAdmin: true })).status,
      422,
    );
    assert.equal((await ordinary('/me/avatar', 'PATCH', { avatar: null })).data?.avatar, null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

test('unexpected server errors use 500, connection failures use 503, internals stay private', async () => {
  let problem: Error & { code?: string } = new Error('private database details');
  const pool = {
    query: async () => {
      throw problem;
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const url = `http://127.0.0.1:${address.port}/api/health`;
    const response = await fetch(url);
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /private database/);
    problem = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    assert.equal((await fetch(url)).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
