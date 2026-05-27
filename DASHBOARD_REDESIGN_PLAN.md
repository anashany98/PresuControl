# Plan de Rediseño del Dashboard — PresuControl V5

> **Objetivo:** Transformar el dashboard de una vista densa y genérica en una herramienta de decisión rápida, personalizada y accionable.

---

## Resumen Ejecutivo

| Indicador | Actual | Objetivo |
|---|---|---|
| KPIs en pantalla | 7 tarjetas sin jerarquía | 4 tarjetas principales + banner de alerta |
| Gráficos | Ocultos por toggle | Siempre visibles, 4 en grid |
| Secciones | 7 bloques verticales | Tabs horizontales con lista expandida |
| Llamadas API | 2 separadas | 1 unificada |
| Personalización | Ninguna | Por rol y gestor |
| Carga | 1 skeleton genérico | Skeletons contextuales progresivos |
| Tiempo hasta "ver lo urgente" | ~15-20s de escaneo | < 3s (banner + KPI rojo) |

---

## Fase 1: Core — KPIs + Banner de Alerta

**Objetivo:** Reducir la sobrecarga cognitiva. El usuario debe identificar lo urgente en < 3 segundos.

### 1.1 Backend: Unificar payload del dashboard

**Archivo:** `backend/app/analytics.py`

- [ ] Añadir `excepciones_pedidos` al `build_dashboard_payload()` — incluir los 6 presupuestos con más excepciones de pedidos
- [ ] Añadir `tendencias` con datos de los últimos 6 meses (creados, cerrados, importe)
- [ ] Añadir `resumen` con texto generado: `"Tienes X activos, Y urgentes, Z cerrados este mes"`
- [ ] Añadir `kpi_riesgo` consolidado: suma de aceptados_sin_pedido + enviados_sin_respuesta + pedidos_sin_plazo + incidencias

**Nuevo esquema del payload:**
```json
{
  "alerta": {
    "tipo": "critico" | "warning" | null,
    "mensaje": "3 presupuestos críticos sin pedido — 45.200 €",
    "count": 3
  },
  "kpis": [
    { "key": "total_activos", "value": 142, "trend": 5, "trendUp": true },
    { "key": "en_riesgo", "value": 23, "sublabel": "156.400 €", "trend": -12, "trendUp": false, "tone": "danger" },
    { "key": "cerrados_mes", "value": 8, "trend": 15, "trendUp": true, "tone": "success" },
    { "key": "pedidos_pendientes", "value": 12, "tone": "purple" }
  ],
  "tendencias": [
    { "mes": "2026-01", "nuevos": 45, "cerrados": 12, "importe": 320000 },
    ...
  ],
  "resumen_texto": "Tienes 142 presupuestos activos. 3 requieren atención urgente. Este mes has cerrado 8, un 15% más que el mes pasado.",
  "charts": { ... },        // datos actuales de gráficos
  "secciones": { ... },      // datos actuales de secciones
  "excepciones_pedidos": [ ... ]
}
```

- [ ] Eliminar la segunda llamada API desde el frontend (`api.get('/presupuestos?limit=2000&ocultar_cerrados=false')`)

### 1.2 Frontend: Nuevo componente `KpiCard`

**Archivo:** `frontend/src/components/KpiCard.tsx` (nuevo)

```tsx
interface KpiCardProps {
  label: string
  value: string | number
  sublabel?: string
  trend?: { value: number; isGood: boolean }
  tone?: 'danger' | 'warning' | 'success' | 'purple' | 'default'
  linkTo?: string
  icon?: LucideIcon
}
```

**Cambios de diseño respecto a `MiniStat`:**
- [ ] Más grande (height ~100px en vez de 120px)
- [ ] Flecha de tendencia (↑ verde / ↓ rojo) con porcentaje
- [ ] Borde izquierdo de color semántico (4px)
- [ ] Hover: sombra + levantar 2px
- [ ] Si `linkTo` existe, toda la tarjeta es cliqueable
- [ ] Icono opcional arriba a la derecha

### 1.3 Frontend: Nuevo componente `AlertBanner`

**Archivo:** `frontend/src/components/AlertBanner.tsx` (nuevo)

- [ ] Solo se renderiza si `alerta.tipo !== null`
- [ ] Fondo rojo claro con borde rojo para `critico`
- [ ] Fondo naranja claro con borde naranja para `warning`
- [ ] Muestra el `mensaje` generado por el backend
- [ ] Botón "Ver críticos" que navega a la página correspondiente
- [ ] Botón "X" para descartar (con `localStorage` para no mostrar en esta sesión)

