'use client';

import { Popover } from '@/components/ui/Popover';
import { monthLabel, monthShort } from '@/lib/format';

/**
 * Selección de un único mes, en rejilla agrupada por año.
 *
 * Existe para que las vistas con controles propios (Comparativo, Plan) usen el
 * mismo vocabulario que la barra global. Antes una desplegaba `<select>`
 * nativos y la otra tendía 17 píldoras en fila.
 */
export function MonthSelect({
  value,
  months,
  onChange,
  label,
}: {
  value: string;
  /** Meses `YYYY-MM` disponibles, ascendente. */
  months: string[];
  onChange: (month: string) => void;
  label?: string;
}) {
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort();

  return (
    <Popover label={monthLabel(value)} active width={244}>
      {(close) => (
        <div className="max-h-64 overflow-y-auto" aria-label={label}>
          {years.map((year) => {
            const ms = months.filter((m) => m.startsWith(year));
            if (!ms.length) return null;
            return (
              <div key={year} className="mb-2 last:mb-0">
                <p className="mb-1 px-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{year}</p>
                <div className="grid grid-cols-4 gap-1">
                  {ms.map((m) => {
                    const selected = m === value;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          onChange(m);
                          close();
                        }}
                        className={`rounded-md border px-1 py-1 text-[11px] font-medium transition-colors ${
                          selected
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
            );
          })}
        </div>
      )}
    </Popover>
  );
}
