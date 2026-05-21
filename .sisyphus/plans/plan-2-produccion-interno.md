# Plan 2.0 - Producción Interna (20 usuarios)
## PresuControl V5 - Sistema de Gestión de Presupuestos

---

## 🎯 CONTEXTO: Aplicación Interna

**Usuarios**: 20 personas (equipo interno)
**Tipo**: Aplicación corporativa interna
**Escala**: Pequeña/Mediana empresa
**Presupuesto**: Ajustado y realista
**Prioridad**: Funcionalidad > Escalabilidad masiva

---

## 📊 ANÁLISIS AJUSTADO PARA USO INTERNO

### ✅ Lo que YA está bien para 20 usuarios
- Arquitectura actual (FastAPI + React + PostgreSQL)
- Sistema de autenticación JWT
- Docker Compose para deploy simple
- Gestión de estados de presupuestos
- Sistema de notificaciones
- Historial de cambios

### 🔴 Problemas REALES para uso interno

#### 1. **CRÍTICOS** (Bloquean producción)
- ❌ Rate limiting en memoria (se pierde al reiniciar)
- ❌ Sin backups automáticos de base de datos
- ❌ Sin logging para debugging
- ❌ Commits innecesarios que ralentizan
- ❌ N+1 queries en calculate_risk
- ❌ Sin SSL/HTTPS configurado
- ❌ Contraseñas sin política mínima

#### 2. **IMPORTANTES** (Mejoran productividad)
- ⚠️ Sin exportación de reportes a Excel/PDF
- ⚠️ Sin adjuntar documentos a presupuestos
- ⚠️ Sin búsqueda rápida avanzada
- ⚠️ Sin dashboard personalizable
- ⚠️ Sin notificaciones de escritorio
- ⚠️ Sin modo oscuro (comodidad visual)

#### 3. **NICE TO HAVE** (No urgentes)
- 💡 PWA/modo offline
- 💡 Integración con calendarios externos
- 💡 Machine Learning predictivo
- 💡 Portal de proveedores/clientes

### ❌ Lo que NO necesitas (sobre-ingeniería)
- ~~Kubernetes/orquestación compleja~~
- ~~CDN para assets estáticos~~
- ~~Balanceo de carga~~
- ~~Auto-scaling~~
- ~~Separación lectura/escritura DB~~
- ~~Sistema de colas distribuido~~
- ~~Microservicios~~

---

## 🎯 MÓDULOS NUEVOS PRIORIZADOS (Uso Interno)

### 1. **Gestión Documental** 📄 [PRIORIDAD ALTA]
**Por qué**: Centralizar PDFs, cotizaciones, contratos

**Funcionalidades mínimas**:
- Adjuntar archivos a presupuestos (PDF, Excel, imágenes)
- Almacenamiento local o MinIO simple
- Previsualización de documentos
- Versionado básico
- Control de permisos

**Impacto**: Ahorra 2-3 horas/día en búsqueda de documentos
**Tiempo**: 1 semana

---

### 2. **Exportación Avanzada** 📊 [PRIORIDAD ALTA]
**Por qué**: Reportes para dirección y clientes

**Funcionalidades mínimas**:
- Exportar listados a Excel (con filtros aplicados)
- Exportar presupuesto individual a PDF
- Plantillas personalizables
- Reportes programados (semanal/mensual)

**Impacto**: Elimina trabajo manual de reportes
**Tiempo**: 1 semana

---

### 3. **Comunicación Interna** 💬 [PRIORIDAD MEDIA]
**Por qué**: Centralizar conversaciones por presupuesto

**Funcionalidades mínimas**:
- Comentarios con menciones (@usuario)
- Notificaciones en tiempo real
- Historial de comunicaciones
- Adjuntar archivos en comentarios

**Impacto**: Reduce emails internos en 60%
**Tiempo**: 1.5 semanas

---

### 4. **Dashboard Ejecutivo** 📈 [PRIORIDAD MEDIA]
**Por qué**: Visión rápida para gerencia

**Funcionalidades mínimas**:
- KPIs principales (dinero en riesgo, presupuestos críticos)
- Gráficos de evolución temporal
- Top 10 presupuestos por importe
- Rendimiento por gestor
- Exportar dashboard a PDF

**Impacto**: Decisiones más rápidas
**Tiempo**: 1 semana

---

### 5. **Gestión de Proveedores** 🏭 [PRIORIDAD MEDIA]
**Por qué**: Evaluar desempeño de proveedores

**Funcionalidades mínimas**:
- Ficha de proveedor (contacto, datos)
- Historial de pedidos
- Evaluación simple (puntualidad, calidad)
- Alertas de proveedores problemáticos