### 1.4 Frontend: Refactorizar `Dashboard.tsx`

- [ ] Reemplazar 7 `MiniStat` por 4 `KpiCard`
- [ ] Añadir `AlertBanner` arriba del todo
- [ ] Eliminar `pedidosData` y `pedidoExceptions` memo (ahora vienen en el payload)
- [ ] Eliminar `showCharts` toggle — los gráficos siempre visibles
- [ ] Mover quick links a una fila debajo de los KPIs

### 1.5 Tests

- [ ] Test E2E: El banner de alerta aparece cuando hay críticos
- [ ] Test E2E: Las KpiCards muestran tendencias correctas
- [ ] Test unitario backend: `build_dashboard_payload` incluye todos los campos nuevos

---

## Fase 2: Visualizaciones — Gráficos Siempre Visibles

**Objetivo:** Los gráficos aportan contexto. No deben estar escondidos.

### 2.1 Backend: Endpoint de tendencias

- [ ] Añadir datos de tendencia mensual al payload del dashboard (6 meses)
- [ ] Incluir: `nuevos`, `cerrados`, `importe_total`, `importe_cerrado`

### 2.2 Frontend: Nuevo componente `TrendChart`

**Archivo:** `frontend/src/components/TrendChart.tsx` (nuevo)

- [ ] Gráfico de líneas/área (Recharts `AreaChart`)
- [ ] Dos líneas: "Nuevos" (terracota) y "Cerrados" (verde)
- [ ] Tooltip con mes, cantidad e importe
- [ ] Responsive: altura 180px desktop, 140px móvil

### 2.3 Frontend: Mejorar gráfico de gestores

- [ ] Convertir a stacked bar: barra azul (importe total) + barra roja (críticos)
- [ ] Tooltip muestra: total, críticos, incidencias por gestor
- [ ] Ordenar por importe descendente
- [ ] Limitar a top 5 gestores

### 2.4 Frontend: Nuevo gráfico de distribución de estados

**Archivo:** `frontend/src/components/EstadoChart.tsx` (nuevo)

- [ ] Gráfico de barras horizontales apiladas o treemap
- [ ] Cada segmento con el color del estado (`ESTADO_COLOR`)
- [ ] Muestra el pipeline completo (Borrador → Entregado)
- [ ] Tooltip con count y porcentaje

### 2.5 Frontend: Grid de gráficos

- [ ] Reorganizar `charts-grid` a 2x2: Riesgo | Tendencia / Gestores | Estados
- [ ] Eliminar toggle "Ver/Ocultar charts"
- [ ] Cada card de gráfico: título semibold + gráfico + altura fija para evitar saltos

### 2.6 Tests

- [ ] Test E2E: Los 4 gráficos se renderizan sin toggle
- [ ] Test E2E: El trend chart muestra datos de 6 meses
- [ ] Test unitario: `TrendChart` maneja datos vacíos

---

## Fase 3: Secciones — De Bloques a Tabs

**Objetivo:** Reducir el scroll vertical. Navegación más rápida entre categorías.

### 3.1 Frontend: Componente `DashboardTabs`

**Archivo:** `frontend/src/components/DashboardTabs.tsx` (nuevo)

- [ ] Tabs horizontales con scroll horizontal en móvil
- [ ] Cada tab muestra: icono, nombre corto, badge con contador
- [ ] Tab activo resaltado con borde inferior terracota
- [ ] Animación de transición al cambiar de tab (fade + slide)
- [ ] Las tabs sin elementos se muestran atenuadas (opacity 0.5)

**Tabs:**
| Tab | Icono | Dato |
|---|---|---|
| Críticos | ShieldAlert | criticos_aceptados_sin_pedido |
| Pendientes | Clock3 | pendientes_respuesta_cliente |
| Incidencias | AlertTriangle | incidencias_abiertas |
| Sin plazo | PackageCheck | pedidos_sin_plazo |
| Próximas | Calendar | proximas_fechas_limite |
| Pedidos | Package | pedidos_pendientes |
| Excepciones | AlertCircle | excepciones_pedidos |

### 3.2 Frontend: Rediseñar `BudgetRow` (antes `CompactList`)

**Archivo:** `frontend/src/components/BudgetRow.tsx` (nuevo, reemplaza `CompactList`)

- [ ] Altura mínima 56px (más respirable)
- [ ] Barra lateral de 4px con color de prioridad
- [ ] Estructura:
  ```
  ┌──────────────────────────────────────────────────┐
  │ 🟢 P-2024-0142  Constructora del Sur S.L.  45k€ │
  │    Edificio Torres del Parque     ⏰ vence -3d   │
  │                                       [···]     │
  └──────────────────────────────────────────────────┘
  ```
