from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from . import models, security
from .db import get_session
from .permissions import Permissions, PermissionService
from .security import PermissionChecker
from .models import User, Role

router = APIRouter()


@router.get("/users", response_model=list[models.UserReadWithPermissions])
def list_users(
    current_user: Annotated[User, Depends(PermissionChecker(Permissions.USERS_READ))],
    session: Session = Depends(get_session),
):
    """List all users for the tenant."""
    users = session.exec(
        select(User).where(User.tenant_id == current_user.tenant_id)
    ).all()

    result = []
    for user in users:
        # Get permissions and role name
        perms = PermissionService.get_user_permissions(session, user)
        role_name = user.role.name if user.role else None

        user_dict = user.model_dump()
        user_dict["permissions"] = list(perms)
        user_dict["role_name"] = role_name
        result.append(models.UserReadWithPermissions(**user_dict))

    return result


@router.put("/users/{user_id}", response_model=models.UserReadWithPermissions)
def update_user(
    user_id: int,
    user_update: models.UserUpdate,
    current_user: Annotated[User, Depends(PermissionChecker(Permissions.USERS_MANAGE))],
    session: Session = Depends(get_session),
):
    """Update a user (including role assignment)."""
    user = session.exec(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_update.full_name is not None:
        user.full_name = user_update.full_name

    if user_update.role_id is not None:
        # Verify role exists and belongs to tenant
        role = session.exec(
            select(Role).where(
                Role.id == user_update.role_id, Role.tenant_id == current_user.tenant_id
            )
        ).first()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role_id = user_update.role_id

    if user_update.password:
        user.hashed_password = security.get_password_hash(user_update.password)

    session.add(user)
    session.commit()
    session.refresh(user)

    # Reload role for response
    if user.role_id:
        user.role = session.get(Role, user.role_id)

    perms = PermissionService.get_user_permissions(session, user)
    role_name = user.role.name if user.role else None

    user_dict = user.model_dump()
    user_dict["permissions"] = list(perms)
    user_dict["role_name"] = role_name

    return models.UserReadWithPermissions(**user_dict)
