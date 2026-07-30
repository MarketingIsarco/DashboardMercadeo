import 'server-only';

const FALLBACK_BASE = 'https://api.pipedrive.com/v1';

/** Claves de campos personalizados en Pipedrive (hashes estables por cuenta). */
export const FIELD = {
  FUENTE: process.env.PD_FIELD_FUENTE || '8252f665606371cf4dab874759f75532d701ce39',
  CAMPANA: process.env.PD_FIELD_CAMPANA || '2b76897628971d69dabd60201bd33029c02c0bda',
  CONTENIDO: process.env.PD_FIELD_CONTENIDO || '612f3a3498c726eab5fed9709467a322045c1cba',
} as const;

export interface PipedriveDeal {
  id: number;
  title: string;
  add_time: string;
  close_time: string | null;
  /** `YYYY-MM-DD HH:MM:SS` — último movimiento del deal. */
  update_time: string | null;
  /** `YYYY-MM-DD` de la próxima actividad agendada, o `null`. */
  next_activity_date: string | null;
  /** `YYYY-MM-DD` de la última actividad registrada, o `null`. */
  last_activity_date: string | null;
  status: 'open' | 'won' | 'lost' | 'deleted';
  stage_id: number;
  pipeline_id: number;
  lost_reason: string | null;
  owner_name: string | null;
  person_name: string | null;
  person_id: { value: number; name?: string; phone?: Array<{ value: string }> } | number | null;
  [customField: string]: unknown;
}

export interface PipedriveActivity {
  id: number;
  /** `null` en actividades sueltas, no atadas a ningún trato. */
  deal_id: number | null;
  /** `YYYY-MM-DD HH:MM:SS` — "Hora de añadición": cuándo se registró en el CRM. */
  add_time: string | null;
  /** `YYYY-MM-DD HH:MM:SS` — cuándo se marcó como completada, o `null`. */
  marked_as_done_time: string | null;
  done: boolean;
  type: string | null;
  subject: string | null;
}

export interface PipedriveStage {
  id: number;
  name: string;
  pipeline_id: number;
  order_nr: number;
}

export interface PipedrivePipeline {
  id: number;
  name: string;
}

interface FieldOption {
  id: number | string;
  label: string;
}

export interface PipedriveDealField {
  key: string;
  name: string;
  field_type: string;
  options?: FieldOption[];
}

function token(): string {
  const t = process.env.PIPEDRIVE_API_TOKEN?.trim();
  if (!t) throw new Error('PIPEDRIVE_API_TOKEN no está configurado');
  return t;
}

interface PipedriveEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
  additional_data?: { pagination?: { more_items_in_collection?: boolean } };
}

async function request<T>(
  base: string,
  path: string,
  params: Record<string, string | number> = {},
): Promise<PipedriveEnvelope<T>> {
  const url = new URL(base + path);
  url.searchParams.set('api_token', token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Pipedrive ${path} respondió ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as PipedriveEnvelope<T>;
  if (!json.success) {
    throw new Error(`Pipedrive ${path}: ${json.error ?? 'respuesta no exitosa'}`);
  }
  return json;
}

/**
 * Las cuentas de Pipedrive sirven desde un subdominio propio. Resolverlo evita
 * un redirect por request, pero si la cuenta no lo declara el dominio genérico
 * funciona igual.
 */
export async function resolveBase(): Promise<string> {
  try {
    const me = await request<{ api_domain?: string }>(FALLBACK_BASE, '/users/me');
    return me.data.api_domain ? `https://${me.data.api_domain}/v1` : FALLBACK_BASE;
  } catch {
    return FALLBACK_BASE;
  }
}

/** Trae todos los deals paginando de a 500. Son ~13 requests para ~6.5k deals. */
export async function fetchAllDeals(base: string): Promise<PipedriveDeal[]> {
  const all: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;

  // Cota dura: sin ella un `more_items_in_collection` siempre-true haría un
  // bucle infinito contra la API.
  const MAX_PAGES = 100;

  for (let page = 0; page < MAX_PAGES; page++) {
    // `all_not_deleted` es el valor documentado; deja fuera los deals borrados.
    const json = await request<PipedriveDeal[]>(base, '/deals', {
      status: 'all_not_deleted',
      limit,
      start,
    });
    if (!Array.isArray(json.data)) break;
    all.push(...json.data);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return all;
}

/**
 * Trae todas las actividades paginando de a 500 (~60 requests para ~31k).
 *
 * Es el barrido más caro del refresco, pero no hay alternativa: la API no
 * expone "la primera actividad de cada trato", y pedirlas trato por trato
 * (`/deals/{id}/activities`) serían ~7.200 requests. Con la caché de 15 min
 * esto corre 4 veces por hora como máximo.
 */
export async function fetchAllActivities(base: string): Promise<PipedriveActivity[]> {
  const all: PipedriveActivity[] = [];
  let start = 0;
  const limit = 500;

  // Misma cota dura que en `fetchAllDeals`, escalada al volumen de actividades.
  const MAX_PAGES = 400;

  for (let page = 0; page < MAX_PAGES; page++) {
    // `user_id: 0` = todos los usuarios de la cuenta. Sin él Pipedrive devuelve
    // sólo las actividades del dueño del API token, que aquí sería casi nada.
    const json = await request<PipedriveActivity[]>(base, '/activities', {
      user_id: 0,
      limit,
      start,
    });
    if (!Array.isArray(json.data)) break;
    all.push(...json.data);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return all;
}

export async function fetchStages(base: string): Promise<PipedriveStage[]> {
  const json = await request<PipedriveStage[]>(base, '/stages');
  return json.data ?? [];
}

export async function fetchPipelines(base: string): Promise<PipedrivePipeline[]> {
  const json = await request<PipedrivePipeline[]>(base, '/pipelines');
  return json.data ?? [];
}

export async function fetchDealFields(base: string): Promise<PipedriveDealField[]> {
  const json = await request<PipedriveDealField[]>(base, '/dealFields');
  return json.data ?? [];
}
