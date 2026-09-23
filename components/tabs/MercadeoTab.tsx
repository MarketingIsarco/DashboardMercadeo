'use client';

import { useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { ChartBox } from '@/components/charts/ChartBox';
import { MixedChart } from '@/components/charts/MixedChart';
import type { MixedData, MixedOptions } from '@/components/charts/MixedChart';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { pctLabelsBar, pctLabelsDoughnut } from '@/components/charts/pctLabels';
import { TasasMercado } from '@/components/TasasMercado';
import { DataTable } from '@/components/ui/DataTable';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { Section } from '@/components/ui/Section';
import {
  BOLSA_LABEL,
  DIGITAL_COLOR,
  INVERSION_MESES,
  LOSS_GROUPS,
  LOSS_GROUP_COLORS,
  LOSS_GROUP_LABEL,
  META_ADS_SOURCES,
  NO_DIGITAL_COLOR,
  OUTBOUND_EXCLUDED_LABELS,
  PAID_SOURCES,
  PERFIL_CAMPOS,
  PERFIL_COLORS,
  PERFIL_EDAD,
  PERFIL_GENERO,
  PERFIL_GRUPO_LABEL,
  PERFIL_PRESUPUESTO,
  PERFIL_SESGO_PCT,
  RUBROS,
  SIN_ETIQUETA,
  SIN_MOTIVO,
  SIN_MOTIVO_COLOR,
  SOURCE_COLORS,
  SOURCE_FALLBACK,
  STAGES,
  STAGE_SEPARACION,
} from '@/lib/config/negocio';
import type { Bolsa } from '@/lib/config/negocio';
import { fmtCOP, monthLabel, normalize, pct, sourceIndices } from '@/lib/format';
import { cobertura, coberturaMensual, combinaciones, distribucion, suficiencia } from '@/lib/buyer';
import type { Distribucion } from '@/lib/buyer';
import {
  bolsasActivas,
  matrizRubros,
  mesesActivos,
  proyectosDeBolsas,
  totales,
  totalesMes,
} from '@/lib/inversion';
import {
  applyFilters,
  availableMonths,
  computeKpis,
  goalFor,
  metaEtapa,
  isCita,
  isGanado,
  isPerdido,
  isVisita,
  keyOf,
  timeAxis,
} from '@/lib/selectors';
import type { FilterState, TabProps } from '@/lib/selectors';
import type { Lead, LossGroup, Meta } from '@/lib/types';
import { CONTENT_REEL, CONTENT_STATIC, STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';

// ── Constantes locales ───────────────────────────────────────────────
// Un color por etapa del embudo (7). El HTML sólo definía 6 y dejaba la última
// etapa con color `undefined`; aquí la completamos con el dorado de marca.
const STAGE_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#22d3ee', '#f97316', '#4ade80', '#c9a96e'];

function sourceColor(name: string): string {
  return SOURCE_COLORS[name] ?? SOURCE_FALLBACK;
}

/** Índices de `meta.sources` cuyo nombre normalizado está en `names`. */
function sourceIdxSet(sources: string[], names: string[]): Set<number> {
  return new Set(sourceIndices(sources, names));
}

export function MercadeoTab({ data, filtered, filters, meta }: TabProps) {
  const goal = useMemo(() => goalFor(filters), [filters]);

  return (
    <>
      {/* 01 · Indicadores Generales */}
      <KpiSection data={data} filtered={filtered} filters={filters} meta={meta} goal={goal} />

      {/* 02 · Pipeline */}
      <Section title="02 · Pipeline" sub="Estado del embudo, evolución temporal y comparativo mensual">
        <PipelineVivo leads={filtered} />
        <div className="mt-6">
          <Timeline leads={filtered} goal={goal} />
        </div>
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-dim">Comparativo mensual</h3>
          <Comparativo leads={filtered} />
        </div>
      </Section>

      {/* 03 · Análisis por Fuente */}
      <Section title="03 · Análisis por Fuente" sub="Calidad de tráfico, etapa y tipo de campaña por canal">
        <h3 className="mb-2 text-xs font-semibold text-dim">
          Tasa de conversión real por fuente (mín. 5 leads)
        </h3>
        <ConvFuente leads={filtered} sources={meta.sources} />
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-dim">Etapa por fuente</h3>
          <StageSrc leads={filtered} sources={meta.sources} />
        </div>
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-dim">Campañas: Reel vs Estática</h3>
          <CampType leads={filtered} />
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Fuente mes a mes</h3>
            <SrcMonth leads={filtered} sources={meta.sources} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Digital vs No digital</h3>
            <DigitalMonth leads={filtered} digitalSources={meta.digitalSources} />
          </div>
        </div>
      </Section>

      {/* 04 · Motivos de Pérdida */}
      <Section title="04 · Motivos de Pérdida" sub="Análisis de leads perdidos por grupo y razón individual">
        <LossSection leads={filtered} lossReasons={meta.lossReasons} />
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-dim">Pérdidas por Campaña</h3>
          <p className="mb-2 text-2xs text-muted">
            Distribución de motivos de pérdida para cada campaña activa
          </p>
          <LossByCampaign leads={filtered} campaigns={meta.campaigns} />
        </div>
      </Section>

      {/* 05 · Inversión en Mercadeo */}
      <Section
        title="05 · Inversión en Mercadeo"
        sub="Presupuesto P&G clasificado en Digital / No-Digital · según los filtros activos"
      >
        <Inversion filtered={filtered} filters={filters} meta={meta} />
      </Section>

      {/* 06 · Campañas Outbound */}
      <Section
        title="06 · Campañas Outbound"
        sub="Efectividad de las campañas de reactivación y recuperación, por etiqueta del trato"
      >
        <Outbound leads={filtered} labels={meta.labels} />
      </Section>

      {/* 07 · Buyer Persona */}
      <Section
        title="07 · Buyer Persona"
        sub="Quién es el cliente que estamos registrando en el embudo · demográfico, psicográfico y económico"
      >
        <BuyerPersona filtered={filtered} meta={meta} />
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 01 · KPIs
// ─────────────────────────────────────────────────────────────────────
function KpiSection({
  data,
  filtered,
  filters,
  meta,
  goal,
}: {
  data: TabProps['data'];
  filtered: Lead[];
  filters: FilterState;
  meta: Meta;
  goal: ReturnType<typeof goalFor>;
}) {
  const k = useMemo(() => computeKpis(filtered), [filtered]);

  // Delta contra el mes anterior: sólo cuando hay exactamente un mes seleccionado.
  // El "mes anterior" es el inmediatamente previo dentro de los meses presentes en
  // los datos (no el calendario), replicando el `MONTHS.indexOf()` del HTML.
  const prevK = useMemo(() => {
    if (filters.months.length !== 1) return null;
    const months = availableMonths(data.leads);
    const idx = months.indexOf(filters.months[0]);
    if (idx <= 0) return null;
    const prevM = months[idx - 1];
    const prevFilters: FilterState = {
      ...filters,
      months: [prevM],
      exMonths: filters.exMonths.filter((m) => m !== prevM),
    };
    return computeKpis(applyFilters(data.leads, prevFilters, meta.digitalSources));
  }, [data.leads, filters, meta.digitalSources]);

  const delta = (cur: number, prev: number | undefined): number | null => {
    if (prev === undefined) return null;
    const d = cur - prev;
    return d === 0 ? null : d;
  };

  return (
    <Section
      title="01 · Indicadores Generales"
      sub={`${filtered.length.toLocaleString('es-CO')} leads en el filtro actual`}
    >
      <KpiGrid cols={7}>
        <Kpi
          size="xs"
          label="Leads"
          value={k.total.toLocaleString('es-CO')}
          meta={`Meta: ${goal ? goal.leads : 'N/A'}/mes`}
          delta={prevK ? delta(k.total, prevK.total) : null}
          deltaSuffix=""
        />
        {/* Primer escalón real del embudo: la diferencia contra Leads son los
            que nadie tocó todavía. */}
        <Kpi
          size="xs"
          label="Contactados"
          value={k.contactados}
          meta={`${pct(k.contactados, k.total)}% de leads`}
          sub={metaEtapa(goal, 'contactados') ?? 'Meta: N/A'}
          delta={prevK ? delta(k.contactados, prevK.contactados) : null}
          deltaSuffix=""
        />
        <Kpi
          size="xs"
          label="Citas+"
          value={k.citas}
          meta={`${pct(k.citas, k.total)}% de leads`}
          sub={metaEtapa(goal, 'citas') ?? 'Meta: N/A'}
          delta={prevK ? delta(k.citas, prevK.citas) : null}
          deltaSuffix=""
        />
        <Kpi
          size="xs"
          label="Visitas"
          value={k.visitas}
          meta={`${pct(k.visitas, k.total)}% de leads`}
          sub={metaEtapa(goal, 'visitas') ?? 'Meta: N/A'}
          delta={prevK ? delta(k.visitas, prevK.visitas) : null}
          deltaSuffix=""
        />
        {/* Negociaciones cuenta etapa **alcanzada**, igual que citas y visitas:
            es el paso del embudo que faltaba entre la visita y la separación. */}
        <Kpi
          size="xs"
          label="Negociaciones"
          value={k.negociaciones}
          meta={`${pct(k.negociaciones, k.total)}% de leads`}
          sub={metaEtapa(goal, 'negociaciones') ?? 'Meta: N/A'}
          delta={prevK ? delta(k.negociaciones, prevK.negociaciones) : null}
          deltaSuffix=""
        />
        {/* La separación ya tiene meta propia, derivada de las tasas de
            mercado. Antes usaba prestada la de cierres, que es otra cosa. */}
        <Kpi
          size="xs"
          label="Separación"
          value={k.separaciones}
          meta={`${pct(k.separaciones, k.total)}% de leads`}
          sub={metaEtapa(goal, 'separaciones') ?? 'Meta: N/A'}
        />
        <Kpi
          size="xs"
          label="Perdidos"
          value={k.perdidos}
          meta={`${pct(k.perdidos, k.total)}% de leads`}
          sub={`${k.abiertos.toLocaleString('es-CO')} siguen abiertos`}
        />
      </KpiGrid>
      <TasasMercado digital={filters.digital} />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 02 · Pipeline
// ─────────────────────────────────────────────────────────────────────
function PipelineVivo({ leads }: { leads: Lead[] }) {
  const abierto = STAGES.map((_, i) => leads.filter((l) => l.stage === i && l.status === STATUS_OPEN).length);
  const perdido = STAGES.map((_, i) => leads.filter((l) => l.stage === i && l.status === STATUS_LOST).length);
  const ganado = STAGES.map((_, i) => leads.filter((l) => l.stage === i && l.status === STATUS_WON).length);
  const totals = STAGES.map((_, i) => abierto[i] + perdido[i] + ganado[i]);

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  // La fila de totales va como una fila más y se pinta distinto: así el
  // encabezado sigue alineado y la tabla no necesita un pie aparte.
  const rows: Array<{
    stage: string;
    abierto: number;
    perdido: number;
    ganado: number;
    total: number;
    esTotal?: boolean;
  }> = [
    ...STAGES.map((s, i) => ({
      stage: s,
      abierto: abierto[i],
      perdido: perdido[i],
      ganado: ganado[i],
      total: totals[i],
    })),
    {
      stage: 'TOTAL',
      abierto: sum(abierto),
      perdido: sum(perdido),
      ganado: sum(ganado),
      total: sum(totals),
      esTotal: true,
    },
  ];

  /** Celda numérica: en la fila de totales va en negrita. */
  const num = (v: number, esTotal?: boolean) =>
    esTotal ? <b className="text-text">{v.toLocaleString('es-CO')}</b> : v.toLocaleString('es-CO');

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-dim">Pipeline vivo — total histórico por etapa</h3>
      <ChartBox height={300}>
        <Bar
          data={{
            labels: [...STAGES],
            datasets: [
              { label: 'Abierto', data: abierto, backgroundColor: '#6366f166', borderColor: '#6366f1', borderWidth: 1 },
              { label: 'Perdido', data: perdido, backgroundColor: '#f43f5e66', borderColor: '#f43f5e', borderWidth: 1 },
              { label: 'Ganado', data: ganado, backgroundColor: '#4ade8066', borderColor: '#4ade80', borderWidth: 1 },
            ],
          }}
          options={{
            indexAxis: 'y',
            plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
            scales: {
              x: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
              y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            },
          }}
        />
      </ChartBox>
      <div className="mt-3">
        <DataTable
          rows={rows}
          columns={[
            {
              header: 'Etapa',
              cell: (r) => (
                <b className={r.esTotal ? 'uppercase tracking-wide text-accent' : undefined}>{r.stage}</b>
              ),
            },
            { header: 'Abierto', cell: (r) => num(r.abierto, r.esTotal), align: 'right' },
            { header: 'Perdido', cell: (r) => num(r.perdido, r.esTotal), align: 'right' },
            { header: 'Ganado', cell: (r) => num(r.ganado, r.esTotal), align: 'right' },
            { header: 'Total', cell: (r) => num(r.total, r.esTotal), align: 'right' },
          ]}
        />
      </div>
    </div>
  );
}

function Timeline({
  leads,
  goal,
}: {
  leads: Lead[];
  goal: ReturnType<typeof goalFor>;
}) {
  const [gran, setGran] = useState<'month' | 'week' | 'day'>('month');
  const hasMeta = goal !== null;

  const chart = useMemo(() => {
    let labels: string[] = [];
    let counts: number[] = [];
    let vis: number[] = [];
    let metaLeads: number | null = null;
    let metaVis: number | null = null;
    let metaLeadsLabel = 'Meta leads';
    let metaVisLabel = 'Meta visitas';

    if (gran === 'month') {
      const ta = timeAxis(leads);
      labels = ta.keys.map(monthLabel);
      counts = ta.keys.map((kk) => leads.filter((l) => keyOf(l) === kk).length);
      vis = ta.keys.map((kk) => leads.filter((l) => keyOf(l) === kk && isVisita(l)).length);
      if (goal) {
        metaLeads = goal.leads;
        // La meta de visitas sale de `META`, no de un 10% de la meta de leads.
        // Antes se calculaba así y daba 61 donde la meta real son 105: la
        // tarjeta de Visitas del capítulo 01 y esta línea decían cosas
        // distintas sobre el mismo objetivo.
        metaVis = goal.etapas ? goal.etapas.visitas : null;
        metaLeadsLabel = `Meta leads (${goal.leads}/mes)`;
        metaVisLabel = metaVis === null ? 'Meta visitas' : `Meta visitas (${metaVis}/mes)`;
      }
    } else {
      // Semana (lunes ISO) o día. Bucket por clave temporal.
      const bucket = new Map<string, number>();
      const bucketVis = new Map<string, number>();
      for (const l of leads) {
        let key: string;
        if (gran === 'week') {
          const d = new Date(l.date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          key = new Date(d.setDate(diff)).toISOString().slice(0, 10);
        } else {
          key = l.date;
        }
        bucket.set(key, (bucket.get(key) ?? 0) + 1);
        if (isVisita(l)) bucketVis.set(key, (bucketVis.get(key) ?? 0) + 1);
      }
      const keys = [...bucket.keys()].sort();
      labels = keys.map((kk) => kk.slice(5));
      counts = keys.map((kk) => bucket.get(kk) ?? 0);
      vis = keys.map((kk) => bucketVis.get(kk) ?? 0);
      if (goal) {
        // Las dos metas se prorratean con el mismo divisor: si la de visitas
        // se sacara de la de leads ya prorrateada, el redondeo las desalinearía.
        const div = gran === 'week' ? 4.3 : 30;
        metaLeads = Math.round(goal.leads / div);
        metaVis = goal.etapas ? Math.round(goal.etapas.visitas / div) : null;
        const unit = gran === 'week' ? 'sem' : 'día';
        metaLeadsLabel = `Meta leads (${metaLeads}/${unit})`;
        metaVisLabel = metaVis === null ? 'Meta visitas' : `Meta visitas (${metaVis}/${unit})`;
      }
    }
    return { labels, counts, vis, metaLeads, metaVis, metaLeadsLabel, metaVisLabel };
  }, [leads, gran, goal]);

  const datasets = [
    {
      label: 'Leads',
      data: chart.counts,
      fill: true,
      backgroundColor: '#6366f115',
      borderColor: '#6366f1',
      tension: 0.4,
      pointRadius: 3,
      order: 3,
    },
    {
      label: 'Visitas',
      data: chart.vis,
      fill: false,
      backgroundColor: 'transparent',
      borderColor: '#4ade80',
      tension: 0.4,
      pointRadius: 3,
      borderWidth: 2,
      order: 2,
      yAxisID: 'y2',
    },
    ...(chart.metaLeads !== null
      ? [{
          label: chart.metaLeadsLabel,
          data: chart.counts.map(() => chart.metaLeads as number),
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0,
          order: 1,
        }]
      : []),
    ...(chart.metaVis !== null
      ? [{
          label: chart.metaVisLabel,
          data: chart.counts.map(() => chart.metaVis as number),
          // Verde oscuro, no el mismo verde al 53%: la meta se dibuja arriba
          // del todo y en claro se pierde contra el fondo, que es justo donde
          // hay que poder verla.
          borderColor: '#22a55b',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          tension: 0,
          order: 1,
          yAxisID: 'y2',
        }]
      : []),
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-dim">Timeline de leads — evolución vs meta</h3>
        <div className="flex flex-wrap gap-1.5">
          {(['day', 'week', 'month'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={`pill ${gran === g ? 'pill-gold' : ''}`}
              onClick={() => setGran(g)}
            >
              {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-2xs text-muted">
        Leads en el eje izquierdo, visitas en el derecho, cada uno con su meta. Comparten gráfica pero no escala, así
        que no se comparan alturas entre las dos líneas: cada una se lee contra su propia meta.
      </p>
      <ChartBox height={300}>
        <Line
          data={{ labels: chart.labels, datasets }}
          options={{
            plugins: { legend: legendBottom, tooltip: { mode: 'index', intersect: false } },
            scales: {
              x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, maxRotation: gran === 'day' ? 90 : 0 } },
              y: {
                position: 'left',
                beginAtZero: true,
                grid: { color: GRID_COLOR },
                ticks: { color: '#6366f1' },
                title: { display: true, text: 'Leads', color: '#6366f1', font: { size: 10 } },
              },
              y2: {
                type: 'linear',
                position: 'right',
                beginAtZero: true,
                // Sin retícula propia: dos juegos de líneas horizontales sobre
                // el mismo lienzo se leen como una sola y confunden la lectura.
                grid: { display: false },
                ticks: { color: '#22a55b' },
                title: { display: true, text: 'Visitas', color: '#22a55b', font: { size: 10 } },
              },
            },
          }}
        />
      </ChartBox>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 06 · Campañas Outbound
// ─────────────────────────────────────────────────────────────────────

interface CampanaOutbound {
  nombre: string;
  leads: number;
  porEtapa: number[];
  citas: number;
  visitas: number;
  separaciones: number;
  abiertos: number;
  perdidos: number;
  ganados: number;
}

/** Métricas de un grupo de leads, para una campaña o para el total. */
function resumirOutbound(nombre: string, ls: Lead[]): CampanaOutbound {
  return {
    nombre,
    leads: ls.length,
    porEtapa: STAGES.map((_, i) => ls.filter((l) => l.stage === i).length),
    citas: ls.filter(isCita).length,
    visitas: ls.filter(isVisita).length,
    separaciones: ls.filter((l) => l.stage >= STAGE_SEPARACION).length,
    abiertos: ls.filter((l) => l.status === STATUS_OPEN).length,
    perdidos: ls.filter(isPerdido).length,
    ganados: ls.filter(isGanado).length,
  };
}

/**
 * Campañas de reactivación y recuperación, leídas de la etiqueta del trato.
 *
 * Cada etiqueta del CRM es una campaña, salvo las de `OUTBOUND_EXCLUDED_LABELS`
 * (estado comercial, no campaña) y los tratos sin etiquetar, que nunca fueron
 * impactados.
 *
 * El total es de leads **únicos**, no la suma de las filas: Pipedrive admite
 * varias etiquetas por trato, así que un lead reactivado dos veces aparece en
 * las dos campañas y sumar las columnas lo contaría doble.
 */
function Outbound({ leads, labels }: { leads: Lead[]; labels: string[] }) {
  const { campanas, total } = useMemo(() => {
    const excluidas = new Set([...OUTBOUND_EXCLUDED_LABELS, SIN_ETIQUETA].map(normalize));
    const idxOutbound = labels
      .map((nombre, i) => ({ nombre, i }))
      .filter(({ nombre }) => !excluidas.has(normalize(nombre)));

    const cs = idxOutbound
      .map(({ nombre, i }) => resumirOutbound(nombre, leads.filter((l) => l.labels.includes(i))))
      .filter((c) => c.leads > 0)
      .sort((a, b) => b.leads - a.leads);

    const idsOutbound = new Set(idxOutbound.map(({ i }) => i));
    const unicos = leads.filter((l) => l.labels.some((i) => idsOutbound.has(i)));

    return { campanas: cs, total: resumirOutbound('TOTAL', unicos) };
  }, [leads, labels]);

  if (campanas.length === 0) {
    return (
      <p className="text-xs text-muted">
        Ninguna campaña outbound en el filtro actual. Se excluyen{' '}
        {OUTBOUND_EXCLUDED_LABELS.map((l) => `"${l}"`).join(', ')} y los tratos sin etiqueta.
      </p>
    );
  }

  const filas: Array<CampanaOutbound & { esTotal?: boolean }> = [
    ...campanas,
    { ...total, esTotal: true },
  ];

  const num = (v: number, esTotal?: boolean) =>
    esTotal ? <b className="text-text">{v.toLocaleString('es-CO')}</b> : v.toLocaleString('es-CO');

  const tasa = (a: number, b: number, esTotal?: boolean) => {
    const t = `${pct(a, b)}%`;
    return esTotal ? <b className="text-text">{t}</b> : t;
  };

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-dim">Leads por campaña y etapa alcanzada</h3>
      {/* Alto proporcional al número de campañas: una barra fija aplasta las
          barras cuando hay muchas y las estira cuando hay dos. */}
      <ChartBox height={Math.max(180, 62 + campanas.length * 34)}>
        <Bar
          data={{
            labels: campanas.map((c) => c.nombre),
            datasets: STAGES.map((s, i) => ({
              label: s,
              data: campanas.map((c) => c.porEtapa[i]),
              backgroundColor: `${STAGE_COLORS[i]}bb`,
              borderColor: STAGE_COLORS[i],
              borderWidth: 1,
            })),
          }}
          options={{
            indexAxis: 'y',
            plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
            scales: {
              x: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
              y: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            },
          }}
        />
      </ChartBox>

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold text-dim">Efectividad por campaña</h3>
        <p className="mb-2 text-2xs text-muted">
          Cita+, Visita+ y Separación+ son acumulados: cuentan los leads que alcanzaron esa etapa o
          la superaron. El TOTAL son leads únicos, así que puede ser menor que la suma de las filas
          si un lead entró en dos campañas.
        </p>
        <DataTable
          rows={filas}
          columns={[
            {
              header: 'Campaña',
              cell: (r) => (
                <b className={r.esTotal ? 'uppercase tracking-wide text-accent' : undefined}>{r.nombre}</b>
              ),
            },
            { header: 'Leads', cell: (r) => num(r.leads, r.esTotal), align: 'right' },
            { header: 'Cita+', cell: (r) => num(r.citas, r.esTotal), align: 'right' },
            { header: 'Visita+', cell: (r) => num(r.visitas, r.esTotal), align: 'right' },
            { header: 'Separación+', cell: (r) => num(r.separaciones, r.esTotal), align: 'right' },
            { header: 'Abierto', cell: (r) => num(r.abiertos, r.esTotal), align: 'right' },
            { header: 'Perdido', cell: (r) => num(r.perdidos, r.esTotal), align: 'right' },
            { header: 'Ganado', cell: (r) => num(r.ganados, r.esTotal), align: 'right' },
            { header: '% Cita', cell: (r) => tasa(r.citas, r.leads, r.esTotal), align: 'right' },
            { header: '% Cierre', cell: (r) => tasa(r.ganados, r.leads, r.esTotal), align: 'right' },
          ]}
        />
      </div>
    </div>
  );
}

function Comparativo({ leads }: { leads: Lead[] }) {
  const ta = timeAxis(leads);
  const buckets = ta.keys.map((kk) => {
    const rows = leads.filter((l) => keyOf(l) === kk);
    return {
      leads: rows.length,
      citas: rows.filter(isCita).length,
      vis: rows.filter(isVisita).length,
      gan: rows.filter(isGanado).length,
    };
  });

  return (
    <ChartBox height={300}>
      <Bar
        data={{
          labels: ta.keys.map(monthLabel),
          datasets: [
            { label: 'Leads', data: buckets.map((b) => b.leads), backgroundColor: '#6366f133', borderColor: '#6366f1', borderWidth: 2, order: 4 },
            { label: 'Citas', data: buckets.map((b) => b.citas), backgroundColor: '#22d3ee33', borderColor: '#22d3ee', borderWidth: 2, order: 3 },
            { label: 'Visitas', data: buckets.map((b) => b.vis), backgroundColor: '#4ade8033', borderColor: '#4ade80', borderWidth: 2, order: 2 },
            { label: 'Sep+Cierres', data: buckets.map((b) => b.gan), backgroundColor: '#c9a96e33', borderColor: '#c9a96e', borderWidth: 2, order: 1 },
          ],
        }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
          scales: {
            x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 03 · Análisis por Fuente
// ─────────────────────────────────────────────────────────────────────
function ConvFuente({ leads, sources }: { leads: Lead[]; sources: string[] }) {
  // Sala de Ventas excluida: los visitantes directos a sala no vienen de un canal
  // digital con incentivo, así que su conversión no es comparable.
  const rows = sources
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => !/sala/i.test(name))
    .map(({ name, i }) => {
      const arr = leads.filter((l) => l.source === i);
      const n = arr.length;
      if (n < 5) return null;
      return {
        name,
        n,
        pCita: Number(pct(arr.filter(isCita).length, n)),
        pVis: Number(pct(arr.filter(isVisita).length, n)),
      };
    })
    .filter((r): r is { name: string; n: number; pCita: number; pVis: number } => r !== null)
    .sort((a, b) => b.pVis - a.pVis);

  return (
    <div>
      <ChartBox height={300}>
        <Bar
          data={{
            labels: rows.map((r) => r.name),
            datasets: [
              { label: '% Lead→Cita', data: rows.map((r) => r.pCita), backgroundColor: '#6366f144', borderColor: '#6366f1', borderWidth: 2 },
              { label: '% Lead→Visita', data: rows.map((r) => r.pVis), backgroundColor: '#22d3ee44', borderColor: '#22d3ee', borderWidth: 2 },
            ],
          }}
          options={{
            plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
            scales: {
              x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, maxRotation: 45 } },
              y: { beginAtZero: true, max: 100, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, callback: (v) => `${v}%` } },
            },
          }}
        />
      </ChartBox>
      <div className="mt-3">
        <DataTable
          rows={rows}
          empty="Ninguna fuente alcanza el mínimo de 5 leads en el filtro actual."
          columns={[
            { header: 'Fuente', cell: (r) => <b>{r.name}</b> },
            { header: 'Leads', cell: (r) => r.n, align: 'right' },
            { header: '% Cita', cell: (r) => `${r.pCita}%`, align: 'right' },
            { header: '% Visita', cell: (r) => `${r.pVis}%`, align: 'right' },
          ]}
        />
      </div>
      <p className="mt-2 text-2xs text-muted">
        * Sala de Ventas excluida — los visitantes directos a sala no provienen de un canal digital con incentivo.
      </p>
    </div>
  );
}

function StageSrc({ leads, sources }: { leads: Lead[]; sources: string[] }) {
  const stageDatasets = STAGES.map((s, si) => ({
    label: s,
    data: sources.map((_, i) => leads.filter((l) => l.source === i && l.stage === si && l.status !== STATUS_LOST).length),
    backgroundColor: `${STAGE_COLORS[si]}66`,
    borderColor: STAGE_COLORS[si],
    borderWidth: 1,
  }));
  const perdidoDataset = {
    label: 'Perdido',
    data: sources.map((_, i) => leads.filter((l) => l.source === i && l.status === STATUS_LOST).length),
    backgroundColor: '#f43f5e44',
    borderColor: '#f43f5e',
    borderWidth: 1,
  };

  return (
    <ChartBox height={320}>
      <Bar
        data={{ labels: sources, datasets: [...stageDatasets, perdidoDataset] }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
          scales: {
            x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, maxRotation: 45 } },
            y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function CampType({ leads }: { leads: Lead[] }) {
  const reel = leads.filter((l) => l.content === CONTENT_REEL);
  const esta = leads.filter((l) => l.content === CONTENT_STATIC);
  const metrics = ['Leads', 'Citas+', 'Visitas', 'Cierres'];
  const series = (arr: Lead[]) => [arr.length, arr.filter(isCita).length, arr.filter(isVisita).length, arr.filter(isGanado).length];

  const tableRows = [
    { tipo: 'Reel', arr: reel },
    { tipo: 'Estática', arr: esta },
  ].map(({ tipo, arr }) => ({
    tipo,
    leads: arr.length,
    citas: arr.filter(isCita).length,
    vis: arr.filter(isVisita).length,
    cierres: arr.filter(isGanado).length,
    pCita: pct(arr.filter(isCita).length, arr.length),
    pVis: pct(arr.filter(isVisita).length, arr.length),
  }));

  return (
    <div>
      <ChartBox height={260}>
        <Bar
          data={{
            labels: metrics,
            datasets: [
              { label: 'Reel', data: series(reel), backgroundColor: '#6366f144', borderColor: '#6366f1', borderWidth: 2 },
              { label: 'Estática', data: series(esta), backgroundColor: '#22d3ee44', borderColor: '#22d3ee', borderWidth: 2 },
            ],
          }}
          options={{
            plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
            scales: {
              x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
              y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            },
          }}
        />
      </ChartBox>
      <div className="mt-3">
        <DataTable
          rows={tableRows}
          columns={[
            { header: 'Tipo', cell: (r) => <b>{r.tipo}</b> },
            { header: 'Leads', cell: (r) => r.leads, align: 'right' },
            { header: 'Citas+', cell: (r) => r.citas, align: 'right' },
            { header: 'Visitas', cell: (r) => r.vis, align: 'right' },
            { header: 'Cierres', cell: (r) => r.cierres, align: 'right' },
            { header: '% Cita', cell: (r) => `${r.pCita}%`, align: 'right' },
            { header: '% Visita', cell: (r) => `${r.pVis}%`, align: 'right' },
          ]}
        />
      </div>
      <p className="mt-2 text-2xs text-muted">
        La mayoría de cierres provienen de leads sin campaña asignada en CRM. Los clasificados como Reel/Estática son
        sólo los capturados vía pauta activa.
      </p>
    </div>
  );
}

function SrcMonth({ leads, sources }: { leads: Lead[]; sources: string[] }) {
  const ta = timeAxis(leads);
  const datasets = sources
    .map((s, i) => ({
      label: s,
      data: ta.keys.map((kk) => leads.filter((l) => l.source === i && keyOf(l) === kk).length),
      backgroundColor: `${sourceColor(s)}66`,
      borderColor: sourceColor(s),
      borderWidth: 1,
    }))
    .filter((d) => d.data.some((v) => v > 0));

  return (
    <ChartBox height={320}>
      <Bar
        data={{ labels: ta.keys.map(monthLabel), datasets }}
        options={{
          plugins: { legend: { ...legendBottom, labels: { ...legendBottom.labels, font: { size: 10 } } }, tooltip: { mode: 'index' } },
          scales: {
            x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function DigitalMonth({
  leads,
  digitalSources,
}: {
  leads: Lead[];
  digitalSources: number[];
}) {
  const set = new Set(digitalSources);
  const ta = timeAxis(leads);
  const dig = ta.keys.map((kk) => leads.filter((l) => keyOf(l) === kk && set.has(l.source)).length);
  const noDig = ta.keys.map((kk) => leads.filter((l) => keyOf(l) === kk && !set.has(l.source)).length);

  return (
    <ChartBox height={320}>
      <Bar
        data={{
          labels: ta.keys.map(monthLabel),
          datasets: [
            { label: 'Digital', data: dig, backgroundColor: '#6366f144', borderColor: '#6366f1', borderWidth: 2 },
            { label: 'No Digital', data: noDig, backgroundColor: '#f59e0b44', borderColor: '#f59e0b', borderWidth: 2 },
          ],
        }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
          scales: {
            x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 04 · Motivos de Pérdida
// ─────────────────────────────────────────────────────────────────────
function LossSection({
  leads,
  lossReasons,
}: {
  leads: Lead[];
  lossReasons: string[];
}) {
  const [selected, setSelected] = useState<LossGroup | null>(null);
  const lost = useMemo(() => leads.filter(isPerdido), [leads]);

  const gCounts = LOSS_GROUPS.map((g) => lost.filter((l) => l.lossGroup === g).length);
  // Los perdidos sin motivo registrado (`lossGroup === ''`, `lossReason === -1`)
  // el HTML los omitía del donut, que por eso no cuadraba con el total de perdidos.
  // Los agregamos como porción gris: es un dato de calidad accionable.
  const sinMotivo = lost.filter((l) => l.lossGroup === '').length;

  const donutLabels = [...LOSS_GROUPS.map((g) => LOSS_GROUP_LABEL[g]), SIN_MOTIVO];
  const donutData = [...gCounts, sinMotivo];
  const donutColors = [...LOSS_GROUPS.map((g) => LOSS_GROUP_COLORS[g]), SIN_MOTIVO_COLOR];

  // Tabla de razones individuales, filtrada al grupo seleccionado.
  const subset = selected ? lost.filter((l) => l.lossGroup === selected) : lost;
  const counts = new Map<number, number>();
  for (const l of subset) if (l.lossReason >= 0) counts.set(l.lossReason, (counts.get(l.lossReason) ?? 0) + 1);
  const reasonRows = [...counts.entries()]
    .map(([idx, n]) => ({ reason: lossReasons[idx] ?? `#${idx}`, n }))
    .sort((a, b) => b.n - a.n);
  const totSub = subset.length;

  // Recuperables vs duras por mes.
  const ta = timeAxis(leads);
  const rec = ta.keys.map((kk) => {
    const mLost = lost.filter((l) => keyOf(l) === kk);
    return { rec: mLost.filter((l) => l.recoverable).length, hard: mLost.filter((l) => !l.recoverable).length };
  });

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-dim">Grupos de pérdida (click para filtrar la tabla)</h3>
          <ChartBox height={280}>
            <Doughnut
              data={{
                labels: donutLabels,
                datasets: [{ data: donutData, backgroundColor: donutColors.map((c) => `${c}cc`), borderColor: '#fff', borderWidth: 2 }],
              }}
              options={{
                onClick: (_evt, els) => {
                  if (!els.length) return;
                  const idx = els[0].index;
                  if (idx >= LOSS_GROUPS.length) {
                    setSelected(null);
                    return;
                  }
                  const g = LOSS_GROUPS[idx];
                  setSelected((cur) => (cur === g ? null : g));
                },
                plugins: {
                  legend: legendBottom,
                  tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, lost.length)}%)` } },
                },
              }}
            />
          </ChartBox>
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-dim">
            Razones individuales
            {selected ? (
              <button type="button" className="pill pill-clear" onClick={() => setSelected(null)}>
                {selected} · {totSub} · ✕ quitar filtro
              </button>
            ) : null}
          </h3>
          <DataTable
            rows={reasonRows}
            maxHeight={280}
            empty="Sin razones individuales registradas para esta selección."
            columns={[
              { header: 'Razón individual', cell: (r) => r.reason },
              { header: 'N', cell: (r) => r.n, align: 'right' },
              { header: '%', cell: (r) => `${pct(r.n, totSub)}%`, align: 'right' },
            ]}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold text-dim">Recuperables vs duras (mensual)</h3>
        <ChartBox height={280}>
          <Bar
            data={{
              labels: ta.keys.map(monthLabel),
              datasets: [
                { label: 'Recuperables', data: rec.map((x) => x.rec), backgroundColor: '#f59e0b44', borderColor: '#f59e0b', borderWidth: 2 },
                { label: 'Duras', data: rec.map((x) => x.hard), backgroundColor: '#f43f5e44', borderColor: '#f43f5e', borderWidth: 2 },
              ],
            }}
            options={{
              plugins: {
                legend: legendBottom,
                tooltip: {
                  mode: 'index',
                  callbacks: {
                    afterBody: (items) => {
                      const i = items[0].dataIndex;
                      const tot = rec[i].rec + rec[i].hard;
                      return tot ? `Total: ${tot} | Rec: ${pct(rec[i].rec, tot)}% | Duras: ${pct(rec[i].hard, tot)}%` : '';
                    },
                  },
                },
              },
              scales: {
                x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
                y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
              },
            }}
          />
        </ChartBox>
        <p className="mt-2 text-2xs text-muted">
          Recuperables = no contesta, no es el momento, faltan datos, perdió interés, curioso. Duras = fuera de
          presupuesto, producto no aplica, mal segmento.
        </p>
      </div>
    </div>
  );
}

/**
 * Motivos de pérdida cruzados por campaña.
 *
 * Es el puente entre mercadeo y comercial: una campaña que trae volumen pero
 * cuyas pérdidas se concentran en "Mal segmento" está comprando el público
 * equivocado, y eso no se ve en el CPL ni en el conteo de leads.
 *
 * Incluye la columna "Sin motivo" — que el HTML original omitía — porque una
 * campaña cuyos perdidos no tienen motivo registrado no está limpia: está sin
 * diagnosticar, y sumarla a "Otro" haría parecer que sí se sabe qué pasó.
 */
function LossByCampaign({ leads, campaigns }: { leads: Lead[]; campaigns: string[] }) {
  const rows = useMemo(() => {
    const lost = leads.filter(isPerdido);
    const byCampaign = new Map<number, { total: number; groups: Map<LossGroup | '', number> }>();

    for (const l of lost) {
      let entry = byCampaign.get(l.campaign);
      if (!entry) {
        entry = { total: 0, groups: new Map() };
        byCampaign.set(l.campaign, entry);
      }
      entry.total += 1;
      entry.groups.set(l.lossGroup, (entry.groups.get(l.lossGroup) ?? 0) + 1);
    }

    return [...byCampaign.entries()]
      .map(([ci, e]) => ({
        campaign: campaigns[ci] ?? `#${ci}`,
        total: e.total,
        counts: [...LOSS_GROUPS.map((g) => e.groups.get(g) ?? 0), e.groups.get('') ?? 0],
      }))
      .sort((a, b) => b.total - a.total);
  }, [leads, campaigns]);

  const headers = [...LOSS_GROUPS.map((g) => LOSS_GROUP_LABEL[g]), SIN_MOTIVO];
  const colors = [...LOSS_GROUPS.map((g) => LOSS_GROUP_COLORS[g]), SIN_MOTIVO_COLOR];

  return (
    <DataTable
      rows={rows}
      maxHeight={360}
      empty="Sin leads perdidos en el filtro actual."
      columns={[
        { header: 'Campaña', cell: (r) => <span className="font-semibold">{r.campaign}</span> },
        { header: 'Total', cell: (r) => <b>{r.total}</b>, align: 'right' },
        ...headers.map((h, gi) => ({
          header: h,
          align: 'right' as const,
          cell: (r: (typeof rows)[number]) => {
            const n = r.counts[gi];
            if (!n) return <span className="text-muted">–</span>;
            return (
              <span style={{ color: colors[gi] }} className="font-semibold">
                {n} <span className="text-2xs text-muted">{pct(n, r.total)}%</span>
              </span>
            );
          },
        })),
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// 05 · Inversión en Mercadeo
//
// El presupuesto del P&G viene partido en 16 rubros, cada uno marcado como
// digital o no-digital (ver `RUBROS` en config/negocio). De ahí sale todo:
//   · el gasto total y su partición Digital / No-Digital
//   · el CPL, que divide SÓLO la inversión digital — meterle vallas y
//     merchandising al denominador de un costo por lead de Instagram infla la
//     métrica con plata que nunca compró un lead digital
//   · los costos por visita y por cierre, que sí van contra el total, porque
//     una visita a sala la produce el conjunto de la mezcla
// ─────────────────────────────────────────────────────────────────────
function Inversion({ filtered, filters, meta }: { filtered: Lead[]; filters: FilterState; meta: Meta }) {
  const bolsas = useMemo(() => bolsasActivas(filters), [filters]);
  const months = useMemo(() => mesesActivos(filters), [filters]);
  const metaIdx = useMemo(() => sourceIdxSet(meta.sources, META_ADS_SOURCES), [meta.sources]);
  const paidIdx = useMemo(() => sourceIdxSet(meta.sources, PAID_SOURCES), [meta.sources]);

  // ── KPIs ────────────────────────────────────────────────────────────
  const kv = useMemo(() => {
    const inv = totales(bolsas, months);

    // Los leads del denominador tienen que venir de los mismos proyectos que
    // pagó esa plata y de los mismos meses. Si no, se divide el presupuesto de
    // 7 meses de Inari entre 12 meses de leads de toda la compañía.
    const proyectos = new Set(proyectosDeBolsas(bolsas));
    const mesesSet = new Set(months);
    const base = filtered.filter((l) => proyectos.has(l.project) && mesesSet.has(l.month));

    const leadsMeta = base.filter((l) => metaIdx.has(l.source)).length;
    const leadsDig = base.filter((l) => paidIdx.has(l.source)).length;
    const citas = base.filter(isCita).length;
    const visitas = base.filter(isVisita).length;
    const cierres = base.filter(isGanado).length;

    const ratio = (num: number, den: number) => (num && den ? Math.round(num / den) : null);

    return {
      ...inv,
      activeMonths: months.length,
      pctDig: inv.total ? Math.round((inv.digital / inv.total) * 100) : 0,
      cplMeta: ratio(inv.digital, leadsMeta),
      cplDig: ratio(inv.digital, leadsDig),
      cplCita: ratio(inv.total, citas),
      costoVis: ratio(inv.total, visitas),
      costoCierre: ratio(inv.total, cierres),
    };
  }, [bolsas, months, filtered, metaIdx, paidIdx]);

  const money = (v: number | null) => (v == null ? '–' : fmtCOP(v));
  const millions = (v: number) => `$${(v / 1e6).toFixed(2)}M`;

  // ── Chart mensual: Digital / No-Digital apilados + línea de CPL ─────
  // Ojo: el CPL mensual usa `filtered` sin restringir a los meses activos —
  // cada mes se divide entre sus propios leads, que es justo lo que el filtro
  // de mes ya deja pasar.
  const chart = useMemo(() => {
    const proyectos = new Set(proyectosDeBolsas(bolsas));
    const base = filtered.filter((l) => proyectos.has(l.project));

    return {
      labels: months.map((m) => monthLabel(m)),
      dig: months.map((m) => totalesMes(bolsas, m).digital / 1e6),
      noDig: months.map((m) => totalesMes(bolsas, m).noDigital / 1e6),
      // null en los meses sin leads o sin inversión: `spanGaps` los salta en vez
      // de dibujar un cero que se leería como "el lead salió gratis".
      cpl: months.map((m) => {
        const ld = base.filter((l) => l.month === m && paidIdx.has(l.source)).length;
        const dig = totalesMes(bolsas, m).digital;
        return ld && dig ? Math.round(dig / ld) : null;
      }),
    };
  }, [bolsas, months, filtered, paidIdx]);

  const invData: MixedData = {
    labels: chart.labels,
    datasets: [
      { type: 'bar' as const, label: 'Digital', data: chart.dig, backgroundColor: `${DIGITAL_COLOR}cc`, stack: 'inv', yAxisID: 'y', order: 2 },
      { type: 'bar' as const, label: 'No-Digital', data: chart.noDig, backgroundColor: `${NO_DIGITAL_COLOR}b3`, stack: 'inv', yAxisID: 'y', order: 2 },
      {
        type: 'line' as const,
        label: 'CPL Digital',
        data: chart.cpl as unknown as number[],
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244,63,94,0.12)',
        yAxisID: 'y2',
        tension: 0.3,
        pointRadius: 5,
        order: 1,
        spanGaps: true,
      },
    ],
  };

  const invOptions: MixedOptions = {
    plugins: {
      legend: legendBottom,
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const raw = (ctx.raw as number) ?? 0;
            if (ctx.dataset.yAxisID === 'y2') return ` CPL Digital: ${fmtCOP(raw)}`;
            return ` ${ctx.dataset.label}: $${raw.toFixed(2)}M`;
          },
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
      y: {
        stacked: true,
        position: 'left',
        beginAtZero: true,
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, callback: (v) => `$${Number(v).toFixed(1)}M` },
        title: { display: true, text: 'Inversión (COP M)', color: TICK_COLOR, font: { size: 10 } },
      },
      y2: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        grid: { display: false },
        ticks: { color: '#f43f5e' },
        title: { display: true, text: 'CPL Digital ($)', color: '#f43f5e', font: { size: 10 } },
      },
    },
  };

  if (!months.length) {
    return (
      <p className="text-xs text-muted">
        Los filtros de fecha activos no tocan ningún mes con presupuesto cargado ({INVERSION_MESES[0]} a{' '}
        {INVERSION_MESES[INVERSION_MESES.length - 1]}).
      </p>
    );
  }

  if (!bolsas.length) {
    return (
      <p className="text-xs text-muted">
        Los proyectos seleccionados no tienen bolsa de inversión asignada en el P&G.
      </p>
    );
  }

  return (
    <div>
      {/* `size="sm"`: son ocho cifras en pesos, y a 28px los CPL de siete
          dígitos se salían de la tarjeta. */}
      <KpiGrid>
        <Kpi
          size="sm"
          label="Inversión Total"
          value={kv.total > 0 ? millions(kv.total) : '–'}
          meta={`${kv.activeMonths} mes(es) · ${bolsas.map((b) => BOLSA_LABEL[b]).join(' + ')}`}
        />
        <Kpi
          size="sm"
          label="Digital"
          value={kv.total > 0 ? <span style={{ color: DIGITAL_COLOR }}>{millions(kv.digital)}</span> : '–'}
          meta={`${kv.pctDig}% del total`}
        />
        <Kpi
          size="sm"
          label="No-Digital"
          value={kv.total > 0 ? <span style={{ color: NO_DIGITAL_COLOR }}>{millions(kv.noDigital)}</span> : '–'}
          meta={`${100 - kv.pctDig}% del total`}
        />
        <Kpi size="sm" label="CPL Meta (IG+FB)" value={money(kv.cplMeta)} meta="inv. digital ÷ leads Instagram/Facebook" />
        <Kpi size="sm" label="CPL Digital" value={money(kv.cplDig)} meta="inv. digital ÷ leads IG+FB+WhatsApp" />
        <Kpi size="sm" label="Costo / Cita" value={money(kv.cplCita)} meta="inv. total ÷ citas agendadas" />
        <Kpi size="sm" label="Costo / Visita" value={money(kv.costoVis)} meta="inv. total ÷ visitas realizadas" />
        <Kpi size="sm" label="Costo / Cierre" value={money(kv.costoCierre)} meta="inv. total ÷ negocios ganados" />
      </KpiGrid>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-semibold text-dim">Inversión mensual: Digital vs No-Digital</h3>
        <ChartBox height={320}>
          <MixedChart data={invData} options={invOptions} />
        </ChartBox>
        <p className="mt-2 text-2xs text-muted">
          El CPL sólo divide la inversión digital, no el total: la valla y el merchandising no compran leads de pauta.
          Los meses sin leads pagados quedan sin punto en la línea.
        </p>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold text-dim">Desglose por rubro</h3>
        <p className="mb-1 text-2xs text-muted">
          Gasto mensual por concepto del P&G · <span style={{ color: DIGITAL_COLOR }}>■ Digital</span>{' '}
          <span style={{ color: NO_DIGITAL_COLOR }}>■ No-Digital</span>. Los rubros sin gasto en el periodo se ocultan.
        </p>
        <RubrosTable bolsas={bolsas} months={months} />
      </div>
    </div>
  );
}

/**
 * Desglose rubro × mes.
 *
 * Va en tabla plana y no en `DataTable` porque el pie —Digital, No-Digital,
 * TOTAL y % Digital— es la mitad del valor: es donde se lee si la mezcla se
 * está corriendo hacia lo digital mes a mes.
 */
function RubrosTable({ bolsas, months }: { bolsas: Bolsa[]; months: string[] }) {
  const t = useMemo(() => {
    const matrix = matrizRubros(bolsas, months);
    const rowTot = matrix.map((row) => row.reduce((a, b) => a + b, 0));
    const colTot = months.map((_, ci) => matrix.reduce((a, row) => a + row[ci], 0));
    const colDig = months.map((_, ci) =>
      matrix.reduce((a, row, ri) => a + (RUBROS[ri].digital ? row[ci] : 0), 0),
    );
    const grand = colTot.reduce((a, b) => a + b, 0);
    const digTot = colDig.reduce((a, b) => a + b, 0);
    return {
      matrix,
      rowTot,
      colTot,
      colDig,
      colNoDig: colTot.map((v, ci) => v - colDig[ci]),
      grand,
      digTot,
      noDigTot: grand - digTot,
    };
  }, [bolsas, months]);

  // Miles con separador local: en pesos, la cifra completa por celda no cabe en
  // 7 columnas y el peso exacto no es la decisión que se toma aquí.
  const k = (v: number) =>
    v ? `$${Math.round(v / 1000).toLocaleString('es-CO')}k` : <span className="text-muted">–</span>;

  const visibles = RUBROS.map((r, ri) => ({ r, ri })).filter(({ ri }) => t.rowTot[ri] > 0);

  if (!visibles.length) {
    return <p className="text-xs text-muted">Sin gasto registrado en el periodo seleccionado.</p>;
  }

  const footRow = (label: string, cells: number[], total: number, color?: string) => (
    <tr>
      <td className="font-semibold" style={{ color }}>
        {color ? '● ' : ''}
        {label}
      </td>
      <td />
      {cells.map((v, ci) => (
        <td key={months[ci]} className="text-right font-semibold" style={{ color }}>
          {k(v)}
        </td>
      ))}
      <td className="text-right font-bold" style={{ color }}>
        {k(total)}
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            <th style={{ minWidth: 180 }}>Rubro</th>
            <th>Fuente CRM</th>
            {months.map((m) => (
              <th key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {monthLabel(m)}
              </th>
            ))}
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map(({ r, ri }) => {
            const color = r.digital ? DIGITAL_COLOR : NO_DIGITAL_COLOR;
            return (
              <tr key={r.label} style={{ background: `${color}10` }}>
                <td>
                  <span style={{ color }}>●</span> {r.label}
                </td>
                <td className="text-2xs text-muted">{r.fuentes.join(', ')}</td>
                {t.matrix[ri].map((v, ci) => (
                  <td key={months[ci]} className="text-right">
                    {k(v)}
                  </td>
                ))}
                <td className="text-right font-semibold">{k(t.rowTot[ri])}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {footRow('Digital', t.colDig, t.digTot, DIGITAL_COLOR)}
          {footRow('No-Digital', t.colNoDig, t.noDigTot, NO_DIGITAL_COLOR)}
          <tr className="border-t-2 border-accent">
            <td className="font-bold">TOTAL</td>
            <td />
            {t.colTot.map((v, ci) => (
              <td key={months[ci]} className="text-right font-bold">
                {k(v)}
              </td>
            ))}
            <td className="text-right font-bold">{k(t.grand)}</td>
          </tr>
          <tr>
            <td className="text-muted">% Digital</td>
            <td />
            {t.colTot.map((v, ci) => (
              <td key={months[ci]} className="text-right text-muted">
                {v ? Math.round((t.colDig[ci] / v) * 100) : 0}%
              </td>
            ))}
            <td className="text-right text-muted">
              {t.grand ? Math.round((t.digTot / t.grand) * 100) : 0}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 07 · Buyer Persona
//
// Quién es el cliente que estamos registrando en cada embudo, según los campos
// de perfilamiento que el asesor diligencia en sala. Todo el capítulo respeta
// la barra de filtros: cambiar Proyecto o Periodo arriba recalcula cada gráfica.
//
// Tres advertencias que el capítulo lleva en pantalla, porque sin ellas los
// porcentajes se vuelven dogma interno:
//
//   1. El denominador nunca es "los leads": es "los leads con ese campo
//      diligenciado". Cada gráfica muestra su propio n.
//   2. Debajo de 1.000 tratos con núcleo completo esto no es un buyer persona,
//      es un perfil preliminar — el mismo umbral del informe mensual.
//   3. Con índices de perfilamiento bajos hay sesgo de selección: el asesor
//      perfila al lead que le interesa, así que el perfil describe a quien el
//      asesor decidió perfilar, no a quien consulta por el proyecto.
// ─────────────────────────────────────────────────────────────────────
function BuyerPersona({ filtered, meta }: { filtered: Lead[]; meta: Meta }) {
  const cob = useMemo(() => cobertura(filtered, meta), [filtered, meta]);
  const suf = useMemo(() => suficiencia(cob.nucleo), [cob.nucleo]);
  const dists = useMemo(
    () => PERFIL_CAMPOS.map((_, i) => distribucion(filtered, meta, i)),
    [filtered, meta],
  );

  const sesgo = cob.indice < PERFIL_SESGO_PCT && cob.perfilados > 0;

  return (
    <div>
      <KpiGrid>
        <Kpi label="Leads en el recorte" value={cob.total.toLocaleString('es-CO')} meta="denominador de la cobertura" />
        <Kpi
          label="Perfilados"
          value={cob.perfilados.toLocaleString('es-CO')}
          meta="con al menos un campo diligenciado"
        />
        <Kpi
          label="Índice de perfilamiento"
          value={`${cob.indice.toFixed(1)}%`}
          meta={`${cob.perfilados} de ${cob.total}`}
        />
        <Kpi
          label="Núcleo completo"
          value={cob.nucleo.toLocaleString('es-CO')}
          meta="género + edad + interés + localidad"
        />
        <Kpi
          label="Suficiencia"
          value={<span style={{ color: suf.color }}>{suf.etiqueta}</span>}
          size="sm"
          meta={suf.mensaje}
        />
        <Kpi
          label="Campos activos"
          value={`${PERFIL_CAMPOS.length - cob.ausentes.length} / ${PERFIL_CAMPOS.length}`}
          meta={cob.ausentes.length ? 'hay campos que no existen en el CRM' : 'todos resueltos en Pipedrive'}
        />
      </KpiGrid>

      {sesgo ? (
        <p className="mt-3 rounded-md border border-[#f59e0b55] bg-[#f59e0b14] px-3 py-2 text-2xs leading-snug text-dim">
          <b>Sesgo de selección.</b> Con {cob.indice.toFixed(1)}% de perfilamiento, lo que sigue describe a quien el
          asesor <i>decidió</i> perfilar, no a quien consulta por el proyecto. Sirve para orientar hipótesis de pauta,
          no para cerrar una definición de público.
        </p>
      ) : null}

      {cob.ausentes.length ? (
        <p className="mt-2 rounded-md border border-[#f43f5e55] bg-[#f43f5e14] px-3 py-2 text-2xs leading-snug text-dim">
          <b>Campos no encontrados en Pipedrive:</b>{' '}
          {cob.ausentes.map((i) => PERFIL_CAMPOS[i].label).join(', ')}. Suele significar que el campo se borró y se
          volvió a crear en el CRM con otro nombre. Ajusta los <code>alias</code> de <code>PERFIL_CAMPOS</code> en
          <code> lib/config/negocio.ts</code>.
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold text-dim">Evolución del perfilamiento</h3>
        <p className="mb-2 text-2xs text-muted">
          La línea se lee contra las barras: el patrón conocido es que cuando entran más leads el equipo deja de
          perfilar. Un índice que cae en el mes de mayor volumen no es un problema de disciplina, es de capacidad.
        </p>
        <PerfilMensual leads={filtered} />
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold text-dim">Perfil por variable</h3>
        <p className="mb-3 text-2xs text-muted">
          Cada tarjeta muestra su propio <b>n</b>: el porcentaje se calcula sobre los tratos que tienen ese campo
          diligenciado, no sobre el total de leads del recorte.
        </p>
        {/* Trece variables: nueve en tres columnas y las cuatro últimas en
            cuatro, que es como Mercadeo pidió leerlas. Son dos rejillas y no
            una sola con `col-span`, porque el ancho de columna cambia entre
            los dos bloques y una sola rejilla no puede tener dos anchos. */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dists.slice(0, 9).map((d) => (
            <PerfilCard key={d.campo} dist={d} />
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dists.slice(9).map((d) => (
            <PerfilCard key={d.campo} dist={d} />
          ))}
        </div>
      </div>

      <div className="mt-8">
        <ExploradorPerfil leads={filtered} meta={meta} />
      </div>
    </div>
  );
}

/** Barras de leads + línea del índice de perfilamiento, mes a mes. */
function PerfilMensual({ leads }: { leads: Lead[] }) {
  const meses = useMemo(() => coberturaMensual(leads), [leads]);

  if (!meses.length) return <p className="text-xs text-muted">Sin leads para el filtro actual.</p>;

  const data: MixedData = {
    labels: meses.map((m) => monthLabel(m.month)),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Leads',
        data: meses.map((m) => m.total),
        backgroundColor: '#6366f166',
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'Perfilados',
        data: meses.map((m) => m.perfilados),
        backgroundColor: `${PERFIL_COLORS[0]}cc`,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Índice de perfilamiento',
        data: meses.map((m) => Number(m.indice.toFixed(1))),
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244,63,94,0.12)',
        yAxisID: 'y2',
        tension: 0.3,
        pointRadius: 4,
        order: 1,
      },
    ],
  };

  const options: MixedOptions = {
    plugins: {
      legend: legendBottom,
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.dataset.yAxisID === 'y2'
              ? ` Índice: ${(ctx.raw as number).toFixed(1)}%`
              : ` ${ctx.dataset.label}: ${ctx.raw as number}`,
        },
      },
    },
    scales: {
      x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
      y: {
        position: 'left',
        beginAtZero: true,
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR },
        title: { display: true, text: 'Leads', color: TICK_COLOR, font: { size: 10 } },
      },
      y2: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        grid: { display: false },
        ticks: { color: '#f43f5e', callback: (v) => `${v}%` },
        title: { display: true, text: 'Perfilamiento', color: '#f43f5e', font: { size: 10 } },
      },
    },
  };

  return (
    <ChartBox height={300}>
      <MixedChart data={data} options={options} />
    </ChartBox>
  );
}

/**
 * Una variable del perfil.
 *
 * La `viz` del campo decide la gráfica, y no es decoración: una dona con doce
 * localidades es ilegible, y una barra de dos categorías desperdicia la tarjeta.
 */
function PerfilCard({ dist }: { dist: Distribucion }) {
  if (dist.ausente) {
    return (
      <div className="rounded-lg border border-dashed border-[#d7dbe8] p-4">
        <div className="text-xs font-semibold text-dim">{dist.label}</div>
        <p className="mt-2 text-2xs leading-snug text-muted">
          El campo no existe hoy en Pipedrive con ninguno de los nombres que el dashboard busca.
        </p>
      </div>
    );
  }

  if (!dist.conDato) {
    return (
      <div className="rounded-lg border border-[#e8eaf2] p-4">
        <div className="text-xs font-semibold text-dim">{dist.label}</div>
        <p className="mt-2 text-2xs leading-snug text-muted">
          Ningún trato del recorte tiene este campo diligenciado.
        </p>
      </div>
    );
  }

  const colors = dist.items.map((_, i) => PERFIL_COLORS[i % PERFIL_COLORS.length]);
  const esDona = dist.viz === 'torta';
  const esRanking = dist.viz === 'ranking';

  return (
    <div className="rounded-lg border border-[#e8eaf2] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-dim">{dist.label}</span>
        <span className="text-2xs text-muted">n = {dist.conDato.toLocaleString('es-CO')}</span>
      </div>
      <p className="mb-2 mt-0.5 text-2xs text-muted">
        {PERFIL_GRUPO_LABEL[dist.grupo]} · {pct(dist.conDato, dist.conDato + dist.sinDato)}% de cobertura
        {dist.mediana !== undefined
          ? ` · mediana ${dist.campo === PERFIL_PRESUPUESTO ? fmtCOP(dist.mediana) : `${dist.mediana} m²`}`
          : ''}
      </p>

      <ChartBox height={esRanking ? 260 : 220}>
        {esDona ? (
          <Doughnut
            plugins={[pctLabelsDoughnut]}
            data={{
              labels: dist.items.map((i) => i.label),
              datasets: [
                {
                  data: dist.items.map((i) => i.n),
                  backgroundColor: colors.map((c) => `${c}cc`),
                  borderColor: '#fff',
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              plugins: {
                legend: legendBottom,
                // El denominador es el n de la tarjeta, no la suma de las
                // porciones dibujadas: en una dona son lo mismo, pero dejarlo
                // explícito evita que el día que se oculte una categoría los
                // porcentajes se recalculen solos y dejen de sumar 100.
                pctLabels: { total: dist.conDato, min: 3 },
                tooltip: {
                  callbacks: {
                    label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, dist.conDato)}%)`,
                  },
                },
              },
            }}
          />
        ) : (
          <Bar
            plugins={[pctLabelsBar]}
            data={{
              labels: dist.items.map((i) => i.label),
              datasets: [
                {
                  label: dist.label,
                  data: dist.items.map((i) => i.n),
                  backgroundColor: esRanking ? `${PERFIL_COLORS[1]}cc` : colors.map((c) => `${c}cc`),
                  borderRadius: 3,
                },
              ],
            }}
            options={{
              // El ranking va horizontal: "Suba" y "Chapinero" no caben de pie
              // en un eje de 12 categorías sin quedar en diagonal.
              indexAxis: esRanking ? ('y' as const) : ('x' as const),
              plugins: {
                legend: { display: false },
                // Aquí el `total` sí es indispensable: una barra en cero no
                // aporta a la suma de las barras, pero el porcentaje tiene que
                // seguir siendo sobre los tratos diligenciados del campo.
                pctLabels: { total: dist.conDato },
                tooltip: {
                  callbacks: {
                    // En barra horizontal el valor está en `x`; en vertical, en
                    // `y`. Chart.js tipa ambos como anulables, así que `?? 0`.
                    label: (c) => {
                      const n = (esRanking ? c.parsed.x : c.parsed.y) ?? 0;
                      return ` ${n} (${pct(n, dist.conDato)}%)`;
                    },
                  },
                },
              },
              // El porcentaje se dibuja por fuera de la barra: sin este margen
              // el texto de la barra más alta se corta contra el borde del
              // canvas. `grace` crece con los datos, un padding fijo no.
              layout: { padding: { top: 14, right: esRanking ? 46 : 8 } },
              scales: {
                x: {
                  grid: { color: GRID_COLOR },
                  ticks: { color: TICK_COLOR },
                  beginAtZero: true,
                  grace: esRanking ? '12%' : 0,
                },
                y: {
                  grid: { color: GRID_COLOR },
                  ticks: { color: TICK_COLOR, font: { size: 10 } },
                  beginAtZero: true,
                  grace: esRanking ? 0 : '12%',
                },
              },
            }}
          />
        )}
      </ChartBox>
    </div>
  );
}

/**
 * Explorador combinado — hasta tres variables del perfil a la vez.
 *
 * Es el sustituto de los tres cruces fijos que tenía el capítulo. La diferencia
 * no es de comodidad: un cruce fijo contesta la pregunta que alguien tuvo hace
 * un mes, y este contesta la que Mercadeo tenga hoy sin volver a tocar el
 * código.
 *
 * Tiene filtros propios, aparte de la barra principal, y los tres importan:
 *
 * · **Variables** (hasta 3). El tope no es técnico. Cada variable que se agrega
 *   multiplica las combinaciones y parte la base: con perfilamiento de dos
 *   dígitos bajos, un cruce de cuatro deja filas de un trato cada una. Tres ya
 *   está en el límite de lo que la muestra aguanta.
 * · **Mínimo de leads.** Corta la cola de combinaciones de 1 y 2 tratos, que es
 *   donde viven todos los 100% de cierre que no significan nada.
 * · **Orden.** Por volumen para ver dónde está el grueso; por tasa de cierre
 *   para buscar el segmento rentable — sólo tiene sentido con el mínimo puesto.
 */
function ExploradorPerfil({ leads, meta }: { leads: Lead[]; meta: Meta }) {
  const [sel, setSel] = useState<number[]>([PERFIL_GENERO, PERFIL_EDAD]);
  const [minN, setMinN] = useState(5);
  const [orden, setOrden] = useState<'volumen' | 'cierre'>('volumen');

  const { base, filas } = useMemo(() => combinaciones(leads, meta, sel), [leads, meta, sel]);

  const visibles = useMemo(() => {
    const f = filas.filter((r) => r.n >= minN);
    // La lógica ya devuelve ordenado por volumen; sólo hay que rehacerlo si se
    // pide por cierre, y ahí el desempate vuelve a ser el volumen.
    return orden === 'cierre' ? [...f].sort((a, b) => b.tasaCierre - a.tasaCierre || b.n - a.n) : f;
  }, [filas, minN, orden]);

  const cubiertos = visibles.reduce((acc, r) => acc + r.n, 0);
  const maxN = visibles.length ? Math.max(...visibles.map((r) => r.n)) : 0;

  /** Alterna una variable respetando el tope de tres. */
  const toggle = (i: number) =>
    setSel((cur) => {
      if (cur.includes(i)) return cur.filter((c) => c !== i);
      if (cur.length >= 3) return cur;
      return [...cur, i];
    });

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-dim">Explorador combinado</h3>
      <p className="mb-3 text-2xs text-muted">
        Cruza hasta tres variables del perfil y mira cada segmento con su conversión. Sólo entran los tratos que
        tienen <b>todas</b> las variables diligenciadas, así que la base cae al agregar la tercera: es la mecánica del
        cruce, no un problema del filtro.
      </p>

      <div className="rounded-lg border border-[#e8eaf2] p-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-dim">
            Variables ({sel.length} de 3)
          </span>
          {sel.length >= 3 ? (
            <span className="text-2xs text-muted">Quita una para poder cambiar la selección</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERFIL_CAMPOS.map((c, i) => {
            const on = sel.includes(i);
            const bloqueado = !on && sel.length >= 3;
            return meta.perfil[i]?.ausente ? null : (
              <button
                key={c.label}
                type="button"
                disabled={bloqueado}
                className={`pill ${on ? 'pill-clear' : ''} ${bloqueado ? 'opacity-40' : ''}`}
                onClick={() => toggle(i)}
              >
                {on ? `${sel.indexOf(i) + 1} · ` : ''}
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-dim">Mínimo de leads</span>
            {[1, 5, 10, 30].map((m) => (
              <button
                key={m}
                type="button"
                className={`pill ${m === minN ? 'pill-clear' : ''}`}
                onClick={() => setMinN(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-dim">Ordenar por</span>
            <button
              type="button"
              className={`pill ${orden === 'volumen' ? 'pill-clear' : ''}`}
              onClick={() => setOrden('volumen')}
            >
              Volumen
            </button>
            <button
              type="button"
              className={`pill ${orden === 'cierre' ? 'pill-clear' : ''}`}
              onClick={() => setOrden('cierre')}
            >
              % Cierre
            </button>
          </div>
        </div>
      </div>

      {!sel.length ? (
        <p className="mt-3 text-xs text-muted">Escoge al menos una variable para ver el cruce.</p>
      ) : (
        <>
          <p className="mb-2 mt-3 text-2xs text-muted">
            Base del cruce: <b>{base.toLocaleString('es-CO')}</b> tratos con las {sel.length} variables diligenciadas
            {base ? ` (${pct(base, leads.length)}% del recorte)` : ''} · {visibles.length} de {filas.length}{' '}
            combinaciones con {minN} lead(s) o más, que cubren {base ? pct(cubiertos, base) : '0.0'}% de la base.
          </p>

          <DataTable
            rows={visibles}
            maxHeight={420}
            empty={
              base
                ? `Ninguna combinación llega a ${minN} leads. Baja el mínimo o quita una variable.`
                : 'Ningún trato del recorte tiene todas estas variables diligenciadas al mismo tiempo.'
            }
            columns={[
              ...sel.map((c, j) => ({
                header: PERFIL_CAMPOS[c].label,
                cell: (r: (typeof visibles)[number]) => r.valores[j],
              })),
              {
                header: 'Leads',
                align: 'right' as const,
                // La barra de intensidad va dentro de la celda y no como gráfica
                // aparte: con 40 combinaciones una gráfica no se lee, y aquí el
                // ojo encuentra el grueso sin salir de la tabla.
                cell: (r: (typeof visibles)[number]) => (
                  <span className="relative inline-block min-w-[60px] px-1 text-right">
                    <span
                      className="absolute inset-y-0 right-0 rounded-sm"
                      style={{
                        width: maxN ? `${(r.n / maxN) * 100}%` : 0,
                        background: `${PERFIL_COLORS[0]}40`,
                      }}
                    />
                    <span className="relative font-semibold">{r.n}</span>
                  </span>
                ),
              },
              {
                header: '% base',
                align: 'right' as const,
                cell: (r: (typeof visibles)[number]) => `${r.pctBase.toFixed(1)}%`,
              },
              { header: 'Citas+', align: 'right' as const, cell: (r: (typeof visibles)[number]) => r.citas },
              { header: 'Visitas', align: 'right' as const, cell: (r: (typeof visibles)[number]) => r.visitas },
              {
                header: '% Visita',
                align: 'right' as const,
                cell: (r: (typeof visibles)[number]) => `${r.tasaVisita.toFixed(1)}%`,
              },
              { header: 'Cierres', align: 'right' as const, cell: (r: (typeof visibles)[number]) => r.cierres },
              {
                header: '% Cierre',
                align: 'right' as const,
                // Debajo de 30 respuestas la tasa es ruido. Se muestra apagada
                // en vez de esconderse, para que la combinación siga existiendo.
                cell: (r: (typeof visibles)[number]) => (
                  <span className={r.n < 30 ? 'text-muted' : 'font-semibold'}>
                    {r.tasaCierre.toFixed(1)}%{r.n < 30 ? ' *' : ''}
                  </span>
                ),
              },
            ]}
          />
          <p className="mt-2 text-2xs text-muted">
            * Menos de 30 respuestas: la tasa es indicativa, no concluyente.
          </p>
        </>
      )}
    </div>
  );
}
