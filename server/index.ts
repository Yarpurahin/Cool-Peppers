import { createPool } from './db.ts';
import { createApp } from './app.ts';
import { config } from './config.ts';

const pool = createPool();
await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
const server = createApp(pool).listen(config.port, config.host, () =>
  console.log(`Arena API: http://${config.host}:${config.port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
