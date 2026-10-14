'use client';

import { useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ChartBox } from '@/components/charts/ChartBox';
import { pctLabelsBar, pctLabelsDoughnut } from '@/components/charts/pctLabels';
import { GRID_COLOR, TICK_COLOR, legendBottom } from '@/components/charts/setup';
import { KpisGenerales } from '@/components/tabs/ComercialTab';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { Popover } from '@/components/ui/Popover';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import {
  FICHA_AREA,
  FICHA_INM_CAMPOS,
  FICHA_PRESUPUESTO,
  FICHA_TIPO,
  INMOBILIARIA_IDX,
  PERFIL_COLORS,
  PROJECTS,
  SOURCE_COLORS,
  SOURCE_FALLBACK,
} from '@/lib/config/negocio';
import {
  distAcabados,
  distBuckets,
  distCategoria,
  distFuente,
  esInmobiliaria,
  filasCliente,
  filtrarPanel,
  porEtapa,
  resumenPanel,
} from '@/lib/fichaInm';
import type { Distribucion, FilaCliente } from '@/lib/fichaInm';
import { fmtCOP, normalize, pct } from '@/lib/format';
import type { TabProps } from '@/lib/selectors';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Pestaña COMERCIAL INM — el tablero de los asesores de la inmobiliaria.
 *
 * Mismo capítulo 01 que Comercial COIS, pero sobre los tratos de Oficinas,
 * Locales, Bodegas, Coworking y Otros Inmuebles, siempre: la barra principal
 * puede recortar dentro de ellos, nunca sacar de aquí un trato de Inari.
 *
 * El capítulo 02 es el panel del asesor: un filtro propio de embudo (pipeline)
 * y de asesor que mueve todas sus gráficas y la tabla de clientes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ESTADO_COLOR = { abiertos: '#6366f1', ganados: '#4ade80', perdidos: '#f43f5e' };

export function ComercialInmTab({ filtered, ganados, filters, meta }: TabProps) {
  const leads = useMemo(() => filtered.filter(esInmobiliaria), [filtered]);
  const gan = useMemo(() => ganados.filter(esInmobiliaria), [ganados]);

  if (leads.length === 0 && gan.length === 0) {
    return (
      <div className="section">
        <h2 className="section-title">Sin negocios de la inmobiliaria</h2>
        <p className="mt-1 text-xs text-dim">
          Con los filtros activos no hay tratos de Oficinas, Locales, Bodegas, Coworking ni Otros Inmuebles. Revisa
          el filtro de Proyecto.
        </p>
      </div>
    );
  }

  return (
    <>
      <KpisGenerales filtered={leads} ganados={gan} filters={filters} />
      <PanelAsesor leads={leads} meta={meta} />
    </>
  );
}

// ── 02 · Gestión Comercial ───────────────────────────────────────────

