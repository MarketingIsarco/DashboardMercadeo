'use client';

import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ChartBox } from '@/components/charts/ChartBox';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { DataTable } from '@/components/ui/DataTable';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { Section } from '@/components/ui/Section';
import {
  ADVISOR_COLORS,
  LOSS_GROUPS,
  LOSS_GROUP_COLORS,
  LOSS_GROUP_LABEL,
  SIN_MOTIVO,
  SIN_MOTIVO_COLOR,
  STAGES,
} from '@/lib/config/negocio';
import { firstName, pct } from '@/lib/format';
import { enrichGestion, todayISO } from '@/lib/gestion';
import {
  computeKpis,
  goalFor,
  isAbierto,
  isCita,
  isGanado,
  isPerdido,
  isSeparacion,
  isVisita,
} from '@/lib/selectors';
import type { TabProps } from '@/lib/selectors';
import type { Lead, LossGroup } from '@/lib/types';

// ── Helpers locales portados del HTML ────────────────────────────────

/**
 * Lunes ISO de la semana de `date` (`YYYY-MM-DD`). Se calcula sobre UTC para
 * que el resultado sea determinista entre servidor y cliente (evita el desfase
 * de zona horaria que tendría `new Date('...T00:00:00')` local + `toISOString`).
 */
function weekOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7; // Domingo (0) → 7
  dt.setUTCDate(dt.getUTCDate() - day + 1); // retrocede al lunes
  return dt.toISOString().slice(0, 10);
}

