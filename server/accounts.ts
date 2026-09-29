import type { Express } from 'express';
import type { Pool } from 'pg';
import type { AdminAccount } from '../src/types/api.ts';
import { superAdmin } from './auth.ts';
import { transaction } from './db.ts';
import { ApiError } from './store.ts';
import { uuidSchema } from './validation.ts';

export function registerAccountRoutes(app: Express, pool: Pool) {
  app.get('/api/admin/accounts', async (_req, res) => {
    superAdmin(res);
    const accounts = await pool.query<AdminAccount>(
      `SELECT u.id, u.name, u.email, u.created_at AS "createdAt",
       (SELECT count(*)::int FROM scenarios s
        WHERE s.owner_id = u.id AND s.deleted_at IS NULL) AS "scenarioCount"
       FROM app_users u WHERE u.role = 'admin' AND NOT u.is_super_admin
       ORDER BY u.created_at DESC, u.id DESC`,
    );
    res.json(accounts.rows);
  });

  // Revoking access preserves the account, published versions and practice history.
  app.delete('/api/admin/accounts/:id', async (req, res) => {
    const root = superAdmin(res);
    const id = uuidSchema.parse(req.params.id);
    if (id === root.id) throw new ApiError(403, 'Нельзя снять права главного администратора');
    await transaction(pool, async (client) => {
      const found = await client.query(
        'SELECT role, is_super_admin FROM app_users WHERE id = $1 FOR UPDATE',
        [id],
      );
      const account = found.rows[0];
      if (!account) throw new ApiError(404, 'Администратор не найден');
      if (account.is_super_admin)
        throw new ApiError(403, 'Нельзя снять права главного администратора');
      // Safe to retry after an interrupted response; never transfer a regular user's data.
      if (account.role !== 'admin') return;
      await client.query("UPDATE app_users SET role = 'user', updated_at = now() WHERE id = $1", [
        id,
      ]);
      await client.query(
        'UPDATE scenarios SET owner_id = $1, updated_at = now() WHERE owner_id = $2',
        [root.id, id],
      );
      await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);
    });
    res.status(204).end();
  });
}