**Impacto**: Mejora selección de proveedores
**Tiempo**: 1 semana

---

### 6. **Recordatorios y Tareas** ⏰ [PRIORIDAD BAJA]
**Por qué**: No olvidar seguimientos

**Funcionalidades mínimas**:
- Crear recordatorios personales
- Tareas pendientes por presupuesto
- Notificaciones de vencimientos
- Integración con calendario (iCal)

**Impacto**: Reduce olvidos
**Tiempo**: 3 días

---

## 📋 PLAN SIMPLIFICADO - 8 SEMANAS

### SEMANA 1-2: ESTABILIZACIÓN CRÍTICA ⚡
**Objetivo**: Sistema estable y seguro

#### Backend
- [ ] **T1.1** - Migrar rate limiting a tabla PostgreSQL
- [ ] **T1.2** - Añadir rate limiting en registro
- [ ] **T1.3** - Política de contraseñas (min 8 chars, 1 mayúscula, 1 número)
- [ ] **T1.4** - Optimizar N+1 queries (calculate_risk recibe settings)
- [ ] **T1.5** - Eliminar commits innecesarios en endpoints GET
- [ ] **T1.6** - Añadir índices compuestos en DB
- [ ] **T1.7** - Logging estructurado básico (archivo + consola)
- [ ] **T1.8** - Endpoint de health check mejorado

#### Testing
- [ ] **T1.9** - Configurar pytest con fixtures
- [ ] **T1.10** - Tests básicos de API (auth, presupuestos)
- [ ] **T1.11** - Tests de concurrencia (expected_version)

#### Deploy
- [ ] **T1.12** - Script de backup automático PostgreSQL (cron diario)
- [ ] **T1.13** - Script de restore desde backup
- [ ] **T1.14** - Configurar SSL con Let's Encrypt
- [ ] **T1.15** - Nginx como reverse proxy
- [ ] **T1.16** - Variables de entorno en archivo .env seguro

**Entregables**:
- ✅ Sistema 3x más rápido
- ✅ Backups automáticos diarios
- ✅ HTTPS funcionando
- ✅ Tests básicos (>50% cobertura)

---

### SEMANA 3: GESTIÓN DOCUMENTAL 📄
**Objetivo**: Adjuntar archivos a presupuestos

#### Backend
- [ ] **T2.1** - Migración: tabla `documentos` (id, presupuesto_id, nombre, tipo, ruta, tamaño, usuario_id, creado_en)
- [ ] **T2.2** - API: POST /presupuestos/{id}/documentos (upload)
- [ ] **T2.3** - API: GET /presupuestos/{id}/documentos (listar)
- [ ] **T2.4** - API: GET /documentos/{id}/download
- [ ] **T2.5** - API: DELETE /documentos/{id}
- [ ] **T2.6** - Validación: max 10MB, tipos permitidos (pdf, xlsx, jpg, png)
- [ ] **T2.7** - Almacenamiento local en /app/uploads con estructura por fecha

#### Frontend
- [ ] **T2.8** - Componente DocumentUpload (drag & drop)
- [ ] **T2.9** - Lista de documentos en DetallePresupuesto
- [ ] **T2.10** - Previsualización de PDFs (iframe)
- [ ] **T2.11** - Iconos por tipo de archivo
- [ ] **T2.12** - Confirmación antes de eliminar

**Entregables**:
- ✅ Adjuntar documentos a presupuestos
- ✅ Descargar y previsualizar
- ✅ Control de permisos básico

---

### SEMANA 4: EXPORTACIÓN AVANZADA 📊
**Objetivo**: Reportes profesionales

#### Backend
- [ ] **T3.1** - API: GET /presupuestos/export/excel (con filtros)
- [ ] **T3.2** - API: GET /presupuestos/{id}/export/pdf
- [ ] **T3.3** - Librería: openpyxl para Excel avanzado
- [ ] **T3.4** - Librería: ReportLab o WeasyPrint para PDF
- [ ] **T3.5** - Plantilla PDF personalizable (logo, colores)
- [ ] **T3.6** - Incluir gráficos en Excel (estados, importes)

#### Frontend
- [ ] **T3.7** - Botón "Exportar a Excel" en listados
- [ ] **T3.8** - Botón "Exportar a PDF" en detalle
- [ ] **T3.9** - Modal de opciones de exportación
- [ ] **T3.10** - Indicador de descarga en progreso

**Entregables**:
- ✅ Exportar listados a Excel
- ✅ Exportar presupuesto a PDF
- ✅ Plantillas personalizables

