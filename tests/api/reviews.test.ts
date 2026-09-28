import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPglitePool } from '../support/pglite.ts';
import { createApp } from '../../server/app.ts';
import { migrate } from '../../server/migrate.ts';
import { seed } from '../../server/seed.ts';
import { config } from '../../server/config.ts';
import type { AttemptDetail, User } from '../../src/types/api.ts';
import type { ScenarioReviewInbox } from '../../src/types/reviews.ts';

test('scenario reviews enforce ownership, preserve version history and paginate/filter in SQL', async () => {
  const pool = await createPglitePool();
  config.bootstrapAdmin = {
    name: 'Root',
    email: 'reviews-root@example.test',
    password: 'Root-password-2026',
  };
  await migrate(pool);
  await seed(pool);
  const server = createApp(pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const actor = () => {
    let cookie = '';
    return async <T = User>(path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
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
        data: response.status === 204 ? null : ((await response.json()) as T),
      };
    };
  };
  try {
    const root = actor(),
      owner = actor(),
      other = actor(),
      player = actor(),
      guest = actor();
    const credentials = (name: string) => ({
      name,
      email: `${name}@example.test`,
      password: 'Test-password-2026',
    });
    await root('/auth/login', 'POST', {
      email: config.bootstrapAdmin.email,
      password: config.bootstrapAdmin.password,
    });
    const ownerAccount = (await root('/admin/accounts', 'POST', credentials('review-owner'))).data!;
    await root('/admin/accounts', 'POST', credentials('review-other'));
    assert.equal(
      (
        await owner('/auth/login', 'POST', {
          email: 'review-owner@example.test',
          password: 'Test-password-2026',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await other('/auth/login', 'POST', {
          email: 'review-other@example.test',
          password: 'Test-password-2026',
        })
      ).status,
      200,
    );
    await player('/auth/register', 'POST', credentials('review-player'));
    assert.equal((await guest('/admin/reviews')).status, 401);
    assert.equal((await player('/admin/reviews')).status, 403);
    const owned = (await owner<{ id: string }>('/editor', 'POST', { sourceId: 'terms' })).data!;
    const foreign = (await other<{ id: string }>('/editor', 'POST', { sourceId: 'terms' })).data!;
    await pool.query(
      "UPDATE scenario_drafts SET preview = jsonb_set(preview, '{title}', to_jsonb($2::text)), definition = jsonb_set(definition, '{metadata,title}', to_jsonb($2::text)) WHERE scenario_id = $1",
      [owned.id, 'Исходное название'],
    );
    for (const [client, id] of [
      [owner, owned.id],
      [other, foreign.id],
    ] as const)
      assert.equal((await client(`/editor/${id}/publish`, 'POST', { revision: 1 })).status, 200);
    const complete = async (scenarioId: string) => {
      let detail = (await player<AttemptDetail>(`/scenarios/${scenarioId}/attempts`, 'POST')).data!;
      while (detail.attempt.status === 'in-progress') {
        const currentNodeId = detail.attempt.currentNodeId;
        const node = detail.definition.nodes.find((item) => item.id === currentNodeId)!;
        detail = (
          await player<AttemptDetail>(`/attempts/${detail.attempt.id}/answers`, 'POST', {
            nodeId: node.id,
            answerId: node.answers[0].id,
            expectedAnswers: detail.attempt.history.length,
          })
        ).data!;
      }
      return detail.attempt.id;
    };
    const ownAttempt = await complete(owned.id);
    const foreignAttempt = await complete(foreign.id);
    const builtInAttempt = await complete('terms');
    for (const id of [ownAttempt, foreignAttempt, builtInAttempt]) {
      assert.equal(
        (
          await player(`/attempts/${id}/feedback`, 'PUT', {
            helpful: true,
            comment: 'Исходный отзыв',
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await player(`/attempts/${ownAttempt}/feedback`, 'PUT', {
          helpful: false,
          comment: 'Нужны примеры',
        })
      ).status,
      200,
    );
    const ownInbox = (await owner<ScenarioReviewInbox>('/admin/reviews')).data!;
    assert.equal(ownInbox.total, 1);
    assert.equal(ownInbox.helpfulCount, 0);
    assert.equal(ownInbox.reviews[0].comment, 'Нужны примеры');
    assert.equal(ownInbox.reviews[0].authorName, 'review-player');
    assert.equal(ownInbox.reviews[0].scenarioTitle, 'Исходное название');
    assert.equal('email' in ownInbox.reviews[0], false);
    assert.equal('userId' in ownInbox.reviews[0], false);
    assert.deepEqual(
      ownInbox.scenarios.map((s) => s.id),
      [owned.id],
    );
    const inaccessible = (
      await owner<ScenarioReviewInbox>(`/admin/reviews?scenarioId=${foreign.id}`)
    ).data!;
    assert.equal(inaccessible.total, 0);
    assert.equal(inaccessible.reviews.length, 0);
    assert.deepEqual(
      inaccessible.scenarios.map((s) => s.id),
      [owned.id],
    );
    assert.equal((await other<ScenarioReviewInbox>('/admin/reviews')).data!.total, 1);
    assert.equal((await root<ScenarioReviewInbox>('/admin/reviews')).data!.total, 3);
    for (const query of [
      'offset=-1',
      'offset=1.5',
      'offset=1000001',
      'offset=word',
      'helpful=maybe',
      'scenarioId=%27',
    ])
      assert.equal((await root(`/admin/reviews?${query}`)).status, 422, query);

    // Renaming the draft must not relabel a review of an already played version.
    await pool.query(
      `UPDATE scenario_drafts SET preview = jsonb_set(preview, '{title}', '"Новое название"'),
      definition = jsonb_set(definition, '{metadata,title}', '"Новое название"') WHERE scenario_id = $1`,
      [owned.id],
    );
    await owner(`/editor/${owned.id}/archive`, 'POST');
    let historical = (await owner<ScenarioReviewInbox>('/admin/reviews')).data!;
    assert.equal(historical.reviews[0].scenarioTitle, 'Исходное название');
    assert.equal(historical.scenarios[0].title, 'Новое название');
    assert.equal(historical.reviews[0].archived, true);
    await owner(`/editor/${owned.id}`, 'DELETE');
    historical = (await owner<ScenarioReviewInbox>('/admin/reviews')).data!;
    assert.equal(historical.reviews[0].deleted, true);

    // A realistic inbox beyond one page, with tied timestamps to exercise stable ordering.
    await pool.query(
      `WITH copies AS (
      INSERT INTO attempts(id,user_id,scenario_id,scenario_version,status,current_node_id,ending_id,penalties,started_at,updated_at,completed_at,is_current)
      SELECT gen_random_uuid(),a.user_id,a.scenario_id,a.scenario_version,a.status,a.current_node_id,a.ending_id,a.penalties,a.started_at,a.updated_at,a.completed_at,false
      FROM attempts a CROSS JOIN generate_series(1,32) WHERE a.id = $1 RETURNING id
    ) INSERT INTO feedback(attempt_id,helpful,comment,created_at,updated_at)
      SELECT id,true,'Отзыв со второй страницы','2025-01-01','2025-01-01' FROM copies`,
      [ownAttempt],
    );
    const first = (await owner<ScenarioReviewInbox>('/admin/reviews')).data!;
    const second = (await owner<ScenarioReviewInbox>('/admin/reviews?offset=30')).data!;
    assert.equal(first.total, 33);
    assert.equal(first.helpfulCount, 32);
    assert.equal(first.reviews.length, 30);
    assert.equal(first.hasMore, true);
    assert.equal(second.reviews.length, 3);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.reviews, ...second.reviews].map((r) => r.attemptId)).size, 33);
    const negative = (
      await owner<ScenarioReviewInbox>(`/admin/reviews?scenarioId=${owned.id}&helpful=no`)
    ).data!;
    assert.equal(negative.total, 1);
    assert.equal(negative.helpfulCount, 0);
    assert.equal(negative.reviews[0].attemptId, ownAttempt);
    assert.equal((await root<ScenarioReviewInbox>('/admin/reviews?helpful=yes')).data!.total, 34);
    assert.equal(
      (await owner<ScenarioReviewInbox>('/admin/reviews?offset=999')).data!.reviews.length,
      0,
    );

    // Revocation takes effect immediately; ownership transfers with the existing account flow.
    assert.equal((await root(`/admin/accounts/${ownerAccount.id}`, 'DELETE')).status, 204);
    assert.equal((await owner('/admin/reviews')).status, 401);
    assert.equal((await root<ScenarioReviewInbox>('/admin/reviews')).data!.total, 35);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});
