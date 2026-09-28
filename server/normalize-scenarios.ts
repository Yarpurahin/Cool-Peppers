import { pathToFileURL } from 'node:url';
import type { PoolClient } from 'pg';
import { createPool, transaction } from './db.ts';
import { documentSchema, normalizeDocument } from './validation.ts';

async function normalizeVersions(client: PoolClient) {
  const rows = await client.query(
    'SELECT scenario_id, version, preview, definition FROM scenario_versions ORDER BY scenario_id, version',
  );
  let updated = 0;
  // Published versions are immutable during normal application work. This maintenance
  // command is the one controlled exception: it rewrites only the serialization
  // shape while preserving scenario/version IDs and graph semantics. The ALTER is
  // transactional, so a failure restores the trigger automatically.
  await client.query('ALTER TABLE scenario_versions DISABLE TRIGGER scenario_versions_immutable');
  for (const row of rows.rows) {
    const doc = documentSchema.parse({ preview: row.preview, definition: row.definition });
    doc.definition.metadata.id = row.scenario_id;
    doc.definition.metadata.version = row.version;
    const normalized = normalizeDocument(doc);
    const result = await client.query(
      `UPDATE scenario_versions SET preview = $3, definition = $4
       WHERE scenario_id = $1 AND version = $2
         AND (preview IS DISTINCT FROM $3::jsonb OR definition IS DISTINCT FROM $4::jsonb)`,
      [
        row.scenario_id,
        row.version,
        JSON.stringify(normalized.preview),
        JSON.stringify(normalized.definition),
      ],
    );
    updated += result.rowCount ?? 0;
  }
  await client.query('ALTER TABLE scenario_versions ENABLE TRIGGER scenario_versions_immutable');
  return updated;
}

async function normalizeDrafts(client: PoolClient) {
  const rows = await client.query(
    'SELECT scenario_id, preview, definition, editor FROM scenario_drafts ORDER BY scenario_id',
  );
  let updated = 0;
  for (const row of rows.rows) {
    const doc = documentSchema.parse({
      preview: row.preview,
      definition: row.definition,
      editor: row.editor ?? undefined,
    });
    doc.definition.metadata.id = row.scenario_id;
    const normalized = normalizeDocument(doc);
    const result = await client.query(
      `UPDATE scenario_drafts SET preview = $2, definition = $3
       WHERE scenario_id = $1
         AND (preview IS DISTINCT FROM $2::jsonb OR definition IS DISTINCT FROM $3::jsonb)`,
      [row.scenario_id, JSON.stringify(normalized.preview), JSON.stringify(normalized.definition)],
    );
    updated += result.rowCount ?? 0;
  }
  return updated;
}

export async function normalizeStoredScenarios() {
  const pool = createPool();
  try {
    return await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(73481726)');
      return {
        versions: await normalizeVersions(client),
        drafts: await normalizeDrafts(client),
      };
    });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await normalizeStoredScenarios();
  console.log(`Scenario documents normalized: ${result.versions} versions, ${result.drafts} drafts`);
}