---

### SEMANA 5: COMUNICACIÓN INTERNA 💬
**Objetivo**: Chat por presupuesto

#### Backend
- [ ] **T4.1** - Migración: añadir campo `menciones` a tabla comentarios
- [ ] **T4.2** - API: detectar menciones @usuario en comentarios
- [ ] **T4.3** - Crear notificación in-app cuando te mencionan
- [ ] **T4.4** - WebSocket básico para notificaciones en tiempo real
- [ ] **T4.5** - API: marcar comentario como importante

#### Frontend
- [ ] **T4.6** - Autocompletado de @menciones en textarea
- [ ] **T4.7** - Resaltar menciones en comentarios
- [ ] **T4.8** - Notificaciones de escritorio (Notification API)
- [ ] **T4.9** - Badge de notificaciones sin leer en navbar
- [ ] **T4.10** - Sonido opcional en nueva mención

**Entregables**:
- ✅ Menciones @usuario
- ✅ Notificaciones en tiempo real
- ✅ Notificaciones de escritorio

---

### SEMANA 6: DASHBOARD EJECUTIVO 📈
**Objetivo**: Visión general mejorada

#### Backend
- [ ] **T5.1** - API: GET /dashboard/kpis (dinero en riesgo, críticos, etc.)
- [ ] **T5.2** - API: GET /dashboard/tendencias (últimos 6 meses)
- [ ] **T5.3** - API: GET /dashboard/top-presupuestos
- [ ] **T5.4** - API: GET /dashboard/rendimiento-gestores
- [ ] **T5.5** - Caché de 5 minutos para dashboard (Redis o memoria)

#### Frontend
- [ ] **T5.6** - Rediseño de Dashboard con grid responsive
- [ ] **T5.7** - Gráfico de evolución temporal (Recharts)
- [ ] **T5.8** - Gráfico de distribución por estado (pie chart)
- [ ] **T5.9** - Tabla de top 10 presupuestos
- [ ] **T5.10** - Ranking de gestores
- [ ] **T5.11** - Botón "Exportar dashboard a PDF"
- [ ] **T5.12** - Filtros de fecha personalizables

**Entregables**:
- ✅ Dashboard ejecutivo completo
- ✅ Gráficos interactivos
- ✅ Exportación a PDF

---

### SEMANA 7: GESTIÓN DE PROVEEDORES 🏭
**Objetivo**: Ficha y evaluación de proveedores

#### Backend
- [ ] **T6.1** - Migración: tabla `proveedores` (id, nombre, contacto, email, telefono, evaluacion_promedio)
- [ ] **T6.2** - Migración: tabla `evaluaciones_proveedor` (id, proveedor_id, pedido_id, puntualidad, calidad, comentario)
- [ ] **T6.3** - API: CRUD de proveedores
- [ ] **T6.4** - API: POST /pedidos/{id}/evaluar
- [ ] **T6.5** - API: GET /proveedores/{id}/estadisticas
- [ ] **T6.6** - Calcular evaluación promedio automáticamente

#### Frontend
- [ ] **T6.7** - Página /proveedores (listado)
- [ ] **T6.8** - Modal de crear/editar proveedor
- [ ] **T6.9** - Página /proveedores/{id} (detalle con historial)
- [ ] **T6.10** - Modal de evaluación tras completar pedido
- [ ] **T6.11** - Estrellas de rating (1-5)
- [ ] **T6.12** - Badge de alerta en proveedores con rating <3

**Entregables**:
- ✅ Gestión completa de proveedores
- ✅ Sistema de evaluación
- ✅ Alertas de proveedores problemáticos

---

### SEMANA 8: PULIDO Y PRODUCCIÓN 🚀
**Objetivo**: Listo para usar

#### UX/UI
- [ ] **T7.1** - Modo oscuro (toggle en configuración)
- [ ] **T7.2** - Atajos de teclado (Ctrl+K para búsqueda rápida)
- [ ] **T7.3** - Tooltips en acciones importantes
- [ ] **T7.4** - Mensajes de confirmación mejorados
- [ ] **T7.5** - Loading states consistentes
- [ ] **T7.6** - Animaciones suaves (transiciones)

#### Deploy
- [ ] **T7.7** - Docker multi-stage build (imagen <250MB)
- [ ] **T7.8** - Usuario no-root en contenedores
- [ ] **T7.9** - Healthchecks completos
- [ ] **T7.10** - Script de deploy automatizado
- [ ] **T7.11** - Documentación de instalación
- [ ] **T7.12** - Guía de usuario básica

