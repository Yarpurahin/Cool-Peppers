import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Pool } from 'pg';
import { createPglitePool } from '../support/pglite.ts';
import { createApp } from '../../server/app.ts';
import { migrate } from '../../server/migrate.ts';
import { seed } from '../../server/seed.ts';
import { config } from '../../server/config.ts';
import type { AdminAccount, AttemptDetail, User } from '../../src/types/api.ts';

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
    return async <T = User>(path: string, method = 'GET', body?: unknown) => {
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
        data: response.status === 204 ? null : ((await response.json()) as T & { error?: string }),
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

    // A revocation transfers every draft/version, preserves practice and expires every session.
    const rootId = (await root('/auth/me')).data!.id;
    const adminId = saved.data.id;
    assert.equal((await guest('/admin/accounts')).status, 403);
    assert.equal((await actor()('/admin/accounts')).status, 401);
    assert.equal((await created('/admin/accounts')).status, 403);
    const otherSession = actor();
    await otherSession('/auth/login', 'POST', { email: input.email, password: input.password });
    const scenario = (await created<{ id: string }>('/editor', 'POST', { sourceId: 'terms' }))
      .data!;
    assert.equal(
      (await created(`/editor/${scenario.id}/publish`, 'POST', { revision: 1 })).status,
      200,
    );
    await created(`/editor/${scenario.id}/archive`, 'POST');
    const deleted = (
      await created<{ id: string }>('/editor', 'POST', { title: 'Удалённый черновик' })
    ).data!;
    await created(`/editor/${deleted.id}`, 'DELETE');
    let practice = (await created<AttemptDetail>('/scenarios/terms/attempts', 'POST')).data!;
    while (practice.attempt.status === 'in-progress') {
      const currentNodeId = practice.attempt.currentNodeId;
      const node = practice.definition.nodes.find((node) => node.id === currentNodeId)!;
      practice = (
        await created<AttemptDetail>(`/attempts/${practice.attempt.id}/answers`, 'POST', {
          nodeId: node.id,
          answerId: node.answers[0].id,
          expectedAnswers: practice.attempt.history.length,
        })
      ).data!;
    }
    await created(`/attempts/${practice.attempt.id}/feedback`, 'PUT', {
      helpful: true,
      comment: 'Сохранить отзыв',
    });
    const versionsBefore = (
      await pool.query('SELECT * FROM scenario_versions WHERE scenario_id = $1', [scenario.id])
    ).rows;
    const attemptBefore = (await pool.query('SELECT * FROM attempts WHERE user_id = $1', [adminId]))
      .rows;
    const list = (await root<AdminAccount[]>('/admin/accounts')).data!;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, adminId);
    assert.equal(list[0].scenarioCount, 1);
    assert.equal('password_hash' in list[0], false);
    assert.equal((await root(`/admin/accounts/${rootId}`, 'DELETE')).status, 403);
    assert.equal((await ordinary(`/admin/accounts/${adminId}`, 'DELETE')).status, 403);
    assert.equal((await created(`/admin/accounts/${rootId}`, 'DELETE')).status, 403);
    assert.equal((await actor()(`/admin/accounts/${adminId}`, 'DELETE')).status, 401);
    assert.equal((await root('/admin/accounts/not-a-uuid', 'DELETE')).status, 422);
    assert.equal(
      (await root('/admin/accounts/00000000-0000-4000-8000-000000000099', 'DELETE')).status,
      404,
    );
    // A failed transaction must leave both access and ownership unchanged.
    await pool.query(`CREATE FUNCTION prevent_test_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test rollback'; END; $$;
      CREATE TRIGGER prevent_transfer BEFORE UPDATE OF owner_id ON scenarios
      FOR EACH ROW EXECUTE FUNCTION prevent_test_transfer();`);
    assert.equal((await root(`/admin/accounts/${adminId}`, 'DELETE')).status, 500);
    assert.equal((await created('/auth/me')).data?.role, 'admin');
    assert.equal((await created(`/editor/${scenario.id}`)).status, 200);
    await pool.query(
      'DROP TRIGGER prevent_transfer ON scenarios; DROP FUNCTION prevent_test_transfer();',
    );
    assert.equal((await root(`/admin/accounts/${adminId}`, 'DELETE')).status, 204);
    assert.equal((await root(`/admin/accounts/${adminId}`, 'DELETE')).status, 204);
    assert.equal((await root<AdminAccount[]>('/admin/accounts')).data!.length, 0);
    assert.equal((await created('/auth/me')).data, null);
    assert.equal((await otherSession('/auth/me')).data, null);
    assert.equal((await otherSession('/editor', 'POST', { title: 'Недоступный' })).status, 401);
    const login = await created('/auth/login', 'POST', {
      email: input.email,
      password: input.password,
    });
    assert.equal(login.data?.role, 'user');
    assert.equal(login.data?.id, adminId);
    assert.equal((await created('/editor')).status, 403);
    assert.deepEqual(
      (await pool.query('SELECT * FROM attempts WHERE user_id = $1', [adminId])).rows,
      attemptBefore,
    );
    assert.equal(
      (await created<AttemptDetail>(`/attempts/${practice.attempt.id}`)).data!.feedback?.comment,
      'Сохранить отзыв',
    );
    assert.equal((await root(`/editor/${scenario.id}`)).status, 200);
    assert.equal(
      (
        await pool.query('SELECT count(*)::int AS count FROM scenarios WHERE owner_id = $1', [
          adminId,
        ])
      ).rows[0].count,
      0,
    );
    assert.equal(
      (await pool.query('SELECT owner_id FROM scenarios WHERE id = $1', [deleted.id])).rows[0]
        .owner_id,
      rootId,
    );
    assert.deepEqual(
      (await pool.query('SELECT * FROM scenario_versions WHERE scenario_id = $1', [scenario.id]))
        .rows,
      versionsBefore,
    );
    assert.equal((await root('/auth/me')).data?.isSuperAdmin, true);
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
