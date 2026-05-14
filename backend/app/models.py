from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Presupuesto(Base):
    __tablename__ = "presupuestos"
    __table_args__ = (UniqueConstraint("numero_presupuesto", name="uq_numero_presupuesto"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero_presupuesto: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    cliente: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    obra_referencia: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    gestor: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    fecha_presupuesto: Mapped[Date] = mapped_column(Date, nullable=False)
    fecha_envio_cliente: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_aceptacion: Mapped[Date | None] = mapped_column(Date, nullable=True)
    importe: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    estado: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    proveedor: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    pedido_proveedor_realizado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    numero_pedido_proveedor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    fecha_pedido_proveedor: Mapped[Date | None] = mapped_column(Date, nullable=True)
    plazo_proveedor: Mapped[Date | None] = mapped_column(Date, nullable=True)
    fecha_prevista_entrega: Mapped[Date | None] = mapped_column(Date, nullable=True)
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

    comentarios: Mapped[list["Comentario"]] = relationship(back_populates="presupuesto", cascade="all, delete-orphan")
    historial: Mapped[list["HistorialCambio"]] = relationship(back_populates="presupuesto", cascade="all, delete-orphan")

class Comentario(Base):
    __tablename__ = "comentarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    presupuesto_id: Mapped[int] = mapped_column(ForeignKey("presupuestos.id", ondelete="CASCADE"), index=True)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    nombre_opcional: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
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
    usuario_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
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
    __table_args__ = (UniqueConstraint("email", name="uq_usuario_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    aprobado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    aprobado_en: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aprobado_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    puede_gestionar_sistema: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    reset_password_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    reset_password_expira_en: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    creado_en: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ultimo_login: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
