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
  /**
   * Achica la tarjeta entera, no sólo el número.
   *
   * · `'sm'` es para los KPIs de plata: un conteo de leads son tres dígitos,
   *   pero un `$12.345.678` a 28px se sale de la tarjeta.
   * · `'xs'` es para las filas de siete u ocho indicadores que tienen que
   *   caber en una sola línea. Baja también el rótulo y el relleno, porque a
   *   ese ancho lo que desborda primero es "CIERRES PROYECTADOS", no la cifra.
   * · `'xxs'` es el mismo caso llevado a nueve tarjetas: el embudo completo,
   *   de Leads a Cierres proyectados. Un embudo partido en dos filas se lee
   *   como dos cosas distintas, así que aquí encoge el texto y no la fila.
   */
  size?: 'md' | 'sm' | 'xs' | 'xxs';
}

const VALUE_SIZE = { md: 'text-[28px]', sm: 'text-[21px]', xs: 'text-[19px]', xxs: 'text-[17px]' } as const;
const LABEL_SIZE = { md: 'text-[11px]', sm: 'text-[11px]', xs: 'text-[9px]', xxs: 'text-[8px]' } as const;
const META_SIZE = { md: 'text-[11px]', sm: 'text-[11px]', xs: 'text-[9px]', xxs: 'text-[8px]' } as const;
// Las utilidades de Tailwind ganan sobre el `@apply` de `.kpi-card`, que es
// capa de componentes: basta con añadir el padding más apretado.
const PAD = { md: '', sm: '', xs: 'px-2 py-2.5', xxs: 'px-1.5 py-2' } as const;

export function Kpi({ label, value, meta, delta, deltaSuffix = '%', sub, size = 'md' }: KpiProps) {
  const showDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const up = showDelta && (delta as number) >= 0;

  return (
    <div className={`kpi-card min-w-0 ${PAD[size]}`}>
      <div className={`font-semibold uppercase leading-tight tracking-wide text-dim ${LABEL_SIZE[size]}`}>{label}</div>
      <div className={`my-0.5 font-extrabold leading-tight text-text ${VALUE_SIZE[size]}`}>{value}</div>
      {meta ? <div className={`leading-tight text-muted ${META_SIZE[size]}`}>{meta}</div> : null}
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

/**
 * Rejilla de KPIs.
 *
 * Con `cols` la fila es **exactamente** de ese ancho y no se parte nunca: las
 * columnas son `minmax(0, 1fr)`, así que las tarjetas se encogen en vez de
 * saltar de línea. Es lo que pidió Mercadeo para los indicadores generales —
 * un embudo partido en dos filas se lee como dos cosas distintas.
 *
 * Sin `cols` se reparte sola con `auto-fit`, que es lo correcto donde la fila
 * no es un embudo y las tarjetas llevan cifras largas (el capítulo 05 de
 * inversión tiene ocho KPIs en pesos: forzarlos a una línea los volvería
 * ilegibles).
 */
export function KpiGrid({ children, cols }: { children: ReactNode; cols?: number }) {
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: cols
          ? `repeat(${cols}, minmax(0, 1fr))`
          : 'repeat(auto-fit, minmax(140px, 1fr))',
        maxWidth: '100%',
      }}
    >
      {children}
    </div>
  );
}
