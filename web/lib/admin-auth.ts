import { cookies } from 'next/headers';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours
const JWT_SECRET = process.env.ADMIN_PASSWORD || 'default-dev-secret';

function getEncoder() {
  return new TextEncoder().encode(JWT_SECRET);
}

export async function signSession(): Promise<string> {
  const token = await new SignJWT({ role: 'admin' } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getEncoder());

  return token;
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getEncoder());
    return true;
  } catch {
    return false;
  }
}

export async function setSessionCookie(): Promise<void> {
  const token = await signSession();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return false;
  }
  return verifySession(token);
}

export function verifyPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return password === 'admin';
  }
  return password === adminPassword;
}
