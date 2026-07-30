/** Deal status as reported by Pipedrive, collapsed to the dashboard's 3 states. */
export const STATUS_OPEN = 0;
export const STATUS_LOST = 1;
export const STATUS_WON = 2;
export type Status = typeof STATUS_OPEN | typeof STATUS_LOST | typeof STATUS_WON;

/** Ad creative format parsed out of the free-text "Contenido" field. */
export const CONTENT_NONE = 0;
export const CONTENT_REEL = 1;
export const CONTENT_STATIC = 2;
export type ContentType = typeof CONTENT_NONE | typeof CONTENT_REEL | typeof CONTENT_STATIC;

/** Buckets the 46 distinct `lost_reason` strings collapse into. */
export type LossGroup = 'Contactabilidad' | 'Interes' | 'Producto' | 'Mal segmento' | 'Otro';

/**
 * One Pipedrive deal, flattened into the shape every chart consumes.
 *
 * The source HTML stored these as positional tuples (`r[8]` was the project)
 * purely to shrink a 277 KB inline dump. Nothing reads the wire format twice,
 * so we use names.
 */
export interface Lead {
  /** Pipedrive deal id — la llave para cruzar con `sales`. */
  id: number;
  /** `YYYY-MM-DD`, from `add_time`. */
  date: string;
  /** `YYYY-MM`, precomputed because every chart groups by it. */
  month: string;
  /** Index into `STAGES`. */
  stage: number;
  status: Status;
  /** `''` when the deal is not lost. */
  lossGroup: LossGroup | '';
  /** Index into the runtime-derived loss reason list; `-1` when not lost. */
  lossReason: number;
  /** Index into the runtime-derived source list. */
  source: number;
  /** Index into the runtime-derived campaign list. */
  campaign: number;
  content: ContentType;
  /** Index into `PROJECTS` — derived from `pipeline_id`. */
  project: number;
  /** A lost lead worth re-engaging (unreachable) vs. a hard no (not a fit). */
  recoverable: boolean;
  /** Index into the runtime-derived advisor list. */
  advisor: number;
  /** Days between `add_time` and close (or today, if still open). */
  ageDays: number;

  // ── Campos de gestión (Pipedrive: update_time / *_activity_date) ────
  // Alimentan la pestaña Gerencia y "Gestión en Tiempo Real": sin ellos no se
  // puede saber si un lead abierto está siendo trabajado o abandonado.

  /** `YYYY-MM-DD` del último movimiento del deal. Cae a `date` si falta. */
  updateTime: string;
  /** `YYYY-MM-DD` de la próxima actividad agendada; `''` si no hay ninguna. */
  nextActivity: string;
  /** `YYYY-MM-DD` de la última actividad registrada; `''` si no hay ninguna. */
  lastActivity: string;
  /** Nombre del contacto, para las tablas de gestión nominal. */
  name: string;
  phone: string;

  /**
   * Horas entre la creación del trato y la primera actividad registrada en él.
   * `null` cuando el trato todavía no tiene ninguna.
   *
   * Sale de cruzar `/deals` con `/activities` por `deal_id`. Es el único campo
   * del modelo que no se puede derivar del deal solo.
   */
  firstContactHours: number | null;
}

/**
 * Una venta, desnormalizada para la tabla de detalle.
 *
 * "Venta" = llegó a Separación o quedó marcado como Ganado. Las separaciones
 * que siguen abiertas cuentan, y la tabla las resalta: son plata comprometida
 * a la que todavía le falta actualizar el estado en el CRM.
 */
export interface SaleDeal {
  /** Coincide con `Lead.id`, para poder filtrarlas con los mismos filtros. */
  id: number;
  name: string;
  date: string;
  source: string;
  isDigital: boolean;
  /** `Constructora` o `Inmobiliaria`. */
  category: string;
  campaign: string;
  project: string;
  advisor: string;
  stage: string;
  status: 'Ganado' | 'Abierto' | 'Perdido';
  phone: string;
}

/**
 * Label lists resolved from Pipedrive at request time. Indices in `Lead` point
 * into these, so the two must always travel together.
 */
export interface Meta {
  sources: string[];
  campaigns: string[];
  projects: string[];
  advisors: string[];
  lossReasons: string[];
  /** Indices into `sources` that count as paid/organic digital traffic. */
  digitalSources: number[];
}

export interface DashboardData {
  leads: Lead[];
  sales: SaleDeal[];
  meta: Meta;
  /** ISO timestamp of when this payload was pulled from Pipedrive. */
  fetchedAt: string;
  total: number;
}
