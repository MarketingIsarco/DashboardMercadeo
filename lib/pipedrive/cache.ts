import 'server-only';

import type { DashboardData } from '@/lib/types';
import { loadDashboardData } from './mapping';

const TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS ?? 15 * 60 * 1000);

interface Entry {
  data: DashboardData;
  expiresAt: number;
}

let entry: Entry | null = null;

/**
 * Una petición en vuelo compartida por todos los llamadores.
 *
 * Sin esto, N pestañas abriéndose a la vez con la caché fría disparan N barridos
 * completos de Pipedrive (~13 requests cada uno) y agotan el rate limit.
 */
let inFlight: Promise<DashboardData> | null = null;

async function refresh(): Promise<DashboardData> {
  if (inFlight) return inFlight;

  inFlight = loadDashboardData()
    .then((data) => {
      entry = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Devuelve los datos cacheados, refrescando si vencieron.
 *
 * Si Pipedrive falla pero tenemos datos vencidos en memoria, los servimos
 * marcados como viejos: un dashboard desactualizado es más útil que un error.
 */
export async function getDashboardData(force = false): Promise<DashboardData & { stale: boolean }> {
  const now = Date.now();

  if (!force && entry && entry.expiresAt > now) {
    return { ...entry.data, stale: false };
  }

  try {
    const data = await refresh();
    return { ...data, stale: false };
  } catch (err) {
    if (entry) return { ...entry.data, stale: true };
    throw err;
  }
}
