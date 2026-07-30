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
import { firstName, fmtHoras, median, monthLabel, pct } from '@/lib/format';
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

      <PrimerContacto leads={filtered} advisors={meta.advisors} />
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

// ─────────────────────────────────────────────────────────────────────
// 04 · Tiempo de primer contacto
//
// Cruce `/deals` × `/activities` por `deal_id`, resuelto en el servidor
// (`lib/pipedrive/mapping.ts`). Aquí sólo se agrega por asesor.
// ─────────────────────────────────────────────────────────────────────

/** Mínimo de tratos con dato para publicar la mediana de un asesor. */
const MIN_MUESTRA = 5;

/**
 * Tope del eje. Sin él, un asesor con mediana de tres meses aplasta la escala
 * y los demás quedan como barras de un pixel. Las barras topadas se marcan y
 * el tooltip siempre muestra el valor real.
 */
const EJE_MAX_H = 200;

interface ContactoRow {
  advisor: string;
  total: number;
  conDato: number;
  sinDato: number;
  /** `null` cuando la muestra no llega a `MIN_MUESTRA`. */
  mediana: number | null;
  promedio: number | null;
  pctBajo1h: number;
  pctBajo24h: number;
}

function semaforoContacto(medianaH: number | null): { color: string; label: string } {
  if (medianaH === null) return { color: '#94a3b8', label: '⚪ Muestra insuf.' };
  if (medianaH <= 4) return { color: '#4ade80', label: '🟢 Rápido' };
  if (medianaH <= 24) return { color: '#f59e0b', label: '🟡 En el día' };
  return { color: '#ef4444', label: '🔴 Tardío' };
}

/** Agrega una lista de horas a la forma que consumen la tabla y los gráficos. */
function resumirHoras(horas: number[], total: number, advisor: string): ContactoRow {
  const suficiente = horas.length >= MIN_MUESTRA;
  const share = (limite: number) =>
    horas.length ? Math.round((horas.filter((h) => h <= limite).length / horas.length) * 100) : 0;

  return {
    advisor,
    total,
    conDato: horas.length,
    sinDato: total - horas.length,
    mediana: suficiente ? Number(median(horas).toFixed(2)) : null,
    promedio: suficiente ? Number((horas.reduce((a, b) => a + b, 0) / horas.length).toFixed(2)) : null,
    pctBajo1h: share(1),
    pctBajo24h: share(24),
  };
}

