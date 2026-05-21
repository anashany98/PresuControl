# PLAN DE ARREGLOS COMPLETO - PRESUCONTROL V5

> Generado automáticamente desde auditoría integral de 8 áreas
> Fecha: 2026-05-16
> Total de tareas: ~50 primary tasks, ~120 sub-tasks
> Prioridad: CRÍTICA

---

## 📋 RESUMEN DE PROBLEMAS ENCONTRADOS

| Área | Score | Criticidades | Altos | Medios | Bajos |
|------|-------|-------------|-------|--------|-------|
| Seguridad | 5/10 | 3 | 2 | 4 | 2 |
| Arquitectura | 4/10 | 2 | 3 | 5 | 3 |
| Performance | 4/10 | 3 | 2 | 4 | 1 |
| DevOps | 4/10 | 3 | 2 | 3 | 2 |
| Frontend/UI | 6/10 | 2 | 4 | 6 | 3 |
| Base de Datos | 7/10 | 0 | 3 | 5 | 2 |
| API Contracts | 5/10 | 1 | 3 | 4 | 2 |
| QA/Tests | 3/10 | 2 | 2 | 1 | 0 |

---

# FASE 1: CRÍTICOS (Semana 1) 🚨
## *Sobrevivir primero - Arreglos que evitan desastres*

---

## TAREA 1: .gitignore raíz ✅
**Problema**: `.env` con passwords, secrets, credenciales de BD está en el repositorio
**Severidad**: CRÍTICA
**Archivo**: `.gitignore` (CREAR en raíz)

```
# Environment
.env
.env.local
.env.*.local
*.env

# Logs
*.log
logs/

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv/
venv/
ENV/
env/
*.egg-info/
dist/
build/
*.egg

# Frontend
node_modules/
frontend/node_modules/
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/

# Docker
.dockerignore

# Backup
*.bak
*.backup
```

---

## TAREA 2: Actualizar bcrypt ✅
**Problema**: `bcrypt==4.0.1` tiene CVEs conocidos
**Severidad**: CRÍTICA
**Archivo**: `backend/requirements.txt:12`

```diff
- bcrypt==4.0.1
+ bcrypt>=4.1.3
```

---

## TAREA 3: Fix menú mobile ✅
**Problema**: Menú sidebar no se abre en mobile - falta clase `open` en el toggle
**Severidad**: CRÍTICA
**Archivo**: `frontend/src/components/Layout.tsx:153`

**Verificar que existe**:
1. Estado `mobileOpen` inicializado como `false`
2. Función `toggleMobileMenu()` que invierte `mobileOpen`
3. Botón hamburguesa llama a `toggleMobileMenu()`
4. CSS tiene `.sidebar.open { transform: translateX(0); }`

**Si falta la lógica**:
```tsx
const [mobileOpen, setMobileOpen] = useState(false);
const toggleMobileMenu = () => setMobileOpen(prev => !prev);
```

---

## TAREA 4: Remover secrets del frontend ✅
**Problema**: `smtp_password` y `jwt_secret` se muestran en inputs del frontend
**Severidad**: CRÍTICA
**Archivos**:
- `backend/app/main.py` (endpoint `/configuracion`)
- `frontend/src/pages/Configuracion.tsx:151,208`

**Backend**: Remover `smtp_password` y `jwt_secret` de la respuesta, retornar `smtp_password_set: bool`

**Frontend**: Cambiar `<input value={config.smtp_password} />` a `<input type="password" placeholder="●●●●●●●●" />`

---

## TAREA 5: Fix tests fallando ✅
**Problema**: 10 tests fallando por `no such table: presupuestos`
**Severidad**: CRÍTICA
**Archivos**:
- `backend/tests/test_api_presupuestos.py`
- `backend/tests/test_pagination.py`
- `backend/tests/conftest.py`

**Fix en test files** - Importar todos los modelos ANTES de `create_all`:
```python
from app.models import Base, Usuario, Presupuesto, Comentario, HistorialCambio, \
    PedidoProveedor, Proveedor, AppSetting, EvaluacionProveedor, \
    LoginAttempt, RegistrationAttempt, EmailNotificationLog, ActividadLog, \
    InAppNotification

Base.metadata.create_all(bind=test_engine)
```

**conftest.py debe tener**:
```python
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
```

---

