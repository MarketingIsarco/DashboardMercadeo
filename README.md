# Dashboard Comercial · ISARCO

Dashboard del pipeline comercial, conectado **en vivo a Pipedrive**.
Next.js 15 · React 18 · TypeScript · Tailwind 3 · Chart.js 4.

Reemplaza a `dashboard-comercial-Final Junio.html`, que era una foto estática:
tenía los 6.157 deals de junio embebidos en el propio archivo y ninguna llamada
a la API.

## Arranque

```bash
npm install
cp .env.example .env.local   # y completa los valores
npm run dev                  # http://localhost:3000
```

### Variables de entorno

| Variable | Requerida | Qué es |
|---|---|---|
| `PIPEDRIVE_API_TOKEN` | sí | Token de la API de Pipedrive. Da lectura a **todo** el CRM. |
| `DASHBOARD_PASSWORD` | sí | Contraseña única de acceso al dashboard. |
| `DASHBOARD_SECRET` | sí | Clave para firmar la cookie de sesión. Genera una nueva por entorno. |
| `DASHBOARD_CACHE_TTL_MS` | no | Vida de la caché en ms. Por defecto 900000 (15 min). |
| `PD_FIELD_FUENTE` | no | Sobreescribe la clave del campo "Fuente". |
| `PD_FIELD_CAMPANA` | no | Sobreescribe la clave del campo "Campaña". |
| `PD_FIELD_CONTENIDO` | no | Sobreescribe la clave del campo "Contenido". |

Para generar un `DASHBOARD_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> El token de Pipedrive **nunca** llega al navegador. Vive sólo en el servidor,
> detrás de `/api/data`, que a su vez exige sesión. Por eso el dashboard no podía
> seguir siendo un HTML suelto.

## Arquitectura

```
middleware.ts          Exige sesión en todo salvo /login y /api/auth
app/api/auth           Login (POST) y logout (DELETE). Cookie HMAC-SHA256, 12 h.
app/api/data           Devuelve el payload del dashboard. ?refresh=1 fuerza recarga.
lib/pipedrive/client   Llamadas crudas a Pipedrive (deals, stages, pipelines, campos)
lib/pipedrive/mapping  Deal de Pipedrive → Lead del dashboard
lib/pipedrive/cache    Caché en memoria + deduplicación de peticiones concurrentes
lib/config/negocio.ts  TODO lo que no vive en Pipedrive (inversión, metas, colores)
lib/selectors.ts       Filtros y métricas derivadas
components/tabs/*      Las 5 pestañas
```

Traer los ~6.500 deals son ~13 peticiones paginadas (≈6 s). La caché las guarda
15 minutos; el botón **↻ Actualizar** fuerza una recarga. Si Pipedrive falla pero
hay datos viejos en memoria, se sirven marcados como "datos en caché" — un
dashboard desactualizado es más útil que un error.

## Cómo se mapea Pipedrive

Lo importante: **el proyecto es el pipeline**, no un campo personalizado.

| Dato del dashboard | Origen en Pipedrive |
|---|---|
| Proyecto | `pipeline_id` → nombre → `PIPELINE_TO_PROJECT` |
| Etapa | nombre del stage → `STAGE_TO_IDX` |
| Estado | `status` (`open` / `lost` / `won`) |
| Fuente | campo personalizado "Fuente" (enum) |
| Campaña | campo personalizado "Campaña" (texto libre) |
| Reel / estática | campo personalizado "Contenido" (texto libre) |
| Motivo de pérdida | `lost_reason` |
| Asesor | `owner_name` |
| Antigüedad | `add_time` → `close_time` (o hoy) |

Las etapas se mapean **por nombre, no por `order_nr`**: los pipelines de
inmobiliaria tienen una etapa "Segunda Visita" que los de constructora no, así
que los números de orden no se corresponden entre pipelines.

Fuentes, campañas, asesores y motivos de pérdida se descubren en cada carga. Hoy
son 22, 23, 11 y 45 respectivamente, y crecen sin avisar; ninguno está
hardcodeado.

## Qué NO viene de Pipedrive

Dos cosas viven en `lib/config/negocio.ts` y se actualizan a mano:

- **`INVERSION`** — pauta publicitaria mensual por proyecto, en COP. Hoy sólo hay
  datos de enero a junio de 2026. Los meses sin dato se muestran como `—`, nunca
  como cero.
- **`META`** — metas mensuales de leads, citas, visitas, cierres y tasa de cierre.

También son configurables ahí los umbrales del embudo, la clasificación de
motivos de pérdida y la paleta.

## Pestañas

| Pestaña | Alcance |
|---|---|
| Resultados | KPIs, embudo, análisis de ventas, tendencias, detalle de ventas |
| Mercadeo | Pipeline, análisis por fuente, motivos de pérdida, inversión en pauta |
| Comercial | Gestión por asesor, antigüedad de leads, negocios perdidos |
| Comparativo | Mes A vs. mes B, con controles propios |
| Plan de Acción | Diagnóstico y recomendaciones, con controles propios |

**Comparativo** y **Plan de Acción** usan sus propios controles y **no** responden
a la barra de filtros global (así era el original). Cada una lo advierte en la UI.

## Definiciones de negocio

- **Venta** = llegó a Separación **o** está marcada como Ganada. Contar sólo las
  ganadas subestima el cierre real, porque las separaciones tardan en actualizarse
  en el CRM.
- **Lead recuperable** = se perdió por falta de contacto o por timing; se le puede
  volver a tocar la puerta. Lo contrario es una pérdida dura.
- **Cierres proyectados** = 30 % de los que están en negociación + 70 % de los que
  ya separaron.

## Nota de calidad de datos

De los 5.918 deals perdidos, **741 no tienen motivo registrado**. Aparecen como
"Sin motivo registrado" en vez de omitirse (el HTML original los descartaba en
silencio, y por eso su gráfico de motivos no sumaba 100 %).
