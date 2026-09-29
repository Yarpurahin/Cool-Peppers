import type { Express } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { admin } from './auth.ts';
import { idSchema } from './validation.ts';
import {
  REVIEW_PAGE_SIZE,
  type ScenarioReview,
  type ScenarioReviewInbox,
} from '../src/types/reviews.ts';

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  scenarioId: idSchema.optional(),
  helpful: z.enum(['yes', 'no']).optional(),
});

export function registerReviewRoutes(app: Express, pool: Pool) {
  app.get('/api/admin/reviews', async (req, res) => {
    const current = admin(res);
    const { offset, scenarioId, helpful } = querySchema.parse(req.query);
    const access = [current.isSuperAdmin, current.id];
    const parameters = [
      ...access,
      scenarioId ?? null,
      helpful === undefined ? null : helpful === 'yes',
    ];
    // Access is checked in every query, including filter options and counters.
    // Archived/deleted scenarios retain their reviews; titles come from the played version.
    const from = `FROM feedback f
      JOIN attempts a ON a.id = f.attempt_id
      JOIN scenarios s ON s.id = a.scenario_id
      WHERE ($1::boolean OR s.owner_id = $2::uuid)
        AND ($3::text IS NULL OR s.id = $3)
        AND ($4::boolean IS NULL OR f.helpful = $4)`;
    const [entries, counts, scenarios] = await Promise.all([
      pool.query<ScenarioReview>(
        `SELECT f.attempt_id AS "attemptId", s.id AS "scenarioId",
          (SELECT v.preview->>'title' FROM scenario_versions v
            WHERE v.scenario_id = a.scenario_id AND v.version = a.scenario_version) AS "scenarioTitle",
          a.scenario_version AS "scenarioVersion",
          (SELECT u.name FROM app_users u WHERE u.id = a.user_id) AS "authorName",
          f.helpful, f.comment, f.created_at AS "createdAt", f.updated_at AS "updatedAt",
          s.archived_at IS NOT NULL AS archived, s.deleted_at IS NOT NULL AS deleted
        ${from} ORDER BY f.created_at DESC, f.attempt_id DESC LIMIT $5 OFFSET $6`,
        [...parameters, REVIEW_PAGE_SIZE + 1, offset],
      ),
      pool.query<{ total: number; helpfulCount: number }>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE f.helpful)::int AS "helpfulCount" ${from}`,
        parameters,
      ),
      pool.query<{ id: string; title: string }>(
        `SELECT s.id, coalesce(d.definition #>> '{metadata,title}', d.preview->>'title', v.preview->>'title', s.id) AS title
         FROM scenarios s
         LEFT JOIN scenario_drafts d ON d.scenario_id = s.id
         LEFT JOIN scenario_versions v ON v.scenario_id = s.id AND v.version = s.published_version
         WHERE ($1::boolean OR s.owner_id = $2::uuid)
           AND EXISTS (SELECT 1 FROM attempts a JOIN feedback f ON f.attempt_id = a.id WHERE a.scenario_id = s.id)
         ORDER BY title, s.id`,
        access,
      ),
    ]);
    const result: ScenarioReviewInbox = {
      reviews: entries.rows.slice(0, REVIEW_PAGE_SIZE),
      hasMore: entries.rows.length > REVIEW_PAGE_SIZE,
      total: counts.rows[0].total,
      helpfulCount: counts.rows[0].helpfulCount,
      scenarios: scenarios.rows,
    };
    res.json(result);
  });
}
