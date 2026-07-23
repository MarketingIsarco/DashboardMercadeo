'use client';

import { useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ChartBox } from '@/components/charts/ChartBox';
import { MixedChart } from '@/components/charts/MixedChart';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { DataTable } from '@/components/ui/DataTable';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { Section } from '@/components/ui/Section';
import {
  ADVISOR_COLORS,
  SOURCE_COLORS,
  SOURCE_FALLBACK,
  STAGES,
} from '@/lib/config/negocio';
import { firstName, monthLabel, pct, pctNum } from '@/lib/format';
import {
  computeKpis,
  goalFor,
  isCita,
  isPerdido,
  isVenta,
  isVisita,
  keyOf,
  timeAxis,
} from '@/lib/selectors';
import type { TabProps } from '@/lib/selectors';
import type { Lead, SaleDeal } from '@/lib/types';

const FUNNEL_COLORS = ['#6366f1', '#a78bfa', '#f59e0b', '#4ade80', '#22d3ee', '#c9a96e'];

function sourceColor(name: string): string {
  return SOURCE_COLORS[name] ?? SOURCE_FALLBACK;
}

export function ResultadosTab({ data, filtered, filters, meta }: TabProps) {
  const [advisorFilter, setAdvisorFilter] = useState<number | null>(null);

  const k = useMemo(() => computeKpis(filtered), [filtered]);
  const goal = useMemo(() => goalFor(filters), [filters]);

  const ventas = useMemo(() => filtered.filter(isVenta), [filtered]);
  const perdidos = useMemo(() => filtered.filter(isPerdido), [filtered]);

  const tasaCierre = pctNum(ventas.length, filtered.length);

  /**
   * Las metas de volumen (leads, citas, visitas) son mensuales. Contrastarlas
   * contra un acumulado de varios meses da porcentajes sin sentido (+956 %),
   * así que el delta sólo aparece cuando el filtro deja un único mes a la vista.
   * La tasa de cierre sí es comparable en cualquier rango: es una razón, no un conteo.
   */
  const unSoloMes = useMemo(() => new Set(filtered.map((l) => l.month)).size === 1, [filtered]);
  const metaVolumen = unSoloMes ? goal : null;

  return (
    <>
      <Section
        title="01 · Indicadores Generales"
        sub={`${filtered.length.toLocaleString('es-CO')} leads en el filtro actual`}
      >
        <KpiGrid>
          <Kpi
            label="Leads"
            value={k.total.toLocaleString('es-CO')}
            meta={goal ? `Meta ${goal.leads}/mes` : undefined}
            delta={metaVolumen ? pctNum(k.total - metaVolumen.leads, metaVolumen.leads) : null}
          />
          <Kpi
            label="Citas"
            value={k.citas}
            meta={`${pct(k.citas, k.total)}% de leads`}
            delta={metaVolumen ? pctNum(k.citas - metaVolumen.citas, metaVolumen.citas) : null}
          />
          <Kpi
            label="Visitas"
            value={k.visitas}
            meta={`${pct(k.visitas, k.total)}% de leads`}
            delta={metaVolumen ? pctNum(k.visitas - metaVolumen.visitas, metaVolumen.visitas) : null}
          />
          <Kpi label="Separaciones" value={k.separaciones} meta={`${pct(k.separaciones, k.total)}% de leads`} />
          <Kpi label="Ventas" value={ventas.length} meta="Separación + Ganados" />
          <Kpi
            label="Tasa de cierre"
            value={`${tasaCierre.toFixed(2)}%`}
            meta={goal ? `Meta ${goal.tasa.toFixed(2)}%` : undefined}
            delta={goal ? tasaCierre - goal.tasa : null}
            deltaSuffix=" pp"
          />
          <Kpi
            label="Cierres proyectados"
            value={k.cierresProyectados}
            sub={`${k.enNegociacion} en negociación · ${k.enSeparacion} en separación`}
          />
        </KpiGrid>
      </Section>

      <Section title="02 · Embudo de Conversión" sub="Leads que alcanzaron cada etapa, acumulado">
        <div className="grid gap-5 lg:grid-cols-2">
          <Funnel leads={filtered} />
          <ConversionTable
            leads={filtered}
            advisors={meta.advisors}
            advisorFilter={advisorFilter}
            onAdvisorChange={setAdvisorFilter}
          />
        </div>
      </Section>

      <Section title="03 · Análisis de Ventas" sub="Composición de las ventas del periodo">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Digital vs. No digital</h3>
            <DigitalDonut ventas={ventas} digitalSources={meta.digitalSources} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Ventas vs. pérdidas por fuente</h3>
            <SourceWinLoss ventas={ventas} perdidos={perdidos} sources={meta.sources} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Ventas por asesor</h3>
            <SalesByAdvisor ventas={ventas} advisors={meta.advisors} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Ventas por proyecto</h3>
            <SalesByProject ventas={ventas} projects={meta.projects} />
          </div>
        </div>
      </Section>

      <Section title="04 · Tendencias" sub="Evolución del embudo y contraste ventas / pérdidas">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Ventas, visitas y citas</h3>
            <TrendChart leads={filtered} period={filters.period} goalCierres={goal?.cierres ?? null} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Mix de fuentes en ventas</h3>
            <SourceMix ventas={ventas} sources={meta.sources} />
          </div>
        </div>
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold text-dim">Ventas vs. pérdidas por periodo</h3>
          <WinLossTrend leads={filtered} period={filters.period} goalCierres={goal?.cierres ?? null} />
        </div>
      </Section>

      <SalesTable sales={data.sales} filtered={filtered} />
    </>
  );
}

