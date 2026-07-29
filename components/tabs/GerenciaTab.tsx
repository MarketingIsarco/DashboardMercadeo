'use client';

import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ChartBox } from '@/components/charts/ChartBox';
import { MixedChart } from '@/components/charts/MixedChart';
import type { MixedData, MixedOptions } from '@/components/charts/MixedChart';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { DataTable } from '@/components/ui/DataTable';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { Section } from '@/components/ui/Section';
import { MONTH_SHORT, PROJECTS, PROJECT_COLORS, STAGES } from '@/lib/config/negocio';
import { firstName, monthLabel, pct } from '@/lib/format';
import { activityState, daysBetween, todayISO } from '@/lib/gestion';
import type { ActivityState } from '@/lib/gestion';
import { isAbierto, isPerdido, isVenta } from '@/lib/selectors';
import type { TabProps } from '@/lib/selectors';
import type { Lead } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PESTAÑA GERENCIA
 *
 * La vista de "¿cómo vamos y quién no está gestionando?". A diferencia de las
 * demás pestañas, mira sobre todo el pipeline ABIERTO: lo que todavía se puede
 * salvar. Respeta los filtros globales.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Las 6 etapas gestionables. "Firma & Entrega" queda fuera: ya no se trabaja. */
const FUNNEL_STAGES = STAGES.slice(0, 6);

/** Últimos `n` meses `YYYY-MM` terminando en el mes de `today`, en orden. */
function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function GerenciaTab({ filtered, meta }: TabProps) {
  // `today` se congela por render: si se recalculara dentro de cada tabla, dos
  // filas podrían quedar comparadas contra días distintos al cruzar medianoche.
  const today = useMemo(() => todayISO(), []);
  const open = useMemo(() => filtered.filter(isAbierto), [filtered]);

  return (
    <>
      <Section
        title="01 · Pulso del Negocio"
        sub={`Corte al ${today} · ${open.length.toLocaleString('es-CO')} leads abiertos en el filtro actual`}
      >
        <Pulso leads={filtered} open={open} today={today} />
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Tendencia Leads vs Cierres (últimos 6 meses)</h3>
            <p className="mb-2 text-2xs text-muted">Volumen mensual y efectividad comercial</p>
            <Tendencia leads={filtered} today={today} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Mix de Proyectos — Pipeline Activo</h3>
            <p className="mb-2 text-2xs text-muted">Distribución de leads abiertos por proyecto</p>
            <MixProyectos open={open} />
          </div>
        </div>
      </Section>

      <Section
        title="02 · Alertas de Gestión por Asesor"
        sub="Al día = próxima actividad agendada de hoy en adelante · Vencida = quedó en el pasado · Sin registro = no hay ninguna agendada"
      >
        <AlertasAsesor open={open} advisors={meta.advisors} today={today} />
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-dim">Detalle — Leads con Gestión Vencida</h3>
          <p className="mb-2 text-2xs text-muted">
            Leads abiertos cuya próxima actividad programada quedó en el pasado, del más atrasado al más reciente
          </p>
          <DetalleVencidos open={open} advisors={meta.advisors} campaigns={meta.campaigns} today={today} />
        </div>
      </Section>

      <Section title="03 · Velocidad del Funnel" sub="Cuánto tarda el pipeline en moverse y dónde se está acumulando">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Tiempo promedio por etapa (leads perdidos)</h3>
            <p className="mb-2 text-2xs text-muted">
              Días entre la creación del lead y su último movimiento, según la etapa en la que se perdió
            </p>
            <Velocidad leads={filtered} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Pipeline activo por etapa y proyecto</h3>
            <p className="mb-2 text-2xs text-muted">Distribución de leads abiertos en el funnel</p>
            <FunnelActivo open={open} />
          </div>
        </div>
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 01 · Pulso del Negocio
// ─────────────────────────────────────────────────────────────────────
function Pulso({ leads, open, today }: { leads: Lead[]; open: Lead[]; today: string }) {
  const curM = today.slice(0, 7);
  const delMes = leads.filter((l) => l.month === curM);
  const cierres = delMes.filter(isVenta).length;

  const states = open.map((l) => activityState(l, today));
  const vencidos = states.filter((s) => s === 'vencida').length;
  const sinRegistro = states.filter((s) => s === 'sin-registro').length;

  return (
    <KpiGrid cols={5}>
      <Kpi label="Leads este mes" value={delMes.length.toLocaleString('es-CO')} meta={`Acumulado ${monthLabel(curM)}`} />
      <Kpi label="Cierres este mes" value={cierres} meta="Separación + Ganados" />
      <Kpi
        label="Tasa de cierre"
        value={`${pct(cierres, delMes.length)}%`}
        meta={`${cierres} de ${delMes.length} leads`}
      />
      <Kpi label="Abiertos totales" value={open.length.toLocaleString('es-CO')} meta="Pipeline activo" />
      <Kpi
        label="Gestión vencida"
        value={vencidos.toLocaleString('es-CO')}
        meta={`${pct(vencidos, open.length)}% de los abiertos`}
        sub={`${sinRegistro.toLocaleString('es-CO')} sin actividad agendada`}
      />
    </KpiGrid>
  );
}

function Tendencia({ leads, today }: { leads: Lead[]; today: string }) {
  const months = useMemo(() => lastMonths(today, 6), [today]);
  const labels = months.map((m) => {
    const [y, mo] = m.split('-');
    return `${MONTH_SHORT[Number(mo) - 1]} ${y.slice(2)}`;
  });

  const leadsPorMes = months.map((m) => leads.filter((l) => l.month === m).length);
  const cierresPorMes = months.map((m) => leads.filter((l) => l.month === m && isVenta(l)).length);

  const data: MixedData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Leads',
        data: leadsPorMes,
        backgroundColor: '#6366f144',
        borderColor: '#6366f1',
        borderWidth: 2,
        order: 2,
      },
      {
        type: 'line',
        label: 'Cierres',
        data: cierresPorMes,
        borderColor: '#c9a96e',
        backgroundColor: '#c9a96e',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 5,
        yAxisID: 'y2',
        order: 1,
      },
    ],
  };

  const options: MixedOptions = {
    plugins: { legend: legendBottom, tooltip: { mode: 'index' } },
    scales: {
      x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
      y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
      y2: {
        position: 'right',
        beginAtZero: true,
        grid: { display: false },
        ticks: { color: '#c9a96e' },
      },
    },
  };

  return (
    <ChartBox height={260}>
      <MixedChart data={data} options={options} />
    </ChartBox>
  );
}

