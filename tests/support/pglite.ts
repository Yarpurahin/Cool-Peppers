// Test-only adapter. Production always uses pg.Pool and a PostgreSQL server.
// PGlite runs the PostgreSQL engine in-process; this is not a test of TCP, roles or row-lock concurrency.
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';

export async function createPglitePool(): Promise<Pool> {
  const db = await PGlite.create();
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
  async function query(sql: string, values?: unknown[]) {
    const result = values?.length ? await db.query(sql, values) : (await db.exec(sql)).at(-1)!;
    return {
      rows: result.rows,
      rowCount: result.rows.length || result.affectedRows || 0,
      fields: result.fields,
    };
  }
  return {
    query: async (sql: string, values?: unknown[]) => {
      const release = await acquire();
      try {
        return await query(sql, values);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await acquire();
      return { query, release };
    },
    end: async () => {
      await tail;
      await db.close();
    },
    on: () => {},
  } as unknown as Pool;
}
