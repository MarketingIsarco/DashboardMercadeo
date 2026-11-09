import { CONSTRUCTORA_IDX, ROTTEN_DAYS, STAGES } from '@/lib/config/negocio';
import { STATUS_OPEN } from '@/lib/types';
import type { Lead, PrioSenales } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIORIDAD DE LEADS — COMERCIAL COIS
 *
 * Pipedrive no trae ninguna calificación útil del lead: no hay campo de
 * puntaje, la probabilidad por etapa de Tinguazul 2A está en 100 % en todas, y
 * los campos de perfil (ingresos, interés, presupuesto) están vacíos en más
 * del 95 % de los tratos. Y la regla de Comercial es que **nada puede depender
 * de que el asesor diligencie**.
 *
 * Así que el puntaje (0–100) sale sólo de lo que el CRM registra solo, en
 * cuatro bloques:
 *
 *  · Etapa — qué tan avanzado va.
 *  · Intención — lo que el lead declaró en el formulario de pauta y en su
 *    conversación con ISA.
 *  · Compromiso — qué tan reciente y viva está la gestión.
 *  · Riesgo — señales automáticas de que no va a cerrar.
 *
 * Las alarmas van **aparte** del puntaje: un lead muy probable y mal atendido
 * es justo el que más urge, y mezclarlo en una sola cifra lo escondería.
 *
 * Todo depende de la hora actual, por eso se calcula en el navegador.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const NIVELES = ['Muy probable', 'Probable', 'Neutro', 'Poco probable', 'Muy poco probable'] as const;
export type Nivel = (typeof NIVELES)[number];

/** Cortes del puntaje 0–100, de mayor a menor. */
export const CORTES_NIVEL: Array<[number, Nivel]> = [
  [75, 'Muy probable'],
  [55, 'Probable'],
  [35, 'Neutro'],
  [15, 'Poco probable'],
  [0, 'Muy poco probable'],
];

/** "Con probabilidad de cerrar" = Muy probable o Probable. */
export const UMBRAL_PROBABLE = 55;

/** Escala secuencial de un solo tono (azul petróleo), de mayor a menor. */
export const NIVEL_COLOR: Record<Nivel, string> = {
  'Muy probable': '#073b52',
  Probable: '#0b5f7e',
  Neutro: '#18a3c5',
  'Poco probable': '#8fc9da',
  'Muy poco probable': '#c5d3db',
};

/** Puntos de etapa por índice de `STAGES`. */
const PUNTOS_ETAPA = [4, 10, 18, 26, 33, 35];

/** Puntos crudos que valen 100. La suma puede pasarse: se recorta. */
const ESCALA = 80;

export type Bloque = 'Etapa' | 'Intención' | 'Compromiso' | 'Riesgo';
export interface Factor {
  bloque: Bloque;
  rotulo: string;
  puntos: number;
}

export type Gravedad = 'roja' | 'naranja' | 'azul';
export type TipoAlarma = 'isa' | 'sincont' | 'sinprox' | 'venc' | 'prob' | 'est' | 'citapasada' | 'cita';

export interface Alarma {
  tipo: TipoAlarma;
  gravedad: Gravedad;
  texto: string;
}

export const ALARMAS: Array<{ tipo: TipoAlarma; gravedad: Gravedad; titulo: string; ayuda: string }> = [
  { tipo: 'isa', gravedad: 'roja', titulo: 'Sin asesor asignado', ayuda: 'Siguen a nombre de ISA. Hay que pasarlos a un asesor.' },
  { tipo: 'sincont', gravedad: 'roja', titulo: 'Sin contacto del asesor', ayuda: 'Más de 24 h desde que entró y ninguna gestión de una persona.' },
  { tipo: 'sinprox', gravedad: 'roja', titulo: 'Sin próxima actividad', ayuda: 'Trato abierto sin tarea agendada: se enfría solo.' },
  { tipo: 'venc', gravedad: 'roja', titulo: 'Gestión vencida', ayuda: 'La próxima actividad ya pasó y no se ha marcado como hecha.' },
  { tipo: 'prob', gravedad: 'roja', titulo: 'Probable sin seguimiento', ayuda: 'Probable o muy probable sin tarea vigente o sin contacto en 5 días.' },
  { tipo: 'est', gravedad: 'naranja', titulo: 'Estancado en etapa', ayuda: 'Más días en la etapa que el límite configurado en Pipedrive.' },
  { tipo: 'citapasada', gravedad: 'naranja', titulo: 'Cita pasada sin mover etapa', ayuda: 'La cita ya pasó y el trato sigue en Cita Agendada: ¿asistió?' },
  { tipo: 'cita', gravedad: 'azul', titulo: 'Cita hoy o mañana', ayuda: 'Confirmar asistencia y preparar la propuesta.' },
];

