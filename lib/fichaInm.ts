import {
  ACABADOS_NO,
  ACABADOS_SI,
  FICHA_AREA,
  FICHA_ENTREGA,
  FICHA_INMUEBLE,
  FICHA_INM_CAMPOS,
  FICHA_PRESUPUESTO,
  FICHA_TIPO,
  INMOBILIARIA_IDX,
  PROJECTS,
} from '@/lib/config/negocio';
import { normalize } from '@/lib/format';
import { STATUS_LOST, STATUS_OPEN, STATUS_WON } from '@/lib/types';
import type { Lead, Meta } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMERCIAL INM — lógica pura del panel del asesor de la inmobiliaria.
 *
 * Vive aparte del componente porque Chart.js dibuja en canvas y sus cifras no
 * se pueden leer desde el DOM: así se prueban con asserts en Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SIN_DATO = 'Sin dato';

const INM = new Set(INMOBILIARIA_IDX);

/** Sólo tratos de proyectos de la inmobiliaria. */
export function esInmobiliaria(l: Lead): boolean {
  return INM.has(l.project);
}

/** Valor de un campo de la ficha; tolera el arreglo vacío (o ausente). */
export function fichaVal(l: Lead, campo: number): number {
  const f = l.ficha;
  return f && f.length ? (f[campo] ?? -1) : -1;
}

/** Texto de un campo categórico de la ficha; `''` sin diligenciar. */
export function fichaTexto(l: Lead, meta: Meta, campo: number): string {
  const v = fichaVal(l, campo);
  return v >= 0 ? (meta.ficha?.[campo]?.values[v] ?? '') : '';
}

const SI = new Set(ACABADOS_SI.map(normalize));
const NO = new Set(ACABADOS_NO.map(normalize));

/** Entrega con acabados, derivada del campo "Entrega". `''` = sin dato. */
export function acabados(l: Lead, meta: Meta): 'Sí' | 'No' | '' {
  const t = normalize(fichaTexto(l, meta, FICHA_ENTREGA));
  if (!t) return '';
  if (SI.has(t)) return 'Sí';
  if (NO.has(t)) return 'No';
  return '';
}

/** Los cinco campos diligenciados. */
export function fichaCompleta(l: Lead): boolean {
  return FICHA_INM_CAMPOS.every((_, i) => fichaVal(l, i) > (FICHA_INM_CAMPOS[i].viz === 'histograma' ? 0 : -1));
}

export interface PanelFiltro {
  /** Índice de `PROJECTS` (el embudo); `null` = todos los de la inmobiliaria. */
  proyecto: number | null;
  /** Índice de `meta.advisors`; `null` = todos. */
  asesor: number | null;
}

export function filtrarPanel(leads: Lead[], f: PanelFiltro): Lead[] {
  return leads.filter(
    (l) => (f.proyecto === null || l.project === f.proyecto) && (f.asesor === null || l.advisor === f.asesor),
  );
}

export interface Item {
  label: string;
  n: number;
}

export interface Distribucion {
  items: Item[];
  /** Tratos con el campo diligenciado: el denominador de los porcentajes. */
  conDato: number;
  sinDato: number;
}

/** Conteo de un campo categórico. Orden canónico primero, luego por frecuencia. */
export function distCategoria(leads: Lead[], meta: Meta, campo: number, topN?: number): Distribucion {
  const values = meta.ficha?.[campo]?.values ?? [];
  const n = new Array<number>(values.length).fill(0);
  let sinDato = 0;
  for (const l of leads) {
    const v = fichaVal(l, campo);
    if (v >= 0 && v < n.length) n[v]++;
    else sinDato++;
  }
  const canon = FICHA_INM_CAMPOS[campo].orden?.length ?? 0;
  let items = values.map((label, i) => ({ label, n: n[i], i })).filter((x) => x.n > 0);
  items = [
    ...items.filter((x) => x.i < canon),
    ...items.filter((x) => x.i >= canon).sort((a, b) => b.n - a.n),
  ];
  if (FICHA_INM_CAMPOS[campo].viz === 'ranking') items.sort((a, b) => b.n - a.n);
  let out: Item[] = items.map(({ label, n: c }) => ({ label, n: c }));
  if (topN && out.length > topN) {
    const resto = out.slice(topN - 1).reduce((s, x) => s + x.n, 0);
    out = [...out.slice(0, topN - 1), { label: 'Otros', n: resto }];
  }
  return { items: out, conDato: leads.length - sinDato, sinDato };
}

