import {
  BOLSA_PROJECTS,
  LOSS_GROUP_LABEL,
  OUTBOUND_EXCLUDED_LABELS,
  SIN_ETIQUETA,
  SIN_MOTIVO,
  STAGE_CITA,
  STAGE_NEGOCIACION,
  STAGE_SEPARACION,
  STAGE_VISITA,
} from '@/lib/config/negocio';
import type { Bolsa } from '@/lib/config/negocio';
import { normalize } from '@/lib/format';
import { BOLSAS, totalesMes } from '@/lib/inversion';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { Lead, Meta } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPARATIVO DE COHORTES
 *
 * Tres meses consecutivos de un proyecto, leídos como cohortes: cada lead
 * pertenece al mes en que **entró**, y se le sigue el rastro hasta donde llegó.
 * No es "qué pasó en agosto" sino "qué ha hecho hasta hoy la gente que entró en
 * agosto", que es lo único que permite comparar meses sin premiar al más viejo.
 *
 * Dos reglas gobiernan todo el capítulo:
 *
 *  · **Etapa máxima alcanzada, acumulada.** Un trato cuenta en su etapa más
 *    avanzada aunque después se haya perdido. Pipedrive conserva la etapa al
 *    perder, así que un perdido en Visitado sí fue una visita: descontarlo
 *    borraría trabajo comercial que sí ocurrió.
 *
 *  · **La inversión sólo compra leads digitales.** Los costos unitarios se
 *    calculan únicamente en la vista Digital. Dividir el gasto de Meta entre
 *    leads de sala de negocios o referidos inventa una eficiencia que no
 *    existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Origen del lead. `dig` = fuentes digitales, `nod` = el resto, `all` = ambas. */
export type Scope = 'dig' | 'nod' | 'all';

export const SCOPE_LABEL: Record<Scope, string> = {
  dig: 'Digital',
  nod: 'No digital',
  all: 'Todas',
};

export const SCOPE_NOTE: Record<Scope, string> = {
  dig: 'canales digitales',
  nod: 'canales no digitales',
  all: 'todas las fuentes',
};

/** Un mes de la cohorte, con todo lo que las ocho vistas necesitan. */
export interface Cohorte {
  month: string;
  leads: number;
  citas: number;
  visitas: number;
  neg: number;
  sep: number;
  abiertos: number;
  perdidos: number;
  ganados: number;
  /** Leads que nunca pasaron de Contactado: entraron y ahí se quedaron. */
  estancados: number;
  /** Inversión digital del mes, o `null` cuando el mes no tiene presupuesto cargado. */
  inversion: number | null;
}

const CERO_COHORTE = (month: string): Cohorte => ({
  month,
  leads: 0,
  citas: 0,
  visitas: 0,
  neg: 0,
  sep: 0,
  abiertos: 0,
  perdidos: 0,
  ganados: 0,
  estancados: 0,
  inversion: null,
});

/** Bolsa de presupuesto que cubre un proyecto, o `null` si no tiene. */
export function bolsaDelProyecto(projIdx: number): Bolsa | null {
  return BOLSAS.find((b) => BOLSA_PROJECTS[b].includes(projIdx)) ?? null;
}

/** ¿El lead entra en la vista de origen elegida? */
function enScope(l: Lead, scope: Scope, digitales: Set<number>): boolean {
  if (scope === 'all') return true;
  const esDigital = digitales.has(l.source);
  return scope === 'dig' ? esDigital : !esDigital;
}

/**
 * Leads de un proyecto y un origen, agrupados por mes de creación.
 *
 * Se ignora por completo la barra de filtros global: este capítulo tiene sus
 * propios controles, igual que el comparativo que reemplaza.
 */
export function leadsPorMes(
  leads: Lead[],
  projIdx: number,
  scope: Scope,
  digitalSources: number[],
): Map<string, Lead[]> {
  const digitales = new Set(digitalSources);
  const out = new Map<string, Lead[]>();

  for (const l of leads) {
    if (l.project !== projIdx) continue;
    if (!enScope(l, scope, digitales)) continue;

    const bucket = out.get(l.month);
    if (bucket) bucket.push(l);
    else out.set(l.month, [l]);
  }
  return out;
}

/**
 * Ganados de un proyecto y un origen, agrupados por **mes de ganado**.
 *
 * Es la excepción a la regla de cohortes del capítulo: los ganados se cuentan
 * en el mes en que se ganaron (`won_time`), igual que en el resto del
 * dashboard. Un trato creado en octubre y ganado en marzo es un ganado de
 * marzo, no de la cohorte de octubre.
 */
