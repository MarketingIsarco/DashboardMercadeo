import { ROTTEN_DAYS } from '@/lib/config/negocio';
import type { Lead } from '@/lib/types';

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