const PESO: Record<Gravedad, number> = { roja: 3, naranja: 2, azul: 1 };
const H = 3_600_000;
const D = 24 * H;

export interface LeadPrio {
  lead: Lead;
  s: PrioSenales;
  puntaje: number;
  nivel: Nivel;
  factores: Factor[];
  alarmas: Alarma[];
  /** 0 sin alarma · 1 azul · 2 naranja · 3 roja. */
  urgencia: number;
  diasEtapa: number;
  limiteEtapa: number | null;
  /** Días desde la última gestión de una persona; `null` si nunca. */
  diasGestion: number | null;
  /** Instante de la próxima actividad, en ms; `null` si no hay. */
  proximaMs: number | null;
}

export function nivelDe(puntaje: number): Nivel {
  return CORTES_NIVEL.find(([c]) => puntaje >= c)![1];
}

/** `YYYY-MM-DD` de un instante en hora de Bogotá. */
function diaBogota(ms: number): string {
  return new Date(ms - 5 * H).toISOString().slice(0, 10);
}

/** `HH:MM` de un instante en hora de Bogotá. */
export function horaBogota(ms: number): string {
  return new Date(ms - 5 * H).toISOString().slice(11, 16);
}

const ZONA: Record<string, [string, number]> = {
  principal: ['Zona principal', 12],
  conoce: ['Conoce y le gusta la zona', 12],
  conocer: ['Quiere conocer la zona', 9],
  inversion: ['Busca para invertir', 6],
  varias: ['Zona entre varias', 6],
  otra: ['Busca otra zona', -8],
};
const TICKET: Record<string, [string, number]> = {
  ph: ['Penthouse', 10],
  alto: ['Ticket alto (3 hab o 90 m²)', 8],
  medio: ['Ticket medio (2 hab o 78 m²)', 6],
  bajo: ['Ticket de entrada (1 hab o 68 m²)', 4],
};

/** ¿El lead entra a la prioridad? Abierto, de la constructora y con señales. */
export function tienePrio(l: Lead): l is Lead & { prio: PrioSenales } {
  return l.status === STATUS_OPEN && CONSTRUCTORA_IDX.includes(l.project) && !!l.prio;
}

