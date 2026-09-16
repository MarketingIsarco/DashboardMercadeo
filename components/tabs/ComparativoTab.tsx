'use client';

import { useMemo, useState } from 'react';
import { TasasMercado } from '@/components/TasasMercado';
import { DataTable } from '@/components/ui/DataTable';
import { MonthSelect } from '@/components/ui/MonthSelect';
import { Popover } from '@/components/ui/Popover';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { PROJECTS } from '@/lib/config/negocio';
import {
  SCOPE_LABEL,
  SCOPE_NOTE,
  bolsaDelProyecto,
  cohortesDeVentana,
  filasOutbound,
  filasPorCampana,
  filasPorFuente,
  filasPorMotivo,
  intensidad,
  leadsPorMes,
  tasa,
  variacion,
  ventanaTrimestre,
} from '@/lib/cohortes';
import type { Cohorte, Scope } from '@/lib/cohortes';
import { fmtCOP, monthLabel } from '@/lib/format';
import { availableMonths } from '@/lib/selectors';
import type { TabProps } from '@/lib/selectors';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PESTAÑA COMPARATIVO
 *
 * Tres cohortes mensuales de un proyecto, leídas de corrido. Reemplaza al
 * comparativo de "mes A contra mes B", que sólo respondía la pregunta más
 * pobre: cuál de los dos fue más grande. Con tres meses se ve la pendiente, y
 * la maduración explica por qué el mes más reciente siempre parece peor.
 *
 * Igual que el comparativo anterior, usa **controles propios** y no responde a
 * la barra de filtros global: el informe necesita un solo proyecto a la vez, y
 * la barra permite seleccionar varios.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'dig', label: 'Digital' },
  { value: 'nod', label: 'No digital' },
  { value: 'all', label: 'Todas' },
];

/** Etapas del embudo. "Contactado" queda fuera: en Pipedrive todo trato entra ahí. */
const PASOS: Array<{ nombre: string; de: (c: Cohorte) => number }> = [
  { nombre: 'Leads captados', de: (c) => c.leads },
  { nombre: 'Citas agendadas', de: (c) => c.citas },
  { nombre: 'Visitas', de: (c) => c.visitas },
  { nombre: 'Negociación', de: (c) => c.neg },
  { nombre: 'Separación', de: (c) => c.sep },
];

const nf = new Intl.NumberFormat('es-CO');
const n0 = (v: number) => nf.format(v);

