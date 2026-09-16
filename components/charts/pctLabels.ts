'use client';

import type { ArcElement, Chart, ChartType, Plugin } from 'chart.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Etiquetas de porcentaje sobre las porciones y las barras.
 *
 * Es un plugin propio y no `chartjs-plugin-datalabels` a propósito: lo único
 * que necesitamos es un porcentaje sobre cada elemento, y meter una dependencia
 * al `package.json` del repo por eso obliga a Diego a revisar y mantener una
 * librería entera. Esto son cien líneas que hacen exactamente lo que pide
 * Mercadeo.
 *
 * No se registra globalmente: se pasa por el prop `plugins` de cada gráfica que
 * lo quiere. Registrarlo global le pondría porcentajes a las gráficas de
 * inversión y de pipeline, donde el eje ya está en pesos o en leads y un
 * porcentaje encima sobra.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PctLabelsOptions {
  /**
   * Denominador del porcentaje. Sin él se usa la suma del dataset, que es lo
   * correcto en una dona pero no siempre en una barra: cuando el capítulo mide
   * cobertura, el denominador es "los tratos con el campo diligenciado", no la
   * suma de las barras dibujadas.
   */
  total?: number;
  /**
   * Porcentaje mínimo para dibujar la etiqueta. En una dona, por debajo de ~3%
   * la porción no tiene ancho para el texto y las etiquetas se encaraman unas
   * sobre otras. En barras no hace falta: el texto va por fuera.
   */
  min?: number;
}

declare module 'chart.js' {
  // Sin esto, `options.plugins.pctLabels` no existe para TypeScript y cada
  // gráfica que lo configure necesitaría un cast.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    pctLabels?: PctLabelsOptions;
  }
}

/** `42.1%`. Siempre un decimal: comparar 42% con 42.1% entre tarjetas confunde. */
function fmt(p: number): string {
  return `${p.toFixed(1)}%`;
}

function dibujar(chart: Chart, o: PctLabelsOptions): void {
  const { ctx } = chart;
  const horizontal = chart.options.indexAxis === 'y';

  ctx.save();
  ctx.font = "600 10px 'Montserrat', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  chart.data.datasets.forEach((ds, di) => {
    const metaDs = chart.getDatasetMeta(di);
    if (metaDs.hidden) return;

    const values = (ds.data as unknown[]).map((v) => Number(v) || 0);
    const total = o.total ?? values.reduce((a, b) => a + b, 0);
    if (!total) return;

    metaDs.data.forEach((el, i) => {
      const v = values[i];
      if (!v) return;

      const p = (v / total) * 100;
      const texto = fmt(p);

      // Una porción de dona tiene `startAngle`; una barra, no. Es la forma
      // barata de distinguirlas sin depender del tipo declarado del chart, que
      // en los mixtos es el del primer dataset y no necesariamente el de este.
      if ('startAngle' in el) {
        if (p < (o.min ?? 3)) return;

        const { x, y } = (el as ArcElement).getCenterPoint(false);
        // Blanco con contorno oscuro: la paleta va del dorado al lima con alfa
        // `cc`, y ningún color fijo se lee bien sobre todos.
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(15,18,30,0.55)';
        ctx.strokeText(texto, x, y);
        ctx.fillStyle = '#fff';
        ctx.fillText(texto, x, y);
        return;
      }

      if (p < (o.min ?? 0)) return;

      // La barra lleva la etiqueta afuera, sobre el fondo de la tarjeta: son
      // barras cortas y el texto adentro quedaría partido.
      ctx.fillStyle = '#4a4a63';
      if (horizontal) {
        ctx.textAlign = 'left';
        ctx.fillText(texto, el.x + 6, el.y);
        ctx.textAlign = 'center';
      } else {
        ctx.fillText(texto, el.x, el.y - 8);
      }
    });
  });

  ctx.restore();
}

/**
 * Un plugin tipado para el tipo de gráfica que lo va a usar.
 *
 * `Plugin` es invariante en su tipo de gráfica, así que un `Plugin<ChartType>`
 * no se le puede pasar a un `<Doughnut>`. En vez de regar casts por cada
 * gráfica, se instancia una vez por tipo y el dibujo vive en `dibujar`.
 */
function crear<T extends ChartType>(): Plugin<T> {
  return {
    id: 'pctLabels',
    afterDatasetsDraw(chart, _args, options) {
      dibujar(chart as unknown as Chart, (options ?? {}) as PctLabelsOptions);
    },
  };
}

export const pctLabelsDoughnut = crear<'doughnut'>();
export const pctLabelsBar = crear<'bar'>();