#### Testing Final
- [ ] **T7.13** - Smoke tests en staging
- [ ] **T7.14** - Test de carga (simular 20 usuarios concurrentes)
- [ ] **T7.15** - Verificar backups funcionan
- [ ] **T7.16** - Verificar SSL/HTTPS
- [ ] **T7.17** - Verificar notificaciones email

**Entregables**:
- ✅ Sistema pulido y profesional
- ✅ Deploy automatizado
- ✅ Documentación completa

---

## 🖥️ INFRAESTRUCTURA SIMPLIFICADA

### Opción 1: Servidor Único (Recomendado para 20 usuarios)
**Hardware mínimo**:
- 4GB RAM
- 2 CPU cores
- 50GB SSD
- Ubuntu 22.04 LTS

**Stack**:
```
[Internet] → [Nginx + SSL] → [Docker Compose]
                                ├── Frontend (React)
                                ├── Backend (FastAPI)
                                └── PostgreSQL 16
```

**Costo**: €20-40/mes (Hetzner, DigitalOcean, Contabo)

---

### Opción 2: Servidor Local (Más económico)
**Hardware**:
- PC/servidor en oficina
- 8GB RAM, 4 cores
- 100GB SSD
- IP fija o DynDNS

**Ventajas**:
- Sin costos mensuales
- Datos en local
- Control total

**Desventajas**:
- Requiere mantenimiento físico
- Dependencia de internet de oficina
- Sin redundancia

---

## 📦 STACK TECNOLÓGICO FINAL

### Backend
- **FastAPI** 0.115+ (Python 3.12)
- **PostgreSQL** 16
- **Alembic** (migraciones)
- **Pydantic** (validación)
- **python-jose** (JWT)
- **openpyxl** (Excel)
- **WeasyPrint** (PDF)

### Frontend
- **React** 19
- **TypeScript** 6
- **React Router** 7
- **Recharts** (gráficos)
- **Tailwind CSS** 3
- **Lucide React** (iconos)

### DevOps
- **Docker** + **Docker Compose**
- **Nginx** (reverse proxy)
- **Let's Encrypt** (SSL)
- **Cron** (backups)

### Monitoreo (Básico)
- **Logs** en archivos rotados
- **Uptime Robot** (free tier)
- **Email alerts** para errores críticos

---

## 💰 PRESUPUESTO REALISTA

### Desarrollo (8 semanas)
- **1 Desarrollador Full-Stack** (Senior): €6,000 - €10,000
- **Total desarrollo**: €6,000 - €10,000

