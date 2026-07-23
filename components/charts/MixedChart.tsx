'use client';

import type { ChartData, ChartOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';

/** Un chart que combina barras y líneas en los mismos ejes. */
export type MixedType = 'bar' | 'line';
export type MixedData = ChartData<MixedType, number[], string>;
export type MixedOptions = ChartOptions<MixedType>;

/**
 * `<Bar>` y `<Line>` fijan el tipo de todos sus datasets, así que un dataset
 * `type: 'line'` dentro de un `<Bar>` no compila. `<Chart>` acepta la unión.
 */
export function MixedChart({ data, options }: { data: MixedData; options?: MixedOptions }) {
  return <Chart<MixedType, number[], string> type="bar" data={data} options={options} />;
}
