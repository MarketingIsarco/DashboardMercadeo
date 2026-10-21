'use client';

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
} from 'chart.js';

let registered = false;

/**
 * Chart.js registra por efecto secundario, así que esto debe correr una sola
 * vez y antes del primer render de un chart.
 */
export function ensureChartsRegistered(): void {
  if (registered) return;
  Chart.register(
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Filler,
    Title,
    Tooltip,
    Legend,
  );
  Chart.defaults.font.family = "'Montserrat', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#475569';
  Chart.defaults.maintainAspectRatio = false;
  // Línea gráfica: tooltip en azul petróleo y barras con esquinas suaves.
  Chart.defaults.plugins.tooltip.backgroundColor = '#073b52';
  Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor = '#e2f1f7';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.titleFont = { family: "'Montserrat', sans-serif", weight: 'bold', size: 12 };
  Chart.defaults.elements.bar.borderRadius = 4;
  registered = true;
}

export const GRID_COLOR = '#eef2f6';
export const TICK_COLOR = '#475569';

/** Ejes con la retícula tenue del diseño original. */
export const baseScales = {
  x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
  y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR }, beginAtZero: true },
} as const;

export const legendBottom = {
  position: 'bottom' as const,
  labels: { color: TICK_COLOR, padding: 8, font: { size: 11 } },
};