function PanelAsesor({ leads, meta }: { leads: TabProps['filtered']; meta: TabProps['meta'] }) {
  const [proyecto, setProyecto] = useState<number | null>(null);
  const [asesor, setAsesor] = useState<number | null>(null);

  // Sólo los embudos y asesores que tienen tratos con los filtros de arriba.
  const embudos = useMemo(
    () => INMOBILIARIA_IDX.filter((p) => leads.some((l) => l.project === p)),
    [leads],
  );
  const asesores = useMemo(() => {
    const n = new Map<number, number>();
    for (const l of leads) if (proyecto === null || l.project === proyecto) n.set(l.advisor, (n.get(l.advisor) ?? 0) + 1);
    return [...n.entries()]
      .map(([i, c]) => ({ i, name: meta.advisors[i] ?? 'Sin asignar', n: c }))
      .sort((a, b) => b.n - a.n);
  }, [leads, proyecto, meta.advisors]);

  // Si la barra principal saca el embudo o el asesor escogido, se vuelve a "Todos".
  const proyectoVigente = proyecto !== null && embudos.includes(proyecto) ? proyecto : null;
  const asesorVigente = asesor !== null && asesores.some((a) => a.i === asesor) ? asesor : null;

  const panel = useMemo(
    () => filtrarPanel(leads, { proyecto: proyectoVigente, asesor: asesorVigente }),
    [leads, proyectoVigente, asesorVigente],
  );

  const r = useMemo(() => resumenPanel(panel, meta), [panel, meta]);
  const etapas = useMemo(() => porEtapa(panel, meta, proyectoVigente), [panel, meta, proyectoVigente]);
  const tipo = useMemo(() => distCategoria(panel, meta, FICHA_TIPO), [panel, meta]);
  const acab = useMemo(() => distAcabados(panel, meta), [panel, meta]);
  const fuente = useMemo(() => distFuente(panel, meta), [panel, meta]);
  const presupuesto = useMemo(() => distBuckets(panel, FICHA_PRESUPUESTO), [panel]);
  const area = useMemo(() => distBuckets(panel, FICHA_AREA), [panel]);
  const filas = useMemo(() => filasCliente(panel, meta), [panel, meta]);

  const ausentes = FICHA_INM_CAMPOS.filter((_, i) => meta.ficha?.[i]?.ausente).map((c) => c.alias[0]);
  const nombreAsesor = asesores.find((a) => a.i === asesorVigente)?.name;

  return (
    <Section
      title="02 · Gestión Comercial"
      sub={`Negocios por embudo · ${panel.length.toLocaleString('es-CO')} clientes${
        proyectoVigente !== null ? ` en ${PROJECTS[proyectoVigente]}` : ''
      }${nombreAsesor ? ` de ${nombreAsesor}` : ''}`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-dim">Embudo</span>
        <Segmented<number | null>
          label="Embudo"
          value={proyectoVigente}
          onChange={setProyecto}
          segments={[{ value: null, label: 'Todos' }, ...embudos.map((p) => ({ value: p, label: PROJECTS[p] }))]}
        />
        <span className="ml-2 text-2xs font-semibold uppercase tracking-wide text-dim">Asesor</span>
        <Popover label={nombreAsesor ?? 'Todos los asesores'} active={asesorVigente !== null} width={260}>
          {(close) => (
            <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Asesor">
              {[{ i: null as number | null, name: 'Todos los asesores', n: asesores.reduce((s, a) => s + a.n, 0) }, ...asesores].map(
                (a) => (
                  <button
                    key={String(a.i)}
                    type="button"
                    role="option"
                    aria-selected={a.i === asesorVigente}
                    onClick={() => {
                      setAsesor(a.i);
                      close();
                    }}
                    className={`flex justify-between rounded-md px-2 py-1 text-left text-xs ${
                      a.i === asesorVigente ? 'bg-accent-soft text-accent' : 'text-dim hover:bg-bg hover:text-accent'
                    }`}
                  >
                    <span>{a.name}</span>
                    <span className="text-muted">{a.n}</span>
                  </button>
                ),
              )}
            </div>
          )}
        </Popover>
      </div>

      {ausentes.length ? (
        <p className="mb-3 text-2xs font-medium text-red">
          No se encontraron en Pipedrive los campos: {ausentes.join(', ')}. Se muestran como “Sin dato” hasta que se
          corrija el nombre en el CRM o en la configuración del dashboard.
        </p>
      ) : null}

      <KpiGrid>
        <Kpi size="sm" label="Clientes" value={r.negocios.toLocaleString('es-CO')} meta="En el embudo y filtro actual" />
        <Kpi size="sm" label="Abiertos" value={r.abiertos.toLocaleString('es-CO')} meta={`${pct(r.abiertos, r.negocios)}% de los clientes`} />
        <Kpi
          size="sm"
          label="En negociación o más"
          value={r.avanzados.toLocaleString('es-CO')}
          meta={`${pct(r.avanzados, r.abiertos)}% de los abiertos`}
        />
        <Kpi
          size="sm"
          label="Presupuesto abierto"
          value={fmtCOP(r.presupuestoAbierto)}
          meta={`Declarado por ${r.conPresupuesto} de ${r.abiertos} abiertos`}
        />
        <Kpi
          size="sm"
          label="Ficha completa"
          value={`${pct(r.fichaCompleta, r.negocios)}%`}
          meta={`${r.fichaCompleta} con inmueble, tipo, entrega, presupuesto y área`}
        />
      </KpiGrid>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-dim">Negocios por Etapa del Embudo</h3>
          <p className="mb-2 text-2xs text-muted">Etapa actual en Pipedrive · abiertos, ganados y perdidos</p>
          <ChartBox height={280}>
            <Bar
              data={{
                labels: etapas.etapas,
                datasets: [
                  { label: 'Abiertos', data: etapas.abiertos, backgroundColor: `${ESTADO_COLOR.abiertos}cc`, borderRadius: 3 },
                  { label: 'Ganados', data: etapas.ganados, backgroundColor: `${ESTADO_COLOR.ganados}cc`, borderRadius: 3 },
                  { label: 'Perdidos', data: etapas.perdidos, backgroundColor: `${ESTADO_COLOR.perdidos}99`, borderRadius: 3 },
                ],
              }}
              options={{
                indexAxis: 'y' as const,
                plugins: { legend: legendBottom, tooltip: { mode: 'index', intersect: false } },
                scales: {
                  x: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, precision: 0 } },
                  y: { stacked: true, grid: { display: false }, ticks: { color: TICK_COLOR } },
                },
              }}
            />
          </ChartBox>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-dim">Fuente</h3>
          <p className="mb-2 text-2xs text-muted">Por dónde llegaron los clientes del embudo</p>
          <ChartBox height={280}>
            <Bar
              plugins={[pctLabelsBar]}
              data={{
                labels: fuente.items.map((i) => i.label),
                datasets: [
                  {
                    label: 'Clientes',
                    data: fuente.items.map((i) => i.n),
                    backgroundColor: fuente.items.map((i) => `${colorFuente(i.label)}cc`),
                    borderRadius: 3,
                  },
                ],
              }}
              options={{
                indexAxis: 'y' as const,
                layout: { padding: { right: 36 } },
                plugins: { legend: { display: false }, pctLabels: { total: fuente.conDato } },
                scales: {
                  x: { beginAtZero: true, grace: '10%', grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, precision: 0 } },
                  y: { grid: { display: false }, ticks: { color: TICK_COLOR } },
                },
              }}
            />
          </ChartBox>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Dona titulo="Tipo de Inmueble" dist={tipo} />
        <Dona titulo="Entrega con Acabados" dist={acab} colores={['#4ade80', '#94a3b8']} />
        <Histograma titulo="Presupuesto" dist={presupuesto} color={PERFIL_COLORS[0]} />
        <Histograma titulo="Área Requerida" dist={area} color={PERFIL_COLORS[2]} />
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold text-dim">Clientes del Embudo</h3>
        <p className="mb-2 text-2xs text-muted">
          Abiertos primero, de la etapa más avanzada a la más temprana; dentro de cada etapa, el más antiguo arriba.
        </p>
        <TablaClientes filas={filas} />
      </div>
    </Section>
  );
}