- [ ] Número de presupuesto en mono + color primario
- [ ] Cliente en negrita
- [ ] Importe alineado a la derecha en formato euro
- [ ] Fecha límite con indicador visual:
  - Rojo si está vencido
  - Naranja si vence en < 3 días
  - Gris si tiene más margen
- [ ] Menú contextual "···" con: Ver detalle, Editar, Crear pedido
- [ ] Hover: fondo sutil + levantar 1px

### 3.3 Frontend: Estados vacíos mejorados

**Archivo:** `frontend/src/components/EmptyState.tsx` (nuevo)

- [ ] Mensaje contextual por tipo de sección:
  - Críticos vacío → "No hay presupuestos críticos. ¡Todo bajo control!"
  - Incidencias vacío → "Sin incidencias abiertas. Buen trabajo."
  - Pendientes vacío → "Todos los clientes han respondido."
- [ ] Icono verde de check
- [ ] Tono positivo/celebratorio

### 3.4 Frontend: Integrar en `Dashboard.tsx`

- [ ] Reemplazar los 7 `div.section-row` por `<DashboardTabs>`
- [ ] Cada tab renderiza una lista de `<BudgetRow>`
- [ ] Paginación interna si hay más de 10 elementos

### 3.5 Tests

- [ ] Test E2E: Navegar entre tabs y verificar contenido
- [ ] Test E2E: BudgetRow muestra estado vacío correcto
- [ ] Test E2E: Menú contextual funciona en BudgetRow

---

## Fase 4: Personalización y UX Avanzada

**Objetivo:** Cada usuario ve lo relevante para su rol. Experiencia de carga pulida.

### 4.1 Backend: Filtrar dashboard por rol/gestor

- [ ] Añadir query params `?gestor=X&rol=Y` al endpoint `/dashboard`
- [ ] Si el usuario es `gestion`, filtrar por su `gestor` asignado
- [ ] Si es `admin_sistema`, mostrar todo + datos de rendimiento de gestores
- [ ] Añadir `rendimiento_gestores` al payload para admin

### 4.2 Frontend: Resumen "De un vistazo"

**Archivo:** `frontend/src/components/AtAGlance.tsx` (nuevo)

- [ ] Componente arriba de los KPIs
- [ ] Texto generado en lenguaje natural (ya viene del backend en `resumen_texto`)
- [ ] Formato: icono + texto en una línea con fondo sutil
- [ ] Se actualiza al recargar el dashboard

### 4.3 Frontend: Skeletons contextuales

**Archivo:** `frontend/src/components/DashboardSkeleton.tsx` (nuevo)

- [ ] Skeleton del banner (altura 48px)
- [ ] Skeleton de KPIs (4 rectángulos en grid)
- [ ] Skeleton de gráficos (4 cards con shimmer)
- [ ] Skeleton de tabs (rectángulos horizontales)
- [ ] Animación `shimmer` ya existente en `styles.css`

### 4.4 Frontend: Atajos de teclado visibles

- [ ] Añadir un pequeño hint abajo a la derecha: `Press / to search · n for new`
- [ ] Solo visible en desktop (hidden en móvil)
- [ ] Desaparece tras 5 segundos o al hacer scroll

### 4.5 Frontend: Modo foco

- [ ] Botón en cada gráfico/sección para expandir a pantalla completa
- [ ] Modal o panel lateral con el gráfico a tamaño grande
- [ ] Botón "Volver al dashboard"

### 4.6 Tests

- [ ] Test E2E: Usuario gestión solo ve sus presupuestos
- [ ] Test E2E: Admin sistema ve rendimiento de gestores
- [ ] Test E2E: Skeletons aparecen durante carga
- [ ] Test unitario: Filtro por rol devuelve datos correctos

---

## Fase 5: Pulido y Optimización

**Objetivo:** Rendimiento, accesibilidad y calidad final.

### 5.1 Optimización de rendimiento

- [ ] Virtualizar listas largas con `@tanstack/react-virtual` (ya instalado)
- [ ] Memorizar cálculos derivados con `useMemo`
- [ ] Lazy loading de gráficos (solo cargar Recharts cuando el componente entra en viewport)

### 5.2 Accesibilidad

