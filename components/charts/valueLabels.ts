'use client';

import type { Chart, ChartType, Plugin } from 'chart.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Etiquetas con el **valor** de cada barra (no el porcentaje: eso es
 * `pctLabels`). Mismo criterio que allá: plugin propio de pocas líneas en vez
 * de sumar `chartjs-plugin-datalabels` al repo, y se pasa por el prop
 * `plugins` sólo a las gráficas que lo piden.
 *
 *  · Barras sueltas o agrupadas: el número va encima de la barra.
 *  · Barras apiladas (`stacked: true`): va dentro del segmento, en blanco, y
 *    con `totales: true` se escribe además el total encima de la pila.
 *
 * La gráfica que lo use debe dejar aire arriba (`layout.padding.top`) para
 * que la etiqueta de la barra más alta no se corte.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ValueLabelsOptions {
  stacked?: boolean;
  /** Sólo con `stacked`: total de la pila encima. */
  totales?: boolean;
  /** Alto mínimo en px de un segmento apilado para escribir su valor adentro. */
  minAlto?: number;
}

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    valueLabels?: ValueLabelsOptions;
  }
}

const fmt = (v: number) => v.toLocaleString('es-CO');

/**
 * Texto claro u oscuro según el color del segmento: blanco sobre el azul
 * petróleo, azul oscuro sobre el naranja o el ámbar, donde el blanco no se lee.
 */
function textoSobre(color: unknown): string {
  const hex = typeof color === 'string' && /^#[0-9a-f]{6}/i.test(color) ? color.slice(1, 7) : '';
  if (!hex) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#073b52' : '#fff';
}

function dibujar(chart: Chart, o: ValueLabelsOptions): void {
  const { ctx } = chart;
  const visibles = chart.data.datasets
    .map((ds, di) => ({ ds, di, meta: chart.getDatasetMeta(di) }))
    .filter(({ meta, ds }) => !meta.hidden && (ds.type ?? 'bar') === 'bar');

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (o.stacked) {
    const tope: Record<number, { y: number; total: number; x: number }> = {};

    for (const { ds, meta } of visibles) {
      (ds.data as unknown[]).forEach((raw, i) => {
        const v = Number(raw) || 0;
        const el = meta.data[i] as unknown as { x: number; y: number; base: number } | undefined;
        if (!el || !v) return;

        const t = tope[i] ?? { y: el.y, total: 0, x: el.x };
        t.total += v;
        t.y = Math.min(t.y, el.y);
        tope[i] = t;

        if (Math.abs(el.base - el.y) < (o.minAlto ?? 14)) return;
        ctx.font = "700 11px 'Montserrat', sans-serif";
        ctx.fillStyle = textoSobre(ds.borderColor);
        ctx.fillText(fmt(v), el.x, (el.y + el.base) / 2);
      });
    }

    if (o.totales) {
      ctx.font = "800 11px 'Montserrat', sans-serif";
      ctx.fillStyle = '#073b52';
      for (const t of Object.values(tope)) ctx.fillText(fmt(t.total), t.x, t.y - 9);
    }
  } else {
    ctx.font = "600 10px 'Montserrat', sans-serif";
    ctx.fillStyle = '#4a4a63';
    for (const { ds, meta } of visibles) {
      (ds.data as unknown[]).forEach((raw, i) => {
        const v = Number(raw) || 0;
        const el = meta.data[i] as unknown as { x: number; y: number } | undefined;
        if (!el || !v) return;
        ctx.fillText(fmt(v), el.x, el.y - 8);
      });
    }
  }

  ctx.restore();
}

function crear<T extends ChartType>(): Plugin<T> {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart, _args, options) {
      dibujar(chart as unknown as Chart, (options ?? {}) as ValueLabelsOptions);
    },
  };
}

export const valueLabelsBar = crear<'bar'>();