function colorFuente(label: string): string {
  return SOURCE_COLORS[label] ?? SOURCE_FALLBACK;
}

function Cobertura({ dist }: { dist: Distribucion }) {
  const total = dist.conDato + dist.sinDato;
  return (
    <p className="mb-2 text-2xs text-muted">
      {dist.conDato} de {total} con dato ({pct(dist.conDato, total)}%)
    </p>
  );
}

function Dona({ titulo, dist, colores }: { titulo: string; dist: Distribucion; colores?: string[] }) {
  const items = dist.items.filter((i) => i.n > 0);
  const paleta = colores ?? PERFIL_COLORS;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-dim">{titulo}</h3>
      <Cobertura dist={dist} />
      {dist.conDato === 0 ? (
        <p className="mt-6 text-center text-2xs text-muted">Nadie ha diligenciado este campo en el filtro actual.</p>
      ) : (
        <ChartBox height={220}>
          <Doughnut
            plugins={[pctLabelsDoughnut]}
            data={{
              labels: items.map((i) => i.label),
              datasets: [
                {
                  data: items.map((i) => i.n),
                  backgroundColor: items.map((i) => `${paleta[dist.items.indexOf(i) % paleta.length]}cc`),
                  borderColor: '#fff',
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              plugins: {
                legend: legendBottom,
                pctLabels: { total: dist.conDato, min: 3 },
                tooltip: {
                  callbacks: { label: (c) => `${c.label}: ${c.raw as number} (${pct(c.raw as number, dist.conDato)}%)` },
                },
              },
            }}
          />
        </ChartBox>
      )}
    </div>
  );
}

function Histograma({ titulo, dist, color }: { titulo: string; dist: Distribucion; color: string }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-dim">{titulo}</h3>
      <Cobertura dist={dist} />
      {dist.conDato === 0 ? (
        <p className="mt-6 text-center text-2xs text-muted">Nadie ha diligenciado este campo en el filtro actual.</p>
      ) : (
        <ChartBox height={220}>
          <Bar
            plugins={[pctLabelsBar]}
            data={{
              labels: dist.items.map((i) => i.label),
              datasets: [{ label: titulo, data: dist.items.map((i) => i.n), backgroundColor: `${color}cc`, borderRadius: 3 }],
            }}
            options={{
              layout: { padding: { top: 16 } },
              plugins: { legend: { display: false }, pctLabels: { total: dist.conDato } },
              scales: {
                x: { grid: { display: false }, ticks: { color: TICK_COLOR, font: { size: 9 } } },
                y: { beginAtZero: true, grace: '12%', grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, precision: 0 } },
              },
            }}
          />
        </ChartBox>
      )}
    </div>
  );
}