/** Porcentaje con un decimal y coma, o raya cuando no hay base. */
function pc(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`;
}

/** Fondo de una celda según qué tan lejos está del promedio del período. */
const HEAT: Record<number, string> = {
  3: 'bg-green/40',
  2: 'bg-green/20',
  1: 'bg-green/10',
  0: '',
  [-1]: 'bg-red/10',
  [-2]: 'bg-red/20',
  [-3]: 'bg-red/30',
};

function Delta({ v }: { v: ReturnType<typeof variacion> }) {
  if (!v) return <span className="text-muted">—</span>;
  const cls = v.plano ? 'text-muted' : v.bueno ? 'text-[#16a34a]' : 'text-red';
  const flecha = v.plano ? '→' : v.pct > 0 ? '↑' : '↓';
  return (
    <span className={`font-semibold ${cls}`}>
      {flecha}
      {Math.abs(v.pct).toFixed(1).replace('.', ',')}%
    </span>
  );
}

export function ComparativoTab({ data, meta }: TabProps) {
  const mesesConDatos = useMemo(() => availableMonths(data.leads), [data.leads]);

  const proyectosConLeads = useMemo(() => {
    const con = new Set(data.leads.map((l) => l.project));
    return PROJECTS.map((nombre, i) => ({ nombre, i })).filter(({ i }) => con.has(i));
  }, [data.leads]);

  const [proj, setProj] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('dig');
  const [cierreElegido, setCierre] = useState<string | null>(null);

  // Ambos caen a un valor válido si el elegido deja de existir: el proyecto por
  // defecto es el primero con leads, y el cierre el último mes con datos.
  const proyecto =
    proj !== null && proyectosConLeads.some((p) => p.i === proj)
      ? proj
      : (proyectosConLeads[0]?.i ?? 0);
  const cierre =
    cierreElegido && mesesConDatos.includes(cierreElegido)
      ? cierreElegido
      : mesesConDatos[mesesConDatos.length - 1];

  const vista = useMemo(() => {
    if (!cierre) return null;

    const ventana = ventanaTrimestre(cierre);
    const porMes = leadsPorMes(data.leads, proyecto, scope, meta.digitalSources);
    const cohortes = cohortesDeVentana(porMes, ventana, proyecto, scope);
    const ultimo = ventana.length - 1;

    // Referencia del color: el promedio del propio proyecto en el período.
    const totLeads = cohortes.reduce((a, c) => a + c.leads, 0);
    const baseCita = tasa(
      cohortes.reduce((a, c) => a + c.citas, 0),
      totLeads,
    );
    const baseVisita = tasa(
      cohortes.reduce((a, c) => a + c.visitas, 0),
      totLeads,
    );

    return {
      ventana,
      cohortes,
      ultimo,
      baseCita,
      baseVisita,
      fuentes: filasPorFuente(porMes, ventana, meta.sources),
      campanas: filasPorCampana(porMes.get(ventana[ultimo]) ?? [], meta.campaigns),
      motivos: filasPorMotivo(porMes, ventana),
      outbound: filasOutbound(data.leads, proyecto, ventana, meta.labels),
    };
  }, [data.leads, proyecto, scope, cierre, meta]);

  if (!vista) {
    return (
      <div className="section">
        <h2 className="section-title">Sin datos</h2>
        <p className="mt-1 text-xs text-dim">No hay leads para construir el comparativo.</p>
      </div>
    );
  }

  const { ventana, cohortes, ultimo, baseCita, baseVisita } = vista;
  const nombreProyecto = PROJECTS[proyecto];
  const esDigital = scope === 'dig';
  const tieneBolsa = bolsaDelProyecto(proyecto) !== null;

  return (
    <>
      {/* Controles propios */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-xl border border-border bg-card p-3">
        <Campo label="Proyecto">
          <Popover label={nombreProyecto} active width={220}>
            {(close) => (
              <div className="max-h-64 overflow-y-auto">
                {proyectosConLeads.map(({ nombre, i }) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setProj(i);
                      close();
                    }}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent-soft ${
                      i === proyecto ? 'font-semibold text-accent' : 'text-text'
                    }`}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        </Campo>

        <Campo label="Origen del lead">
          <Segmented label="Origen del lead" segments={SCOPES} value={scope} onChange={setScope} />
        </Campo>

        <Campo label="Mes de cierre">
          <MonthSelect
            value={cierre}
            months={mesesConDatos}
            onChange={setCierre}
            label="Mes de cierre del trimestre"
          />
        </Campo>

        <p className="ml-auto max-w-[46ch] text-2xs leading-snug text-muted">
          Este capítulo usa sus propios controles y no responde a la barra de filtros global.
          Cohorte por mes de creación del lead, contando la etapa máxima alcanzada aunque el trato
          se haya perdido después.
        </p>
      </div>

      {/* 01 · Las dos cifras que mandan */}
      <Section
        title="01 · Las dos cifras que mandan"
        sub={`${nombreProyecto} · ${SCOPE_NOTE[scope]} · ${monthLabel(ventana[0])} a ${monthLabel(
          ventana[ultimo],
        )}`}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Tasas
            titulo="Lead a cita agendada"
            cohortes={cohortes}
            valor={(c) => tasa(c.citas, c.leads)}
            pie={(c) => `${n0(c.citas)} de ${n0(c.leads)}`}
          />
          <Tasas
            titulo="Lead a visita realizada"
            cohortes={cohortes}
            valor={(c) => tasa(c.visitas, c.leads)}
            pie={(c) => `${n0(c.visitas)} de ${n0(c.leads)}`}
          />
        </div>
        <TasasMercado digital={null} nota="Esta pestaña no responde al filtro de Canal, así que muestra los dos." />
      </Section>

      {/* 02 · Inversión y costos unitarios */}
      <Section
        title="02 · Inversión y costos unitarios"
        sub="Presupuesto digital del P&G. Los costos unitarios sólo se calculan sobre leads digitales."
      >
        {!esDigital ? (
          <Aviso>
            La inversión digital sólo compra leads digitales. En la vista <b>{SCOPE_LABEL[scope]}</b>{' '}
            los costos unitarios quedan en blanco para no atribuirle gasto de pauta a leads que no
            vinieron de ella.
          </Aviso>
        ) : !tieneBolsa ? (
          <Aviso>
            <b>{nombreProyecto}</b> no tiene bolsa de presupuesto cargada en la configuración, así
            que no hay inversión contra la cual calcular costos.
          </Aviso>
        ) : null}
        <Inversion cohortes={cohortes} ventana={ventana} ultimo={ultimo} />
      </Section>

      {/* 03 · Embudo */}
      <Section
        title="03 · Embudo"
        sub="Cada barra es un mes. El porcentaje es la conversión desde el total de leads; la cifra de la derecha es el volumen."
      >
        <p className="mb-4 border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-xs text-dim">
          En Pipedrive todo trato entra directamente en <b>Contactado</b>, así que esa etapa siempre
          marcaría 100 % y no se muestra. Lo que sí dice algo es cuántos se quedaron ahí sin avanzar
          nunca:{' '}
          {ventana
            .map((m, i) => `${monthLabel(m)} ${pc(tasa(cohortes[i].estancados, cohortes[i].leads))}`)
            .join(', ')}
          .
        </p>
        <Embudo cohortes={cohortes} ventana={ventana} ultimo={ultimo} />
      </Section>

      {/* 04 · Maduración */}
      <Section
        title="04 · Maduración de cada cohorte"
        sub="Mientras más tratos abiertos, más pueden subir todavía las tasas de ese mes."
      >
        <DataTable
          rows={cohortes}
          columns={[
            { header: 'Mes de creación', cell: (r) => <b>{monthLabel(r.month)}</b> },
            { header: 'Leads', cell: (r) => n0(r.leads), align: 'right' },
            { header: 'Abiertos', cell: (r) => n0(r.abiertos), align: 'right' },
            { header: '% abierto', cell: (r) => pc(tasa(r.abiertos, r.leads)), align: 'right' },
            { header: 'Perdidos', cell: (r) => n0(r.perdidos), align: 'right' },
            { header: 'Ganados', cell: (r) => n0(r.ganados), align: 'right' },
            {
              header: 'Lectura',
              cell: (r) => {
                if (r.leads === 0) return <span className="text-muted">Sin leads en el mes</span>;
                return (tasa(r.abiertos, r.leads) ?? 0) > 20 ? (
                  <span className="text-accent">Las tasas todavía son un piso</span>
                ) : (
                  <span className="text-dim">Cohorte cerrada, tasas definitivas</span>
                );
              },
            },
          ]}
        />
      </Section>

      {/* 05 · Fuentes */}
      <Section
        title={`05 · ${
          scope === 'dig'
            ? 'Fuentes digitales'
            : scope === 'nod'
              ? 'Fuentes no digitales'
              : 'Todas las fuentes'
        }`}
        sub={
          <>
            El color compara cada tasa contra el promedio del proyecto en el período: verde por
            encima, rojo por debajo. Referencia: lead a cita <b>{pc(baseCita)}</b>, lead a visita{' '}
            <b>{pc(baseVisita)}</b>. Las fuentes con menos de ocho leads en el mes van sin color.
          </>
        }
      >
        <Fuentes
          filas={vista.fuentes}
          ventana={ventana}
          ultimo={ultimo}
          cohortes={cohortes}
          baseCita={baseCita}
          baseVisita={baseVisita}
        />
      </Section>

      {/* 06 · Campaña por campaña */}
      <Section
        title="06 · Campaña por campaña"
        sub={`Campañas de ${monthLabel(
          ventana[ultimo],
        )} con cinco leads o más. La ventana es la captación real: del primer al último lead que trajo la campaña.`}
      >
        <DataTable
          rows={vista.campanas}
          empty="Ninguna campaña alcanza cinco leads en el mes de cierre."
          columns={[
            { header: 'Campaña', cell: (r) => <b>{r.campana}</b> },
            {
              header: 'Ventana',
              cell: (r) => (
                <span className="whitespace-nowrap text-dim">
                  {r.desde.slice(8)}/{r.desde.slice(5, 7)} a {r.hasta.slice(8)}/
                  {r.hasta.slice(5, 7)}
                </span>
              ),
            },
            { header: 'Días', cell: (r) => r.dias, align: 'right' },
            { header: 'Leads', cell: (r) => n0(r.leads), align: 'right' },
            {
              header: 'Lead a cita',
              cell: (r) => <Heat v={tasa(r.citas, r.leads)} base={baseCita} mudo={r.leads < 8} />,
              align: 'right',
            },
            {
              header: 'Lead a visita',
              cell: (r) => (
                <Heat v={tasa(r.visitas, r.leads)} base={baseVisita} mudo={r.leads < 8} />
              ),
              align: 'right',
            },
            { header: 'Cita a visita', cell: (r) => pc(tasa(r.visitas, r.citas)), align: 'right' },
            { header: 'Abiertos', cell: (r) => n0(r.abiertos), align: 'right' },
            {
              header: 'Pérdida dominante',
              cell: (r) => <span className="text-dim">{r.motivoTop}</span>,
            },
          ]}
        />
      </Section>

      {/* 07 · Por qué se pierden */}
      <Section
        title="07 · Por qué se pierden"
        sub="Participación sobre los tratos perdidos de cada mes, no sobre los leads totales."
      >
        <Motivos filas={vista.motivos} ventana={ventana} ultimo={ultimo} cohortes={cohortes} />
      </Section>

      {/* 08 · Campañas outbound */}
      <Section
        title="08 · Campañas outbound"
        sub="Leads existentes reimpactados desde mercadeo, por etiqueta del trato. No son leads nuevos, y no dependen del filtro de origen."
      >
        <DataTable
          rows={vista.outbound}
          empty="Sin etiquetas outbound con leads en el período."
          columns={[
            { header: 'Etiqueta', cell: (r) => <b>{r.etiqueta}</b> },
            { header: 'Leads marcados', cell: (r) => n0(r.leads), align: 'right' },
            {
              header: 'Meses activos',
              cell: (r) => (
                <span className="text-dim">
                  {r.meses.map((m) => monthLabel(m)).join(', ') || '—'}
                </span>
              ),
            },
            { header: 'Citas', cell: (r) => n0(r.citas), align: 'right' },
            { header: 'Lead a cita', cell: (r) => pc(tasa(r.citas, r.leads)), align: 'right' },
            { header: 'Visitas', cell: (r) => n0(r.visitas), align: 'right' },
            { header: 'Ganados', cell: (r) => n0(r.ganados), align: 'right' },
            {
              header: 'Pérdida dominante',
              cell: (r) => <span className="text-dim">{r.motivoTop}</span>,
            },
          ]}
        />
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Piezas
// ─────────────────────────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 border-l-[3px] border-gold bg-gold/10 px-3 py-2 text-xs text-dim">
      {children}
    </p>
  );
}

