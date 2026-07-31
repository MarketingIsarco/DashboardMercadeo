import type { LossGroup } from '@/lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURACIÓN DE NEGOCIO
 *
 * Todo lo que NO vive en Pipedrive se edita aquí. El resto (leads, etapas,
 * fuentes, campañas, asesores, motivos de pérdida) se lee del CRM en vivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Orden canónico de proyectos. Debe coincidir con los pipelines de Pipedrive. */
export const PROJECTS = [
  'Inari 101',
  'Tinguazul 2A',
  'Tinguazul 1',
  'Bodegas',
  'Otros Inmuebles',
  'Locales',
  'Coworking',
  'Oficinas',
] as const;

/** Proyectos de obra propia vs. intermediación inmobiliaria. */
export const CONSTRUCTORA_IDX = [0, 1, 2];
export const INMOBILIARIA_IDX = [3, 4, 5, 6, 7];

/**
 * Pipeline de Pipedrive → índice en `PROJECTS`.
 * Se empareja por nombre (no por id) para sobrevivir a cambios de id.
 */
export const PIPELINE_TO_PROJECT: Record<string, number> = {
  'Inari 101': 0,
  'Tinguazul 2A': 1,
  'Tinguazul 1': 2,
  Bodegas: 3,
  'Otros Inmuebles': 4,
  Locales: 5,
  Coworking: 6,
  Oficinas: 7,
};

/** Embudo unificado. Los pipelines de constructora e inmobiliaria convergen aquí. */
export const STAGES = [
  'Interesado',
  'Contactado',
  'Cita Agendada',
  'Visitado',
  'Negociación',
  'Separación',
  'Firma & Entrega',
] as const;

/**
 * Nombre de etapa en Pipedrive → índice en `STAGES`.
 *
 * Los pipelines de inmobiliaria tienen una etapa "Segunda Visita" que el embudo
 * unificado no modela. La mapeamos a "Visitado" en lugar de "Negociación":
 * una segunda visita no implica que haya arrancado la negociación, y contarla
 * como tal inflaría la conversión del fondo del embudo.
 */
export const STAGE_TO_IDX: Record<string, number> = {
  Interesado: 0,
  Contactado: 1,
  'Cita Agendada': 2,
  Visitado: 3,
  'Segunda Visita': 3,
  Negociación: 4,
  Separación: 5,
  'Firma & Entrega': 6,
};

/** Umbrales del embudo, por índice de etapa. */
export const STAGE_CITA = 2;
export const STAGE_VISITA = 3;
export const STAGE_NEGOCIACION = 4;
export const STAGE_SEPARACION = 5;

/**
 * Días máximos que un lead abierto puede pasar sin movimiento antes de contarse
 * como vencido ("rotting"), por índice de proyecto → índice de etapa.
 *
 * ⚠️ No existe en Pipedrive — es una política comercial, se edita a mano.
 *
 * La constructora corre a otro ritmo que la inmobiliaria: 2–5 días vs. 7–10.
 * Tinguazul 1 va en `null` porque está en cierre de inventario y no se audita.
 * Una etapa sin umbral (p. ej. "Separación" en inmobiliaria) tampoco se audita.
 */
export const ROTTEN_DAYS: Record<number, Record<number, number> | null> = {
  0: { 0: 2, 1: 2, 2: 3, 3: 5, 4: 3, 5: 3 },
  1: { 0: 2, 1: 2, 2: 3, 3: 5, 4: 3, 5: 3 },
  2: null,
  3: { 0: 7, 1: 10, 2: 10, 3: 10, 4: 10, 6: 10 },
  4: { 0: 7, 1: 10, 2: 10, 3: 10, 4: 10, 6: 10 },
  5: { 0: 7, 1: 10, 2: 10, 3: 10, 4: 10, 6: 10 },
  6: { 0: 7, 1: 10, 2: 10, 3: 10, 4: 10, 6: 10 },
  7: { 0: 7, 1: 10, 2: 10, 3: 10, 4: 10, 6: 10 },
};