## TAREA 6: Crear pipeline CI/CD ✅
**Problema**: No existe `.github/workflows/`
**Severidad**: CRÍTICA
**Archivo**: `.github/workflows/ci.yml` (CREAR)

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  backend-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install ruff
      - run: ruff check backend/app/

  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r backend/requirements.txt
      - run: pip install pytest pytest-cov
      - run: pytest backend/tests/ -v --tb=short
        env:
          JWT_SECRET_KEY: test-secret-key
          DATABASE_URL: sqlite:///./test.db
          AUTH_ENABLED: 'true'

  frontend-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: frontend
      - run: npm run lint
        working-directory: frontend

  frontend-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: frontend
      - run: npx tsc --noEmit
        working-directory: frontend

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
```

---

## TAREA 7: Implementar caché para settings ✅
**Problema**: `get_settings(db)` ejecuta query en cada request
**Severidad**: CRÍTICA
**Archivo**: `backend/app/settings.py`

**Reemplazar `get_settings()` con versión cacheada**:
```python
from functools import lru_cache
from datetime import datetime, timedelta
import threading

class SettingsCache:
    _lock = threading.Lock()
    _cache: Optional[dict] = None
    _expires_at: Optional[datetime] = None
    TTL_SECONDS = 60

    @classmethod
    def get(cls) -> dict:
        with cls._lock:
            now = datetime.now()
            if cls._cache is None or cls._expires_at is None or now >= cls._expires_at:
                from app.database import SessionLocal
                db = SessionLocal()
                try:
                    from app.models import AppSetting
                    settings = db.query(AppSetting).all()
                    cls._cache = {s.clave: s.valor for s in settings}
                    cls._expires_at = now + timedelta(seconds=cls.TTL_SECONDS)
                finally:
                    db.close()
            return cls._cache.copy()

    @classmethod
    def invalidate(cls):
        with cls._lock:
            cls._cache = None
            cls._expires_at = None
```

---

## TAREA 8: Fix N+1 queries (Parte 2) ✅
**Problema**: `calculate_risk()` → `has_pedidos()` = 1 query por fila
**Severidad**: CRÍTICA
**Archivo**: `backend/app/main.py`, `backend/app/rules.py`

**Pre-cargar conteo de pedidos ANTES de iterar**:
```python
# Antes de cualquier endpoint que llame calculate_risk en loop:
pedido_counts = {
    row.presupuesto_id: row.count
    for row in db.query(
        PedidoProveedor.presupuesto_id,
        func.count(PedidoProveedor.id).label('count')
    ).group_by(PedidoProveedor.presupuesto_id).all()
}

# Modificar calculate_risk para aceptar el dict:
def calculate_risk(presupuesto, db, settings, pedido_counts=None):
    if pedido_counts is None:
        pedido_counts = {}
    has_pedido = pedido_counts.get(presupuesto.id, 0) > 0
    # ... resto
```

---

## TAREA 9: Implementar paginación ✅
**Problema**: 8+ endpoints cargan TODOS los registros con `.all()`
**Severidad**: CRÍTICA
**Archivo**: `backend/app/main.py`

**Endpoints a modificar** (usar queries SQL aggregates):

1. **`/sidebar-counters`**: Contadores SQL, no cargar rows
2. **`/mi-mesa`**: Filtrar en SQL con WHERE
3. **`/hoy`**: `fecha_limite_siguiente_accion <= date.today()` en SQL
4. **`/dashboard`**: `GROUP BY` en SQL para counts
5. **`/aceptados-sin-pedido`**: JOIN + filter en SQL

---

## TAREA 10: Script Backup PostgreSQL ✅
**Problema**: Sin estrategia de backup de base de datos
**Severidad**: CRÍTICA
**Archivos**: `backup.sh` (CREAR), `docker-compose.yml`

**`backup.sh`**:
```bash
#!/bin/bash
set -e
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="presucontrol-db-1"
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR
docker exec $CONTAINER_NAME pg_dump -U postgres presucontrol | gzip > "$BACKUP_DIR/presucontrol_${DATE}.sql.gz"

# Verificar
if [ -s "$BACKUP_DIR/presucontrol_${DATE}.sql.gz" ]; then
    echo "[$(date)] Backup exitoso"
else
    echo "[$(date)] ERROR: Backup vacío"
    exit 1
fi

# Limpiar antiguos
find $BACKUP_DIR -name "presucontrol_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completado"
```

**docker-compose.yml** - añadir volumen:
```yaml
volumes:
  - ./backups:/backups
