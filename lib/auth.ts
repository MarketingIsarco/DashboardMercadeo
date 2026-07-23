/**
 * Sesión por cookie firmada con HMAC-SHA256.
 *
 * Usa Web Crypto (no `node:crypto`) porque el middleware corre en el runtime
 * edge, donde los módulos de Node no existen.
 */

export const SESSION_COOKIE = 'isarco_dash';

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.DASHBOARD_SECRET;
  if (!s) throw new Error('DASHBOARD_SECRET no está configurado');
  return s;
}

/** Vida de la sesión: 12 h, aprox. una jornada laboral. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Comparación en tiempo constante: un `===` filtra el secreto por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) throw new Error('DASHBOARD_PASSWORD no está configurado');
  // Se hashean ambos lados para que la comparación sea de largo fijo.
  const [a, b] = await Promise.all([hmac(candidate), hmac(expected)]);
  return safeEqual(a, b);
}

/** Token `<expiraEnMs>.<firma>`. La expiración va firmada, así que no se puede extender. */
export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = await hmac(String(exp));
  return { value: `${exp}.${sig}`, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;

  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;

  return safeEqual(await hmac(exp), sig);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
