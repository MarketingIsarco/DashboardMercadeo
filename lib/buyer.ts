import {
  PERFIL_CAMPOS,
  PERFIL_NUCLEO,
  PERFIL_UMBRALES,
} from '@/lib/config/negocio';
import type { PerfilCampo, PerfilGrupo, PerfilViz } from '@/lib/config/negocio';
import { isCita, isVisita } from '@/lib/selectors';
import type { Lead, Meta } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUYER PERSONA — derivaciones sobre los campos de perfilamiento.
 *
 * Todo lo que dibuja el capítulo 07 sale de aquí. El componente sólo pinta,
 * igual que en `inversion.ts` y `cohortes.ts`: Chart.js dibuja en canvas y los
 * valores de una gráfica no se pueden leer desde el DOM, así que la única forma
 * de verificar estas cifras con asserts es tenerlas en un módulo puro.
 *
 * La regla que atraviesa el módulo: **el denominador es el trato diligenciado,
 * no el trato**. Un 42% de mujeres significa 42% de quienes tienen género
 * registrado; dividir entre todos los leads convertiría la pereza del equipo
 * comercial en una afirmación sobre el mercado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `-1` cuando el campo no está diligenciado o el trato no trae perfilamiento. */
export function perfilVal(lead: Lead, campo: number): number {
  // `perfil` llega vacío en los tratos sin un solo campo diligenciado, que son
  // la mayoría: quien lo lea tiene que tolerarlo.
  return lead.perfil.length ? (lead.perfil[campo] ?? -1) : -1;
}

export function tieneCampo(lead: Lead, campo: number): boolean {
  return perfilVal(lead, campo) >= 0;
}

/** Un trato está perfilado si tiene **al menos un** campo diligenciado. */
export function estaPerfilado(lead: Lead): boolean {
  return lead.perfil.some((v) => v >= 0);
}

/**
 * Trato con los cuatro campos del núcleo al mismo tiempo.
 *
 * Es la muestra sobre la que se puede cruzar dos variables: un trato con género
 * pero sin edad no sirve para sostener "hombres de 36 a 45".
 */
export function nucleoCompleto(lead: Lead): boolean {
  return PERFIL_NUCLEO.every((c) => tieneCampo(lead, c));
}

/**
 * La categoría a la que pertenece un trato en un campo — ya como texto.
 *
 * Unifica los dos tipos: en un campo categórico resuelve el índice contra
 * `Meta.perfil`, y en uno numérico ubica el valor crudo en su rango. Devuelve
 * `null` cuando el campo no está diligenciado, para que quien cruce dos
 * variables descarte el trato en vez de inventarle una categoría.
 */
export function categoria(lead: Lead, campo: number, meta: Meta): string | null {
  const v = perfilVal(lead, campo);
  if (v < 0) return null;

  const def = PERFIL_CAMPOS[campo];
  if (def.viz === 'histograma') return bucketDe(v, def);

  return meta.perfil[campo]?.values[v] ?? null;
}

