import { MONTH_SHORT } from '@/lib/config/negocio';

/**
 * Minúsculas y sin tildes. Las etiquetas del CRM se escriben inconsistentemente
 * (`Pagina Web`, `Pág. Web`, `Orgánico sitio web`), así que todo emparejamiento
 * por nombre pasa por aquí.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/** Índices de `sources` cuyo nombre normalizado está en `names`. */
export function sourceIndices(sources: string[], names: string[]): number[] {
  const want = new Set(names.map(normalize));
  return sources.map((s, i) => (want.has(normalize(s)) ? i : -1)).filter((i) => i >= 0);
}

/** Porcentaje `a` sobre `b`, con un decimal. Divide-by-zero → `'0.0'`. */
export function pct(a: number, b: number): string {
  return b ? ((a / b) * 100).toFixed(1) : '0.0';
}

export function pctNum(a: number, b: number): number {
  return b ? (a / b) * 100 : 0;
}

/** `1234` → `'1.2k'`. Para ejes y KPIs donde el dígito exacto no importa. */
export function fmtN(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function fmtCOP(n: number): string {
  return COP.format(n);
}

/** `2026-07` → `'Jul 26'`. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const idx = Number(m) - 1;
  if (Number.isNaN(idx) || !MONTH_SHORT[idx]) return month;
  return `${MONTH_SHORT[idx]} ${y.slice(2)}`;
}

export function monthShort(month: string): string {
  const idx = Number(month.split('-')[1]) - 1;
  return MONTH_SHORT[idx] ?? month;
}

/**
 * Horas → `'2d 3h 15m'` / `'5h 20m'`.
 *
 * Los tiempos de respuesta van de minutos a meses, así que un número plano de
 * horas ("1683.4") no se lee. Los minutos se conservan porque abajo del día es
 * donde se juega la métrica.
 */
export function fmtHoras(h: number): string {
  const totalMin = Math.round(h * 60);
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  return dias > 0 ? `${dias}d ${horas}h ${min}m` : `${horas}h ${min}m`;
}

/** Mediana de una lista no vacía. Muta una copia, no el argumento. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Primer nombre — los ejes con 11 asesores no caben con nombre completo. */
export function firstName(fullName: string): string {
  return fullName.split(' ')[0];
}
