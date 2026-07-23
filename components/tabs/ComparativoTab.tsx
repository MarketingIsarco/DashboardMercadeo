'use client';

import { useMemo, useState } from 'react';
import { MonthSelect } from '@/components/ui/MonthSelect';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import {
  CONSTRUCTORA_IDX,
  INVERSION,
  META,
  META_ADS_SOURCES,
  PAID_SOURCES,
} from '@/lib/config/negocio';
import { firstName, fmtCOP, monthLabel, sourceIndices } from '@/lib/format';
import {
  countBy,
  isCita,
  isGanado,
  isNegociacion,
  isPerdido,
  isSeparacion,
  isVisita,
} from '@/lib/selectors';
import type { TabProps } from '@/lib/selectors';
import type { Lead } from '@/lib/types';

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Comparativo — compara DOS meses (A vs B) de los proyectos de constructora.
 *
 * ⚠️ Esta pestaña IGNORA la barra de filtros global a propósito. El dashboard
 * original operaba sobre `RAW` directo con sus propios controles (mes A, mes B,
 * canal, proyecto). Por eso aquí usamos `data.leads` (todos los leads sin
 * filtrar) y NO `filtered`. Se muestra un aviso en la UI para que el usuario no
 * se confunda al ver números que no cuadran con las otras pestañas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const COL_A = '#c9a96e';
const COL_B = '#6db33f';
const GREEN = '#4ade80';
const RED = '#f87171';

type RowVal = number | string | null;

/** Igual que el HTML: extrae el primer número de un valor formateado o crudo. */
function parseNum(v: RowVal): number {
  return parseFloat(String(v).replace(/[^0-9.-]/g, ''));
}

// ── Formateadores (equivalentes a fN/fP/fC/fM del HTML) ──────────────────────
const fN = (v: RowVal): string =>
  v == null ? '-' : typeof v === 'number' ? v.toLocaleString('es-CO') : v;
const fP = (v: RowVal): string =>
  v == null || typeof v !== 'number' ? '-' : `${v.toFixed(1)}%`;
const fC = (v: RowVal): string =>
  v == null || typeof v !== 'number' ? '-' : fmtCOP(Math.round(v));
/** Pesos en millones: `3050000` → `'$3.05M'`. Sin dato → `'—'` (no cero). */
const fM = (v: RowVal): string =>
  v == null || typeof v !== 'number' ? '—' : `$${(v / 1e6).toFixed(2)}M`;

interface Metrics {
  total: number;
  citas: number;
  visitas: number;
  negoTotal: number;
  seps: number;
  gan: number;
  per: number;
  rec: number;
  digL: number;
  metaL: number;
  inv: number | null;
  lrG: Record<string, number>;
  srcG: number[];
  srcCita: number[];
  campG: number[];
  aseG: number[];
  aseVis: number[];
  pCont: number;
  pLC: number;
  pCV: number;
  pLV: number;
  pVN: number;
  pNC: number;
  pLG: number;
  cpl: number | null;
  cplMeta: number | null;
  cplCita: number | null;
  costoVis: number | null;
  costoCierre: number | null;
}

interface MetaGoal {
  leads: number;
  citas: number;
  visitas: number;
  cierres: number;
}

/** Equivale a `_getMeta(projIdx)`: 0 = Inari, 1 = Tinguazul 2A, else = suma. */
function getMeta(projIdx: number): MetaGoal {
  if (projIdx === 0) {
    return { leads: META[0].leads, citas: META[0].citas, visitas: META[0].visitas, cierres: META[0].cierres };
  }
  if (projIdx === 1) {
    return { leads: META[1].leads, citas: META[1].citas, visitas: META[1].visitas, cierres: META[1].cierres };
  }
  return {
    leads: META[0].leads + META[1].leads,
    citas: META[0].citas + META[1].citas,
    visitas: META[0].visitas + META[1].visitas,
    cierres: META[0].cierres + META[1].cierres,
  };
}

