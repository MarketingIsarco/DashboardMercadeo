import { TASAS_MERCADO } from '@/lib/config/negocio';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Banda de tasas de conversión de mercado.
 *
 * Va en el capítulo 01 de las cinco pestañas. Es una **referencia fija**: los
 * porcentajes vienen de `TASAS_MERCADO` en la configuración de negocio y no se
 * calculan con los leads del tablero. Por eso el pie de la banda lo dice en
 * voz alta — una fila de porcentajes en medio de un dashboard se lee como una
 * medición si nadie aclara que no lo es.
 *
 * Un solo componente para las cinco pestañas, no cinco copias: son cifras que
 * Mercadeo va a querer actualizar, y actualizarlas en cinco archivos es la
 * forma segura de que tres queden viejas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function TasasMercado({
  /**
   * El filtro de Canal de la barra principal: `true` = sólo digital,
   * `false` = sólo no digital, `null` = ambos.
   *
   * La banda lo sigue porque cada canal tiene su propio estándar y mostrar los
   * dos cuando el usuario ya escogió uno es ruido. Sin filtro no hay un
   * estándar único que aplique —el universo es mixto— así que muestra los dos
   * en vez de escoger uno por su cuenta.
   */
  digital,
  /** Texto extra para la pestaña que no tiene filtro de canal. */
  nota,
}: {
  digital: boolean | null;
  nota?: string;
}) {
  const ambos = digital === null;
  const canal = ambos ? 'Digital y No digital' : digital ? 'Digital' : 'No digital';

  return (
    <div className="mt-5">
      <h3 className="mb-1 text-xs font-semibold text-dim">
        Tasas de conversión de mercado · <span className="text-muted">{canal}</span>
      </h3>
      <p className="mb-2 text-2xs text-muted">
        Estándar del sector paso a paso del embudo. {nota}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {TASAS_MERCADO.map((t, i) => (
          <div
            key={t.label}
            className="rounded-lg border border-[#e8eaf2] bg-card px-3 py-2"
            // El color del paso va en el borde izquierdo y en la cifra. Sólo en
            // la cifra se perdía en la retícula; sólo en el borde no se asocia
            // con el número.
            style={{ borderLeft: `3px solid ${t.color}` }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-bold tabular-nums"
                style={{ color: t.color }}
              >
                {i + 1}
              </span>
              <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-dim">
                {t.label}
              </span>
            </div>

            {ambos ? (
              <div className="mt-1 flex items-baseline gap-3">
                <span>
                  <span className="text-[19px] font-extrabold leading-none" style={{ color: t.color }}>
                    {t.digital}%
                  </span>
                  <span className="ml-1 text-[10px] text-muted">dig.</span>
                </span>
                <span>
                  <span className="text-[19px] font-extrabold leading-none" style={{ color: t.color }}>
                    {t.noDigital}%
                  </span>
                  <span className="ml-1 text-[10px] text-muted">no dig.</span>
                </span>
              </div>
            ) : (
              <div className="mt-1 text-[26px] font-extrabold leading-none" style={{ color: t.color }}>
                {digital ? t.digital : t.noDigital}%
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-1.5 text-2xs text-muted">
        Cifras de referencia cargadas a mano, no calculadas con los leads del tablero: no se mueven con los filtros de
        periodo, proyecto ni etapa. Se editan en <code>TASAS_MERCADO</code>.
      </p>
    </div>
  );
}