function Heat({ v, base, mudo }: { v: number | null; base: number | null; mudo?: boolean }) {
  // Con menos de ocho leads la tasa es anécdota: se muestra el número pero sin
  // color, para no coronar a quien tuvo dos leads y una cita.
  const nivel = mudo ? 0 : intensidad(v, base);
  return <span className={`rounded px-1.5 py-0.5 ${HEAT[nivel]}`}>{pc(v)}</span>;
}

/** Trío de barras verticales con la tasa de cada mes. */
function Tasas({
  titulo,
  cohortes,
  valor,
  pie,
}: {
  titulo: string;
  cohortes: Cohorte[];
  valor: (c: Cohorte) => number | null;
  pie: (c: Cohorte) => string;
}) {
  const vals = cohortes.map(valor);
  const max = Math.max(...vals.map((v) => v ?? 0), 1);

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <p className="mb-3 text-xs font-semibold text-dim">{titulo}</p>
      <div className="grid grid-cols-3 items-end gap-3" style={{ minHeight: 176 }}>
        {cohortes.map((c, i) => {
          const esUltimo = i === cohortes.length - 1;
          return (
            <div key={c.month} className="text-center">
              <div
                className={`mb-1.5 text-xl font-extrabold ${esUltimo ? 'text-accent' : 'text-text'}`}
              >
                {pc(vals[i])}
              </div>
              <div
                className={`mx-auto w-full rounded-t-[3px] bg-accent ${
                  esUltimo ? 'opacity-90' : 'opacity-30'
                }`}
                style={{ height: Math.max(6, (104 * (vals[i] ?? 0)) / max) }}
              />
              <div className="mt-2 text-xs font-medium text-dim">{monthLabel(c.month)}</div>
              <div className="text-2xs text-muted">{pie(c)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FilaInversion {
  label: string;
  valor: (c: Cohorte) => number | null;
  fmt: (v: number | null) => string;
  menosEsMejor?: boolean;
}

function Inversion({
  cohortes,
  ventana,
  ultimo,
}: {
  cohortes: Cohorte[];
  ventana: string[];
  ultimo: number;
}) {
  const cop = (v: number | null) => (v === null ? '—' : fmtCOP(v));
  const ent = (v: number | null) => (v === null ? '—' : n0(v));
  const div = (a: number | null, b: number) => (a === null || !b ? null : a / b);

  const filas: FilaInversion[] = [
    { label: 'Inversión real en pauta', valor: (c) => c.inversion, fmt: cop },
    { label: 'Leads', valor: (c) => c.leads, fmt: ent },
    {
      label: 'Costo por lead',
      valor: (c) => div(c.inversion, c.leads),
      fmt: cop,
      menosEsMejor: true,
    },
    { label: 'Citas agendadas', valor: (c) => c.citas, fmt: ent },
    {
      label: 'Costo por cita',
      valor: (c) => div(c.inversion, c.citas),
      fmt: cop,
      menosEsMejor: true,
    },
    { label: 'Visitas realizadas', valor: (c) => c.visitas, fmt: ent },
    {
      label: 'Costo por visita',
      valor: (c) => div(c.inversion, c.visitas),
      fmt: cop,
      menosEsMejor: true,
    },
    { label: 'Cita a visita', valor: (c) => tasa(c.visitas, c.citas), fmt: pc },
  ];

  return (
    <DataTable
      rows={filas}
      columns={[
        { header: 'Indicador', cell: (r) => <b>{r.label}</b> },
        ...ventana.map((m, i) => ({
          header: monthLabel(m),
          align: 'right' as const,
          cell: (r: FilaInversion) => (
            <span className={i === ultimo ? 'font-semibold text-text' : undefined}>
              {r.fmt(r.valor(cohortes[i]))}
            </span>
          ),
        })),
        {
          header: `${monthLabel(ventana[ultimo])} vs ${monthLabel(ventana[ultimo - 1])}`,
          align: 'right' as const,
          cell: (r: FilaInversion) => (
            <Delta
              v={variacion(r.valor(cohortes[ultimo]), r.valor(cohortes[ultimo - 1]), r.menosEsMejor)}
            />
          ),
        },
      ]}
    />
  );
}

function Embudo({
  cohortes,
  ventana,
  ultimo,
}: {
  cohortes: Cohorte[];
  ventana: string[];
  ultimo: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg px-4 py-2">
      {PASOS.map((paso) => (
        <div
          key={paso.nombre}
          className="grid items-center gap-4 border-b border-border py-2.5 last:border-b-0 md:grid-cols-[150px_1fr]"
        >
          <div className="text-xs font-medium text-dim">{paso.nombre}</div>
          <div className="grid gap-1.5">
            {cohortes.map((c, i) => {
              const v = paso.de(c);
              const p = tasa(v, c.leads) ?? 0;
              const esUltimo = i === ultimo;
              const dentro = p > 16;
              return (
                <div key={c.month} className="grid grid-cols-[1fr_150px] items-center gap-3">
                  <div className="relative h-[18px] overflow-hidden rounded-[3px] bg-border/60">
                    <div
                      className={`absolute inset-y-0 left-0 bg-accent ${
                        esUltimo ? 'opacity-90' : 'opacity-30'
                      }`}
                      style={{ width: `${Math.max(0.4, p)}%` }}
                    />
                    <span
                      className={`absolute top-[2px] text-2xs font-semibold ${
                        dentro ? 'text-white' : 'text-dim'
                      }`}
                      style={
                        dentro
                          ? {
                              left: `${Math.min(p - 1, 97)}%`,
                              transform: 'translateX(-100%)',
                              paddingRight: 6,
                            }
                          : { left: `${Math.max(0.4, p)}%`, paddingLeft: 6 }
                      }
                    >
                      {pc(tasa(v, c.leads))}
                    </span>
                  </div>
                  <div className={`text-right text-2xs ${esUltimo ? 'text-text' : 'text-muted'}`}>
                    {monthLabel(ventana[i])} · <b className="font-semibold text-text">{n0(v)}</b>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Fuentes({
  filas,
  ventana,
  ultimo,
  cohortes,
  baseCita,
  baseVisita,
}: {
  filas: ReturnType<typeof filasPorFuente>;
  ventana: string[];
  ultimo: number;
  cohortes: Cohorte[];
  baseCita: number | null;
  baseVisita: number | null;
}) {
  if (filas.length === 0) {
    return <p className="mt-3 text-xs text-muted">Sin fuentes con leads en el período.</p>;
  }

  const corto = (m: string) => monthLabel(m).slice(0, 3);
  const destacado = (i: number) => (i === ultimo ? 'bg-accent-soft' : '');

  return (
    <div className="overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            <th />
            {['Leads', 'Lead a cita', 'Lead a visita'].map((g) => (
              <th key={g} colSpan={3} className="text-center text-2xs uppercase tracking-wide">
                {g}
              </th>
            ))}
          </tr>
          <tr>
            <th>Fuente</th>
            {[0, 1, 2].map((bloque) =>
              ventana.map((m, i) => (
                <th key={`${bloque}-${m}`} className={`text-right ${destacado(i)}`}>
                  {corto(m)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.fuente}>
              <td>
                <b>{f.fuente}</b>
              </td>
              {ventana.map((m, i) => (
                <td key={`l-${m}`} className={`text-right ${destacado(i)}`}>
                  {n0(f.leads[i])}
                </td>
              ))}
              {ventana.map((m, i) => (
                <td key={`c-${m}`} className={`text-right ${destacado(i)}`}>
                  {f.leads[i] ? (
                    <Heat v={tasa(f.citas[i], f.leads[i])} base={baseCita} mudo={f.leads[i] < 8} />
                  ) : (
                    '—'
                  )}
                </td>
              ))}
              {ventana.map((m, i) => (
                <td key={`v-${m}`} className={`text-right ${destacado(i)}`}>
                  {f.leads[i] ? (
                    <Heat
                      v={tasa(f.visitas[i], f.leads[i])}
                      base={baseVisita}
                      mudo={f.leads[i] < 8}
                    />
                  ) : (
                    '—'
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td>
              <b className="uppercase tracking-wide text-accent">Total</b>
            </td>
            {cohortes.map((c) => (
              <td key={`tl-${c.month}`} className="text-right font-semibold text-text">
                {n0(c.leads)}
              </td>
            ))}
            {cohortes.map((c) => (
              <td key={`tc-${c.month}`} className="text-right font-semibold text-text">
                {pc(tasa(c.citas, c.leads))}
              </td>
            ))}
            {cohortes.map((c) => (
              <td key={`tv-${c.month}`} className="text-right font-semibold text-text">
                {pc(tasa(c.visitas, c.leads))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Motivos({
  filas,
  ventana,
  ultimo,
  cohortes,
}: {
  filas: ReturnType<typeof filasPorMotivo>;
  ventana: string[];
  ultimo: number;
  cohortes: Cohorte[];
}) {
  if (filas.length === 0) {
    return <p className="mt-3 text-xs text-muted">Sin tratos perdidos en esta vista.</p>;
  }

  // Escala común a toda la rejilla: si cada barra se normalizara contra su
  // propia fila, un motivo del 3 % se vería igual de largo que uno del 60 %.
  const max = Math.max(...filas.flatMap((f) => f.pct), 1);

  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="grid gap-4 border-b border-border px-4 py-2.5 md:grid-cols-[220px_1fr]">
        <div className="text-2xs font-semibold uppercase tracking-wide text-muted">
          Motivo agrupado
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {ventana.map((m, i) => (
            <div key={m} className="text-2xs text-muted">
              {monthLabel(m)} · {n0(cohortes[i].perdidos)} perdidos
            </div>
          ))}
        </div>
      </div>

      {filas.map((f) => (
        <div
          key={f.motivo}
          className="grid gap-4 border-b border-border px-4 py-2 last:border-b-0 md:grid-cols-[220px_1fr]"
        >
          <div className="self-center text-xs text-dim">{f.motivo}</div>
          <div className="grid grid-cols-3 gap-2.5">
            {f.pct.map((p, i) => (
              <div key={i} className="relative h-[28px] overflow-hidden rounded-[3px] bg-border/60">
                <div
                  className={`absolute inset-y-0 left-0 bg-accent ${
                    i === ultimo ? 'opacity-55' : 'opacity-25'
                  }`}
                  style={{ width: `${(100 * p) / max}%` }}
                />
                <span className="absolute left-2 top-[6px] text-xs font-semibold text-text">
                  {pc(p)}
                </span>
                <span className="absolute right-2 top-[7px] text-2xs text-muted">{f.n[i]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
