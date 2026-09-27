import type { Express } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { admin } from './auth.ts';
import { ApiError } from './store.ts';
import { contactSubmissionSchema } from '../src/types/contact.ts';

export function registerContactRoutes(app: Express, pool: Pool) {
  // Same single-process approach as the existing authentication limiter.
  // Use a shared gateway limiter when deploying multiple API instances.
  const attempts = new Map<string, { count: number; expires: number }>();
  app.post('/api/contact', async (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    const item = attempts.get(key) ?? { count: 0, expires: now + 15 * 60_000 };
    if (item.count >= 5) {
      res.set('Retry-After', String(Math.ceil((item.expires - now) / 1000)));
      throw new ApiError(429, 'Слишком много сообщений. Попробуйте снова через 15 минут.');
    }
    item.count += 1;
    attempts.set(key, item);
    const input = contactSubmissionSchema.parse(req.body);
    await pool.query(
      `INSERT INTO contact_messages(id, topic, email, message) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [input.requestId, input.topic, input.email, input.message],
    );
    // Retrying after a lost response never creates a second request.
    res.status(201).json({ id: input.requestId });
  });

  app.get('/api/admin/messages', async (req, res) => {
    admin(res);
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(req.query.offset ?? 0);
    const result = await pool.query(
      `SELECT id, topic, email, message, created_at AS "createdAt"
       FROM contact_messages ORDER BY created_at DESC, id DESC LIMIT 31 OFFSET $1`,
      [offset],
    );
    res.json({ messages: result.rows.slice(0, 30), hasMore: result.rows.length > 30 });
  });
}
