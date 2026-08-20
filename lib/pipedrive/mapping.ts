import 'server-only';

import {
  CONSTRUCTORA_IDX,
  CRM_UTC_OFFSET_HOURS,
  DIGITAL_SOURCES,
  LOSS_GROUP_RULES,
  MEETING_TYPES,
  PIPELINE_TO_PROJECT,
  PROJECTS,
  RECOVERABLE_RULES,
  SIN_ETIQUETA,
  STAGES,
  STAGE_SEPARACION,
  STAGE_TO_IDX,
} from '@/lib/config/negocio';
import {
  CONTENT_NONE,
  CONTENT_REEL,
  CONTENT_STATIC,
  STATUS_LOST,
  STATUS_OPEN,
  STATUS_WON,
} from '@/lib/types';
import type {
  ActivityDay,
  ContentType,
  DashboardData,
  Lead,
  LossGroup,
  Meeting,
  Meta,
  SaleDeal,
  Status,
} from '@/lib/types';
import { normalize } from '@/lib/format';
import {
  FIELD,
  fetchAllActivities,
  fetchAllDeals,
  fetchDealFields,
  fetchPipelines,
  fetchStages,
  fetchUsers,
  resolveBase,
} from './client';
import type { PipedriveActivity, PipedriveDeal } from './client';

function classifyLossGroup(reason: string): LossGroup | '' {
  if (!reason) return '';
  for (const { pattern, group } of LOSS_GROUP_RULES) {
    if (pattern.test(reason)) return group;
  }
  return 'Otro';
}

function isRecoverable(reason: string): boolean {
  return RECOVERABLE_RULES.some((r) => r.test(reason));
}

/** El campo "Contenido" es texto libre; lo único estable es si nombra un reel o una pieza estática. */
function classifyContent(raw: string): ContentType {
  const n = normalize(raw);
  if (!n) return CONTENT_NONE;
  if (n.includes('reel')) return CONTENT_REEL;
  if (n.includes('estatica')) return CONTENT_STATIC;
  return CONTENT_NONE;
}

function toStatus(s: PipedriveDeal['status']): Status {
  if (s === 'won') return STATUS_WON;
  if (s === 'lost') return STATUS_LOST;
  return STATUS_OPEN;
}

const DAY_MS = 86_400_000;

/** Días desde que entró el lead hasta que se cerró — o hasta hoy si sigue abierto. */
function ageInDays(addTime: string, closeTime: string | null, now: number): number {
  const start = Date.parse(addTime);
  if (Number.isNaN(start)) return 0;
  const end = closeTime ? Date.parse(closeTime) : now;
  const days = Math.floor(((Number.isNaN(end) ? now : end) - start) / DAY_MS);
  return days < 0 ? 0 : days;
}

/** Devuelve el índice de `value` en `list`, agregándolo si no existe. */
function intern(list: string[], index: Map<string, number>, value: string): number {
  const existing = index.get(value);
  if (existing !== undefined) return existing;
  const i = list.length;
  list.push(value);
  index.set(value, i);
  return i;
}

/** `YYYY-MM-DD HH:MM:SS` | `YYYY-MM-DD` | null → `YYYY-MM-DD` | `''`. */
function dateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/**
 * `YYYY-MM-DD HH:MM:SS` → epoch ms.
 *
 * Pipedrive no manda zona horaria. Como ambos lados de cada resta usan esta
 * misma función, la diferencia sale correcta aunque el instante absoluto quede
 * desplazado por el offset del servidor.
 */
function parseTs(value: string | null | undefined): number {
  return value ? Date.parse(value.replace(' ', 'T')) : NaN;
}

/**
 * `deal_id` → instante de su actividad más antigua.
 *
 * Se ordena por `add_time` ("Hora de añadición"), no por
 * `marked_as_done_time`: lo que se quiere medir es cuándo el asesor dejó
 * constancia de la gestión, no cuándo cerró la tarea. La diferencia no es
 * cosmética — sobre el histórico completo mueve la mediana global de ~45 h
 * a ~24 h, porque muchas llamadas se registran al momento y se marcan como
 * completadas mucho después.
 */
function firstActivityByDeal(activities: PipedriveActivity[]): Map<number, number> {
  const first = new Map<number, number>();

  for (const a of activities) {
    if (!a.deal_id) continue;
    const t = parseTs(a.add_time);
    if (Number.isNaN(t)) continue;

    const prev = first.get(a.deal_id);
    if (prev === undefined || t < prev) first.set(a.deal_id, t);
  }
  return first;
}

