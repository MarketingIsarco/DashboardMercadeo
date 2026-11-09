'use client';

import { ActiveChips } from '@/components/filters/ActiveChips';
import { OptionFilter } from '@/components/filters/OptionFilter';
import { PeriodFilter } from '@/components/filters/PeriodFilter';
import { Segmented } from '@/components/ui/Segmented';
import { STAGE_FILTER_IDX, STAGES } from '@/lib/config/negocio';
import { defaultFilters } from '@/lib/selectors';
import type { FilterState } from '@/lib/selectors';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { Meta, Status } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: STATUS_OPEN as Status, label: 'Abierto' },
  { value: STATUS_LOST as Status, label: 'Perdido' },
  { value: STATUS_WON as Status, label: 'Ganado' },
];

/**
 * Etapas ofrecidas, en orden del embudo. La lista viene de `STAGE_FILTER_IDX`
 * para que agregar o quitar una etapa del filtro sea una sola edición, en
 * `config/negocio.ts`, y no haya que tocar la barra ni los chips.
 */
const STAGE_OPTIONS = STAGE_FILTER_IDX.map((value) => ({ value, label: STAGES[value] }));

const CANAL_SEGMENTS: Array<{ value: 'todos' | 'digital' | 'no', label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'digital', label: 'Digital' },
  { value: 'no', label: 'No digital' },
];

function FieldLabel({ children }: { children: string }) {
  return <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent-2 before:content-['']">{children}</span>;
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
  advisorOptions,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  meta: Meta;
  months: string[];
  years: string[];
  /** Leads que sobreviven al filtro, para dar retroalimentación inmediata. */
  shown: number;
  total: number;
  /**
   * Índices de `meta.advisors` que son **dueños** de al menos un trato. La lista
   * de `meta` también trae a quien sólo creó actividades (automatizaciones,
   * apoyo), y ofrecerlos aquí devolvería cero leads.
   */
  advisorOptions: number[];
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  const canal = filters.digital === null ? 'todos' : filters.digital ? 'digital' : 'no';

  return (
    <div className="rounded-[18px] border border-border bg-card shadow-panel">
      {/* Una sola fila, siempre (pedido de Mercadeo, nov 2026). Sin
          `overflow` a propósito: los desplegables son `absolute` y un
          contenedor con scroll los recortaría. */}
      <div className="flex flex-nowrap items-end gap-x-3 px-4 py-4">
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

        <Field label="Asesor">
          <OptionFilter
            label="Asesor"
            options={advisorOptions
              .map((value) => ({ value, label: meta.advisors[value] ?? `#${value}` }))
              .sort((a, b) => a.label.localeCompare(b.label, 'es'))}
            include={filters.advisors}
            onChange={({ include }) => set({ advisors: include })}
            width={280}
          />
        </Field>

        <Field label="Etapa">
          <OptionFilter
            label="Etapa"
            options={STAGE_OPTIONS}
            include={filters.stages}
            exclude={filters.exStages}
            onChange={({ include, exclude }) => set({ stages: include, exStages: exclude })}
            width={240}
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
      </div>

      <div className="border-t border-dashed border-border px-5 py-2.5">
        <ActiveChips
          filters={filters}
          meta={meta}
          onChange={set}
          onClearAll={() => onChange(defaultFilters)}
          shown={shown}
          total={total}
        />
      </div>
    </div>
  );
}
