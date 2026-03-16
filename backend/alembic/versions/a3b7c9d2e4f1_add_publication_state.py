"""add publication_state to projects

Revision ID: a3b7c9d2e4f1
Revises: cbc481db6949
Create Date: 2026-03-15 20:00:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON


# revision identifiers, used by Alembic.
revision: str = "a3b7c9d2e4f1"
down_revision: Union[str, None] = "cbc481db6949"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("publication_state", JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "publication_state")