```

---

# FASE 2: ALTOS (Semanas 2-3) 🟠
## *Estabilizar - Arreglar deuda técnica*

---

## TAREA 11: Refactor main.py (Inicio) 🟠
**Problema**: 2086 líneas en un solo archivo viola SRP
**Severidad**: ALTA
**Archivo**: `backend/app/main.py`

**Crear estructura**:
```
backend/app/
├── api/
│   ├── __init__.py
│   ├── router.py
│   ├── deps.py
│   ├── auth.py
│   ├── usuarios.py
│   ├── presupuestos.py
│   ├── pedidos.py
│   ├── proveedores.py
│   ├── importar.py
│   ├── exportar.py
│   ├── dashboard.py
│   └── avisos.py
├── core/
│   ├── __init__.py
│   ├── config.py
│   ├── security.py
│   └── exceptions.py
├── services/
│   ├── __init__.py
│   └── presupuesto_service.py
```

**Pasos**:
1. Crear `api/router.py` que combine todos los routers
2. Mover endpoints de auth a `api/auth.py`
3. Mover endpoints de presupuestos a `api/presupuestos.py`
4. En `main.py` solo dejar: app creation, middleware, include_router

---

## TAREA 12: Float → Numeric para importes 🟠
**Problema**: `float` es impreciso para cálculos monetarios
**Severidad**: ALTA
**Archivo**: `backend/app/models.py:17,182`

```diff
- importe: Mapped[float] = mapped_column(Float)
+ importe: Mapped[float] = mapped_column(Numeric(12, 2))

- evaluacion_promedio: Mapped[float | None]
+ evaluacion_promedio: Mapped[float | None] = mapped_column(Numeric(3, 2))
```

**Crear migración**:
```bash
cd backend
alembic revision --autogenerate -m "change_importe_to_numeric"
```

---

## TAREA 13: CHECK Constraints 🟠
**Problema**: `estado` y `prioridad_calculada` permiten valores inválidos
**Severidad**: ALTA
**Archivo**: `backend/app/models.py`

```python
class Presupuesto(Base):
    __table_args__ = (
        CheckConstraint(
            "estado IN ('Borrador','Pendiente','Aceptado','Rechazado','Cancelado','En Curso','Completado')",
            name="ck_estado_valid"
        ),
        CheckConstraint(
            "prioridad_calculada IN ('Verde','Amarillo','Naranja','Rojo','Crítico')",
            name="ck_prioridad_valid"
        ),
        CheckConstraint("importe >= 0", name="ck_importe_positivo"),
    )
```

---

## TAREA 14: Índices faltantes 🟠
**Problema**: Falta índice en `fecha_aceptacion`, `email`, `pedido_id`
**Severidad**: ALTA
**Archivos**: `backend/app/models.py`

```bash
cd backend
alembic revision --autogenerate -m "add_missing_indexes"
```

**En la migración**:
```python
def upgrade():
    op.create_index('ix_presupuestos_fecha_aceptacion', 'presupuestos', ['fecha_aceptacion'])
    op.create_index('ix_proveedores_email', 'proveedores', ['email'])
    op.create_index('ix_evaluaciones_proveedor_pedido_id', 'evaluaciones_proveedor', ['pedido_id'])
```

---

## TAREA 15: Rate Limiting Global 🟠
**Problema**: Rate limiting solo en login
**Severidad**: ALTA
**Archivo**: `backend/app/main.py`

```python
# requirements.txt:
# slowapi>=0.1.9

from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@router.post("/import/confirm")
@limiter.limit("10/minute")
def import_confirm(...):
    pass
```

---

## TAREA 16: Proteger endpoints debug 🟠
**Problema**: `/debug/ping`, `/debug/verify-login`, `/seed-demo` expuestos
**Severidad**: ALTA
**Archivo**: `backend/app/main.py:536-544`

**Opción A - Remover** (recomendado):
Eliminar `@app.post("/seed-demo")`, `@app.get("/debug/ping")`, `@app.get("/debug/verify-login")`

**Opción B - Proteger con env**:
```python
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"

@app.get("/debug/ping")
def debug_ping():
    if not DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "ok"}
