import type { ReactNode } from 'react';

export interface KpiProps {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  /** Variación vs. el periodo anterior, en puntos porcentuales o unidades. */
  delta?: number | null;
  /** Sufijo del delta, p. ej. `'%'`. */
  deltaSuffix?: string;
  sub?: ReactNode;
}

export function Kpi({ label, value, meta, delta, deltaSuffix = '%', sub }: KpiProps) {
  const showDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const up = showDelta && (delta as number) >= 0;

  return (
    <div className="kpi-card">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-dim">{label}</div>
      <div className="my-0.5 text-[28px] font-extrabold leading-tight text-text">{value}</div>
      {meta ? <div className="text-[11px] text-muted">{meta}</div> : null}
      {showDelta ? (
        <span
          className={`mt-0.5 inline-block rounded-[10px] px-1.5 py-px text-[11px] font-semibold ${
            up ? 'bg-green/20 text-[#16a34a]' : 'bg-red/20 text-red'
          }`}
        >
          {up ? '▲' : '▼'} {Math.abs(delta as number).toFixed(1)}
          {deltaSuffix}
        </span>
      ) : null}
      {sub ? <div className="mt-1 text-2xs leading-snug text-muted">{sub}</div> : null}
    </div>
  );
}

export function KpiGrid({ children, cols = 7 }: { children: ReactNode; cols?: number }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, maxWidth: '100%' }}
      data-cols={cols}
    >
      {children}
    </div>
  );
}
