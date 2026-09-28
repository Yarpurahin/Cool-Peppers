import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { z, ZodError } from 'zod';
import { avatarSchema } from './avatar.ts';
import { registerContactRoutes } from './contact.ts';
import { registerReviewRoutes } from './reviews.ts';
import { registerAccountRoutes } from './accounts.ts';
import { awardCompletedAttempt, registerGamificationRoutes } from './gamification.ts';
import { config } from './config.ts';
import { transaction } from './db.ts';
import {
  admin,
  superAdmin,
  authenticate,
  checkPassword,
  clearSession,
  hashPassword,
  hashToken,
  newSession,
  publicUser,
  randomUUID,
  sessionToken,
  user,
} from './auth.ts';
import {
  ApiError,
  detail,
  getVersion,
  ownedAttempt,
  readAttempt,
  type AttemptRow,
  type Database,
} from './store.ts';
import {
  answerSchema,
  changePasswordSchema,
  documentSchema,
  feedbackSchema,
  idSchema,
  loginSchema,
  normalizeDocument,
  profileSchema,
  publishSchema,
  registerSchema,
  saveDraftSchema,
  startSchema,
  uuidSchema,
} from './validation.ts';
import {
  answerQuestion,
  compileScenario,
  startAttempt,
} from '../src/features/negotiation/model/engine.ts';
import type { AuthoringDocument } from '../src/features/maker/model/types.ts';
import {
  createBlankDefinition,
  fromPreview,
  isMakerDefinition,
} from '../src/features/maker/model/adapter.ts';
import { validateMaker } from '../src/features/maker/model/validation.ts';
import { scenarios as initialScenarios } from '../src/data/scenarios.ts';