function MixProyectos({ open }: { open: Lead[] }) {
  const rows = PROJECTS.map((name, i) => ({ name, i, n: open.filter((l) => l.project === i).length })).filter(
    (r) => r.n > 0,
  );

  if (rows.length === 0) {
    return <p className="mt-3 text-xs text-muted">Sin leads abiertos en el filtro actual.</p>;
  }

  return (
    <ChartBox height={260}>
      <Doughnut
        data={{
          labels: rows.map((r) => r.name),
          datasets: [
            {
              data: rows.map((r) => r.n),
              backgroundColor: rows.map((r) => `${PROJECT_COLORS[r.i]}99`),
              borderColor: rows.map((r) => PROJECT_COLORS[r.i]),
              borderWidth: 2,
            },
          ],
        }}
        options={{
          plugins: {
            legend: legendBottom,
            tooltip: {
              callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, open.length)}%)` },
            },
          },
        }}
      />
    </ChartBox>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 02 · Alertas de gestión
// ─────────────────────────────────────────────────────────────────────

/** Semáforo por % de pipeline vencido. Los cortes vienen del dashboard original. */
function semaforo(pctVencido: number): { color: string; label: string } {
  if (pctVencido >= 70) return { color: '#ef4444', label: '🔴 Crítico' };
  if (pctVencido >= 40) return { color: '#f59e0b', label: '🟡 Alerta' };
  return { color: '#4ade80', label: '🟢 OK' };
}

interface AlertRow {
  advisor: string;
  total: number;
  counts: Record<ActivityState, number>;
  pctVencido: number;
}

function AlertasAsesor({ open, advisors, today }: { open: Lead[]; advisors: string[]; today: string }) {
  const rows = useMemo<AlertRow[]>(() => {
    const byAdvisor = new Map<number, Lead[]>();
    for (const l of open) {
      const bucket = byAdvisor.get(l.advisor);
      if (bucket) bucket.push(l);
      else byAdvisor.set(l.advisor, [l]);
    }

    return [...byAdvisor.entries()]
      .map(([i, leads]) => {
        const counts: Record<ActivityState, number> = { aldia: 0, vencida: 0, 'sin-registro': 0 };
        for (const l of leads) counts[activityState(l, today)] += 1;
        return {
          advisor: firstName(advisors[i] ?? `#${i}`),
          total: leads.length,
          counts,
          pctVencido: leads.length ? Math.round((counts.vencida / leads.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.counts.vencida - a.counts.vencida);
  }, [open, advisors, today]);

  return (
    <DataTable
      rows={rows}
      empty="Sin leads abiertos en el filtro actual."
      columns={[
        { header: 'Asesor', cell: (r) => <span className="font-bold">{r.advisor}</span> },
        { header: 'Abiertos', cell: (r) => <b>{r.total}</b>, align: 'right' },
        {
          header: 'Al día',
          align: 'right',
          cell: (r) => <span className="font-semibold text-[#16a34a]">{r.counts.aldia || '–'}</span>,
        },
        {
          header: 'Gestión vencida',
          align: 'right',
          cell: (r) => <span className="font-bold text-red">{r.counts.vencida || '–'}</span>,
        },
        {
          header: 'Sin registro',
          align: 'right',
          cell: (r) => <span className="text-muted">{r.counts['sin-registro'] || '–'}</span>,
        },
        {
          header: '% Vencido',
          align: 'right',
          cell: (r) => (
            <b style={{ color: semaforo(r.pctVencido).color }}>{r.pctVencido}%</b>
          ),
        },
        {
          header: 'Estado',
          cell: (r) => {
            const s = semaforo(r.pctVencido);
            return (
              <span
                className="whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold"
                style={{ background: `${s.color}22`, color: s.color }}
              >
                {s.label}
              </span>
            );
          },
        },
      ]}
    />
  );
}

function DetalleVencidos({
  open,
  advisors,
  campaigns,
  today,
}: {
  open: Lead[];
  advisors: string[];
  campaigns: string[];
  today: string;
}) {
  const rows = useMemo(
    () =>
      open
        .filter((l) => activityState(l, today) === 'vencida')
        .map((l) => ({ l, dias: daysBetween(l.nextActivity, today) }))
        .sort((a, b) => b.dias - a.dias),
    [open, today],
  );

  const diasColor = (d: number) => (d >= 5 ? '#ef4444' : d >= 3 ? '#f59e0b' : TICK_COLOR);

  return (
    <DataTable
      rows={rows}
      maxHeight={420}
      empty="Sin leads con gestión vencida. 🎉"
      columns={[
        { header: 'Nombre', cell: ({ l }) => <span className="font-semibold">{l.name}</span> },
        { header: 'Teléfono', cell: ({ l }) => <span className="text-dim">{l.phone || '–'}</span> },
        { header: 'Asesor', cell: ({ l }) => <span className="font-semibold">{firstName(advisors[l.advisor] ?? '–')}</span> },
        { header: 'Proyecto', cell: ({ l }) => PROJECTS[l.project] ?? '–' },
        {
          header: 'Etapa',
          cell: ({ l }) => (
            <span className="whitespace-nowrap rounded-full bg-indigo/10 px-2 py-0.5 text-2xs font-semibold text-indigo">
              {STAGES[l.stage] ?? '–'}
            </span>
          ),
        },
        { header: 'Creación', cell: ({ l }) => <span className="text-dim">{l.date}</span> },
        {
          header: 'Próxima actividad',
          cell: ({ l }) => <span className="font-semibold text-[#f59e0b]">{l.nextActivity}</span>,
        },
        {
          header: 'Días vencido',
          align: 'right',
          cell: ({ dias }) => (
            <b style={{ color: diasColor(dias) }}>{dias}d</b>
          ),
        },
        { header: 'Campaña', cell: ({ l }) => <span className="text-2xs text-dim">{campaigns[l.campaign] ?? '–'}</span> },
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// 03 · Velocidad del funnel
// ─────────────────────────────────────────────────────────────────────
function Velocidad({ leads }: { leads: Lead[] }) {
  const lost = useMemo(() => leads.filter(isPerdido), [leads]);

  const stats = FUNNEL_STAGES.map((_, si) => {
    const sub = lost.filter((l) => l.stage === si);
    if (sub.length === 0) return { avg: 0, n: 0 };
    const total = sub.reduce((s, l) => s + daysBetween(l.date, l.updateTime), 0);
    return { avg: Number((total / sub.length).toFixed(1)), n: sub.length };
  });

  const color = (v: number) => (v > 10 ? '#ef4444' : v > 5 ? '#f59e0b' : '#4ade80');

  return (
    <ChartBox height={280}>
      <Bar
        data={{
          labels: [...FUNNEL_STAGES],
          datasets: [
            {
              label: 'Días prom.',
              data: stats.map((s) => s.avg),
              backgroundColor: stats.map((s) => `${color(s.avg)}44`),
              borderColor: stats.map((s) => color(s.avg)),
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
                label: (c) => `${c.raw as number} días promedio`,
                afterLabel: (c) => `${stats[c.dataIndex].n} leads perdidos en esta etapa`,
              },
            },
          },
          scales: {
            x: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
            y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function FunnelActivo({ open }: { open: Lead[] }) {
  const projects = PROJECTS.map((_, i) => i).filter((i) => open.some((l) => l.project === i));

  return (
    <ChartBox height={280}>
      <Bar
        data={{
          labels: [...FUNNEL_STAGES],
          datasets: projects.map((pi) => ({
            label: PROJECTS[pi],
            data: FUNNEL_STAGES.map((_, si) => open.filter((l) => l.stage === si && l.project === pi).length),
            backgroundColor: `${PROJECT_COLORS[pi]}66`,
            borderColor: PROJECT_COLORS[pi],
            borderWidth: 1.5,
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
  );
}
