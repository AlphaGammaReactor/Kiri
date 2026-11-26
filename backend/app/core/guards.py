"""
Kiri — Route guards
"""

from fastapi import HTTPException, status

from app.core.config import settings


async def require_private_data_allowed() -> None:
    """
    Block routes that store a person's own data (file uploads, lab records).

    The hosted test build is for sample and public data only, so these routes
    are refused there. On a person's own computer they work as usual.
    """
    if not settings.uploads_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This is a test build for sample and public data only. Adding your own data is turned off.",
        )
