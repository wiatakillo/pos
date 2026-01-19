from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from . import models, security
from .db import get_session
from .permissions import Permissions, PermissionService
from .security import PermissionChecker
from .models import Role, RolePermission, User

router = APIRouter()


@router.get("/roles", response_model=list[models.RoleResponse])
def list_roles(
    current_user: Annotated[User, Depends(security.get_current_user)],
    session: Session = Depends(get_session),
):
    """List all roles for the tenant."""
    # Allow if user has ROLES_MANAGE or USERS_MANAGE
    perms = PermissionService.get_user_permissions(session, current_user)
    if not (Permissions.ROLES_MANAGE in perms or Permissions.USERS_MANAGE in perms):
        raise HTTPException(status_code=403, detail="Not authorized")

    roles = session.exec(
        select(Role).where(Role.tenant_id == current_user.tenant_id)
    ).all()

    result = []
    for role in roles:
        # Get permissions for response
        role_perms = session.exec(
            select(RolePermission.permission).where(RolePermission.role_id == role.id)
        ).all()
        result.append(
            models.RoleResponse(
                id=role.id,
                name=role.name,
                description=role.description,
                is_default=role.is_default,
                permissions=role_perms,
            )
        )
    return result


@router.post("/roles", response_model=models.RoleResponse)
def create_role(
    role_create: models.RoleCreate,
    current_user: Annotated[User, Depends(PermissionChecker(Permissions.ROLES_MANAGE))],
    session: Session = Depends(get_session),
):
    """Create a new custom role."""
    role = Role(
        tenant_id=current_user.tenant_id,
        name=role_create.name,
        description=role_create.description,
        is_default=False,
    )
    session.add(role)
    session.commit()
    session.refresh(role)

    # Add permissions
    for perm in role_create.permissions:
        rp = RolePermission(role_id=role.id, permission=perm)
        session.add(rp)
    session.commit()

    return models.RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_default=role.is_default,
        permissions=role_create.permissions,
    )


@router.put("/roles/{role_id}", response_model=models.RoleResponse)
def update_role(
    role_id: int,
    role_update: models.RoleUpdate,
    current_user: Annotated[User, Depends(PermissionChecker(Permissions.ROLES_MANAGE))],
    session: Session = Depends(get_session),
):
    """Update a custom role."""
    role = session.exec(
        select(Role).where(Role.id == role_id, Role.tenant_id == current_user.tenant_id)
    ).first()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_default:
        raise HTTPException(status_code=400, detail="Cannot edit default roles")

    if role_update.name is not None:
        role.name = role_update.name
    if role_update.description is not None:
        role.description = role_update.description

    session.add(role)

    if role_update.permissions is not None:
        # Clear existing
        existing = session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).all()
        for rp in existing:
            session.delete(rp)

        # Add new
        for perm in role_update.permissions:
            rp = RolePermission(role_id=role.id, permission=perm)
            session.add(rp)

    session.commit()
    session.refresh(role)

    # Get permissions
    role_perms = session.exec(
        select(RolePermission.permission).where(RolePermission.role_id == role.id)
    ).all()

    return models.RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_default=role.is_default,
        permissions=role_perms,
    )


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    current_user: Annotated[User, Depends(PermissionChecker(Permissions.ROLES_MANAGE))],
    session: Session = Depends(get_session),
):
    """Delete a custom role."""
    role = session.exec(
        select(Role).where(Role.id == role_id, Role.tenant_id == current_user.tenant_id)
    ).first()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default roles")

    session.delete(role)
    session.commit()
    return {"status": "deleted"}


@router.get("/permissions")
def list_permissions(
    current_user: Annotated[User, Depends(security.get_current_user)],
):
    """List all available permissions."""
    return [p.value for p in Permissions]
