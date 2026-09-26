import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApp } from '../../server/app.ts';
import { migrate } from '../../server/migrate.ts';
import { seed } from '../../server/seed.ts';
import type { AttemptDetail, ScenarioDraft } from '../../src/types/api.ts';
import type { MakerDraft } from '../../src/features/maker/model/types.ts';

const url = process.env.TEST_DATABASE_URL;
if (!url && !process.env.PGLITE_CHECK)
  throw new Error(
    'Set TEST_DATABASE_URL to a PostgreSQL test database. Tests create and remove their own schema.',
  );

test('PostgreSQL API integration', { timeout: 120000 }, async (t) => {
  const schema = `arena_test_${randomUUID().replaceAll('-', '')}`;
  let pool: pg.Pool;
  if (process.env.PGLITE_CHECK) {
    pool = await (await import('../support/pglite.ts')).createPglitePool();
    await pool.query(`CREATE SCHEMA ${schema}`);
  } else {
    const admin = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
    } finally {
      await admin.end();
    }
    pool = new pg.Pool({ connectionString: url, max: 10, options: `-c search_path=${schema}` });
  }
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await pool.query(`SET search_path TO ${schema}`);
    await migrate(pool);
    await seed(pool);
    server = createApp(pool).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api`;
    const actor = () => {
      let cookie = '';
      return {
        request: async (
          path: string,
          method = 'GET',
          body?: unknown,
          extra: Record<string, string> = {},
        ) => {
          const response = await fetch(base + path, {
            method,
            headers: {
              Cookie: cookie,
              ...(method === 'GET'
                ? {}
                : { 'Content-Type': 'application/json', 'X-Arena-Request': '1' }),
              ...extra,
            },
            body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          });
          const setCookie = response.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];
          return {
            status: response.status,
            data: response.status === 204 ? null : await response.json(),
            cookie: setCookie,
          };
        },
      };
    };
    const a = actor();
    const b = actor();
    const guest = actor();
    const otherSession = actor();
    const passwordCheck = actor();
    const password = 'Test-password-2026';
    const account = {
      name: 'Тестовый пользователь',
      email: `a-${randomUUID()}@example.test`,
      password,
    };
    let attempt: AttemptDetail;
    let customId = '';
    let custom: AttemptDetail;
    let draft: ScenarioDraft;

    await t.test('migrations and seed are repeatable and preserve original graph', async () => {
      await migrate(pool);
      await seed(pool);
      const result = await guest.request('/scenarios');
      assert.equal(result.status, 200);
      assert.equal(result.data.length, 3);
      assert.equal(
        result.data.find((x: { preview: { id: string } }) => x.preview.id === 'terms').definition
          .nodes.length,
        11,
      );
      assert.equal(
        result.data.filter((x: { definition: unknown }) => x.definition === null).length,
        2,
      );
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,
        3,
      );
    });
    await t.test('registration, normalized unique email and safe stored credentials', async () => {
      assert.equal((await guest.request('/me/history')).status, 401);
      const registered = await a.request('/auth/register', 'POST', {
        ...account,
        email: account.email.toUpperCase(),
      });
      assert.equal(registered.status, 201);
      assert.equal(registered.data.email, account.email);
      assert.equal(registered.data.role, 'user');
      assert.match(registered.cookie!, /HttpOnly/);
      assert.match(registered.cookie!, /SameSite=Lax/);
      const stored = (await pool.query('SELECT * FROM app_users WHERE id=$1', [registered.data.id]))
        .rows[0];
      assert.notEqual(stored.password_hash, password);
      assert.match(stored.password_hash, /^scrypt:/);
      assert.equal(registered.data.password_hash, undefined);
      assert.equal((await b.request('/auth/register', 'POST', account)).status, 409);
      assert.equal(
        (
          await b.request('/auth/register', 'POST', {
            ...account,
            email: `b-${randomUUID()}@example.test`,
          })
        ).status,
        201,
      );
      assert.equal(
        (await a.request('/me', 'PATCH', { name: 'Новое имя', email: account.email })).data.name,
        'Новое имя',
      );
    });
    await t.test('password change verifies current password and revokes other sessions', async () => {
      assert.equal(
        (await otherSession.request('/auth/login', 'POST', { email: account.email, password })).status,
        200,
      );
      assert.equal(
        (
          await a.request('/me/password', 'POST', {
            currentPassword: 'wrong-password',
            newPassword: 'Updated-password-2026',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await a.request('/me/password', 'POST', {
            currentPassword: password,
            newPassword: 'Updated-password-2026',
          })
        ).status,
        204,
      );
      assert.equal((await otherSession.request('/auth/me')).data, null);
      assert.equal(
        (await passwordCheck.request('/auth/login', 'POST', { email: account.email, password })).status,
        401,
      );
      assert.equal(
        (
          await passwordCheck.request('/auth/login', 'POST', {
            email: account.email,
            password: 'Updated-password-2026',
          })
        ).status,
        200,
      );
    });
    await t.test('CSRF, invalid JSON shapes and playable built-in templates', async () => {
      assert.equal(
        (await a.request('/scenarios/terms/attempts', 'POST', {}, { 'X-Arena-Request': '' }))
          .status,
        403,
      );
      assert.equal(
        (
          await a.request(
            '/scenarios/terms/attempts',
            'POST',
            {},
            { Origin: 'https://unrelated.example' },
          )
        ).status,
        403,
      );
      const templateAttempt = await a.request('/scenarios/new-deadline/attempts', 'POST');
      assert.equal(templateAttempt.status, 200);
      assert.equal(templateAttempt.data.definition.metadata.id, 'new-deadline');
      assert.equal((await a.request('/attempts/not-a-uuid')).status, 422);
      assert.equal(
        (await a.request('/scenarios/terms/attempts', 'POST', { penalties: 0 })).status,
        422,
      );
    });
    await t.test('first start, current attempt and private ownership', async () => {
      const result = await a.request('/scenarios/terms/attempts', 'POST');
      assert.equal(result.status, 200);
      attempt = result.data;
      const second = await a.request('/scenarios/terms/attempts', 'POST');
      assert.equal(second.data.attempt.id, attempt.attempt.id);
      assert.equal((await b.request(`/attempts/${attempt.attempt.id}`)).status, 404);
      assert.equal(
        (
          await a.request(`/attempts/${attempt.attempt.id}/feedback`, 'PUT', {
            helpful: true,
            comment: '',
          })
        ).status,
        409,
      );
    });
    await t.test(
      'concurrent different answers apply exactly one transition and support safe retry',
      async () => {
        assert.equal(attempt.attempt.status, 'in-progress');
        const first = attempt.definition.nodes.find(
          (n) => n.id === attempt.definition.startNodeId,
        )!;
        const body = { nodeId: first.id, answerId: first.answers[0].id, expectedAnswers: 0 };
        const results = await Promise.all([
          a.request(`/attempts/${attempt.attempt.id}/answers`, 'POST', body),
          a.request(`/attempts/${attempt.attempt.id}/answers`, 'POST', {
            ...body,
            answerId: first.answers[1].id,
          }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        attempt = results.find((r) => r.status === 200)!.data;
        const item = attempt.attempt.history[0];
        const retry = await a.request(`/attempts/${attempt.attempt.id}/answers`, 'POST', {
          nodeId: item.nodeId,
          answerId: item.answerId,
          expectedAnswers: 0,
        });
        assert.equal(retry.status, 200);
        assert.equal(retry.data.attempt.history.length, 1);
        assert.equal(
          (
            await pool.query('SELECT count(*)::int AS n FROM attempt_answers WHERE attempt_id=$1', [
              attempt.attempt.id,
            ])
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test('invalid answers and forged penalties do not change saved state', async () => {
      assert.equal(attempt.attempt.status, 'in-progress');
      if (attempt.attempt.status !== 'in-progress') return;
      const path = `/attempts/${attempt.attempt.id}/answers`;
      const body = {
        nodeId: attempt.attempt.currentNodeId,
        answerId: 'unknown-answer',
        expectedAnswers: 1,
      };
      assert.equal((await a.request(path, 'POST', body)).status, 422);
      assert.equal(
        (await a.request(path, 'POST', { ...body, penalties: 0, status: 'completed' })).status,
        422,
      );
      assert.equal(
        (await a.request(`/attempts/${attempt.attempt.id}`)).data.attempt.history.length,
        1,
      );
    });
    await t.test('completion, feedback upsert and persistent history', async () => {
      while (attempt.attempt.status === 'in-progress') {
        const node = attempt.definition.nodes.find(
          (n) => attempt.attempt.status === 'in-progress' && n.id === attempt.attempt.currentNodeId,
        )!;
        const result = await a.request(`/attempts/${attempt.attempt.id}/answers`, 'POST', {
          nodeId: node.id,
          answerId: node.answers[0].id,
          expectedAnswers: attempt.attempt.history.length,
        });
        assert.equal(result.status, 200);
        attempt = result.data;
      }
      assert.equal(
        (
          await b.request(`/attempts/${attempt.attempt.id}/feedback`, 'PUT', {
            helpful: true,
            comment: '',
          })
        ).status,
        404,
      );
      const first = await a.request(`/attempts/${attempt.attempt.id}/feedback`, 'PUT', {
        helpful: true,
        comment: '  Полезно  ',
      });
      const second = await a.request(`/attempts/${attempt.attempt.id}/feedback`, 'PUT', {
        helpful: false,
        comment: 'Обновлённый отзыв',
      });
      assert.equal(first.status, 200);
      assert.equal(first.data.comment, 'Полезно');
      assert.equal(second.data.createdAt, first.data.createdAt);
      assert.equal(
        (
          await pool.query('SELECT count(*)::int AS n FROM feedback WHERE attempt_id=$1', [
            attempt.attempt.id,
          ])
        ).rows[0].n,
        1,
      );
      assert.equal((await a.request('/me/history')).data.completed, 1);
      assert.equal((await b.request('/me/history')).data.total, 0);
      const current = await a.request('/attempts/current');
      assert.equal(current.data[0].attempt.status, 'completed');
    });
    await t.test(
      'draft creation, admin authorization, optimistic locking and publication',
      async () => {
        assert.equal((await a.request('/editor')).status, 403);
        await pool.query(`UPDATE app_users SET role = 'admin' WHERE email = $1`, [account.email]);
        assert.equal((await a.request('/auth/me')).data.role, 'admin');
        const templateCopy = (
          await a.request('/editor', 'POST', { sourceId: 'new-deadline' })
        ).data.id;
        const templateDraft = (await a.request(`/editor/${templateCopy}`)).data;
        assert.ok(templateDraft.definition);
        assert.equal(templateDraft.definition.metadata.id, templateCopy);
        customId = (await a.request('/editor', 'POST', { sourceId: 'terms' })).data.id;
        assert.equal((await b.request(`/editor/${customId}`)).status, 403);
        draft = (await a.request(`/editor/${customId}`)).data;
        draft.definition!.metadata.title = 'Проверка версий';
        const body = {
          preview: draft.preview,
          definition: draft.definition,
          revision: draft.revision,
        };
        const saved = await a.request(`/editor/${customId}`, 'PUT', body);
        assert.equal(saved.status, 200);
        assert.equal((await a.request(`/editor/${customId}`, 'PUT', body)).status, 409);
        assert.equal(
          (
            await a.request(`/editor/${customId}/publish`, 'POST', {
              revision: saved.data.revision,
            })
          ).status,
          200,
        );
        custom = (await a.request(`/scenarios/${customId}/attempts`, 'POST')).data;
        assert.equal(custom.attempt.scenarioVersion, 1);
      },
    );
    await t.test(
      'new publication preserves started version and published snapshots are immutable',
      async () => {
        draft = (await a.request(`/editor/${customId}`)).data;
        assert.equal(draft.hasUnpublishedChanges, false);
        draft.definition!.nodes[0].text = 'Новая первая реплика';
        const saved = await a.request(`/editor/${customId}`, 'PUT', {
          preview: draft.preview,
          definition: draft.definition,
          revision: draft.revision,
        });
        assert.equal(saved.data.hasUnpublishedChanges, true);
        const unpublished = (await a.request(`/editor/${customId}`)).data;
        assert.equal(unpublished.publishedVersion, 1);
        assert.equal(unpublished.hasUnpublishedChanges, true);
        const row = (await a.request('/editor')).data.find(
          (item: { id: string }) => item.id === customId,
        );
        assert.equal(row.hasUnpublishedChanges, true);
        const visible = (await guest.request('/scenarios')).data.find(
          (item: { preview: { id: string } }) => item.preview.id === customId,
        );
        assert.equal(visible.definition.metadata.version, 1);
        assert.notEqual(visible.definition.nodes[0].text, 'Новая первая реплика');
        const published = await a.request(`/editor/${customId}/publish`, 'POST', {
          revision: saved.data.revision,
        });
        assert.equal(published.data.version, 2);
        assert.equal((await a.request(`/editor/${customId}`)).data.hasUnpublishedChanges, false);
        const previous = await a.request(`/attempts/${custom.attempt.id}`);
        assert.equal(previous.data.attempt.scenarioVersion, 1);
        assert.notEqual(previous.data.definition.nodes[0].text, 'Новая первая реплика');
        await assert.rejects(
          pool.query('UPDATE scenario_versions SET preview=preview WHERE scenario_id=$1', [
            customId,
          ]),
          /immutable/,
        );
        const restarted = await a.request(`/scenarios/${customId}/attempts`, 'POST', {
          restart: true,
          expectedAttemptId: custom.attempt.id,
        });
        assert.equal(restarted.status, 200);
        assert.equal(restarted.data.attempt.scenarioVersion, 2);
        const old = (await a.request(`/attempts/${custom.attempt.id}`)).data;
        assert.ok(old.abandonedAt);
        assert.equal(old.isCurrent, false);
        assert.equal(
          (
            await a.request(`/scenarios/${customId}/attempts`, 'POST', {
              restart: true,
              expectedAttemptId: custom.attempt.id,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      'invalid graph stays a draft and cannot replace the published version',
      async () => {
        draft = (await a.request(`/editor/${customId}`)).data;
        draft.definition!.nodes[0].answers[0].next = {
          type: 'node',
          nodeId: draft.definition!.startNodeId,
        };
        const saved = await a.request(`/editor/${customId}`, 'PUT', {
          preview: draft.preview,
          definition: draft.definition,
          revision: draft.revision,
        });
        assert.equal(saved.status, 200);
        assert.equal(
          (
            await a.request(`/editor/${customId}/publish`, 'POST', {
              revision: saved.data.revision,
            })
          ).status,
          422,
        );
        assert.equal((await a.request(`/editor/${customId}`)).data.publishedVersion, 2);
      },
    );
    await t.test('archive hides scenario but preserves history and original seed', async () => {
      assert.equal((await b.request(`/editor/${customId}/archive`, 'POST')).status, 403);
      assert.equal((await a.request(`/editor/${customId}/archive`, 'POST')).status, 204);
      assert.equal(
        (await guest.request('/scenarios')).data.some(
          (s: { preview: { id: string } }) => s.preview.id === customId,
        ),
        false,
      );
      assert.equal((await a.request(`/attempts/${custom.attempt.id}`)).status, 200);
      await seed(pool);
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM scenario_versions WHERE scenario_id=$1',
            [customId],
          )
        ).rows[0].n,
        2,
      );
    });
    await t.test(
      'maker draft: positions, incomplete save, publication, playback and reload',
      async () => {
        const created = await a.request('/editor', 'POST', { title: 'Проверка maker' });
        assert.equal(created.status, 201);
        const id = created.data.id;
        const loaded = await a.request(`/editor/${id}`);
        const maker: MakerDraft = loaded.data;
        assert.equal(maker.definition.schemaVersion, 2);
        maker.editor.positions.node_1 = { x: 430, y: -210 };
        maker.editor.viewport = { x: 12, y: 34, zoom: 0.75 };
        const save = () =>
          a.request(`/editor/${id}`, 'PUT', {
            preview: maker.preview,
            definition: maker.definition,
            editor: maker.editor,
            revision: maker.revision,
          });
        const partial = await save();
        assert.equal(partial.status, 200);
        maker.revision = partial.data.revision;
        const blocked = await a.request(`/editor/${id}/publish`, 'POST', {
          revision: maker.revision,
        });
        assert.equal(blocked.status, 422);
        assert.ok(blocked.data.details.some((i: { code: string }) => i.code === 'endings'));
        assert.deepEqual((await a.request(`/editor/${id}`)).data.editor, maker.editor);
        maker.preview.coverImage = {
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSf8AAAAASUVORK5CYII=',
          alt: 'Иллюстрация переговоров',
        };
        maker.definition.metadata.description = 'Тренировка выбора реакции';
        maker.definition.nodes[0].text = 'Какую зарплату вы ожидаете?';
        maker.definition.nodes[0].reactions = [
          {
            id: 'reaction_offer',
            intent: 'salary_offer',
            label: 'Назвать сумму',
            examples: ['Хочу 200 тысяч'],
            endingId: 'finish',
          },
        ];
        maker.definition.endings = [
          {
            id: 'finish',
            title: 'Договорились',
            description: 'Предложение принято',
            type: 'success',
          },
        ];
        const valid = await save();
        maker.revision = valid.data.revision;
        assert.equal(
          (await a.request(`/editor/${id}/publish`, 'POST', { revision: maker.revision })).status,
          200,
        );
        const roundtrip = (await a.request(`/editor/${id}`)).data as MakerDraft;
        assert.deepEqual(roundtrip.editor, maker.editor);
        assert.deepEqual(roundtrip.preview.coverImage, maker.preview.coverImage);
        assert.equal(roundtrip.hasUnpublishedChanges, false);
        const publicDoc = (await guest.request('/scenarios')).data.find(
          (item: { preview: { id: string } }) => item.preview.id === id,
        );
        assert.deepEqual(publicDoc.preview.coverImage, maker.preview.coverImage);
        roundtrip.editor.positions.node_1.x += 25;
        assert.equal(roundtrip.definition.nodes[0].reactions[0].intent, 'salary_offer');
        assert.deepEqual(roundtrip.definition.nodes[0].reactions[0].examples, ['Хочу 200 тысяч']);
        assert.equal(
          (await pool.query('SELECT definition FROM scenario_versions WHERE scenario_id=$1', [id]))
            .rows[0].definition.schemaVersion,
          2,
        );
        const started = await b.request(`/scenarios/${id}/attempts`, 'POST');
        assert.equal(started.status, 200);
        assert.equal(started.data.definition.settings.failure.rule, 'none');
        const completed = await b.request(`/attempts/${started.data.attempt.id}/answers`, 'POST', {
          nodeId: 'node_1',
          answerId: 'reaction_offer',
          expectedAnswers: 0,
        });
        assert.equal(completed.status, 200);
        assert.equal(completed.data.attempt.status, 'completed');
        assert.equal(completed.data.attempt.endingId, 'finish');
        assert.equal(completed.data.attempt.penalties, 0);
        // Publishing with optional metadata blank must not poison the next save.
        const afterPublish = await a.request(`/editor/${id}`, 'PUT', {
          preview: roundtrip.preview,
          definition: roundtrip.definition,
          editor: roundtrip.editor,
          revision: roundtrip.revision,
        });
        assert.equal(afterPublish.status, 200);
        assert.equal(afterPublish.data.hasUnpublishedChanges, false);
      },
    );
    await t.test(
      'deletion is owner-only, hides all entry points and preserves published attempts',
      async () => {
        assert.equal((await guest.request(`/editor/${customId}`, 'DELETE')).status, 401);
        assert.equal((await b.request(`/editor/${customId}`, 'DELETE')).status, 403);
        await pool.query(`UPDATE app_users SET role = 'admin' WHERE email <> $1`, [account.email]);
        assert.equal((await b.request(`/editor/${customId}`, 'DELETE')).status, 404);
        // Make the previously archived scenario public again to test both visibility paths.
        await pool.query('UPDATE scenarios SET archived_at=NULL WHERE id=$1', [customId]);
        assert.equal((await a.request(`/editor/${customId}`, 'DELETE')).status, 204);
        assert.equal((await a.request(`/editor/${customId}`)).status, 404);
        assert.equal(
          (await a.request(`/editor/${customId}/publish`, 'POST', { revision: 1 })).status,
          404,
        );
        assert.equal(
          (await a.request('/editor')).data.some((item: { id: string }) => item.id === customId),
          false,
        );
        assert.equal(
          (await guest.request('/scenarios')).data.some(
            (item: { preview: { id: string } }) => item.preview.id === customId,
          ),
          false,
        );
        assert.equal((await b.request(`/scenarios/${customId}/attempts`, 'POST')).status, 404);
        assert.equal((await a.request('/editor', 'POST', { sourceId: customId })).status, 404);
        assert.equal((await a.request(`/attempts/${custom.attempt.id}`)).status, 200);
        const fresh = (await a.request('/editor', 'POST', { title: 'Удаляемый черновик' })).data.id;
        assert.equal((await a.request(`/editor/${fresh}`, 'DELETE')).status, 204);
        assert.equal((await a.request(`/editor/${fresh}`, 'DELETE')).status, 404);
      },
    );
    await t.test('logout revokes session and login restores persisted account data', async () => {
      assert.equal((await a.request('/auth/logout', 'POST')).status, 204);
      assert.equal((await a.request('/auth/me')).data, null);
      assert.equal((await a.request('/me/history')).status, 401);
      assert.equal(
        (await a.request('/auth/login', 'POST', { email: account.email, password: 'bad-password' }))
          .status,
        401,
      );
      assert.equal(
        (await a.request('/auth/login', 'POST', { email: account.email, password })).status,
        200,
      );
      assert.equal((await a.request('/me/history')).data.total, 3);
    });
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
});
