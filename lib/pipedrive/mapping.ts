import 'server-only';

import {
  CONSTRUCTORA_IDX,
  DIGITAL_SOURCES,
  LOSS_GROUP_RULES,
  PIPELINE_TO_PROJECT,
  PROJECTS,
  RECOVERABLE_RULES,
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
import type { ContentType, DashboardData, Lead, LossGroup, Meta, SaleDeal, Status } from '@/lib/types';
import { normalize } from '@/lib/format';
import {
  FIELD,
  fetchAllDeals,
  fetchDealFields,
  fetchPipelines,
  fetchStages,
  resolveBase,
} from './client';
import type { PipedriveDeal } from './client';

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

  const [deals, stages, pipelines, dealFields] = await Promise.all([
    fetchAllDeals(base),
    fetchStages(base),
    fetchPipelines(base),
    fetchDealFields(base),
  ]);

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const pipelineName = new Map(pipelines.map((p) => [p.id, p.name]));

  // El campo "Fuente" es un enum: el deal guarda el id de la opción, no la etiqueta.
  const fuenteField = dealFields.find((f) => f.key === FIELD.FUENTE);
  const fuenteLabels = new Map<string, string>(
    (fuenteField?.options ?? []).map((o) => [String(o.id), o.label]),
  );

  const sources: string[] = [];
  const sourceIdx = new Map<string, number>();
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

  const meta: Meta = {
    sources,
    campaigns,
    projects: [...PROJECTS],
    advisors,
    lossReasons,
    digitalSources,
  };

  return {
    leads,
    sales,
    meta,
    fetchedAt: new Date().toISOString(),
    total: leads.length,
  };
}
