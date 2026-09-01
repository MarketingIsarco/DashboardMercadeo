import { ROTTEN_DAYS } from '@/lib/config/negocio';
import type { ActivityDay, Lead } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GESTIÓN DEL PIPELINE ABIERTO
 *
 * Todo lo demás en el dashboard mira leads que ya pasaron. Esto mira los que
 * están vivos y pregunta lo único que importa hoy: ¿alguien los está tocando?
 *
 * Dos señales independientes, y conviene no confundirlas:
 *  · `activityState` — ¿hay una próxima actividad agendada en el CRM?
 *    Es intención declarada por el asesor. Alimenta la pestaña Gerencia.
 *  · `rottenInfo` — ¿cuánto lleva el lead sin moverse, contra el límite que la
 *    política le da a su etapa y proyecto? Es tiempo real transcurrido.
 *    Alimenta "Gestión en Tiempo Real" en Comercial.
 *
 * Un lead puede estar "al día" (tiene cita agendada para el viernes) y a la vez
 * "vencido" (lleva 9 días quieto). Ese cruce es justamente la alerta útil.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DAY_MS = 86_400_000;

/**
 * `YYYY-MM-DD` en hora local. Local y no UTC a propósito: "vencido" se compara
 * contra el día que el asesor tiene en su calendario, no contra Greenwich.
 */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Interpreta `YYYY-MM-DD` como mediodía UTC: inmune a saltos de zona horaria. */
function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

/** Días completos de `from` a `to`. Nunca negativo. */
export function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = Math.floor((parseISO(to) - parseISO(from)) / DAY_MS);
  return diff > 0 ? diff : 0;
}

export type ActivityState = 'aldia' | 'vencida' | 'sin-registro';

/**
 * Estado de la próxima actividad agendada.
 *
 * "Sin registro" no es un caso menor ni un empate: es un lead abierto que nadie
 * puso en su agenda. Se cuenta aparte de "vencida" porque la acción correctiva
 * es distinta — uno hay que reprogramarlo, el otro ni siquiera existe para el
 * asesor.
 */
export function activityState(l: Lead, today: string): ActivityState {
  if (!l.nextActivity) return 'sin-registro';
  return l.nextActivity >= today ? 'aldia' : 'vencida';
}

export interface RottenInfo {
  /** Días permitidos en esta etapa/proyecto; `null` = no se audita. */
  threshold: number | null;
  /** Días desde el último movimiento del deal. */
  daysStale: number;
  /** Días por encima del umbral. `0` si va en tiempo o no se audita. */
  overdue: number;
  isRotten: boolean;
}

export function rottenInfo(l: Lead, today: string): RottenInfo {
  const threshold = ROTTEN_DAYS[l.project]?.[l.stage] ?? null;
  const daysStale = daysBetween(l.updateTime || l.date, today);
  const overdue = threshold === null ? 0 : Math.max(0, daysStale - threshold);
  return { threshold, daysStale, overdue, isRotten: overdue > 0 };
}

/** Un lead abierto con sus dos señales de gestión ya calculadas. */
export interface GestionLead extends RottenInfo {
  lead: Lead;
  activity: ActivityState;
}

export function enrichGestion(open: Lead[], today: string): GestionLead[] {
  return open.map((lead) => ({ lead, activity: activityState(lead, today), ...rottenInfo(lead, today) }));
}

// ─────────────────────────────────────────────────────────────────────
// Acciones diarias por asesor (capítulo 04 de Gerencia)
// ─────────────────────────────────────────────────────────────────────

/** 0 = lunes … 6 = domingo, a partir de `YYYY-MM-DD`. */
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  // Mediodía UTC: inmune a que el runtime del servidor esté en otra zona.
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

/** Todos los días `YYYY-MM-DD` de un mes `YYYY-MM`, en orden. */
export function diasDelMes(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export interface AccionesPorAsesor {
  /** índice de asesor → (`YYYY-MM-DD` → acciones registradas ese día). */
  porAsesor: Map<number, Map<string, number>>;
  /** Meses `YYYY-MM` con al menos una acción, ascendente. */
  meses: string[];
}

/**
 * Reagrupa las actividades por asesor y día.
 *
 * `leads` son los que ya pasaron los filtros: las actividades de un trato que
 * quedó fuera del filtro se ignoran, y las de tratos que no existen en el
 * dashboard (pipelines no mapeados, tratos borrados) tampoco entran. El trato
 * sólo decide **si la actividad entra**; a quién se le acredita ya viene
 * resuelto en `a.advisor`, que es el usuario asignado a la actividad.
 */
export function accionesPorAsesor(activityDays: ActivityDay[], leads: Lead[]): AccionesPorAsesor {
  const permitidos = new Set<number>();
  for (const l of leads) permitidos.add(l.id);

  const porAsesor = new Map<number, Map<string, number>>();
  const meses = new Set<string>();

  for (const a of activityDays) {
    if (!permitidos.has(a.dealId)) continue;

    meses.add(a.date.slice(0, 7));
    let dias = porAsesor.get(a.advisor);
    if (!dias) {
      dias = new Map();
      porAsesor.set(a.advisor, dias);
    }
    dias.set(a.date, (dias.get(a.date) ?? 0) + a.count);
  }

  return { porAsesor, meses: [...meses].sort() };
}

export interface SerieAsesor {
  asesor: string;
  /** Una posición por día del mes, en orden. Los días sin acción son 0. */
  datos: number[];
  suma: number;
}

/**
 * Serie diaria de cada asesor para un mes, del más activo al menos activo.
 *
 * Los asesores sin ninguna acción en el mes se omiten: una línea plana en cero
 * no dice nada y llena la leyenda de nombres que estorban.
 */
export function seriesDelMes(
  porAsesor: Map<number, Map<string, number>>,
  month: string,
  nombreDe: (asesor: number) => string,
): SerieAsesor[] {
  const dias = diasDelMes(month);

  return [...porAsesor.entries()]
    .map(([asesor, porDia]) => {
      const datos = dias.map((d) => porDia.get(d) ?? 0);
      return { asesor: nombreDe(asesor), datos, suma: datos.reduce((a, b) => a + b, 0) };
    })
    .filter((s) => s.suma > 0)
    .sort((a, b) => b.suma - a.suma);
}
