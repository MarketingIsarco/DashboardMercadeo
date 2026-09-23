import {
  CONSTRUCTORA_IDX,
  META,
  metasEtapa,
  STAGE_CONTACTADO,
  MIN_YEAR,
  STAGE_CITA,
  STAGE_NEGOCIACION,
  STAGE_SEPARACION,
  STAGE_VISITA,
} from '@/lib/config/negocio';
import type { Goal, MetasEtapa } from '@/lib/config/negocio';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { DashboardData, Lead, Meta, Status } from '@/lib/types';


export interface FilterState {
  /** Meses `YYYY-MM` incluidos. Vacío = todos. */
  months: string[];
  /** Meses excluidos explícitamente. Gana sobre `months`. */
  exMonths: string[];
  status: Status[];
  exStatus: Status[];
  /**
   * Índices en `STAGES` de la etapa **actual** del trato. Vacío = todas.
   *
   * Es la etapa donde está parado hoy, no la más avanzada que alcanzó: ver
   * `STAGE_FILTER_IDX` en `config/negocio.ts`.
   */
  stages: number[];
  /** Etapas actuales excluidas explícitamente. Gana sobre `stages`. */
  exStages: number[];
  /** Índices en `meta.sources`. */
  sources: number[];
  /** Índices en `meta.campaigns`. */
  campaigns: number[];
  /**
   * Índices en `meta.labels`. Un lead pasa si tiene **al menos una** de las
   * etiquetas seleccionadas, porque un trato puede llevar varias y exigir
   * todas devolvería casi siempre cero.
   */
  labels: number[];
  /** Índices en `meta.projects`. */
  projects: number[];
  /** `true` = sólo digital, `false` = sólo no-digital, `null` = ambos. */
  digital: boolean | null;
  year: string | null;
  /** `YYYY-MM-DD` inclusivo. */
  dateFrom: string | null;
  dateTo: string | null;
}

export const defaultFilters: FilterState = {
  months: [],
  exMonths: [],
  status: [],
  exStatus: [],
  stages: [],
  exStages: [],
  sources: [],
  campaigns: [],
  labels: [],
  projects: [],
  digital: null,
  year: null,
  dateFrom: null,
  dateTo: null,
};

export function isContactado(l: Lead): boolean {
  return l.stage >= STAGE_CONTACTADO;
}
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
  const labelSet = st.labels.length ? new Set(st.labels) : null;
  const statusSet = st.status.length ? new Set(st.status) : null;
  const exStatusSet = st.exStatus.length ? new Set(st.exStatus) : null;
  const stageSet = st.stages.length ? new Set(st.stages) : null;
  const exStageSet = st.exStages.length ? new Set(st.exStages) : null;
  const monthSet = st.months.length ? new Set(st.months) : null;
  const exMonthSet = st.exMonths.length ? new Set(st.exMonths) : null;

  return leads.filter((l) => {
    if (projectSet && !projectSet.has(l.project)) return false;

    if (st.year !== null && l.date.slice(0, 4) !== st.year) return false;
    if (monthSet && !monthSet.has(l.month)) return false;
    if (exMonthSet && exMonthSet.has(l.month)) return false;

    if (statusSet && !statusSet.has(l.status)) return false;
    if (exStatusSet && exStatusSet.has(l.status)) return false;

    // Etapa actual, no alcanzada: comparación exacta, no `>=`.
    if (stageSet && !stageSet.has(l.stage)) return false;
    if (exStageSet && exStageSet.has(l.stage)) return false;

    if (st.digital === true && !digitalSet.has(l.source)) return false;
    if (st.digital === false && digitalSet.has(l.source)) return false;

    if (sourceSet && !sourceSet.has(l.source)) return false;
    if (campaignSet && !campaignSet.has(l.campaign)) return false;

    if (st.dateFrom && l.date < st.dateFrom) return false;
    if (st.dateTo && l.date > st.dateTo) return false;

    // Va de último porque es el único predicado que recorre un arreglo.
    if (labelSet && !l.labels.some((i) => labelSet.has(i))) return false;

    return true;
  });
}

