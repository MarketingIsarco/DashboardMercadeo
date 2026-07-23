'use client';

import { useMemo, useState } from 'react';
import { ChartBox } from '@/components/charts/ChartBox';
import { MixedChart } from '@/components/charts/MixedChart';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { MonthSelect } from '@/components/ui/MonthSelect';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import {
  INVERSION,
  STAGE_CITA,
  STAGE_NEGOCIACION,
  STAGE_SEPARACION,
  STAGE_VISITA,
  PAID_SOURCES,
} from '@/lib/config/negocio';
import { monthLabel, sourceIndices } from '@/lib/format';
import type { TabProps } from '@/lib/selectors';
import { STATUS_LOST, STATUS_OPEN } from '@/lib/types';
import type { Lead, Meta } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo de color (consistente en toda la pestaña):
//   verde = bien · ámbar = atención · rojo = crítico.
const OK = '#4ade80';
const WARN = '#f59e0b';
const BAD = '#f43f5e';

// ─────────────────────────────────────────────────────────────────────────────
// UMBRALES DE RECOMENDACIÓN
// Portados 1:1 de los condicionales `if(...)` del HTML original. Se extraen aquí
// para poder ajustarlos sin cazarlos entre el JSX. `_PP` = puntos porcentuales;
// `_FACTOR` = multiplicador sobre el promedio previo; `_LEADS` = volumen mínimo.
const TH = {
  /** Caída de contactación que dispara auditoría de primer contacto. */
  CONTACT_DROP_PP: 2,
  /** Caída de conversión lead→cita que dispara revisión de guion. */
  LCITA_DROP_PP: 2,
  /** Caída de conversión cita→visita que dispara protocolo de confirmación. */
  CITAVIS_DROP_PP: 3,
  /** CPL por encima de `prev * 1.1` = deterioro de eficiencia de pauta. */
  CPL_RISE_FACTOR: 1.1,
  /** CPL por debajo de `prev * 0.9` = mejora que habilita escalar presupuesto. */
  CPL_DROP_FACTOR: 0.9,
  /** Subida de una razón de pérdida (pp) que la vuelve accionable. */
  LOSS_RISE_PP: 3,
  /** Volumen mínimo de Instagram para juzgar su conversión. */
  IG_MIN_LEADS: 30,
  /** Caída de conversión a cita de Instagram (pp) que pide rotar creativos. */
  IG_CONV_DROP_PP: 3,
  /** Crecimiento de WhatsApp sobre `prev * 1.2` que pide estructurar el flujo. */
  WA_GROWTH_FACTOR: 1.2,
  /** Volumen mínimo de WhatsApp para actuar. */
  WA_MIN_LEADS: 30,
  /** Pipeline abierto por encima de esto = alerta de gestión. */
  PIPELINE_ALERT: 30,
  /** Cambio de inversión (|Δ|) que mete a Meta en fase de aprendizaje. */
  LEARNING_INV_DELTA: 0.25,
  /** % de perdidos sin motivo que dispara la recomendación de calidad de datos. */
  DATA_QUALITY_LOSS_PCT: 10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Métricas del plan para un proyecto y un mes concreto.
interface PlanMetrics {
  total: number;
  pContact: number;
  pLCita: number;
  pCitaVis: number;
  pLVis: number;
  pDigVis: number;
  /** `null` cuando falta inversión del mes (no se inventa cifra). */
  cpl: number | null;
  inv: number;
  /** Motivo principal de pérdida, excluyendo los vacíos. `'-'` si no hay. */
  mainLR: string;
  pLRProd: number;
  pLRSeg: number;
  pLRInt: number;
  pLRCont: number;
  /** Desempeño por fuente de pauta, indexado por índice real en `meta.sources`. */
  srcD: Record<number, { leads: number; citas: number }>;
  openCount: number;
  neg: number;
  sep: number;
  citas: number;
  visitas: number;
  digLeads: number;
  /** Perdidos con `lossGroup === ''` (el asesor no registró el motivo). */
  emptyLoss: number;
  lostTotal: number;
}

interface PlanCtx {
  month: string;
  /** `INVERSION.inari` o `INVERSION.tng` — mapa mes→COP. */
  invByMonth: Record<string, number>;
  /** Índices reales de las fuentes con pauta pagada (Instagram/Facebook/WhatsApp). */
  paidIdx: number[];
}

/**
 * Puerto puro de `_planMetrics`. Devuelve `null` si no hay leads (no divide por
 * cero ni produce `NaN%`). `PAID_SRC` ya no son índices fijos: llegan resueltos
 * por nombre en `ctx.paidIdx`.
 */
function planMetrics(leads: Lead[], ctx: PlanCtx): PlanMetrics | null {
  const total = leads.length;
  if (!total) return null;

  const paidSet = new Set(ctx.paidIdx);
  const lost = leads.filter((l) => l.status === STATUS_LOST);
  const lostN = lost.length;
  const lostCont = lost.filter((l) => l.lossGroup === 'Contactabilidad').length;
  const citas = leads.filter((l) => l.stage >= STAGE_CITA).length;
  const visitas = leads.filter((l) => l.stage >= STAGE_VISITA).length;
  const digLeads = leads.filter((l) => paidSet.has(l.source)).length;
  const digVis = leads.filter((l) => paidSet.has(l.source) && l.stage >= STAGE_VISITA).length;
  const inv = ctx.invByMonth[ctx.month] ?? 0;

  const lrG: Record<string, number> = {};
  lost.forEach((l) => {
    lrG[l.lossGroup] = (lrG[l.lossGroup] ?? 0) + 1;
  });
  const emptyLoss = lrG[''] ?? 0;

  // Motivo principal: se excluyen los vacíos (741 perdidos sin motivo harían
  // ganar a "sin motivo" y la recomendación sería inútil).
  const mainLR =
    Object.entries(lrG)
      .filter(([k]) => k !== '')
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';

  // Desempeño por fuente de pauta, con los índices REALES de `meta.sources`.
  const srcD: Record<number, { leads: number; citas: number }> = {};
  ctx.paidIdx.forEach((s) => {
    srcD[s] = {
      leads: leads.filter((l) => l.source === s).length,
      citas: leads.filter((l) => l.source === s && l.stage >= STAGE_CITA).length,
    };
  });

  const open = leads.filter((l) => l.status === STATUS_OPEN);

  return {
    total,
    pContact: ((total - lostCont) / total) * 100,
    pLCita: (citas / total) * 100,
    pCitaVis: citas ? (visitas / citas) * 100 : 0,
    pLVis: (visitas / total) * 100,
    pDigVis: digLeads ? (digVis / digLeads) * 100 : 0,
    cpl: digLeads && inv ? Math.round(inv / digLeads) : null,
    inv,
    mainLR,
    pLRProd: lostN ? ((lrG['Producto'] ?? 0) / lostN) * 100 : 0,
    pLRSeg: lostN ? ((lrG['Mal segmento'] ?? 0) / lostN) * 100 : 0,
    pLRInt: lostN ? ((lrG['Interes'] ?? 0) / lostN) * 100 : 0,
    pLRCont: lostN ? ((lrG['Contactabilidad'] ?? 0) / lostN) * 100 : 0,
    srcD,
    openCount: open.length,
    neg: open.filter((l) => l.stage === STAGE_NEGOCIACION).length,
    sep: open.filter((l) => l.stage === STAGE_SEPARACION).length,
    citas,
    visitas,
    digLeads,
    emptyLoss,
    lostTotal: lostN,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de acciones.
type Horizon = 'c' | 'm' | 'l';
type Team = 'com' | 'mer';
interface Action {
  desc: string;
  obj?: string;
  ind: string | null;
}
interface TeamInsights {
  c: Action[];
  m: Action[];
  l: Action[];
}
interface ProjectInsights {
  ctx: string[];
  com: TeamInsights;
  mer: TeamInsights;
}

// Proyectos del plan. `projectIdx` = índice en `PROJECTS`; `invBucket` = bolsa
// de inversión (Inari → proyecto 0; Tinguazul 2A → proyecto 1, comparte bolsa
// `tng` con Tinguazul 1).
const PLAN_PROJECTS: Array<{ label: string; projectIdx: number; invBucket: 'inari' | 'tng' }> = [
  { label: 'Inari 101', projectIdx: 0, invBucket: 'inari' },
  { label: 'Tinguazul 2A', projectIdx: 1, invBucket: 'tng' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Insights estratégicos hardcodeados para Junio 2026 (comentario de analista,
// no derivado de Pipedrive). Se muestran sólo cuando el mes reciente es 2026-06,
// que era el caso en el HTML original (junio siempre era el último mes).
const INSIGHTS_JUN: Record<number, ProjectInsights> = {
  0: {
    ctx: [
      'Feriados + elecciones presidenciales: incertidumbre sin precedentes limitó el gasto en inversiones inmobiliarias.',
      'Reactivación ISA WhatsApp con IA: reabrió leads 2025 y los cerró como "No interesado" inflando razones de pérdida. No todos los leads ISA WA son producto de la reactivación.',
      'Campañas activas: INA101 Mayo (continuidad), INA101 Jun (95m² → WhatsApp) e INA101 Jun V2 (nuevo contenido, CPL menor). Solo Jun V2 activa al cierre.',
      'Rotación de 2 asesores de sala a finales de Junio: nuevos periodos de inducción y menor gestión en los últimos días del mes.',
    ],
    com: {
      c: [
        {
          desc: 'Diseñar y ejecutar plan de inducción para los 2 nuevos asesores de sala: argumentario Inari 101, manejo de objeciones (precio/m², tiempo de entrega, distribución) y protocolo de cierre de cita en primera llamada.',
          obj: 'Reducir la brecha de capacidad comercial y proteger el pipeline de la sala antes del cierre de Julio.',
          ind: 'Rotación de 2 asesores a finales de Junio. Sin protocolo documentado el pipeline queda expuesto en las próximas 2-3 semanas de rampa.',
        },
        {
          desc: 'Documentar el proceso de gestión de Sonia como protocolo replicable: velocidad de primer contacto, guión de llamada, manejo de objeciones de Inari y técnica de cierre de cita.',
          obj: 'Estandarizar la conversión lead→cita a nivel de equipo y acercarla al benchmark de Sonia.',
          ind: 'Sonia convierte >70% de sus leads a cita; asesores de sala <10%. El gap es de proceso, no de canal ni de producto.',
        },
        {
          desc: 'Etiquetar en CRM los leads de reactivación ISA WhatsApp (campaña IA 2025) vs los leads nuevos de pauta activa para separar sus métricas de funnel.',
          obj: 'Medir la conversión real de la pauta activa de Junio sin contaminación de las reactivaciones 2025.',
          ind: 'ISA WhatsApp mezcla leads reactivados (bajo perfil, ya cerrados como No Interesados) con leads directos al agente. Sin esta separación el funnel de Junio no es interpretable.',
        },
      ],
      m: [
        {
          desc: 'Ejecutar sesión de entrenamiento con el nuevo equipo de sala usando casos reales de Inari 101: rol de ventas con objeciones de 95m², plan de pagos y comparativo vs competencia. Usar grabaciones de llamadas exitosas como base.',
          obj: 'Elevar la conversión lead→cita de sala al nivel histórico antes del cierre del Q3.',
          ind: 'La conversión lead→cita en sala es estructuralmente baja. El equipo nuevo es la oportunidad para instalar el protocolo correcto desde el inicio.',
        },
        {
          desc: 'Analizar las razones de pérdida por asesor para Inari 101 y determinar si las pérdidas por Producto e Interés se concentran en sala o en canal digital.',
          obj: 'Priorizar la intervención correcta: si las pérdidas son de sala → entrenamiento; si son de pauta → ajuste de segmentación.',
          ind: 'Pérdidas por Producto e Interés suben en Junio. Sin segmentación por asesor no es posible distinguir si el problema es de gestión comercial o de calidad de lead.',
        },
      ],
      l: [
        {
          desc: 'Con el equipo de sala estabilizado, diseñar un protocolo de coordinación entre canal digital y sala para los leads calificados que no convierten a cita en el primer contacto.',
          obj: 'Recuperar y superar la tasa cita→visita histórica para Inari 101.',
          ind: 'La tasa cita→visita disminuyó en Junio. Con equipo rodado y proceso documentado el objetivo es superar el promedio previo en Q3.',
        },
      ],
    },
    mer: {
      c: [
        {
          desc: 'Extraer y comparar del CRM los leads de INA101 Jun (95m² → WhatsApp): CPL, tasa de contactación y razones de pérdida vs los de INA101 Jun V2.',
          obj: 'Determinar si el segmento de 95m² tiene viabilidad para Julio o debe descontinuarse.',
          ind: 'Hipótesis: la campaña de 95m² atrajo un perfil con expectativa de precio diferente al de Inari, elevando las pérdidas por Producto.',
        },
        {
          desc: 'Revisar los datos diarios de INA101 Jun V2 (CPL, CTR, leads generados): si el CPL sigue bajando y la contactación es estable, escalar el presupuesto en un 15-20% en la primera semana de Julio.',
          obj: 'Capitalizar el mejor rendimiento de Jun V2 y maximizar el volumen de leads calificados en Julio.',
          ind: 'Jun V2 fue la única campaña activa al cierre de Junio y ya muestra mejor CPL. Necesita validación con más días de datos antes de un aumento estructural de inversión.',
        },
      ],
      m: [
        {
          desc: 'Rotar creatividades de Instagram para Inari 101: nuevos formatos Reels, video recorrido en 8K, testimoniales de compradores o recorrido de zonas comunes (Sky Deck, Work Hub, Chef Table).',
          obj: 'Recuperar el volumen y la conversión de Instagram que cayeron en Junio.',
          ind: 'Instagram bajó en volumen y en conversión a cita — señal de fatiga de audiencia o creatividades agotadas, no necesariamente de problema de producto.',
        },
        {
          desc: 'Segmentar las pérdidas por Interés entre leads de reactivación ISA WhatsApp y leads de pauta activa, y cuantificar cuántos "No interesados" de Junio corresponden a cada origen.',
          obj: 'Entender si el aumento de pérdidas por Interés es un problema estructural de segmentación o el efecto temporal de la campaña de reactivación.',
          ind: 'Sin esta segmentación no es posible saber si la pauta está atrayendo el perfil correcto o si la causa es únicamente la reactivación de leads 2025.',
        },
      ],
      l: [
        {
          desc: 'Diseñar un protocolo de reactivación que etiquete los contactos reactivados en CRM antes de lanzar el agente IA, separándolos del pipeline activo.',
          obj: 'Mantener la integridad de las métricas de pauta activa en futuros ciclos de reactivación.',
          ind: 'La reactivación tiene valor comercial independiente pero al mezclarse con el pipeline activo distorsiona el CPL y el análisis de efectividad de campaña.',
        },
      ],
    },
  },
  1: {
    ctx: [
      'Feriados + elecciones presidenciales: incertidumbre sin precedentes limitó el gasto en inversiones inmobiliarias.',
      'Campañas pausadas ~20 Jun por CPL alto en TNG2A Jun y Mayo. Relanzamiento el 23 Jun con TNG2A Jun V2 (mejor CPL). Las primeras 2/3 del mes estuvieron penalizadas.',
      'Reactivación ISA WhatsApp con IA: abrió y cerró leads 2025 como "No interesado" inflando razones de pérdida. No todos los ISA WA son reactivación.',
      'Hipótesis: TNG2A Jun original contenía información de ruleta y atrajo perfiles VIS/otros sectores, elevando volumen pero bajando calidad de lead.',
    ],
    com: {
      c: [
        {
          desc: 'Extraer del CRM las razones de pérdida segmentadas por campaña (ISA WhatsApp, TNG2A Jun original, TNG2A May, TNG2A Jun V2) y comparar el perfil de pérdidas de cada una.',
          obj: 'Identificar qué campaña genera las pérdidas por Mal Segmento y cuál tiene el mejor perfil de lead para escalar en Julio.',
          ind: 'Todas las razones de pérdida aumentaron en Junio. Sin segmentación por campaña no es posible determinar si el problema es de pauta, de producto o de la reactivación ISA WhatsApp.',
        },
        {
          desc: 'Comparar los leads de TNG2A Jun V2 (23-30 Jun) vs TNG2A Jun original: tasas de contactación, conversión a cita y razones de pérdida.',
          obj: 'Confirmar o descartar la hipótesis de que TNG2A Jun original atrajo perfiles VIS por el contenido de ruleta.',
          ind: 'TNG2A Jun V2 arrancó el 23 Jun con mejor CPL. Si también muestra mejor conversión y menos pérdidas por segmento, es la base para escalar en Julio.',
        },
      ],
      m: [
        {
          desc: 'Definir y documentar un protocolo de calificación para Tinguazul 2A en la primera llamada: preguntas filtro que detecten perfiles VIS, fuera de presupuesto o de otras ciudades desde el inicio.',
          obj: 'Reducir el tiempo invertido en leads no calificados y mejorar la tasa de conversión lead→cita del equipo.',
          ind: 'Las pérdidas por Mal Segmento son elevadas. Una calificación más agresiva en primera llamada libera capacidad comercial y mejora la calidad del pipeline.',
        },
        {
          desc: 'Sesión de entrenamiento de objeciones específicas de Tinguazul 2A: precio/m² vs VIS, plan de pagos, beneficios de Gran Granada y Parque La Florida. Usar el perfil de Jun V2 como referencia del cliente objetivo.',
          obj: 'Mejorar la conversión lead→cita aprovechando que la tasa cita→visita ya mejoró en Junio.',
          ind: 'La conversión cita→visita mejoró en Junio — el lead que llega a cita tiene interés real. El cuello de botella está en la primera gestión telefónica.',
        },
      ],
      l: [
        {
          desc: 'Crear el perfil ideal de lead para Tinguazul 2A (nivel de ingresos, ubicación, primera vivienda vs inversión, rango de presupuesto) y compartirlo como brief formal con el equipo de pauta.',
          obj: 'Alinear la segmentación de Meta con el perfil comercial real y reducir las pérdidas por Mal Segmento de forma estructural.',
          ind: 'La hipótesis de la ruleta atrayendo perfiles equivocados evidencia desconexión entre el brief de pauta y el perfil comercial. Documentar evita que se repita en futuras campañas.',
        },
      ],
    },
    mer: {
      c: [
        {
          desc: 'Comparar los KPIs diarios de TNG2A Jun V2 (CPL, CTR, contactación) vs el promedio de la primera quincena de Junio. Si la tendencia se confirma, incrementar el presupuesto en un 15-20% en la primera semana de Julio.',
          obj: 'Capitalizar el mejor rendimiento de TNG2A Jun V2 antes de que la audiencia se sature.',
          ind: 'Con solo ~7 días de datos (23-30 Jun), Jun V2 es prometedora pero necesita más volumen antes de un aumento estructural de inversión.',
        },
        {
          desc: 'Crear en CRM (o en Meta Ads Manager) un segmento diferenciado para los leads de la reactivación ISA WhatsApp, separando sus métricas del CPL y la conversión real de pauta activa.',
          obj: 'Tener una lectura limpia del CPL real de TNG2A para tomar decisiones de inversión en Julio.',
          ind: 'Sin esta separación el CPL y la conversión de Junio son difíciles de interpretar: parte del volumen y las pérdidas provienen de leads reactivados 2025, no de la pauta nueva.',
        },
      ],
      m: [
        {
          desc: 'Desarrollar nuevas creatividades de TNG2A para contextos de alta incertidumbre: contenido enfocado en estabilidad patrimonial, valorización del sector (Parque La Florida) y construcción de patrimonio a largo plazo.',
          obj: 'Mantener una tasa de conversión estable en períodos de feriados, incertidumbre política o económica.',
          ind: 'Junio (feriados + elecciones) afectó todos los canales incluyendo el tráfico orgánico a sala. Las creatividades actuales no están diseñadas para funcionar en entornos de baja disposición a comprometerse.',
        },
        {
          desc: 'Con los datos de más días de TNG2A Jun V2, definir si ampliar audiencia o afinar segmentación. Escalar presupuesto máx. 20% semanal para no reiniciar el periodo de aprendizaje de Meta.',
          obj: 'Maximizar el volumen de leads calificados de TNG2A en Julio sin sacrificar la calidad de perfil que Jun V2 está mostrando.',
          ind: 'Jun V2 ya muestra mejor CPL. Un escalamiento mal ejecutado puede reiniciar el aprendizaje de Meta y perder el momentum ganado.',
        },
      ],
      l: [
        {
          desc: 'Diseñar y documentar un protocolo estándar de evaluación de campaña para TNG2A: umbrales de CPL y conversión a cita que activen automáticamente una revisión, con criterios predefinidos de pausa y escale.',
          obj: 'Reducir el tiempo de reacción ante campañas que pierden eficiencia: de semanas a días.',
          ind: 'La decisión de pausar las campañas el 20 Jun se tomó sobre la marcha. Un protocolo predefinido habría permitido reaccionar antes y reducir el impacto en el mes.',
        },
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Formateadores locales (portados de buildPlan).
const fP = (v: number | null): string => (v != null ? `${v.toFixed(1)}%` : '-');
const fC = (v: number | null): string => (v != null ? `$${Math.round(v).toLocaleString('es-CO')}` : '-');
const pp = (v: number | null): string => {
  if (v == null) return '';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`;
};

interface Diag {
  k: string;
  cur: number | null;
  pv: number | null;
  kind: 'pct' | 'cop';
  up: boolean;
}

interface PrevAvg {
  pContact: number;
  pLCita: number;
  pCitaVis: number;
  pLVis: number;
  pDigVis: number;
  cpl: number | null;
  pLRProd: number;
  pLRSeg: number;
  pLRInt: number;
  pLRCont: number;
}

type PlanData =
  | { kind: 'need-months' }
  | { kind: 'insufficient' }
  | {
      kind: 'ok';
      rec: string;
      prev3: string[];
      recM: PlanMetrics;
      pr: PrevAvg;
      diags: Diag[];
      acts: Record<Team, Record<Horizon, Action[]>>;
      ctx: string[] | null;
      paidIdx: number[];
      emptyPct: number;
    };

/** Puerto puro de `buildPlan`. Toda la lógica de reglas y umbrales vive aquí. */
function buildPlanData(
  allLeads: Lead[],
  sel: { label: string; projectIdx: number; invBucket: 'inari' | 'tng' },
  selectedMonth: string | null,
  meta: Meta,
): PlanData {
  const igIdx = sourceIndices(meta.sources, ['instagram'])[0] ?? -1;
  const waIdx = sourceIndices(meta.sources, ['whatsapp'])[0] ?? -1;
  const paidIdx = sourceIndices(meta.sources, PAID_SOURCES);

  // Esta pestaña IGNORA la barra de filtros global (el HTML usaba `RAW` directo):
  // trabaja sobre `allLeads` (= `data.leads`) recortado sólo al proyecto elegido.
  const base = allLeads.filter((l) => l.project === sel.projectIdx);
  const months = [...new Set(base.map((l) => l.month))].sort();
  if (months.length < 2) return { kind: 'need-months' };

  const rec = selectedMonth && months.includes(selectedMonth) ? selectedMonth : months[months.length - 1];
  const recIdx = months.indexOf(rec);
  const prev3 = months.slice(Math.max(0, recIdx - 3), recIdx);

  const invByMonth = INVERSION[sel.invBucket];
  const recM = planMetrics(
    base.filter((l) => l.month === rec),
    { month: rec, invByMonth, paidIdx },
  );
  const prevMs = prev3
    .map((m) => planMetrics(base.filter((l) => l.month === m), { month: m, invByMonth, paidIdx }))
    .filter((m): m is PlanMetrics => m !== null);

  if (!prevMs.length || !recM) return { kind: 'insufficient' };

  const avg = (pick: (m: PlanMetrics) => number): number =>
    prevMs.reduce((s, m) => s + pick(m), 0) / prevMs.length;
  const cplPrev = prevMs.filter((m) => m.cpl != null);

  const pr: PrevAvg = {
    pContact: avg((m) => m.pContact),
    pLCita: avg((m) => m.pLCita),
    pCitaVis: avg((m) => m.pCitaVis),
    pLVis: avg((m) => m.pLVis),
    pDigVis: avg((m) => m.pDigVis),
    cpl: cplPrev.length ? cplPrev.reduce((s, m) => s + (m.cpl ?? 0), 0) / cplPrev.length : null,
    pLRProd: avg((m) => m.pLRProd),
    pLRSeg: avg((m) => m.pLRSeg),
    pLRInt: avg((m) => m.pLRInt),
    pLRCont: avg((m) => m.pLRCont),
  };

  const diags: Diag[] = [
    { k: 'Contactación', cur: recM.pContact, pv: pr.pContact, kind: 'pct', up: true },
    { k: 'Lead a Cita', cur: recM.pLCita, pv: pr.pLCita, kind: 'pct', up: true },
    { k: 'Cita a Visita', cur: recM.pCitaVis, pv: pr.pCitaVis, kind: 'pct', up: true },
    { k: 'Lead a Visita Digital', cur: recM.pDigVis, pv: pr.pDigVis, kind: 'pct', up: true },
    { k: 'CPL Digital', cur: recM.cpl, pv: pr.cpl, kind: 'cop', up: false },
    { k: 'Pérdida Producto', cur: recM.pLRProd, pv: pr.pLRProd, kind: 'pct', up: false },
    { k: 'Pérdida Mal Segmento', cur: recM.pLRSeg, pv: pr.pLRSeg, kind: 'pct', up: false },
    { k: 'Pérdida Falta Interés', cur: recM.pLRInt, pv: pr.pLRInt, kind: 'pct', up: false },
    { k: 'Pérdida Contactabilidad', cur: recM.pLRCont, pv: pr.pLRCont, kind: 'pct', up: false },
  ];

  // ── Reglas de acción ──────────────────────────────────────────────────────
  const acts: Record<Team, Record<Horizon, Action[]>> = {
    com: { c: [], m: [], l: [] },
    mer: { c: [], m: [], l: [] },
  };
  const add = (team: Team, hz: Horizon, desc: string, ind: string): void => {
    acts[team][hz].push({ desc, ind });
  };
  const projName = sel.label;

  if (recM.pContact < pr.pContact - TH.CONTACT_DROP_PP)
    add(
      'com',
      'c',
      `Auditar protocolo de primer contacto en ${projName}: velocidad de respuesta (meta: menos de 5 min desde el registro del lead)`,
      `Contactación bajo ${pp(recM.pContact - pr.pContact)}: de ${fP(pr.pContact)} a ${fP(recM.pContact)}`,
    );

  if (recM.pLCita < pr.pLCita - TH.LCITA_DROP_PP) {
    add(
      'com',
      'c',
      `Revisar guion de 2do y 3er contacto para ${projName}: claridad en propuesta de visita y manejo de objeción de tiempo`,
      `Lead-Cita bajo ${pp(recM.pLCita - pr.pLCita)}: de ${fP(pr.pLCita)} a ${fP(recM.pLCita)}`,
    );
    add(
      'com',
      'm',
      `Sesión de entrenamiento en manejo de objeciones específicas de ${projName}: precio, ubicación, producto y perfil del comprador`,
      `Lead-Cita en ${fP(recM.pLCita)}`,
    );
  }

  if (recM.pCitaVis < pr.pCitaVis - TH.CITAVIS_DROP_PP) {
    add(
      'com',
      'c',
      `Protocolo de confirmación 24h antes de la cita para ${projName}: mensaje personalizado con beneficios concretos de la visita`,
      `Cita-Visita bajo ${pp(recM.pCitaVis - pr.pCitaVis)}: de ${fP(pr.pCitaVis)} a ${fP(recM.pCitaVis)}`,
    );
    add(
      'com',
      'm',
      `Revisar propuesta de valor en llamada de agendamiento para ${projName}: asegurar que el lead entiende que verá y por qué vale la visita`,
      `Cita-Visita en ${fP(recM.pCitaVis)}`,
    );
  }

  if (recM.cpl != null && pr.cpl != null && recM.cpl > pr.cpl * TH.CPL_RISE_FACTOR) {
    add(
      'mer',
      'c',
      `Revisar segmentación de audiencias de ${projName} en Meta: desactivar públicos con CPL > ${fC(Math.round(recM.cpl * 1.2))} y ampliar lookalike`,
      `CPL subió de ${fC(Math.round(pr.cpl))} a ${fC(recM.cpl)}`,
    );
    add(
      'mer',
      'm',
      `Evaluar distribución de presupuesto de ${projName} por canal: redirigir hacia el canal con mejor CPL y conversión a visita`,
      `CPL Digital: ${fC(recM.cpl)}`,
    );
    add(
      'mer',
      'l',
      `Explorar nuevos formatos para ${projName} (Reels, UGC, video-recorrido) y evaluar Google Ads como canal complementario`,
      `Eficiencia de pauta deteriorada: CPL ${fC(recM.cpl)}`,
    );
  }

  if (recM.cpl != null && pr.cpl != null && recM.cpl < pr.cpl * TH.CPL_DROP_FACTOR)
    add(
      'mer',
      'm',
      `Escalar presupuesto de ${projName}: el CPL mejoró un ${Math.round(((pr.cpl - recM.cpl) / pr.cpl) * 100)}%. Aumentar inversión en el canal que está traccionando`,
      `CPL bajó de ${fC(Math.round(pr.cpl))} a ${fC(recM.cpl)} (mejora en eficiencia)`,
    );

  if (recM.pLRProd > pr.pLRProd + TH.LOSS_RISE_PP)
    add(
      'com',
      'c',
      `Argumentario de objeciones de producto para ${projName}: precio/m2, distribución de espacios, tiempo de entrega y comparativo vs competencia`,
      `Pérdidas por Producto subieron ${pp(recM.pLRProd - pr.pLRProd)}: de ${fP(pr.pLRProd)} a ${fP(recM.pLRProd)}`,
    );

  if (recM.pLRSeg > pr.pLRSeg + TH.LOSS_RISE_PP) {
    add(
      'mer',
      'c',
      `Ajustar audiencias de ${projName} en Meta: revisar edad, intereses y geografía para reducir leads fuera de perfil financiero`,
      `Mal segmento subió ${pp(recM.pLRSeg - pr.pLRSeg)}: de ${fP(pr.pLRSeg)} a ${fP(recM.pLRSeg)}`,
    );
    add(
      'mer',
      'm',
      `Revisar copy del anuncio de ${projName}: comunicar precio y cuota mínima para pre-calificar antes del clic`,
      `Mal segmento en ${fP(recM.pLRSeg)}`,
    );
  }

  if (recM.pLRInt > pr.pLRInt + TH.LOSS_RISE_PP) {
    add(
      'mer',
      'm',
      `Revisar promesa del anuncio de ${projName} vs ciclo real de decisión: CTA hacia "conoce el proyecto" en lugar de "compra ahora"`,
      `Pérdidas por falta de interés/momento: ${fP(recM.pLRInt)} (sube ${pp(recM.pLRInt - pr.pLRInt)})`,
    );
    add(
      'mer',
      'l',
      `Crear segmento de nurturing para ${projName}: flujo de 6-8 semanas para leads con intención futura`,
      'Base de leads de interés tardío acumulándose',
    );
  }

  // Instagram: volumen alto pero conversión a cita cayendo.
  const igR = igIdx >= 0 ? recM.srcD[igIdx] : undefined;
  const igPavg =
    prevMs.reduce((s, m) => {
      const sd = igIdx >= 0 ? m.srcD[igIdx] : undefined;
      return s + (sd && sd.leads ? (sd.citas / sd.leads) * 100 : 0);
    }, 0) / prevMs.length;
  const igConvR = igR && igR.leads ? (igR.citas / igR.leads) * 100 : 0;
  if (igR && igR.leads > TH.IG_MIN_LEADS && igConvR < igPavg - TH.IG_CONV_DROP_PP)
    add(
      'mer',
      'c',
      `Rotar creatividades de Instagram para ${projName}: probar ángulos de unidad específica, precio, lifestyle y testimonial. Pausar piezas con más de 7 días sin mejora`,
      `Instagram: ${igR.leads} leads pero conversión a cita bajó de ${fP(igPavg)} a ${fP(igConvR)}`,
    );

  // WhatsApp: crecimiento fuerte de volumen que pide estructurar el flujo.
  const waPavg =
    prevMs.reduce((s, m) => {
      const sd = waIdx >= 0 ? m.srcD[waIdx] : undefined;
      return s + (sd ? sd.leads : 0);
    }, 0) / prevMs.length;
  const waR = waIdx >= 0 ? recM.srcD[waIdx] : undefined;
  if (waR && waR.leads > waPavg * TH.WA_GROWTH_FACTOR && waR.leads > TH.WA_MIN_LEADS) {
    add(
      'mer',
      'm',
      `Flujo estructurado de WhatsApp para ${projName}: plantillas en 3 pasos (presentación del proyecto, propuesta de visita, confirmación)`,
      `WhatsApp creció de ${Math.round(waPavg)} a ${waR.leads} leads/mes`,
    );
    add(
      'mer',
      'l',
      `Evaluar bot de calificación en WhatsApp para ${projName}: pre-filtrar por presupuesto, ubicación y momento de compra antes de asignar a asesor`,
      'Volumen WhatsApp requiere automatización de primera respuesta',
    );
  }

  if (recM.openCount > TH.PIPELINE_ALERT)
    add(
      'com',
      'c',
      `Gestionar pipeline de ${projName} (${recM.openCount} leads activos): priorizar visitados y negociaciones. Fecha límite: 15 días desde corte del mes`,
      `Pipeline abierto: ${recM.openCount} leads sin cierre`,
    );

  if (recM.neg > 0)
    add(
      'com',
      'c',
      `Propuesta concreta por tipología a los ${recM.neg} lead(s) en negociación de ${projName} en menos de 48 horas. Involucrar gerencia en casos con más de 30 días sin avance`,
      `${recM.neg} negociación(es) activa(s) al cierre del mes`,
    );

  // Calidad de datos: si demasiados perdidos no tienen motivo, la lectura de
  // pérdidas es ciega. (Añadido al port: el original no lo contemplaba.)
  const emptyPct = recM.lostTotal ? (recM.emptyLoss / recM.lostTotal) * 100 : 0;
  if (emptyPct > TH.DATA_QUALITY_LOSS_PCT)
    add(
      'com',
      'm',
      `Registrar el motivo de pérdida en el CRM para ${projName}: ${recM.emptyLoss} de ${recM.lostTotal} leads perdidos (${emptyPct.toFixed(0)}%) no tienen motivo. Sin él, el análisis de pérdidas es ciego.`,
      `Calidad de datos: ${emptyPct.toFixed(0)}% de los perdidos sin motivo registrado`,
    );

  // ── Periodo de aprendizaje ────────────────────────────────────────────────
  // Si la inversión del mes reciente cambió >25% vs el promedio anterior, Meta
  // entra en fase de aprendizaje: CPL y calidad de leads pueden verse afectados
  // 1-2 semanas sin que sea un problema estructural.
  const invPrev = prevMs.filter((m) => m.inv > 0);
  const avgInv = invPrev.length ? invPrev.reduce((s, m) => s + m.inv, 0) / invPrev.length : 0;
  const invDelta = avgInv > 0 ? (recM.inv - avgInv) / avgInv : 0;
  const enAprendizaje = Math.abs(invDelta) > TH.LEARNING_INV_DELTA && recM.inv > 0;
  const aprendizajeNota = enAprendizaje
    ? `Nota: la inversión cambió un ${invDelta > 0 ? '+' : ''}${Math.round(invDelta * 100)}% vs el promedio anterior. Meta requiere un periodo de aprendizaje de 1-2 semanas — validar tendencia antes de hacer cambios estructurales.`
    : null;

  // ── Insights estratégicos Junio 2026 (hardcodeados) ───────────────────────
  const showJun = rec === '2026-06';
  const insJun = showJun ? INSIGHTS_JUN[sel.projectIdx] : undefined;
  if (insJun) {
    insJun.com.c.forEach((a) => acts.com.c.unshift(a));
    insJun.com.m.forEach((a) => acts.com.m.unshift(a));
    insJun.com.l.forEach((a) => acts.com.l.unshift(a));
    insJun.mer.c.forEach((a) => acts.mer.c.unshift(a));
    insJun.mer.m.forEach((a) => acts.mer.m.unshift(a));
    insJun.mer.l.forEach((a) => acts.mer.l.unshift(a));
  }

  // Si hay periodo de aprendizaje, las acciones de pauta de corto pasan a
  // mediano (son efectos del aprendizaje, no intervención urgente).
  if (enAprendizaje) {
    acts.mer.m = [...acts.mer.c, ...acts.mer.m];
    acts.mer.c = [];
    acts.mer.c.push({
      desc: `Monitorear métricas diarias durante el periodo de aprendizaje de Meta (${Math.round(Math.abs(invDelta) * 100)}% de cambio en inversión). Evitar ajustes de audiencia o presupuesto durante los primeros 7 días para no reiniciar el aprendizaje.`,
      ind: aprendizajeNota,
    });
  }

  return {
    kind: 'ok',
    rec,
    prev3,
    recM,
    pr,
    diags,
    acts,
    ctx: insJun ? insJun.ctx : null,
    paidIdx,
    emptyPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render.
export function PlanTab({ data, filtered, filters, meta }: TabProps) {
  // Esta pestaña ignora `filtered`/`filters` a propósito: replica el original,
  // que leía `RAW` directo. Usa `data.leads` y sus propios controles locales.
  void filtered;
  void filters;

  const [projIdx, setProjIdx] = useState(0);
  const [month, setMonth] = useState<string | null>(null);

  const sel = PLAN_PROJECTS[projIdx];

  const months = useMemo(
    () =>
      [...new Set(data.leads.filter((l) => l.project === sel.projectIdx).map((l) => l.month))].sort(),
    [data.leads, sel.projectIdx],
  );

  const plan = useMemo(
    () => buildPlanData(data.leads, sel, month, meta),
    [data.leads, sel, month, meta],
  );

  const recMonth = plan.kind === 'ok' ? plan.rec : month;

  return (
    <Section
      title="Plan de Acción"
      sub="Diagnóstico y recomendaciones accionables por proyecto y mes"
    >
      {/* Controles locales. Mismo vocabulario que la barra global. */}
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Proyecto</span>
          <Segmented
            label="Proyecto del plan"
            value={projIdx}
            onChange={(i) => {
              setProjIdx(i);
              // El mes elegido puede no existir en el otro proyecto.
              setMonth(null);
            }}
            segments={PLAN_PROJECTS.map((p, i) => ({ value: i, label: p.label }))}
          />
        </div>

        {recMonth ? (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mes</span>
            <MonthSelect label="Mes del plan" value={recMonth} months={months} onChange={setMonth} />
          </div>
        ) : null}
      </div>

      {/* Aviso: esta vista ignora la barra de filtros global. */}
      <p className="mb-5 text-2xs text-muted">
        Esta vista usa sus propios controles (proyecto y mes) e ignora los filtros globales de la
        barra superior.
      </p>

      {plan.kind === 'need-months' && (
        <p className="py-8 text-sm text-dim">Se necesitan al menos 2 meses de datos.</p>
      )}
      {plan.kind === 'insufficient' && (
        <p className="py-8 text-sm text-dim">Datos insuficientes para comparación.</p>
      )}

      {plan.kind === 'ok' && (
        <PlanBody plan={plan} sel={sel} sources={meta.sources} />
      )}
    </Section>
  );
}

function PlanBody({
  plan,
  sel,
  sources,
}: {
  plan: Extract<PlanData, { kind: 'ok' }>;
  sel: { label: string };
  sources: string[];
}) {
  const { recM, diags, acts, ctx, rec, prev3, paidIdx } = plan;

  return (
    <>
      {/* Contexto Junio 2026 (hardcodeado) */}
      {ctx && (
        <div className="mb-6 rounded-lg border-l-4 border-accent bg-card p-4">
          <div className="mb-2.5 text-2xs font-bold uppercase tracking-wide text-accent">
            Contexto Junio 2026 — Factores externos e internos
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ctx.map((c, i) => (
              <div key={i} className="rounded-md bg-grid px-3 py-2 text-xs leading-relaxed text-text">
                <span className="mr-1.5 text-dim">▶</span>
                {c}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnósticos: reciente vs promedio de los meses previos */}
      <h3 className="mb-2 text-xs font-semibold text-dim">
        Diagnóstico · {monthLabel(rec)} vs promedio de {prev3.map(monthLabel).join(', ')}
      </h3>
      <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {diags.map((d) => (
          <DiagCard key={d.k} d={d} />
        ))}
      </div>

      {/* Pipeline abierto + motivo principal de pérdida */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Chip label="Pipeline abierto" value={`${recM.openCount} leads`} color={recM.openCount > TH.PIPELINE_ALERT ? BAD : undefined} />
        <Chip label="Negociaciones" value={String(recM.neg)} color={recM.neg > 0 ? WARN : undefined} />
        <Chip label="Separaciones" value={String(recM.sep)} />
        <Chip label="Motivo principal de pérdida" value={recM.mainLR} />
        {recM.lostTotal > 0 && (
          <Chip
            label="Perdidos sin motivo"
            value={`${recM.emptyLoss} (${plan.emptyPct.toFixed(0)}%)`}
            color={plan.emptyPct > TH.DATA_QUALITY_LOSS_PCT ? WARN : undefined}
          />
        )}
      </div>

      {/* Desempeño por fuente de pauta */}
      {paidIdx.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold text-dim">Desempeño por fuente de pauta</h3>
          <SourcePerfChart recM={recM} paidIdx={paidIdx} sources={sources} />
        </div>
      )}

      {/* Recomendaciones por equipo */}
      <TeamSection num="01" chapter="Equipo Comercial" title="Acciones Comerciales" team={acts.com} projName={sel.label} />
      <TeamSection num="02" chapter="Equipo de Mercadeo" title="Acciones de Mercadeo" team={acts.mer} projName={sel.label} />
    </>
  );
}

function DiagCard({ d }: { d: Diag }) {
  if (d.cur == null && d.pv == null) return null;
  const diff = d.cur != null && d.pv != null ? d.cur - d.pv : null;
  const ok = diff === null ? null : d.up ? diff >= 0 : diff <= 0;
  const col = ok === null ? '#6a6a82' : ok ? OK : BAD;
  const arrow = ok === null ? '' : ok ? '↑' : '↓';
  const fmt = d.kind === 'cop' ? fC : fP;

  return (
    <div className="rounded-lg bg-card p-3" style={{ borderLeft: `3px solid ${col}` }}>
      <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-dim">{d.k}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-dim">Prev: {fmt(d.pv)}</div>
          <div className="text-xl font-bold leading-tight" style={{ color: col }}>
            {fmt(d.cur)}
          </div>
        </div>
        <div className="text-right text-xs font-bold" style={{ color: col }}>
          {arrow}
          <br />
          {diff !== null ? pp(diff) : ''}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-card px-4 py-2.5 text-xs">
      <span className="text-dim">{label}: </span>
      <strong style={color ? { color } : undefined}>{value}</strong>
    </div>
  );
}

const BC: Record<Horizon, string> = { c: BAD, m: WARN, l: OK };
const HL: Record<Horizon, string> = {
  c: 'Corto plazo — Esta semana',
  m: 'Mediano plazo — Próximas 2–4 semanas',
  l: 'Largo plazo — Mes siguiente y en adelante',
};

function TeamSection({
  num,
  chapter,
  title,
  team,
  projName,
}: {
  num: string;
  chapter: string;
  title: string;
  team: Record<Horizon, Action[]>;
  projName: string;
}) {
  const empty = !team.c.length && !team.m.length && !team.l.length;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-2xs font-bold text-accent">{num}</span>
        <span className="text-sm font-bold text-text">{chapter}</span>
      </div>
      <h3 className="mb-1 text-xs font-semibold text-dim">{title}</h3>
      {empty ? (
        <p className="text-xs text-dim">
          Sin acciones críticas detectadas para {projName} en el periodo analizado.
        </p>
      ) : (
        (['c', 'm', 'l'] as const).map((hz) =>
          team[hz].length ? (
            <div key={hz} className="mb-4">
              <div className="mb-2 text-2xs font-bold uppercase tracking-wide text-dim">{HL[hz]}</div>
              {team[hz].map((a, i) => (
                <ActionCard key={i} a={a} hz={hz} />
              ))}
            </div>
          ) : null,
        )
      )}
    </div>
  );
}

function ActionCard({ a, hz }: { a: Action; hz: Horizon }) {
  return (
    <div className="mb-2.5 rounded-r-lg bg-card p-3.5" style={{ borderLeft: `4px solid ${BC[hz]}` }}>
      <div className={a.obj || a.ind ? 'mb-2.5' : ''}>
        <div className="mb-0.5 text-3xs font-bold uppercase tracking-wide" style={{ color: BC[hz] }}>
          Acción
        </div>
        <div className="text-xs font-semibold leading-snug text-text">{a.desc}</div>
      </div>
      {a.obj && (
        <div className={a.ind ? 'mb-2' : ''}>
          <div className="mb-0.5 text-3xs font-bold uppercase tracking-wide text-text">Objetivo</div>
          <div className="text-xs leading-snug text-text">{a.obj}</div>
        </div>
      )}
      {a.ind && (
        <div>
          <div className="mb-0.5 text-3xs font-bold uppercase tracking-wide text-dim">Por qué</div>
          <div className="text-2xs italic leading-snug text-dim">{a.ind}</div>
        </div>
      )}
    </div>
  );
}

function SourcePerfChart({
  recM,
  paidIdx,
  sources,
}: {
  recM: PlanMetrics;
  paidIdx: number[];
  sources: string[];
}) {
  const labels = paidIdx.map((i) => sources[i] ?? `Fuente ${i}`);
  const leadsData = paidIdx.map((i) => recM.srcD[i]?.leads ?? 0);
  const convData = paidIdx.map((i) => {
    const sd = recM.srcD[i];
    return sd && sd.leads ? Number(((sd.citas / sd.leads) * 100).toFixed(1)) : 0;
  });

  return (
    <ChartBox height={260}>
      <MixedChart
        data={{
          labels,
          datasets: [
            {
              type: 'bar' as const,
              label: 'Leads',
              data: leadsData,
              backgroundColor: '#6366f144',
              borderColor: '#6366f1',
              borderWidth: 2,
              order: 2,
              yAxisID: 'y',
            },
            {
              type: 'line' as const,
              label: 'Conversión a cita %',
              data: convData,
              borderColor: '#22d3ee',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 4,
              tension: 0.3,
              order: 1,
              yAxisID: 'y1',
            },
          ],
        }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: TICK_COLOR } },
            y: {
              beginAtZero: true,
              grid: { color: GRID_COLOR },
              ticks: { color: '#6366f1', precision: 0 },
              title: { display: true, text: 'Leads', color: '#6366f1', font: { size: 10 } },
            },
            y1: {
              type: 'linear' as const,
              position: 'right' as const,
              beginAtZero: true,
              grid: { drawOnChartArea: false },
              ticks: { color: '#22d3ee' },
              title: { display: true, text: 'Conv. a cita %', color: '#22d3ee', font: { size: 10 } },
            },
          },
        }}
      />
    </ChartBox>
  );
}