/**
 * Tipos de actividad que cuentan como reunión agendada con el cliente.
 *
 * Son los `key_string` de `/activityTypes`. Hoy la cuenta tiene un solo tipo
 * para esto (`meeting` = "Reunión"), y bajo él se agendan reuniones, citas y
 * visitas; el resto (`call`, `whatsapp`, `email`, `task`) es gestión de
 * contacto, no un bloque de agenda.
 */
export const MEETING_TYPES = ['meeting'];

/**
 * Desfase entre la hora que devuelve Pipedrive (UTC) y la hora de Bogotá.
 *
 * Sólo importa donde la **hora del día** es el dato — el mapa de calor de
 * reuniones. Sin corregirlo, la agenda comercial aparece cinco horas corrida y
 * el pico de las 3 p. m. se lee a las 8 p. m. Colombia no aplica horario de
 * verano, así que el desfase es constante todo el año.
 */
export const CRM_UTC_OFFSET_HOURS = -5;

/** Paleta por índice de `PROJECTS`. */
export const PROJECT_COLORS = [
  '#6366f1', '#f59e0b', '#a78bfa', '#22d3ee',
  '#4ade80', '#c9a96e', '#f43f5e', '#94a3b8',
];

/**
 * Inversión publicitaria mensual en COP.
 * ⚠️ No existe en Pipedrive — se actualiza a mano cada mes.
 */
export const INVERSION: Record<'inari' | 'tng', Record<string, number>> = {
  inari: {
    '2026-01': 2_488_798,
    '2026-02': 3_047_728,
    '2026-03': 3_870_616,
    '2026-04': 2_925_567,
    '2026-05': 4_820_740,
    '2026-06': 6_133_384,
  },
  tng: {
    '2026-01': 2_282_981,
    '2026-02': 3_625_416,
    '2026-03': 2_172_036,
    '2026-04': 2_994_432,
    '2026-05': 2_681_870,
    '2026-06': 3_477_936,
  },
};

/** Índice de `PROJECTS` que consume cada bolsa de inversión. */
export const INVERSION_PROJECT: Record<'inari' | 'tng', number[]> = {
  inari: [0],
  tng: [1, 2],
};

export interface Goal {
  leads: number;
  citas: number;
  visitas: number;
  cierres: number;
  /** Tasa de cierre objetivo, en %. */
  tasa: number;
}

/**
 * Metas mensuales por proyecto.
 * ⚠️ No existe en Pipedrive — se actualiza a mano.
 * La clave es el índice en `PROJECTS`; Tinguazul 1 comparte la meta de 2A.
 */
export const META: Record<number, Goal> = {
  0: { leads: 314, citas: 66, visitas: 42, cierres: 3, tasa: 0.96 },
  1: { leads: 296, citas: 82, visitas: 63, cierres: 3, tasa: 1.01 },
  2: { leads: 296, citas: 82, visitas: 63, cierres: 3, tasa: 1.01 },
};

/**
 * Fuentes que cuentan como tráfico digital. Se comparan normalizadas
 * (sin tildes, minúsculas) contra el campo "Fuente" de Pipedrive.
 */
export const DIGITAL_SOURCES = [
  'instagram',
  'facebook',
  'whatsapp',
  'pagina web',
  'pag. web',
  'google',
  'redes sociales',
  'redes soc.',
  'campana email',
  'email',
  'finca raiz',
  'proppit',
  'linkedin',
  'internet',
  'organico sitio web',
  'estrenar vivienda',
];

/** Fuentes con pauta pagada en Meta Ads. */
export const META_ADS_SOURCES = ['instagram', 'facebook'];

/** Pauta digital total: Meta Ads + WhatsApp. */
export const PAID_SOURCES = ['instagram', 'facebook', 'whatsapp'];

