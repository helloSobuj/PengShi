import { NextResponse } from 'next/server';
import { setSessionCookie, verifyPassword } from '@/lib/admin-auth';

export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  if (!verifyPassword(body.password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  await setSessionCookie();
  return NextResponse.json({ success: true });
}
