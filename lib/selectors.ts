import {
  CONSTRUCTORA_IDX,
  INMOBILIARIA_IDX,
  META,
  MIN_YEAR,
  STAGE_CITA,
  STAGE_NEGOCIACION,
  STAGE_SEPARACION,
  STAGE_VISITA,
} from '@/lib/config/negocio';
import type { Goal } from '@/lib/config/negocio';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { DashboardData, Lead, Meta, Status } from '@/lib/types';

export type Unidad = 'constructora' | 'inmobiliaria' | null;
export type Period = 'month' | 'year';

export interface FilterState {
  /** Meses `YYYY-MM` incluidos. Vacío = todos. */
  months: string[];
  /** Meses excluidos explícitamente. Gana sobre `months`. */
  exMonths: string[];
  status: Status[];
  exStatus: Status[];
  /** Índices en `meta.sources`. */
  sources: number[];
  /** Índices en `meta.campaigns`. */
  campaigns: number[];
  /** Índices en `meta.projects`. */
  projects: number[];
  /** `true` = sólo digital, `false` = sólo no-digital, `null` = ambos. */
  digital: boolean | null;
  year: string | null;
  unidad: Unidad;
  period: Period;
  /** `YYYY-MM-DD` inclusivo. */
  dateFrom: string | null;
  dateTo: string | null;
}

export const defaultFilters: FilterState = {
  months: [],
  exMonths: [],
  status: [],
  exStatus: [],
  sources: [],
  campaigns: [],
  projects: [],
  digital: null,
  year: null,
  unidad: null,
  period: 'month',
  dateFrom: null,
  dateTo: null,
};

export function isCita(l: Lead): boolean {
  return l.stage >= STAGE_CITA;
}
export function isVisita(l: Lead): boolean {
  return l.stage >= STAGE_VISITA;
}
export function isNegociacion(l: Lead): boolean {
  return l.stage >= STAGE_NEGOCIACION;
}
export function isSeparacion(l: Lead): boolean {
  return l.stage >= STAGE_SEPARACION;
}
export function isGanado(l: Lead): boolean {
  return l.status === STATUS_WON;
}
export function isPerdido(l: Lead): boolean {
  return l.status === STATUS_LOST;
}
export function isAbierto(l: Lead): boolean {
  return l.status === STATUS_OPEN;
}

/**
 * Una "venta" para el negocio: llegó a Separación (hay plata comprometida) o
 * el CRM ya la marcó como Ganada. Contar sólo `won` subestima el cierre real,
 * porque las separaciones tardan en actualizarse.
 */
export function isVenta(l: Lead): boolean {
  return l.stage >= STAGE_SEPARACION || l.status === STATUS_WON;
}

/** Aplica todos los filtros activos. Orden: del predicado más barato al más caro. */
export function applyFilters(leads: Lead[], st: FilterState, digitalSources: number[]): Lead[] {
  const digitalSet = new Set(digitalSources);
  const projectSet = st.projects.length ? new Set(st.projects) : null;
  const sourceSet = st.sources.length ? new Set(st.sources) : null;
  const campaignSet = st.campaigns.length ? new Set(st.campaigns) : null;
  const statusSet = st.status.length ? new Set(st.status) : null;
  const exStatusSet = st.exStatus.length ? new Set(st.exStatus) : null;
  const monthSet = st.months.length ? new Set(st.months) : null;
  const exMonthSet = st.exMonths.length ? new Set(st.exMonths) : null;

  return leads.filter((l) => {
    if (projectSet && !projectSet.has(l.project)) return false;
    if (st.unidad === 'constructora' && !CONSTRUCTORA_IDX.includes(l.project)) return false;
    if (st.unidad === 'inmobiliaria' && !INMOBILIARIA_IDX.includes(l.project)) return false;

    if (st.year !== null && l.date.slice(0, 4) !== st.year) return false;
    if (monthSet && !monthSet.has(l.month)) return false;
    if (exMonthSet && exMonthSet.has(l.month)) return false;

    if (statusSet && !statusSet.has(l.status)) return false;
    if (exStatusSet && exStatusSet.has(l.status)) return false;

    if (st.digital === true && !digitalSet.has(l.source)) return false;
    if (st.digital === false && digitalSet.has(l.source)) return false;

    if (sourceSet && !sourceSet.has(l.source)) return false;
    if (campaignSet && !campaignSet.has(l.campaign)) return false;

    if (st.dateFrom && l.date < st.dateFrom) return false;
    if (st.dateTo && l.date > st.dateTo) return false;

    return true;
  });
}