/** Horas entre la creación del trato y su primera actividad; `null` si no hay. */
function firstContactHours(deal: PipedriveDeal, firstActivityTs: number | undefined): number | null {
  if (firstActivityTs === undefined) return null;

  const created = parseTs(deal.add_time);
  if (Number.isNaN(created)) return null;

  const hours = (firstActivityTs - created) / 3_600_000;

  // Una actividad anterior a la creación del trato no es un tiempo de
  // respuesta: pasa en migraciones y cargas masivas, donde la actividad viene
  // con su fecha original y el deal con la de importación. Contarla como 0
  // premiaría al asesor con una mediana que no ganó.
  return hours < 0 ? null : Number(hours.toFixed(2));
}

const MEETING_TYPE_SET = new Set(MEETING_TYPES);

/**
 * `due_date` + `due_time` (UTC) → día y hora locales.
 *
 * La conversión puede correr la fecha —y con ella el día de la semana— cuando
 * la reunión cae de madrugada en UTC: las 02:00 UTC del martes son las 21:00
 * del lunes en Bogotá, y contarla como martes movería el bloque de agenda de
 * día. Sin hora no hay nada que convertir: la fecha se toma tal cual.
 */
function toLocal(dueDate: string, dueTime: string | null | undefined): { date: string; hour: number | null } {
  if (!dueTime) return { date: dueDate, hour: null };

  const [y, mo, d] = dueDate.split('-').map(Number);
  const [hh, mm] = dueTime.split(':').map(Number);
  const ts = Date.UTC(y, mo - 1, d, hh, mm) + CRM_UTC_OFFSET_HOURS * 3_600_000;
  if (Number.isNaN(ts)) return { date: dueDate, hour: null };

  const local = new Date(ts);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

/** 0 = lunes … 6 = domingo, a partir de `YYYY-MM-DD`. */
function weekdayOf(iso: string): number {
  const [y, mo, d] = iso.split('-').map(Number);
  // Mediodía UTC: inmune a que el runtime del servidor esté en otra zona.
  return (new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay() + 6) % 7;
}

/**
 * Reuniones agendadas sobre tratos que el dashboard sí mapea.
 *
 * `dealIds` deja fuera las de pipelines no mapeados y las de tratos borrados:
 * sin trato en el modelo no se les puede aplicar ningún filtro, y aparecerían
 * en el mapa de calor sin importar lo que el usuario tenga seleccionado.
 */
function buildMeetings(activities: PipedriveActivity[], dealIds: Set<number>): Meeting[] {
  const out: Meeting[] = [];

  for (const a of activities) {
    if (!a.deal_id || !a.due_date) continue;
    if (!MEETING_TYPE_SET.has(a.type ?? '')) continue;
    if (!dealIds.has(a.deal_id)) continue;

    const { date, hour } = toLocal(a.due_date, a.due_time);
    out.push({
      dealId: a.deal_id,
      date,
      month: date.slice(0, 7),
      weekday: weekdayOf(date),
      hour,
    });
  }
  return out;
}

/**
 * Ids de etiqueta de un trato, unificando las dos formas en que Pipedrive los
 * manda (`label_ids` y `label`).
 *
 * Se unen en vez de elegir una: las cuentas que migraron a etiquetas múltiples
 * siguen respondiendo el campo viejo, y no hay garantía de que ambos coincidan.
 */
function labelIdsOf(deal: PipedriveDeal): string[] {
  const out: string[] = [];

  const push = (raw: unknown) => {
    const id = String(raw ?? '').trim();
    if (id && !out.includes(id)) out.push(id);
  };

  if (Array.isArray(deal.label_ids)) deal.label_ids.forEach(push);
  if (deal.label != null && deal.label !== '') String(deal.label).split(',').forEach(push);

  return out;
}

/**
 * Actividades agrupadas por trato, asesor y día.
 *
 * Cuenta **toda** actividad —llamada, WhatsApp, correo, reunión, tarea—, hecha
 * o pendiente: crear la actividad ya es gestión del asesor, y exigir que esté
 * marcada como completada castigaría a quien agenda bien pero no vuelve a
 * marcar la casilla, que es la mitad del CRM.
 *
 * El asesor sale de `user_id` —a quién está asignada—, no del dueño del trato.
 * Atribuir por dueño le cargaba a cada asesor todo lo que otros o las
 * automatizaciones hacían sobre sus leads, y el total no cuadraba con el CRM.
 *
 * La fecha es `due_date`, el día para el que quedó agendada, que es por el que
 * filtra Pipedrive. Cuando falta —dato viejo o mal migrado— se cae a la fecha
 * de creación para no perder la actividad, y ahí sí se corta la hora a Bogotá:
 * `add_time` viene en UTC y sin corregir todo lo registrado después de las
 * 7:00 p. m. se contaba al día siguiente.
 *
 * `dealIds` deja fuera las actividades sueltas y las de pipelines no mapeados:
 * sin trato no hay filtro global que aplicarles.
 */
function buildActivityDays(
  activities: PipedriveActivity[],
  dealIds: Set<number>,
  advisorDeUsuario: (userId: number | null) => number,
): ActivityDay[] {
  const porClave = new Map<string, ActivityDay>();

  for (const a of activities) {
    if (!a.deal_id || !dealIds.has(a.deal_id)) continue;

    const date = a.due_date ?? (a.add_time ? aBogota(a.add_time) : null);
    if (!date) continue;

    const advisor = advisorDeUsuario(a.user_id);
    const key = `${a.deal_id}|${advisor}|${date}`;
    const prev = porClave.get(key);

    if (prev) prev.count += 1;
    else porClave.set(key, { dealId: a.deal_id, advisor, date, count: 1 });
  }

  return [...porClave.values()];
}

/** `YYYY-MM-DD HH:MM:SS` en UTC → el `YYYY-MM-DD` que era en Bogotá (UTC−5). */
function aBogota(utc: string): string {
  const t = Date.parse(`${utc.replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return utc.slice(0, 10);
  return new Date(t - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function phoneOf(deal: PipedriveDeal): string {
  const p = deal.person_id;
  if (p && typeof p === 'object' && Array.isArray(p.phone)) return p.phone[0]?.value ?? '';
  return '';
}

/**
 * Trae todo Pipedrive y lo aplana al modelo del dashboard.
 *
 * Las listas de fuentes, campañas, asesores y motivos de pérdida se descubren
 * en tiempo de ejecución: el CRM tiene 23 fuentes y 46 motivos hoy, y crecen
 * sin avisar. Sólo proyectos y etapas están fijados en `negocio.ts`, porque
 * ahí el orden es una decisión de negocio (el embudo) y no un dato.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  const base = await resolveBase();

  const [deals, activities, stages, pipelines, dealFields, users] = await Promise.all([
    fetchAllDeals(base),
    fetchAllActivities(base),
    fetchStages(base),
    fetchPipelines(base),
    fetchDealFields(base),
    fetchUsers(base),
  ]);

  const firstActivity = firstActivityByDeal(activities);

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const pipelineName = new Map(pipelines.map((p) => [p.id, p.name]));

  // El campo "Fuente" es un enum: el deal guarda el id de la opción, no la etiqueta.
  const fuenteField = dealFields.find((f) => f.key === FIELD.FUENTE);
  const fuenteLabels = new Map<string, string>(
    (fuenteField?.options ?? []).map((o) => [String(o.id), o.label]),
  );

  // "Trato - Etiqueta" es un enum nativo: el deal guarda ids de opción, y las
  // etiquetas (nombre y color) viven en la definición del campo.
  const etiquetaField = dealFields.find((f) => f.key === FIELD.ETIQUETA);
  const etiquetaNames = new Map<string, string>(
    (etiquetaField?.options ?? []).map((o) => [String(o.id), o.label]),
  );

  const sources: string[] = [];
  const sourceIdx = new Map<string, number>();
  const labels: string[] = [];
  const labelIdx = new Map<string, number>();
  const campaigns: string[] = [];
  const campaignIdx = new Map<string, number>();
  const advisors: string[] = [];
  const advisorIdx = new Map<string, number>();
  const lossReasons: string[] = [];
  const lossReasonIdx = new Map<string, number>();

  const now = Date.now();
  const leads: Lead[] = [];
  const sales: SaleDeal[] = [];

  for (const deal of deals) {
    if (!deal.add_time) continue;

    const project = PIPELINE_TO_PROJECT[pipelineName.get(deal.pipeline_id) ?? ''];
    // Un pipeline nuevo que nadie mapeó no es un proyecto del dashboard.
    if (project === undefined) continue;

    const date = deal.add_time.slice(0, 10);
    const stage = STAGE_TO_IDX[stageName.get(deal.stage_id) ?? ''] ?? 0;
    const status = toStatus(deal.status);

    const rawFuente = deal[FIELD.FUENTE];
    const sourceLabel =
      (rawFuente != null && fuenteLabels.get(String(rawFuente))) || 'Por definir';
    const source = intern(sources, sourceIdx, sourceLabel);

    const rawCampana = deal[FIELD.CAMPANA];
    const campaignLabel = typeof rawCampana === 'string' && rawCampana.trim() ? rawCampana.trim() : 'Sin campaña';
    const campaign = intern(campaigns, campaignIdx, campaignLabel);

    const advisorLabel = deal.owner_name?.trim() || 'Sin asignar';
    const advisor = intern(advisors, advisorIdx, advisorLabel);

    // Un trato sin etiqueta apunta a "Sin etiqueta" en vez de quedar con la
    // lista vacía: así el filtro puede aislarlos, que es justo la pregunta
    // interesante ("¿qué leads nadie clasificó?").
    const etiquetaIds = labelIdsOf(deal);
    const leadLabels = etiquetaIds.length
      ? [
          ...new Set(
            etiquetaIds.map((id) =>
              intern(labels, labelIdx, etiquetaNames.get(id) ?? `Etiqueta ${id}`),
            ),
          ),
        ]
      : [intern(labels, labelIdx, SIN_ETIQUETA)];

    const rawContenido = deal[FIELD.CONTENIDO];
    const content = classifyContent(typeof rawContenido === 'string' ? rawContenido : '');

    const reason = deal.lost_reason?.trim() ?? '';
    const isLost = status === STATUS_LOST;
    const lossReason = isLost && reason ? intern(lossReasons, lossReasonIdx, reason) : -1;

    const name = deal.person_name?.trim() || deal.title?.trim() || 'Sin nombre';
    const phone = phoneOf(deal);

    leads.push({
      id: deal.id,
      date,
      month: date.slice(0, 7),
      stage,
      status,
      lossGroup: isLost ? classifyLossGroup(reason) : '',
      lossReason,
      source,
      campaign,
      labels: leadLabels,
      content,
      project,
      recoverable: isLost && isRecoverable(reason),
      advisor,
      ageDays: ageInDays(deal.add_time, deal.close_time, now),
      // Un deal recién creado nunca se ha "actualizado": su antigüedad de
      // gestión se cuenta desde que entró, no desde el epoch.
      updateTime: dateOnly(deal.update_time) || date,
      nextActivity: dateOnly(deal.next_activity_date),
      lastActivity: dateOnly(deal.last_activity_date),
      name,
      phone,
      firstContactHours: firstContactHours(deal, firstActivity.get(deal.id)),
    });

    // Una separación abierta ya es una venta comprometida, aunque el CRM
    // todavía no la haya marcado como ganada.
    if (stage >= STAGE_SEPARACION || status === STATUS_WON) {
      sales.push({
        id: deal.id,
        name,
        date,
        source: sourceLabel,
        isDigital: DIGITAL_SOURCES.includes(normalize(sourceLabel)),
        category: CONSTRUCTORA_IDX.includes(project) ? 'Constructora' : 'Inmobiliaria',
        campaign: campaignLabel,
        project: PROJECTS[project],
        advisor: advisorLabel,
        stage: STAGES[stage] ?? STAGES[0],
        status: status === STATUS_WON ? 'Ganado' : status === STATUS_LOST ? 'Perdido' : 'Abierto',
        phone,
      });
    }
  }

  const digitalSources = sources
    .map((s, i) => (DIGITAL_SOURCES.includes(normalize(s)) ? i : -1))
    .filter((i) => i >= 0);

  const dealIds = new Set(leads.map((l) => l.id));

  // El usuario de una actividad entra a la MISMA lista de asesores que los
  // dueños de trato, emparejando por nombre: así "Damariz Montero" es el mismo
  // índice venga de un deal o de una actividad. Quien registra gestión sin ser
  // dueño de ningún trato se agrega al final de la lista, y por eso esto va
  // después del recorrido de deals.
  const userName = new Map<number, string>(
    users.map((u) => [u.id, u.name?.trim() || `Usuario ${u.id}`]),
  );
  const advisorDeUsuario = (userId: number | null) =>
    intern(advisors, advisorIdx, (userId !== null && userName.get(userId)) || 'Sin asignar');

  const activityDays = buildActivityDays(activities, dealIds, advisorDeUsuario);

  const meta: Meta = {
    sources,
    campaigns,
    labels,
    projects: [...PROJECTS],
    advisors,
    lossReasons,
    digitalSources,
  };

  return {
    leads,
    sales,
    meetings: buildMeetings(activities, dealIds),
    activityDays,
    meta,
    fetchedAt: new Date().toISOString(),
    total: leads.length,
  };
}
