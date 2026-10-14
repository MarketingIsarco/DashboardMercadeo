import 'server-only';

import type { DashboardData } from '@/lib/types';
import { loadDashboardData } from './mapping';

/** Cada cuánto se vuelve a barrer Pipedrive. Por defecto, una hora. */
const TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS ?? 60 * 60 * 1000);

/**
 * Antigüedad mínima para que el botón "↻ Actualizar" vaya a Pipedrive.
 * Si alguien lo pulsa varias veces seguidas, sólo el primero gasta API.
 */
const MIN_FORCE_MS = Number(process.env.DASHBOARD_MIN_REFRESH_MS ?? 5 * 60 * 1000);

/** Cota de Upstash por request (10 MB en el plan gratis), con margen. */
const MAX_SNAPSHOT_BYTES = 9 * 1024 * 1024;

const SNAPSHOT_KEY = 'isarco:dashboard:snapshot:v1';
const LOCK_KEY = 'isarco:dashboard:refresh-lock';
/** Un barrido completo tarda segundos; si el lock dura más, el dueño murió. */
const LOCK_MS = 2 * 60 * 1000;

// ── Caché compartida (Upstash Redis vía REST) ─────────────────────────────
//
// En Vercel cada instancia serverless arranca con la memoria vacía y no la
// comparte con las demás, así que una caché sólo en memoria dispara un barrido
// de Pipedrive (~75 requests) en cada arranque en frío. La copia en Redis la
// comparten todas las instancias: Pipedrive se consulta una vez por hora sin
// importar cuánta gente recargue.
//
// Sin las variables de Redis (desarrollo local) se cae a la caché en memoria.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis<T>(command: (string | number)[]): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redis respondió ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: string };
  if (json.error) throw new Error(`Redis: ${json.error}`);
  return json.result ?? null;
}

/** La caché compartida es una optimización: si falla, se sigue sin ella. */
async function readSnapshot(): Promise<DashboardData | null> {
  try {
    const raw = await redis<string>(['GET', SNAPSHOT_KEY]);
    return raw ? (JSON.parse(raw) as DashboardData) : null;
  } catch (err) {
    console.error('[cache] no se pudo leer Redis:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function writeSnapshot(data: DashboardData): Promise<void> {
  const raw = JSON.stringify(data);
  if (raw.length > MAX_SNAPSHOT_BYTES) {
    console.warn(`[cache] snapshot de ${raw.length} bytes excede el límite; no se guarda en Redis`);
    return;
  }
  try {
    await redis(['SET', SNAPSHOT_KEY, raw]);
  } catch (err) {
    console.error('[cache] no se pudo escribir Redis:', err instanceof Error ? err.message : err);
  }
}

/**
 * Lock entre instancias: si dos arrancan en frío a la vez con la copia vencida,
 * sólo una barre Pipedrive. Sin Redis siempre se concede (no hay con quién
 * competir más allá de `inFlight`).
 */
async function acquireLock(): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) return true;
  try {
    return (await redis<string>(['SET', LOCK_KEY, '1', 'NX', 'PX', LOCK_MS])) === 'OK';
  } catch {
    return true;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await redis(['DEL', LOCK_KEY]);
  } catch {
    // Expira solo en LOCK_MS.
  }
}

// ── Caché en memoria de la instancia ──────────────────────────────────────

let memory: DashboardData | null = null;

/**
 * Una petición en vuelo compartida por todos los llamadores de esta instancia.
 *
 * Sin esto, N pestañas abriéndose a la vez con la caché fría disparan N barridos
 * completos de Pipedrive y agotan el rate limit.
 */
let inFlight: Promise<DashboardData> | null = null;

function ageMs(data: DashboardData): number {
  return Date.now() - new Date(data.fetchedAt).getTime();
}

async function refresh(): Promise<DashboardData> {
  if (inFlight) return inFlight;

  inFlight = loadDashboardData()
    .then(async (data) => {
      memory = data;
      await writeSnapshot(data);
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** La copia más reciente disponible, sea de memoria o de Redis. */
async function latest(): Promise<DashboardData | null> {
  if (memory && ageMs(memory) < TTL_MS) return memory;
  const shared = await readSnapshot();
  if (shared && (!memory || shared.fetchedAt > memory.fetchedAt)) memory = shared;
  return memory;
}

/**
 * Devuelve los datos cacheados, refrescando desde Pipedrive sólo si vencieron.
 *
 * `force` (botón "↻ Actualizar") se ignora si la copia tiene menos de
 * `MIN_FORCE_MS`. Si Pipedrive falla, u otra instancia ya está refrescando,
 * se sirve la copia vencida marcada como vieja: un dashboard desactualizado
 * es más útil que un error.
 */
export async function getDashboardData(force = false): Promise<DashboardData & { stale: boolean }> {
  const cached = await latest();

  if (cached) {
    const age = ageMs(cached);
    const wantsRefresh = force ? age >= MIN_FORCE_MS : age >= TTL_MS;
    if (!wantsRefresh) return { ...cached, stale: false };
  }

  // Sin copia alguna no hay nada que servir mientras otro refresca: se barre igual.
  const locked = !inFlight && (await acquireLock());
  if (cached && !inFlight && !locked) {
    return { ...cached, stale: true };
  }

  try {
    const data = await refresh();
    return { ...data, stale: false };
  } catch (err) {
    if (cached) return { ...cached, stale: true };
    throw err;
  } finally {
    if (locked) await releaseLock();
  }
}
