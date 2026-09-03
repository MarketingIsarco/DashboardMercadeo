import { ADVISOR_PROJECTS, ADVISOR_SCOPE_IDX } from '@/lib/config/negocio';
import { firstName, normalize } from '@/lib/format';
import type { ActivityDay, Lead } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GESTIÓN CRUZADA ENTRE PROYECTOS
 *
 * Cada asesor de la constructora atiende un solo proyecto (`ADVISOR_PROJECTS`).
 * Cuando en el CRM aparece gestión suya sobre el proyecto de otro, el número de
 * actividades del capítulo 04 deja de significar esfuerzo comercial: puede ser
 * un asesor cubriendo a otro sin que nadie lo sepa, una actividad creada sobre
 * el trato equivocado, o —lo más frecuente— una automatización que dispara con
 * el usuario dueño del token y le acredita a él la gestión de todo el equipo.
 *
 * Este módulo sólo **detecta y describe**. No descuenta: el conteo del asesor
 * sigue siendo el mismo que ve en Pipedrive, y la alerta es lo que dice qué
 * parte de ese conteo hay que ir a corregir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un trato ajeno sobre el que un asesor registró gestión. */
export interface CruceTrato {
  dealId: number;
  /** Índice en `PROJECTS` del proyecto que no le corresponde. */
  project: number;
  /** Nombre del contacto del trato, para poder buscarlo en el CRM. */
  name: string;
  /** Actividades que ese asesor registró en ese trato dentro del periodo. */
  count: number;
  /** Última fecha con gestión cruzada sobre el trato. */
  ultima: string;
}

/** El cruce de un asesor, ya resumido para la alerta. */
export interface CruceAsesor {
  /** Índice del asesor en `Meta.advisors`. */
  advisor: number;
  /** Nombre corto, tal como se pinta en la tabla. */
  nombre: string;
  /** Total de actividades sobre proyectos que no le corresponden. */
  count: number;
  /** Proyectos que sí tiene asignados, en orden de `PROJECTS`. */
  permitidos: number[];
  /** Proyectos ajenos donde se encontró gestión, en orden de `PROJECTS`. */
  ajenos: number[];
  /** Un renglón por trato, del más cargado al menos cargado. */
  tratos: CruceTrato[];
}

/**
 * Proyectos autorizados de un asesor; `null` cuando no se audita.
 *
 * Se empareja por primer nombre normalizado — ver `ADVISOR_PROJECTS`.
 */
export function proyectosDeAsesor(fullName: string): number[] | null {
  return ADVISOR_PROJECTS[normalize(firstName(fullName))] ?? null;
}

/** ¿Esa actividad, sobre ese proyecto, viola la asignación del asesor? */
function esCruce(permitidos: number[], project: number): boolean {
  // Fuera de la constructora la política no aplica: no es un cruce, es otra
  // unidad de negocio.
  if (!ADVISOR_SCOPE_IDX.includes(project)) return false;
  return !permitidos.includes(project);
}

/**
 * Cruces por asesor, a partir de las actividades **ya filtradas**.
 *
 * Recibe exactamente las mismas filas que alimentan el conteo de la tabla y el
 * mapa `dealId → trato` con el que se filtraron. Comparte insumo a propósito:
 * si la alerta recorriera los datos por su cuenta acabaría contando un universo
 * distinto al del número que acompaña, y una alerta que no cuadra con la cifra
 * de al lado es peor que no tener alerta.
 */
export function crucesDeGestion(
  actividades: ActivityDay[],
  tratos: Map<number, Lead>,
  advisors: string[],
): Map<number, CruceAsesor> {
  /** asesor → (trato → acumulado), para no repetir el trato por cada día. */
  const porAsesor = new Map<number, Map<number, CruceTrato>>();
  const permitidosDe = new Map<number, number[] | null>();

  for (const a of actividades) {
    const trato = tratos.get(a.dealId);
    if (!trato) continue;

    if (!permitidosDe.has(a.advisor)) {
      permitidosDe.set(a.advisor, proyectosDeAsesor(advisors[a.advisor] ?? ''));
    }
    const permitidos = permitidosDe.get(a.advisor);
    // `null` = asesor sin política asignada; no se audita.
    if (!permitidos || !esCruce(permitidos, trato.project)) continue;

    let porTrato = porAsesor.get(a.advisor);
    if (!porTrato) {
      porTrato = new Map();
      porAsesor.set(a.advisor, porTrato);
    }

    const prev = porTrato.get(a.dealId);
    if (prev) {
      prev.count += a.count;
      if (a.date > prev.ultima) prev.ultima = a.date;
    } else {
      porTrato.set(a.dealId, {
        dealId: a.dealId,
        project: trato.project,
        name: trato.name || `Trato ${a.dealId}`,
        count: a.count,
        ultima: a.date,
      });
    }
  }

  const salida = new Map<number, CruceAsesor>();

  for (const [advisor, porTrato] of porAsesor) {
    const tratosOrdenados = [...porTrato.values()].sort(
      (a, b) => b.count - a.count || (a.ultima < b.ultima ? 1 : -1),
    );

    salida.set(advisor, {
      advisor,
      nombre: firstName(advisors[advisor] ?? `#${advisor}`),
      count: tratosOrdenados.reduce((n, t) => n + t.count, 0),
      permitidos: permitidosDe.get(advisor) ?? [],
      ajenos: [...new Set(tratosOrdenados.map((t) => t.project))].sort((a, b) => a - b),
      tratos: tratosOrdenados,
    });
  }

  return salida;
}

/** Suma de todas las actividades cruzadas del periodo. */
export function totalCruces(cruces: Map<number, CruceAsesor>): number {
  let n = 0;
  for (const c of cruces.values()) n += c.count;
  return n;
}