/** Equivale a `_cMetrics(month, projIdx)` del HTML. */
function computeMetrics(
  leads: Lead[],
  month: string,
  projIdx: number,
  canal: boolean | null,
  digitalSet: Set<number>,
  paidSet: Set<number>,
  metaAdsSet: Set<number>,
  nSources: number,
  nCampaigns: number,
  nAdvisors: number,
): Metrics | null {
  // Constructora + mismo mes. Ignora los filtros globales (ver comentario arriba).
  let base = leads.filter((l) => CONSTRUCTORA_IDX.includes(l.project) && l.month === month);
  if (projIdx === 0) base = base.filter((l) => l.project === 0);
  else if (projIdx === 1) base = base.filter((l) => l.project === 1);
  if (canal === true) base = base.filter((l) => digitalSet.has(l.source));
  else if (canal === false) base = base.filter((l) => !digitalSet.has(l.source));

  const total = base.length;
  if (!total) return null;

  const lost = base.filter(isPerdido);
  const lostCont = lost.filter((l) => l.lossGroup === 'Contactabilidad').length;
  const citas = base.filter(isCita).length;
  const visitas = base.filter(isVisita).length;
  const negoTotal = base.filter(isNegociacion).length;
  const seps = base.filter(isSeparacion).length;
  const gan = base.filter(isGanado).length;
  const per = lost.length;
  const rec = base.filter((l) => l.recoverable).length;
  const digL = base.filter((l) => paidSet.has(l.source)).length; // pauta pagada IG+FB+WA
  const metaL = base.filter((l) => metaAdsSet.has(l.source)).length; // Meta Ads IG+FB

  // Inversión: sólo existe 2026-01..2026-06. Sin dato → null (no cero, no inventado).
  let inv = 0;
  let hasInv = false;
  const invInari = INVERSION.inari[month];
  const invTng = INVERSION.tng[month];
  if (projIdx !== 1 && invInari != null) {
    inv += invInari;
    hasInv = true;
  }
  if (projIdx !== 0 && invTng != null) {
    inv += invTng;
    hasInv = true;
  }
  const invVal = hasInv ? inv : null;

  const lrG: Record<string, number> = {};
  for (const l of lost) {
    const g = l.lossGroup;
    lrG[g] = (lrG[g] || 0) + 1;
  }
  const srcG = countBy(base, (l) => l.source, nSources);
  const srcCita = countBy(base.filter(isCita), (l) => l.source, nSources);
  const campG = countBy(base, (l) => l.campaign, nCampaigns);
  const aseG = countBy(base, (l) => l.advisor, nAdvisors);
  const aseVis = countBy(base.filter(isVisita), (l) => l.advisor, nAdvisors);

  return {
    total,
    citas,
    visitas,
    negoTotal,
    seps,
    gan,
    per,
    rec,
    digL,
    metaL,
    inv: invVal,
    lrG,
    srcG,
    srcCita,
    campG,
    aseG,
    aseVis,
    pCont: ((total - lostCont) / total) * 100,
    pLC: (citas / total) * 100,
    pCV: citas ? (visitas / citas) * 100 : 0,
    pLV: (visitas / total) * 100,
    pVN: visitas ? (negoTotal / visitas) * 100 : 0,
    pNC: negoTotal ? (seps / negoTotal) * 100 : 0,
    pLG: (gan / total) * 100,
    cpl: digL && invVal ? Math.round(invVal / digL) : null,
    cplMeta: metaL && invVal ? Math.round(invVal / metaL) : null,
    cplCita: citas && invVal ? Math.round(invVal / citas) : null,
    costoVis: visitas && invVal ? Math.round(invVal / visitas) : null,
    costoCierre: gan && invVal ? Math.round(invVal / gan) : null,
  };
}

function arrowFor(a: RowVal, b: RowVal, higherBetter: boolean): { arrow: string; arrowCol: string } {
  const na = parseNum(a);
  const nb = parseNum(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
    const better = higherBetter ? nb > na : nb < na;
    return { arrow: nb > na ? ' ↑' : ' ↓', arrowCol: better ? GREEN : RED };
  }
  return { arrow: '', arrowCol: 'var(--dim)' };
}

/** Δ contra la meta. `higherBetter=false` para métricas donde menos es mejor. */
function Delta({ val, meta, higherBetter }: { val: RowVal; meta: number; higherBetter: boolean }) {
  const n = parseNum(val);
  if (Number.isNaN(n) || Number.isNaN(meta) || meta === 0) {
    return <span className="text-dim">—</span>;
  }
  const p = ((n - meta) / meta) * 100;
  const ok = higherBetter !== false ? n >= meta : n <= meta;
  const sign = p >= 0 ? '+' : '';
  return (
    <span className="text-[11px] font-bold" style={{ color: ok ? GREEN : RED }}>
      {sign}
      {p.toFixed(0)}%
    </span>
  );
}

