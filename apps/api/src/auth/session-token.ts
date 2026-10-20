import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'nexora_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readSessionToken(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const values = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
    .map((part) => part.slice(SESSION_COOKIE.length + 1));

  if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0])) {
    return null;
  }

  return values[0];
}