export function ganadosPorMes(
  leads: Lead[],
  projIdx: number,
  scope: Scope,
  digitalSources: number[],
): Map<string, number> {
  const digitales = new Set(digitalSources);
  const out = new Map<string, number>();
  for (const l of leads) {
    if (l.status !== STATUS_WON || !l.wonMonth) continue;
    if (l.project !== projIdx) continue;
    if (!enScope(l, scope, digitales)) continue;
    out.set(l.wonMonth, (out.get(l.wonMonth) ?? 0) + 1);
  }
  return out;
}

/** Meses `YYYY-MM` con al menos un lead, ascendente. */
export function mesesConLeads(porMes: Map<string, Lead[]>): string[] {
  return [...porMes.keys()].sort();
}

/**
 * Los tres meses que terminan en `cierre`, calendario puro.
 *
 * Se toman del calendario y no de los meses con datos: un mes sin un solo lead
 * es información —la pauta se apagó— y saltárselo dibujaría una continuidad
 * falsa entre junio y septiembre.
 */
export function ventanaTrimestre(cierre: string): string[] {
  const [y, m] = cierre.split('-').map(Number);
  return [2, 1, 0].map((atras) => {
    const d = new Date(Date.UTC(y, m - 1 - atras, 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * `ganados` es el conteo del mes por fecha de ganado (`ganadosPorMes`). Si no
 * se pasa, cae a los ganados de la cohorte.
 */
export function resumirCohorte(
  month: string,
  ls: Lead[],
  inversion: number | null,
  ganados?: number,
): Cohorte {
  if (ls.length === 0) return { ...CERO_COHORTE(month), inversion, ganados: ganados ?? 0 };

  return {
    month,
    leads: ls.length,
    citas: ls.filter((l) => l.stage >= STAGE_CITA).length,
    visitas: ls.filter((l) => l.stage >= STAGE_VISITA).length,
    neg: ls.filter((l) => l.stage >= STAGE_NEGOCIACION).length,
    sep: ls.filter((l) => l.stage >= STAGE_SEPARACION).length,
    abiertos: ls.filter((l) => l.status === STATUS_OPEN).length,
    perdidos: ls.filter((l) => l.status === STATUS_LOST).length,
    ganados: ganados ?? ls.filter((l) => l.status === STATUS_WON).length,
    estancados: ls.filter((l) => l.stage < STAGE_CITA).length,
    inversion,
  };
}

/**
 * Las tres cohortes de la ventana, con su inversión digital.
 *
 * La inversión llega sólo en la vista Digital y sólo si el proyecto tiene bolsa
 * de presupuesto. `null` no es cero: significa "no hay dato", y el tablero lo
 * pinta como raya para no leerse como que no se invirtió nada.
 */
export function cohortesDeVentana(
  porMes: Map<string, Lead[]>,
  ventana: string[],
  projIdx: number,
  scope: Scope,
  ganados?: Map<string, number>,
): Cohorte[] {
  const bolsa = scope === 'dig' ? bolsaDelProyecto(projIdx) : null;

  return ventana.map((m) => {
    const inv = bolsa ? totalesMes([bolsa], m).digital : null;
    return resumirCohorte(m, porMes.get(m) ?? [], inv || null, ganados ? (ganados.get(m) ?? 0) : undefined);
  });
}

// ── Fuentes ──────────────────────────────────────────────────────────

export interface FilaFuente {
  fuente: string;
  /** Una posición por mes de la ventana. */
  leads: number[];
  citas: number[];
  visitas: number[];
}

/**
 * Una fila por fuente, ordenada por volumen del mes más reciente.
 *
 * El orden mira primero el último mes y desempata con el acumulado: lo que
 * importa al abrir la tabla es qué está trayendo leads hoy, no qué los trajo
 * en junio.
 */
export function filasPorFuente(
  porMes: Map<string, Lead[]>,
  ventana: string[],
  sources: string[],
): FilaFuente[] {
  const idx = new Set<number>();
  for (const m of ventana) for (const l of porMes.get(m) ?? []) idx.add(l.source);

  const filas = [...idx].map((i) => {
    const del = (m: string) => (porMes.get(m) ?? []).filter((l) => l.source === i);
    return {
      fuente: sources[i] ?? `#${i}`,
      leads: ventana.map((m) => del(m).length),
      citas: ventana.map((m) => del(m).filter((l) => l.stage >= STAGE_CITA).length),
      visitas: ventana.map((m) => del(m).filter((l) => l.stage >= STAGE_VISITA).length),
    };
  });

  const ultimo = ventana.length - 1;
  const total = (f: FilaFuente) => f.leads.reduce((a, b) => a + b, 0);
  return filas
    .filter((f) => total(f) > 0)
    .sort((a, b) => b.leads[ultimo] - a.leads[ultimo] || total(b) - total(a));
}

// ── Campañas del mes más reciente ────────────────────────────────────

export interface FilaCampana {
  campana: string;
  /** `YYYY-MM-DD` del primer y último lead captado en el mes. */
  desde: string;
  hasta: string;
  dias: number;
  leads: number;
  citas: number;
  visitas: number;
  abiertos: number;
  /** Motivo de pérdida más frecuente, ya formateado con su conteo. */
  motivoTop: string;
}

/** Motivo de pérdida dominante de un grupo de leads, con su conteo. */
function motivoDominante(ls: Lead[]): string {
  const perdidos = ls.filter((l) => l.status === STATUS_LOST);
  if (perdidos.length === 0) return '—';

  const conteo = new Map<string, number>();
  for (const l of perdidos) {
    const g = l.lossGroup ? LOSS_GROUP_LABEL[l.lossGroup] : SIN_MOTIVO;
    conteo.set(g, (conteo.get(g) ?? 0) + 1);
  }

  const [nombre, n] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${nombre} (${n})`;
}

const DIA_MS = 86_400_000;

/**
 * Campañas activas en un mes, de mayor a menor volumen.
 *
 * La ventana de captación se calcula con el primer y el último lead que trajo,
 * no con las fechas de la plataforma: es cuándo la campaña **funcionó**, que
 * puede ser bastante menos que cuándo estuvo prendida.
 */
export function filasPorCampana(
  leadsDelMes: Lead[],
  campaigns: string[],
  minLeads = 5,
): FilaCampana[] {
  const porCampana = new Map<number, Lead[]>();
  for (const l of leadsDelMes) {
    const bucket = porCampana.get(l.campaign);
    if (bucket) bucket.push(l);
    else porCampana.set(l.campaign, [l]);
  }

  return [...porCampana.entries()]
    .map(([i, ls]) => {
      const fechas = ls.map((l) => l.date).sort();
      const desde = fechas[0];
      const hasta = fechas[fechas.length - 1];
      return {
        campana: campaigns[i] ?? `#${i}`,
        desde,
        hasta,
        // Inclusivo en ambos extremos: una campaña que trajo leads sólo el día
        // 5 duró un día, no cero.
        dias: Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA_MS) + 1,
        leads: ls.length,
        citas: ls.filter((l) => l.stage >= STAGE_CITA).length,
        visitas: ls.filter((l) => l.stage >= STAGE_VISITA).length,
        abiertos: ls.filter((l) => l.status === STATUS_OPEN).length,
        motivoTop: motivoDominante(ls),
      };
    })
    .filter((f) => f.leads >= minLeads)
    .sort((a, b) => b.leads - a.leads);
}

// ── Motivos de pérdida ───────────────────────────────────────────────

export interface FilaMotivo {
  motivo: string;
  /** Conteo por mes de la ventana. */
  n: number[];
  /** Participación sobre los perdidos de **ese** mes, no sobre los leads. */
  pct: number[];
}

export function filasPorMotivo(porMes: Map<string, Lead[]>, ventana: string[]): FilaMotivo[] {
  const perdidosDe = (m: string) => (porMes.get(m) ?? []).filter((l) => l.status === STATUS_LOST);
  const nombreDe = (l: Lead) => (l.lossGroup ? LOSS_GROUP_LABEL[l.lossGroup] : SIN_MOTIVO);

  const motivos = new Set<string>();
  for (const m of ventana) for (const l of perdidosDe(m)) motivos.add(nombreDe(l));

  const ultimo = ventana.length - 1;
  return [...motivos]
    .map((motivo) => {
      const n = ventana.map((m) => perdidosDe(m).filter((l) => nombreDe(l) === motivo).length);
      const pct = ventana.map((m, i) => {
        const base = perdidosDe(m).length;
        return base ? (100 * n[i]) / base : 0;
      });
      return { motivo, n, pct };
    })
    .sort((a, b) => b.pct[ultimo] - a.pct[ultimo] || b.n[ultimo] - a.n[ultimo]);
}

// ── Campañas outbound ────────────────────────────────────────────────

export interface FilaOutbound {
  etiqueta: string;
  leads: number;
  /** Meses `YYYY-MM` de la ventana en los que la etiqueta tuvo leads. */
  meses: string[];
  citas: number;
  visitas: number;
  ganados: number;
  motivoTop: string;
}

/**
 * Reactivaciones del período, por etiqueta del trato.
 *
 * Misma regla que el capítulo 06 de Mercadeo: se excluyen las etiquetas de
 * estado comercial y los tratos sin etiquetar. A diferencia del resto del
 * capítulo, **no** responde al filtro de origen: una reactivación se hace por
 * WhatsApp o por teléfono sobre un lead que pudo entrar por cualquier canal, y
 * cruzarla con el origen original del lead no dice nada útil.
 */
export function filasOutbound(
  leads: Lead[],
  projIdx: number,
  ventana: string[],
  labels: string[],
  minLeads = 1,
): FilaOutbound[] {
  const excluidas = new Set([...OUTBOUND_EXCLUDED_LABELS, SIN_ETIQUETA].map(normalize));
  const meses = new Set(ventana);
  const delPeriodo = leads.filter((l) => l.project === projIdx && meses.has(l.month));
  // Los ganados de la ventana, por mes de ganado (ver `ganadosPorMes`).
  const ganadosPeriodo = leads.filter(
    (l) => l.status === STATUS_WON && l.project === projIdx && meses.has(l.wonMonth),
  );

  return labels
    .map((etiqueta, i) => ({ etiqueta, i }))
    .filter(({ etiqueta }) => !excluidas.has(normalize(etiqueta)))
    .map(({ etiqueta, i }) => {
      const ls = delPeriodo.filter((l) => l.labels.includes(i));
      return {
        etiqueta,
        leads: ls.length,
        meses: ventana.filter((m) => ls.some((l) => l.month === m)),
        citas: ls.filter((l) => l.stage >= STAGE_CITA).length,
        visitas: ls.filter((l) => l.stage >= STAGE_VISITA).length,
        ganados: ganadosPeriodo.filter((l) => l.labels.includes(i)).length,
        motivoTop: motivoDominante(ls),
      };
    })
    .filter((f) => f.leads >= minLeads)
    .sort((a, b) => b.leads - a.leads);
}

// ── Utilidades de presentación ───────────────────────────────────────

/** Porcentaje `a` sobre `b`; `null` cuando no hay base contra la cual dividir. */
export function tasa(a: number, b: number): number | null {
  return b ? (100 * a) / b : null;
}

/**
 * Intensidad de una tasa contra el promedio del período.
 *
 * Devuelve un entero de -3 a 3. Se compara contra el promedio del propio
 * proyecto y no contra un número fijo: 13 % de lead a cita es excelente en un
 * proyecto y mediocre en otro, y una referencia absoluta haría ver a toda la
 * tabla de un solo color.
 */
export function intensidad(v: number | null, base: number | null): number {
  if (v === null || base === null || base === 0) return 0;
  const d = (v - base) / base;
  if (d >= 0.5) return 3;
  if (d >= 0.2) return 2;
  if (d >= 0.06) return 1;
  if (d <= -0.5) return -3;
  if (d <= -0.2) return -2;
  if (d <= -0.06) return -1;
  return 0;
}

export interface Variacion {
  /** Cambio porcentual contra el mes anterior. */
  pct: number;
  /** `true` si el cambio es bueno para el negocio. */
  bueno: boolean;
  /** Bajo el 1,5 % se considera plano: ruido, no tendencia. */
  plano: boolean;
}

/**
 * Variación del último mes contra el anterior.
 *
 * `menosEsMejor` invierte la lectura para los costos: un CPL que baja 20 % es
 * una buena noticia, y pintarlo de rojo por ser negativo sería exactamente al
 * revés de lo que el negocio necesita ver.
 */
export function variacion(
  actual: number | null,
  previo: number | null,
  menosEsMejor = false,
): Variacion | null {
  if (actual === null || previo === null || previo === 0) return null;

  const pct = (100 * (actual - previo)) / previo;
  const plano = Math.abs(pct) < 1.5;
  return { pct, bueno: menosEsMejor ? pct < 0 : pct > 0, plano };
}
