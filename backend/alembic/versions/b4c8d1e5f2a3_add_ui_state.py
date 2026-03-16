"""Add ui_state column to projects table

Revision ID: b4c8d1e5f2a3
Revises: a3b7c9d2e4f1
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b4c8d1e5f2a3"
down_revision = "a3b7c9d2e4f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("ui_state", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "ui_state")