interface R2 {
  label: string;
  a: RowVal;
  b: RowVal;
  higherBetter?: boolean;
  fmt?: (v: RowVal) => string;
}

function Table2({ labelA, labelB, rows }: { labelA: string; labelB: string; rows: R2[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-accent">
            <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase text-dim">Indicador</th>
            <th className="px-3 py-2.5 text-center text-xs font-extrabold" style={{ color: COL_A }}>
              {labelA}
            </th>
            <th
              className="border-l-2 border-border px-3 py-2.5 text-center text-xs font-extrabold"
              style={{ color: COL_B }}
            >
              {labelB}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const fmt = r.fmt ?? fN;
            const { arrow, arrowCol } = arrowFor(r.a, r.b, r.higherBetter ?? true);
            return (
              <tr key={i} className="border-b border-border">
                <td className="px-3 py-2 text-xs font-semibold text-dim">{r.label}</td>
                <td className="px-3 py-2 text-center text-[13px] font-bold" style={{ color: COL_A }}>
                  {fmt(r.a)}
                </td>
                <td
                  className="border-l-2 border-border px-3 py-2 text-center text-[13px] font-bold"
                  style={{ color: COL_B }}
                >
                  {fmt(r.b)}
                  {arrow ? (
                    <span className="text-[11px]" style={{ color: arrowCol }}>
                      {arrow}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface RM {
  label: string;
  a: RowVal;
  b: RowVal;
  meta: number | null;
  higherBetter?: boolean;
  fmt?: (v: RowVal) => string;
}

function Table5({ labelA, labelB, rows }: { labelA: string; labelB: string; rows: RM[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-accent">
            <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase text-dim">Indicador</th>
            <th className="px-2.5 py-2.5 text-center text-xs font-extrabold" style={{ color: COL_A }}>
              {labelA}
            </th>
            <th className="border-r border-dashed border-border px-2 py-2.5 text-center text-2xs font-semibold text-dim">
              vs Meta
            </th>
            <th className="px-2.5 py-2.5 text-center text-xs font-extrabold" style={{ color: COL_B }}>
              {labelB}
            </th>
            <th className="border-r border-dashed border-border px-2 py-2.5 text-center text-2xs font-semibold text-dim">
              vs Meta
            </th>
            <th className="px-2.5 py-2.5 text-center text-[11px] font-bold text-dim">Meta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const fmt = r.fmt ?? fN;
            const hb = r.higherBetter ?? true;
            const { arrow, arrowCol } = arrowFor(r.a, r.b, hb);
            return (
              <tr key={i} className="border-b border-border">
                <td className="px-3 py-2 text-xs font-semibold text-dim">{r.label}</td>
                <td className="px-2.5 py-2 text-center text-[13px] font-bold" style={{ color: COL_A }}>
                  {fmt(r.a)}
                </td>
                <td className="border-r border-dashed border-border px-2 py-1.5 text-center">
                  {r.meta != null ? <Delta val={r.a} meta={r.meta} higherBetter={hb} /> : null}
                </td>
                <td className="px-2.5 py-2 text-center text-[13px] font-bold" style={{ color: COL_B }}>
                  {fmt(r.b)}
                  {arrow ? (
                    <span className="text-[11px]" style={{ color: arrowCol }}>
                      {arrow}
                    </span>
                  ) : null}
                </td>
                <td className="border-r border-dashed border-border px-2 py-1.5 text-center">
                  {r.meta != null ? <Delta val={r.b} meta={r.meta} higherBetter={hb} /> : null}
                </td>
                <td className="px-2.5 py-2 text-center text-[11px] font-semibold text-dim">
                  {r.meta != null ? fmt(r.meta) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SubBlock({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-dim">{title}</h3>
      {sub ? <p className="mb-2 text-2xs text-muted">{sub}</p> : <div className="mb-2" />}
      {children}
    </div>
  );
}

/** `12` leads con `45.0%` conversión → celda compuesta `"12 / 45.0%"`. */
function convCell(vol: number, conv: number, denom: number): string {
  const cv = denom ? `${((conv / denom) * 100).toFixed(1)}%` : '-';
  return `${vol} / ${cv}`;
}

export function ComparativoTab({ data, meta }: TabProps) {
  const [monthAState, setMonthAState] = useState<string | null>(null);
  const [monthBState, setMonthBState] = useState<string | null>(null);
  const [proj, setProj] = useState<number>(-1); // -1 Ambos · 0 Inari · 1 Tinguazul 2A
  const [canal, setCanal] = useState<boolean | null>(null); // null Todos · true Digital · false No digital

  // Meses disponibles: derivados de los leads de constructora, ordenados.
  const avMonths = useMemo(
    () =>
      [...new Set(data.leads.filter((l) => CONSTRUCTORA_IDX.includes(l.project)).map((l) => l.month))].sort(),
    [data.leads],
  );

  // Por defecto A = penúltimo, B = último. Si sólo hay uno, A = B = ese mes.
  const monthA = monthAState ?? avMonths[avMonths.length - 2] ?? avMonths[0] ?? '';
  const monthB = monthBState ?? avMonths[avMonths.length - 1] ?? avMonths[0] ?? '';

  const digitalSet = useMemo(() => new Set(meta.digitalSources), [meta.digitalSources]);
  const paidSet = useMemo(() => new Set(sourceIndices(meta.sources, PAID_SOURCES)), [meta.sources]);
  const metaAdsSet = useMemo(
    () => new Set(sourceIndices(meta.sources, META_ADS_SOURCES)),
    [meta.sources],
  );

  const mA = useMemo(
    () =>
      computeMetrics(
        data.leads,
        monthA,
        proj,
        canal,
        digitalSet,
        paidSet,
        metaAdsSet,
        meta.sources.length,
        meta.campaigns.length,
        meta.advisors.length,
      ),
    [data.leads, monthA, proj, canal, digitalSet, paidSet, metaAdsSet, meta],
  );
  const mB = useMemo(
    () =>
      computeMetrics(
        data.leads,
        monthB,
        proj,
        canal,
        digitalSet,
        paidSet,
        metaAdsSet,
        meta.sources.length,
        meta.campaigns.length,
        meta.advisors.length,
      ),
    [data.leads, monthB, proj, canal, digitalSet, paidSet, metaAdsSet, meta],
  );

  const mt = getMeta(proj);
  const labelA = monthA ? monthLabel(monthA) : '—';
  const labelB = monthB ? monthLabel(monthB) : '—';

  const projBtns: Array<{ lbl: string; v: number }> = [
    { lbl: 'Ambos', v: -1 },
    { lbl: 'Inari 101', v: 0 },
    { lbl: 'Tinguazul 2A', v: 1 },
  ];
  const controls = (
    <>
      <div className="mb-3 rounded-lg border border-accent-border bg-accent-soft px-4 py-2 text-2xs text-dim">
        Esta vista usa sus propios controles (mes A/B, canal, proyecto) e{' '}
        <b>ignora los filtros globales</b> de la barra superior.
      </div>
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mes A</span>
          <MonthSelect label="Mes A" value={monthA} months={avMonths} onChange={setMonthAState} />
        </div>

        <span className="pb-1.5 text-sm font-light text-muted">vs</span>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mes B</span>
          <MonthSelect label="Mes B" value={monthB} months={avMonths} onChange={setMonthBState} />
        </div>

        <div className="ml-auto flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Proyecto</span>
          <Segmented
            label="Proyecto a comparar"
            value={proj}
            onChange={setProj}
            segments={projBtns.map((b) => ({ value: b.v, label: b.lbl }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Canal</span>
          <Segmented
            label="Canal a comparar"
            value={canal === null ? 'todos' : canal ? 'digital' : 'no'}
            onChange={(v) => setCanal(v === 'todos' ? null : v === 'digital')}
            segments={[
              { value: 'todos', label: 'Todos' },
              { value: 'digital', label: 'Digital' },
              { value: 'no', label: 'No digital' },
            ]}
          />
        </div>
      </div>
    </>
  );

  if (!mA || !mB) {
    return (
      <>
        {controls}
        <p className="p-6 text-sm text-dim">Sin datos para alguno de los meses seleccionados.</p>
      </>
    );
  }

  // ── Cap 02: grupos de canal ────────────────────────────────────────────────
  // El HTML agrupaba por índices de fuente hardcodeados (Digital Paga / Orgánica /
  // POP / BTL / Otros). Esos índices ya no existen: las fuentes se derivan de
  // Pipedrive en vivo. Reconstruimos los únicos grupos derivables de la config:
  // pauta pagada (IG/FB/WA), digital orgánica (resto de digitalSources) y no digital.
  const paidIdx = [...paidSet];
  const orgIdx = meta.digitalSources.filter((i) => !paidSet.has(i));
  const noDigIdx = meta.sources.map((_, i) => i).filter((i) => !digitalSet.has(i));
  const chanGroups: Array<{ lbl: string; idxs: number[] }> = [
    { lbl: 'Digital Paga (IG/FB/WA)', idxs: paidIdx },
    { lbl: 'Digital Orgánica', idxs: orgIdx },
    { lbl: 'No Digital', idxs: noDigIdx },
  ];
  const groupRows: R2[] = chanGroups
    .map((g): R2 | null => {
      const vA = g.idxs.reduce((s, i) => s + (mA.srcG[i] || 0), 0);
      const vB = g.idxs.reduce((s, i) => s + (mB.srcG[i] || 0), 0);
      if (!vA && !vB) return null;
      const cA = g.idxs.reduce((s, i) => s + (mA.srcCita[i] || 0), 0);
      const cB = g.idxs.reduce((s, i) => s + (mB.srcCita[i] || 0), 0);
      return {
        label: `${g.lbl} (leads / conv.cita)`,
        a: convCell(vA, cA, vA),
        b: convCell(vB, cB, vB),
      };
    })
    .filter((r): r is R2 => r !== null);

  const allSrcs = meta.sources
    .map((_, i) => i)
    .filter((i) => (mA.srcG[i] || 0) || (mB.srcG[i] || 0))
    .sort((a, b) => (mB.srcG[b] || 0) - (mB.srcG[a] || 0))
    .slice(0, 8);
  const srcRows: R2[] = allSrcs.map((s) => ({
    label: `${meta.sources[s] ?? `src${s}`} (leads / conv.cita)`,
    a: convCell(mA.srcG[s] || 0, mA.srcCita[s] || 0, mA.srcG[s] || 0),
    b: convCell(mB.srcG[s] || 0, mB.srcCita[s] || 0, mB.srcG[s] || 0),
  }));

  const campRows: R2[] = meta.campaigns
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => (mA.campG[i] || 0) || (mB.campG[i] || 0))
    .map(({ c, i }) => ({ label: c, a: mA.campG[i] || 0, b: mB.campG[i] || 0 }));

  // ── Cap 03: motivos de pérdida ─────────────────────────────────────────────
  const lrGrps = ['Contactabilidad', 'Interes', 'Producto', 'Mal segmento', 'Otro'];
  const lrRows: R2[] = lrGrps.map((g) => ({
    label: g,
    a: mA.lrG[g] || 0,
    b: mB.lrG[g] || 0,
    higherBetter: false,
  }));
  const pctLrRows: R2[] = lrGrps.map((g) => ({
    label: `${g} (%)`,
    a: mA.per ? `${(((mA.lrG[g] || 0) / mA.per) * 100).toFixed(1)}%` : '-',
    b: mB.per ? `${(((mB.lrG[g] || 0) / mB.per) * 100).toFixed(1)}%` : '-',
    higherBetter: false,
  }));

  // ── Cap 05: asesores ───────────────────────────────────────────────────────
  const aseRows: R2[] = meta.advisors
    .map((_, i) => i)
    .filter((i) => (mA.aseG[i] || 0) || (mB.aseG[i] || 0))
    .map((i) => ({
      label: `${firstName(meta.advisors[i] ?? `ase${i}`)} (leads / conv.vis)`,
      a: convCell(mA.aseG[i] || 0, mA.aseVis[i] || 0, mA.aseG[i] || 0),
      b: convCell(mB.aseG[i] || 0, mB.aseVis[i] || 0, mB.aseG[i] || 0),
    }));

  return (
    <>
      {controls}

      <Section title="01 · Indicadores Generales">
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="Volumen y Embudo" sub="Leads totales y avance por etapa del pipeline">
            <Table5
              labelA={labelA}
              labelB={labelB}
              rows={[
                { label: 'Total leads', a: mA.total, b: mB.total, meta: mt.leads },
                { label: 'Citas agendadas', a: mA.citas, b: mB.citas, meta: mt.citas },
                { label: 'Visitas realizadas', a: mA.visitas, b: mB.visitas, meta: mt.visitas },
                { label: 'Separaciones', a: mA.seps, b: mB.seps, meta: null },
                { label: 'Ganados', a: mA.gan, b: mB.gan, meta: mt.cierres },
                { label: 'Perdidos', a: mA.per, b: mB.per, meta: null, higherBetter: false },
                { label: 'Recuperables', a: mA.rec, b: mB.rec, meta: null },
              ]}
            />
          </SubBlock>
          <SubBlock title="Tasas de Conversión" sub="Porcentaje de avance entre etapas del embudo">
            <Table2
              labelA={labelA}
              labelB={labelB}
              rows={[
                { label: 'Contactación', a: mA.pCont, b: mB.pCont, fmt: fP },
                { label: 'Lead → Cita', a: mA.pLC, b: mB.pLC, fmt: fP },
                { label: 'Cita → Visita', a: mA.pCV, b: mB.pCV, fmt: fP },
                { label: 'Lead → Visita', a: mA.pLV, b: mB.pLV, fmt: fP },
                { label: 'Visita → Negociación', a: mA.pVN, b: mB.pVN, fmt: fP },
                { label: 'Negociación → Cierre', a: mA.pNC, b: mB.pNC, fmt: fP },
                { label: 'Lead → Ganado', a: mA.pLG, b: mB.pLG, fmt: fP },
              ]}
            />
          </SubBlock>
        </div>
      </Section>

      <Section title="02 · Fuentes de Leads">
        <div className="grid gap-4">
          <SubBlock
            title="Resumen por Grupo de Canal"
            sub="Leads totales y tasa de conversión a cita por tipo de canal"
          >
            {groupRows.length ? (
              <Table2 labelA={labelA} labelB={labelB} rows={groupRows} />
            ) : (
              <p className="text-xs text-muted">Sin datos de canal.</p>
            )}
          </SubBlock>
          <SubBlock
            title="Detalle por Fuente"
            sub="Leads totales y tasa de conversión a cita por fuente individual"
          >
            {srcRows.length ? (
              <Table2 labelA={labelA} labelB={labelB} rows={srcRows} />
            ) : (
              <p className="text-xs text-muted">Sin datos de fuentes.</p>
            )}
          </SubBlock>
          <SubBlock title="Campañas" sub="Leads generados por campaña">
            {campRows.length ? (
              <Table2 labelA={labelA} labelB={labelB} rows={campRows} />
            ) : (
              <p className="text-xs text-muted">Sin campañas con datos.</p>
            )}
          </SubBlock>
        </div>
      </Section>

      <Section title="03 · Motivos de Pérdida">
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="Volumen Absoluto" sub="Número de leads perdidos por motivo de cierre">
            <Table2 labelA={labelA} labelB={labelB} rows={lrRows} />
          </SubBlock>
          <SubBlock
            title="Distribución Porcentual"
            sub="Participación de cada motivo sobre el total de perdidos"
          >
            <Table2 labelA={labelA} labelB={labelB} rows={pctLrRows} />
          </SubBlock>
        </div>
      </Section>

      <Section title="04 · Inversión en Pauta Digital">
        <SubBlock
          title="Eficiencia de Inversión"
          sub="Costo por lead, cita, visita y cierre según inversión en pauta"
        >
          <Table2
            labelA={labelA}
            labelB={labelB}
            rows={[
              { label: 'Inversión total', a: mA.inv, b: mB.inv, fmt: fM },
              { label: 'Leads digitales (IG+FB+WA)', a: mA.digL, b: mB.digL },
              { label: 'CPL Digital', a: mA.cpl, b: mB.cpl, higherBetter: false, fmt: fC },
              { label: 'CPL Meta (IG+FB)', a: mA.cplMeta, b: mB.cplMeta, higherBetter: false, fmt: fC },
              { label: 'Costo / Cita', a: mA.cplCita, b: mB.cplCita, higherBetter: false, fmt: fC },
              { label: 'Costo / Visita', a: mA.costoVis, b: mB.costoVis, higherBetter: false, fmt: fC },
              { label: 'Costo / Cierre', a: mA.costoCierre, b: mB.costoCierre, higherBetter: false, fmt: fC },
            ]}
          />
        </SubBlock>
      </Section>

      <Section title="05 · Gestión de Asesores">
        <SubBlock
          title="Rendimiento por Asesor"
          sub="Leads asignados y tasa de conversión a visita por asesor"
        >
          {aseRows.length ? (
            <Table2 labelA={labelA} labelB={labelB} rows={aseRows} />
          ) : (
            <p className="text-xs text-muted">Sin datos de asesores.</p>
          )}
        </SubBlock>
      </Section>
    </>
  );
}
