from sqlmodel import Session, select

from ..models import Role, RolePermission, Tenant, User
from ..permissions import Permissions


DEFAULT_ROLES = {
    "Admin": {
        "description": "Full access to all features",
        "permissions": [p.value for p in Permissions],
        "is_default": True,
    },
    "Manager": {
        "description": "Access to day-to-day operations and management",
        "permissions": [
            Permissions.ORDERS_READ,
            Permissions.ORDERS_CREATE,
            Permissions.ORDERS_UPDATE,
            Permissions.ORDERS_CANCEL,
            Permissions.ORDERS_PAY,
            Permissions.PRODUCTS_READ,
            Permissions.PRODUCTS_MANAGE,
            Permissions.INVENTORY_READ,
            Permissions.INVENTORY_MANAGE,
            Permissions.SETTINGS_READ,
            Permissions.USERS_READ,
            Permissions.USERS_MANAGE,
            Permissions.TABLES_READ,
            Permissions.TABLES_MANAGE,
        ],
        "is_default": True,
    },
    "Kitchen": {
        "description": "View orders and products",
        "permissions": [
            Permissions.ORDERS_READ,
            Permissions.ORDERS_UPDATE,
            Permissions.PRODUCTS_READ,
        ],
        "is_default": True,
    },
    "Waiter": {
        "description": "Manage orders and tables",
        "permissions": [
            Permissions.ORDERS_READ,
            Permissions.ORDERS_CREATE,
            Permissions.ORDERS_UPDATE,
            Permissions.TABLES_READ,
            Permissions.TABLES_MANAGE,
            Permissions.PRODUCTS_READ,
        ],
        "is_default": True,
    },
}


def seed_roles_for_tenant(session: Session, tenant_id: int):
    """Create default roles for a tenant if they don't exist."""

    created_roles = {}

    for role_name, role_data in DEFAULT_ROLES.items():
        # Check if role exists
        role = session.exec(
            select(Role).where(
                Role.tenant_id == tenant_id,
                Role.name == role_name,
                Role.is_default == True
            )
        ).first()

        if not role:
            role = Role(
                tenant_id=tenant_id,
                name=role_name,
                description=role_data["description"],
                is_default=True
            )
            session.add(role)
            session.commit()
            session.refresh(role)

            # Add permissions
            for perm in role_data["permissions"]:
                rp = RolePermission(role_id=role.id, permission=perm)
                session.add(rp)
            session.commit()

        created_roles[role_name] = role

    return created_roles


def assign_admin_role_to_existing_users(session: Session, tenant_id: int):
    """Assign Admin role to users who don't have a role."""
    # Get Admin role
    admin_role = session.exec(
        select(Role).where(
            Role.tenant_id == tenant_id,
            Role.name == "Admin",
            Role.is_default == True
        )
    ).first()

    if not admin_role:
        return

    # Get users without role
    users = session.exec(
        select(User).where(
            User.tenant_id == tenant_id,
            User.role_id == None
        )
    ).all()

    for user in users:
        user.role_id = admin_role.id
        session.add(user)

    session.commit()


def seed_all_tenants(session: Session):
    """Seed roles for all existing tenants and fix user roles."""
    tenants = session.exec(select(Tenant)).all()
    for tenant in tenants:
        seed_roles_for_tenant(session, tenant.id)
        assign_admin_role_to_existing_users(session, tenant.id)
