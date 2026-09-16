import 'server-only';

import { PERFIL_CAMPOS } from '@/lib/config/negocio';
import type { PerfilCampo } from '@/lib/config/negocio';
import { normalize } from '@/lib/format';
import type { PerfilCampoMeta } from '@/lib/types';
import type { PipedriveDeal, PipedriveDealField } from './client';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PERFILAMIENTO — de campos personalizados de Pipedrive al modelo del capítulo 07.
 *
 * Los trece campos del buyer persona se resuelven **por nombre**, no por hash.
 * Los hashes de Pipedrive son estables mientras nadie toque el campo, pero
 * cualquiera puede borrarlo y volverlo a crear desde la configuración del CRM,
 * y ahí el hash cambia sin avisar: el capítulo se quedaría en blanco y se
 * leería como "el equipo dejó de perfilar", que es exactamente la conclusión
 * equivocada. Un nombre que no aparece, en cambio, se reporta como `ausente`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un campo de perfilamiento ya localizado en la definición del CRM. */
interface CampoResuelto {
  campo: PerfilCampo;
  /** `null` cuando ninguno de los alias existe en `dealFields`. */
  key: string | null;
  /** id de opción → etiqueta, para los campos de tipo `enum` / `set`. */
  opciones: Map<string, string>;
  /** Valores ya vistos, en el orden en que se emiten. */
  values: string[];
  index: Map<string, number>;
}

/** Localiza cada campo de `PERFIL_CAMPOS` en la definición de campos del CRM. */
function resolver(dealFields: PipedriveDealField[]): CampoResuelto[] {
  // Un mismo nombre normalizado podría venir dos veces si alguien duplicó el
  // campo en el CRM; nos quedamos con el primero, que es el que Pipedrive
  // muestra primero en el formulario.
  const porNombre = new Map<string, PipedriveDealField>();
  for (const f of dealFields) {
    const n = normalize(f.name ?? '');
    if (n && !porNombre.has(n)) porNombre.set(n, f);
  }

  return PERFIL_CAMPOS.map((campo) => {
    const def = campo.alias.map((a) => porNombre.get(normalize(a))).find((f) => f !== undefined);

    const opciones = new Map<string, string>(
      (def?.options ?? []).map((o) => [String(o.id), o.label]),
    );

    // El orden canónico se siembra de una vez para que las gráficas salgan en
    // el orden del negocio (18 a 25 antes que 26 a 35) sin tener que reordenar
    // en cada render. Lo que el CRM traiga de más se agrega detrás.
    const values = [...(campo.orden ?? [])];
    const index = new Map(values.map((v, i) => [v, i]));

    return { campo, key: def?.key ?? null, opciones, values, index };
  });
}

/** Devuelve el índice de `value`, agregándolo al final si es nuevo. */
function intern(r: CampoResuelto, value: string): number {
  const existing = r.index.get(value);
  if (existing !== undefined) return existing;
  const i = r.values.length;
  r.values.push(value);
  r.index.set(value, i);
  return i;
}

/**
 * El valor crudo del deal, ya convertido a texto legible.
 *
 * Pipedrive guarda los `enum` como id de opción y los `set` (selección
 * múltiple, que es como está configurado "Interés") como ids separados por
 * coma o como arreglo, según la versión del endpoint. Se resuelven todos contra
 * la definición del campo y se vuelven a unir con `, ` — así "Invertir, Habitar"
 * queda como una sola categoría, que es como Mercadeo la lee.
 */
function texto(r: CampoResuelto, raw: unknown): string {
  if (raw === null || raw === undefined) return '';

  if (r.opciones.size) {
    const ids = Array.isArray(raw) ? raw : String(raw).split(',');
    const labels = ids
      .map((id) => r.opciones.get(String(id).trim()))
      .filter((l): l is string => Boolean(l));
    // Sin ninguna coincidencia el valor no es un id de opción: puede ser una
    // etiqueta que el CRM ya mandó resuelta. Se usa tal cual antes que perderlo.
    if (labels.length) return labels.join(', ');
  }

  if (typeof raw === 'object') return '';
  return String(raw).trim();
}

/**
 * El valor crudo del deal como número.
 *
 * Los campos monetarios llegan como número o como string con separadores
 * (`"1.250.000"`, `"1250000.00"`). Se limpia todo lo que no sea dígito, signo o
 * separador decimal antes de convertir.
 */
function numero(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  // Miles con punto y decimales con coma es el formato colombiano; miles con
  // coma y decimales con punto es el de la API. Se decide por el último
  // separador que aparezca: ese es el decimal.
  const limpio = raw.replace(/[^\d.,-]/g, '');
  const ultimoPunto = limpio.lastIndexOf('.');
  const ultimaComa = limpio.lastIndexOf(',');
  const decimal = Math.max(ultimoPunto, ultimaComa);

  const normalizado =
    decimal < 0
      ? limpio
      : `${limpio.slice(0, decimal).replace(/[.,]/g, '')}.${limpio.slice(decimal + 1)}`;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export interface PerfilExtractor {
  /**
   * Los trece valores del trato, en el orden de `PERFIL_CAMPOS`. Devuelve el
   * arreglo **vacío** cuando el trato no tiene ningún campo diligenciado: son
   * ~9 de cada 10 tratos, y trece `-1` por cada uno pesaban cerca de un mega
   * de JSON que ningún gráfico usa.
   */
  extract(deal: PipedriveDeal): number[];
  /** Listas de valores y banderas de ausencia, para `Meta.perfil`. */
  meta(): PerfilCampoMeta[];
}

export function buildPerfilExtractor(dealFields: PipedriveDealField[]): PerfilExtractor {
  const resueltos = resolver(dealFields);

  return {
    extract(deal) {
      const out = new Array<number>(resueltos.length).fill(-1);
      let algo = false;

      for (let i = 0; i < resueltos.length; i++) {
        const r = resueltos[i];
        if (!r.key) continue;

        const raw = deal[r.key];

        if (r.campo.viz === 'histograma') {
          const n = numero(raw);
          // El CRM exporta 0 por defecto en presupuesto y área: contarlo como
          // diligenciado inflaría la cobertura con miles de ceros que nadie
          // escribió. Un negativo tampoco es un valor que alguien tecleara.
          if (n === null || n <= 0) continue;
          out[i] = n;
          algo = true;
          continue;
        }

        const t = texto(r, raw);
        if (!t) continue;
        out[i] = intern(r, t);
        algo = true;
      }

      return algo ? out : [];
    },

    meta() {
      return resueltos.map((r) => ({
        // Un campo numérico no tiene categorías: sus rangos salen de `buckets`
        // en el cliente, sobre el valor crudo.
        values: r.campo.viz === 'histograma' ? [] : r.values,
        ausente: r.key === null,
      }));
    },
  };
}
