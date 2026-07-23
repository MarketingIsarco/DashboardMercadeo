'use client';

import { useState } from 'react';
import { Popover } from '@/components/ui/Popover';
import { Segmented } from '@/components/ui/Segmented';
import { monthLabel, monthShort } from '@/lib/format';
import type { FilterState } from '@/lib/selectors';

type Mode = 'presets' | 'meses' | 'rango';
type Pen = 'incluir' | 'excluir';

/** Los tres controles de tiempo son excluyentes: activar uno limpia los otros. */
const CLEARED: Pick<FilterState, 'year' | 'months' | 'exMonths' | 'dateFrom' | 'dateTo'> = {
  year: null,
  months: [],
  exMonths: [],
  dateFrom: null,
  dateTo: null,
};

/** Texto del disparador. Debe leerse sin abrir el panel. */
export function describePeriod(f: FilterState): string {
  if (f.dateFrom || f.dateTo) {
    const from = f.dateFrom ? fmtDate(f.dateFrom) : 'inicio';
    const to = f.dateTo ? fmtDate(f.dateTo) : 'hoy';
    return `${from} – ${to}`;
  }
  if (f.months.length === 1 && f.exMonths.length === 0) return monthLabel(f.months[0]);
  if (f.months.length > 1) return `${f.months.length} meses`;
  if (f.exMonths.length) return `Sin ${f.exMonths.length} ${f.exMonths.length === 1 ? 'mes' : 'meses'}`;
  if (f.year) return f.year;
  return 'Todo el periodo';
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${monthShort(`${y}-${m}`).toLowerCase()}`;
}

function isPeriodActive(f: FilterState): boolean {
  return Boolean(f.year || f.months.length || f.exMonths.length || f.dateFrom || f.dateTo);
}

export function PeriodFilter({
  filters,
  onChange,
  months,
  years,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  months: string[];
  years: string[];
}) {
  const active = isPeriodActive(filters);
  const [mode, setMode] = useState<Mode>(() =>
    filters.dateFrom || filters.dateTo ? 'rango' : filters.months.length || filters.exMonths.length ? 'meses' : 'presets',
  );
  const [pen, setPen] = useState<Pen>('incluir');

  const lastMonths = (n: number) => months.slice(-n);
  const latestYear = years[years.length - 1];

  const presets: Array<{ label: string; patch: Partial<FilterState>; isOn: boolean }> = [
    { label: 'Todo el periodo', patch: { ...CLEARED }, isOn: !active },
    {
      label: 'Último mes',
      patch: { ...CLEARED, months: lastMonths(1) },
      isOn: filters.months.length === 1 && filters.months[0] === months[months.length - 1],
    },
    {
      label: 'Últimos 3 meses',
      patch: { ...CLEARED, months: lastMonths(3) },
      isOn: filters.months.length === 3,
    },
    {
      label: 'Últimos 6 meses',
      patch: { ...CLEARED, months: lastMonths(6) },
      isOn: filters.months.length === 6,
    },
    ...(latestYear
      ? [{ label: `Año ${latestYear}`, patch: { ...CLEARED, year: latestYear }, isOn: filters.year === latestYear }]
      : []),
  ];

  const byYear = years.map((y) => ({ year: y, months: months.filter((m) => m.startsWith(y)) }));

  function paintMonth(m: string) {
    const inc = filters.months.filter((x) => x !== m);
    const exc = filters.exMonths.filter((x) => x !== m);

    if (pen === 'incluir') {
      if (!filters.months.includes(m)) inc.push(m);
    } else if (!filters.exMonths.includes(m)) {
      exc.push(m);
    }
    // Elegir meses y un rango de fechas a la vez daría un resultado ambiguo.
    onChange({ months: inc, exMonths: exc, dateFrom: null, dateTo: null, year: null });
  }

  return (
    <Popover label={describePeriod(filters)} active={active} width={300}>
      {() => (
        <>
          <Segmented
            label="Modo de periodo"
            value={mode}
            onChange={setMode}
            segments={[
              { value: 'presets', label: 'Rápido' },
              { value: 'meses', label: 'Meses' },
              { value: 'rango', label: 'Fechas' },
            ]}
          />

          {mode === 'presets' ? (
            <div className="mt-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange(p.patch)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent-soft ${
                    p.isOn ? 'font-semibold text-accent' : 'text-text'
                  }`}
                >
                  {p.label}
                  {p.isOn ? <span aria-hidden>✓</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'meses' ? (
            <div className="mt-2">
              <Segmented
                label="Acción al hacer click"
                value={pen}
                onChange={setPen}
                segments={[
                  { value: 'incluir', label: 'Incluir' },
                  { value: 'excluir', label: 'Excluir' },
                ]}
              />

              <div className="mt-2 max-h-56 overflow-y-auto">
                {byYear.map(({ year, months: ms }) =>
                  ms.length ? (
                    <div key={year} className="mb-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{year}</p>
                      <div className="grid grid-cols-4 gap-1">
                        {ms.map((m) => {
                          const inc = filters.months.includes(m);
                          const exc = filters.exMonths.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => paintMonth(m)}
                              className={`rounded-md border px-1 py-1 text-[11px] font-medium transition-colors ${
                                exc
                                  ? 'border-red/60 bg-red/10 text-red line-through'
                                  : inc
                                    ? 'border-accent-border bg-accent-soft text-accent'
                                    : 'border-border bg-card text-dim hover:border-accent-border hover:text-accent'
                              }`}
                            >
                              {monthShort(m)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>

              {filters.months.length || filters.exMonths.length ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...CLEARED })}
                  className="w-full rounded-md px-2 py-1 text-xs font-medium text-red transition-colors hover:bg-red/10"
                >
                  Limpiar meses
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === 'rango' ? (
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-center justify-between gap-2 text-xs text-dim">
                Desde
                <input
                  type="date"
                  value={filters.dateFrom ?? ''}
                  max={filters.dateTo ?? undefined}
                  onChange={(e) => onChange({ ...CLEARED, dateFrom: e.target.value || null, dateTo: filters.dateTo })}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-accent-border"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-dim">
                Hasta
                <input
                  type="date"
                  value={filters.dateTo ?? ''}
                  min={filters.dateFrom ?? undefined}
                  onChange={(e) => onChange({ ...CLEARED, dateFrom: filters.dateFrom, dateTo: e.target.value || null })}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-accent-border"
                />
              </label>
              {filters.dateFrom || filters.dateTo ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...CLEARED })}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red transition-colors hover:bg-red/10"
                >
                  Limpiar rango
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Popover>
  );
}
