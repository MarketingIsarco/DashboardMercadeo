'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Disparador + panel flotante. Cierra al hacer click fuera o con Escape, y
 * devuelve el foco al disparador para no perder al usuario de teclado.
 */
export function Popover({
  label,
  count,
  active,
  children,
  align = 'left',
  width = 260,
}: {
  label: ReactNode;
  /** Número de selecciones activas; se muestra como contador en el disparador. */
  count?: number;
  active?: boolean;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isActive = active ?? (count ?? 0) > 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          isActive
            ? 'border-accent-border bg-accent-soft text-accent'
            : 'border-border bg-card text-dim hover:border-accent-border hover:text-accent'
        } ${open ? 'ring-2 ring-accent/20' : ''}`}
      >
        <span>{label}</span>
        {count ? (
          <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-white">
            {count}
          </span>
        ) : null}
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          aria-hidden
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={typeof label === 'string' ? label : undefined}
          style={{ width }}
          className={`absolute top-full z-50 mt-1.5 rounded-xl border border-border bg-card p-2 shadow-[0_8px_28px_-6px_rgba(26,26,46,0.18)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