```

---

## TAREA 17: Code Splitting 🟠
**Problema**: Bundle inicial ~1MB+, todas las páginas importadas eager
**Severidad**: ALTA
**Archivo**: `frontend/src/main.tsx`

```diff
- import { Dashboard } from './pages/Dashboard'
- import { Kanban } from './pages/Kanban'
+ import { lazy, Suspense } from 'react'
+ const Dashboard = lazy(() => import('./pages/Dashboard'))
+ const Kanban = lazy(() => import('./pages/Kanban'))

+ const PageLoader = () => (
+   <div className="flex items-center justify-center h-screen">
+     <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
+   </div>
+ )

- element: <Dashboard />,
+ element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense>,
```

---

## TAREA 18: ErrorBoundary 🟠
**Problema**: Sin ErrorBoundary - cualquier error crashea toda la app
**Severidad**: ALTA
**Archivo**: `frontend/src/components/ErrorBoundary.tsx` (CREAR)

```tsx
import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
            <h2 className="text-xl font-bold text-red-600 mb-4">Algo salió mal</h2>
            <p className="text-gray-600 mb-4">Ha ocurrido un error inesperado.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
```

**En `main.tsx`**:
```tsx
import { ErrorBoundary } from './components/ErrorBoundary'

root.render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
```

---

## TAREA 19: Form Validation ejecutándose 🟠
**Problema**: `validateAll()` definido pero nunca llamado
**Severidad**: ALTA
**Archivo**: `frontend/src/pages/PresupuestoForm.tsx:39,103`

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  // AÑADIR ESTO:
  const errors = validateAll(values)
  if (Object.keys(errors).length > 0) {
    setErrors(errors)
    return
  }

  // ... resto del submit
}
```

---

## TAREA 20: Reutilizar PresupuestoForm 🟠
**Problema**: `NuevoPresupuesto.tsx` reimplementa campos
**Severidad**: MEDIA
**Archivo**: `frontend/src/pages/NuevoPresupuesto.tsx`

```tsx
import { PresupuestoForm } from '../components/PresupuestoForm'

export function NuevoPresupuesto() {
  const navigate = useNavigate()
  const handleSuccess = (presupuesto: Presupuesto) => {
    toast.success('Presupuesto creado')
    navigate(`/presupuesto/${presupuesto.id}`)
  }
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Nuevo Presupuesto</h1>
      <PresupuestoForm submitLabel="Crear presupuesto" onSubmit={handleSuccess} />
    </div>
  )
}
```

---

## TAREA 21: Fix ruta /reportes 🟠
**Problema**: Dashboard enlaza a `/reportes` pero la ruta es `/informes`
**Severidad**: MEDIA
**Archivo**: `frontend/src/pages/Dashboard.tsx:168`

```diff
- <Link to="/reportes">Ver informes</Link>
+ <Link to="/informes">Ver informes</Link>
```

---

## TAREA 22: gzip en nginx 🟠
**Problema**: nginx sin compresión
**Severidad**: ALTA
**Archivo**: `frontend/nginx.conf`

```diff
  gzip on;
+ gzip_vary on;
+ gzip_proxied any;
+ gzip_comp_level 6;
+ gzip_types text/plain text/css text/xml application/json application/javascript
+              application/xml application/xml+rss text/javascript application/x-javascript;
+ gzip_min_length 1000;
```

---

## TAREA 23: Pool DB optimizado 🟠
**Problema**: Pool DB usa default (5 conexiones)
**Severidad**: ALTA
**Archivo**: `backend/app/database.py:7`

```diff
- engine = create_engine(DATABASE_URL, pool_pre_ping=True)
+ engine = create_engine(
+     DATABASE_URL,
+     pool_pre_ping=True,
+     pool_size=20,
+     max_overflow=30,
+     pool_timeout=30,
+     pool_recycle=3600
+ )
```

---

## TAREA 24: Usar schemas definidos 🟠
**Problema**: `SidebarCounters` schema existe pero no se usa
**Severidad**: MEDIA
**Archivo**: `backend/app/main.py:994`

```diff
- @app.get("/sidebar-counters")
- def get_sidebar_counters(...):
-     return {"total": ..., "draft": ...}

+ from app.schemas import SidebarCounters
+ @app.get("/sidebar-counters", response_model=SidebarCounters)
+ def get_sidebar_counters(...):
+     return SidebarCounters(total=..., draft=...)
```

---

# FASE 3: MEDIOS (Semanas 4-5) 🟡
## *Mejorar - Calidad de vida*

---