function Funnel({ leads }: { leads: Lead[] }) {
  const stages = STAGES.slice(0, 6);
  const counts = stages.map((_, si) => leads.filter((l) => l.stage >= si).length);
  const total = counts[0] || 1;

  return (
    <ChartBox height={260}>
      <Bar
        data={{
          labels: [...stages],
          datasets: [
            {
              label: 'Leads',
              data: counts,
              backgroundColor: FUNNEL_COLORS.map((c) => `${c}55`),
              borderColor: FUNNEL_COLORS,
              borderWidth: 2,
            },
          ],
        }}
        options={{
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => `${c.raw as number} leads (${pct(c.raw as number, total)}% del total)`,
              },
            },
          },
          scales: {
            x: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { grid: { display: false }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function ConversionTable({
  leads,
  advisors,
  advisorFilter,
  onAdvisorChange,
}: {
  leads: Lead[];
  advisors: string[];
  advisorFilter: number | null;
  onAdvisorChange: (i: number | null) => void;
}) {
  const present = advisors
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => leads.some((l) => l.advisor === i));

  const sub = advisorFilter !== null ? leads.filter((l) => l.advisor === advisorFilter) : leads;
  const total = sub.length || 1;

  const rows = STAGES.slice(0, 6).map((stage, si) => {
    const n = sub.filter((l) => l.stage >= si).length;
    const prev = si === 0 ? total : sub.filter((l) => l.stage >= si - 1).length || 1;
    return { stage, n, pTot: pct(n, total), pPrev: si === 0 ? '100.0' : pct(n, prev) };
  });

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`pill ${advisorFilter === null ? 'pill-gold' : ''}`}
          onClick={() => onAdvisorChange(null)}
        >
          Todos
        </button>
        {present.map(({ name, i }) => (
          <button
            key={i}
            type="button"
            className={`pill ${advisorFilter === i ? 'pill-gold' : ''}`}
            onClick={() => onAdvisorChange(advisorFilter === i ? null : i)}
          >
            {firstName(name)}
          </button>
        ))}
      </div>

      <DataTable
        rows={rows}
        columns={[
          { header: 'Etapa', cell: (r) => <b>{r.stage}</b> },
          { header: 'N', cell: (r) => r.n, align: 'right' },
          { header: '% del total', cell: (r) => `${r.pTot}%`, align: 'right' },
          { header: '% etapa anterior', cell: (r) => `${r.pPrev}%`, align: 'right' },
          {
            header: 'Avance',
            cell: (r) => (
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-grid">
                <div className="h-full rounded-full bg-accent" style={{ width: `${r.pTot}%` }} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function DigitalDonut({ ventas, digitalSources }: { ventas: Lead[]; digitalSources: number[] }) {
  const set = new Set(digitalSources);
  const dig = ventas.filter((l) => set.has(l.source)).length;
  const noDig = ventas.length - dig;
  const total = ventas.length || 1;

  return (
    <ChartBox>
      <Doughnut
        data={{
          labels: ['Digital', 'No digital'],
          datasets: [
            {
              data: [dig, noDig],
              backgroundColor: ['#6366f166', '#f59e0b66'],
              borderColor: ['#6366f1', '#f59e0b'],
              borderWidth: 2,
            },
          ],
        }}
        options={{
          plugins: {
            legend: legendBottom,
            tooltip: {
              callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, total)}%)` },
            },
          },
        }}
      />
    </ChartBox>
  );
}

function SourceWinLoss({
  ventas,
  perdidos,
  sources,
}: {
  ventas: Lead[];
  perdidos: Lead[];
  sources: string[];
}) {
  const rows = sources
    .map((name, i) => ({
      name,
      v: ventas.filter((l) => l.source === i).length,
      p: perdidos.filter((l) => l.source === i).length,
    }))
    .filter((r) => r.v > 0 || r.p > 0)
    .sort((a, b) => b.v + b.p - (a.v + a.p))
    .slice(0, 8);

  return (
    <ChartBox>
      <Bar
        data={{
          labels: rows.map((r) => r.name),
          datasets: [
            { label: 'Ventas', data: rows.map((r) => r.v), backgroundColor: '#4ade8066', borderColor: '#4ade80', borderWidth: 2 },
            { label: 'Pérdidas', data: rows.map((r) => r.p), backgroundColor: '#f43f5e44', borderColor: '#f43f5e', borderWidth: 2 },
          ],
        }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: TICK_COLOR, maxRotation: 45, minRotation: 30 } },
            y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function SalesByAdvisor({ ventas, advisors }: { ventas: Lead[]; advisors: string[] }) {
  const rows = advisors
    .map((name, i) => ({ name: firstName(name), n: ventas.filter((l) => l.advisor === i).length, i }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <ChartBox>
      <Bar
        data={{
          labels: rows.map((r) => r.name),
          datasets: [
            {
              label: 'Ventas',
              data: rows.map((r) => r.n),
              backgroundColor: rows.map((r) => `${ADVISOR_COLORS[r.i % ADVISOR_COLORS.length]}66`),
              borderColor: rows.map((r) => ADVISOR_COLORS[r.i % ADVISOR_COLORS.length]),
              borderWidth: 2,
            },
          ],
        }}
        options={{
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, precision: 0 } },
            y: { grid: { display: false }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function SalesByProject({ ventas, projects }: { ventas: Lead[]; projects: string[] }) {
  const rows = projects
    .map((name, i) => ({ name, n: ventas.filter((l) => l.project === i).length }))
    .filter((r) => r.n > 0);
  const total = ventas.length || 1;
  const palette = ['#0e6680', '#c9a96e', '#6366f1', '#22d3ee', '#4ade80', '#f97316', '#a78bfa', '#f43f5e'];

  return (
    <ChartBox>
      <Doughnut
        data={{
          labels: rows.map((r) => r.name),
          datasets: [
            {
              data: rows.map((r) => r.n),
              backgroundColor: rows.map((_, i) => `${palette[i % palette.length]}66`),
              borderColor: rows.map((_, i) => palette[i % palette.length]),
              borderWidth: 2,
            },
          ],
        }}
        options={{
          plugins: {
            legend: legendBottom,
            tooltip: {
              callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, total)}%)` },
            },
          },
        }}
      />
    </ChartBox>
  );
}

function TrendChart({
  leads,
  period,
  goalCierres,
}: {
  leads: Lead[];
  period: 'month' | 'year';
  goalCierres: number | null;
}) {
  const ta = timeAxis(leads, period);
  const buckets = ta.keys.map((key) => {
    const rows = leads.filter((l) => keyOf(l, ta.isYear) === key);
    return {
      v: rows.filter(isVenta).length,
      vis: rows.filter(isVisita).length,
      c: rows.filter(isCita).length,
    };
  });

  return (
    <ChartBox height={280}>
      <MixedChart
        data={{
          labels: ta.keys.map((k) => (ta.isYear ? k : monthLabel(k))),
          datasets: [
            { type: 'bar' as const, label: 'Ventas', data: buckets.map((b) => b.v), backgroundColor: '#c9a96e44', borderColor: '#c9a96e', borderWidth: 2, order: 3 },
            { type: 'line' as const, label: 'Visitas', data: buckets.map((b) => b.vis), borderColor: '#4ade80', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 4, tension: 0.3, order: 1 },
            { type: 'line' as const, label: 'Citas', data: buckets.map((b) => b.c), borderColor: '#22d3ee', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 4, tension: 0.3, order: 1 },
            ...(goalCierres !== null
              ? [{
                  type: 'line' as const,
                  label: 'Meta ventas',
                  data: buckets.map(() => goalCierres),
                  borderColor: '#c9a96eaa',
                  borderDash: [5, 4],
                  pointRadius: 0,
                  borderWidth: 1.5,
                  backgroundColor: 'transparent',
                  order: 2,
                }]
              : []),
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

function SourceMix({ ventas, sources }: { ventas: Lead[]; sources: string[] }) {
  const rows = sources
    .map((name, i) => ({ name, n: ventas.filter((l) => l.source === i).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const total = ventas.length || 1;

  return (
    <ChartBox height={280}>
      <Doughnut
        data={{
          labels: rows.map((r) => r.name),
          datasets: [
            {
              data: rows.map((r) => r.n),
              backgroundColor: rows.map((r) => `${sourceColor(r.name)}66`),
              borderColor: rows.map((r) => sourceColor(r.name)),
              borderWidth: 2,
            },
          ],
        }}
        options={{
          plugins: {
            legend: { ...legendBottom, labels: { ...legendBottom.labels, padding: 6, font: { size: 10 } } },
            tooltip: {
              callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, total)}%)` },
            },
          },
        }}
      />
    </ChartBox>
  );
}

function WinLossTrend({
  leads,
  period,
  goalCierres,
}: {
  leads: Lead[];
  period: 'month' | 'year';
  goalCierres: number | null;
}) {
  const ta = timeAxis(leads, period);
  const buckets = ta.keys.map((key) => {
    const rows = leads.filter((l) => keyOf(l, ta.isYear) === key);
    return { v: rows.filter(isVenta).length, p: rows.filter(isPerdido).length };
  });

  return (
    <ChartBox height={300}>
      <MixedChart
        data={{
          labels: ta.keys.map((k) => (ta.isYear ? k : monthLabel(k))),
          datasets: [
            { type: 'bar' as const, label: 'Perdidos', data: buckets.map((b) => b.p), backgroundColor: '#f43f5e44', borderColor: '#f43f5e', borderWidth: 2, order: 3, yAxisID: 'y' },
            { type: 'line' as const, label: 'Ventas', data: buckets.map((b) => b.v), borderColor: '#4ade80', backgroundColor: '#4ade8015', fill: false, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: '#4ade80', pointBorderColor: '#fff', pointBorderWidth: 2, tension: 0.3, order: 1, yAxisID: 'y1' },
            ...(goalCierres !== null
              ? [{
                  type: 'line' as const,
                  label: 'Meta ventas',
                  data: buckets.map(() => goalCierres),
                  borderColor: '#c9a96e',
                  borderDash: [5, 4],
                  pointRadius: 0,
                  borderWidth: 1.5,
                  backgroundColor: 'transparent',
                  order: 2,
                  yAxisID: 'y1',
                }]
              : []),
          ],
        }}
        options={{
          plugins: { legend: legendBottom, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: {
              beginAtZero: true,
              grid: { color: GRID_COLOR },
              ticks: { color: '#f43f5e' },
              title: { display: true, text: 'Perdidos', color: '#f43f5e', font: { size: 10 } },
            },
            // Eje propio: las ventas son ~1-2 órdenes de magnitud menores que
            // las pérdidas y compartir escala las aplastaría contra el cero.
            y1: {
              type: 'linear' as const,
              position: 'right' as const,
              beginAtZero: true,
              grid: { drawOnChartArea: false },
              ticks: { color: '#4ade80', precision: 0 },
              title: { display: true, text: 'Ventas', color: '#4ade80', font: { size: 10 } },
            },
          },
        }}
      />
    </ChartBox>
  );
}

function SalesTable({ sales, filtered }: { sales: SaleDeal[]; filtered: Lead[] }) {
  // Las ventas se cruzan contra los leads filtrados por id, así la tabla
  // respeta la barra de filtros (el dashboard original la ignoraba).
  const ids = useMemo(() => new Set(filtered.filter(isVenta).map((l) => l.id)), [filtered]);
  const rows = useMemo(
    () => sales.filter((s) => ids.has(s.id)).sort((a, b) => b.date.localeCompare(a.date)),
    [sales, ids],
  );
  const pendientes = rows.filter((r) => r.status === 'Abierto').length;

  return (
    <Section
      title="05 · Detalle de Ventas"
      sub={
        <>
          Leads que llegaron a Separación o quedaron marcados como Ganado
          {pendientes > 0 ? ` · ${pendientes} con separación pendiente de actualizar estado en Pipedrive` : ''}
        </>
      }
    >
      <DataTable
        rows={rows}
        maxHeight={380}
        empty="Ninguna venta coincide con los filtros activos."
        columns={[
          { header: 'Lead', cell: (r) => <b>{r.name}</b> },
          { header: 'Fecha', cell: (r) => r.date },
          { header: 'Fuente', cell: (r) => r.source },
          {
            header: 'Canal',
            cell: (r) => (
              <span style={{ color: r.isDigital ? '#6366f1' : '#f59e0b' }}>
                {r.isDigital ? 'Digital' : 'No digital'}
              </span>
            ),
          },
          { header: 'Categoría', cell: (r) => r.category },
          { header: 'Campaña', cell: (r) => r.campaign },
          { header: 'Proyecto', cell: (r) => r.project },
          { header: 'Asesor', cell: (r) => firstName(r.advisor) },
          { header: 'Etapa', cell: (r) => r.stage },
          {
            header: 'Estado',
            cell: (r) => (
              <span
                className="rounded-full px-2 py-0.5 text-2xs font-semibold"
                style={
                  r.status === 'Abierto'
                    ? { background: '#f59e0b22', color: '#f59e0b' }
                    : r.status === 'Perdido'
                      ? { background: '#f43f5e22', color: '#f43f5e' }
                      : { background: '#4ade8022', color: '#16a34a' }
                }
              >
                {r.status}
              </span>
            ),
          },
          { header: 'Teléfono', cell: (r) => <span className="text-[11px] text-dim">{r.phone || '—'}</span> },
        ]}
      />
    </Section>
  );
}