const ESTADO_PILL: Record<FilaCliente['estado'], string> = {
  Abierto: 'bg-accent-soft text-accent',
  Ganado: 'bg-green/20 text-[#16a34a]',
  Perdido: 'bg-red/20 text-red',
};

const vacio = <span className="text-muted">—</span>;

function TablaClientes({ filas }: { filas: FilaCliente[] }) {
  const [q, setQ] = useState('');
  const visibles = useMemo(() => {
    const t = normalize(q);
    if (!t) return filas;
    return filas.filter((f) =>
      normalize(`${f.cliente} ${f.telefono} ${f.inmueble} ${f.tipo} ${f.fuente} ${f.asesor} ${f.etapa}`).includes(t),
    );
  }, [filas, q]);

  const columns: Column<FilaCliente>[] = [
    {
      header: 'Cliente',
      cell: (f) => (
        <span className="block max-w-[180px] truncate font-medium text-text" title={f.cliente}>
          {f.cliente}
        </span>
      ),
    },
    { header: 'Embudo', cell: (f) => f.embudo },
    { header: 'Etapa', cell: (f) => f.etapa },
    {
      header: 'Estado',
      cell: (f) => <span className={`rounded-[10px] px-1.5 py-px text-[10px] font-semibold ${ESTADO_PILL[f.estado]}`}>{f.estado}</span>,
    },
    {
      header: 'Inmueble',
      cell: (f) =>
        f.inmueble ? (
          <span className="block max-w-[160px] truncate" title={f.inmueble}>
            {f.inmueble}
          </span>
        ) : (
          vacio
        ),
    },
    { header: 'Tipo', cell: (f) => f.tipo || vacio },
    {
      header: 'Acabados',
      align: 'center',
      cell: (f) => (f.acabados ? <span title={f.entrega}>{f.acabados}</span> : f.entrega ? <span title="Valor sin clasificar">{f.entrega}</span> : vacio),
    },
    { header: 'Presupuesto', align: 'right', cell: (f) => (f.presupuesto !== null ? fmtCOP(f.presupuesto) : vacio) },
    {
      header: 'Área (m²)',
      align: 'right',
      cell: (f) => (f.area !== null ? f.area.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : vacio),
    },
    { header: 'Fuente', cell: (f) => f.fuente },
    { header: 'Asesor', cell: (f) => f.asesor },
    { header: 'Días', align: 'right', cell: (f) => f.dias },
  ];

  return (
    <>
      <div className="mb-2 flex items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente, inmueble, fuente…"
          aria-label="Buscar en la tabla de clientes"
          className="w-72 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <span className="text-2xs text-muted">
          {visibles.length.toLocaleString('es-CO')} de {filas.length.toLocaleString('es-CO')} clientes
        </span>
      </div>
      <DataTable columns={columns} rows={visibles} maxHeight={520} empty="Ningún cliente coincide con la búsqueda." />
    </>
  );
}