function weekLabel(week: string): string {
  const [, m, d] = week.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/**
 * `fmtAge`/`ageColor` del HTML trabajaban en MINUTOS. Ahora la antigüedad llega
 * como `l.ageDays` (días), así que la convertimos a minutos y reutilizamos los
 * mismos umbrales de bucket del original: <1h, 1h–24h, 1–7d, 7–30d, 30d+.
 */
function ageMinutes(l: Lead): number {
  return l.ageDays * 1440;
}

function fmtAge(min: number): string {
  if (min < 60) return `${Math.round(min)}min`;
  if (min < 1440) return `${(min / 60).toFixed(1)}h`;
  if (min < 10080) return `${Math.round(min / 1440)}d ${Math.round((min % 1440) / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

function ageColor(min: number, alpha: boolean): string {
  const s = alpha ? '66' : '';
  if (min < 1440) return `#4ade80${s}`;
  if (min < 10080) return `#22d3ee${s}`;
  if (min < 43200) return `#f59e0b${s}`;
  return `#f43f5e${s}`;
}

function ageBucket(min: number): number {
  return min < 60 ? 0 : min < 1440 ? 1 : min < 10080 ? 2 : min < 43200 ? 3 : 4;
}

// Colores de etapa (7 etapas). Los 6 primeros vienen del HTML; añadimos un gris
// para "Firma & Entrega", que el original no coloreaba.
const STAGE_BG = ['#6366f166', '#a78bfa66', '#f59e0b66', '#4ade8066', '#22d3ee66', '#c9a96e66', '#88888866'];
const STAGE_BRD = ['#6366f1', '#a78bfa', '#f59e0b', '#4ade80', '#22d3ee', '#c9a96e', '#888888'];

interface PresentAdvisor {
  name: string;
  short: string;
  i: number;
  color: string;
}

// ── Componente principal ─────────────────────────────────────────────

export function ComercialTab({ filtered, filters, meta }: TabProps) {
  const k = useMemo(() => computeKpis(filtered), [filtered]);

  // Sólo asesores con al menos un lead en el filtro actual. Reemplaza el hack
  // `i!==10&&i!==5` del HTML, que excluía índices a mano sobre una lista fija.
  const advisors = useMemo<PresentAdvisor[]>(
    () =>
      meta.advisors
        .map((name, i) => ({
          name,
          short: firstName(name),
          i,
          color: ADVISOR_COLORS[i % ADVISOR_COLORS.length],
        }))
        .filter((a) => filtered.some((l) => l.advisor === a.i)),
    [meta.advisors, filtered],
  );

  return (
    <>
      {/* 01 · KPIs Generales */}
      <Section
        title="01 · KPIs Generales"
        sub={`${filtered.length.toLocaleString('es-CO')} leads en el filtro actual`}
      >
        <KpiGrid>
          <Kpi label="Total Leads" value={k.total.toLocaleString('es-CO')} meta="Incluye activos, perdidos y ganados" />
          <Kpi label="Citas agendadas" value={k.citas} meta={`${pct(k.citas, k.total)}% del total`} />
          <Kpi label="Visitas realizadas" value={k.visitas} meta={`${pct(k.visitas, k.total)}% del total`} />
          <Kpi label="Tasa Lead→Cita" value={`${pct(k.citas, k.total)}%`} meta={`${k.citas} citas de ${k.total} leads`} />
          <Kpi
            label="Tasa Visita→Sep"
            value={`${pct(k.separaciones + k.ganados, k.visitas)}%`}
            meta={`${k.separaciones + k.ganados} cierres de ${k.visitas} visitas`}
          />
          <Kpi
            label="Separaciones+Cie."
            value={k.separaciones + k.ganados}
            meta={`${k.separaciones} sep · ${k.ganados} cierres formales`}
          />
          <Kpi label="Tasa de pérdida" value={`${pct(k.perdidos, k.total)}%`} meta={`${k.perdidos} perdidos de ${k.total}`} />
        </KpiGrid>
      </Section>

      {/* 02 · Gestión en Tiempo Real */}
      <Section
        title="02 · Gestión en Tiempo Real"
        sub="Estado del pipeline abierto hoy: qué lleva demasiado tiempo quieto y qué no tiene siguiente paso agendado"
      >
        <GestionTiempoReal leads={filtered} />
      </Section>

      {/* 03 · Gestión Comercial */}
      <Section title="03 · Gestión Comercial" sub="Actividad y eficiencia del equipo comercial">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Leads por Asesor</h3>
            <p className="mb-2 text-2xs text-muted">Leads · Contactados · Citas · Visitas · Cierres</p>
            <LeadsPorAsesor leads={filtered} advisors={advisors} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Cumplimiento de Visitas</h3>
            <p className="mb-2 text-2xs text-muted">Citas agendadas vs visitas realizadas por asesor</p>
            <Cumplimiento leads={filtered} filters={filters} kCitas={k.citas} kVisitas={k.visitas} advisors={advisors} />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold text-dim">Antigüedad del Pipeline por Etapa</h3>
          <p className="mb-2 text-2xs text-muted">Semana de creación de leads activos, agrupada por etapa actual</p>
          <WeeklyStage leads={filtered} />
          <p className="mt-2 text-2xs text-muted">
            Barras más antiguas (izquierda) con muchos &quot;Interesados&quot; indican leads acumulados sin avanzar.
          </p>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold text-dim">Tabla de Conversión por Asesor</h3>
          <p className="mb-2 text-2xs text-muted">Métricas de gestión y eficiencia individual</p>
          <TablaAsesor leads={filtered} advisors={advisors} />
        </div>
      </Section>

      {/* 04 · Antigüedad de Leads */}
      <Section title="04 · Antigüedad de Leads" sub="Tiempo de los leads abiertos dentro del pipeline">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Distribución por Antigüedad</h3>
            <p className="mb-2 text-2xs text-muted">Leads abiertos por rango de tiempo en el pipeline</p>
            <AgeDistribution leads={filtered} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Leads en Espera de Primer Contacto</h3>
            <p className="mb-2 text-2xs text-muted">Leads aún en &quot;Interesado&quot; sin contactar — por asesor</p>
            <EsperaContacto leads={filtered} advisors={advisors} />
          </div>
        </div>
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold text-dim">Aging de Pipeline por Asesor</h3>
          <p className="mb-2 text-2xs text-muted">Leads abiertos segmentados por rango de antigüedad (min · horas · días)</p>
          <AgingTable leads={filtered} advisors={advisors} />
        </div>
      </Section>

      {/* 05 · Negocios Perdidos */}
      <Section title="05 · Negocios Perdidos" sub="Dónde y por qué se pierden los leads">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Pérdida vs Ganados por Asesor</h3>
            <p className="mb-2 text-2xs text-muted">% de leads perdidos y ganados/sep sobre total gestionado</p>
            <PerdidaVsGanados leads={filtered} advisors={advisors} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Razones de Pérdida Generales</h3>
            <p className="mb-2 text-2xs text-muted">Distribución de motivos sobre el total de perdidos</p>
            <RazonesGenerales leads={filtered} lossReasons={meta.lossReasons} />
          </div>
        </div>
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold text-dim">Etapa de Pérdida por Asesor</h3>
          <p className="mb-2 text-2xs text-muted">En qué etapa del funnel se pierden los leads de cada asesor</p>
          <EtapaPerdida leads={filtered} advisors={advisors} />
        </div>
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold text-dim">Razones de Pérdida por Asesor</h3>
          <p className="mb-2 text-2xs text-muted">Principales motivos agrupados por asesor</p>
          <RazonesPorAsesor leads={filtered} advisors={advisors} />
        </div>
      </Section>
    </>
  );
}

// ── 02 · Gestión en tiempo real ──────────────────────────────────────

/**
 * Dos lecturas del pipeline abierto, deliberadamente separadas:
 *
 *  · "Vencidos" mide tiempo transcurrido sin movimiento contra el umbral que
 *    `ROTTEN_DAYS` le da a cada etapa y proyecto. Es un hecho.
 *  · "Sin actividad" mide si el asesor dejó agendado un siguiente paso. Es una
 *    intención.
 *
 * Un lead puede fallar en una y pasar la otra, y la acción correctiva difiere,
 * así que mezclarlas en un solo número escondería cuál de las dos está rota.
 */
function GestionTiempoReal({ leads }: { leads: Lead[] }) {
  const today = useMemo(() => todayISO(), []);
  const open = useMemo(() => leads.filter(isAbierto), [leads]);

  const rows = useMemo(() => {
    const enriched = enrichGestion(open, today);
    return STAGES.map((stage, si) => {
      const sub = enriched.filter((g) => g.lead.stage === si);
      const rotten = sub.filter((g) => g.isRotten);
      const auditados = sub.filter((g) => g.threshold !== null);
      const sinActividad = sub.filter((g) => g.activity === 'sin-registro');
      return {
        stage,
        total: sub.length,
        // "En tiempo": tiene umbral y todavía no lo superó. Los que no se
        // auditan (Tinguazul 1, o etapas sin umbral) van aparte para que la
        // fila cuadre y no se lean como si estuvieran bien gestionados.
        enTiempo: auditados.length - rotten.length,
        sinAuditar: sub.length - auditados.length,
        rotten: rotten.length,
        avgOverdue: rotten.length
          ? (rotten.reduce((s, g) => s + g.overdue, 0) / rotten.length).toFixed(1)
          : '–',
        conActividad: sub.length - sinActividad.length,
        sinActividad: sinActividad.length,
      };
    }).filter((r) => r.total > 0);
  }, [open, today]);

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-dim">Leads Vencidos por Etapa</h3>
      <p className="mb-2 text-2xs text-muted">
        Leads abiertos cuyo tiempo sin movimiento supera el límite de su etapa y proyecto (rotting). Corte al {today}.
      </p>
      <DataTable
        rows={rows}
        empty="Sin leads abiertos en el filtro actual."
        columns={[
          { header: 'Etapa', cell: (r) => <span className="font-semibold">{r.stage}</span> },
          { header: 'Abiertos', cell: (r) => r.total, align: 'right' },
          {
            header: 'En tiempo',
            align: 'right',
            cell: (r) => <span className="font-semibold text-[#16a34a]">{r.enTiempo || '–'}</span>,
          },
          {
            header: 'Vencidos',
            align: 'right',
            cell: (r) => <span className="font-bold text-red">{r.rotten || '–'}</span>,
          },
          {
            header: '% Vencidos',
            align: 'right',
            cell: (r) => (r.rotten ? <span className="font-bold text-red">{pct(r.rotten, r.total)}%</span> : '–'),
          },
          { header: 'Prom. días vencido', cell: (r) => r.avgOverdue, align: 'right' },
          {
            header: 'Sin auditar',
            align: 'right',
            cell: (r) => <span className="text-muted">{r.sinAuditar || '–'}</span>,
          },
        ]}
      />

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold text-dim">Actividad Pendiente por Etapa</h3>
        <p className="mb-2 text-2xs text-muted">
          Leads abiertos · Con actividad = tienen una fecha agendada en Pipedrive · Sin actividad = nadie definió el
          siguiente paso
        </p>
        <DataTable
          rows={rows}
          empty="Sin leads abiertos en el filtro actual."
          columns={[
            { header: 'Etapa', cell: (r) => <span className="font-semibold">{r.stage}</span> },
            { header: 'Abiertos', cell: (r) => r.total, align: 'right' },
            {
              header: 'Con actividad',
              align: 'right',
              cell: (r) => <span className="text-[#16a34a]">{r.conActividad}</span>,
            },
            {
              header: 'Sin actividad',
              align: 'right',
              cell: (r) => <span className="font-bold text-red">{r.sinActividad || '–'}</span>,
            },
            {
              header: '% Sin actividad',
              align: 'right',
              cell: (r) =>
                r.sinActividad ? <span className="font-bold text-red">{pct(r.sinActividad, r.total)}%</span> : '–',
            },
          ]}
        />
      </div>
    </div>
  );
}

