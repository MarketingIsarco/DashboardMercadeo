'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Kpi, KpiGrid } from '@/components/ui/Kpi';
import { Section } from '@/components/ui/Section';
import { CONSTRUCTORA_IDX, STAGES } from '@/lib/config/negocio';
import {
  ALARMAS,
  NIVELES,
  NIVEL_COLOR,
  UMBRAL_PROBABLE,
  calificarTodos,
  horaBogota,
  ordenAtencion,
} from '@/lib/prioridad';
import type { Bloque, Gravedad, LeadPrio, Nivel, TipoAlarma } from '@/lib/prioridad';
import { isAbierto } from '@/lib/selectors';
import type { TabProps } from '@/lib/selectors';

/**
 * Capítulos 01–04 de Comercial COIS: qué leads atender primero.
 *
 * Universo: los leads de la **constructora** que sobreviven a la barra
 * principal (periodo, proyecto, asesor, etapa…). El puntaje y las alarmas
 * están en `lib/prioridad.ts`; aquí sólo se pintan.
 */

const PASO = 25;
const PD = (id: number) => `https://isarco.pipedrive.com/deal/${id}`;

const CHIP: Record<Gravedad, string> = {
  roja: 'bg-red/10 text-[#9b2335]',
  naranja: 'bg-[#fff4dc] text-[#8a5a00]',
  azul: 'bg-cyan/10 text-accent',
};
const PUNTO: Record<Gravedad, string> = { roja: 'bg-red', naranja: 'bg-[#f2b134]', azul: 'bg-cyan' };
const ICONO: Record<Gravedad, string> = { roja: '!', naranja: '●', azul: '◷' };

function NivelTag({ nivel }: { nivel: Nivel }) {
  const i = NIVELES.indexOf(nivel);
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold"
      style={{ background: NIVEL_COLOR[nivel], color: i < 2 ? '#fff' : '#0f2433' }}
    >
      {nivel}
    </span>
  );
}

function fmtDias(d: number | null): string {
  if (d === null) return 'Sin gestión';
  return d < 1 ? 'Hoy' : `Hace ${Math.floor(d)} d`;
}

