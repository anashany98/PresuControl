from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Any

ESTADOS = [
    "Pendiente de enviar",
    "Enviado al cliente",
    "Aceptado - pendiente pedido proveedor",
    "Pedido proveedor realizado",
    "Plazo proveedor confirmado",
    "En preparación / fabricación",
    "Entregado / cerrado",
    "Cancelado / rechazado",
    "Bloqueado / incidencia",
]
PRIORIDADES = ["Verde", "Amarillo", "Naranja", "Rojo", "Crítico"]

class PresupuestoBase(BaseModel):
    numero_presupuesto: str | None = None
    cliente: str | None = None
    obra_referencia: str | None = None
    gestor: str | None = None
    fecha_presupuesto: date | None = None
    fecha_envio_cliente: date | None = None
    fecha_aceptacion: date | None = None
    importe: float | None = None
    estado: str | None = None
    proveedor: str | None = None
    pedido_proveedor_realizado: bool | None = None
    numero_pedido_proveedor: str | None = None
    fecha_pedido_proveedor: date | None = None
    plazo_proveedor: date | None = None
    fecha_prevista_entrega: date | None = None
    responsable_actual: str | None = None
    siguiente_accion: str | None = None
    fecha_limite_siguiente_accion: date | None = None
    incidencia: bool | None = None
    descripcion_incidencia: str | None = None
    observaciones: str | None = None
    motivo_cancelacion_rechazo: str | None = None
    fecha_cancelacion_rechazo: date | None = None
    archivado: bool | None = None
    motivo_archivado: str | None = None

class PresupuestoCreate(PresupuestoBase):
    numero_presupuesto: str = Field(..., min_length=1)
    cliente: str = Field(..., min_length=1)
    obra_referencia: str = Field(..., min_length=1)
    gestor: str = Field(..., min_length=1)
    fecha_presupuesto: date
    importe: float
    estado: str = Field(..., min_length=1)
    modificado_por: str | None = None

class PresupuestoUpdate(PresupuestoBase):
    modificado_por: str | None = None
    expected_version: int

