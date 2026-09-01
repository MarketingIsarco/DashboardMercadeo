'use client';

import { useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { ChartBox } from '@/components/charts/ChartBox';
import { MixedChart } from '@/components/charts/MixedChart';
import type { MixedData, MixedOptions } from '@/components/charts/MixedChart';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { DataTable } from '@/components/ui/DataTable';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { MonthSelect } from '@/components/ui/MonthSelect';
import { Section } from '@/components/ui/Section';
import { MONTH_SHORT, PROJECTS, PROJECT_COLORS, STAGES } from '@/lib/config/negocio';
import { firstName, fmtHoras, median, monthLabel, pct } from '@/lib/format';
import {
  accionesPorAsesor,
  activityState,
  daysBetween,
  diaSemana,
  diasDelMes,
  seriesDelMes,
  todayISO,
} from '@/lib/gestion';
import type { ActivityState, SerieAsesor } from '@/lib/gestion';
import { applyFilters, isAbierto, isPerdido, isVenta } from '@/lib/selectors';
import type { FilterState, TabProps } from '@/lib/selectors';
import type { DashboardData, Lead, Meeting, Meta } from '@/lib/types';

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

/** Nombres completos de los días, empezando en lunes (0). */
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Abreviaturas para el eje, donde no cabe el nombre completo. */
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Una línea por asesor. 12 colores: hoy son 11 asesores y crecen sin avisar. */
const ADVISOR_COLORS = [
  '#0e6680', '#f59e0b', '#6366f1', '#22c55e', '#e11d48', '#a855f7',
  '#0891b2', '#c9a96e', '#84cc16', '#f97316', '#64748b', '#db2777',
];

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

export function GerenciaTab({ data, filtered, filters, meta }: TabProps) {
  // `today` se congela por render: si se recalculara dentro de cada tabla, dos
  // filas podrían quedar comparadas contra días distintos al cruzar medianoche.
  const today = useMemo(() => todayISO(), []);
  const open = useMemo(() => filtered.filter(isAbierto), [filtered]);
  const meetings = useMemo(() => filtrarReuniones(data, filters, meta), [data, filters, meta]);

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

      <PrimerContacto
        leads={filtered}
        advisors={meta.advisors}
        data={data}
        filters={filters}
        meta={meta}
      />

      <Section
        title="05 · Mapa de Calor — Reuniones por Horario"
        sub={
          <>
            Reuniones, citas y visitas agendadas por día de la semana y hora ({HORA_INICIO} a {HORA_FIN} h), según la
            fecha de vencimiento de la actividad · hora de Bogotá ·{' '}
            <b>{meetings.length.toLocaleString('es-CO')} reuniones</b> en el filtro actual
          </>
        }
      >
        <MapaCalorReuniones meetings={meetings} />
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

/**
 * Cortes de la distribución de velocidad, en horas. Cada corte cierra su banda
 * por arriba (`h <= corte`) y todo lo que sobra cae en la última, "más de 24 h".
 */
const CORTES_VELOCIDAD_H = [1, 6, 12, 24];

/**
 * `color` pinta la barra apilada; `texto` es el mismo tono bajado para que el
 * número de la tabla se lea sobre blanco (el lima y el amarillo brillantes
 * desaparecen en texto pequeño).
 */
const BANDAS_VELOCIDAD = [
  { label: 'Menos de 1 h', corto: '< 1 h', color: '#4ade80', texto: '#16a34a' },
  { label: '1 a 6 h', corto: '1 a 6 h', color: '#a3e635', texto: '#65a30d' },
  { label: '6 a 12 h', corto: '6 a 12 h', color: '#facc15', texto: '#ca8a04' },
  { label: '12 a 24 h', corto: '12 a 24 h', color: '#fb923c', texto: '#ea580c' },
  { label: 'Más de 24 h', corto: '> 24 h', color: '#ef4444', texto: '#dc2626' },
];

interface ContactoRow {
  /** Índice del asesor en `meta.advisors`; `-1` en la fila TOTAL. */
  idx: number;
  advisor: string;
  total: number;
  conDato: number;
  sinDato: number;
  /** `null` cuando la muestra no llega a `MIN_MUESTRA`. */
  mediana: number | null;
  promedio: number | null;
  /** Tratos en cada banda de `BANDAS_VELOCIDAD`, en orden. Suman `conDato`. */
  conteo: number[];
  /** Los mismos datos en % — es lo que apila la gráfica. Suman 100. */
  dist: number[];
}

/** Cuántos tratos cae en cada banda de velocidad. */
function conteoVelocidad(horas: number[]): number[] {
  const conteo = new Array<number>(BANDAS_VELOCIDAD.length).fill(0);
  for (const h of horas) {
    const i = CORTES_VELOCIDAD_H.findIndex((corte) => h <= corte);
    conteo[i === -1 ? CORTES_VELOCIDAD_H.length : i] += 1;
  }
  return conteo;
}

/**
 * Pasa el conteo por banda a porcentajes que suman exactamente 100.
 *
 * El redondeo es por mayor resto: si cada banda se redondeara por su cuenta la
 * barra apilada terminaría en 98 % o 103 %, y con cinco bandas eso se ve como
 * una barra cortada o desbordada del eje.
 */
function distribucionVelocidad(conteo: number[]): number[] {
  const n = conteo.reduce((a, b) => a + b, 0);
  if (n === 0) return conteo.map(() => 0);

  const exacto = conteo.map((c) => (c / n) * 100);
  const salida = exacto.map(Math.floor);
  let sobrante = 100 - salida.reduce((a, b) => a + b, 0);

  const porResto = exacto
    .map((v, i) => ({ resto: v - Math.floor(v), i }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of porResto) {
    if (sobrante <= 0) break;
    salida[i] += 1;
    sobrante -= 1;
  }
  return salida;
}

function semaforoContacto(medianaH: number | null): { color: string; label: string } {
  if (medianaH === null) return { color: '#94a3b8', label: '⚪ Muestra insuf.' };
  if (medianaH <= 4) return { color: '#4ade80', label: '🟢 Rápido' };
  if (medianaH <= 24) return { color: '#f59e0b', label: '🟡 En el día' };
  return { color: '#ef4444', label: '🔴 Tardío' };
}

/** Agrega una lista de horas a la forma que consumen la tabla y los gráficos. */
function resumirHoras(horas: number[], total: number, advisor: string, idx: number): ContactoRow {
  const suficiente = horas.length >= MIN_MUESTRA;
  const conteo = conteoVelocidad(horas);

  return {
    idx,
    advisor,
    total,
    conDato: horas.length,
    sinDato: total - horas.length,
    mediana: suficiente ? Number(median(horas).toFixed(2)) : null,
    promedio: suficiente ? Number((horas.reduce((a, b) => a + b, 0) / horas.length).toFixed(2)) : null,
    conteo,
    dist: distribucionVelocidad(conteo),
  };
}

function PrimerContacto({
  leads,
  advisors,
  data,
  filters,
  meta,
}: {
  leads: Lead[];
  advisors: string[];
  data: DashboardData;
  filters: FilterState;
  meta: Meta;
}) {
  const { rows, global } = useMemo(() => {
    // Se agrupa por `firstContactBy` —quien CREÓ la primera actividad del
    // trato—, no por el dueño del lead: lo que mide este capítulo es quién
    // atendió, y un asesor que cubre los leads de otro se gana esa respuesta.
    const porAtendedor = new Map<number, number[]>();
    const todas: number[] = [];

    for (const l of leads) {
      if (l.firstContactHours === null || l.firstContactBy < 0) continue;
      todas.push(l.firstContactHours);
      const bucket = porAtendedor.get(l.firstContactBy);
      if (bucket) bucket.push(l.firstContactHours);
      else porAtendedor.set(l.firstContactBy, [l.firstContactHours]);
    }

    const all = [...porAtendedor.entries()].map(([i, horas]) =>
      resumirHoras(horas, horas.length, firstName(advisors[i] ?? `#${i}`), i),
    );

    // Los asesores sin muestra suficiente van al final: ordenarlos por una
    // mediana que no existe los mezclaría con los rápidos de verdad.
    const conMuestra = all.filter((r) => r.mediana !== null).sort((a, b) => a.mediana! - b.mediana!);
    const sinMuestra = all.filter((r) => r.mediana === null).sort((a, b) => b.total - a.total);

    return {
      rows: [...conMuestra, ...sinMuestra],
      global: resumirHoras(todas, leads.length, 'TOTAL', -1),
    };
  }, [leads, advisors]);

  // `today` se congela por render para que el divisor del promedio no cambie a
  // media tabla si el navegador queda abierto cruzando la medianoche.
  const today = useMemo(() => todayISO(), []);
  const acciones = useMemo(
    () => resumenAcciones(data, filters, meta, today),
    [data, filters, meta, today],
  );

  const grafico = rows.filter((r) => r.mediana !== null);

  return (
    <Section
      title="04 · Actividades Asesores"
      sub={
        <>
          Volumen de gestión diaria y velocidad de primer contacto, por asesor. Todo se acredita a
          quien <b>creó</b> la actividad en Pipedrive, no a quien la tenía asignada ni al dueño del
          trato ·{' '}
          <b>
            {global.conDato.toLocaleString('es-CO')} de {global.total.toLocaleString('es-CO')} tratos
          </b>{' '}
          tienen primer contacto registrado
        </>
      }
    >
      <AccionesDiarias data={data} filters={filters} meta={meta} />

      <div className="mt-7 border-t border-border pt-5">
        <h3 className="mb-3 text-xs font-semibold text-dim">Tiempo de primer contacto por asesor</h3>
      </div>

      {grafico.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Ningún asesor alcanza {MIN_MUESTRA} tratos con primer contacto en el filtro actual.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Mediana de primer contacto por asesor</h3>
            <p className="mb-2 text-2xs text-muted">
              Horas entre la creación del trato y la primera actividad que el asesor le creó · sólo
              asesores con {MIN_MUESTRA} o más tratos con dato · eje topado en {EJE_MAX_H} h
            </p>
            <MedianaContacto rows={grafico} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-dim">Distribución de velocidad por asesor</h3>
            <p className="mb-2 text-2xs text-muted">
              % de los tratos que atendió cada asesor, según lo que tardó en crearles la primera
              actividad
            </p>
            <DistribucionContacto rows={grafico} />
          </div>
        </div>
      )}

      <div className="mt-7 border-t border-border pt-5">
        <TablaAsesores rows={rows} global={global} acciones={acciones} advisors={advisors} />
      </div>
    </Section>
  );
}

/**
 * Tratos sobre los que se cuentan acciones.
 *
 * Igual que el mapa de calor, **ignora los filtros de tiempo**: el mes lo elige
 * el propio capítulo. Si los respetara, filtrar "agosto" borraría las acciones
 * que el asesor hizo en agosto sobre leads que entraron en marzo — que es justo
 * la gestión de reactivación que interesa ver aquí.
 */
function tratosSinFiltroDeTiempo(data: DashboardData, filters: FilterState, meta: Meta): Lead[] {
  const sinTiempo: FilterState = {
    ...filters,
    months: [],
    exMonths: [],
    year: null,
    dateFrom: null,
    dateTo: null,
  };
  return applyFilters(data.leads, sinTiempo, meta.digitalSources);
}

function AccionesDiarias({
  data,
  filters,
  meta,
}: {
  data: DashboardData;
  filters: FilterState;
  meta: Meta;
}) {
  const { porAsesor, meses } = useMemo(
    () => accionesPorAsesor(data.activityDays, tratosSinFiltroDeTiempo(data, filters, meta)),
    [data, filters, meta],
  );

  const [mesElegido, setMesElegido] = useState<string | null>(null);
  // El mes elegido puede desaparecer al cambiar los filtros; ahí se cae al último.
  const mes = mesElegido && meses.includes(mesElegido) ? mesElegido : meses[meses.length - 1];

  const { dias, series, total } = useMemo(() => {
    if (!mes) return { dias: [] as string[], series: [] as SerieAsesor[], total: 0 };

    const filas = seriesDelMes(porAsesor, mes, (i) => firstName(meta.advisors[i] ?? `#${i}`));
    return {
      dias: diasDelMes(mes),
      series: filas,
      total: filas.reduce((a, f) => a + f.suma, 0),
    };
  }, [mes, porAsesor, meta.advisors]);

  if (!mes || series.length === 0) {
    return (
      <p className="text-xs text-muted">
        No hay actividades registradas para los filtros actuales.
      </p>
    );
  }

  const esFinDeSemana = (i: number) => diaSemana(dias[i]) >= 5;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-dim">Acciones por asesor, día a día</h3>
          <p className="text-2xs text-muted">
            {total.toLocaleString('es-CO')} acciones en {monthLabel(mes)} · toda actividad del CRM
            (llamada, WhatsApp, correo, reunión, tarea) creada por el asesor, ubicada el día en que
            la registró · clic en un nombre de la leyenda para aislarlo
          </p>
        </div>
        <MonthSelect
          value={mes}
          months={meses}
          onChange={setMesElegido}
          label="Mes de las acciones"
        />
      </div>

      <ChartBox height={340}>
        <Line
          data={{
            // Dos líneas por marca: el nombre del día encima del número.
            labels: dias.map((d) => [DIAS_CORTOS[diaSemana(d)], String(Number(d.slice(8)))]),
            datasets: series.map((s, i) => ({
              label: s.asesor,
              data: s.datos,
              borderColor: ADVISOR_COLORS[i % ADVISOR_COLORS.length],
              backgroundColor: ADVISOR_COLORS[i % ADVISOR_COLORS.length],
              borderWidth: 2,
              pointRadius: 2,
              pointHoverRadius: 5,
              // Recta, no curva: una curva entre el lunes y el martes dibuja
              // valores intermedios que no existen, y con datos ralos llega a
              // pintar picos por encima del máximo real del día.
              tension: 0,
            })),
          }}
          options={{
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: legendBottom,
              tooltip: {
                callbacks: {
                  // El eje va abreviado por espacio; el tooltip sí dice
                  // "lunes 4 de agosto" completo.
                  title: (items) => {
                    const iso = dias[items[0].dataIndex];
                    return `${DIAS_LARGOS[diaSemana(iso)]} ${Number(iso.slice(8))} de ${monthLabel(
                      iso.slice(0, 7),
                    )}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { color: GRID_COLOR },
                ticks: {
                  autoSkip: false,
                  font: { size: 9 },
                  // Sábados y domingos en gris claro: el valle del fin de
                  // semana se lee sin tener que contar días.
                  color: (ctx) => (esFinDeSemana(ctx.index) ? '#c3c3d1' : TICK_COLOR),
                },
              },
              y: {
                beginAtZero: true,
                grid: { color: GRID_COLOR },
                ticks: { color: TICK_COLOR, precision: 0 },
                title: { display: true, text: 'Acciones', color: TICK_COLOR, font: { size: 10 } },
              },
            },
          }}
        />
      </ChartBox>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 04 · Tabla resumen por asesor
//
// Junta las dos mitades del capítulo: cuántos leads atendió cada asesor en cada
// rango de velocidad (los mismos de la gráfica de al lado) y cuánta actividad
// registró en el periodo.
//
// Al contrario del gráfico de acciones día a día (que elige el mes con su
// propio selector), esta tabla **sí respeta los filtros de tiempo del menú
// principal**, y los aplica a la fecha en que se creó la actividad, no a la del
// lead: "julio" aquí es lo que el equipo gestionó en julio, aunque el trato
// haya entrado en marzo. Los demás filtros (proyecto, unidad, fuente, campaña,
// estado) sí son propiedades del trato y se resuelven cruzando por `dealId`.
// ─────────────────────────────────────────────────────────────────────

const MS_DIA = 86_400_000;

/** Mediodía UTC: inmune a la zona horaria del runtime, igual que `diaSemana`. */
function aFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** `2026-08` → `'2026-08-31'`. */
function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

interface PeriodoAcciones {
  desde: string | null;
  hasta: string | null;
  /** Días calendario del periodo. Es el divisor del promedio diario. */
  dias: number;
}

interface ResumenAcciones {
  /** Índice de asesor → actividades registradas en el periodo. */
  porAsesor: Map<number, number>;
  total: number;
  periodo: PeriodoAcciones;
}

/**
 * Rango de fechas que declara el filtro de tiempo, sin mirar los datos.
 *
 * Es lo que hace que el promedio diario signifique algo: si el divisor saliera
 * de la primera y la última actividad encontradas, un mes en el que el equipo
 * sólo registró gestión tres días daría "600 actividades diarias". El periodo
 * es el que el usuario pidió, y nunca pasa de hoy — los días que todavía no han
 * ocurrido no se promedian.
 */
function rangoDelFiltro(filters: FilterState, today: string): { desde: string | null; hasta: string | null } {
  const tope = (fin: string) => (fin < today ? fin : today);

  if (filters.dateFrom || filters.dateTo) {
    return { desde: filters.dateFrom, hasta: filters.dateTo ? tope(filters.dateTo) : today };
  }
  if (filters.months.length) {
    const ms = [...filters.months].sort();
    return { desde: `${ms[0]}-01`, hasta: tope(ultimoDiaDelMes(ms[ms.length - 1])) };
  }
  if (filters.year) {
    return { desde: `${filters.year}-01-01`, hasta: tope(`${filters.year}-12-31`) };
  }
  // Sin filtro de tiempo el periodo lo marcan los datos, en el llamador.
  return { desde: null, hasta: null };
}

function resumenAcciones(
  data: DashboardData,
  filters: FilterState,
  meta: Meta,
  today: string,
): ResumenAcciones {
  // El trato decide si la actividad entra al filtro; a quién se le acredita ya
  // viene resuelto desde el servidor en `a.advisor` (el usuario asignado).
  const tratosPermitidos = new Set(tratosSinFiltroDeTiempo(data, filters, meta).map((l) => l.id));

  const mesPermitido = (mes: string) => {
    if (filters.year !== null && mes.slice(0, 4) !== filters.year) return false;
    if (filters.months.length && !filters.months.includes(mes)) return false;
    if (filters.exMonths.includes(mes)) return false;
    return true;
  };

  const porAsesor = new Map<number, number>();
  let total = 0;
  let primera: string | null = null;
  let ultima: string | null = null;

  for (const a of data.activityDays) {
    if (!tratosPermitidos.has(a.dealId)) continue;
    if (!mesPermitido(a.date.slice(0, 7))) continue;
    if (filters.dateFrom && a.date < filters.dateFrom) continue;
    if (filters.dateTo && a.date > filters.dateTo) continue;

    if (primera === null || a.date < primera) primera = a.date;
    if (ultima === null || a.date > ultima) ultima = a.date;
    porAsesor.set(a.advisor, (porAsesor.get(a.advisor) ?? 0) + a.count);
    total += a.count;
  }

  const rango = rangoDelFiltro(filters, today);
  const desde = rango.desde ?? primera;
  const hasta = rango.hasta ?? ultima;

  // Días calendario, sábados y domingos incluidos: el equipo comercial atiende
  // fines de semana, y descontarlos inflaba el promedio de quien gestiona
  // justo esos días. Se cuentan uno a uno y no por resta de fechas, para que
  // los meses excluidos con "Sin …" no metan días que no aportan nada.
  let dias = 0;
  if (desde && hasta && desde <= hasta) {
    for (let t = aFecha(desde).getTime(); t <= aFecha(hasta).getTime(); t += MS_DIA) {
      if (mesPermitido(new Date(t).toISOString().slice(0, 7))) dias += 1;
    }
  }

  return { porAsesor, total, periodo: { desde, hasta, dias } };
}

/** `2026-08-03` → `'3 Ago 26'`. */
function fechaCorta(iso: string): string {
  return `${Number(iso.slice(8))} ${monthLabel(iso.slice(0, 7))}`;
}

function TablaAsesores({
  rows,
  global,
  acciones,
  advisors,
}: {
  rows: ContactoRow[];
  global: ContactoRow;
  acciones: ResumenAcciones;
  advisors: string[];
}) {
  const { periodo } = acciones;

  // Quien registró gestión pero no tiene leads propios en el filtro —un apoyo
  // comercial, alguien que cubrió vacaciones— también necesita fila: si no, sus
  // actividades aparecerían en el TOTAL y en ninguna línea, y la columna no
  // cuadraría al sumarla.
  const conLeads = new Set(rows.map((r) => r.idx));
  const extra = [...acciones.porAsesor.entries()]
    .filter(([i, n]) => n > 0 && !conLeads.has(i))
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => resumirHoras([], 0, firstName(advisors[i] ?? `#${i}`), i));

  const conTotal = [...rows, ...extra, global];
  const esTotal = (r: ContactoRow) => r === global;
  const actividades = (r: ContactoRow) =>
    r.idx < 0 ? acciones.total : acciones.porAsesor.get(r.idx) ?? 0;

  const num = (v: number) => v.toLocaleString('es-CO');
  const dec = (v: number) =>
    v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div>
      <h3 className="text-xs font-semibold text-dim">Resumen por asesor</h3>
      <p className="mb-3 text-2xs text-muted">
        Tratos atendidos por cada asesor, en número de tratos y por su rango de respuesta ·
        Actividades <b>creadas</b> por él en el CRM, hechas y pendientes, contadas el día en que las
        registró{' '}
        {periodo.desde && periodo.hasta ? (
          <>
            del {fechaCorta(periodo.desde)} al {fechaCorta(periodo.hasta)}, según el filtro del menú
            principal: <b>{periodo.dias} días</b>
          </>
        ) : (
          'en el filtro actual'
        )}
      </p>

      <DataTable
        rows={conTotal}
        empty="Sin tratos en el filtro actual."
        columns={[
          {
            header: 'Asesor',
            cell: (r) => (
              <span className={esTotal(r) ? 'font-bold' : 'font-semibold'}>{r.advisor}</span>
            ),
          },
          ...BANDAS_VELOCIDAD.map((b, i) => ({
            header: b.corto,
            align: 'right' as const,
            cell: (r: ContactoRow) =>
              r.conteo[i] ? (
                <b style={{ color: b.texto }}>{num(r.conteo[i])}</b>
              ) : (
                <span className="text-muted">0</span>
              ),
          })),
          {
            header: 'Actividades / día',
            align: 'right',
            cell: (r) => <b>{dec(periodo.dias ? actividades(r) / periodo.dias : 0)}</b>,
          },
          {
            header: 'Actividades acumuladas',
            align: 'right',
            cell: (r) => num(actividades(r)),
          },
        ]}
      />
    </div>
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
  return (
    <ChartBox height={300}>
      <Bar
        data={{
          labels: rows.map((r) => r.advisor),
          datasets: BANDAS_VELOCIDAD.map((b, i) => ({
            label: b.label,
            data: rows.map((r) => r.dist[i]),
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

// ─────────────────────────────────────────────────────────────────────
// 05 · Mapa de calor de reuniones
//
// Cuándo se llena la agenda comercial: día de la semana × hora. Las reuniones
// vienen de `/activities` (tipo `meeting`) atadas a un trato, ya convertidas a
// hora de Bogotá en `lib/pipedrive/mapping.ts`.
// ─────────────────────────────────────────────────────────────────────

/** Franja horaria que se despliega en columnas. Todo lo demás cae en "Sin hora". */
const HORA_INICIO = 8;
const HORA_FIN = 18;

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Reuniones que caen dentro del filtro actual.
 *
 * Los filtros de tiempo se aplican a la fecha de la **reunión**, no a la del
 * lead: "julio" aquí significa lo que se agendó en julio, aunque el lead haya
 * entrado en marzo — de otro modo el mapa mostraría la agenda de una cohorte y
 * no la de un mes. Los demás filtros (proyecto, unidad, fuente, campaña,
 * estado) sí son propiedades del trato, y se resuelven cruzando por `dealId`.
 */
function filtrarReuniones(data: DashboardData, filters: FilterState, meta: Meta): Meeting[] {
  const sinTiempo: FilterState = {
    ...filters,
    months: [],
    exMonths: [],
    year: null,
    dateFrom: null,
    dateTo: null,
  };
  const ids = new Set(applyFilters(data.leads, sinTiempo, meta.digitalSources).map((l) => l.id));

  const monthSet = filters.months.length ? new Set(filters.months) : null;
  const exMonthSet = filters.exMonths.length ? new Set(filters.exMonths) : null;

  return data.meetings.filter((m) => {
    if (!ids.has(m.dealId)) return false;
    if (filters.year !== null && m.date.slice(0, 4) !== filters.year) return false;
    if (monthSet && !monthSet.has(m.month)) return false;
    if (exMonthSet && exMonthSet.has(m.month)) return false;
    if (filters.dateFrom && m.date < filters.dateFrom) return false;
    if (filters.dateTo && m.date > filters.dateTo) return false;
    return true;
  });
}

/**
 * Rojo (poca actividad) → amarillo → verde (mucha), aclarado un 45 % hacia
 * blanco para que el número siga siendo legible encima. Es la misma escala del
 * dashboard original, así que las celdas se leen igual que en el HTML.
 */
function heatColor(v: number, max: number): string {
  const t = v / max;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);

  if (t <= 0.5) {
    const k = t / 0.5;
    return `rgb(${mix(210)},${mix(Math.round(80 + k * 130))},${mix(80)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgb(${mix(Math.round(210 - k * 130))},${mix(Math.round(210 - k * 40))},${mix(Math.round(80 + k * 20))})`;
}

interface Heat {
  /** `grid[día][columna]`; la última columna es "Sin hora". */
  grid: number[][];
  rowTotals: number[];
  colTotals: number[];
  total: number;
  max: number;
}

function agregar(meetings: Meeting[]): Heat {
  // Una columna por hora de la franja, más la de "Sin hora" al final.
  const ncols = HORA_FIN - HORA_INICIO + 2;
  const sinHora = ncols - 1;
  const grid = Array.from({ length: 7 }, () => new Array<number>(ncols).fill(0));

  for (const m of meetings) {
    const col = m.hour !== null && m.hour >= HORA_INICIO && m.hour <= HORA_FIN ? m.hour - HORA_INICIO : sinHora;
    grid[m.weekday][col] += 1;
  }

  const rowTotals = grid.map((row) => row.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: ncols }, (_, c) => grid.reduce((s, row) => s + row[c], 0));

  return {
    grid,
    rowTotals,
    colTotals,
    total: rowTotals.reduce((s, v) => s + v, 0),
    // El máximo tiñe la celda más cargada de verde; `1` evita dividir por cero.
    max: Math.max(1, ...grid.flat()),
  };
}

function MapaCalorReuniones({ meetings }: { meetings: Meeting[] }) {
  const heat = useMemo(() => agregar(meetings), [meetings]);

  if (heat.total === 0) {
    return <p className="mt-3 text-xs text-muted">Sin reuniones agendadas en el filtro actual.</p>;
  }

  const horas = Array.from({ length: HORA_FIN - HORA_INICIO + 1 }, (_, i) => `${HORA_INICIO + i}:00`);
  const columnas = [...horas, 'Sin hora'];
  const sinHora = columnas.length - 1;

  const th = 'border border-border bg-[#f8f9fc] px-1.5 py-1 text-center text-2xs font-bold text-dim whitespace-nowrap';
  const totalCell = 'border border-border bg-bg px-1.5 py-1 text-center text-xs font-extrabold';
  const dashed = { borderLeft: '2px dashed #e2e5ef' };

  return (
    // Siete filas fijas: nunca hay scroll vertical. El horizontal sí aparece en
    // pantallas angostas, y por eso la columna de días queda fija.
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr>
            <th className={`${th} sticky left-0 z-10`}>Día / Hora</th>
            {columnas.map((c, i) => (
              <th key={c} className={`${th} ${i === sinHora ? 'text-muted' : ''}`} style={i === sinHora ? dashed : undefined}>
                {c}
              </th>
            ))}
            <th className={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {DIAS.map((dia, d) => (
            <tr key={dia}>
              <th className={`${th} sticky left-0 z-10 ${d >= 5 ? 'bg-accent-soft' : ''}`}>{dia}</th>
              {heat.grid[d].map((v, c) => (
                <td
                  key={c}
                  className={`border border-border px-1.5 py-1 text-center text-xs ${
                    v ? 'font-semibold text-text' : 'text-muted'
                  } ${c === sinHora ? 'opacity-75' : ''}`}
                  style={{
                    ...(c === sinHora ? dashed : {}),
                    background: v ? heatColor(v, heat.max) : undefined,
                  }}
                >
                  {v || ''}
                </td>
              ))}
              <td className={totalCell}>{heat.rowTotals[d] || ''}</td>
            </tr>
          ))}
          <tr>
            <th className={`${th} sticky left-0 z-10 border-t-2 border-t-accent`}>Total</th>
            {heat.colTotals.map((v, c) => (
              <td
                key={c}
                className={`${totalCell} border-t-2 border-t-accent ${c === sinHora ? 'text-muted' : ''}`}
                style={c === sinHora ? dashed : undefined}
              >
                {v || ''}
              </td>
            ))}
            <td className="border-2 border-accent bg-accent px-1.5 py-1 text-center text-xs font-black text-white">
              {heat.total}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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
