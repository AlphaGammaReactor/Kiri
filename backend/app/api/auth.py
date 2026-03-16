"""
Kiri — Auth API Routes

Endpoints for user registration, login, token refresh, logout, and profile.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone
import collections

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
)
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Brute Force Rate Limiter ──

_FailRecord = collections.namedtuple("_FailRecord", ["count", "locked_until"])
_login_failures: dict[str, _FailRecord] = {}


def _check_rate_limit(email: str) -> None:
    """Raise 429 if the email has exceeded maximum login attempts."""
    record = _login_failures.get(email)
    if record is None:
        return

    now = datetime.now(timezone.utc)
    if record.locked_until and now < record.locked_until:
        remaining = int((record.locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {remaining} minute(s).",
        )

    # Lockout has expired — reset
    if record.locked_until and now >= record.locked_until:
        _login_failures.pop(email, None)


def _record_failure(email: str) -> None:
    """Record a failed login attempt. Lock the account after threshold."""
    record = _login_failures.get(email)
    count = (record.count if record else 0) + 1

    if count >= settings.LOGIN_MAX_ATTEMPTS:
        from datetime import timedelta
        locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        _login_failures[email] = _FailRecord(count=count, locked_until=locked_until)
    else:
        _login_failures[email] = _FailRecord(count=count, locked_until=None)


def _clear_failures(email: str) -> None:
    """Clear failure record on successful login."""
    _login_failures.pop(email, None)


# ── Request / Response Schemas ──

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    invite_code: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str


def _user_dict(user: User) -> dict:
    """Serialize a User ORM instance to a dict."""
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
    }


# ── Endpoints ──

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Create a new user account and return tokens."""
    # Validate invite code
    if body.invite_code != settings.INVITE_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid invite code",
        )

    # Check if email already exists
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Validate password length
    if len(body.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters",
        )

    # Create user
    user = User(
        email=body.email,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()  # Populate user.id

    # Generate tokens
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    # Set refresh token as HTTP-only cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="lax",
        max_age=7 * 24 * 60 * 60,  # 7 days
        path="/api/v1/auth",
    )

    return TokenResponse(access_token=access_token, user=_user_dict(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticate with email and password, return tokens."""
    # Check brute force rate limit
    _check_rate_limit(body.email)

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        _record_failure(body.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Successful login — clear any failure records
    _clear_failures(body.email)

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/v1/auth",
    )

    return TokenResponse(access_token=access_token, user=_user_dict(user))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    """Rotate access token using the refresh token cookie."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    payload = decode_token(refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    from uuid import UUID
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Issue new tokens
    new_access = create_access_token(str(user.id))
    new_refresh = create_refresh_token(str(user.id))

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/v1/auth",
    )

    return TokenResponse(access_token=new_access, user=_user_dict(user))


@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth",
    )
    return {"status": "ok", "message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return UserResponse(**_user_dict(current_user))