/** Histograma de presupuesto o área sobre los `buckets` del campo. */
export function distBuckets(leads: Lead[], campo: number): Distribucion {
  const buckets = FICHA_INM_CAMPOS[campo].buckets ?? [];
  const n = new Array<number>(buckets.length).fill(0);
  let sinDato = 0;
  for (const l of leads) {
    const v = fichaVal(l, campo);
    if (v <= 0) {
      sinDato++;
      continue;
    }
    const b = buckets.findIndex((k) => (k.min === null || v >= k.min) && (k.max === null || v < k.max));
    if (b >= 0) n[b]++;
  }
  return {
    items: buckets.map((b, i) => ({ label: b.label, n: n[i] })),
    conDato: leads.length - sinDato,
    sinDato,
  };
}

export function distAcabados(leads: Lead[], meta: Meta): Distribucion {
  let si = 0;
  let no = 0;
  for (const l of leads) {
    const a = acabados(l, meta);
    if (a === 'Sí') si++;
    else if (a === 'No') no++;
  }
  return {
    items: [
      { label: 'Con acabados', n: si },
      { label: 'Sin acabados', n: no },
    ],
    conDato: si + no,
    sinDato: leads.length - si - no,
  };
}

/** Fuente del trato (`Lead.source`), ranking descendente. */
export function distFuente(leads: Lead[], meta: Meta, topN = 10): Distribucion {
  const n = new Map<number, number>();
  for (const l of leads) n.set(l.source, (n.get(l.source) ?? 0) + 1);
  let items = [...n.entries()]
    .map(([i, c]) => ({ label: meta.sources[i] ?? SIN_DATO, n: c }))
    .sort((a, b) => b.n - a.n);
  if (items.length > topN) {
    const resto = items.slice(topN - 1).reduce((s, x) => s + x.n, 0);
    items = [...items.slice(0, topN - 1), { label: 'Otras', n: resto }];
  }
  return { items, conDato: leads.length, sinDato: 0 };
}

export interface PorEtapa {
  etapas: string[];
  abiertos: number[];
  ganados: number[];
  perdidos: number[];
}

/**
 * Negocios por etapa **actual**, con el nombre real de Pipedrive.
 *
 * Con un embudo escogido salen sus etapas y en su orden; con "Todos", la unión
 * de las etapas de los embudos de la inmobiliaria. Un trato cuya etapa no está
 * en la lista (un pipeline nuevo) no se pierde: cae en "Sin etapa".
 */
export function porEtapa(leads: Lead[], meta: Meta, proyecto: number | null): PorEtapa {
  const proyectos = proyecto === null ? INMOBILIARIA_IDX : [proyecto];
  const set = new Set<number>();
  for (const p of proyectos) for (const e of meta.etapasPorProyecto?.[p] ?? []) set.add(e);
  const idx = [...set].sort((a, b) => a - b);
  const pos = new Map(idx.map((e, i) => [e, i]));
  const etapas = idx.map((e) => meta.etapasCrm?.[e] ?? SIN_DATO);
  const abiertos = new Array<number>(etapas.length).fill(0);
  const ganados = abiertos.slice();
  const perdidos = abiertos.slice();
  let extra = -1;
  for (const l of leads) {
    let i = pos.get(l.etapaCrm);
    if (i === undefined) {
      if (extra < 0) {
        extra = etapas.length;
        etapas.push('Sin etapa');
        abiertos.push(0);
        ganados.push(0);
        perdidos.push(0);
      }
      i = extra;
    }
    if (l.status === STATUS_WON) ganados[i]++;
    else if (l.status === STATUS_LOST) perdidos[i]++;
    else abiertos[i]++;
  }
  return { etapas, abiertos, ganados, perdidos };
}