/**
 * Eje temporal derivado de los datos filtrados. Siempre agrupa por mes.
 *
 * Antes existía un control "Agrupar por" (Mes / Año) en la barra principal que
 * hacía a esta función devolver años. Se quitó: para mirar un año completo se
 * usa el filtro de Periodo, que ya deja escoger el año, y tener dos maneras de
 * recortar el mismo eje era la forma de que dos gráficas contaran distinto.
 */
export function timeAxis(leads: Lead[]): { keys: string[] } {
  const keys = [...new Set(leads.map((l) => l.month))]
    .filter((k) => k.slice(0, 4) >= MIN_YEAR)
    .sort();
  return { keys };
}

export function keyOf(lead: Lead): string {
  return lead.month;
}

export interface Kpis {
  total: number;
  /**
   * Leads que **alcanzaron** Contactado, con el mismo criterio que citas y
   * visitas (`stage >= X`). Es el primer escalón real del embudo: la diferencia
   * contra el total son los leads que nadie tocó todavía.
   */
  contactados: number;
  citas: number;
  visitas: number;
  /**
   * Leads que **alcanzaron** Negociación, contando igual que citas y visitas
   * (`stage >= X`), no los que están parados ahí hoy — eso es `enNegociacion`.
   *
   * Sin este dato el embudo de los indicadores generales saltaba de Visitas a
   * Separación, que es justo donde se cae la mitad del pipeline.
   */
  negociaciones: number;
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
    contactados: f.filter(isContactado).length,
    citas: f.filter(isCita).length,
    visitas: f.filter(isVisita).length,
    negociaciones: f.filter(isNegociacion).length,
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
 * inventar el número. Con sólo proyectos de inmobiliaria seleccionados, `cons`
 * queda vacío y se cae por ahí — es lo que antes atajaba el filtro de Unidad.
 */
export function goalFor(st: FilterState): Goal | null {
  const cons = st.projects.filter((i) => CONSTRUCTORA_IDX.includes(i));
  if (st.projects.length && cons.length === 0) return null;

  let base;
  if (cons.length === 1) {
    base = META[cons[0]];
    if (!base) return null;
  } else {
    // Sin proyecto seleccionado (o varios): meta agregada de la constructora.
    // Tinguazul 1 comparte la meta de 2A, así que sumarlo la duplicaría.
    const inari = META[0];
    const tng = META[1];
    base = { leads: inari.leads + tng.leads, cierres: inari.cierres + tng.cierres };
  }

  // Las metas de etapa se derivan de la meta de leads y del canal filtrado.
  // Se calculan sobre `base.leads` ya agregado, no sumando las de cada
  // proyecto: redondear dos veces y sumar da un número distinto de redondear
  // el total una vez, y el tablero mostraría metas que no cuadran entre sí.
  const digital = metasEtapa(base.leads, true);
  const noDigital = metasEtapa(base.leads, false);

  return {
    leads: base.leads,
    cierres: base.cierres,
    tasa: base.leads ? (base.cierres / base.leads) * 100 : 0,
    etapas: st.digital === null ? null : st.digital ? digital : noDigital,
    porCanal: { digital, noDigital },
  };
}

/**
 * Texto de la meta de una etapa, listo para el rótulo del KPI.
 *
 * Sin canal escogido no hay una sola meta, así que muestra las dos referencias
 * en vez de callarlas: el usuario sigue viendo contra qué compararse, y queda
 * explícito que el número depende del canal.
 */
export function metaEtapa(goal: Goal | null, k: keyof MetasEtapa): string | undefined {
  if (!goal) return undefined;
  if (goal.etapas) return `Meta ${goal.etapas[k]}/mes`;
  return `Meta ${goal.porCanal.digital[k]} dig · ${goal.porCanal.noDigital[k]} no dig`;
}

/**
 * Variación contra la meta de etapa, en %.
 *
 * `null` mientras no haya canal escogido —no hay contra qué medir— y también
 * cuando la meta es cero, que dividiría por cero.
 */
export function deltaEtapa(goal: Goal | null, k: keyof MetasEtapa, real: number): number | null {
  if (!goal?.etapas) return null;
  const m = goal.etapas[k];
  return m ? ((real - m) / m) * 100 : null;
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