/**
 * Clasificación de los `lost_reason` de Pipedrive en grupos accionables.
 * El primer patrón que coincide gana, así que el orden importa.
 */
export const LOSS_GROUP_RULES: Array<{ pattern: RegExp; group: LossGroup }> = [
  { pattern: /no contesta|datos de contacto|faltan datos|no solicit/i, group: 'Contactabilidad' },
  { pattern: /no califica|presupuesto|no cumple condicional|busca vis|otra ciudad|busca renta/i, group: 'Mal segmento' },
  { pattern: /^producto|proveedor/i, group: 'Producto' },
  { pattern: /no est[aá] interesad|perdi[oó] inter[eé]s|no es el momento|curioso|desisti|otra inversi[oó]n|ya compr/i, group: 'Interes' },
  { pattern: /duplicado|prueba/i, group: 'Otro' },
];

/**
 * Un lead "recuperable" es uno al que se le puede volver a tocar la puerta:
 * nunca contestó, o dijo que no era el momento. Lo contrario es una pérdida
 * "dura" — no califica, el producto no le sirve, o ya compró.
 */
export const RECOVERABLE_RULES = [
  /no contesta/i,
  /no es el momento/i,
  /faltan datos/i,
  /no solicit/i,
  /perdi[oó] inter[eé]s/i,
  /curioso/i,
];

/** Paleta por fuente. Las no listadas caen al gris de `SOURCE_FALLBACK`. */
export const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#e1306c',
  Facebook: '#1877f2',
  Whatsapp: '#25d366',
  WhatsApp: '#25d366',
  'Sala de Negocios': '#f97316',
  'Pagina Web': '#6366f1',
  'Pág. Web': '#6366f1',
  Google: '#ea4335',
  Referidos: '#a78bfa',
  'Redes Sociales': '#ec4899',
  'Activaciones de marca': '#14b8a6',
  Broker: '#8b5cf6',
  'Valla Comercial': '#84cc16',
  'Campaña Email': '#0ea5e9',
  'Finca Raiz': '#f59e0b',
  Proppit: '#10b981',
  'Por definir': '#666666',
};
export const SOURCE_FALLBACK = '#94a3b8';

export const ADVISOR_COLORS = [
  '#e1306c', '#1877f2', '#25d366', '#f59e0b', '#6366f1',
  '#ea4335', '#a78bfa', '#14b8a6', '#f97316', '#0ea5e9', '#84cc16',
];

export const LOSS_GROUPS: LossGroup[] = [
  'Contactabilidad',
  'Interes',
  'Producto',
  'Mal segmento',
  'Otro',
];

/** Etiqueta de presentación. La llave `Interes` va sin tilde por compatibilidad. */
export const LOSS_GROUP_LABEL: Record<LossGroup, string> = {
  Contactabilidad: 'Contactabilidad',
  Interes: 'Interés',
  Producto: 'Producto',
  'Mal segmento': 'Mal segmento',
  Otro: 'Otro',
};

export const LOSS_GROUP_COLORS: Record<LossGroup, string> = {
  Contactabilidad: '#f43f5e',
  Interes: '#f59e0b',
  Producto: '#6366f1',
  'Mal segmento': '#22d3ee',
  Otro: '#888888',
};

/**
 * Etiqueta para los perdidos a los que nadie les registró el motivo (741 hoy).
 *
 * No son "Otro": "Otro" es un motivo que sí se registró y no encajó en ningún
 * grupo. Estos son un hueco de calidad de dato, y mezclarlos escondería el
 * problema. El HTML original los omitía en silencio, y por eso su donut de
 * motivos no sumaba el total de perdidos.
 */
export const SIN_MOTIVO = 'Sin motivo registrado';
export const SIN_MOTIVO_COLOR = '#9090a8';

export const MONTH_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** Los charts ignoran datos anteriores a este año. */
export const MIN_YEAR = '2025';
