import 'dotenv/config';

const port = Number(process.env.API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');

const adminName = process.env.ADMIN_NAME?.trim();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
const hasAdminSetting = Boolean(adminName || adminEmail || adminPassword);

if (hasAdminSetting && (!adminName || !adminEmail || !adminPassword)) {
  throw new Error(
    'Для bootstrap-администратора задайте вместе ADMIN_NAME, ADMIN_EMAIL и ADMIN_PASSWORD',
  );
}

export const config = {
  port,
  host: process.env.API_HOST ?? '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL,
  secureCookie: process.env.COOKIE_SECURE === 'true',
  origins: (
    process.env.APP_ORIGIN ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001,http://localhost:4173,http://127.0.0.1:4173'
  )
    .split(',')
    .map((x) => x.trim()),
  bootstrapAdmin:
    adminName && adminEmail && adminPassword
      ? {
          name: adminName,
          email: adminEmail,
          password: adminPassword,
        }
      : null,
};
