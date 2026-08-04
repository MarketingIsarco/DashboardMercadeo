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
 * ─────────────────────────────────────────────────────────────────────────────
 * INVERSIÓN EN MERCADEO
 *
 * ⚠️ No existe en Pipedrive — sale del P&G de Mercadeo y se actualiza a mano.
 *
 * La fuente de verdad es la matriz `INVERSION_RUBROS` (rubro × mes × bolsa).
 * Los totales de Digital / No-Digital NO se guardan: se derivan sumando los
 * rubros según su bandera `digital`. Guardarlos duplicados fue el error del
 * prototipo HTML — dos números que dicen lo mismo terminan discrepando.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Bolsa presupuestal. Cada una cubre uno o varios proyectos. */
export type Bolsa = 'inari' | 'tng' | 'inm';

/** Índices de `PROJECTS` que consume cada bolsa. */
export const BOLSA_PROJECTS: Record<Bolsa, number[]> = {
  inari: [0],
  tng: [1, 2],
  inm: INMOBILIARIA_IDX,
};

export const BOLSA_LABEL: Record<Bolsa, string> = {
  inari: 'Inari 101',
  tng: 'Tinguazul',
  inm: 'Inmobiliaria',
};

/** Meses con presupuesto cargado, en orden cronológico. */
export const INVERSION_MESES = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
];

export interface Rubro {
  label: string;
  /**
   * Clasificación digital / no-digital definida por Mercadeo. Es la que parte
   * el gasto en las dos bolsas del capítulo 05 y la que alimenta el CPL:
   * el CPL digital sólo puede dividir la inversión **digital**.
   */
  digital: boolean;
  /**
   * Fuente(s) del CRM a las que Mercadeo atribuye el rubro. No se usa para
   * calcular — queda documentada y visible en el desglose para que la
   * clasificación sea auditable frente al P&G.
   */
  fuentes: string[];
}

/** 16 conceptos del P&G. El orden fija los índices de `INVERSION_RUBROS`. */
export const RUBROS: Rubro[] = [
  { label: 'Publicidad Digital', digital: true, fuentes: ['Facebook', 'Instagram', 'LinkedIn', 'Redes Sociales'] },
  { label: 'Portales Inmobiliarios', digital: true, fuentes: ['Finca Raiz', 'Proppit'] },
  { label: 'Campañas CRM-WhatsApp', digital: true, fuentes: ['Whatsapp'] },
  { label: 'Banderas', digital: false, fuentes: ['Sala de Negocios'] },
  { label: 'Valla', digital: false, fuentes: ['Valla'] },
  { label: 'Volantes y otros', digital: false, fuentes: ['Volante'] },
  { label: 'Brochures - Ayuda de ventas', digital: false, fuentes: ['Sala de Negocios'] },
  { label: 'Eventos / Ruedas de negocio', digital: false, fuentes: ['Activaciones de marca'] },
  { label: 'Desarrollo Chat IA', digital: true, fuentes: ['Whatsapp'] },
  { label: 'Página Web', digital: true, fuentes: ['Página Web'] },
  { label: 'Tour Virtuales', digital: true, fuentes: ['Página Web'] },
  { label: '1 Módulo con equipos', digital: false, fuentes: ['Activaciones de marca'] },
  { label: 'Obsequio para clientes', digital: false, fuentes: ['Sala de Negocios'] },
  { label: 'Activaciones / Ferias', digital: false, fuentes: ['Activaciones de marca'] },
  { label: 'Relaciones públicas / PR', digital: false, fuentes: ['Referidos'] },
  { label: 'Merchandising', digital: false, fuentes: ['Sala de Negocios'] },
];

/**
 * Inversión en COP: `[bolsa][índice de RUBROS][índice de INVERSION_MESES]`.
 * Las filas van en el mismo orden que `RUBROS` y las columnas que `INVERSION_MESES`.
 */