function PrimerContacto({ leads, advisors }: { leads: Lead[]; advisors: string[] }) {
  const { rows, global } = useMemo(() => {
    const byAdvisor = new Map<number, Lead[]>();
    for (const l of leads) {
      const bucket = byAdvisor.get(l.advisor);
      if (bucket) bucket.push(l);
      else byAdvisor.set(l.advisor, [l]);
    }

    const horasDe = (ls: Lead[]) =>
      ls.map((l) => l.firstContactHours).filter((h): h is number => h !== null);

    const all = [...byAdvisor.entries()].map(([i, ls]) =>
      resumirHoras(horasDe(ls), ls.length, firstName(advisors[i] ?? `#${i}`)),
    );

    // Los asesores sin muestra suficiente van al final: ordenarlos por una
    // mediana que no existe los mezclaría con los rápidos de verdad.
    const conMuestra = all.filter((r) => r.mediana !== null).sort((a, b) => a.mediana! - b.mediana!);
    const sinMuestra = all.filter((r) => r.mediana === null).sort((a, b) => b.total - a.total);

    return {
      rows: [...conMuestra, ...sinMuestra],
      global: resumirHoras(horasDe(leads), leads.length, 'TOTAL'),
    };
  }, [leads, advisors]);

  const grafico = rows.filter((r) => r.mediana !== null);

  return (
    <Section
      title="04 · Tiempo de Primer Contacto por Asesor"
      sub={
        <>
          Horas entre la creación del trato y la primera actividad que el asesor registró en él. Cruce de tratos
          × actividades por ID de trato, directo de Pipedrive ·{' '}
          <b>
            {global.conDato.toLocaleString('es-CO')} de {global.total.toLocaleString('es-CO')} tratos
          </b>{' '}
          tienen primer contacto registrado
        </>
      }
    >
      {grafico.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Ningún asesor alcanza {MIN_MUESTRA} tratos con primer contacto en el filtro actual.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Mediana de primer contacto por asesor</h3>
            <p className="mb-2 text-2xs text-muted">
              Sólo asesores con {MIN_MUESTRA} o más tratos con dato · eje topado en {EJE_MAX_H} h
            </p>
            <MedianaContacto rows={grafico} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Distribución de velocidad por asesor</h3>
            <p className="mb-2 text-2xs text-muted">% de tratos en cada rango de tiempo de respuesta</p>
            <DistribucionContacto rows={grafico} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <TablaContacto rows={rows} global={global} />
      </div>
    </Section>
  );
}

function MedianaContacto({ rows }: { rows: ContactoRow[] }) {
  const reales = rows.map((r) => r.mediana!);

  return (
    <ChartBox height={300}>
      <Bar
        data={{
          labels: rows.map((r) => r.advisor),
          datasets: [
            {
              label: 'Mediana',
              data: reales.map((h) => Math.min(h, EJE_MAX_H)),
              backgroundColor: reales.map((h) => `${semaforoContacto(h).color}66`),
              borderColor: reales.map((h) => semaforoContacto(h).color),
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
                label: (c) => fmtHoras(reales[c.dataIndex]),
                afterLabel: (c) =>
                  reales[c.dataIndex] > EJE_MAX_H ? `Barra topada en ${EJE_MAX_H} h` : '',
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              max: EJE_MAX_H,
              title: { display: true, text: 'Horas al primer contacto', color: TICK_COLOR },
              grid: { color: GRID_COLOR },
              ticks: { color: TICK_COLOR },
            },
            y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function DistribucionContacto({ rows }: { rows: ContactoRow[] }) {
  const bandas = [
    { label: 'Menos de 1 h', color: '#4ade80', valor: (r: ContactoRow) => r.pctBajo1h },
    { label: '1 a 24 h', color: '#f59e0b', valor: (r: ContactoRow) => r.pctBajo24h - r.pctBajo1h },
    { label: 'Más de 24 h', color: '#ef4444', valor: (r: ContactoRow) => 100 - r.pctBajo24h },
  ];

  return (
    <ChartBox height={300}>
      <Bar
        data={{
          labels: rows.map((r) => r.advisor),
          datasets: bandas.map((b) => ({
            label: b.label,
            data: rows.map(b.valor),
            backgroundColor: `${b.color}88`,
            borderColor: b.color,
            borderWidth: 1,
          })),
        }}
        options={{
          // Mismo eje que el gráfico de al lado: los dos leen por asesor, y
          // en vertical los 11 nombres se solapan.
          indexAxis: 'y',
          plugins: {
            legend: legendBottom,
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw as number}%` } },
          },
          scales: {
            x: {
              stacked: true,
              beginAtZero: true,
              max: 100,
              grid: { color: GRID_COLOR },
              ticks: { color: TICK_COLOR, callback: (v) => `${v}%` },
            },
            y: { stacked: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
          },
        }}
      />
    </ChartBox>
  );
}

function TablaContacto({ rows, global }: { rows: ContactoRow[]; global: ContactoRow }) {
  const conTotal = [...rows, global];
  const esTotal = (r: ContactoRow) => r === global;
  const tiempo = (h: number | null) => (h === null ? '–' : fmtHoras(h));

  return (
    <DataTable
      rows={conTotal}
      empty="Sin tratos en el filtro actual."
      columns={[
        {
          header: 'Asesor',
          cell: (r) => <span className={esTotal(r) ? 'font-bold' : 'font-semibold'}>{r.advisor}</span>,
        },
        { header: 'Tratos', align: 'right', cell: (r) => r.total.toLocaleString('es-CO') },
        { header: 'Con 1er contacto', align: 'right', cell: (r) => r.conDato.toLocaleString('es-CO') },
        {
          header: 'Sin registro',
          align: 'right',
          cell: (r) => <span className="text-muted">{r.sinDato.toLocaleString('es-CO')}</span>,
        },
        {
          header: 'Mediana',
          align: 'right',
          cell: (r) => (
            <b style={{ color: semaforoContacto(r.mediana).color }}>{tiempo(r.mediana)}</b>
          ),
        },
        {
          header: 'Promedio',
          align: 'right',
          cell: (r) => <span className="text-dim">{tiempo(r.promedio)}</span>,
        },
        {
          header: '% < 1h',
          align: 'right',
          cell: (r) => (r.conDato >= MIN_MUESTRA ? `${r.pctBajo1h}%` : '–'),
        },
        {
          header: '% < 24h',
          align: 'right',
          cell: (r) => (r.conDato >= MIN_MUESTRA ? `${r.pctBajo24h}%` : '–'),
        },
        {
          header: 'Semáforo',
          cell: (r) => {
            const s = semaforoContacto(r.mediana);
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