export function calificar(lead: Lead & { prio: PrioSenales }, now: number): LeadPrio {
  const s = lead.prio;
  const f: Factor[] = [];
  const add = (bloque: Bloque, rotulo: string, puntos: number) => f.push({ bloque, rotulo, puntos });

  // 1 · Etapa
  add('Etapa', STAGES[lead.stage] ?? 'Interesado', PUNTOS_ETAPA[lead.stage] ?? 4);

  // 2 · Intención
  if (s.zona && ZONA[s.zona]) add('Intención', ...ZONA[s.zona]);
  if (s.ticket && TICKET[s.ticket]) add('Intención', ...TICKET[s.ticket]);
  if (s.isa) {
    add('Intención', 'Conversó con ISA', 8);
    if (s.vivir) add('Intención', 'Compra para vivir', 3);
    if (s.pago) add('Intención', 'Menciona ahorros o crédito', 5);
  }
  if (s.animo === 'positivo') add('Intención', 'Llamada ISA: ánimo positivo', 7);
  if (s.animo === 'negativo') add('Intención', 'Llamada ISA: ánimo negativo', -10);

  // 3 · Compromiso
  const ultima = s.ultimaGestion ? Date.parse(s.ultimaGestion) : NaN;
  const diasGestion = Number.isNaN(ultima) ? null : (now - ultima) / D;
  if (diasGestion !== null) {
    if (diasGestion <= 3) add('Compromiso', 'Gestión del asesor ≤ 3 días', 10);
    else if (diasGestion <= 7) add('Compromiso', 'Gestión del asesor ≤ 7 días', 6);
    else if (diasGestion <= 14) add('Compromiso', 'Gestión del asesor ≤ 14 días', 3);
  }
  const creado = Date.parse(s.creado || `${lead.date}T12:00:00-05:00`);
  const edadH = Number.isNaN(creado) ? Infinity : (now - creado) / H;
  if (edadH <= 72) add('Compromiso', 'Lead nuevo (< 72 h)', 6);
  const citasFuturas = s.citas.map((c) => Date.parse(c)).filter((t) => t >= now - 2 * H).sort((a, b) => a - b);
  if (citasFuturas.length) add('Compromiso', 'Cita o visita programada', 8);
  if (s.atendio) add('Compromiso', 'Atendió la llamada de ISA (≥ 30 s)', 5);

  // 4 · Riesgo
  if (s.numeroErrado) add('Riesgo', 'ISA: número equivocado', -25);
  if (s.noInteresado) add('Riesgo', 'ISA lo marcó no interesado', -25);
  if (!s.atendio && s.reactivacion >= 3) add('Riesgo', 'ISA en 3er intento sin respuesta', -8);
  else if (!s.atendio && s.reactivacion > 0) add('Riesgo', 'En reactivación ISA sin respuesta', -4);

  const crudo = f.reduce((a, x) => a + x.puntos, 0);
  const puntaje = Math.max(0, Math.min(100, Math.round((crudo * 100) / ESCALA)));
  const nivel = nivelDe(puntaje);

  // ── Alarmas ──
  const al: Alarma[] = [];
  const proximaMs = s.proxima ? Date.parse(s.proxima) : NaN;
  const desde = Date.parse(s.etapaDesde);
  const diasEtapa = Number.isNaN(desde) ? 0 : Math.max(0, (now - desde) / D);
  const limiteEtapa = ROTTEN_DAYS[lead.project]?.[lead.stage] ?? null;

  if (s.sinAsesor) al.push({ tipo: 'isa', gravedad: 'roja', texto: 'Sin asesor (a nombre de ISA)' });
  if (!s.sinAsesor && diasGestion === null && edadH > 24) {
    al.push({
      tipo: 'sincont',
      gravedad: 'roja',
      texto: edadH >= 48 ? `Sin contacto del asesor en ${Math.floor(edadH / 24)} d` : 'Sin contacto del asesor > 24 h',
    });
  }
  if (Number.isNaN(proximaMs)) {
    al.push({ tipo: 'sinprox', gravedad: 'roja', texto: 'Sin próxima actividad' });
  } else if (proximaMs < now) {
    const dv = (now - proximaMs) / D;
    al.push({
      tipo: 'venc',
      gravedad: dv >= 1 ? 'roja' : 'naranja',
      texto: dv >= 1 ? `Gestión vencida hace ${Math.floor(dv)} d` : 'Gestión vencida hoy',
    });
  }
  if (puntaje >= UMBRAL_PROBABLE && (Number.isNaN(proximaMs) || proximaMs < now || diasGestion === null || diasGestion > 5)) {
    al.push({ tipo: 'prob', gravedad: 'roja', texto: 'Probable sin seguimiento' });
  }
  if (limiteEtapa !== null && lead.stage >= 1 && diasEtapa > limiteEtapa) {
    al.push({
      tipo: 'est',
      gravedad: 'naranja',
      texto: `${Math.floor(diasEtapa)} d en ${STAGES[lead.stage]} (límite ${limiteEtapa})`,
    });
  }
  const ultimaCita = s.ultimaCita ? Date.parse(s.ultimaCita) : NaN;
  if (lead.stage === 2 && !citasFuturas.length && !Number.isNaN(ultimaCita) && ultimaCita < now - 2 * H) {
    al.push({ tipo: 'citapasada', gravedad: 'naranja', texto: 'Cita pasada y sigue en Cita Agendada' });
  }
  if (citasFuturas.length) {
    const hoy = diaBogota(now);
    const manana = diaBogota(now + D);
    const dia = diaBogota(citasFuturas[0]);
    if (dia === hoy || dia === manana) {
      al.push({
        tipo: 'cita',
        gravedad: 'azul',
        texto: `Cita ${dia === hoy ? 'hoy' : 'mañana'} ${horaBogota(citasFuturas[0])}`,
      });
    }
  }

  return {
    lead,
    s,
    puntaje,
    nivel,
    factores: f,
    alarmas: al,
    urgencia: al.reduce((m, a) => Math.max(m, PESO[a.gravedad]), 0),
    diasEtapa,
    limiteEtapa,
    diasGestion,
    proximaMs: Number.isNaN(proximaMs) ? null : proximaMs,
  };
}

/** Califica los leads con prioridad de una lista ya filtrada. */
export function calificarTodos(leads: Lead[], now: number): LeadPrio[] {
  const out: LeadPrio[] = [];
  for (const l of leads) if (tienePrio(l)) out.push(calificar(l, now));
  return out;
}

/** Orden de "Atiende primero": gravedad de la alarma, después puntaje. */
export function ordenAtencion(a: LeadPrio, b: LeadPrio): number {
  return b.urgencia - a.urgencia || b.puntaje - a.puntaje;
}
