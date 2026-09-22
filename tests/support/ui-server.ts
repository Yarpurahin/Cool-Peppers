// Ephemeral integration fixture only. Production always starts server/index.ts with pg.Pool.
import { createPglitePool } from './pglite.ts';
import { createApp } from '../../server/app.ts';
import { migrate } from '../../server/migrate.ts';
import { seed } from '../../server/seed.ts';
import { config } from '../../server/config.ts';
const pool = await createPglitePool();
config.bootstrapAdmin = {
  name: 'Тестовый администратор',
  email: 'maker-ui@example.test',
  password: 'Maker-ui-test-2026',
};
await migrate(pool);
await seed(pool);
const server = createApp(pool).listen(3001, '127.0.0.1', () =>
  console.log('Ephemeral UI API ready'),
);
async function stop() {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
