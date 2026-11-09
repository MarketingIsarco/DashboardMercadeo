import 'server-only';

const FALLBACK_BASE = 'https://api.pipedrive.com/v1';

/** Claves de campos personalizados en Pipedrive (hashes estables por cuenta). */
export const FIELD = {
  FUENTE: process.env.PD_FIELD_FUENTE || '8252f665606371cf4dab874759f75532d701ce39',
  CAMPANA: process.env.PD_FIELD_CAMPANA || '2b76897628971d69dabd60201bd33029c02c0bda',
  CONTENIDO: process.env.PD_FIELD_CONTENIDO || '612f3a3498c726eab5fed9709467a322045c1cba',
  /**
   * "Trato - Etiqueta" es un campo **nativo** de Pipedrive, no personalizado:
   * su clave es literalmente `label`, no un hash. Se deja sobreescribible por
   * si algún día la etiqueta que le importa al negocio pasa a ser un campo
   * propio.
   */
  ETIQUETA: process.env.PD_FIELD_ETIQUETA || 'label',
  /**
   * "Respuesta": texto donde la integración de pauta de Tinguazul deja las
   * respuestas del formulario cuando no hay nota. Lo lee la prioridad de leads.
   */
  RESPUESTA: process.env.PD_FIELD_RESPUESTA || '8ac6cf6600573e9d13835e1a3f98defb9daa0b6b',
} as const;

export interface PipedriveDeal {
  id: number;
  title: string;
  add_time: string;
  close_time: string | null;
  /** `YYYY-MM-DD HH:MM:SS` en que el trato se marcó ganado; `null` si no lo está. */
  won_time?: string | null;
  /** `YYYY-MM-DD HH:MM:SS` — último movimiento del deal. */
  update_time: string | null;
  /** `YYYY-MM-DD` de la próxima actividad agendada, o `null`. */
  next_activity_date: string | null;
  /** `YYYY-MM-DD` de la última actividad registrada, o `null`. */
  last_activity_date: string | null;
  /** `HH:MM:SS` **en UTC** de la próxima actividad; `null` si quedó sin hora. */
  next_activity_time?: string | null;
  next_activity_subject?: string | null;
  /** `YYYY-MM-DD HH:MM:SS` (UTC) en que el trato entró a su etapa actual. */
  stage_change_time?: string | null;
  /** Propietario del trato. En v1 llega como objeto; en algunas cuentas, como id. */
  user_id?: { id: number } | number | null;
  status: 'open' | 'won' | 'lost' | 'deleted';
  stage_id: number;
  pipeline_id: number;
  lost_reason: string | null;
  /**
   * Etiqueta del trato, como **id de opción** (no como texto).
   *
   * Pipedrive la expone de dos formas según cómo esté configurada la cuenta:
   * `label` cuando admite una sola etiqueta —y ahí puede llegar más de un id
   * separado por coma— y `label_ids` cuando admite varias. Leer sólo una de
   * las dos deja tratos etiquetados apareciendo como "Sin etiqueta".
   */
  label?: string | number | null;
  label_ids?: Array<string | number> | null;
  owner_name: string | null;
  person_name: string | null;
  person_id: { value: number; name?: string; phone?: Array<{ value: string }> } | number | null;
  [customField: string]: unknown;
}

