import { pathToFileURL } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { employmentScenario } from '../src/features/negotiation/data/employment.ts';
import { employmentPreview } from '../src/features/negotiation/data/employmentPreview.ts';
import { deadlineScenario } from '../src/features/negotiation/data/deadline.ts';
import { deadlinePreview } from '../src/features/negotiation/data/deadlinePreview.ts';
import { registerSchema } from '../src/types/validation.ts';
import { hashPassword, randomUUID } from './auth.ts';
import { config } from './config.ts';
import { createPool, transaction } from './db.ts';
import { documentSchema, normalizeDocument } from './validation.ts';

async function ensureBootstrapAdmin(client: PoolClient) {
  if (!config.bootstrapAdmin) return;
  const root = await client.query('SELECT id FROM app_users WHERE is_super_admin');
  if (root.rowCount) return;
  const input = registerSchema.parse(config.bootstrapAdmin);
  const existing = await client.query('SELECT id, role FROM app_users WHERE email = $1 FOR UPDATE', [input.email]);
  if (existing.rowCount) {
    await client.query("UPDATE app_users SET role = 'admin', is_super_admin = true, updated_at = now() WHERE id = $1", [existing.rows[0].id]);
    return;
  }
  const passwordHash = await hashPassword(input.password);
  await client.query(
    `INSERT INTO app_users(id, name, email, password_hash, role, is_super_admin)
     VALUES ($1, $2, $3, $4, 'admin', true)`,
    [randomUUID(), input.name, input.email, passwordHash],
  );
}


function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  return value;
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

async function ensurePublishedScenario(
  client: PoolClient,
  preview: unknown,
  definition: unknown,
) {
  const parsed = normalizeDocument(documentSchema.parse({ preview, definition }));
  const scenarioId = parsed.definition.metadata.id;
  await client.query('INSERT INTO scenarios(id) VALUES ($1) ON CONFLICT DO NOTHING', [scenarioId]);

  const managed = await client.query(
    `SELECT owner_id, archived_at, deleted_at,
     EXISTS(SELECT 1 FROM scenario_drafts d WHERE d.scenario_id = scenarios.id) AS has_draft
     FROM scenarios WHERE id = $1 FOR UPDATE`,
    [scenarioId],
  );
  const scenario = managed.rows[0];
  // Once an administrator manages a built-in scenario, seed must preserve
  // their draft, publication and archive/deletion decisions across restarts.
  if (scenario.owner_id || scenario.has_draft || scenario.archived_at || scenario.deleted_at) return;

  const latest = await client.query(
    `SELECT version, preview, definition FROM scenario_versions
     WHERE scenario_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
    [scenarioId],
  );
  if (latest.rowCount) {
    const current = latest.rows[0];
    const comparable = structuredClone(parsed);
    comparable.definition.metadata.version = current.version;
    const same =
      jsonEqual(current.preview, comparable.preview) &&
      jsonEqual(current.definition, comparable.definition);
    if (same) {
      await client.query('UPDATE scenarios SET published_version=$2, archived_at=NULL, deleted_at=NULL WHERE id=$1', [scenarioId, current.version]);
      return;
    }
  }

  const version = latest.rowCount ? Number(latest.rows[0].version) + 1 : 1;
  parsed.definition.metadata.version = version;
  parsed.preview = normalizeDocument(parsed).preview;
  await client.query(
    'INSERT INTO scenario_versions(scenario_id, version, preview, definition) VALUES ($1, $2, $3, $4)',
    [scenarioId, version, JSON.stringify(parsed.preview), JSON.stringify(parsed.definition)],
  );
  await client.query('UPDATE scenarios SET published_version=$2, archived_at=NULL, deleted_at=NULL, updated_at=now() WHERE id=$1', [scenarioId, version]);
}

export async function seed(pool: Pool) {
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(73481725)');
    await ensureBootstrapAdmin(client);
    await ensurePublishedScenario(client, employmentPreview, employmentScenario);
    await ensurePublishedScenario(client, deadlinePreview, deadlineScenario);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try {
    await seed(pool);
    console.log('Published scenarios and bootstrap administrator are ready');
  } finally {
    await pool.end();
  }
}
