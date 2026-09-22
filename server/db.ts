import pg from 'pg';
import type { Pool, PoolClient } from 'pg';
import { config } from './config.ts';

export function createPool(connectionString = config.databaseUrl): Pool {
  if (!connectionString) throw new Error('Задайте DATABASE_URL в .env. См. README.md');
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  pool.on('error', (error) => console.error('Database pool error:', error.message));
  return pool;
}

export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
