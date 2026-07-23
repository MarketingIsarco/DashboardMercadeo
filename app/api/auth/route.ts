import { NextResponse } from 'next/server';
import { COOKIE_OPTIONS, SESSION_COOKIE, checkPassword, createSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let password = '';
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  if (!password || !(await checkPassword(password))) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }

  const session = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.value, { ...COOKIE_OPTIONS, maxAge: session.maxAge });
  return res;
}

/** Cierre de sesión. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
