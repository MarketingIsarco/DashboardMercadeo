import { BOLSA_LABEL, BOLSAS_INMOBILIARIA, BOLSA_PROJECTS, INVERSION_MESES, INVERSION_NOTAS, INVERSION_RUBROS, RUBROS } from '@/lib/config/negocio';
import type { Bolsa, InversionNota } from '@/lib/config/negocio';
import type { FilterState } from '@/lib/selectors';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INVERSIÓN — derivaciones sobre la matriz rubro × mes.
 *
 * Todo lo que el dashboard muestra de inversión sale de aquí, para que el
 * capítulo 05 de Mercadeo y el comparativo mes a mes no puedan divergir.
 *
 * La regla del negocio, y el motivo de todo este módulo: el **CPL digital
 * divide sólo la inversión digital**. Meter vallas y merchandising en el
 * denominador de un costo por lead de Instagram infla el CPL con plata que
 * nunca compró un lead digital.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const BOLSAS: Bolsa[] = ['inari', 'tng', ...BOLSAS_INMOBILIARIA];

/** Índices de `RUBROS` marcados como digitales. */
const DIGITAL_RUBROS = new Set(RUBROS.map((r, i) => (r.digital ? i : -1)).filter((i) => i >= 0));

export interface Totales {
  total: number;
  digital: number;
  noDigital: number;
}

const CERO: Totales = { total: 0, digital: 0, noDigital: 0 };

/**
 * Bolsas presupuestales que aplican a los filtros activos.
 *
 * Un filtro de proyecto tiene que arrastrar la inversión: si el usuario mira
 * sólo Inari, el gasto de Tinguazul no puede seguir sumando en el CPL.
 *
 * Sin proyecto seleccionado entran las tres bolsas. El filtro de Unidad, que
 * antes acotaba a constructora o inmobiliaria sin tocar proyectos, ya no
 * existe: para ver una sola unidad hay que seleccionar sus proyectos, y la
 * bolsa sale de ahí.
 */
export function bolsasActivas(filters: FilterState): Bolsa[] {
  if (!filters.projects.length) return BOLSAS;

  const proyectos = new Set(filters.projects);
  return BOLSAS.filter((b) => BOLSA_PROJECTS[b].some((p) => proyectos.has(p)));
}

/**
 * Meses con presupuesto que sobreviven a los filtros de fecha.
 *
 * Un mes entra si el rango `dateFrom`–`dateTo` lo toca aunque sea un día: la
 * inversión está cargada al mes completo y no hay forma de prorratearla.
 */
export function mesesActivos(filters: FilterState): string[] {
  return INVERSION_MESES.filter((m) => {
    if (filters.year && !m.startsWith(filters.year)) return false;
    if (filters.months.length && !filters.months.includes(m)) return false;
    if (filters.exMonths.includes(m)) return false;
    if (filters.dateFrom && m < filters.dateFrom.slice(0, 7)) return false;
    if (filters.dateTo && m > filters.dateTo.slice(0, 7)) return false;
    return true;
  });
}

/** Matriz `[rubro][mes]` sumando las bolsas indicadas. */
export function matrizRubros(bolsas: Bolsa[], meses: string[]): number[][] {
  const cols = meses.map((m) => INVERSION_MESES.indexOf(m));
  return RUBROS.map((_, ri) =>
    cols.map((ci) => (ci < 0 ? 0 : bolsas.reduce((acc, b) => acc + (INVERSION_RUBROS[b][ri][ci] ?? 0), 0))),
  );
}

/** Total / digital / no-digital de un mes para las bolsas indicadas. */
export function totalesMes(bolsas: Bolsa[], mes: string): Totales {
  const ci = INVERSION_MESES.indexOf(mes);
  if (ci < 0) return CERO;

  let total = 0;
  let digital = 0;
  for (const b of bolsas) {
    for (let ri = 0; ri < RUBROS.length; ri++) {
      const v = INVERSION_RUBROS[b][ri][ci] ?? 0;
      total += v;
      if (DIGITAL_RUBROS.has(ri)) digital += v;
    }
  }
  return { total, digital, noDigital: total - digital };
}

/** Acumulado de varios meses. */
export function totales(bolsas: Bolsa[], meses: string[]): Totales {
  return meses.reduce<Totales>((acc, m) => {
    const t = totalesMes(bolsas, m);
    return { total: acc.total + t.total, digital: acc.digital + t.digital, noDigital: acc.noDigital + t.noDigital };
  }, CERO);
}

/**
 * Bolsas que cubren un proyecto del comparativo (0 = Inari, 1 = Tinguazul,
 * `null` = ambos). El comparativo sólo mira constructora.
 */
export function bolsasDeProyecto(projIdx: number | null): Bolsa[] {
  if (projIdx === 0) return ['inari'];
  if (projIdx === 1) return ['tng'];
  return ['inari', 'tng'];
}

/** Proyectos cubiertos por las bolsas activas — para filtrar los leads del CPL. */
export function proyectosDeBolsas(bolsas: Bolsa[]): number[] {
  return [...new Set(bolsas.flatMap((b) => BOLSA_PROJECTS[b]))];
}

/**
 * Notas de gasto atípico que aplican a las bolsas y meses visibles.
 *
 * Una nota sólo se muestra si su desglose cuadra peso a peso contra la celda
 * de la matriz: si alguien recarga el P&G y la celda cambia, la nota vieja
 * desaparece en vez de explicar una cifra que ya no es la que se ve.
 */
export function notasActivas(bolsas: Bolsa[], meses: string[]): InversionNota[] {
  return INVERSION_NOTAS.filter((n) => {
    if (!bolsas.includes(n.bolsa) || !meses.includes(n.mes)) return false;
    const ci = INVERSION_MESES.indexOf(n.mes);
    const celda = INVERSION_RUBROS[n.bolsa][n.rubro]?.[ci];
    return celda != null && n.items.reduce((a, it) => a + it.valor, 0) === celda;
  });
}

/**
 * Rótulo de las bolsas activas. Con los cinco embudos inmobiliarios puestos se
 * dice "Inmobiliaria" en vez de listar los cinco nombres.
 */
export function etiquetaBolsas(bolsas: Bolsa[]): string {
  const todasInm = BOLSAS_INMOBILIARIA.every((b) => bolsas.includes(b));
  const partes = bolsas
    .filter((b) => !(todasInm && BOLSAS_INMOBILIARIA.includes(b)))
    .map((b) => BOLSA_LABEL[b]);
  if (todasInm) partes.push('Inmobiliaria');
  return partes.join(' + ');
}