export interface FilaCliente {
  id: number;
  cliente: string;
  telefono: string;
  embudo: string;
  etapa: string;
  /** Posición de la etapa en el embudo, para ordenar. */
  etapaOrden: number;
  estado: 'Abierto' | 'Ganado' | 'Perdido';
  inmueble: string;
  tipo: string;
  entrega: string;
  acabados: 'Sí' | 'No' | '';
  /** COP; `null` sin diligenciar. */
  presupuesto: number | null;
  /** m²; `null` sin diligenciar. */
  area: number | null;
  fuente: string;
  asesor: string;
  dias: number;
}

/**
 * Una fila por cliente. Orden: abiertos primero, de la etapa más avanzada a la
 * más temprana, y dentro de la etapa el más antiguo arriba — es el orden en
 * que el asesor tiene que mirarlos.
 */
export function filasCliente(leads: Lead[], meta: Meta): FilaCliente[] {
  const filas = leads.map<FilaCliente>((l) => {
    const p = fichaVal(l, FICHA_PRESUPUESTO);
    const a = fichaVal(l, FICHA_AREA);
    return {
      id: l.id,
      cliente: l.name,
      telefono: l.phone,
      embudo: PROJECTS[l.project] ?? '',
      etapa: meta.etapasCrm?.[l.etapaCrm] ?? SIN_DATO,
      etapaOrden: l.etapaCrm,
      estado: l.status === STATUS_WON ? 'Ganado' : l.status === STATUS_LOST ? 'Perdido' : 'Abierto',
      inmueble: fichaTexto(l, meta, FICHA_INMUEBLE),
      tipo: fichaTexto(l, meta, FICHA_TIPO),
      entrega: fichaTexto(l, meta, FICHA_ENTREGA),
      acabados: acabados(l, meta),
      presupuesto: p > 0 ? p : null,
      area: a > 0 ? a : null,
      fuente: meta.sources[l.source] ?? SIN_DATO,
      asesor: meta.advisors[l.advisor] ?? SIN_DATO,
      dias: l.ageDays,
    };
  });
  const rankEstado = { Abierto: 0, Ganado: 1, Perdido: 2 } as const;
  return filas.sort(
    (x, y) =>
      rankEstado[x.estado] - rankEstado[y.estado] || y.etapaOrden - x.etapaOrden || y.dias - x.dias,
  );
}

export interface ResumenPanel {
  negocios: number;
  abiertos: number;
  /** Abiertos parados hoy en Negociación o más adelante. */
  avanzados: number;
  /** Suma del presupuesto declarado de los abiertos. */
  presupuestoAbierto: number;
  conPresupuesto: number;
  fichaCompleta: number;
}

export function resumenPanel(leads: Lead[], meta: Meta): ResumenPanel {
  const negociacion = meta.etapasCrm?.findIndex((e) => normalize(e) === 'negociacion') ?? -1;
  let abiertos = 0;
  let avanzados = 0;
  let presupuestoAbierto = 0;
  let conPresupuesto = 0;
  let completa = 0;
  for (const l of leads) {
    if (fichaCompleta(l)) completa++;
    if (l.status !== STATUS_OPEN) continue;
    abiertos++;
    if (negociacion >= 0 && l.etapaCrm >= negociacion) avanzados++;
    const p = fichaVal(l, FICHA_PRESUPUESTO);
    if (p > 0) {
      presupuestoAbierto += p;
      conPresupuesto++;
    }
  }
  return { negocios: leads.length, abiertos, avanzados, presupuestoAbierto, conPresupuesto, fichaCompleta: completa };
}