/** El rango de `PerfilCampo.buckets` que contiene a `valor`. */
function bucketDe(valor: number, def: PerfilCampo): string | null {
  for (const b of def.buckets ?? []) {
    if (b.min !== null && valor < b.min) continue;
    if (b.max !== null && valor >= b.max) continue;
    return b.label;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Distribución de un campo
// ─────────────────────────────────────────────────────────────────────

export interface DistItem {
  label: string;
  n: number;
}

export interface Distribucion {
  campo: number;
  label: string;
  viz: PerfilViz;
  grupo: PerfilGrupo;
  /** El campo no existe hoy en Pipedrive con ninguno de sus alias. */
  ausente: boolean;
  /** Tratos del recorte con el campo diligenciado — el denominador de todo. */
  conDato: number;
  /** Tratos del recorte sin el campo diligenciado. */
  sinDato: number;
  items: DistItem[];
  /** Sólo en campos numéricos: la mediana de los valores diligenciados. */
  mediana?: number;
}

/**
 * Reparto de un campo sobre un recorte de leads.
 *
 * Cada `viz` ordena distinto y por una razón:
 *
 * · `barra` conserva el orden canónico **incluyendo las categorías en cero**.
 *   Que no haya un solo lead de 18 a 25 es información; esconder la barra haría
 *   que el hueco pasara desapercibido.
 * · `torta` ordena por frecuencia y oculta los ceros: una dona con porciones
 *   vacías no se lee.
 * · `ranking` es texto libre con cola larga (hay 60 localidades): se queda con
 *   las `topN` y manda el resto a "Otros", que se mantiene visible para que no
 *   parezca que el top es todo el universo.
 * · `histograma` corta el valor crudo en los rangos del campo, en orden.
 */
export function distribucion(leads: Lead[], meta: Meta, campo: number): Distribucion {
  const def = PERFIL_CAMPOS[campo];
  const ausente = meta.perfil[campo]?.ausente ?? true;

  const counts = new Map<string, number>();
  const numeros: number[] = [];
  let conDato = 0;

  for (const l of leads) {
    const v = perfilVal(l, campo);
    if (v < 0) continue;

    const cat = categoria(l, campo, meta);
    // Un índice que no resuelve a texto es un dato inconsistente entre `leads`
    // y `meta`; se cuenta como no diligenciado antes que como categoría fantasma.
    if (cat === null) continue;

    conDato += 1;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
    if (def.viz === 'histograma') numeros.push(v);
  }

  const base: Distribucion = {
    campo,
    label: def.label,
    viz: def.viz,
    grupo: def.grupo,
    ausente,
    conDato,
    sinDato: leads.length - conDato,
    items: [],
  };

  if (def.viz === 'histograma') {
    base.items = (def.buckets ?? []).map((b) => ({ label: b.label, n: counts.get(b.label) ?? 0 }));
    if (numeros.length) base.mediana = medianaDe(numeros);
    return base;
  }

  if (def.viz === 'barra') {
    const canon = def.orden ?? [];
    const extra = [...counts.keys()].filter((k) => !canon.includes(k)).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    base.items = [...canon, ...extra].map((k) => ({ label: k, n: counts.get(k) ?? 0 }));
    return base;
  }

  const ordenadas = [...counts.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  if (def.viz === 'ranking' && def.topN && ordenadas.length > def.topN) {
    const top = ordenadas.slice(0, def.topN);
    const resto = ordenadas.slice(def.topN).reduce((acc, r) => acc + r.n, 0);
    base.items = [...top, { label: `Otros (${ordenadas.length - def.topN})`, n: resto }];
    return base;
  }

  base.items = ordenadas;
  return base;
}

/** Mediana de una lista no vacía. No muta el argumento. */
function medianaDe(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─────────────────────────────────────────────────────────────────────
// Calidad del dato
// ─────────────────────────────────────────────────────────────────────

export interface Cobertura {
  /** Leads del recorte. */
  total: number;
  /** Leads con al menos un campo diligenciado. */
  perfilados: number;
  /** `perfilados / total`, en porcentaje. */
  indice: number;
  /** Leads con los cuatro campos del núcleo. */
  nucleo: number;
  /** Cuántos leads tienen diligenciado cada campo, en el orden de `PERFIL_CAMPOS`. */
  porCampo: number[];
  /** Campos que no existen hoy en el CRM. */
  ausentes: number[];
}

export function cobertura(leads: Lead[], meta: Meta): Cobertura {
  const porCampo = new Array<number>(PERFIL_CAMPOS.length).fill(0);
  let perfilados = 0;
  let nucleo = 0;

  for (const l of leads) {
    if (!l.perfil.length) continue;

    let alguno = false;
    for (let i = 0; i < PERFIL_CAMPOS.length; i++) {
      if (perfilVal(l, i) >= 0) {
        porCampo[i] += 1;
        alguno = true;
      }
    }
    if (alguno) perfilados += 1;
    if (nucleoCompleto(l)) nucleo += 1;
  }

  return {
    total: leads.length,
    perfilados,
    indice: leads.length ? (perfilados / leads.length) * 100 : 0,
    nucleo,
    porCampo,
    ausentes: meta.perfil.map((m, i) => (m.ausente ? i : -1)).filter((i) => i >= 0),
  };
}

export type NivelSuficiencia = 'preliminar' | 'descriptivo' | 'accionable';

export interface Suficiencia {
  nivel: NivelSuficiencia;
  etiqueta: string;
  /** Qué se puede afirmar con esta muestra, en una frase. */
  mensaje: string;
  color: string;
}

/**
 * Semáforo sobre el número de tratos con núcleo completo.
 *
 * El umbral no es estadística de manual: es la regla que Mercadeo ya usa en el
 * informe mensual de perfilamiento, y tenerla igual en los dos lados evita que
 * el dashboard llame "buyer persona" a lo que el informe llama "preliminar".
 */
export function suficiencia(nucleo: number): Suficiencia {
  if (nucleo >= PERFIL_UMBRALES.accionable) {
    return {
      nivel: 'accionable',
      etiqueta: 'Buyer persona accionable',
      mensaje: 'La muestra admite cruzar dos variables y construir públicos de pauta.',
      color: '#4ade80',
    };
  }
  if (nucleo >= PERFIL_UMBRALES.descriptivo) {
    return {
      nivel: 'descriptivo',
      etiqueta: 'Perfil descriptivo',
      mensaje: 'Alcanza para leer cada variable por separado, no para cruzarlas.',
      color: '#f59e0b',
    };
  }
  return {
    nivel: 'preliminar',
    etiqueta: 'Perfil preliminar',
    mensaje: 'No sirve todavía para construir públicos de pauta ni para decidir tipologías.',
    color: '#f43f5e',
  };
}

export interface MesCobertura {
  month: string;
  total: number;
  perfilados: number;
  indice: number;
}

/**
 * Índice de perfilamiento mes a mes.
 *
 * Es la gráfica que responde la pregunta de gestión: el patrón conocido es que
 * cuando entran más leads el equipo deja de perfilar, así que la línea del
 * índice se lee contra las barras de volumen, nunca sola.
 */
export function coberturaMensual(leads: Lead[]): MesCobertura[] {
  const porMes = new Map<string, { total: number; perfilados: number }>();

  for (const l of leads) {
    const e = porMes.get(l.month) ?? { total: 0, perfilados: 0 };
    e.total += 1;
    if (estaPerfilado(l)) e.perfilados += 1;
    porMes.set(l.month, e);
  }

  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({
      month,
      total: e.total,
      perfilados: e.perfilados,
      indice: e.total ? (e.perfilados / e.total) * 100 : 0,
    }));
}

// ─────────────────────────────────────────────────────────────────────
// Explorador combinado
// ─────────────────────────────────────────────────────────────────────

export interface Combinacion {
  /** El valor de cada variable seleccionada, en el mismo orden que se pidieron. */
  valores: string[];
  n: number;
  citas: number;
  visitas: number;
  cierres: number;
  /** `n` sobre la base — el porcentaje del segmento dentro de la muestra cruzada. */
  pctBase: number;
  tasaVisita: number;
  tasaCierre: number;
}

export interface Combinado {
  /**
   * Tratos que tienen **todas** las variables seleccionadas diligenciadas.
   *
   * Es el denominador y el dato incómodo del explorador: cruzar tres variables
   * con 10% de perfilamiento deja una base minúscula. Mostrarla arriba evita
   * que alguien lea "el 60% de este segmento cierra" sin ver que son 5 tratos.
   */
  base: number;
  filas: Combinacion[];
}

/**
 * Una fila por combinación de valores presente en los datos.
 *
 * Sólo entran los tratos que tienen **todas** las variables: un trato con
 * género y edad pero sin localidad no puede ir a ninguna fila de un cruce de
 * tres, y meterlo en una categoría "sin dato" crearía un segmento que no
 * existe. Por eso la base cae rápido al agregar variables — es la mecánica del
 * cruce, no un error del filtro.
 *
 * Se ordena por volumen. Ordenar por tasa de cierre pondría arriba las
 * combinaciones de 2 y 3 tratos, que es justo lo que no se debe mirar primero;
 * el componente deja cambiarlo, con el corte de muestra mínima a la mano.
 */
export function combinaciones(leads: Lead[], meta: Meta, campos: number[], ganados: Lead[]): Combinado {
  const acc = new Map<string, Combinacion>();
  let base = 0;

  /** Valores del trato en las variables pedidas; `null` si le falta alguna. */
  const valoresDe = (l: Lead): string[] | null => {
    const valores: string[] = [];
    for (const c of campos) {
      const v = categoria(l, c, meta);
      if (v === null) return null;
      valores.push(v);
    }
    return valores;
  };

  for (const l of leads) {
    const valores = valoresDe(l);
    if (!valores) continue;

    base += 1;
    // El separador no puede aparecer en un valor del CRM: "Invertir, Habitar"
    // lleva coma, y los rangos de ingresos llevan puntos.
    const clave = valores.join('\u0000');

    const r =
      acc.get(clave) ??
      { valores, n: 0, citas: 0, visitas: 0, cierres: 0, pctBase: 0, tasaVisita: 0, tasaCierre: 0 };

    r.n += 1;
    if (isCita(l)) r.citas += 1;
    if (isVisita(l)) r.visitas += 1;
    acc.set(clave, r);
  }

  // Los cierres salen de los ganados del periodo por **fecha de ganado**, no de
  // los leads creados en él. Sólo suman a un segmento que ya tiene leads en el
  // filtro: una fila con cierres y cero leads no es un segmento que se pueda
  // leer, y su tasa sería infinita.
  for (const g of ganados) {
    const valores = valoresDe(g);
    if (!valores) continue;
    const r = acc.get(valores.join('\u0000'));
    if (r) r.cierres += 1;
  }

  const filas = [...acc.values()]
    .map((r) => ({
      ...r,
      pctBase: base ? (r.n / base) * 100 : 0,
      tasaVisita: r.n ? (r.visitas / r.n) * 100 : 0,
      tasaCierre: r.n ? (r.cierres / r.n) * 100 : 0,
    }))
    .sort((a, b) => b.n - a.n || a.valores.join().localeCompare(b.valores.join()));

  return { base, filas };
}
