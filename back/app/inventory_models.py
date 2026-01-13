"""
Inventory Module Models

Enterprise-grade inventory management with:
- Unit of measure with automatic conversion
- FIFO batch tracking for costing
- Purchase order workflow
- Recipe/BOM management
- Full audit trail
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import Numeric
from sqlmodel import Field, Relationship, SQLModel

from .models import TenantMixin


# ============ ENUMS ============

class UnitOfMeasure(str, Enum):
    """Standard units of measure with conversion support"""
    # Count
    piece = "piece"
    
    # Weight (base: gram)
    gram = "gram"
    kilogram = "kilogram"
    ounce = "ounce"
    pound = "pound"
    
    # Volume (base: milliliter)
    milliliter = "milliliter"
    liter = "liter"
    fluid_ounce = "fluid_ounce"
    cup = "cup"
    gallon = "gallon"


# Unit conversion factors to base units (gram for weight, milliliter for volume)
UNIT_CONVERSIONS: dict[UnitOfMeasure, tuple[str, Decimal]] = {
    # (base_type, factor_to_base)
    UnitOfMeasure.piece: ("count", Decimal("1")),
    
    # Weight -> grams
    UnitOfMeasure.gram: ("weight", Decimal("1")),
    UnitOfMeasure.kilogram: ("weight", Decimal("1000")),
    UnitOfMeasure.ounce: ("weight", Decimal("28.3495")),
    UnitOfMeasure.pound: ("weight", Decimal("453.592")),
    
    # Volume -> milliliters
    UnitOfMeasure.milliliter: ("volume", Decimal("1")),
    UnitOfMeasure.liter: ("volume", Decimal("1000")),
    UnitOfMeasure.fluid_ounce: ("volume", Decimal("29.5735")),
    UnitOfMeasure.cup: ("volume", Decimal("236.588")),
    UnitOfMeasure.gallon: ("volume", Decimal("3785.41")),
}


def convert_units(
    quantity: Decimal,
    from_unit: UnitOfMeasure,
    to_unit: UnitOfMeasure
) -> Decimal:
    """
    Convert quantity from one unit to another.
    Raises ValueError if units are incompatible (e.g., weight to volume).
    """
    if from_unit == to_unit:
        return quantity
    
    from_type, from_factor = UNIT_CONVERSIONS[from_unit]
    to_type, to_factor = UNIT_CONVERSIONS[to_unit]
    
    if from_type != to_type:
        raise ValueError(
            f"Cannot convert between {from_type} ({from_unit.value}) "
            f"and {to_type} ({to_unit.value})"
        )
    
    # Convert: source -> base -> target
    base_quantity = quantity * from_factor
    return base_quantity / to_factor


def get_unit_type(unit: UnitOfMeasure) -> str:
    """Get the unit type (count, weight, volume)"""
    return UNIT_CONVERSIONS[unit][0]


class TransactionType(str, Enum):
    """Types of inventory movements"""
    purchase = "purchase"          # Goods received from supplier
    sale = "sale"                  # Auto-deducted on order (COGS)
    adjustment_add = "adjustment_add"      # Manual positive adjustment
    adjustment_subtract = "adjustment_subtract"  # Manual negative adjustment
    waste = "waste"                # Spoilage, breakage, theft
    transfer_in = "transfer_in"    # Transfer between locations (future)
    transfer_out = "transfer_out"


class PurchaseOrderStatus(str, Enum):
    """Purchase order lifecycle states"""
    draft = "draft"                      # Being prepared
    submitted = "submitted"              # Sent to supplier
    approved = "approved"                # Approved for receiving
    partially_received = "partially_received"  # Some items received
    received = "received"                # Fully received
    cancelled = "cancelled"


class InventoryCategory(str, Enum):
    """Common inventory categories"""
    ingredients = "ingredients"
    beverages = "beverages"
    packaging = "packaging"
    cleaning = "cleaning"
    equipment = "equipment"
    other = "other"


# ============ CORE MODELS ============

class InventoryItem(TenantMixin, table=True):
    """
    Raw materials, ingredients, and supplies.
    Core entity for inventory tracking.
    """
    __tablename__ = "inventory_item"
    
    id: int | None = Field(default=None, primary_key=True)
    
    # Identification
    sku: str = Field(index=True)  # Internal SKU code
    name: str = Field(index=True)
    description: str | None = None
    
    # Unit of measure (base unit for this item)
    unit: UnitOfMeasure = Field(default=UnitOfMeasure.piece)
    
    # Stock management thresholds
    reorder_level: Decimal = Field(
        default=Decimal("0"),
        sa_type=Numeric(12, 4),
        description="Alert when stock falls to this level"
    )
    reorder_quantity: Decimal = Field(
        default=Decimal("0"),
        sa_type=Numeric(12, 4),
        description="Suggested quantity to reorder"
    )
    
    # Current stock (denormalized for performance, updated via transactions)
    current_quantity: Decimal = Field(
        default=Decimal("0"),
        sa_type=Numeric(12, 4)
    )
    
    # Average cost (weighted average, for quick reference)
    average_cost_cents: int = Field(default=0)
    
    # Categorization
    category: InventoryCategory = Field(
        default=InventoryCategory.ingredients,
        index=True
    )
    
    # Default supplier (optional quick reference)
    default_supplier_id: int | None = Field(
        default=None,
        foreign_key="supplier.id",
        index=True
    )
    
    # Status flags
    is_active: bool = Field(default=True, index=True)
    is_deleted: bool = Field(default=False, index=True)
    
    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Relationships
    batches: list["InventoryBatch"] = Relationship(back_populates="inventory_item")
    transactions: list["InventoryTransaction"] = Relationship(back_populates="inventory_item")
    recipe_usages: list["ProductRecipe"] = Relationship(back_populates="inventory_item")


class InventoryBatch(TenantMixin, table=True):
    """
    Individual receipt batches for FIFO costing.
    Each goods receipt creates a new batch.
    Consumed in order (oldest first) for accurate COGS.
    """
    __tablename__ = "inventory_batch"
    
    id: int | None = Field(default=None, primary_key=True)
    
    inventory_item_id: int = Field(
        foreign_key="inventory_item.id",
        index=True
    )
    
    # Receipt reference
    purchase_order_id: int | None = Field(
        default=None,
        foreign_key="purchase_order.id",
        index=True
    )
    
    # Batch details
    batch_number: str | None = None  # Optional external batch/lot number
    received_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Quantities for FIFO tracking
    quantity_received: Decimal = Field(sa_type=Numeric(12, 4))
    quantity_remaining: Decimal = Field(sa_type=Numeric(12, 4))
    
    # Cost at time of receipt (per unit in item's base unit)
    cost_per_unit_cents: int
    
    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Relationships
    inventory_item: InventoryItem = Relationship(back_populates="batches")
    purchase_order: "PurchaseOrder" = Relationship(back_populates="batches")


class ProductRecipe(TenantMixin, table=True):
    """
    Bill of Materials - links sellable products to inventory ingredients.
    Defines how much of each inventory item is consumed per product unit sold.
    """
    __tablename__ = "product_recipe"
    
    id: int | None = Field(default=None, primary_key=True)
    
    # Product being composed
    product_id: int = Field(foreign_key="product.id", index=True)
    
    # Ingredient used
    inventory_item_id: int = Field(foreign_key="inventory_item.id", index=True)
    
    # Quantity of ingredient per unit of product
    quantity_required: Decimal = Field(sa_type=Numeric(12, 4))
    
    # Unit for the quantity (auto-converted to item's base unit)
    unit: UnitOfMeasure
    
    # Waste factor (e.g., 10% = Decimal("10.00") for trimming loss)
    waste_percentage: Decimal = Field(
        default=Decimal("0"),
        sa_type=Numeric(5, 2)
    )
    
    # Optional notes (e.g., "diced", "melted")
    notes: str | None = None
    
    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Relationships
    inventory_item: InventoryItem = Relationship(back_populates="recipe_usages")


class Supplier(TenantMixin, table=True):
    """
    External vendors for inventory purchases.
    Distinct from Provider (which is for product catalog sourcing).
    """
    __tablename__ = "supplier"
    
    id: int | None = Field(default=None, primary_key=True)
    
    # Basic info
    name: str = Field(index=True)
    code: str | None = Field(default=None, index=True)  # Vendor code
    
    # Contact details
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    
    # Terms
    payment_terms: str | None = None  # E.g., "Net 30", "COD"
    lead_time_days: int | None = None  # Average delivery time
    minimum_order_cents: int | None = None  # Minimum order value
    
    # Notes
    notes: str | None = None
    
    # Status
    is_active: bool = Field(default=True, index=True)
    is_deleted: bool = Field(default=False, index=True)
    
    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Relationships
    purchase_orders: list["PurchaseOrder"] = Relationship(back_populates="supplier")


class PurchaseOrder(TenantMixin, table=True):
    """
    Purchase orders to suppliers.
    Full workflow: draft -> submitted -> approved -> received
    """
    __tablename__ = "purchase_order"
    
    id: int | None = Field(default=None, primary_key=True)
    
    # Order identification
    order_number: str = Field(unique=True, index=True)  # Auto: PO-YYYYMMDD-XXXX
    
    # Supplier
    supplier_id: int = Field(foreign_key="supplier.id", index=True)
    
    # Status
    status: PurchaseOrderStatus = Field(
        default=PurchaseOrderStatus.draft,
        index=True
    )
    
    # Dates
    order_date: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    expected_date: date | None = None
    received_date: datetime | None = None
    
    # Totals (calculated from items)
    subtotal_cents: int = Field(default=0)
    tax_cents: int = Field(default=0)
    total_cents: int = Field(default=0)
    
    # Additional info
    notes: str | None = None
    
    # Audit
    created_by_id: int = Field(foreign_key="user.id")
    
    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Relationships
    supplier: Supplier = Relationship(back_populates="purchase_orders")
    items: list["PurchaseOrderItem"] = Relationship(back_populates="purchase_order")
    batches: list[InventoryBatch] = Relationship(back_populates="purchase_order")


class PurchaseOrderItem(SQLModel, table=True):
    """
    Line items on a purchase order.
    Tracks ordered vs received quantities.
    """
    __tablename__ = "purchase_order_item"
    
    id: int | None = Field(default=None, primary_key=True)
    
    purchase_order_id: int = Field(
        foreign_key="purchase_order.id",
        index=True
    )
    inventory_item_id: int = Field(
        foreign_key="inventory_item.id",
        index=True
    )
    
    # Quantities
    quantity_ordered: Decimal = Field(sa_type=Numeric(12, 4))
    quantity_received: Decimal = Field(
        default=Decimal("0"),
        sa_type=Numeric(12, 4)
    )
    
    # Unit for this line item (may differ from item's base unit)
    unit: UnitOfMeasure
    
    # Cost per unit (in the specified unit)
    unit_cost_cents: int
    
    # Line total (calculated: quantity_ordered * unit_cost_cents)
    line_total_cents: int = Field(default=0)
    
    # Relationships
    purchase_order: PurchaseOrder = Relationship(back_populates="items")


class InventoryTransaction(TenantMixin, table=True):
    """
    Immutable audit log of all stock movements.
    Every change to inventory creates a transaction record.
    """
    __tablename__ = "inventory_transaction"
    
    id: int | None = Field(default=None, primary_key=True)
    
    inventory_item_id: int = Field(
        foreign_key="inventory_item.id",
        index=True
    )
    
    # Batch used (for FIFO tracking on outgoing transactions)
    batch_id: int | None = Field(
        default=None,
        foreign_key="inventory_batch.id",
        index=True
    )
    
    # Transaction details
    transaction_type: TransactionType = Field(index=True)
    
    # Quantity (positive for additions, negative for deductions)
    quantity: Decimal = Field(sa_type=Numeric(12, 4))
    unit: UnitOfMeasure  # Unit of the transaction
    
    # Cost information (FIFO cost at transaction time, in cents)
    unit_cost_cents: int | None = None
    total_cost_cents: int | None = None
    
    # Running balance after this transaction (in item's base unit)
    balance_after: Decimal = Field(sa_type=Numeric(12, 4))
    
    # References
    order_id: int | None = Field(
        default=None,
        foreign_key="order.id",
        index=True
    )
    purchase_order_id: int | None = Field(
        default=None,
        foreign_key="purchase_order.id",
        index=True
    )
    
    # Audit trail
    notes: str | None = None
    created_by_id: int | None = Field(
        default=None,
        foreign_key="user.id"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    # Relationships
    inventory_item: InventoryItem = Relationship(back_populates="transactions")


# ============ REQUEST/RESPONSE SCHEMAS ============

class InventoryItemCreate(SQLModel):
    """Schema for creating an inventory item"""
    sku: str
    name: str
    description: str | None = None
    unit: UnitOfMeasure = UnitOfMeasure.piece
    reorder_level: Decimal = Decimal("0")
    reorder_quantity: Decimal = Decimal("0")
    category: InventoryCategory = InventoryCategory.ingredients
    default_supplier_id: int | None = None


class InventoryItemUpdate(SQLModel):
    """Schema for updating an inventory item"""
    sku: str | None = None
    name: str | None = None
    description: str | None = None
    unit: UnitOfMeasure | None = None
    reorder_level: Decimal | None = None
    reorder_quantity: Decimal | None = None
    category: InventoryCategory | None = None
    default_supplier_id: int | None = None
    is_active: bool | None = None


class StockAdjustment(SQLModel):
    """Schema for manual stock adjustment"""
    quantity: Decimal
    unit: UnitOfMeasure
    adjustment_type: TransactionType  # adjustment_add, adjustment_subtract, or waste
    notes: str | None = None


class SupplierCreate(SQLModel):
    """Schema for creating a supplier"""
    name: str
    code: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    payment_terms: str | None = None
    lead_time_days: int | None = None
    minimum_order_cents: int | None = None
    notes: str | None = None


class SupplierUpdate(SQLModel):
    """Schema for updating a supplier"""
    name: str | None = None
    code: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    payment_terms: str | None = None
    lead_time_days: int | None = None
    minimum_order_cents: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class PurchaseOrderItemCreate(SQLModel):
    """Schema for a line item when creating PO"""
    inventory_item_id: int
    quantity_ordered: Decimal
    unit: UnitOfMeasure
    unit_cost_cents: int


class PurchaseOrderCreate(SQLModel):
    """Schema for creating a purchase order"""
    supplier_id: int
    expected_date: date | None = None
    notes: str | None = None
    items: list[PurchaseOrderItemCreate]


class PurchaseOrderUpdate(SQLModel):
    """Schema for updating a purchase order (while in draft)"""
    supplier_id: int | None = None
    expected_date: date | None = None
    notes: str | None = None


class ReceivedItemInput(SQLModel):
    """Schema for receiving a single line item"""
    purchase_order_item_id: int
    quantity_received: Decimal
    unit_cost_cents: int | None = None  # Override if different from PO


class ReceiveGoodsInput(SQLModel):
    """Schema for receiving goods against a PO"""
    items: list[ReceivedItemInput]
    notes: str | None = None


class ProductRecipeItemCreate(SQLModel):
    """Schema for a single recipe ingredient"""
    inventory_item_id: int
    quantity_required: Decimal
    unit: UnitOfMeasure
    waste_percentage: Decimal = Decimal("0")
    notes: str | None = None


class ProductRecipeUpdate(SQLModel):
    """Schema for updating a product's entire recipe"""
    items: list[ProductRecipeItemCreate]


