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
  Chart.defaults.color = '#6a6a82';
  Chart.defaults.maintainAspectRatio = false;
  registered = true;
}

export const GRID_COLOR = '#eaedf5';
export const TICK_COLOR = '#6a6a82';

/** Ejes con la retícula tenue del diseño original. */
export const baseScales = {
  x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } },
  y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR }, beginAtZero: true },
} as const;

export const legendBottom = {
  position: 'bottom' as const,
  labels: { color: TICK_COLOR, padding: 8, font: { size: 11 } },
};
