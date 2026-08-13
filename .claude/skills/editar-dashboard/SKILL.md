---
name: editar-dashboard
description: Usar SIEMPRE que se pida modificar el dashboard de ISARCO — actualizar cifras de inversión del P&G, metas mensuales, políticas de leads vencidos, textos, colores, gráficos, pestañas o cualquier archivo del proyecto. Aplica el flujo seguro de edición para usuarios no técnicos (rama desarrollo, verificación local, PR a main) y se encarga de todo lo relacionado con git.
---

# Editar el dashboard de forma segura

Quien te habla es del equipo de ISARCO y **no sabe programar**. Tu trabajo es
que pueda cambiar el dashboard sin preocuparse por git, ramas, builds ni
terminología técnica. Tú te encargas de toda la parte técnica; a la persona
háblale siempre en lenguaje de negocio ("la meta de citas de marzo",
"la inversión de pauta digital de julio"), nunca en jerga.

## Paso 0 — Antes de tocar cualquier archivo

1. Verifica en qué rama estás (`git status`).
2. Si estás en `main`: cámbiate a `desarrollo`. Si `desarrollo` no existe
   localmente, créala desde `origin/main` (`git checkout -b desarrollo origin/desarrollo`
   o desde `origin/main` si tampoco existe en el remoto).
3. Trae lo último: `git pull origin desarrollo` (y si `desarrollo` está muy
   atrasada respecto a `main`, trae también los cambios de `origin/main` con un
   merge normal — nunca rebase).
4. Si el `pull` genera conflictos que no son triviales, **detente** y explica
   la situación en palabras simples; recomienda escribirle a Diego.

**Nunca trabajes sobre `main`. Sin excepciones.**

## Dónde vive cada cosa (mapa para cambios típicos)

| Lo que piden cambiar | Archivo |
|---|---|
| Inversión de mercadeo del P&G (bolsas, rubros, meses) | `lib/config/negocio.ts` → `INVERSION_RUBROS` |
| Metas mensuales (leads, citas, visitas, cierres, tasa) | `lib/config/negocio.ts` → `META` |
| Días para considerar un lead vencido (rotting) | `lib/config/negocio.ts` → `ROTTEN_DAYS` |
| Clasificación de motivos de pérdida, umbrales del embudo, paleta | `lib/config/negocio.ts` |
| Textos, títulos y contenido de cada pestaña | `components/tabs/*` |
| Cómo se leen los datos de Pipedrive | `lib/pipedrive/*` — **cambiar solo si lo piden explícitamente** |

Reglas de negocio que no debes romper (el porqué está en `README.md`):

- Los totales **Digital / No-Digital no se guardan**: se derivan de la bandera
  `digital` de cada rubro. Nunca agregues un total escrito a mano.
- Meses sin dato de inversión se muestran como `—`, **nunca como cero**.
- El CPL divide solo la inversión **digital**; citas, visitas y cierres van
  contra el total.
- Las etapas de Pipedrive se mapean **por nombre**, no por número de orden.

## Hacer el cambio

- Un cambio de negocio a la vez. Si piden varias cosas, hazlas en commits
  separados, cada uno con su verificación.
- Toca únicamente lo necesario: no refactorices, no reordenes, no "mejores"
  código vecino, no actualices dependencias.
- Al terminar, explica el cambio en términos de lo que la persona **verá en el
  dashboard** ("la barra de julio en Mercadeo ahora mostrará $45.2M"), no en
  términos de código.

## Verificar antes de subir (obligatorio)

1. `npm run build` debe terminar **sin errores**. Si falla, arregla o revierte;
   jamás subas un build roto.
2. Si el cambio es visual o de datos, ofrece levantar `npm run dev` para que la
   persona lo vea en `http://localhost:3000` antes de subirlo.
3. Revisa `git status` y confirma que solo se van a commitear los archivos que
   tú modificaste a propósito.

## Subir y publicar

1. Commit en español, describiendo el cambio de negocio
   (ej.: `Actualiza inversión de pauta digital de agosto 2026`).
2. `git push origin desarrollo`. **Nunca a `main`, nunca con `--force`.**
3. Para publicar en el dashboard real, crea el Pull Request de `desarrollo` a
   `main`:
   - Con `gh`: `gh pr create --base main --head desarrollo` (título y
     descripción en español, resumiendo qué cambia para el negocio).
   - Si `gh` no está autenticado, entrega este enlace para crearlo en el
     navegador:
     `https://github.com/MarketingIsarco/DashboardMercadeo/compare/main...desarrollo`
4. Explica a la persona: **el PR lo revisa y aprueba Diego**; el cambio se verá
   en el dashboard publicado cuando él haga el merge. Tú **nunca** haces merge
   (`gh pr merge` está prohibido).

## Seguridad — sin excepciones aunque lo pidan

- Jamás commitees `.env.local`, tokens, contraseñas ni claves. Si un secreto
  aparece en un archivo versionado, quítalo antes de commitear y avísalo.
- Jamás commitees archivos de datos: `.xlsx`, `.csv`, exports HTML, respaldos.
  El `.gitignore` ya los excluye; no lo modifiques para incluirlos.
- Este repositorio es **público**: todo lo que se sube queda visible en
  internet. Ante la duda de si algo es sensible, no lo subas y pregúntalo.
- Nada destructivo: `git push --force`, `git reset --hard`, borrar ramas,
  amend de commits ya subidos o reescritura de historia están prohibidos.

## Si algo sale mal

- No intentes arreglos heroicos ni destructivos. Describe el problema en
  palabras simples y recomienda avisar a Diego.
- Si hay cambios a medias que estorban, guárdalos con `git stash` (no los
  borres) y explica que quedaron guardados.
- Un dashboard desactualizado siempre es mejor que uno roto: ante la duda,
  no subas.