- [ ] Navegación por teclado en tabs (ArrowLeft / ArrowRight)
- [ ] Focus trap en modales de foco
- [ ] `aria-labels` en KPIs, gráficos y tabs
- [ ] Roles ARIA: `role="tablist"`, `role="tab"`, `role="tabpanel"`
- [ ] Contraste de colores verificados (mínimo AA)

### 5.3 Responsive final

- [ ] **Desktop (≥1024px):** KPIs en grid de 4, gráficos en 2x2, tabs horizontales
- [ ] **Tablet (640-1023px):** KPIs en grid de 2, gráficos 1 columna, tabs con scroll horizontal
- [ ] **Mobile (< 640px):** KPIs stacked (1 columna), gráficos stacked, tabs swipeables
- [ ] Bottom tabs ya existentes — verificar que no haya conflicto con el nuevo layout

### 5.4 Limpieza de código

- [ ] Eliminar `MiniStat`, `PriorityRow`, `EstadoBar`, `CompactList` del dashboard (obsoletos)
- [ ] Eliminar CSS no utilizado en `styles.css` (.charts-section, .donut-wrap, .compact-list, .compact-row-sm, etc. — si no se usan en otras páginas)
- [ ] Migrar estilos específicos del dashboard a Tailwind cuando sea posible

### 5.5 Tests E2E completos

**Archivo:** `frontend/e2e/dashboard.spec.ts` (nuevo/ampliar)

- [ ] El dashboard carga sin errores
- [ ] Las 4 KPI cards se muestran con valores correctos
- [ ] El banner de alerta aparece cuando hay críticos
- [ ] Los 4 gráficos se renderizan
- [ ] Los tabs muestran contenido al hacer clic
- [ ] BudgetRow navega al detalle al hacer clic
- [ ] Estados vacíos muestran mensaje apropiado
- [ ] El dashboard responde correctamente en mobile (viewport 375px)

### 5.6 Documentación

- [ ] Comentarios JSDoc en componentes nuevos
- [ ] Actualizar README con la nueva estructura del dashboard
- [ ] Documentar el esquema del payload en `backend/app/analytics.py`

---

## Resumen de Archivos Nuevos y Modificados

### Backend

| Archivo | Acción | Fase |
|---|---|---|
| `backend/app/analytics.py` | Modificar `build_dashboard_payload` | 1, 2, 4 |
| `backend/app/main.py` | Añadir query params a `/dashboard` | 4 |

### Frontend — Nuevos

| Archivo | Descripción | Fase |
|---|---|---|
| `src/components/KpiCard.tsx` | Tarjeta de KPI con tendencia y link | 1 |
| `src/components/AlertBanner.tsx` | Banner de alerta contextual | 1 |
| `src/components/TrendChart.tsx` | Gráfico de tendencia mensual | 2 |
| `src/components/EstadoChart.tsx` | Gráfico de distribución de estados | 2 |
| `src/components/DashboardTabs.tsx` | Tabs de secciones | 3 |
| `src/components/BudgetRow.tsx` | Fila de presupuesto rediseñada | 3 |
| `src/components/EmptyState.tsx` | Estado vacío contextual | 3 |
| `src/components/AtAGlance.tsx` | Resumen en lenguaje natural | 4 |
| `src/components/DashboardSkeleton.tsx` | Skeletons contextuales | 4 |
| `src/utils/dashboard.ts` | Tipos y helpers del dashboard | 1 |

### Frontend — Modificados

| Archivo | Acción | Fase |
|---|---|---|
| `src/pages/Dashboard.tsx` | Refactor completo | 1-4 |
| `src/styles.css` | Limpiar CSS no usado + añadir nuevos estilos | 1-5 |
| `src/utils/api.ts` | Tipos para nuevo payload | 1 |

### Tests

| Archivo | Acción | Fase |
|---|---|---|
| `frontend/e2e/dashboard.spec.ts` | Tests E2E del dashboard | 5 |
| `backend/tests/test_analytics.py` | Tests unitarios analytics | 1, 4 |

---

## Éxito del Rediseño: Cómo Medirlo

| Métrica | Antes | Objetivo |
|---|---|---|
| Tiempo para identificar presupuestos urgentes | ~15-20s escaneando | < 3s (banner visible) |
| Clics para llegar a un presupuesto crítico | 2-3 (dashboard → lista → detalle) | 1 (banner → detalle) |
| Número de llamadas API al cargar | 2 paralelas | 1 |
| Scroll vertical en dashboard | ~4-5 pantallas | < 2 pantallas |
| Elementos interactivos visibles sin scroll | ~10 | ~20 (KPIs + gráficos + tabs) |
| Satisfacción del usuario | — | Encuesta post-implementación |
