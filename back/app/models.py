from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from sqlmodel import Field, Relationship, SQLModel


class OrderStatus(str, Enum):
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    partially_delivered = "partially_delivered"  # Some items delivered, some not
    paid = "paid"
    completed = "completed"
    cancelled = "cancelled"


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
    
    # Inventory Management
    inventory_tracking_enabled: bool = Field(default=False)  # Enable auto-deduction on orders

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
    category: str | None = Field(default=None, index=True)  # Main category: "Starters", "Main Course", "Desserts", "Beverages", "Sides"
    subcategory: str | None = Field(default=None, index=True)  # Subcategory: "Red Wine", "Appetizers", etc.


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
    wine_category_id: str | None = None  # Category ID from provider API (e.g., "18010" for Red Wine, "18011" for White Wine)
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


class Floor(TenantMixin, table=True):
    """Restaurant floor/zone for canvas layout (e.g., Main Floor, Terrace, VIP)"""
    id: int | None = Field(default=None, primary_key=True)
    name: str  # e.g., "Main Floor", "Terrace"
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Table(TenantMixin, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str  # e.g., "Table 5"
    token: str = Field(default_factory=lambda: str(uuid4()), unique=True, index=True)
    # Canvas layout properties
    floor_id: int | None = Field(default=None, foreign_key="floor.id")
    x_position: float = Field(default=0)
    y_position: float = Field(default=0)
    rotation: float = Field(default=0)
    shape: str = Field(default="rectangle")  # rectangle, circle, oval
    width: float = Field(default=100)
    height: float = Field(default=60)
    seat_count: int = Field(default=4)


class Order(TenantMixin, table=True):
    id: int | None = Field(default=None, primary_key=True)
    table_id: int = Field(foreign_key="table.id")
    status: OrderStatus = Field(default=OrderStatus.pending)
    notes: str | None = None  # General order notes
    session_id: str | None = Field(default=None, index=True)  # Unique session identifier per browser
    customer_name: str | None = Field(default=None, index=True)  # Optional customer name for restaurant staff
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Cancellation tracking
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None  # 'customer' or 'staff'
    
    # Payment tracking
    paid_at: datetime | None = None
    paid_by_user_id: int | None = None  # Who marked it as paid (staff)
    payment_method: str | None = None  # 'stripe', 'cash', 'terminal', etc.
    
    items: list["OrderItem"] = Relationship(back_populates="order")


class OrderItemStatus(str, Enum):
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    delivered = "delivered"
    cancelled = "cancelled"


class OrderItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="order.id")
    product_id: int = Field(foreign_key="product.id")
    product_name: str  # Snapshot of product name at order time
    quantity: int
    price_cents: int  # Snapshot of price at order time
    notes: str | None = None  # Item-specific notes (e.g., "no onions")
    
    # Item-level status tracking
    status: OrderItemStatus = Field(default=OrderItemStatus.pending, index=True)
    status_updated_at: datetime | None = None
    prepared_by_user_id: int | None = None  # Who marked it as ready
    delivered_by_user_id: int | None = None  # Who delivered it
    
    # Soft delete fields (NEVER actually delete)
    removed_by_customer: bool = Field(default=False, index=True)
    removed_at: datetime | None = None
    removed_reason: str | None = None
    removed_by_user_id: int | None = None  # If removed by staff
    
    # Audit fields for modifications
    modified_by_user_id: int | None = None  # Who modified this item (staff)
    modified_at: datetime | None = None  # When was it modified
    cancelled_reason: str | None = None  # Required when cancelling ready items (for tax authorities)
    
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
    category: str | None = None
    subcategory: str | None = None


class TableCreate(SQLModel):
    name: str
    floor_id: int | None = None


class TableUpdate(SQLModel):
    name: str | None = None
    floor_id: int | None = None
    x_position: float | None = None
    y_position: float | None = None
    rotation: float | None = None
    shape: str | None = None
    width: float | None = None
    height: float | None = None
    seat_count: int | None = None


class FloorCreate(SQLModel):
    name: str
    sort_order: int | None = None


class FloorUpdate(SQLModel):
    name: str | None = None
    sort_order: int | None = None


class OrderItemCreate(SQLModel):
    product_id: int
    quantity: int
    notes: str | None = None
    source: str | None = None  # "tenant_product" or "product" to distinguish between TenantProduct and legacy Product


class OrderCreate(SQLModel):
    items: list[OrderItemCreate]
    notes: str | None = None
    session_id: str | None = None  # Session identifier for order isolation
    customer_name: str | None = None  # Optional customer name


class OrderStatusUpdate(SQLModel):
    status: OrderStatus


class OrderItemStatusUpdate(SQLModel):
    status: OrderItemStatus
    user_id: int | None = None  # Optional: who made the change


class OrderItemRemove(SQLModel):
    reason: str | None = None  # Optional reason for removal


class OrderItemUpdate(SQLModel):
    quantity: int


class OrderItemCancel(SQLModel):
    reason: str  # Required reason when cancelling ready items (for tax authorities)


class OrderMarkPaid(SQLModel):
    payment_method: str = "cash"  # 'cash', 'terminal', 'stripe', etc.


class OrderItemStaffUpdate(SQLModel):
    quantity: int | None = None
    notes: str | None = None


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
    inventory_tracking_enabled: bool | None = None


class TenantProductCreate(SQLModel):
    catalog_id: int
    provider_product_id: int | None = None
    name: str | None = None
    price_cents: int | None = None


class TenantProductUpdate(SQLModel):
    name: str | None = None
    price_cents: int | None = None
    is_active: bool | None = None