# ============ RESPONSE SCHEMAS ============

class InventoryItemResponse(SQLModel):
    """Response schema for inventory item with stock info"""
    id: int
    sku: str
    name: str
    description: str | None
    unit: str  # Serialize as string, not Enum
    reorder_level: float  # Use float for proper JSON serialization
    reorder_quantity: float
    current_quantity: float
    average_cost_cents: int
    category: str  # Serialize as string, not Enum
    default_supplier_id: int | None
    is_active: bool
    is_low_stock: bool  # Calculated: current_quantity <= reorder_level
    created_at: datetime
    updated_at: datetime


class StockLevelResponse(SQLModel):
    """Response for stock level dashboard"""
    id: int
    sku: str
    name: str
    unit: str  # Serialize as string
    current_quantity: float  # Use float for proper JSON serialization
    reorder_level: float
    average_cost_cents: int
    total_value_cents: int  # current_quantity * average_cost
    is_low_stock: bool
    category: str  # Serialize as string


class ProductCostResponse(SQLModel):
    """Response for product theoretical cost"""
    product_id: int
    product_name: str
    ingredients: list[dict]  # [{name, quantity, unit, cost_cents}]
    total_cost_cents: int
    cost_per_unit_cents: int


class InventoryValuationResponse(SQLModel):
    """Response for FIFO inventory valuation report"""
    as_of_date: datetime
    items: list[dict]  # [{item_id, name, quantity, fifo_value_cents}]
    total_value_cents: int
