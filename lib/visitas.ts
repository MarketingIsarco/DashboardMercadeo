import { isVisita } from '@/lib/selectors';
import type { FilterState } from '@/lib/selectors';
import type { Lead } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRASTRE DE VISITAS
 *
 * El embudo del dashboard cuenta cada visita en el mes en que el lead se
 * **registró**: un cliente de octubre que visita en noviembre suma a octubre.
 * Esto mide lo contrario: en el mes en que la visita **ocurrió**, de qué mes
 * venía el lead. Es lo que explica por qué noviembre "tiene pocas visitas" en
 * el KPI mientras la sala está llena: buena parte son leads de meses previos.
 *
 * La fecha de visita sale de `Lead.visitDate` (ver su comentario en
 * `lib/types.ts`). Las visitas sin fecha confiable se cuentan aparte para que
 * nadie compare el total de aquí contra el KPI sin saber la diferencia.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** 0 = mismo mes del registro, 1 = mes siguiente, 2 = dos o más meses después. */
export type Desfase = 0 | 1 | 2;

export const DESFASES: Desfase[] = [0, 1, 2];

export const DESFASE_LABEL: Record<Desfase, string> = {
  0: 'Registrados el mismo mes',
  1: 'Registrados el mes anterior',
  2: 'Registrados 2+ meses antes',
};

export const DESFASE_COLOR: Record<Desfase, string> = {
  0: '#0b5f7e',
  1: '#ff8a3d',
  2: '#f2b134',
};

export interface Visita {
  lead: Lead;
  /** `YYYY-MM-DD` de la visita. */
  fecha: string;
  /** `YYYY-MM` de la visita. */
  mes: string;
  /** Meses entre el registro y la visita, sin topar (0, 1, 2, 3…). */
  meses: number;
  desfase: Desfase;
}

/** Meses calendario de `a` a `b` (`YYYY-MM`). Negativo si `b` es anterior. */
export function mesesEntre(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/**
 * Las visitas fechables de un conjunto de leads, más cuántas no se pudieron
 * fechar. Sólo cuentan los leads que llegaron a Visitado (etapa alcanzada,
 * igual que el KPI).
 */
export function visitasDe(leads: Lead[]): { visitas: Visita[]; sinFecha: number } {
  const visitas: Visita[] = [];
  let sinFecha = 0;

  for (const lead of leads) {
    if (!isVisita(lead)) continue;
    const fecha = lead.visitDate ?? '';
    if (!fecha) {
      sinFecha++;
      continue;
    }
    const mes = fecha.slice(0, 7);
    const meses = mesesEntre(lead.month, mes);
    // El servidor ya descarta fechas anteriores a la creación; esto cubre
    // payloads viejos de la caché.
    if (meses < 0) {
      sinFecha++;
      continue;
    }
    visitas.push({ lead, fecha, mes, meses, desfase: (meses >= 2 ? 2 : meses) as Desfase });
  }
  return { visitas, sinFecha };
}

/**
 * ¿La visita cae dentro de los filtros de tiempo de la barra principal?
 * Aquí el periodo se evalúa contra la fecha de la **visita**, no la del lead.
 */
export function visitaEnPeriodo(fecha: string, st: FilterState): boolean {
  const mes = fecha.slice(0, 7);
  if (st.year !== null && fecha.slice(0, 4) !== st.year) return false;
  if (st.months.length && !st.months.includes(mes)) return false;
  if (st.exMonths.length && st.exMonths.includes(mes)) return false;
  if (st.dateFrom && fecha < st.dateFrom) return false;
  if (st.dateTo && fecha > st.dateTo) return false;
  return true;
}

/** Filtros sin la parte de tiempo: el periodo se aplica después, a la visita. */
export function sinFiltroDeTiempo(st: FilterState): FilterState {
  return { ...st, months: [], exMonths: [], year: null, dateFrom: null, dateTo: null };
}

export interface MesDeVisita {
  mes: string;
  total: number;
  /** Visitas por desfase, en el orden de `DESFASES`. */
  porDesfase: [number, number, number];
  /** % de las visitas del mes que vienen de leads de meses anteriores. */
  pctArrastre: number;
}

/** Visitas agrupadas por el mes en que ocurrieron. */
export function porMesDeVisita(visitas: Visita[]): MesDeVisita[] {
  const m = new Map<string, [number, number, number]>();
  for (const v of visitas) {
    const b = m.get(v.mes) ?? [0, 0, 0];
    b[v.desfase]++;
    m.set(v.mes, b);
  }
  return [...m.keys()].sort().map((mes) => {
    const porDesfase = m.get(mes)!;
    const total = porDesfase[0] + porDesfase[1] + porDesfase[2];
    return {
      mes,
      total,
      porDesfase,
      pctArrastre: total ? ((porDesfase[1] + porDesfase[2]) / total) * 100 : 0,
    };
  });
}

export interface Cohorte {
  /** Mes de registro. */
  mes: string;
  total: number;
  mismo: number;
  siguiente: number;
  despues: number;
  /** % de las visitas del grupo que ocurrieron en un mes posterior al registro. */
  pctPasan: number;
  /**
   * El grupo todavía puede sumar visitas en meses siguientes: es el mes en
   * curso o el anterior. Su % de arrastre está subestimado.
   */
  abierta: boolean;
}

/** Visitas agrupadas por el mes de registro del lead. */
export function porCohorte(visitas: Visita[], mesActual: string): Cohorte[] {
  const m = new Map<string, Cohorte>();
  for (const v of visitas) {
    const c =
      m.get(v.lead.month) ??
      { mes: v.lead.month, total: 0, mismo: 0, siguiente: 0, despues: 0, pctPasan: 0, abierta: false };
    c.total++;
    if (v.desfase === 0) c.mismo++;
    else if (v.desfase === 1) c.siguiente++;
    else c.despues++;
    m.set(v.lead.month, c);
  }
  return [...m.values()]
    .sort((a, b) => (a.mes < b.mes ? -1 : 1))
    .map((c) => ({
      ...c,
      pctPasan: c.total ? ((c.siguiente + c.despues) / c.total) * 100 : 0,
      abierta: mesesEntre(c.mes, mesActual) < 2,
    }));
}
