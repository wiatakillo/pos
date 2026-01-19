from datetime import datetime, timedelta, timezone
from contextvars import ContextVar
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.security.utils import get_authorization_scheme_param
from jose import JWTError, jwt
from sqlmodel import Session, select

from .db import get_session
from .models import User, Tenant
from .settings import settings

# Context variable to store the current tenant_id for the request
_tenant_id_ctx = ContextVar("tenant_id", default=None)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)


def get_tenant_id() -> int | None:
    return _tenant_id_ctx.get()


def set_tenant_id(tenant_id: int) -> None:
    _tenant_id_ctx.set(tenant_id)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a refresh token with longer expiry and 'refresh' type.
    Uses separate secret key for additional security.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(
        to_encode, settings.refresh_secret_key, algorithm=settings.algorithm
    )
    return encoded_jwt


async def get_token_from_cookie(
    request: Request,
    token: Annotated[str | None, Depends(oauth2_scheme)]
) -> str:
    """
    Get token from cookie (primary) or Authorization header (fallback).
    """
    # Try getting from cookie first
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token
        
    # Fallback to Authorization header (Bearer token)
    if token:
        return token
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


async def get_current_user(
    token: Annotated[str, Depends(get_token_from_cookie)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        tenant_id: int = payload.get("tenant_id")
        token_version: int = payload.get("token_version", 0)
        if email is None or tenant_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Set the context for the tenant
    set_tenant_id(tenant_id)

    # We might want to verify the user actually exists and belongs to this tenant
    # Note: We filter by the tenant_id from the token to ensure consistency
    statement = select(User).where(User.email == email).where(User.tenant_id == tenant_id)
    user = session.exec(statement).first()
    
    if user is None:
        raise credentials_exception

    # Check token version for revocation support
    if user.token_version != token_version:
        raise credentials_exception
        
    return user


def validate_refresh_token(refresh_token: str, session: Session) -> User:
    """
    Validate a refresh token and return the associated user.
    Raises HTTPException if token is invalid, expired, or revoked.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
    )
    
    if not refresh_token:
        raise credentials_exception
    
    try:
        payload = jwt.decode(
            refresh_token, settings.refresh_secret_key, algorithms=[settings.algorithm]
        )
        
        # Verify this is a refresh token (not an access token)
        if payload.get("type") != "refresh":
            raise credentials_exception
        
        email: str = payload.get("sub")
        tenant_id: int = payload.get("tenant_id")
        token_version: int = payload.get("token_version", 0)
        
        if email is None or tenant_id is None:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception

    # Verify user exists and token version matches
    statement = select(User).where(User.email == email).where(User.tenant_id == tenant_id)
    user = session.exec(statement).first()
    
    if user is None:
        raise credentials_exception

    # Check token version for revocation support
    if user.token_version != token_version:
        raise credentials_exception
    
    return user
