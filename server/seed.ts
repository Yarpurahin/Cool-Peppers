import { pathToFileURL } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { scenarios } from '../src/data/scenarios.ts';
import { employmentScenario } from '../src/features/negotiation/data/employment.ts';
import { registerSchema } from '../src/types/validation.ts';
import { hashPassword, randomUUID } from './auth.ts';
import { config } from './config.ts';
import { createPool, transaction } from './db.ts';
import { documentSchema, normalizeDocument } from './validation.ts';

async function ensureBootstrapAdmin(client: PoolClient) {
  if (!config.bootstrapAdmin) return;

  const input = registerSchema.parse(config.bootstrapAdmin);
  const existing = await client.query(
    'SELECT id, role FROM app_users WHERE email = $1 FOR UPDATE',
    [input.email],
  );

  if (existing.rowCount) {
    if (existing.rows[0].role !== 'admin') {
      await client.query(
        "UPDATE app_users SET role = 'admin', updated_at = now() WHERE id = $1",
        [existing.rows[0].id],
      );
    }
    return;
  }

  const passwordHash = await hashPassword(input.password);
  await client.query(
    `INSERT INTO app_users(id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'admin')`,
    [randomUUID(), input.name, input.email, passwordHash],
  );
}

export async function seed(pool: Pool) {
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(73481725)');
    await ensureBootstrapAdmin(client);

    for (const preview of scenarios) {
      const doc = normalizeDocument(
        documentSchema.parse({
          preview,
          definition: preview.id === employmentScenario.metadata.id ? employmentScenario : null,
        }),
      );
      const inserted = await client.query(
        'INSERT INTO scenarios(id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
        [preview.id],
      );
      // Rerunning seeds must not overwrite editorial work or existing versions.
      if (!inserted.rowCount) continue;
      await client.query(
        'INSERT INTO scenario_versions(scenario_id, version, preview, definition) VALUES ($1, 1, $2, $3)',
        [
          preview.id,
          JSON.stringify(doc.preview),
          doc.definition ? JSON.stringify(doc.definition) : null,
        ],
      );
      await client.query('UPDATE scenarios SET published_version = 1 WHERE id = $1', [preview.id]);
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try {
    await seed(pool);
    console.log('Initial scenarios and bootstrap administrator are ready');
  } finally {
    await pool.end();
  }
}
