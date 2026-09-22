import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import type { User, UserRole } from '../src/types/api.ts';
import { config } from './config.ts';
import { ApiError, type Database } from './store.ts';

const derive = promisify(scrypt);
const cookieName = 'arena_session';
const sessionAge = 7 * 24 * 60 * 60 * 1000;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password: string, stored: string) {
  const [algorithm, salt, encoded] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !encoded) return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export function sessionToken(req: Request) {
  return req.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
export function publicUser(row: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}
export async function newSession(db: Database, userId: string, req: Request, res: Response) {
  const previous = sessionToken(req);
  if (previous)
    await db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(previous)]);
  const token = randomBytes(32).toString('hex');
  await db.query('INSERT INTO auth_sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    userId,
    new Date(Date.now() + sessionAge),
  ]);
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookie,
    path: '/',
    maxAge: sessionAge,
  });
}
export function clearSession(res: Response) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookie,
    path: '/',
  });
}
export function authenticate(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = sessionToken(req);
    if (token && /^[0-9a-f]{64}$/.test(token)) {
      const result = await pool.query(
        `SELECT u.* FROM auth_sessions s JOIN app_users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)],
      );
      if (result.rowCount) res.locals.user = publicUser(result.rows[0]);
    }
    next();
  };
}
export function user(res: Response): User {
  if (!res.locals.user) throw new ApiError(401, 'Войдите в аккаунт, чтобы сохранить прогресс');
  return res.locals.user as User;
}
export function admin(res: Response): User {
  const currentUser = user(res);
  if (currentUser.role !== 'admin')
    throw new ApiError(403, 'Доступ к редактору сценариев разрешён только администратору');
  return currentUser;
}
export { randomUUID };
