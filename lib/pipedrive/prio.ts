import 'server-only';

import { MEETING_TYPES, USUARIOS_AUTOMATIZACION } from '@/lib/config/negocio';
import type { PrioSenales, PrioTicket, PrioZona } from '@/lib/types';
import { FIELD } from './client';
import type { PipedriveActivity, PipedriveDeal, PipedriveNote } from './client';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEÑALES DE PRIORIDAD — COMERCIAL COIS
 *
 * Extrae de Pipedrive lo que hace falta para calificar un lead abierto de la
 * constructora, **sin depender de que el asesor diligencie nada**: la etapa,
 * las actividades (quién, cuándo, de qué tipo) y las notas que escriben las
 * automatizaciones —el formulario de pauta (Quiiven) y las conversaciones y
 * llamadas de ISA—. Las notas libres del asesor no se leen.
 *
 * Aquí sólo se extraen hechos. El puntaje y las alarmas, que dependen de la
 * hora actual, se calculan en el navegador (`lib/prioridad.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AUTOMATAS = new Set(USUARIOS_AUTOMATIZACION);
const MEETINGS = new Set(MEETING_TYPES);

/** `YYYY-MM-DD HH:MM:SS` (UTC, como lo manda Pipedrive) → ISO `…Z`; `''` si falta. */
function iso(utc: string | null | undefined): string {
  if (!utc) return '';
  const t = Date.parse(`${utc.trim().replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

/**
 * Fecha + hora UTC de una actividad → instante ISO. Sin hora, se toma el final
 * del día en Bogotá: una tarea "para hoy" no está vencida hasta que el día
 * termina.
 */
function instante(date: string | null | undefined, time: string | null | undefined): string {
  if (!date) return '';
  const hhmm = (time ?? '').slice(0, 5);
  const t = hhmm ? Date.parse(`${date}T${hhmm}:00Z`) : Date.parse(`${date}T23:59:00-05:00`);
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

function texto(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function sinDatosPersonales(s: string): string {
  return s.replace(/\+?\d[\d\s]{8,}\d/g, '[tel]').replace(/\S+@\S+/g, '[correo]');
}

function ownerId(deal: PipedriveDeal): number | null {
  const u = deal.user_id;
  if (u && typeof u === 'object') return u.id;
  return typeof u === 'number' ? u : null;
}

/** Zona y tipología a partir de las respuestas del formulario (nota o campo "Respuesta"). */
function leerFormulario(raw: string): { zona: PrioZona; ticket: PrioTicket } {
  const t = raw.toLowerCase().replace(/_/g, ' ');
  let zona: PrioZona = '';
  if (t.includes('zona de interés principal')) zona = 'principal';
  else if (t.includes('conozco la zona y me gusta')) zona = 'conoce';
  else if (t.includes('quiero conocerla') || t.includes('no la conozco')) zona = 'conocer';
  else if (t.includes('como inversión')) zona = 'inversion';
  else if (t.includes('opción entre varias')) zona = 'varias';
  else if (t.includes('otra zona')) zona = 'otra';

  let ticket: PrioTicket = '';
  if (t.includes('penthouse')) ticket = 'ph';
  else if (/3 habitaciones|90 m/.test(t)) ticket = 'alto';
  else if (/2 habitaciones|78 m/.test(t)) ticket = 'medio';
  else if (/1 habitación|68 m/.test(t)) ticket = 'bajo';
  return { zona, ticket };
}

const RE_CITA = /cita|visita/i;
const RE_REACTIVACION = /^Reactivación V(\d)/i;

/**
 * Señales de cada trato abierto de la constructora, por `deal_id`.
 *
 * `deals` ya viene recortado a los tratos que las necesitan; las actividades y
 * notas de cualquier otro trato se ignoran.
 */
export function buildPrioSenales(
  deals: PipedriveDeal[],
  activities: PipedriveActivity[],
  notes: PipedriveNote[],
): Map<number, PrioSenales> {
  const out = new Map<number, PrioSenales>();

  for (const deal of deals) {
    const owner = ownerId(deal);
    const respuesta = deal[FIELD.RESPUESTA];
    const form = leerFormulario(typeof respuesta === 'string' ? respuesta : '');
    out.set(deal.id, {
      creado: iso(deal.add_time),
      etapaDesde: iso(deal.stage_change_time) || iso(deal.add_time),
      proxima: instante(deal.next_activity_date, deal.next_activity_time),
      proximaAsunto: deal.next_activity_subject?.trim() ?? '',
      ultimaGestion: '',
      gestiones: 0,
      citas: [],
      ultimaCita: '',
      reactivacion: 0,
      zona: form.zona,
      ticket: form.ticket,
      isa: false,
      resumen: '',
      vivir: false,
      pago: false,
      animo: '',
      atendio: false,
      noInteresado: false,
      numeroErrado: false,
      sinAsesor: owner !== null && AUTOMATAS.has(owner),
    });
  }

  for (const a of activities) {
    const s = a.deal_id ? out.get(a.deal_id) : undefined;
    if (!s) continue;

    const creador = a.created_by_user_id ?? a.user_id;
    const asunto = a.subject ?? '';

    const v = RE_REACTIVACION.exec(asunto);
    if (v) s.reactivacion = Math.max(s.reactivacion, Number(v[1]) || 0);

    if (MEETINGS.has(a.type ?? '') || RE_CITA.test(asunto)) {
      const cuando = instante(a.due_date, a.due_time);
      if (cuando) {
        if (!a.done) s.citas.push(cuando);
        if (cuando > s.ultimaCita) s.ultimaCita = cuando;
      }
    }

    if (creador != null && AUTOMATAS.has(creador)) continue;
    s.gestiones += 1;
    if (a.done) {
      const cuando = iso(a.marked_as_done_time) || iso(a.add_time);
      if (cuando > s.ultimaGestion) s.ultimaGestion = cuando;
    }
  }

  // Las notas en orden de creación: lo último que dijo ISA es lo que vale.
  const ordenadas = [...notes].sort((a, b) => (a.add_time ?? '').localeCompare(b.add_time ?? ''));
  for (const n of ordenadas) {
    const s = n.deal_id ? out.get(n.deal_id) : undefined;
    if (!s) continue;
    const t = texto(n.content);
    if (!t) continue;

    if (/respuestas del formulario/i.test(t)) {
      const f = leerFormulario(t);
      if (f.zona) s.zona = f.zona;
      if (f.ticket) s.ticket = f.ticket;
      continue;
    }

    if (t.startsWith('Resumen ISA')) {
      const r = t.replace(/^Resumen ISA:\s*/, '');
      s.isa = true;
      s.resumen = sinDatosPersonales(r).slice(0, 280);
      const rl = r.toLowerCase();
      s.vivir = /busca (vivir|vivienda)|para vivir/.test(rl);
      s.pago = /ahorros|cesant|le prestan|cr[eé]dito aprobado/.test(rl);
      continue;
    }

    if (/^Motivo no interesado \(ISA\)/i.test(t)) {
      s.noInteresado = true;
      continue;
    }

    if (/Llamada de reactivación de ISA/i.test(t)) {
      const animo = /Ánimo del lead:\s*(positivo|neutral|negativo)/i.exec(t);
      if (animo) s.animo = animo[1].toLowerCase() as PrioSenales['animo'];
      const dur = /Duración:\s*(\d+)/.exec(t);
      if (/Resultado:\s*Contestó(?! y colgó)/.test(t) && dur && Number(dur[1]) >= 30) s.atendio = true;
      if (/no era (ella|él|el)\b|no es (ella|él|el)\b|n[uú]mero (equivocado|err[oó]neo|incorrecto)|persona equivocada/i.test(t)) {
        s.numeroErrado = true;
      }
    }
  }

  for (const s of out.values()) s.citas.sort();
  return out;
}
