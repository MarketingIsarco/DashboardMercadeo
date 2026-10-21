'use client';

export interface Segment<T> {
  value: T;
  label: string;
}

/**
 * Selector de una sola opción entre pocas, todas visibles.
 *
 * Se usa donde antes había píldoras que se apagaban al reclickearlas: ahí el
 * estado "ninguna activa" era indistinguible de "no lo he tocado". Aquí la
 * opción neutra ("Todas") es explícita y siempre hay exactamente una activa.
 */
export function Segmented<T extends string | number | null>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-[10px] border border-border bg-panel2 p-0.5"
    >
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <button
            key={String(s.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(s.value)}
            className={`rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
              selected ? 'bg-grad font-semibold text-white shadow-sm' : 'text-dim hover:text-accent'
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
