from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, Numeric, CheckConstraint, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Presupuesto(Base):
    __tablename__ = "presupuestos"
    __table_args__ = (
        UniqueConstraint("numero_presupuesto", name="uq_numero_presupuesto"),
        CheckConstraint(
            "estado IN ('Borrador','Pendiente de enviar','Enviado al cliente','Aceptado - pendiente pedido proveedor','Pedido proveedor realizado','Plazo proveedor confirmado','En preparación / fabricación','Bloqueado / incidencia','Cancelado / rechazado','Entregado / cerrado')",
            name="ck_estado_valid"
        ),
        CheckConstraint(
            "prioridad_calculada IN ('Verde','Amarillo','Naranja','Rojo','Crítico')",
            name="ck_prioridad_valid"
        ),
        CheckConstraint("importe >= 0", name="ck_importe_positivo"),
        Index("ix_presupuestos_fecha_aceptacion", "fecha_aceptacion"),
        Index("ix_presupuestos_estado_archivado_fecha_limite", "estado", "archivado", "fecha_limite_siguiente_accion"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero_presupuesto: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    cliente: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    obra_referencia: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    gestor: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    fecha_presupuesto: Mapped[Date] = mapped_column(Date, nullable=False)
    fecha_envio_cliente: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_aceptacion: Mapped[Date | None] = mapped_column(Date, nullable=True)
    importe: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    estado: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    proveedor: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    pedido_proveedor_realizado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    numero_pedido_cliente: Mapped[str | None] = mapped_column(String(120), nullable=True)
    codigo_cliente_factusol: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fecha_medicion: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_recepcion_mercancia: Mapped[Date | None] = mapped_column(Date, nullable=True)
    plazo_confeccion: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_entrega_cliente: Mapped[Date | None] = mapped_column(Date, nullable=True)
    numero_pedido_proveedor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    fecha_pedido_proveedor: Mapped[Date | None] = mapped_column(Date, nullable=True)
    plazo_proveedor: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_prevista_entrega: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_estimacion_termino: Mapped[Date | None] = mapped_column(Date, nullable=True)
    responsable_actual: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    siguiente_accion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha_limite_siguiente_accion: Mapped[Date | None] = mapped_column(Date, nullable=True)
    incidencia: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    descripcion_incidencia: Mapped[str | None] = mapped_column(Text, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo_cancelacion_rechazo: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_cancelacion_rechazo: Mapped[Date | None] = mapped_column(Date, nullable=True)
    archivado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    archivado_en: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archivado_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    motivo_archivado: Mapped[str | None] = mapped_column(Text, nullable=True)
    prioridad_calculada: Mapped[str] = mapped_column(String(40), nullable=False, default="Verde", index=True)
    dias_parado: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fecha_ultima_actualizacion: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actualizado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    etiquetas: Mapped[str | None] = mapped_column(Text, nullable=True)

    comentarios: Mapped[list["Comentario"]] = relationship(back_populates="presupuesto", cascade="all, delete-orphan")
    historial: Mapped[list["HistorialCambio"]] = relationship(back_populates="presupuesto", cascade="all, delete-orphan")
    pedidos: Mapped[list["PedidoProveedor"]] = relationship(back_populates="presupuesto", cascade="all, delete-orphan")
    proveedores_asociados: Mapped[list["PresupuestoProveedor"]] = relationship(back_populates="presupuesto", cascade="all, delete-orphan")


class PedidoProveedor(Base):
    __tablename__ = "pedidos_proveedor"
    __table_args__ = (
        CheckConstraint(
            "estado_entrega IN ('pendiente','parcial','completado')",
            name="ck_estado_entrega_valid"
        ),
        CheckConstraint("importe IS NULL OR importe >= 0", name="ck_pedido_importe_no_negativo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    presupuesto_id: Mapped[int] = mapped_column(ForeignKey("presupuestos.id", ondelete="CASCADE"), index=True)
    proveedor_id: Mapped[int | None] = mapped_column(ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True, index=True)
    proveedor: Mapped[str] = mapped_column(String(255), nullable=False)
    proveedor_nombre_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    numero_pedido: Mapped[str | None] = mapped_column(String(120), nullable=True)
    fecha_pedido: Mapped[Date | None] = mapped_column(Date, nullable=True)
    importe: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    estado_entrega: Mapped[str] = mapped_column(String(40), nullable=False, default="pendiente")
    fecha_entrega_prevista: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_entrega_real: Mapped[Date | None] = mapped_column(Date, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actualizado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    presupuesto: Mapped[Presupuesto] = relationship(back_populates="pedidos")
    proveedor_catalogo: Mapped["Proveedor | None"] = relationship(back_populates="pedidos")


class Comentario(Base):
    __tablename__ = "comentarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    presupuesto_id: Mapped[int] = mapped_column(ForeignKey("presupuestos.id", ondelete="CASCADE"), index=True)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    nombre_opcional: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    usuario_nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usuario_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    presupuesto: Mapped[Presupuesto] = relationship(back_populates="comentarios")

class HistorialCambio(Base):
    __tablename__ = "historial_cambios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    presupuesto_id: Mapped[int] = mapped_column(ForeignKey("presupuestos.id", ondelete="CASCADE"), index=True)
    campo: Mapped[str] = mapped_column(String(120), nullable=False)
    valor_anterior: Mapped[str | None] = mapped_column(Text, nullable=True)
    valor_nuevo: Mapped[str | None] = mapped_column(Text, nullable=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    nombre_opcional: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    usuario_nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usuario_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    presupuesto: Mapped[Presupuesto] = relationship(back_populates="historial")

class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        UniqueConstraint("email", name="uq_usuario_email"),
        CheckConstraint("rol IN ('admin_sistema','gestion')", name="ck_usuario_rol_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    aprobado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    aprobado_en: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aprobado_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    puede_gestionar_sistema: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    rol: Mapped[str] = mapped_column(String(40), nullable=False, default="gestion", server_default="gestion", index=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ultimo_login: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    preferencias: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class EmailNotificationLog(Base):
    __tablename__ = "email_notification_logs"
    __table_args__ = (UniqueConstraint("fingerprint", name="uq_email_notification_fingerprint"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    presupuesto_id: Mapped[int | None] = mapped_column(ForeignKey("presupuestos.id", ondelete="SET NULL"), nullable=True, index=True)
    tipo: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    sent_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    __table_args__ = (UniqueConstraint("ip", "email", name="uq_login_attempt_ip_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    window_start: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class RegistrationAttempt(Base):
    __tablename__ = "registration_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False, unique=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    window_start: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class InAppNotification(Base):
    __tablename__ = "in_app_notifications"
    __table_args__ = (UniqueConstraint("fingerprint", name="uq_inapp_notification_fingerprint"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=True, index=True)
    tipo: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    leida: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extra_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Proveedor(Base):
    __tablename__ = "proveedores"
    __table_args__ = (
        Index("ix_proveedores_email", "email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluacion_promedio: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    total_evaluaciones: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actualizado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    evaluaciones: Mapped[list["EvaluacionProveedor"]] = relationship(back_populates="proveedor", cascade="all, delete-orphan")
    presupuestos_asociados: Mapped[list["PresupuestoProveedor"]] = relationship(back_populates="proveedor", cascade="all, delete-orphan")
    pedidos: Mapped[list["PedidoProveedor"]] = relationship(back_populates="proveedor_catalogo")


class EvaluacionProveedor(Base):
    __tablename__ = "evaluaciones_proveedor"
    __table_args__ = (
        Index("ix_evaluaciones_pedido_id", "pedido_id"),
        CheckConstraint("puntualidad >= 1 AND puntualidad <= 5", name="ck_evaluacion_puntualidad_range"),
        CheckConstraint("calidad >= 1 AND calidad <= 5", name="ck_evaluacion_calidad_range"),
        CheckConstraint("comunicacion >= 1 AND comunicacion <= 5", name="ck_evaluacion_comunicacion_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False, index=True)
    pedido_id: Mapped[int | None] = mapped_column(ForeignKey("pedidos_proveedor.id", ondelete="SET NULL"), nullable=True)
    puntualidad: Mapped[int] = mapped_column(Integer, nullable=False)
    calidad: Mapped[int] = mapped_column(Integer, nullable=False)
    comunicacion: Mapped[int] = mapped_column(Integer, nullable=False)
    comentario: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluado_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    proveedor: Mapped[Proveedor] = relationship(back_populates="evaluaciones")


class PresupuestoProveedor(Base):
    __tablename__ = "presupuestos_proveedores"
    __table_args__ = (
        UniqueConstraint("presupuesto_id", "proveedor_id", name="uq_presupuesto_proveedor"),
        Index("ix_pp_presupuesto_id", "presupuesto_id"),
        Index("ix_pp_proveedor_id", "proveedor_id"),
        CheckConstraint("estado IN ('contactado','cotizacion_recibida','descartado')", name="ck_pp_estado_valid"),
        CheckConstraint("importe_cotizado IS NULL OR importe_cotizado >= 0", name="ck_pp_importe_cotizado_no_negativo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    presupuesto_id: Mapped[int] = mapped_column(ForeignKey("presupuestos.id", ondelete="CASCADE"), nullable=False)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False)
    estado: Mapped[str] = mapped_column(String(40), nullable=False, default="contactado")
    importe_cotizado: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    fecha_cotizacion: Mapped[date | None] = mapped_column(Date, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    presupuesto: Mapped[Presupuesto] = relationship(back_populates="proveedores_asociados")
    proveedor: Mapped[Proveedor] = relationship(back_populates="presupuestos_asociados")
