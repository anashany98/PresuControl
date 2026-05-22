"""Add usuario rol for two-role RBAC

Revision ID: 0013_add_usuario_rol
Revises: 0012_eval_constraints
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0013_add_usuario_rol"
down_revision: Union[str, None] = "0012_eval_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("usuarios", sa.Column("rol", sa.String(length=40), nullable=False, server_default="gestion"))
    op.execute("UPDATE usuarios SET rol = CASE WHEN puede_gestionar_sistema THEN 'admin_sistema' ELSE 'gestion' END")
    op.create_index("ix_usuarios_rol", "usuarios", ["rol"])
    op.create_check_constraint("ck_usuario_rol_valid", "usuarios", "rol IN ('admin_sistema','gestion')")


def downgrade() -> None:
    op.drop_constraint("ck_usuario_rol_valid", "usuarios", type_="check")
    op.drop_index("ix_usuarios_rol", table_name="usuarios")
    op.drop_column("usuarios", "rol")
