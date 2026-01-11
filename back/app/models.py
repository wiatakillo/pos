from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from sqlmodel import Field, Relationship, SQLModel


class OrderStatus(str, Enum):
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    paid = "paid"
    completed = "completed"


class BusinessType(str, Enum):
    restaurant = "restaurant"
    bar = "bar"
    cafe = "cafe"
    retail = "retail"
    service = "service"
    other = "other"


class Tenant(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Business Profile Fields
    business_type: BusinessType | None = Field(default=None)
    description: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    address: str | None = None
    website: str | None = None
    logo_filename: str | None = None  # Stored in uploads/{tenant_id}/logo/
    opening_hours: str | None = None  # JSON string: {"monday": {"open": "09:00", "close": "22:00", "closed": false}, ...}
    immediate_payment_required: bool = Field(default=False)  # Require immediate payment for orders
    currency: str | None = Field(default=None)  # Currency symbol (€, $, £, etc.)
    stripe_secret_key: str | None = Field(default=None)  # Stripe secret key for this tenant
    stripe_publishable_key: str | None = Field(default=None)  # Stripe publishable key for this tenant

    users: list["User"] = Relationship(back_populates="tenant")


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    full_name: str | None = None
    
    tenant_id: int | None = Field(default=None, foreign_key="tenant.id")
    tenant: Tenant | None = Relationship(back_populates="users")


class TenantMixin(SQLModel):
    tenant_id: int = Field(foreign_key="tenant.id")


class Product(TenantMixin, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    price_cents: int
    image_filename: str | None = None  # Stored in uploads/{tenant_id}/products/
    ingredients: str | None = None  # Comma-separated list


# ============ PROVIDER & CATALOG SYSTEM ============

class Provider(SQLModel, table=True):
    """Product providers (wine suppliers, food distributors, etc.)"""
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)  # e.g., "Tusumiller", "Sysco"
    token: str = Field(default_factory=lambda: str(uuid4()), unique=True, index=True)  # Unique hash for secure URL access
    url: str | None = None
    api_endpoint: str | None = None
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductCatalog(SQLModel, table=True):
    """
    Normalized product catalog - same product from different providers links here.
    This is the master product list that restaurants browse.
    """
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str | None = None
    category: str | None = Field(index=True)  # e.g., "Wine", "Food", "Beverage"
    subcategory: str | None = Field(index=True)  # e.g., "Red Wine", "Appetizer"
    barcode: str | None = Field(index=True)  # For product matching across providers
    brand: str | None = None
    # Metadata for matching products across providers
    normalized_name: str | None = Field(index=True)  # Lowercased, normalized for matching
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProviderProduct(SQLModel, table=True):
    """
    Provider-specific product data (prices, images, availability).
    Same ProductCatalog item can have multiple ProviderProduct entries.
    """
    id: int | None = Field(default=None, primary_key=True)
    catalog_id: int = Field(foreign_key="productcatalog.id", index=True)  # Links to normalized product
    provider_id: int = Field(foreign_key="provider.id", index=True)
    external_id: str = Field(index=True)  # ID from provider's system
    name: str  # Provider's name for this product (may differ from catalog)
    price_cents: int | None = None  # Provider's price
    image_url: str | None = None  # Original remote URL
    image_filename: str | None = None  # Local filename stored in uploads/providers/{provider_id}/products/
    availability: bool = Field(default=True, index=True)
    # Additional provider-specific metadata
    country: str | None = None
    region: str | None = None
    grape_variety: str | None = None  # For wines
    volume_ml: int | None = None  # For beverages
    unit: str | None = None  # e.g., "bottle", "case", "kg"
    # Detailed wine information
    detailed_description: str | None = None  # Full detailed description from provider
    wine_style: str | None = None  # e.g., "Afrutados", "Crianza", etc.
    vintage: int | None = None  # Vintage year (anada)
    winery: str | None = None  # Winery/Bodega name
    aromas: str | None = None  # Aromas/flavors (comma-separated)
    elaboration: str | None = None  # Elaboration details (e.g., "Inox", "Barrica")
    # Timestamps for sync
    last_synced_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TenantProduct(SQLModel, table=True):
    """
    Restaurant's selected products with their own pricing.
    Links tenant's Product to ProductCatalog, optionally to a specific ProviderProduct.
    """
    id: int | None = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    catalog_id: int = Field(foreign_key="productcatalog.id", index=True)
    provider_product_id: int | None = Field(default=None, foreign_key="providerproduct.id", index=True)
    # Link to existing Product table for backward compatibility
    product_id: int | None = Field(default=None, foreign_key="product.id", index=True)
    # Restaurant's own data
    name: str  # Restaurant can customize the name
    price_cents: int  # Restaurant's selling price (can add markup)
    image_filename: str | None = None  # Restaurant's own image
    ingredients: str | None = None
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Table(TenantMixin, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str  # e.g., "Table 5"
    token: str = Field(default_factory=lambda: str(uuid4()), unique=True, index=True)


class Order(TenantMixin, table=True):
    id: int | None = Field(default=None, primary_key=True)
    table_id: int = Field(foreign_key="table.id")
    status: OrderStatus = Field(default=OrderStatus.pending)
    notes: str | None = None  # General order notes
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    items: list["OrderItem"] = Relationship(back_populates="order")


class OrderItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="order.id")
    product_id: int = Field(foreign_key="product.id")
    product_name: str  # Snapshot of product name at order time
    quantity: int
    price_cents: int  # Snapshot of price at order time
    notes: str | None = None  # Item-specific notes (e.g., "no onions")
    
    order: Order = Relationship(back_populates="items")


# Request/Response Models
class UserRegister(SQLModel):
    tenant_name: str
    email: str
    password: str
    full_name: str | None = None


class ProductUpdate(SQLModel):
    name: str | None = None
    price_cents: int | None = None
    ingredients: str | None = None


class TableCreate(SQLModel):
    name: str


class OrderItemCreate(SQLModel):
    product_id: int
    quantity: int
    notes: str | None = None


class OrderCreate(SQLModel):
    items: list[OrderItemCreate]
    notes: str | None = None


class OrderStatusUpdate(SQLModel):
    status: OrderStatus


class TenantUpdate(SQLModel):
    name: str | None = None
    business_type: BusinessType | None = None
    description: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    address: str | None = None
    website: str | None = None
    opening_hours: str | None = None  # JSON string
    immediate_payment_required: bool | None = None
    currency: str | None = None
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None


class TenantProductCreate(SQLModel):
    catalog_id: int
    provider_product_id: int | None = None
    name: str | None = None
    price_cents: int | None = None


class TenantProductUpdate(SQLModel):
    name: str | None = None
    price_cents: int | None = None
    is_active: bool | None = None