### Infraestructura (anual)
- **Servidor VPS**: €240 - €480/año
- **Dominio**: €15/año
- **SSL**: Gratis (Let's Encrypt)
- **Backups externos** (opcional): €60/año
- **Total infraestructura**: €315 - €555/año

### Mantenimiento (mensual)
- **Soporte técnico**: €200 - €400/mes (4-8h/mes)
- **Actualizaciones**: Incluido

### TOTAL PRIMER AÑO
- **Desarrollo**: €6,000 - €10,000
- **Infraestructura**: €315 - €555
- **Mantenimiento**: €2,400 - €4,800
- **TOTAL**: €8,715 - €15,355

### AÑOS SIGUIENTES
- **Infraestructura**: €315 - €555/año
- **Mantenimiento**: €2,400 - €4,800/año
- **TOTAL**: €2,715 - €5,355/año

---

## 📈 ROI ESPERADO (20 usuarios)

### Ahorro de Tiempo
- **Búsqueda de documentos**: 2h/día → 15min/día = **1.75h/día ahorradas**
- **Reportes manuales**: 3h/semana → 15min/semana = **2.75h/semana ahorradas**
- **Emails internos**: 1h/día → 20min/día = **0.67h/día ahorradas**
- **Seguimiento manual**: 1h/día → 15min/día = **0.75h/día ahorradas**

**Total**: ~3.2h/día × 20 usuarios = **64 horas/día ahorradas**

### Valor Económico
- 64h/día × 22 días/mes = **1,408 horas/mes**
- 1,408h × €30/hora = **€42,240/mes en productividad**
- **ROI**: Recuperado en <1 mes

### Beneficios Intangibles
- ✅ Menos errores humanos
- ✅ Mejor trazabilidad
- ✅ Decisiones más rápidas
- ✅ Clientes más satisfechos
- ✅ Menos estrés del equipo

---

## 🎯 MÉTRICAS DE ÉXITO (Realistas)

### Técnicas
- **Uptime**: >99% (permitir mantenimientos programados)
- **Response time**: <1s (p95)
- **Error rate**: <1%
- **Backup success**: 100%
- **Test coverage**: >50%

### Negocio
- **Adopción**: >90% del equipo en 1 mes
- **Satisfacción**: >4/5 en encuesta
- **Tiempo de búsqueda**: -70%
- **Reportes manuales**: -80%
- **Presupuestos perdidos**: -50%

---

## 🚀 ESTRATEGIA DE LANZAMIENTO

### Fase 1: Preparación (1 semana antes)
- [ ] Servidor configurado y probado
- [ ] Migración de datos de V4 a V5 en staging
- [ ] Training de 2 usuarios piloto
- [ ] Documentación lista

### Fase 2: Piloto (1 semana)
- [ ] 2-3 usuarios probando en producción
- [ ] Resto del equipo en V4
- [ ] Recoger feedback
- [ ] Ajustes rápidos

### Fase 3: Rollout (1 semana)
- [ ] Migrar todos los usuarios
- [ ] Sesión de training grupal (1h)
- [ ] Soporte intensivo primera semana
- [ ] V4 disponible como backup

### Fase 4: Consolidación (2 semanas)
- [ ] Resolver incidencias
- [ ] Ajustes según feedback
- [ ] Desactivar V4
- [ ] Celebrar 🎉

---

## 📚 DOCUMENTACIÓN MÍNIMA

### Para Administrador
- [ ] Guía de instalación (README.md)
- [ ] Cómo hacer backups y restore
- [ ] Cómo añadir usuarios
- [ ] Troubleshooting básico

### Para Usuarios
- [ ] Guía rápida (PDF de 2 páginas)
- [ ] Video tutorial (5 minutos)
- [ ] FAQ (10 preguntas frecuentes)

---

## ⚠️ RIESGOS (Uso Interno)

### Riesgo 1: Resistencia al cambio
**Probabilidad**: Media | **Impacto**: Alto
**Mitigación**:
- Training previo
- Usuarios piloto como "champions"
- Mostrar beneficios claros
- Soporte cercano primera semana

### Riesgo 2: Pérdida de datos en migración
**Probabilidad**: Baja | **Impacto**: Crítico
**Mitigación**:
- 3 backups antes de migrar
- Prueba completa en staging
- Mantener V4 disponible 1 mes
- Migración en viernes tarde

### Riesgo 3: Bugs en producción
**Probabilidad**: Media | **Impacto**: Medio
**Mitigación**:
- Fase piloto con usuarios técnicos
- Tests automatizados
- Rollback rápido disponible
- Soporte dedicado primera semana

---

## ✅ CHECKLIST PRE-PRODUCCIÓN

### Seguridad
- [ ] HTTPS configurado y funcionando
- [ ] Contraseñas con política mínima
- [ ] Rate limiting activo
- [ ] Backups automáticos probados
- [ ] Variables de entorno seguras

### Funcionalidad
- [ ] Todos los módulos críticos funcionan
- [ ] Importación de datos probada
- [ ] Exportación a Excel/PDF funciona
- [ ] Notificaciones email funcionan
- [ ] Adjuntar documentos funciona

### Performance
- [ ] Carga de listados <2s
- [ ] Búsqueda <1s
- [ ] Sin N+1 queries
- [ ] Índices en DB creados

### UX
- [ ] Responsive en móvil/tablet
- [ ] Mensajes de error claros
- [ ] Loading states visibles
- [ ] Confirmaciones antes de eliminar

### Documentación
- [ ] README actualizado
- [ ] Guía de usuario lista
- [ ] Video tutorial grabado
- [ ] FAQ documentado

---

## 🎉 CONCLUSIÓN

Para una **aplicación interna con 20 usuarios**, este plan es:

✅ **Realista**: 8 semanas de desarrollo
✅ **Económico**: €8,715 - €15,355 primer año
✅ **Práctico**: Sin sobre-ingeniería
✅ **Efectivo**: ROI en <1 mes
✅ **Mantenible**: Stack simple y probado

### Prioridades Claras:
1. **Semanas 1-2**: Estabilidad y seguridad ⚡
2. **Semanas 3-5**: Funcionalidades clave (docs, export, chat) 🎯
3. **Semanas 6-7**: Mejoras de negocio (dashboard, proveedores) 📊
4. **Semana 8**: Pulido y producción 🚀

### Próximo Paso:
**¿Empezamos con la Semana 1-2 (Estabilización)?** Puedo implementar las tareas críticas ahora mismo.

---

**Documento creado**: 2024
**Versión**: 2.0 - Uso Interno
**Contexto**: 20 usuarios, aplicación corporativa
**Estado**: Listo para implementar