// ── 03 · Gestión ─────────────────────────────────────────────────────

function LeadsPorAsesor({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  const rows = advisors.map((a) => {
    const af = leads.filter((l) => l.advisor === a.i);
    return {
      l: af.length,
      ct: af.filter((x) => x.stage >= 1).length,
      c: af.filter(isCita).length,
      v: af.filter(isVisita).length,
      // Sep+Cierres: separaciones + ganados formales, como sumaba el HTML.
      g: af.filter(isSeparacion).length + af.filter(isGanado).length,
    };
  });

  return (
    <ChartBox height={300}>
      <Bar
        data={{
          labels: advisors.map((a) => a.short),
          datasets: [
            { label: 'Leads', data: rows.map((r) => r.l), backgroundColor: '#6366f144', borderColor: '#6366f1', borderWidth: 2 },
            { label: 'Contactados', data: rows.map((r) => r.ct), backgroundColor: '#a78bfa44', borderColor: '#a78bfa', borderWidth: 2 },
            { label: 'Citas', data: rows.map((r) => r.c), backgroundColor: '#22d3ee44', borderColor: '#22d3ee', borderWidth: 2 },
            { label: 'Visitas', data: rows.map((r) => r.v), backgroundColor: '#4ade8044', borderColor: '#4ade80', borderWidth: 2 },
            { label: 'Sep+Cierres', data: rows.map((r) => r.g), backgroundColor: '#c9a96e44', borderColor: '#c9a96e', borderWidth: 2 },
          ],
        }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function Cumplimiento({
  leads,
  filters,
  kCitas,
  kVisitas,
  advisors,
}: {
  leads: Lead[];
  filters: TabProps['filters'];
  kCitas: number;
  kVisitas: number;
  advisors: PresentAdvisor[];
}) {
  const rows = advisors.map((a) => {
    const af = leads.filter((l) => l.advisor === a.i);
    const citas = af.filter(isCita).length;
    const vis = af.filter(isVisita).length;
    return { citas, vis, tasa: citas ? Number(pct(vis, citas)) : 0 };
  });

  // Meta mensual agregada de la constructora. `goalFor` devuelve null cuando no
  // hay meta comparable (p. ej. filtro sólo inmobiliaria): en ese caso no se
  // muestra cumplimiento, para no inventar un denominador. La meta es mensual;
  // si el filtro abarca varios meses, la escalamos por la cantidad de meses
  // distintos presentes (supuesto: la meta se repite igual cada mes).
  const goal = goalFor(filters);
  const months = new Set(leads.map((l) => l.month)).size || 1;
  const metaCitas = goal ? goal.citas * months : null;
  const metaVisitas = goal ? goal.visitas * months : null;

  return (
    <>
      {goal && metaCitas !== null && metaVisitas !== null ? (
        <div className="mb-2 flex flex-wrap gap-4 text-2xs text-muted">
          <span>
            Meta citas ({months} {months === 1 ? 'mes' : 'meses'}): <b className="text-text">{metaCitas}</b> · logradas{' '}
            <b style={{ color: '#6366f1' }}>{kCitas}</b> ({pct(kCitas, metaCitas)}%)
          </span>
          <span>
            Meta visitas: <b className="text-text">{metaVisitas}</b> · logradas{' '}
            <b style={{ color: '#16a34a' }}>{kVisitas}</b> ({pct(kVisitas, metaVisitas)}%)
          </span>
        </div>
      ) : null}
      <ChartBox height={goal ? 268 : 300}>
        <Bar
          data={{
            labels: advisors.map((a) => a.short),
            datasets: [
              { label: 'Citas agendadas', data: rows.map((r) => r.citas), backgroundColor: '#6366f144', borderColor: '#6366f1', borderWidth: 2 },
              { label: 'Visitas realizadas', data: rows.map((r) => r.vis), backgroundColor: '#4ade8066', borderColor: '#4ade80', borderWidth: 2 },
            ],
          }}
          options={{
            plugins: {
              legend: legendBottom,
              tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: { afterBody: (items) => `Efectividad cita→visita: ${rows[items[0].dataIndex]?.tasa ?? 0}%` },
              },
            },
            scales: {
              x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
              y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            },
          }}
        />
      </ChartBox>
    </>
  );
}

function WeeklyStage({ leads }: { leads: Lead[] }) {
  // Sólo leads abiertos, agrupados por semana de creación + etapa actual.
  const open = leads.filter(isAbierto);
  const weeks = [...new Set(open.map((l) => weekOf(l.date)))].sort();
  const datasets = STAGES.map((s, si) => ({
    label: s,
    data: weeks.map((w) => open.filter((l) => l.stage === si && weekOf(l.date) === w).length),
    backgroundColor: STAGE_BG[si],
    borderColor: STAGE_BRD[si],
    borderWidth: 1,
  })).filter((d) => d.data.some((v) => v > 0));

  return (
    <ChartBox height={320}>
      <Bar
        data={{ labels: weeks.map(weekLabel), datasets }}
        options={{
          plugins: {
            legend: { ...legendBottom, labels: { ...legendBottom.labels, padding: 6, font: { size: 10 } } },
            tooltip: {
              mode: 'index',
              callbacks: {
                afterBody: (items) => {
                  const tot = items.reduce((s, it) => s + (it.raw as number), 0);
                  return tot ? `Total semana: ${tot}` : '';
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, maxRotation: 45 } },
            y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function TablaAsesor({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  const rows = advisors.map((a) => {
    const af = leads.filter((l) => l.advisor === a.i);
    const total = af.length;
    const citas = af.filter(isCita).length;
    const vis = af.filter(isVisita).length;
    const sep = af.filter(isSeparacion).length;
    const gan = af.filter(isGanado).length;
    const per = af.filter(isPerdido).length;
    return {
      name: a.short,
      total,
      citas,
      vis,
      sepCie: sep + gan,
      per,
      tLC: pct(citas, total),
      tCV: pct(vis, citas || 1),
      tVS: pct(sep + gan, vis || 1),
      tPer: pct(per, total),
    };
  });

  return (
    <DataTable
      rows={rows}
      columns={[
        { header: 'Asesor', cell: (r) => <b>{r.name}</b> },
        { header: 'Leads', cell: (r) => r.total, align: 'right' },
        { header: 'Citas', cell: (r) => r.citas, align: 'right' },
        { header: 'Visitas', cell: (r) => r.vis, align: 'right' },
        { header: 'Sep+Cie', cell: (r) => r.sepCie, align: 'right' },
        {
          header: 'Perdidos',
          align: 'right',
          cell: (r) => (
            <span style={Number(r.tPer) > 70 ? { color: '#f43f5e', fontWeight: 700 } : undefined}>{r.per}</span>
          ),
        },
        { header: 'L→Cita', cell: (r) => `${r.tLC}%`, align: 'right' },
        {
          header: 'C→Visita',
          align: 'right',
          cell: (r) => (
            <span style={Number(r.tCV) > 60 ? { color: '#16a34a', fontWeight: 700 } : undefined}>{r.tCV}%</span>
          ),
        },
        {
          header: 'V→Sep',
          align: 'right',
          cell: (r) => (
            <span style={Number(r.tVS) > 20 ? { color: '#16a34a', fontWeight: 700 } : undefined}>{r.tVS}%</span>
          ),
        },
        {
          header: 'Pérdida',
          align: 'right',
          cell: (r) => (
            <span style={Number(r.tPer) > 70 ? { color: '#f43f5e', fontWeight: 700 } : undefined}>{r.tPer}%</span>
          ),
        },
      ]}
    />
  );
}

// ── 03 · Antigüedad ──────────────────────────────────────────────────

function AgeDistribution({ leads }: { leads: Lead[] }) {
  // La distribución sólo tiene sentido sobre leads abiertos, como el original.
  const open = leads.filter(isAbierto);
  const buckets = ['< 1 hora', '1h–24h', '1–7 días', '7–30 días', '30d+'];
  const colors = ['#4ade80', '#22d3ee', '#f59e0b', '#f97316', '#f43f5e'];
  const counts = [0, 0, 0, 0, 0];
  open.forEach((l) => {
    counts[ageBucket(ageMinutes(l))] += 1;
  });
  const total = open.length || 1;

  return (
    <ChartBox height={280}>
      <Doughnut
        data={{
          labels: buckets,
          datasets: [{ data: counts, backgroundColor: colors.map((c) => `${c}66`), borderColor: colors, borderWidth: 2 }],
        }}
        options={{
          plugins: {
            legend: { ...legendBottom, labels: { ...legendBottom.labels, padding: 6, font: { size: 10 } } },
            tooltip: {
              callbacks: { label: (c) => `${c.label}: ${c.raw as number} leads (${pct(c.raw as number, total)}%)` },
            },
          },
        }}
      />
    </ChartBox>
  );
}

function EsperaContacto({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  // Leads en espera: Interesado (stage 0) + abiertos (nunca contactados).
  const espera = leads.filter((l) => l.stage === 0 && isAbierto(l));
  const rows = advisors
    .map((a) => {
      const af = espera.filter((l) => l.advisor === a.i);
      if (!af.length) return null;
      const mins = af.map(ageMinutes);
      const avg = Math.round(mins.reduce((s, v) => s + v, 0) / af.length);
      const sorted = [...mins].sort((x, y) => x - y);
      const med = sorted[Math.floor(af.length / 2)];
      return { label: `${a.short} (${af.length})`, avg, med };
    })
    .filter((r): r is { label: string; avg: number; med: number } => r !== null);

  if (rows.length === 0) {
    return <p className="mt-2 text-xs text-muted">Ningún lead en espera de primer contacto en el filtro actual.</p>;
  }

  return (
    <ChartBox height={280}>
      <Bar
        data={{
          labels: rows.map((r) => r.label),
          datasets: [
            {
              label: 'Espera promedio sin contactar',
              data: rows.map((r) => Number((r.avg / 60).toFixed(1))),
              backgroundColor: rows.map((r) => ageColor(r.avg, true)),
              borderColor: rows.map((r) => ageColor(r.avg, false)),
              borderWidth: 2,
            },
          ],
        }}
        options={{
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (c) => `Promedio: ${fmtAge(rows[c.dataIndex].avg)}  |  Mediana: ${fmtAge(rows[c.dataIndex].med)}` },
            },
          },
          scales: {
            x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: {
              beginAtZero: true,
              grid: { color: GRID_COLOR },
              ticks: { color: TICK_COLOR, callback: (v) => (Number(v) >= 24 ? `${Math.round(Number(v) / 24)}d` : `${v}h`) },
              title: { display: true, text: 'Horas en espera (sin primer contacto)', color: TICK_COLOR, font: { size: 10 } },
            },
          },
        }}
      />
    </ChartBox>
  );
}

function AgingTable({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  const open = leads.filter(isAbierto);
  const rows = advisors
    .map((a) => {
      const af = open.filter((l) => l.advisor === a.i);
      if (!af.length) return null;
      const mins = af.map(ageMinutes);
      const bucks = [0, 0, 0, 0, 0];
      mins.forEach((m) => {
        bucks[ageBucket(m)] += 1;
      });
      const avg = Math.round(mins.reduce((s, v) => s + v, 0) / af.length);
      return { name: a.short, total: af.length, bucks, avg, min: Math.min(...mins), max: Math.max(...mins) };
    })
    .filter((r): r is { name: string; total: number; bucks: number[]; avg: number; min: number; max: number } => r !== null);

  return (
    <DataTable
      rows={rows}
      columns={[
        { header: 'Asesor', cell: (r) => <b>{r.name}</b> },
        { header: 'Abiertos', cell: (r) => r.total, align: 'right' },
        { header: '<1h', cell: (r) => <span style={{ color: '#16a34a' }}>{r.bucks[0]}</span>, align: 'right' },
        { header: '1h–24h', cell: (r) => <span style={{ color: '#22d3ee' }}>{r.bucks[1]}</span>, align: 'right' },
        { header: '1–7d', cell: (r) => <span style={{ color: '#f59e0b' }}>{r.bucks[2]}</span>, align: 'right' },
        { header: '7–30d', cell: (r) => <span style={{ color: '#f97316' }}>{r.bucks[3]}</span>, align: 'right' },
        { header: '30d+', cell: (r) => <span style={{ color: '#f43f5e' }}>{r.bucks[4]}</span>, align: 'right' },
        { header: 'Promedio', cell: (r) => <b style={{ color: ageColor(r.avg, false) }}>{fmtAge(r.avg)}</b>, align: 'right' },
        { header: 'Más reciente', cell: (r) => <span style={{ color: '#16a34a' }}>{fmtAge(r.min)}</span>, align: 'right' },
        { header: 'Más antiguo', cell: (r) => <span style={{ color: '#f43f5e' }}>{fmtAge(r.max)}</span>, align: 'right' },
      ]}
    />
  );
}

// ── 04 · Perdidos ────────────────────────────────────────────────────

function PerdidaVsGanados({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  const rows = advisors
    .map((a) => {
      const af = leads.filter((l) => l.advisor === a.i);
      const lost = af.filter(isPerdido).length;
      const won = af.filter((l) => isSeparacion(l) || isGanado(l)).length;
      return {
        name: a.short,
        n: af.length,
        tasaPer: af.length ? Number(pct(lost, af.length)) : 0,
        tasaGan: af.length ? Number(pct(won, af.length)) : 0,
      };
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.tasaPer - a.tasaPer);

  return (
    <ChartBox height={280}>
      <Bar
        data={{
          labels: rows.map((r) => r.name),
          datasets: [
            {
              label: '% Pérdida',
              data: rows.map((r) => r.tasaPer),
              backgroundColor: rows.map((r) => (r.tasaPer > 70 ? '#f43f5e44' : r.tasaPer > 50 ? '#f59e0b44' : '#4ade8022')),
              borderColor: rows.map((r) => (r.tasaPer > 70 ? '#f43f5e' : r.tasaPer > 50 ? '#f59e0b' : '#4ade80')),
              borderWidth: 2,
            },
            { label: '% Ganados/Sep', data: rows.map((r) => r.tasaGan), backgroundColor: '#4ade8044', borderColor: '#4ade80', borderWidth: 2 },
          ],
        }}
        options={{
          plugins: {
            legend: legendBottom,
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: { label: (c) => `${c.dataset.label}: ${c.raw as number}% (${rows[c.dataIndex]?.n ?? 0} leads)` },
            },
          },
          scales: {
            x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { beginAtZero: true, max: 100, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, callback: (v) => `${v}%` } },
          },
        }}
      />
    </ChartBox>
  );
}

function RazonesGenerales({ leads, lossReasons }: { leads: Lead[]; lossReasons: string[] }) {
  const lost = leads.filter(isPerdido);
  const total = lost.length || 1;

  // Torta por grupo. Los perdidos sin motivo registrado van en su propia porción:
  // no son "Otro" (motivo registrado que no encajó), son un hueco de dato.
  const sinMotivo = lost.filter((l) => l.lossGroup === '').length;
  const gLabels = [...LOSS_GROUPS.map((g) => LOSS_GROUP_LABEL[g]), SIN_MOTIVO];
  const gCounts = [...LOSS_GROUPS.map((g) => lost.filter((l) => l.lossGroup === g).length), sinMotivo];
  const gColors = [...LOSS_GROUPS.map((g) => LOSS_GROUP_COLORS[g]), SIN_MOTIVO_COLOR];

  // Recuperables vs pérdidas duras.
  const recuperables = lost.filter((l) => l.recoverable).length;
  const duras = lost.length - recuperables;

  // Motivos específicos (por `lossReason`). Los `-1` (asesor no registró motivo)
  // se muestran como "Sin motivo registrado" en vez de omitirse.
  const reasonCounts = new Map<number, number>();
  lost.forEach((l) => reasonCounts.set(l.lossReason, (reasonCounts.get(l.lossReason) ?? 0) + 1));
  const topReasons = [...reasonCounts.entries()]
    .map(([idx, n]) => ({ label: idx === -1 ? 'Sin motivo registrado' : lossReasons[idx] ?? `#${idx}`, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  return (
    <>
      <ChartBox height={260}>
        <Doughnut
          data={{
            labels: gLabels,
            datasets: [
              {
                data: gCounts,
                backgroundColor: gColors.map((c) => `${c}66`),
                borderColor: gColors,
                borderWidth: 2,
              },
            ],
          }}
          options={{
            plugins: {
              legend: legendBottom,
              tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, total)}%)` } },
            },
          }}
        />
      </ChartBox>
      <p className="mt-2 text-2xs text-muted">
        <b style={{ color: '#4ade80' }}>{recuperables}</b> recuperables ·{' '}
        <b style={{ color: '#f43f5e' }}>{duras}</b> pérdidas duras · de {lost.length} perdidos
      </p>
      {topReasons.length > 0 ? (
        <div className="mt-3">
          <h4 className="mb-1 text-2xs font-semibold text-dim">Motivos específicos más frecuentes</h4>
          <DataTable
            rows={topReasons}
            columns={[
              { header: 'Motivo', cell: (r) => r.label },
              { header: 'Perdidos', cell: (r) => r.n, align: 'right' },
              { header: '%', cell: (r) => `${pct(r.n, lost.length)}%`, align: 'right' },
            ]}
          />
        </div>
      ) : null}
    </>
  );
}

function EtapaPerdida({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  const lost = leads.filter(isPerdido);
  const datasets = STAGES.map((s, si) => ({
    label: s,
    data: advisors.map((a) => lost.filter((l) => l.advisor === a.i && l.stage === si).length),
    backgroundColor: STAGE_BG[si],
    borderColor: STAGE_BRD[si],
    borderWidth: 1,
  })).filter((d) => d.data.some((v) => v > 0));

  return (
    <ChartBox height={300}>
      <Bar
        data={{ labels: advisors.map((a) => a.short), datasets }}
        options={{
          plugins: {
            legend: { ...legendBottom, labels: { ...legendBottom.labels, padding: 6, font: { size: 10 } } },
            tooltip: { mode: 'index' },
          },
          scales: {
            x: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

interface AdvisorLossRow {
  name: string;
  total: number;
  counts: Record<LossGroup, number>;
  sinMotivo: number;
  /** `null` cuando el asesor no registró el motivo de ninguna pérdida. */
  top: LossGroup | null;
}

function RazonesPorAsesor({ leads, advisors }: { leads: Lead[]; advisors: PresentAdvisor[] }) {
  const rows = advisors
    .map((a): AdvisorLossRow | null => {
      const af = leads.filter((l) => l.advisor === a.i && isPerdido(l));
      if (!af.length) return null;

      const counts = {} as Record<LossGroup, number>;
      LOSS_GROUPS.forEach((g) => {
        counts[g] = 0;
      });
      let sinMotivo = 0;
      af.forEach((l) => {
        if (l.lossGroup === '') sinMotivo += 1;
        else counts[l.lossGroup] += 1;
      });

      // "Principal razón" se elige sólo entre motivos realmente registrados:
      // "no lo registró" no es una razón de pérdida y ganaría por goleada.
      const registrados = LOSS_GROUPS.filter((g) => counts[g] > 0);
      const top = registrados.length
        ? registrados.reduce((best, g) => (counts[g] > counts[best] ? g : best), registrados[0])
        : null;

      return { name: a.short, total: af.length, counts, sinMotivo, top };
    })
    .filter((r): r is AdvisorLossRow => r !== null);

  return (
    <DataTable
      rows={rows}
      columns={[
        { header: 'Asesor', cell: (r) => <b>{r.name}</b> },
        { header: 'Perdidos', cell: (r) => r.total, align: 'right' },
        ...LOSS_GROUPS.map((g) => ({
          header: LOSS_GROUP_LABEL[g],
          align: 'right' as const,
          cell: (r: AdvisorLossRow) => (
            <span>
              <span style={{ color: LOSS_GROUP_COLORS[g] }}>{r.counts[g]}</span>{' '}
              <small className="text-muted">({pct(r.counts[g], r.total)}%)</small>
            </span>
          ),
        })),
        {
          header: SIN_MOTIVO,
          align: 'right' as const,
          cell: (r) => (
            <span>
              <span style={{ color: SIN_MOTIVO_COLOR }}>{r.sinMotivo}</span>{' '}
              <small className="text-muted">({pct(r.sinMotivo, r.total)}%)</small>
            </span>
          ),
        },
        {
          header: 'Principal razón',
          cell: (r) =>
            r.top ? (
              <span
                className="rounded-full px-2 py-0.5 text-2xs font-semibold"
                style={{ background: `${LOSS_GROUP_COLORS[r.top]}22`, color: LOSS_GROUP_COLORS[r.top] }}
              >
                {LOSS_GROUP_LABEL[r.top]}
              </span>
            ) : (
              <span className="text-2xs text-muted">—</span>
            ),
        },
      ]}
    />
  );
}
