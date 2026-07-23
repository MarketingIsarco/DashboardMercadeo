'use client';

import { useMemo, useState } from 'react';
import { Popover } from '@/components/ui/Popover';

export interface FilterOption<T> {
  value: T;
  label: string;
}

/**
 * Multiselección con exclusión explícita.
 *
 * El diseño anterior ciclaba incluir → excluir → apagado con clicks sucesivos,
 * y sólo lo anunciaba en un `title`. Nadie descubre eso. Aquí incluir es un
 * checkbox y excluir es un botón propio, así que ambas acciones son visibles
 * y reversibles de un click.
 */
export function OptionFilter<T extends string | number>({
  label,
  options,
  include,
  exclude,
  onChange,
  searchThreshold = 8,
  width = 260,
}: {
  label: string;
  options: FilterOption<T>[];
  include: T[];
  /** Omitir para deshabilitar la exclusión (p. ej. proyectos). */
  exclude?: T[];
  onChange: (next: { include: T[]; exclude: T[] }) => void;
  searchThreshold?: number;
  width?: number;
}) {
  const [query, setQuery] = useState('');
  const supportsExclude = exclude !== undefined;
  const exc = exclude ?? [];

  const incSet = useMemo(() => new Set(include), [include]);
  const excSet = useMemo(() => new Set(exc), [exc]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggleInclude(v: T) {
    onChange({
      include: incSet.has(v) ? include.filter((x) => x !== v) : [...include, v],
      exclude: exc.filter((x) => x !== v),
    });
  }

  function toggleExclude(v: T) {
    onChange({
      include: include.filter((x) => x !== v),
      exclude: excSet.has(v) ? exc.filter((x) => x !== v) : [...exc, v],
    });
  }

  const count = include.length + exc.length;

  return (
    <Popover label={label} count={count} width={width}>
      {() => (
        <>
          {options.length > searchThreshold ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
              className="mb-1.5 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent-border"
            />
          ) : null}

          {count > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ include: [], exclude: [] })}
              className="mb-1 w-full rounded-md px-2 py-1 text-left text-xs font-medium text-red transition-colors hover:bg-red/10"
            >
              Quitar {count} {count === 1 ? 'filtro' : 'filtros'}
            </button>
          ) : null}

          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted">Sin resultados</p>
            ) : (
              visible.map((o) => {
                const included = incSet.has(o.value);
                const excluded = excSet.has(o.value);
                return (
                  <div
                    key={String(o.value)}
                    className="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent-soft"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleInclude(o.value)}
                        className="h-3.5 w-3.5 shrink-0 accent-accent"
                      />
                      <span
                        className={`truncate ${
                          excluded ? 'text-red line-through opacity-70' : 'text-text'
                        }`}
                      >
                        {o.label}
                      </span>
                    </label>

                    {supportsExclude ? (
                      <button
                        type="button"
                        onClick={() => toggleExclude(o.value)}
                        aria-pressed={excluded}
                        title={excluded ? `Dejar de excluir ${o.label}` : `Excluir ${o.label}`}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[13px] leading-4 transition-opacity ${
                          excluded
                            ? 'text-red opacity-100'
                            : 'text-muted opacity-0 hover:text-red focus:opacity-100 group-hover:opacity-100'
                        }`}
                      >
                        ⊘
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {supportsExclude ? (
            <p className="mt-1 border-t border-border px-2 pt-1.5 text-[10px] leading-snug text-muted">
              Marca para incluir. Usa ⊘ para excluir.
            </p>
          ) : null}
        </>
      )}
    </Popover>
  );
}
