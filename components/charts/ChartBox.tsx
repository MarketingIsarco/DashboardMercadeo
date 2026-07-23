'use client';

import type { ReactNode } from 'react';

/**
 * Contenedor de altura fija para un chart.
 *
 * Chart.js con `maintainAspectRatio: false` necesita que el padre tenga altura
 * definida; si no, el canvas colapsa a 0 px o crece sin límite en cada resize.
 */
export function ChartBox({ height = 240, children }: { height?: number; children: ReactNode }) {
  return (
    <div className="relative w-full" style={{ height }}>
      {children}
    </div>
  );
}
