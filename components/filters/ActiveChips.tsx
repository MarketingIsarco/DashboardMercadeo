'use client';

import { describePeriod } from '@/components/filters/PeriodFilter';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { Meta, Status } from '@/lib/types';
import type { FilterState } from '@/lib/selectors';

const STATUS_NAME: Record<Status, string> = {
  [STATUS_OPEN]: 'Abierto',
  [STATUS_LOST]: 'Perdido',
  [STATUS_WON]: 'Ganado',
};

interface Chip {
  key: string;
  group: string;
  label: string;
  /** Un chip negado (excluido) se pinta en rojo y se lee "≠". */
  negated?: boolean;
  clear: Partial<FilterState>;
}

/**
 * Traduce el estado de filtros a una lista plana de chips.
 *
 * Sin esto el usuario tiene que abrir cada dropdown para saber qué está
 * aplicado, y los números del dashboard quedan sin explicación visible.
 */
function buildChips(f: FilterState, meta: Meta): Chip[] {
  const chips: Chip[] = [];

  if (f.unidad) {
    chips.push({
      key: 'unidad',
      group: 'Unidad',
      label: f.unidad === 'constructora' ? 'Constructora' : 'Inmobiliaria',
      clear: { unidad: null },
    });
  }

  if (f.year || f.months.length || f.exMonths.length || f.dateFrom || f.dateTo) {
    chips.push({
      key: 'periodo',
      group: 'Periodo',
      label: describePeriod(f),
      clear: { year: null, months: [], exMonths: [], dateFrom: null, dateTo: null },
    });
  }

  f.projects.forEach((i) =>
    chips.push({
      key: `proj-${i}`,
      group: 'Proyecto',
      label: meta.projects[i] ?? `#${i}`,
      clear: { projects: f.projects.filter((x) => x !== i) },
    }),
  );

  f.status.forEach((s) =>
    chips.push({
      key: `st-${s}`,
      group: 'Estado',
      label: STATUS_NAME[s],
      clear: { status: f.status.filter((x) => x !== s) },
    }),
  );
  f.exStatus.forEach((s) =>
    chips.push({
      key: `exst-${s}`,
      group: 'Estado',
      label: STATUS_NAME[s],
      negated: true,
      clear: { exStatus: f.exStatus.filter((x) => x !== s) },
    }),
  );

  if (f.digital !== null) {
    chips.push({
      key: 'canal',
      group: 'Canal',
      label: f.digital ? 'Digital' : 'No digital',
      clear: { digital: null },
    });
  }

  f.sources.forEach((i) =>
    chips.push({
      key: `src-${i}`,
      group: 'Fuente',
      label: meta.sources[i] ?? `#${i}`,
      clear: { sources: f.sources.filter((x) => x !== i) },
    }),
  );

  f.campaigns.forEach((i) =>
    chips.push({
      key: `camp-${i}`,
      group: 'Campaña',
      label: meta.campaigns[i] ?? `#${i}`,
      clear: { campaigns: f.campaigns.filter((x) => x !== i) },
    }),
  );

  return chips;
}

export function ActiveChips({
  filters,
  meta,
  onChange,
  onClearAll,
  shown,
  total,
}: {
  filters: FilterState;
  meta: Meta;
  onChange: (patch: Partial<FilterState>) => void;
  onClearAll: () => void;
  shown: number;
  total: number;
}) {
  const chips = buildChips(filters, meta);

  if (chips.length === 0) {
    return (
      <p className="px-1 text-xs text-muted">
        Mostrando los {total.toLocaleString('es-CO')} leads. Filtra para acotar.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-dim">
        <b className="font-semibold text-text">{shown.toLocaleString('es-CO')}</b>
        <span className="text-muted"> de {total.toLocaleString('es-CO')} leads</span>
      </span>
      <span className="mx-1 h-4 w-px bg-border" />

      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.clear)}
          title={`Quitar filtro ${c.group}: ${c.label}`}
          className={`group inline-flex max-w-[240px] items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            c.negated
              ? 'border-red/40 bg-red/5 text-red hover:bg-red/10'
              : 'border-accent-border/40 bg-accent-soft text-accent hover:bg-accent/10'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{c.group}</span>
          <span className="truncate font-medium">
            {c.negated ? '≠ ' : ''}
            {c.label}
          </span>
          <span aria-hidden className="text-sm leading-none opacity-40 group-hover:opacity-100">
            ×
          </span>
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 rounded-full px-2 py-0.5 text-xs font-medium text-dim underline-offset-2 transition-colors hover:text-red hover:underline"
      >
        Limpiar todo
      </button>
    </div>
  );
}