export interface PipedriveActivity {
  id: number;
  /** `null` en actividades sueltas, no atadas a ningún trato. */
  deal_id: number | null;
  /**
   * Quien **creó** la actividad. Es la definición de "gestión del asesor" que
   * usa el dashboard: mide quién levantó el teléfono y dejó constancia, no a
   * quién le quedó la tarea pendiente.
   */
  created_by_user_id: number | null;
  /**
   * Usuario al que está **asignada**. Sólo se usa como respaldo cuando el
   * creador no viene. No es lo mismo: una tarea puede asignarse a un asesor
   * y haberla creado otro, o una automatización.
   */
  user_id: number | null;
  /** `YYYY-MM-DD HH:MM:SS` — "Hora de añadición": cuándo se registró en el CRM. */
  add_time: string | null;
  /** `YYYY-MM-DD HH:MM:SS` — cuándo se marcó como completada, o `null`. */
  marked_as_done_time: string | null;
  /** `YYYY-MM-DD` para la que quedó agendada. */
  due_date: string | null;
  /** `HH:MM` **en UTC**; `''` o `null` cuando la actividad quedó sin hora. */
  due_time: string | null;
  done: boolean;
  /** `key_string` del tipo (`call`, `meeting`, `whatsapp`, …). */
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

const MAX_REINTENTOS_429 = 5;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cuánto esperar antes de reintentar un 429: lo que diga Pipedrive
 * (`Retry-After` en segundos, o `x-ratelimit-reset`), y si no dice nada,
 * 2 s, 4 s, 8 s… Nunca más de 15 s por intento.
 */
function esperaTras429(res: Response, intento: number): number {
  const s = Number(res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset'));
  const ms = Number.isFinite(s) && s > 0 ? s * 1000 : 2000 * 2 ** intento;
  return Math.min(ms, 15_000) + Math.floor(Math.random() * 300);
}

/** Lo que Pipedrive cuenta de su límite, para que el error diga cuál se agotó. */
function detalleLimite(res: Response): string {
  if (res.status !== 429) return '';
  const diario = res.headers.get('x-daily-requests-left');
  const ventana = res.headers.get('x-ratelimit-remaining');
  const partes = [
    diario !== null ? `cupo diario restante ${diario}` : '',
    ventana !== null ? `restantes en la ventana ${ventana}` : '',
  ].filter(Boolean);
  return partes.length ? ` (${partes.join(' · ')})` : '';
}

async function request<T>(
  base: string,
  path: string,
  params: Record<string, string | number> = {},
): Promise<PipedriveEnvelope<T>> {
  const url = new URL(base + path);
  url.searchParams.set('api_token', token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  // 429 = Pipedrive pide bajar el ritmo. Antes se abortaba todo el barrido al
  // primer 429; ahora se espera lo que indique (`Retry-After` o el reinicio de
  // la ventana) y se reintenta, con un tope para no colgar la función.
  let res = await fetch(url, { cache: 'no-store' });
  for (let intento = 0; res.status === 429 && intento < MAX_REINTENTOS_429; intento++) {
    await esperar(esperaTras429(res, intento));
    res = await fetch(url, { cache: 'no-store' });
  }
  if (!res.ok) {
    throw new Error(`Pipedrive ${path} respondió ${res.status} ${res.statusText}${detalleLimite(res)}`);
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
 * (`/deals/{id}/activities`) serían ~7.200 requests. Con la caché compartida
 * de 1 hora esto corre una vez por hora como máximo.
 */
export async function fetchAllActivities(base: string): Promise<PipedriveActivity[]> {
  // Se deduplica por id: el barrido dura ~60 requests y si alguien crea o
  // borra una actividad a mitad de la paginación, Pipedrive puede devolver la
  // misma fila en dos páginas. Sin esto, esa actividad se contaría dos veces.
  const porId = new Map<number, PipedriveActivity>();
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
    for (const a of json.data) porId.set(a.id, a);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return [...porId.values()];
}

export interface PipedriveUser {
  id: number;
  name: string | null;
}

/**
 * Los usuarios de la cuenta, para poder ponerle nombre al `user_id` de cada
 * actividad. Es una sola request: la cuenta tiene decenas de usuarios, no miles.
 */
export async function fetchUsers(base: string): Promise<PipedriveUser[]> {
  const json = await request<PipedriveUser[]>(base, '/users');
  return json.data ?? [];
}

export interface PipedriveNote {
  id: number;
  deal_id: number | null;
  user_id: number | null;
  /** HTML. */
  content: string | null;
  /** `YYYY-MM-DD HH:MM:SS` (UTC). */
  add_time: string | null;
}

/**
 * Notas creadas desde `desde` (`YYYY-MM-DD`), paginando de a 500.
 *
 * Sólo las lee la prioridad de leads de Comercial COIS: el formulario de pauta
 * y lo que ISA escribe de cada conversación. Se acota por fecha porque el CRM
 * acumula cientos de notas por día (cada llamada de ISA deja una).
 */
export async function fetchNotesSince(base: string, desde: string): Promise<PipedriveNote[]> {
  const porId = new Map<number, PipedriveNote>();
  let start = 0;
  const limit = 500;
  const MAX_PAGES = 80;

  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await request<PipedriveNote[]>(base, '/notes', {
      start_date: desde,
      sort: 'add_time ASC',
      limit,
      start,
    });
    if (!Array.isArray(json.data)) break;
    for (const n of json.data) porId.set(n.id, n);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return [...porId.values()];
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
