# Dashboard Comercial · ISARCO — Reglas del proyecto

Dashboard del pipeline comercial conectado en vivo a Pipedrive.
Next.js 15 · React 18 · TypeScript · Tailwind 3 · Chart.js 4.
El contexto de negocio y la arquitectura están en `README.md`.

## Reglas de oro (no negociables)

1. **Nunca trabajes sobre `main`.** Todo cambio se hace en la rama `desarrollo`.
   Si la sesión arranca en `main`, cámbiate a `desarrollo` (créala desde
   `origin/main` si no existe) antes de tocar cualquier archivo.
2. **Los cambios se publican por Pull Request de `desarrollo` a `main`.**
   El PR lo revisa y lo hace merge **Diego** (el desarrollador del proyecto).
   Nunca hagas merge del PR tú mismo ni empujes directo a `main`.
3. **Prohibido lo destructivo:** nada de `git push --force`, `git reset --hard`,
   borrar ramas, reescribir historia ni `gh pr merge`. Si algo se rompió,
   descríbelo y recomienda avisar a Diego; no intentes "limpiar" el historial.
4. **Secretos y datos jamás al repositorio:** `.env.local`, el token de
   Pipedrive, contraseñas, y archivos de datos (`.xlsx`, `.csv`, exports HTML)
   no se commitean nunca, aunque el usuario lo pida sin darse cuenta.
5. **Nunca subas un dashboard roto:** antes de cada commit debe pasar
   `npm run build` sin errores.

## Quién usa este repositorio

El equipo de ISARCO edita el dashboard con Claude sin saber programar.
Cuando pidan cualquier modificación (cifras de inversión, metas, textos,
colores, políticas de gestión…), usa el skill **`editar-dashboard`**
(`.claude/skills/editar-dashboard/SKILL.md`): ahí está el flujo completo,
dónde vive cada cosa y cómo verificar antes de subir. Háblales en lenguaje
de negocio, no en jerga técnica, y encárgate tú de todo lo relacionado con
git, ramas y verificación — ellos no deben preocuparse por eso.
