'use client';

import { ActiveChips } from '@/components/filters/ActiveChips';
import { OptionFilter } from '@/components/filters/OptionFilter';
import { PeriodFilter } from '@/components/filters/PeriodFilter';
import { Segmented } from '@/components/ui/Segmented';
import { defaultFilters } from '@/lib/selectors';
import type { FilterState, Period, Unidad } from '@/lib/selectors';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { Meta, Status } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: STATUS_OPEN as Status, label: 'Abierto' },
  { value: STATUS_LOST as Status, label: 'Perdido' },
  { value: STATUS_WON as Status, label: 'Ganado' },
];

/** `null` es la opción neutra explícita, no la ausencia de elección. */
const UNIDAD_SEGMENTS: Array<{ value: Unidad; label: string }> = [
  { value: null, label: 'Todas' },
  { value: 'constructora', label: 'Constructora' },
  { value: 'inmobiliaria', label: 'Inmobiliaria' },
];

const CANAL_SEGMENTS: Array<{ value: 'todos' | 'digital' | 'no', label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'digital', label: 'Digital' },
  { value: 'no', label: 'No digital' },
];

const PERIOD_SEGMENTS: Array<{ value: Period; label: string }> = [
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
];

function FieldLabel({ children }: { children: string }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  meta,
  months,
  years,
  shown,
  total,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  meta: Meta;
  months: string[];
  years: string[];
  /** Leads que sobreviven al filtro, para dar retroalimentación inmediata. */
  shown: number;
  total: number;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  const canal = filters.digital === null ? 'todos' : filters.digital ? 'digital' : 'no';

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
        <Field label="Unidad">
          <Segmented
            label="Unidad de negocio"
            segments={UNIDAD_SEGMENTS}
            value={filters.unidad}
            // Los proyectos son subconjuntos de la unidad: conservarlos al
            // cambiarla dejaría un filtro imposible (0 resultados, sin causa visible).
            onChange={(unidad) => set({ unidad, projects: [] })}
          />
        </Field>

        <Field label="Periodo">
          <PeriodFilter filters={filters} onChange={set} months={months} years={years} />
        </Field>

        <Field label="Proyecto">
          <OptionFilter
            label="Proyectos"
            options={meta.projects.map((label, value) => ({ value, label }))}
            include={filters.projects}
            onChange={({ include }) => set({ projects: include })}
          />
        </Field>

        <Field label="Estado">
          <OptionFilter
            label="Estado"
            options={STATUS_OPTIONS}
            include={filters.status}
            exclude={filters.exStatus}
            onChange={({ include, exclude }) => set({ status: include, exStatus: exclude })}
          />
        </Field>

        <Field label="Canal">
          <Segmented
            label="Canal de origen"
            segments={CANAL_SEGMENTS}
            value={canal}
            onChange={(v) => set({ digital: v === 'todos' ? null : v === 'digital' })}
          />
        </Field>

        <Field label="Origen">
          <div className="flex gap-1.5">
            <OptionFilter
              label="Fuente"
              options={meta.sources.map((label, value) => ({ value, label }))}
              include={filters.sources}
              onChange={({ include }) => set({ sources: include })}
              width={280}
            />
            <OptionFilter
              label="Campaña"
              options={meta.campaigns.map((label, value) => ({ value, label }))}
              include={filters.campaigns}
              onChange={({ include }) => set({ campaigns: include })}
              width={320}
            />
          </div>
        </Field>

        <Field label="Etiqueta">
          <OptionFilter
            label="Etiqueta"
            options={meta.labels.map((label, value) => ({ value, label }))}
            include={filters.labels}
            onChange={({ include }) => set({ labels: include })}
            width={300}
          />
        </Field>

        <div className="ml-auto">
          <Field label="Agrupar por">
            <Segmented
              label="Granularidad temporal de los gráficos"
              segments={PERIOD_SEGMENTS}
              value={filters.period}
              onChange={(period) => set({ period })}
            />
          </Field>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <ActiveChips
          filters={filters}
          meta={meta}
          onChange={set}
          onClearAll={() => onChange({ ...defaultFilters, period: filters.period })}
          shown={shown}
          total={total}
        />
      </div>
    </div>
  );
}
