from enum import Enum
from typing import List, Set

from sqlmodel import Session, select

from .models import Role, RolePermission, User


class Permissions(str, Enum):
    # Orders
    ORDERS_READ = "orders:read"
    ORDERS_CREATE = "orders:create"
    ORDERS_UPDATE = "orders:update"
    ORDERS_CANCEL = "orders:cancel"
    ORDERS_PAY = "orders:pay"

    # Products / Menu
    PRODUCTS_READ = "products:read"
    PRODUCTS_MANAGE = "products:manage"  # Create, Update, Delete

    # Inventory
    INVENTORY_READ = "inventory:read"
    INVENTORY_MANAGE = "inventory:manage"

    # Settings (Business Profile, Stripe)
    SETTINGS_READ = "settings:read"
    SETTINGS_MANAGE = "settings:manage"

    # Users & Roles
    USERS_READ = "users:read"
    USERS_MANAGE = "users:manage"
    ROLES_MANAGE = "roles:manage"

    # Floors & Tables
    TABLES_READ = "tables:read"
    TABLES_MANAGE = "tables:manage"


class PermissionService:
    @staticmethod
    def get_user_permissions(session: Session, user: User) -> Set[str]:
        """Get all permissions for a user based on their role."""
        if not user.role_id:
            return set()

        # Check if role is loaded, if not load it
        if not user.role:
            user.role = session.get(Role, user.role_id)

        if not user.role:
            return set()

        # Get permissions
        # If the role relations are not loaded, we might need to query
        statement = select(RolePermission.permission).where(RolePermission.role_id == user.role_id)
        permissions = session.exec(statement).all()

        return set(permissions)

    @staticmethod
    def has_permission(session: Session, user: User, required_permission: str) -> bool:
        """Check if user has specific permission."""
        perms = PermissionService.get_user_permissions(session, user)
        return required_permission in perms