/**
 * Eje temporal derivado de los datos filtrados.
 * En `period: 'year'` agrupa por año; si no, por mes.
 */
export function timeAxis(leads: Lead[], period: Period): {
  keys: string[];
  labels: string[];
  isYear: boolean;
} {
  const isYear = period === 'year';
  const keys = [...new Set(leads.map((l) => (isYear ? l.date.slice(0, 4) : l.month)))]
    .filter((k) => k.slice(0, 4) >= MIN_YEAR)
    .sort();
  return { keys, labels: keys, isYear };
}

export function keyOf(lead: Lead, isYear: boolean): string {
  return isYear ? lead.date.slice(0, 4) : lead.month;
}

export interface Kpis {
  total: number;
  citas: number;
  visitas: number;
  separaciones: number;
  ganados: number;
  perdidos: number;
  abiertos: number;
  enNegociacion: number;
  enSeparacion: number;
  /** Cierres proyectados: 30 % de los que negocian + 70 % de los que separaron. */
  cierresProyectados: number;
}

export function computeKpis(f: Lead[]): Kpis {
  const abiertos = f.filter(isAbierto);
  const enNegociacion = abiertos.filter((l) => l.stage === STAGE_NEGOCIACION).length;
  const enSeparacion = abiertos.filter((l) => l.stage === STAGE_SEPARACION).length;

  return {
    total: f.length,
    citas: f.filter(isCita).length,
    visitas: f.filter(isVisita).length,
    separaciones: f.filter(isSeparacion).length,
    ganados: f.filter(isGanado).length,
    perdidos: f.filter(isPerdido).length,
    abiertos: abiertos.length,
    enNegociacion,
    enSeparacion,
    cierresProyectados: Math.round(enNegociacion * 0.3 + enSeparacion * 0.7),
  };
}

/**
 * Meta aplicable al filtro actual.
 *
 * Devuelve `null` cuando la meta no tiene sentido: la inmobiliaria no tiene
 * metas definidas, así que compararse contra una suma de constructora sería
 * inventar el número.
 */
export function goalFor(st: FilterState): Goal | null {
  if (st.unidad === 'inmobiliaria') return null;

  const cons = st.projects.filter((i) => CONSTRUCTORA_IDX.includes(i));
  if (st.projects.length && cons.length === 0) return null;

  if (cons.length === 1) return META[cons[0]] ?? null;

  // Sin proyecto seleccionado (o varios): meta agregada de la constructora.
  // Tinguazul 1 comparte la meta de 2A, así que sumarlo la duplicaría.
  const inari = META[0];
  const tng = META[1];
  return {
    leads: inari.leads + tng.leads,
    citas: inari.citas + tng.citas,
    visitas: inari.visitas + tng.visitas,
    cierres: inari.cierres + tng.cierres,
    tasa: (inari.tasa + tng.tasa) / 2,
  };
}

/** Meses presentes en los datos, ordenados y recortados a `MIN_YEAR`. */
export function availableMonths(leads: Lead[]): string[] {
  return [...new Set(leads.map((l) => l.month))].filter((m) => m.slice(0, 4) >= MIN_YEAR).sort();
}

export function availableYears(leads: Lead[]): string[] {
  return [...new Set(leads.map((l) => l.date.slice(0, 4)))].filter((y) => y >= MIN_YEAR).sort();
}

/** Cuenta ocurrencias por índice, devolviendo un arreglo denso del largo de `size`. */
export function countBy(leads: Lead[], pick: (l: Lead) => number, size: number): number[] {
  const out = new Array<number>(size).fill(0);
  for (const l of leads) {
    const i = pick(l);
    if (i >= 0 && i < size) out[i] += 1;
  }
  return out;
}

/** Datos + metadatos que todas las pestañas reciben. */
export interface TabProps {
  data: DashboardData;
  filtered: Lead[];
  filters: FilterState;
  meta: Meta;
}