export const INVERSION_RUBROS: Record<Bolsa, number[][]> = {
  inari: [
    /*  0 Publicidad Digital */ [3_000_000, 2_800_000, 200_000, 5_600_000, 3_400_000, 5_500_000, 4_415_348],
    /*  1 Portales           */ [0, 0, 0, 0, 0, 0, 0],
    /*  2 CRM-WhatsApp       */ [0, 85_132, 84_306, 283_615, 0, 0, 76_464],
    /*  3 Banderas           */ [0, 3_478_370, 606_900, 0, 0, 0, 606_900],
    /*  4 Valla              */ [0, 0, 890_477, 0, 306_425, 0, 4_998_000],
    /*  5 Volantes           */ [0, 1_391_110, 119_000, 142_800, 1_582_700, 0, 756_840],
    /*  6 Brochures          */ [0, 0, 440_300, 0, 0, 0, 0],
    /*  7 Eventos            */ [0, 0, 1_326_255, 0, 0, 0, 684_250],
    /*  8 Chat IA            */ [1_900_947, 1_565_253, 1_530_537, 1_494_080, 1_081_909, 902_524, 2_000_000],
    /*  9 Página Web         */ [0, 0, 0, 0, 0, 0, 61_600],
    /* 10 Tour Virtuales     */ [9_508_100, 0, 0, 0, 0, 0, 0],
    /* 11 1 Módulo           */ [0, 0, 0, 0, 0, 0, 0],
    /* 12 Obsequio           */ [0, 0, 0, 0, 0, 0, 0],
    /* 13 Activaciones       */ [272_462, 971_778, 993_849, 0, 2_204_910, 1_000_500, 0],
    /* 14 PR                 */ [73_800, 0, 0, 0, 300_000, 1_785_000, 0],
    /* 15 Merchandising      */ [0, 0, 0, 0, 0, 0, 0],
  ],
  tng: [
    /*  0 Publicidad Digital */ [3_000_000, 3_000_000, 3_000_000, 2_987_520, 2_512_480, 3_642_000, 4_000_000],
    /*  1 Portales           */ [0, 0, 0, 0, 0, 0, 0],
    /*  2 CRM-WhatsApp       */ [48_239, 67_947, 77_237, 236_054, 0, 0, 94_501],
    /*  3 Banderas           */ [0, 0, 0, 1_213_800, 0, 0, 1_213_800],
    /*  4 Valla              */ [0, 676_872, 0, 0, 0, 0, 0],
    /*  5 Volantes           */ [0, 198_730, 404_600, 353_351, 2_084_788, 557_289, 351_050],
    /*  6 Brochures          */ [0, 202_300, 0, 440_300, 0, 0, 0],
    /*  7 Eventos            */ [0, 1_140_568, 1_198_092, 0, 2_014_200, 0, 684_250],
    /*  8 Chat IA            */ [989_687, 937_981, 1_033_922, 890_121, 1_264_266, 813_284, 2_000_000],
    /*  9 Página Web         */ [0, 0, 3_427_388, 3_374_388, 0, 0, 0],
    /* 10 Tour Virtuales     */ [0, 0, 0, 0, 0, 0, 0],
    /* 11 1 Módulo           */ [0, 0, 0, 0, 0, 0, 0],
    /* 12 Obsequio           */ [0, 0, 0, 0, 0, 0, 0],
    /* 13 Activaciones       */ [272_462, 0, 0, 0, 0, 0, 0],
    /* 14 PR                 */ [0, 0, 0, 0, 0, 0, 0],
    /* 15 Merchandising      */ [0, 0, 0, 0, 0, 0, 0],
  ],
  // Agregado de Coworking + Depósitos + Op. Terceros + Locales + Oficinas.
  inm: [
    /*  0 Publicidad Digital */ [870_622, 892_360, 0, 1_015_977, 0, 293_757, 619_947],
    /*  1 Portales           */ [110_000, 1_332_445, 1_010_470, 0, 1_345_940, 123_495, 0],
    /*  2 CRM-WhatsApp       */ [7_590, 5_125, 5_070, 0, 0, 14_735, 0],
    /*  3 Banderas           */ [0, 0, 0, 0, 0, 0, 0],
    /*  4 Valla              */ [0, 0, 250_000, 1_704_000, 651_750, 1_116_000, 0],
    /*  5 Volantes           */ [0, 244_986, 870_000, 0, 0, 163_324, 0],
    /*  6 Brochures          */ [0, 0, 0, 0, 0, 0, 0],
    /*  7 Eventos            */ [60_000, 0, 0, 0, 0, 0, 0],
    /*  8 Chat IA            */ [0, 1_117_545, 295_470, 527_890, 281_690, 402_040, 0],
    /*  9 Página Web         */ [0, 0, 0, 0, 0, 0, 0],
    /* 10 Tour Virtuales     */ [0, 1_200_000, 0, 0, 0, 0, 0],
    /* 11 1 Módulo           */ [0, 0, 0, 0, 0, 0, 0],
    /* 12 Obsequio           */ [0, 0, 0, 0, 0, 0, 0],
    /* 13 Activaciones       */ [0, 0, 0, 0, 0, 0, 0],
    /* 14 PR                 */ [754_625, 754_625, 377_310, 377_310, 0, 0, 0],
    /* 15 Merchandising      */ [0, 0, 0, 0, 0, 0, 0],
  ],
};

/** Colores de la partición digital / no-digital. Se usan en chart y tabla. */
export const DIGITAL_COLOR = '#60a5fa';
export const NO_DIGITAL_COLOR = '#fb923c';

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