## TAREA 25: Índice GIN para búsqueda 🟡
**Problema**: ILIKE searches son full table scans
**Severidad**: MEDIA

```bash
cd backend
alembic revision --autogenerate -m "add_gin_trgm_index"
```

**En la migración**:
```python
def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    op.execute("""
        CREATE INDEX ix_presupuestos_search_trgm
        ON presupuestos
        USING gin (numero_presupuesto gin_trgm_ops, cliente gin_trgm_ops, obra_referencia gin_trgm_ops)
    """)
```

---

## TAREA 26: API Versioning 🟡
**Problema**: Sin API versioning
**Severidad**: MEDIA
**Archivo**: `backend/app/main.py`

```diff
- app.include_router(presupuestos.router, prefix="/presupuestos")
+ app.include_router(presupuestos.router, prefix="/api/v1/presupuestos")
```

---

## TAREA 27: Split api.ts 🟡
**Problema**: api.ts tiene 267 líneas con demasiadas responsabilidades
**Severidad**: MEDIA

```
frontend/src/utils/
├── api.ts              # Request wrapper
├── api.auth.ts
├── api.presupuestos.ts
├── api.pedidos.ts
├── api.proveedores.ts
├── api.dashboard.ts
├── types.ts
└── helpers.ts
```

---

## TAREA 28: Pages agrupadas 🟡
**Problema**: 25 páginas sin grouping
**Severidad**: MEDIA

```
frontend/src/pages/
├── auth/
│   ├── Login.tsx
│   └── Register.tsx
├── presupuesto/
│   ├── Dashboard.tsx
│   ├── List.tsx
│   ├── Detail.tsx
│   ├── Form.tsx
│   ├── Kanban.tsx
│   ├── Calendario.tsx
│   └── Nuevo.tsx
├── admin/
│   ├── Usuarios.tsx
│   └── Configuracion.tsx
└── reports/
    ├── Informes.tsx
    └── Hoy.tsx
```

---

## TAREA 29: Modales accesibles 🟡
**Problema**: Modales sin ARIA, sin focus trap
**Severidad**: MEDIA
**Archivo**: `frontend/src/components/Modal.tsx` (CREAR)

```tsx
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-gray-100 rounded">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
```

---

## TAREA 30: Kanban keyboard alternative 🟡
**Problema**: Drag-drop solo funciona con mouse
**Severidad**: MEDIA
**Archivo**: `frontend/src/pages/Kanban.tsx`

```tsx
// En cada tarjeta:
<div className="flex gap-2 mt-2">
  <button onClick={() => moveToColumn('Pendiente')} className="text-xs text-gray-500 hover:text-gray-700">
    ← Pendiente
  </button>
  <button onClick={() => moveToColumn('En Curso')} className="text-xs text-gray-500 hover:text-gray-700">
    En Curso →
  </button>
</div>
```

---

## TAREA 31: ESLint + Prettier 🟡
**Problema**: Sin linting ni formatting
**Severidad**: MEDIA
**Archivo**: `frontend/package.json`

```bash
cd frontend
npm install -D eslint prettier @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y
npx eslint --init
```

**`.eslintrc.json`**:
```json
{
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:react/recommended", "plugin:react-hooks/recommended", "plugin:jsx-a11y/recommended"],
  "parser": "@typescript-eslint/parser",
  "rules": {
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-unused-vars": "warn"
  }
}
```

---

## TAREA 32: File upload validation 🟡
**Problema**: No hay validación de tamaño ni MIME type
**Severidad**: MEDIA
**Archivo**: `backend/app/main.py`

```python
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'.xlsx', '.xls', '.csv'}

async def parse_upload(file: UploadFile):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"Archivo muy grande. Máximo: {MAX_FILE_SIZE/1024/1024}MB")

    import os
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Extensión no permitida: {ALLOWED_EXTENSIONS}")

    return content
```

---

## TAREA 33: Raw SQL → Alembic 🟡
**Problema**: `ensure_schema_compatibility` usa raw SQL
**Severidad**: MEDIA
**Archivo**: `backend/app/main.py:79-98`

```bash
cd backend
alembic revision --autogenerate -m "ensure_schema_columns"
```

**En la migración** - mover lógica de `ensure_schema_compatibility`:
```python
def upgrade():
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('presupuestos')]

    if 'puede_gestionar_sistema' not in existing:
        op.execute("UPDATE presupuestos SET puede_gestionar_sistema = false")

    op.create_index('ix_presupuestos_puede_gestionar_sistema', 'presupuestos', ['puede_gestionar_sistema'])
```