function fmtFecha(ms: number): string {
  const d = new Date(ms - 5 * 3_600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${horaBogota(ms)}`;
}

/** Se recalcula cada minuto: las alarmas dependen de la hora. */
function useAhora(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function PrioridadCois({ filtered, data, meta }: TabProps) {
  const now = useAhora();
  const cois = useMemo(() => filtered.filter((l) => CONSTRUCTORA_IDX.includes(l.project)), [filtered]);
  const abiertos = useMemo(() => cois.filter(isAbierto), [cois]);
  const P = useMemo(() => calificarTodos(cois, now), [cois, now]);

  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [alarma, setAlarma] = useState<TipoAlarma | null>(null);
  const [soloRoja, setSoloRoja] = useState(false);
  const [q, setQ] = useState('');
  const [lim, setLim] = useState(PASO);
  const [abiertosFila, setAbiertosFila] = useState<Set<number>>(new Set());

  // Cambiar cualquier filtro vuelve la lista a su primera página.
  useEffect(() => setLim(PASO), [nivel, alarma, soloRoja, q, filtered]);

  const cuenta = (f: (p: LeadPrio) => boolean) => P.reduce((n, p) => n + (f(p) ? 1 : 0), 0);
  const probables = cuenta((p) => p.puntaje >= UMBRAL_PROBABLE);
  const vencidas = cuenta((p) => p.alarmas.some((a) => a.tipo === 'venc'));
  const sinProx = cuenta((p) => p.alarmas.some((a) => a.tipo === 'sinprox'));

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return P.filter(
      (p) =>
        (!nivel || p.nivel === nivel) &&
        (!alarma || p.alarmas.some((a) => a.tipo === alarma)) &&
        (!soloRoja || p.alarmas.some((a) => a.gravedad === 'roja')) &&
        (!t || p.lead.name.toLowerCase().includes(t)),
    ).sort(ordenAtencion);
  }, [P, nivel, alarma, soloRoja, q]);

  const toggleFila = (id: number) =>
    setAbiertosFila((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      {/* 01 · Indicadores */}
      <Section
        title="01 · Indicadores"
        sub={`Inari 101 y Tinguazul dentro del filtro actual · ${P.length.toLocaleString('es-CO')} abiertos calificados`}
      >
        <KpiGrid cols={4}>
          <Kpi label="Leads del periodo" value={cois.length.toLocaleString('es-CO')} meta="Abiertos, perdidos y ganados" />
          <Kpi
            label="Leads abiertos"
            value={abiertos.length.toLocaleString('es-CO')}
            meta={`${cois.length ? Math.round((abiertos.length * 100) / cois.length) : 0} % de los leads del periodo`}
          />
          <Kpi
            label="Con probabilidad de cerrar"
            value={probables.toLocaleString('es-CO')}
            meta={`${cuenta((p) => p.nivel === 'Muy probable')} muy probables · ${cuenta((p) => p.nivel === 'Probable')} probables`}
          />
          <Kpi
            label="Gestión vencida"
            value={vencidas.toLocaleString('es-CO')}
            meta={`Próxima actividad ya pasó · ${sinProx} más sin actividad agendada`}
          />
        </KpiGrid>

        {P.length ? (
          <>
            <div className="mt-4 flex h-7 gap-0.5 overflow-hidden rounded-lg" aria-label="Leads abiertos por nivel de probabilidad">
              {NIVELES.map((n, i) => {
                const c = cuenta((p) => p.nivel === n);
                if (!c) return null;
                return (
                  <button
                    key={n}
                    type="button"
                    title={`${n}: ${c} — clic para filtrar la lista`}
                    onClick={() => setNivel(nivel === n ? null : n)}
                    className={`flex min-w-0 items-center justify-center text-[11px] font-bold transition-opacity ${
                      nivel && nivel !== n ? 'opacity-40' : ''
                    }`}
                    style={{ flex: c, background: NIVEL_COLOR[n], color: i < 3 ? '#fff' : '#0f2433' }}
                  >
                    {c / P.length > 0.03 ? c : ''}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-dim">
              {NIVELES.map((n) => {
                const c = cuenta((p) => p.nivel === n);
                return (
                  <span key={n} className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: NIVEL_COLOR[n] }} />
                    {n} <b className="text-text">{c}</b> ({P.length ? Math.round((c * 100) / P.length) : 0} %)
                  </span>
                );
              })}
            </div>
          </>
        ) : null}
      </Section>

      {/* 02 · Bandeja de alarmas */}
      <Section title="02 · Bandeja de Alarmas" sub="Leads abiertos que necesitan acción. Clic en una alarma para filtrar la lista del capítulo 03">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {ALARMAS.map((a) => {
            const c = cuenta((p) => p.alarmas.some((x) => x.tipo === a.tipo));
            const on = alarma === a.tipo;
            return (
              <button
                key={a.tipo}
                type="button"
                data-alarma={a.tipo}
                onClick={() => setAlarma(on ? null : a.tipo)}
                className={`flex flex-col justify-start rounded-xl border bg-card p-3 text-left transition-colors hover:border-accent-2 ${
                  on ? 'border-accent ring-2 ring-accent/30' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-text">
                  <span className={`inline-block h-2 w-2 rounded-full ${PUNTO[a.gravedad]}`} />
                  {a.titulo}
                </div>
                <div className="mt-1 text-2xl font-extrabold text-text">{c}</div>
                <div className="text-2xs leading-snug text-dim">{a.ayuda}</div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 03 · Atiende primero */}
      <Section
        title="03 · Atiende Primero"
        sub="Orden: gravedad de la alarma y después puntaje. Clic en un lead para ver por qué puntúa así"
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-dim">
            Probabilidad
            <select
              value={nivel ?? ''}
              onChange={(e) => setNivel((e.target.value || null) as Nivel | null)}
              className="rounded-lg border border-border bg-white px-2 py-1 text-xs text-text"
            >
              <option value="">Todas</option>
              {NIVELES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-dim">
            <input type="checkbox" checked={soloRoja} onChange={(e) => setSoloRoja(e.target.checked)} className="accent-accent" />
            Solo alarma roja
          </label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar lead"
            className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
          />
          {alarma ? (
            <button type="button" className="pill pill-on" onClick={() => setAlarma(null)}>
              {ALARMAS.find((a) => a.tipo === alarma)?.titulo} ×
            </button>
          ) : null}
          <span className="ml-auto text-xs text-dim" data-testid="prio-count">
            <b className="text-text">{lista.length}</b> de {P.length} leads abiertos
          </span>
        </div>

        {lista.length === 0 ? (
          <p className="mt-3 text-xs text-muted">Ningún lead abierto coincide con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="dt" data-testid="prio-tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Lead</th>
                  <th>Puntaje</th>
                  <th>Etapa</th>
                  <th>Última gestión</th>
                  <th>Próxima actividad</th>
                  <th>Alarmas</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, lim).map((p, i) => {
                  const abierto = abiertosFila.has(p.lead.id);
                  return (
                    <Fragment key={p.lead.id}>
                      <tr className="cursor-pointer align-top" onClick={() => toggleFila(p.lead.id)}>
                        <td className="text-muted">{i + 1}</td>
                        <td className="min-w-[180px]">
                          <a
                            href={PD(p.lead.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-bold text-accent hover:underline"
                          >
                            {p.lead.name}
                          </a>
                          <div className="text-2xs text-muted">
                            {meta.projects[p.lead.project]} · {meta.advisors[p.lead.advisor]}
                          </div>
                        </td>
                        <td className="min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <b className="w-6 text-right">{p.puntaje}</b>
                            <span className="h-1.5 flex-1 overflow-hidden rounded bg-border">
                              <i className="block h-full rounded" style={{ width: `${p.puntaje}%`, background: NIVEL_COLOR[p.nivel] }} />
                            </span>
                            <NivelTag nivel={p.nivel} />
                          </div>
                        </td>
                        <td>
                          {STAGES[p.lead.stage]}
                          <div className="text-2xs text-muted">{Math.floor(p.diasEtapa)} d en etapa</div>
                        </td>
                        <td className="whitespace-nowrap">{fmtDias(p.diasGestion)}</td>
                        <td>
                          {p.proximaMs !== null ? (
                            <>
                              {p.s.proximaAsunto || 'Actividad'}
                              <div className="text-2xs text-muted">{fmtFecha(p.proximaMs)}</div>
                            </>
                          ) : (
                            <span className="text-muted">Ninguna</span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {p.alarmas.length ? (
                              p.alarmas.map((a) => (
                                <span
                                  key={a.tipo}
                                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-semibold ${CHIP[a.gravedad]}`}
                                >
                                  <b aria-hidden>{ICONO[a.gravedad]}</b>
                                  {a.texto}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted">Al día</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {abierto ? (
                        <tr className="bg-panel2">
                          <td />
                          <td colSpan={6}>
                            <Desglose p={p} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {lista.length > lim ? (
          <button type="button" className="pill mx-auto mt-3 block" onClick={() => setLim(lim + PASO)}>
            Ver más ({lista.length - lim} restantes)
          </button>
        ) : null}

        <Metodologia />
      </Section>

      {/* 04 · Rendimiento por asesor */}
      <Rendimiento P={P} cois={cois} data={data} meta={meta} />
    </>
  );
}

const BLOQUES: Bloque[] = ['Etapa', 'Intención', 'Compromiso', 'Riesgo'];

function Desglose({ p }: { p: LeadPrio }) {
  return (
    <div className="py-1">
      <div className="grid gap-3 md:grid-cols-4">
        {BLOQUES.map((b) => {
          const fs = p.factores.filter((f) => f.bloque === b);
          const suma = fs.reduce((a, f) => a + f.puntos, 0);
          return (
            <div key={b}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                {b} <span className="text-text">{suma > 0 ? '+' : ''}{suma}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {fs.length ? (
                  fs.map((f) => (
                    <span
                      key={f.rotulo}
                      className={`rounded-md px-1.5 py-px text-[11px] font-semibold ${
                        f.puntos < 0 ? 'bg-red/10 text-[#9b2335]' : 'bg-green/10 text-[#0b6e47]'
                      }`}
                    >
                      {f.puntos > 0 ? '+' : ''}
                      {f.puntos} {f.rotulo}
                    </span>
                  ))
                ) : (
                  <span className="text-2xs text-muted">Sin señal</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {p.s.resumen ? (
        <p className="mt-2 text-xs leading-relaxed text-dim">
          <b className="text-text">Resumen ISA:</b> {p.s.resumen}…
        </p>
      ) : null}
      <p className="mt-1 text-2xs text-muted">
        {p.s.gestiones} gestiones de personas registradas · creado {p.lead.date}
      </p>
    </div>
  );
}

function Metodologia() {
  return (
    <details className="mt-4 rounded-xl border border-border bg-panel2 px-4 py-3 text-xs text-dim">
      <summary className="cursor-pointer font-bold text-accent">¿Cómo se calcula el puntaje y las alarmas?</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <table className="dt !mt-0">
          <thead>
            <tr>
              <th>Bloque</th>
              <th>Señal</th>
              <th style={{ textAlign: 'right' }}>Puntos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Etapa</td>
              <td>Interesado 4 · Contactado 10 · Cita 18 · Visitado 26 · Negociación 33 · Separación 35</td>
              <td className="whitespace-nowrap text-right font-bold">hasta 35</td>
            </tr>
            <tr>
              <td>Intención</td>
              <td>Zona en el formulario: principal o conoce y le gusta +12 · quiere conocerla +9 · entre varias o para invertir +6 · otra zona −8</td>
              <td className="whitespace-nowrap text-right font-bold">−8 a +12</td>
            </tr>
            <tr>
              <td>Intención</td>
              <td>Tipología del formulario: penthouse +10 · 3 hab o 90 m² +8 · 2 hab o 78 m² +6 · 1 hab o 68 m² +4</td>
              <td className="whitespace-nowrap text-right font-bold">+4 a +10</td>
            </tr>
            <tr>
              <td>Intención</td>
              <td>Conversó con ISA +8 · compra para vivir +3 · menciona ahorros o crédito +5 · ánimo en la llamada de ISA positivo +7 / negativo −10</td>
              <td className="whitespace-nowrap text-right font-bold">hasta +23</td>
            </tr>
            <tr>
              <td>Compromiso</td>
              <td>Gestión del asesor ≤3 d +10 · ≤7 d +6 · ≤14 d +3 · lead de menos de 72 h +6 · cita programada +8 · atendió llamada de ISA ≥30 s +5</td>
              <td className="whitespace-nowrap text-right font-bold">hasta +29</td>
            </tr>
            <tr>
              <td>Riesgo</td>
              <td>ISA: número equivocado −25 · ISA lo marcó no interesado −25 · 3er intento de reactivación sin respuesta −8 · en reactivación sin respuesta −4</td>
              <td className="whitespace-nowrap text-right font-bold">hasta −58</td>
            </tr>
          </tbody>
        </table>
        <div className="leading-relaxed">
          <p>
            La suma se lleva a escala 0–100 (80 puntos = 100). <b>Muy probable</b> ≥ 75 · <b>Probable</b> 55–74 ·{' '}
            <b>Neutro</b> 35–54 · <b>Poco probable</b> 15–34 · <b>Muy poco probable</b> &lt; 15. &quot;Con probabilidad de
            cerrar&quot; = Muy probable + Probable.
          </p>
          <p className="mt-2">
            Todo sale de lo que el CRM registra solo: etapa, fechas y tipos de actividades, el formulario de pauta y las notas
            que escribe ISA. <b>Ninguna señal depende de que el asesor llene un campo o escriba una nota.</b> Las actividades de
            ISA y Quiiven no cuentan como gestión del asesor.
          </p>
          <p className="mt-2">
            <b>Alarmas</b> (van aparte del puntaje): rojas — sin asesor, sin contacto &gt; 24 h, sin próxima actividad, gestión
            vencida ≥ 1 día, probable sin seguimiento. Naranjas — días en etapa por encima del límite de Pipedrive (2 · 2 · 3 ·
            5 · 3 · 3), gestión vencida hoy, cita pasada sin mover la etapa. Azul — cita hoy o mañana.
          </p>
        </div>
      </div>
    </details>
  );
}

function Rendimiento({
  P,
  cois,
  data,
  meta,
}: {
  P: LeadPrio[];
  cois: TabProps['filtered'];
  data: TabProps['data'];
  meta: TabProps['meta'];
}) {
  const filas = useMemo(() => {
    const ids = new Set(cois.map((l) => l.id));
    const gestiones = new Map<number, number>();
    for (const a of data.activityDays) {
      if (ids.has(a.dealId)) gestiones.set(a.advisor, (gestiones.get(a.advisor) ?? 0) + a.count);
    }
    const porAsesor = new Map<number, LeadPrio[]>();
    for (const p of P) {
      const l = porAsesor.get(p.lead.advisor) ?? [];
      l.push(p);
      porAsesor.set(p.lead.advisor, l);
    }
    const periodo = new Map<number, number>();
    for (const l of cois) periodo.set(l.advisor, (periodo.get(l.advisor) ?? 0) + 1);

    return [...periodo.keys()]
      .map((a) => {
        const c = porAsesor.get(a) ?? [];
        const embudo = STAGES.slice(0, 6).map((_, s) => c.filter((p) => p.lead.stage === s).length);
        return {
          // El dueño por defecto de ISA no es un asesor: se rotula para que no se lea como uno.
          asesor: `${meta.advisors[a] ?? `#${a}`}${c.length && c.every((p) => p.s.sinAsesor) ? ' (ISA, sin asesor)' : ''}`,
          periodo: periodo.get(a) ?? 0,
          cartera: c.length,
          embudo,
          probables: c.filter((p) => p.puntaje >= UMBRAL_PROBABLE).length,
          medio: c.length ? Math.round(c.reduce((s, p) => s + p.puntaje, 0) / c.length) : null,
          conProx: c.length ? Math.round((c.filter((p) => p.proximaMs !== null).length * 100) / c.length) : null,
          vencidas: c.filter((p) => p.alarmas.some((x) => x.tipo === 'venc')).length,
          rojas: c.filter((p) => p.urgencia === 3).length,
          estancados: c.filter((p) => p.alarmas.some((x) => x.tipo === 'est')).length,
          gestiones: gestiones.get(a) ?? 0,
        };
      })
      .sort((x, y) => y.cartera - x.cartera || y.periodo - x.periodo);
  }, [P, cois, data.activityDays, meta.advisors]);

  return (
    <Section
      title="04 · Rendimiento por Asesor"
      sub="Cartera abierta al momento y gestión sobre los leads del filtro. El asesor es el propietario del trato; las gestiones, de quien registró la actividad"
    >
      <div className="overflow-x-auto">
        <table className="dt" data-testid="prio-asesores">
          <thead>
            <tr>
              <th>Asesor</th>
              <th style={{ textAlign: 'right' }} title="Leads del periodo">Periodo</th>
              <th style={{ textAlign: 'right' }}>Abiertos</th>
              <th>Embudo abierto</th>
              <th style={{ textAlign: 'right' }} title="Muy probables + probables">Probables</th>
              <th style={{ textAlign: 'right' }} title="Puntaje medio de la cartera abierta">Puntaje</th>
              <th style={{ textAlign: 'right' }} title="Abiertos con próxima actividad agendada">Con próx. act.</th>
              <th style={{ textAlign: 'right' }} title="Gestión vencida">Vencida</th>
              <th style={{ textAlign: 'right' }} title="Leads con al menos una alarma roja">Alarma roja</th>
              <th style={{ textAlign: 'right' }}>Estancados</th>
              <th style={{ textAlign: 'right' }} title="Actividades registradas por la persona sobre los leads del filtro">Gestiones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const mx = Math.max(1, ...f.embudo);
              return (
                <tr key={f.asesor}>
                  <td className="whitespace-nowrap font-bold">{f.asesor}</td>
                  <td className="text-right">{f.periodo}</td>
                  <td className="text-right">{f.cartera}</td>
                  <td>
                    <div className="flex h-6 items-end gap-0.5" title={STAGES.slice(0, 6).map((s, i) => `${s}: ${f.embudo[i]}`).join(' · ')}>
                      {f.embudo.map((v, i) => (
                        <i key={i} className="block w-2.5 rounded-t-sm bg-cyan" style={{ height: `${Math.round((v * 22) / mx) + 2}px` }} />
                      ))}
                    </div>
                    <div className="text-[9px] text-muted">{f.embudo.join(' · ')}</div>
                  </td>
                  <td className="text-right">{f.probables}</td>
                  <td className="text-right">{f.medio ?? '—'}</td>
                  {/* Color en línea: `.dt td` fija el color del texto y le gana a una utilidad. */}
                  <td
                    className="text-right font-bold"
                    style={f.conProx === null ? undefined : { color: f.conProx < 70 ? '#d6455a' : '#12a56b' }}
                  >
                    {f.conProx === null ? '—' : `${f.conProx} %`}
                  </td>
                  <td className="text-right">{f.vencidas}</td>
                  <td className="text-right">{f.rojas}</td>
                  <td className="text-right">{f.estancados}</td>
                  <td className="text-right">{f.gestiones.toLocaleString('es-CO')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-2xs text-muted">
        Embudo abierto: Interesado · Contactado · Cita · Visitado · Negociación · Separación. Con próxima actividad en rojo
        por debajo de 70 %. Las gestiones de la fila de ISA son las de sus automatizaciones (mensajes y llamadas de
        reactivación), no de una persona.
      </p>
    </Section>
  );
}