class PresupuestoOut(PresupuestoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    numero_presupuesto: str
    cliente: str
    obra_referencia: str
    gestor: str
    fecha_presupuesto: date
    importe: float
    estado: str
    pedido_proveedor_realizado: bool
    incidencia: bool
    prioridad_calculada: str
    dias_parado: int
    fecha_ultima_actualizacion: datetime
    creado_en: datetime
    actualizado_en: datetime
    version: int
    archivado: bool = False
    archivado_en: datetime | None = None
    archivado_por: str | None = None
    motivo_archivado: str | None = None

class ComentarioCreate(BaseModel):
    comentario: str = Field(..., min_length=1)
    nombre_opcional: str | None = None

class ComentarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    presupuesto_id: int
    comentario: str
    nombre_opcional: str | None
    usuario_id: int | None = None
    usuario_nombre: str | None = None
    usuario_email: str | None = None
    creado_en: datetime

class HistorialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    presupuesto_id: int
    campo: str
    valor_anterior: str | None
    valor_nuevo: str | None
    descripcion: str
    nombre_opcional: str | None
    usuario_id: int | None = None
    usuario_nombre: str | None = None
    usuario_email: str | None = None
    creado_en: datetime

class SettingsOut(BaseModel):
    estados: list[str]
    gestores: list[str]
    proveedores: list[str]
    tipos_incidencia: list[str]
    dias_critico_aceptado_sin_pedido: int
    dias_vencido_seguimiento_comercial: int
    dias_aviso_pedido_sin_plazo: int
    email_avisos_activo: bool
    emails_destino_avisos: list[str]
    enviar_email_criticos_inmediato: bool
    asunto_email_avisos: str
    avisos_automaticos_activos: bool
    resumen_diario_automatico_activo: bool
    hora_resumen_diario: str
    intervalo_revision_avisos_minutos: int
    escalado_automatico_activo: bool
    emails_escalado_avisos: list[str]
    horas_escalado_nivel_1: int
    horas_escalado_nivel_2: int
    horas_escalado_nivel_3: int
    dias_sin_actualizar_aviso: int

class SettingsUpdate(BaseModel):
    estados: list[str] | None = None
    gestores: list[str] | None = None
    proveedores: list[str] | None = None
    tipos_incidencia: list[str] | None = None
    dias_critico_aceptado_sin_pedido: int | None = None
    dias_vencido_seguimiento_comercial: int | None = None
    dias_aviso_pedido_sin_plazo: int | None = None
    email_avisos_activo: bool | None = None
    emails_destino_avisos: list[str] | None = None
    enviar_email_criticos_inmediato: bool | None = None
    asunto_email_avisos: str | None = None
    avisos_automaticos_activos: bool | None = None
    resumen_diario_automatico_activo: bool | None = None
    hora_resumen_diario: str | None = None
    intervalo_revision_avisos_minutos: int | None = None
    escalado_automatico_activo: bool | None = None
    emails_escalado_avisos: list[str] | None = None
    horas_escalado_nivel_1: int | None = None
    horas_escalado_nivel_2: int | None = None
    horas_escalado_nivel_3: int | None = None
    dias_sin_actualizar_aviso: int | None = None

class ImportPreview(BaseModel):
    total_filas: int
    validos: int
    duplicados_bd: list[str]
    duplicados_archivo: list[str]
    errores: list[dict[str, Any]]
    preview: list[dict[str, Any]]
    modo: str = 'create_only'
    nuevos: int = 0
    actualizables: int = 0
    cambios_preview: list[dict[str, Any]] = []


class UserRegister(BaseModel):
    nombre: str = Field(..., min_length=2)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=1)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    email: str
    activo: bool
    aprobado: bool = True
    aprobado_en: datetime | None = None
    aprobado_por: str | None = None
    creado_en: datetime
    puede_gestionar_sistema: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class QuickAction(BaseModel):
    action: str
    expected_version: int
    modificado_por: str | None = None
    fecha_envio_cliente: date | None = None
    fecha_aceptacion: date | None = None
    proveedor: str | None = None
    numero_pedido_proveedor: str | None = None
    fecha_pedido_proveedor: date | None = None
    plazo_proveedor: date | None = None
    fecha_prevista_entrega: date | None = None
    responsable_actual: str | None = None
    siguiente_accion: str | None = None
    fecha_limite_siguiente_accion: date | None = None
    descripcion_incidencia: str | None = None
    motivo_cancelacion_rechazo: str | None = None
    fecha_cancelacion_rechazo: date | None = None


class ArchivePayload(BaseModel):
    motivo_archivado: str = Field(..., min_length=3)
    expected_version: int


class UserApprovalPayload(BaseModel):
    aprobado: bool = True
    puede_gestionar_sistema: bool | None = None


class EmailLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    presupuesto_id: int | None = None
    tipo: str
    fingerprint: str
    sent_to: str | None = None
    status: str
    error: str | None = None
    escalation_level: int
    creado_en: datetime


class PaginatedPresupuestos(BaseModel):
    items: list[PresupuestoOut]
    total: int
    page: int
    page_size: int
    total_pages: int
    importe_total: float


class EmailTestPayload(BaseModel):
    destinatarios: list[str] | None = None


class PasswordResetRequest(BaseModel):
    email: str = Field(..., min_length=5)


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=20)
    password: str = Field(..., min_length=6)


class PasswordAdminReset(BaseModel):
    password: str = Field(..., min_length=6)


class SidebarCounters(BaseModel):
    hoy: int
    aceptados_sin_pedido: int
    riesgo: int
    incidencias: int
    usuarios_pendientes: int
    dinero_riesgo: float


class SearchResult(BaseModel):
    presupuestos: list[PresupuestoOut]
    comentarios: list[dict[str, Any]]
    historial: list[dict[str, Any]]