**Remover** `ensure_schema_compatibility` de `main.py`

---

## TAREA 34: DNS prefetch 🟡
**Problema**: Sin preconnect para API
**Severidad**: BAJA
**Archivo**: `frontend/index.html`

```html
<link rel="dns-prefetch" href="//API_DOMAIN" />
<link rel="preconnect" href="https://API_DOMAIN" crossorigin />
```

---

# FASE 4: OPCIONALES (Semanas 6-8) 🟢
## *Polishing - Extras*

---

## TAREA 35: Refresh tokens 🟢
**Problema**: JWT expira y requiere login completo
**Severidad**: BAJA
**Archivo**: `backend/app/auth.py`

```python
REFRESH_TOKEN_EXPIRE_DAYS = 7

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm="HS256")

@router.post("/refresh")
def refresh(refresh_token: str):
    try:
        payload = jwt.decode(refresh_token, JWT_SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        new_token = create_access_token(data={"sub": payload["sub"], "id": payload["id"]})
        return {"access_token": new_token, "token_type": "bearer"}
    except JWTError:
        raise HTTPException(401, "Invalid refresh token")
```

---

## TAREA 36: Prometheus metrics 🟢
**Problema**: Sin monitoring
**Severidad**: BAJA

```python
# requirements.txt:
# prometheus-client>=0.19.0

from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
REQUEST_LATENCY = Histogram('http_request_duration_seconds', 'HTTP request latency')

@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type="text/plain")
```

---

## TAREA 37: Coolify config 🟢
**Problema**: Sin configuración de Coolify automation
**Severidad**: BAJA

**`coolify.yml`** (raíz):
```yaml
version: 1
applications:
  - name: presucontrol
    build:
      dockerfile: Dockerfile
      context: .
    ports:
      - 3000:3000
    environment:
      - DATABASE_URL
      - JWT_SECRET_KEY
      - AUTH_ENABLED=true
    health_check:
      path: /health
      interval: 30s
      timeout: 10s
```

---

## TAREA 38: Playwright tests 🟢
**Problema**: Sin tests de frontend
**Severidad**: BAJA

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

**`playwright.config.ts`**:
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
})
```

---

## 📊 CHECKLIST FINAL

### Fase 1 Completada ✅
- [ ] .gitignore creado con .env
- [ ] bcrypt >= 4.1.3
- [ ] Menú mobile funciona
- [ ] Secrets no expuestos en frontend
- [ ] Tests pasan (10/10)
- [ ] CI/CD pipeline operativo
- [ ] Settings con caché
- [ ] N+1 queries mitigadas
- [ ] Paginación implementada
- [ ] Backup script creado

### Fase 2 Completada ✅
- [ ] main.py refactorizado (≥30%分离)
- [ ] Float → Numeric
- [ ] CHECK constraints añadidos
- [ ] Índices creados
- [ ] Rate limiting global
- [ ] Endpoints debug protegidos
- [ ] Code splitting implementado
- [ ] ErrorBoundary añadido
- [ ] Form validation ejecutándose
- [ ] gzip habilitado

### Fase 3 Completada ✅
- [ ] GIN index para búsqueda
- [ ] API versioning implementado
- [ ] api.ts dividido
- [ ] Pages agrupadas
- [ ] Modales accesibles
- [ ] Kanban con alternativa teclado
- [ ] ESLint + Prettier configurado
- [ ] File upload validado
- [ ] Raw SQL migrado a Alembic
- [ ] DNS prefetch añadido

### Fase 4 Completada ✅
- [ ] Refresh tokens
- [ ] Prometheus metrics
- [ ] Coolify config
- [ ] Playwright tests

---

## 📈 RESUMEN DE ESFUERZO

| Fase | Tareas | Tiempo Estimado |
|------|--------|-----------------|
| Fase 1 (Críticos) | 10 | 1-2 días |
| Fase 2 ( Altos) | 14 | 2-3 semanas |
| Fase 3 (Medios) | 10 | 2-3 semanas |
| Fase 4 (Opcionales) | 4 | 1-2 semanas |

**TOTAL: ~50 tareas, 6-10 semanas para production-ready completo**

---

*Plan generado automáticamente por auditoría de 8 áreas*
*Fecha: 2026-05-16*
