/**
 * Capítulo 04 de Mercadeo · Campañas.
 *
 * Desempeño del campo "Campaña" del trato (el conjunto de anuncios que trajo
 * el lead). Lógica pura, sin React, para poder probarla con asserts en Node:
 * Chart.js dibuja en canvas y sus cifras no se leen desde el DOM.
 *
 * Convenciones, las mismas del resto de la pestaña:
 * · Leads, citas, visitas y perdidos se cuentan sobre `filtered` (fecha de
 *   creación). Las tasas son de alcance: "% Cita" = leads que llegaron al
 *   menos a cita agendada, sobre los leads de esa fila.
 * · Ganados salen de `ganados` (fecha de ganado), así que una fila puede tener
 *   ganados de leads creados fuera del periodo. Ver `ganados_won_time`.
 */
import type { Lead } from '@/lib/types';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import { STAGE_CITA, STAGE_VISITA } from '@/lib/config/negocio';

export const SIN_CAMPANA = 'Sin campaña';

export interface FilaPauta {
  /** Índice en la lista de nombres (`meta.campaigns`). */
  idx: number;
  nombre: string;
  /** `true` para la fila "Sin campaña". */
  sinDato: boolean;
  leads: number;
  citas: number;
  visitas: number;
  perdidos: number;
  abiertos: number;
  /** Ganados del periodo por fecha de ganado. */
  ganados: number;
  /** Proyecto con más leads en la fila (índice en `PROJECTS`); `-1` si no hay leads. */
  proyecto: number;
  /** Primer y último lead captado (`YYYY-MM-DD`); `''` sin leads. */
  desde: string;
  hasta: string;
}

/**
 * Una fila por valor del campo, de mayor a menor volumen, con la fila sin
 * dato siempre al final: no es una campaña, es lo que falta por clasificar.
 */
export function desempenoPor(
  leads: Lead[],
  ganados: Lead[],
  pick: (l: Lead) => number,
  nombres: string[],
  sinDato: string,
): FilaPauta[] {
  const filas = new Map<number, FilaPauta & { porProyecto: Map<number, number> }>();
  const fila = (i: number) => {
    let f = filas.get(i);
    if (!f) {
      const nombre = nombres[i] ?? `#${i}`;
      f = {
        idx: i,
        nombre,
        sinDato: nombre === sinDato,
        leads: 0,
        citas: 0,
        visitas: 0,
        perdidos: 0,
        abiertos: 0,
        ganados: 0,
        proyecto: -1,
        desde: '',
        hasta: '',
        porProyecto: new Map(),
      };
      filas.set(i, f);
    }
    return f;
  };

  for (const l of leads) {
    const f = fila(pick(l));
    f.leads += 1;
    if (l.stage >= STAGE_CITA) f.citas += 1;
    if (l.stage >= STAGE_VISITA) f.visitas += 1;
    if (l.status === STATUS_LOST) f.perdidos += 1;
    if (l.status === STATUS_OPEN) f.abiertos += 1;
    f.porProyecto.set(l.project, (f.porProyecto.get(l.project) ?? 0) + 1);
    if (!f.desde || l.date < f.desde) f.desde = l.date;
    if (!f.hasta || l.date > f.hasta) f.hasta = l.date;
  }
  for (const g of ganados) fila(pick(g)).ganados += 1;

  return [...filas.values()]
    .map(({ porProyecto, ...f }) => {
      let best = -1;
      let bestN = 0;
      for (const [p, n] of porProyecto) {
        if (n > bestN || (n === bestN && p < best)) {
          best = p;
          bestN = n;
        }
      }
      return { ...f, proyecto: best };
    })
    .sort(
      (a, b) =>
        Number(a.sinDato) - Number(b.sinDato) ||
        b.leads - a.leads ||
        b.ganados - a.ganados ||
        a.nombre.localeCompare(b.nombre),
    );
}

/**
 * Resultado de cada lead según hasta dónde llegó — los cuatro tramos son
 * excluyentes y suman los leads de la fila:
 * · Visita o más: llegó a visita, o está ganado.
 * · Cita: agendó cita pero no ha visitado.
 * · En gestión: abierto y sin cita.
 * · Perdido sin cita: se cayó antes de agendar.
 */
export const TRAMOS = ['Visita o más', 'Cita', 'En gestión', 'Perdido sin cita'] as const;
export type Tramo = (typeof TRAMOS)[number];
export const TRAMO_COLOR: Record<Tramo, string> = {
  'Visita o más': '#4ade80',
  Cita: '#f59e0b',
  'En gestión': '#6366f1',
  'Perdido sin cita': '#f87171',
};

export function tramoDe(l: Lead): Tramo {
  if (l.stage >= STAGE_VISITA || l.status === STATUS_WON) return 'Visita o más';
  if (l.stage >= STAGE_CITA) return 'Cita';
  if (l.status === STATUS_OPEN) return 'En gestión';
  return 'Perdido sin cita';
}

/** Conteo por tramo para cada índice pedido, en el orden de `TRAMOS`. */
export function tramosPor(leads: Lead[], pick: (l: Lead) => number, idxs: number[]): number[][] {
  const pos = new Map(idxs.map((i, k) => [i, k]));
  const out = TRAMOS.map(() => idxs.map(() => 0));
  for (const l of leads) {
    const k = pos.get(pick(l));
    if (k === undefined) continue;
    out[TRAMOS.indexOf(tramoDe(l))][k] += 1;
  }
  return out;
}