function validateGraph(document: AuthoringDocument) {
  if (document.definition && isMakerDefinition(document.definition)) {
    const issues = validateMaker(document.definition);
    if (issues.some((i) => i.severity === 'error'))
      throw new ApiError(422, 'Исправьте ошибки графа перед публикацией.', issues);
  }
  try {
    return normalizeDocument(document);
  } catch (error) {
    throw new ApiError(422, error instanceof Error ? error.message : 'Некорректный граф сценария');
  }
}
async function ownedScenario(db: Database, id: string, ownerId: string, lock = false) {
  const row = await db.query(
    `SELECT * FROM scenarios WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
    [id, ownerId],
  );
  if (!row.rowCount)
    throw new ApiError(404, 'Сценарий не найден или недоступен для редактирования');
  return row.rows[0];
}

export function createApp(pool: Pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('X-Arena-Request') !== '1')
        throw new ApiError(403, 'Отсутствует заголовок защиты запроса');
      const origin = req.get('origin');
      if (origin && !config.origins.includes(origin))
        throw new ApiError(403, 'Недопустимый источник запроса');
      if (!req.is('application/json')) throw new ApiError(415, 'Ожидается application/json');
    }
    next();
  });
  app.use(express.json({ limit: '2mb', strict: true }));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'postgresql' });
  });
  app.use('/api', authenticate(pool));
  registerContactRoutes(app, pool);
  registerReviewRoutes(app, pool);
  registerAccountRoutes(app, pool);
  registerGamificationRoutes(app, pool);

  // Single-process development limit. For multiple instances use a shared gateway limiter.
  const authAttempts = new Map<string, { count: number; expires: number }>();
  app.use(['/api/auth/register', '/api/auth/login'], (req, _res, next) => {
    const now = Date.now();
    for (const [key, value] of authAttempts) if (value.expires < now) authAttempts.delete(key);
    const key = req.ip ?? 'unknown';
    const item = authAttempts.get(key) ?? { count: 0, expires: now + 15 * 60_000 };
    if (++item.count > 30)
      throw new ApiError(429, 'Слишком много попыток. Повторите вход через 15 минут.');
    authAttempts.set(key, item);
    next();
  });
  app.post('/api/auth/register', async (req, res) => {
    const input = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const result = await transaction(pool, async (client) => {
      const saved = await client.query(
        'INSERT INTO app_users(id, name, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
        [randomUUID(), input.name, input.email, passwordHash],
      );
      await newSession(client, saved.rows[0].id, req, res);
      return publicUser(saved.rows[0]);
    });
    res.status(201).json(result);
  });
  app.post('/api/auth/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const found = await pool.query('SELECT * FROM app_users WHERE email = $1', [input.email]);
    const stored =
      found.rows[0]?.password_hash ?? `scrypt:00000000000000000000000000000000:${'0'.repeat(128)}`;
    const valid = await checkPassword(input.password, stored);
    if (!found.rowCount || !valid) throw new ApiError(401, 'Неверная почта или пароль');
    const current = await transaction(pool, async (client) => {
      // A login and an access revocation serialize on the account. A new login
      // after revocation receives the current user role, not a stale admin role.
      const account = await client.query('SELECT * FROM app_users WHERE id = $1 FOR SHARE', [
        found.rows[0].id,
      ]);
      await newSession(client, account.rows[0].id, req, res);
      return publicUser(account.rows[0]);
    });
    res.json(current);
  });
  app.get('/api/auth/me', (_req, res) => res.json(res.locals.user ?? null));
  app.post('/api/auth/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token)
      await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
    clearSession(res);
    res.status(204).end();
  });
  app.patch('/api/me', async (req, res) => {
    const id = user(res).id;
    const input = profileSchema.parse(req.body);
    const updated = await pool.query(
      'UPDATE app_users SET name = $1, email = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [input.name, input.email, id],
    );
    res.json(publicUser(updated.rows[0]));
  });
  app.patch('/api/me/avatar', async (req, res) => {
    const id = user(res).id;
    const input = avatarSchema.parse(req.body);
    const saved = await pool.query(
      'UPDATE app_users SET avatar_data=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [input.avatar, id],
    );
    res.json(publicUser(saved.rows[0]));
  });
  app.post('/api/admin/accounts', async (req, res) => {
    superAdmin(res);
    const input = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const saved = await pool.query(
      "INSERT INTO app_users(id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'admin') RETURNING *",
      [randomUUID(), input.name, input.email, passwordHash],
    );
    res.status(201).json(publicUser(saved.rows[0]));
  });
  app.post('/api/me/password', async (req, res) => {
    const id = user(res).id;
    const input = changePasswordSchema.parse(req.body);
    const found = await pool.query('SELECT password_hash FROM app_users WHERE id = $1', [id]);
    if (
      !found.rowCount ||
      !(await checkPassword(input.currentPassword, found.rows[0].password_hash))
    )
      throw new ApiError(401, 'Текущий пароль указан неверно');
    const passwordHash = await hashPassword(input.newPassword);
    const token = sessionToken(req);
    await transaction(pool, async (client) => {
      await client.query(
        'UPDATE app_users SET password_hash = $1, updated_at = now() WHERE id = $2',
        [passwordHash, id],
      );
      if (token)
        await client.query('DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2', [
          id,
          hashToken(token),
        ]);
    });
    res.status(204).end();
  });
  app.get('/api/me/history', async (req, res) => {
    const id = user(res).id;
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(req.query.offset ?? 0);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(req.query.limit ?? 20);
    const result = await pool.query(
      `SELECT a.*, v.preview->>'title' AS title,
      (SELECT count(*)::int FROM attempt_answers h WHERE h.attempt_id = a.id) AS answers,
      (SELECT e->>'title' FROM jsonb_array_elements(v.definition->'endings') e WHERE e->>'id' = a.ending_id LIMIT 1) AS outcome,
      r.xp_earned, r.mastery_stars
      FROM attempts a JOIN scenario_versions v ON (v.scenario_id,v.version) = (a.scenario_id,a.scenario_version)
      LEFT JOIN attempt_rewards r ON r.attempt_id = a.id
      WHERE a.user_id = $1 ORDER BY a.started_at DESC, a.id DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset],
    );
    const stats = await pool.query(
      `SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'completed')::int AS completed,
      coalesce(sum(penalties) FILTER (WHERE status = 'completed'),0)::int AS penalties
      FROM attempts WHERE user_id = $1`,
      [id],
    );
    res.json({
      ...stats.rows[0],
      rows: result.rows.map((row) => ({
        id: row.id,
        scenarioId: row.scenario_id,
        scenarioVersion: row.scenario_version,
        title: row.title,
        status: row.status,
        startedAt: row.started_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        abandonedAt: row.abandoned_at,
        penalties: row.penalties,
        answers: row.answers,
        outcome: row.outcome,
        xpEarned: row.xp_earned == null ? undefined : Number(row.xp_earned),
        masteryStars: row.mastery_stars == null ? undefined : Number(row.mastery_stars),
      })),
    });
  });
  app.get('/api/scenarios', async (_req, res) => {
    const rows =
      await pool.query(`SELECT v.preview, v.definition FROM scenarios s JOIN scenario_versions v
      ON (v.scenario_id,v.version) = (s.id,s.published_version) WHERE s.archived_at IS NULL AND s.deleted_at IS NULL ORDER BY s.created_at, s.id`);
    res.json(
      rows.rows.map((doc: AuthoringDocument) => {
        const definition = doc.definition ?? fromPreview(doc.preview);
        return { preview: doc.preview, definition: compileScenario(definition).definition };
      }),
    );
  });

  app.get('/api/attempts/current', async (_req, res) => {
    const id = user(res).id;
    res.json(
      await transaction(pool, async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const rows = await client.query<AttemptRow>(
          'SELECT * FROM attempts WHERE user_id = $1 AND is_current ORDER BY started_at DESC',
          [id],
        );
        const entries = [];
        for (const row of rows.rows) entries.push(await detail(client, row));
        return entries;
      }),
    );
  });
  app.get('/api/attempts/:id', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const userId = user(res).id;
    res.json(
      await transaction(pool, async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        return detail(client, await ownedAttempt(client, id, userId));
      }),
    );
  });
  app.post('/api/scenarios/:id/attempts', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const userId = user(res).id;
    const input = startSchema.parse(req.body);
    const result = await transaction(pool, async (client) => {
      // Also serializes first starts, where there is no attempt row to lock yet.
      await client.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [userId]);
      const current = await client.query<AttemptRow>(
        'SELECT * FROM attempts WHERE user_id = $1 AND scenario_id = $2 AND is_current FOR UPDATE',
        [userId, id],
      );
      if (current.rowCount && !input.restart) return detail(client, current.rows[0]);
      if (input.restart && current.rows[0]?.id !== input.expectedAttemptId)
        throw new ApiError(409, 'Попытка уже изменилась. Обновите страницу.');
      if (input.restart && current.rowCount) {
        const old = await getVersion(client, id, current.rows[0].scenario_version);
        if (!old.definition?.settings.allowRestart)
          throw new ApiError(409, 'Повторное прохождение отключено');
      }
      const source = await client.query(
        `SELECT v.preview, v.definition FROM scenarios s JOIN scenario_versions v
        ON (v.scenario_id,v.version) = (s.id,s.published_version) WHERE s.id = $1 AND s.archived_at IS NULL AND s.deleted_at IS NULL`,
        [id],
      );
      if (!source.rowCount) throw new ApiError(404, 'Сценарий не найден');
      const definition = source.rows[0].definition ?? fromPreview(source.rows[0].preview);
      const scenario = compileScenario(definition);
      const next = startAttempt(scenario, randomUUID(), new Date().toISOString());
      if (current.rowCount)
        await client.query(
          `UPDATE attempts SET is_current = false,
        abandoned_at = CASE WHEN status = 'in-progress' THEN now() ELSE NULL END WHERE id = $1`,
          [current.rows[0].id],
        );
      const saved = await client.query<AttemptRow>(
        `INSERT INTO attempts(id,user_id,scenario_id,scenario_version,status,current_node_id,started_at,updated_at)
        VALUES ($1,$2,$3,$4,'in-progress',$5,$6,$6) RETURNING *`,
        [
          next.id,
          userId,
          id,
          next.scenarioVersion,
          scenario.definition.startNodeId,
          next.startedAt,
        ],
      );
      return detail(client, saved.rows[0]);
    });
    res.json(result);
  });
  app.post('/api/attempts/:id/answers', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const userId = user(res).id;
    const input = answerSchema.parse(req.body);
    const result = await transaction(pool, async (client) => {
      const row = await ownedAttempt(client, id, userId, true);
      if (!row.is_current) throw new ApiError(409, 'Эта попытка заменена новой');
      const attempt = await readAttempt(client, row);
      const previous = attempt.history[input.expectedAnswers];
      // Safe retry after a response was lost: acknowledge the already committed answer.
      if (
        attempt.history.length === input.expectedAnswers + 1 &&
        previous?.nodeId === input.nodeId &&
        previous.answerId === input.answerId
      )
        return detail(client, row);
      if (
        attempt.status !== 'in-progress' ||
        attempt.history.length !== input.expectedAnswers ||
        attempt.currentNodeId !== input.nodeId
      )
        throw new ApiError(409, 'Вопрос уже обработан. Загрузите актуальный прогресс.');
      const document = await getVersion(client, row.scenario_id, row.scenario_version);
      const scenario = compileScenario(document.definition!);
      const now = new Date(Math.max(Date.now(), row.updated_at.getTime())).toISOString();
      let next;
      try {
        next = answerQuestion(scenario, attempt, input.nodeId, input.answerId, now);
      } catch (error) {
        throw new ApiError(422, (error as Error).message);
      }
      await client.query(
        'INSERT INTO attempt_answers(attempt_id,sequence,node_id,answer_id,answered_at) VALUES ($1,$2,$3,$4,$5)',
        [id, attempt.history.length, input.nodeId, input.answerId, now],
      );
      const updated = await client.query<AttemptRow>(
        `UPDATE attempts SET status = $2, current_node_id = $3, ending_id = $4,
        penalties = $5, updated_at = $6, completed_at = $7 WHERE id = $1 RETURNING *`,
        [
          id,
          next.status,
          next.status === 'in-progress' ? next.currentNodeId : null,
          next.status === 'completed' ? next.endingId : null,
          next.penalties,
          now,
          next.status === 'completed' ? now : null,
        ],
      );
      if (updated.rows[0].status === 'completed')
        await awardCompletedAttempt(client, userId, updated.rows[0], scenario.definition);
      return detail(client, updated.rows[0]);
    });
    res.json(result);
  });
  app.put('/api/attempts/:id/feedback', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const userId = user(res).id;
    const input = feedbackSchema.parse(req.body);
    const row = await ownedAttempt(pool, id, userId);
    if (row.status !== 'completed') throw new ApiError(409, 'Сначала завершите тренировку');
    const document = await getVersion(pool, row.scenario_id, row.scenario_version);
    if (!document.definition?.settings.collectFeedback)
      throw new ApiError(409, 'Сбор отзывов отключён');
    const saved = await pool.query(
      `INSERT INTO feedback(attempt_id,helpful,comment) VALUES ($1,$2,$3)
      ON CONFLICT (attempt_id) DO UPDATE SET helpful = EXCLUDED.helpful, comment = EXCLUDED.comment, updated_at = now()
      RETURNING *`,
      [id, input.helpful, input.comment],
    );
    res.json({
      attemptId: id,
      helpful: saved.rows[0].helpful,
      comment: saved.rows[0].comment,
      createdAt: saved.rows[0].created_at,
    });
  });

  app.get('/api/editor', async (_req, res) => {
    const result = await pool.query(
      `SELECT s.id, s.published_version AS "publishedVersion", s.archived_at AS "archivedAt",
      s.created_at AS "createdAt", s.updated_at AS "updatedAt", d.revision,
      coalesce(d.definition #>> '{metadata,title}', d.preview->>'title') AS title,
      coalesce(jsonb_array_length(d.definition->'nodes'), 0)::int AS "questionCount",
      (v.version IS NULL OR d.preview IS DISTINCT FROM v.preview OR d.definition IS DISTINCT FROM v.definition) AS "hasUnpublishedChanges"
      FROM scenarios s JOIN scenario_drafts d ON d.scenario_id = s.id
      LEFT JOIN scenario_versions v ON v.scenario_id = s.id AND v.version = s.published_version
      WHERE s.owner_id = $1 AND s.deleted_at IS NULL ORDER BY s.updated_at DESC`,
      [admin(res).id],
    );
    res.json(result.rows);
  });
  app.post('/api/editor', async (req, res) => {
    const userId = admin(res).id;
    const input = z
      .union([
        z.object({ sourceId: idSchema }).strict(),
        z.object({ title: z.string().trim().min(1).max(200) }).strict(),
      ])
      .parse(req.body);
    const result = await transaction(pool, async (client) => {
      // Serialize creation with access revocation, so no scenario can be left
      // under the former administrator after ownership has been transferred.
      const owner = await client.query('SELECT role FROM app_users WHERE id = $1 FOR SHARE', [
        userId,
      ]);
      if (owner.rows[0]?.role !== 'admin') throw new ApiError(403, 'Права администратора отозваны');
      const id = `custom-${randomUUID()}`;
      let doc: AuthoringDocument;
      if ('sourceId' in input) {
        const source = await client.query(
          `SELECT v.preview, v.definition FROM scenarios s JOIN scenario_versions v
        ON (v.scenario_id,v.version) = (s.id,s.published_version) WHERE s.id = $1 AND s.archived_at IS NULL AND s.deleted_at IS NULL`,
          [input.sourceId],
        );
        if (!source.rowCount) throw new ApiError(404, 'Шаблон не найден');
        const sourceDoc = source.rows[0] as AuthoringDocument;
        const sourceDefinition = sourceDoc.definition ?? fromPreview(sourceDoc.preview);
        doc = {
          preview: structuredClone(sourceDoc.preview),
          definition: structuredClone(sourceDefinition),
        };
        doc.preview.id = id;
        doc.preview.title += ' — копия';
        doc.definition!.metadata.id = id;
        doc.definition!.metadata.version = 1;
        doc.definition!.metadata.title += ' — копия';
      } else {
        doc = {
          preview: { ...structuredClone(initialScenarios[0]), id, title: input.title },
          definition: createBlankDefinition(id, input.title),
        };
      }
      await client.query('INSERT INTO scenarios(id, owner_id) VALUES ($1,$2)', [id, userId]);
      await client.query(
        'INSERT INTO scenario_drafts(scenario_id,preview,definition) VALUES ($1,$2,$3)',
        [id, JSON.stringify(doc.preview), doc.definition ? JSON.stringify(doc.definition) : null],
      );
      return { id };
    });
    res.status(201).json(result);
  });
  app.get('/api/editor/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const scenario = await ownedScenario(pool, id, admin(res).id);
    const draft = await pool.query(
      `SELECT d.preview, d.definition, d.editor, d.revision,
       (v.version IS NULL OR d.preview IS DISTINCT FROM v.preview OR d.definition IS DISTINCT FROM v.definition) AS "hasUnpublishedChanges"
       FROM scenario_drafts d JOIN scenarios s ON s.id = d.scenario_id
       LEFT JOIN scenario_versions v ON v.scenario_id = s.id AND v.version = s.published_version
       WHERE d.scenario_id = $1`,
      [id],
    );
    res.json({
      ...draft.rows[0],
      publishedVersion: scenario.published_version,
      archivedAt: scenario.archived_at,
    });
  });
  app.put('/api/editor/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const userId = admin(res).id;
    const input = saveDraftSchema.parse(req.body);
    if (input.preview.id !== id || (input.definition && input.definition.metadata.id !== id))
      throw new ApiError(422, 'ID сценария нельзя изменять');
    const saved = await transaction(pool, async (client) => {
      await ownedScenario(client, id, userId, true);
      const result = await client.query(
        `UPDATE scenario_drafts SET preview=$2,definition=$3,editor=coalesce($5::jsonb,editor),revision=revision+1,updated_at=now()
        WHERE scenario_id=$1 AND revision=$4 RETURNING revision`,
        [
          id,
          JSON.stringify(input.preview),
          input.definition ? JSON.stringify(input.definition) : null,
          input.revision,
          input.editor ? JSON.stringify(input.editor) : null,
        ],
      );
      if (!result.rowCount)
        throw new ApiError(
          409,
          'Черновик изменён в другой вкладке. Скопируйте изменения и обновите страницу.',
        );
      await client.query('UPDATE scenarios SET updated_at=now() WHERE id=$1', [id]);
      const status = await client.query(
        `SELECT (v.version IS NULL OR d.preview IS DISTINCT FROM v.preview OR d.definition IS DISTINCT FROM v.definition) AS "hasUnpublishedChanges"
         FROM scenario_drafts d JOIN scenarios s ON s.id = d.scenario_id
         LEFT JOIN scenario_versions v ON v.scenario_id = s.id AND v.version = s.published_version
         WHERE s.id = $1`,
        [id],
      );
      return { ...result.rows[0], ...status.rows[0] };
    });
    res.json(saved);
  });
  app.post('/api/editor/:id/publish', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const userId = admin(res).id;
    const { revision } = publishSchema.parse(req.body);
    const saved = await transaction(pool, async (client) => {
      const scenario = await ownedScenario(client, id, userId, true);
      const found = await client.query(
        'SELECT * FROM scenario_drafts WHERE scenario_id=$1 FOR UPDATE',
        [id],
      );
      const draft = found.rows[0];
      if (draft.revision !== revision)
        throw new ApiError(409, 'Черновик изменился. Обновите страницу.');
      const version = (scenario.published_version ?? 0) + 1;
      if (draft.definition) draft.definition.metadata.version = version;
      const doc = validateGraph(
        documentSchema.parse({ preview: draft.preview, definition: draft.definition }),
      );
      await client.query(
        'INSERT INTO scenario_versions(scenario_id,version,preview,definition) VALUES ($1,$2,$3,$4)',
        [
          id,
          version,
          JSON.stringify(doc.preview),
          doc.definition ? JSON.stringify(doc.definition) : null,
        ],
      );
      await client.query(
        'UPDATE scenarios SET published_version=$2,archived_at=NULL,updated_at=now() WHERE id=$1',
        [id, version],
      );
      await client.query(
        'UPDATE scenario_drafts SET preview=$2,definition=$3,revision=revision+1,updated_at=now() WHERE scenario_id=$1',
        [id, JSON.stringify(doc.preview), doc.definition ? JSON.stringify(doc.definition) : null],
      );
      return { version, revision: revision + 1 };
    });
    res.json(saved);
  });
  app.delete('/api/editor/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const userId = admin(res).id;
    await transaction(pool, async (client) => {
      await ownedScenario(client, id, userId, true);
      await client.query('UPDATE scenarios SET deleted_at=now(),updated_at=now() WHERE id=$1', [
        id,
      ]);
    });
    res.status(204).end();
  });

  app.post('/api/editor/:id/archive', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const userId = admin(res).id;
    await transaction(pool, async (client) => {
      await ownedScenario(client, id, userId, true);
      await client.query('UPDATE scenarios SET archived_at=now(),updated_at=now() WHERE id=$1', [
        id,
      ]);
    });
    res.status(204).end();
  });

  app.use('/api', () => {
    throw new ApiError(404, 'API маршрут не найден');
  });
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  if (existsSync(dist)) {
    for (const path of ['/about', '/feedback']) {
      const page = `${dist}${path}/index.html`;
      if (existsSync(page)) app.get([path, `${path}/`], (_req, res) => res.sendFile(page));
    }
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => {
      if (
        /^\/(admin|editor|profile|attempts|login|register)(?:\/|$)/.test(req.path) ||
        /\/(play|result)$/.test(req.path)
      )
        res.set('X-Robots-Tag', 'noindex, nofollow');
      res.sendFile(`${dist}/index.html`);
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message, details: error.details });
    if (error instanceof ZodError)
      return res.status(422).json({
        error: 'Проверьте введённые данные',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    const problem = error as { code?: string; constraint?: string; type?: string };
    if (problem.code === '23505' && problem.constraint === 'app_users_email_key')
      return res.status(409).json({ error: 'Эта почта уже используется' });
    if (problem.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Некорректный JSON' });
    if (problem.type === 'entity.too.large')
      return res.status(413).json({ error: 'Слишком большой запрос' });
    console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
    const unavailable = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      '57P01',
      '57P03',
      '53300',
    ].includes(problem.code ?? '');
    return res
      .status(unavailable ? 503 : 500)
      .json({ error: 'Сервис временно недоступен. Повторите запрос.' });
  });
  return app;
}
