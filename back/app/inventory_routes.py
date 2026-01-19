"""
Inventory API Routes

Complete REST API for inventory management:
- Inventory Items CRUD
- Suppliers CRUD  
- Purchase Orders with full workflow
- Recipe management
- Stock adjustments
- Reporting endpoints
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from .db import get_session
from .security import get_current_user, PermissionChecker
from .permissions import Permissions
from . import models
from .inventory_models import (
    InventoryBatch,
    InventoryCategory,
    InventoryItem,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryTransaction,
    InventoryValuationResponse,
    ProductCostResponse,
    ProductRecipe,
    ProductRecipeItemCreate,
    ProductRecipeUpdate,
    PurchaseOrder,
    PurchaseOrderCreate,
    PurchaseOrderItem,
    PurchaseOrderItemCreate,
    PurchaseOrderStatus,
    PurchaseOrderUpdate,
    ReceiveGoodsInput,
    StockAdjustment,
    StockLevelResponse,
    Supplier,
    SupplierCreate,
    SupplierUpdate,
    TransactionType,
    UnitOfMeasure,
)
from .inventory_service import (
    adjust_stock,
    calculate_fifo_valuation,
    calculate_product_cost,
    generate_po_number,
    get_low_stock_items,
    receive_goods,
)


router = APIRouter()


# ============ INVENTORY ITEMS ============

@router.get("/items", response_model=list[InventoryItemResponse])
def list_inventory_items(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
    category: InventoryCategory | None = None,
    active_only: bool = True,
    search: str | None = None,
):
    """List all inventory items for the tenant"""
    statement = (
        select(InventoryItem)
        .where(InventoryItem.tenant_id == current_user.tenant_id)
        .where(InventoryItem.is_deleted == False)
    )
    
    if active_only:
        statement = statement.where(InventoryItem.is_active == True)
    
    if category:
        statement = statement.where(InventoryItem.category == category)
    
    if search:
        search_pattern = f"%{search}%"
        statement = statement.where(
            (InventoryItem.name.ilike(search_pattern)) |
            (InventoryItem.sku.ilike(search_pattern))
        )
    
    statement = statement.order_by(InventoryItem.name)
    items = session.exec(statement).all()
    
    # Build response with computed fields
    result = []
    for item in items:
        result.append(InventoryItemResponse(
            id=item.id,
            sku=item.sku,
            name=item.name,
            description=item.description,
            unit=item.unit.value if item.unit else "piece",
            reorder_level=float(item.reorder_level),
            reorder_quantity=float(item.reorder_quantity),
            current_quantity=float(item.current_quantity),
            average_cost_cents=item.average_cost_cents,
            category=item.category.value if item.category else "other",
            default_supplier_id=item.default_supplier_id,
            is_active=item.is_active,
            is_low_stock=item.current_quantity <= item.reorder_level,
            created_at=item.created_at,
            updated_at=item.updated_at,
        ))
    
    return result


@router.post("/items", response_model=InventoryItemResponse)
def create_inventory_item(
    item_create: InventoryItemCreate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Create a new inventory item"""
    # Check for duplicate SKU
    existing = session.exec(
        select(InventoryItem)
        .where(InventoryItem.tenant_id == current_user.tenant_id)
        .where(InventoryItem.sku == item_create.sku)
        .where(InventoryItem.is_deleted == False)
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU '{item_create.sku}' already exists")
    
    item = InventoryItem(
        tenant_id=current_user.tenant_id,
        **item_create.model_dump()
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    
    return InventoryItemResponse(
        id=item.id,
        sku=item.sku,
        name=item.name,
        description=item.description,
        unit=item.unit.value if item.unit else "piece",
        reorder_level=float(item.reorder_level),
        reorder_quantity=float(item.reorder_quantity),
        current_quantity=float(item.current_quantity),
        average_cost_cents=item.average_cost_cents,
        category=item.category.value if item.category else "other",
        default_supplier_id=item.default_supplier_id,
        is_active=item.is_active,
        is_low_stock=item.current_quantity <= item.reorder_level,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("/items/{item_id}", response_model=InventoryItemResponse)
def get_inventory_item(
    item_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Get a single inventory item with details"""
    item = session.get(InventoryItem, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id or item.is_deleted:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    return InventoryItemResponse(
        id=item.id,
        sku=item.sku,
        name=item.name,
        description=item.description,
        unit=item.unit.value if item.unit else "piece",
        reorder_level=float(item.reorder_level),
        reorder_quantity=float(item.reorder_quantity),
        current_quantity=float(item.current_quantity),
        average_cost_cents=item.average_cost_cents,
        category=item.category.value if item.category else "other",
        default_supplier_id=item.default_supplier_id,
        is_active=item.is_active,
        is_low_stock=item.current_quantity <= item.reorder_level,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
def update_inventory_item(
    item_id: int,
    item_update: InventoryItemUpdate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Update an inventory item"""
    item = session.get(InventoryItem, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id or item.is_deleted:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Check for duplicate SKU if changing
    if item_update.sku and item_update.sku != item.sku:
        existing = session.exec(
            select(InventoryItem)
            .where(InventoryItem.tenant_id == current_user.tenant_id)
            .where(InventoryItem.sku == item_update.sku)
            .where(InventoryItem.is_deleted == False)
            .where(InventoryItem.id != item_id)
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail=f"SKU '{item_update.sku}' already exists")
    
    # Apply updates
    update_data = item_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    
    return InventoryItemResponse(
        id=item.id,
        sku=item.sku,
        name=item.name,
        description=item.description,
        unit=item.unit.value if item.unit else "piece",
        reorder_level=float(item.reorder_level),
        reorder_quantity=float(item.reorder_quantity),
        current_quantity=float(item.current_quantity),
        average_cost_cents=item.average_cost_cents,
        category=item.category.value if item.category else "other",
        default_supplier_id=item.default_supplier_id,
        is_active=item.is_active,
        is_low_stock=item.current_quantity <= item.reorder_level,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.delete("/items/{item_id}")
def delete_inventory_item(
    item_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Soft delete an inventory item"""
    item = session.get(InventoryItem, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id or item.is_deleted:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    item.is_deleted = True
    item.is_active = False
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    
    return {"status": "deleted", "id": item_id}


@router.post("/items/{item_id}/adjust")
def adjust_inventory_stock(
    item_id: int,
    adjustment: StockAdjustment,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Manual stock adjustment (add, subtract, or waste)"""
    item = session.get(InventoryItem, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id or item.is_deleted:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Validate adjustment type
    valid_types = [
        TransactionType.adjustment_add,
        TransactionType.adjustment_subtract,
        TransactionType.waste
    ]
    if adjustment.adjustment_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid adjustment type. Must be one of: {[t.value for t in valid_types]}"
        )
    
    transaction = adjust_stock(
        session=session,
        inventory_item=item,
        quantity=adjustment.quantity,
        unit=adjustment.unit,
        adjustment_type=adjustment.adjustment_type,
        notes=adjustment.notes,
        created_by_id=current_user.id,
    )
    
    session.commit()
    
    return {
        "status": "adjusted",
        "item_id": item_id,
        "new_quantity": float(item.current_quantity),
        "unit": item.unit.value,
        "transaction_id": transaction.id,
    }


# ============ SUPPLIERS ============

@router.get("/suppliers", response_model=list[Supplier])
def list_suppliers(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
    active_only: bool = True,
):
    """List all suppliers for the tenant"""
    statement = (
        select(Supplier)
        .where(Supplier.tenant_id == current_user.tenant_id)
        .where(Supplier.is_deleted == False)
    )
    
    if active_only:
        statement = statement.where(Supplier.is_active == True)
    
    statement = statement.order_by(Supplier.name)
    return list(session.exec(statement).all())


@router.post("/suppliers", response_model=Supplier)
def create_supplier(
    supplier_create: SupplierCreate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Create a new supplier"""
    supplier = Supplier(
        tenant_id=current_user.tenant_id,
        **supplier_create.model_dump()
    )
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.get("/suppliers/{supplier_id}", response_model=Supplier)
def get_supplier(
    supplier_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Get a single supplier"""
    supplier = session.get(Supplier, supplier_id)
    
    if not supplier or supplier.tenant_id != current_user.tenant_id or supplier.is_deleted:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    return supplier


@router.put("/suppliers/{supplier_id}", response_model=Supplier)
def update_supplier(
    supplier_id: int,
    supplier_update: SupplierUpdate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Update a supplier"""
    supplier = session.get(Supplier, supplier_id)
    
    if not supplier or supplier.tenant_id != current_user.tenant_id or supplier.is_deleted:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    update_data = supplier_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(supplier, key, value)
    
    supplier.updated_at = datetime.now(timezone.utc)
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Soft delete a supplier"""
    supplier = session.get(Supplier, supplier_id)
    
    if not supplier or supplier.tenant_id != current_user.tenant_id or supplier.is_deleted:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    supplier.is_deleted = True
    supplier.is_active = False
    supplier.updated_at = datetime.now(timezone.utc)
    session.add(supplier)
    session.commit()
    
    return {"status": "deleted", "id": supplier_id}


# ============ PURCHASE ORDERS ============

@router.get("/purchase-orders")
def list_purchase_orders(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
    status: PurchaseOrderStatus | None = None,
    supplier_id: int | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    """List purchase orders with optional filters"""
    statement = (
        select(PurchaseOrder)
        .where(PurchaseOrder.tenant_id == current_user.tenant_id)
    )
    
    if status:
        statement = statement.where(PurchaseOrder.status == status)
    
    if supplier_id:
        statement = statement.where(PurchaseOrder.supplier_id == supplier_id)
    
    statement = statement.order_by(PurchaseOrder.created_at.desc())
    statement = statement.offset(offset).limit(limit)
    
    orders = session.exec(statement).all()
    
    # Enrich with supplier name and item count
    result = []
    for order in orders:
        supplier = session.get(Supplier, order.supplier_id)
        items_count = len(order.items) if order.items else 0
        
        result.append({
            "id": order.id,
            "order_number": order.order_number,
            "supplier_id": order.supplier_id,
            "supplier_name": supplier.name if supplier else None,
            "status": order.status.value,
            "order_date": order.order_date.isoformat(),
            "expected_date": order.expected_date.isoformat() if order.expected_date else None,
            "received_date": order.received_date.isoformat() if order.received_date else None,
            "total_cents": order.total_cents,
            "items_count": items_count,
            "notes": order.notes,
        })
    
    return result


@router.post("/purchase-orders")
def create_purchase_order(
    po_create: PurchaseOrderCreate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Create a new purchase order"""
    # Validate supplier
    supplier = session.get(Supplier, po_create.supplier_id)
    if not supplier or supplier.tenant_id != current_user.tenant_id or supplier.is_deleted:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Generate PO number
    order_number = generate_po_number(session, current_user.tenant_id)
    
    # Create PO
    po = PurchaseOrder(
        tenant_id=current_user.tenant_id,
        order_number=order_number,
        supplier_id=po_create.supplier_id,
        expected_date=po_create.expected_date,
        notes=po_create.notes,
        created_by_id=current_user.id,
    )
    session.add(po)
    session.flush()  # Get PO ID
    
    # Add line items
    subtotal = 0
    for item_data in po_create.items:
        # Validate inventory item
        inv_item = session.get(InventoryItem, item_data.inventory_item_id)
        if not inv_item or inv_item.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=404,
                detail=f"Inventory item {item_data.inventory_item_id} not found"
            )
        
        line_total = int(item_data.quantity_ordered * item_data.unit_cost_cents)
        
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            inventory_item_id=item_data.inventory_item_id,
            quantity_ordered=item_data.quantity_ordered,
            unit=item_data.unit,
            unit_cost_cents=item_data.unit_cost_cents,
            line_total_cents=line_total,
        )
        session.add(po_item)
        subtotal += line_total
    
    # Update totals
    po.subtotal_cents = subtotal
    po.total_cents = subtotal  # Tax could be added here
    session.add(po)
    session.commit()
    session.refresh(po)
    
    return {
        "id": po.id,
        "order_number": po.order_number,
        "status": po.status.value,
        "total_cents": po.total_cents,
    }


@router.get("/purchase-orders/{po_id}")
def get_purchase_order(
    po_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Get a purchase order with full details"""
    po = session.get(PurchaseOrder, po_id)
    
    if not po or po.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    supplier = session.get(Supplier, po.supplier_id)
    
    # Get items with inventory item details
    items = []
    for po_item in po.items:
        inv_item = session.get(InventoryItem, po_item.inventory_item_id)
        items.append({
            "id": po_item.id,
            "inventory_item_id": po_item.inventory_item_id,
            "inventory_item_name": inv_item.name if inv_item else None,
            "inventory_item_sku": inv_item.sku if inv_item else None,
            "quantity_ordered": float(po_item.quantity_ordered),
            "quantity_received": float(po_item.quantity_received),
            "unit": po_item.unit.value,
            "unit_cost_cents": po_item.unit_cost_cents,
            "line_total_cents": po_item.line_total_cents,
        })
    
    return {
        "id": po.id,
        "order_number": po.order_number,
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "code": supplier.code,
        } if supplier else None,
        "status": po.status.value,
        "order_date": po.order_date.isoformat(),
        "expected_date": po.expected_date.isoformat() if po.expected_date else None,
        "received_date": po.received_date.isoformat() if po.received_date else None,
        "subtotal_cents": po.subtotal_cents,
        "tax_cents": po.tax_cents,
        "total_cents": po.total_cents,
        "notes": po.notes,
        "items": items,
        "created_at": po.created_at.isoformat(),
        "updated_at": po.updated_at.isoformat(),
    }


@router.put("/purchase-orders/{po_id}")
def update_purchase_order(
    po_id: int,
    po_update: PurchaseOrderUpdate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Update a purchase order (only while in draft status)"""
    po = session.get(PurchaseOrder, po_id)
    
    if not po or po.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if po.status != PurchaseOrderStatus.draft:
        raise HTTPException(
            status_code=400,
            detail="Can only update purchase orders in draft status"
        )
    
    update_data = po_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(po, key, value)
    
    po.updated_at = datetime.now(timezone.utc)
    session.add(po)
    session.commit()
    session.refresh(po)
    
    return {"status": "updated", "id": po.id}


@router.put("/purchase-orders/{po_id}/status")
def update_purchase_order_status(
    po_id: int,
    new_status: PurchaseOrderStatus,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Change purchase order status"""
    po = session.get(PurchaseOrder, po_id)
    
    if not po or po.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    # Validate status transitions
    valid_transitions = {
        PurchaseOrderStatus.draft: [PurchaseOrderStatus.submitted, PurchaseOrderStatus.cancelled],
        PurchaseOrderStatus.submitted: [PurchaseOrderStatus.approved, PurchaseOrderStatus.cancelled],
        PurchaseOrderStatus.approved: [PurchaseOrderStatus.partially_received, PurchaseOrderStatus.received, PurchaseOrderStatus.cancelled],
        PurchaseOrderStatus.partially_received: [PurchaseOrderStatus.received, PurchaseOrderStatus.cancelled],
        PurchaseOrderStatus.received: [],  # Terminal state
        PurchaseOrderStatus.cancelled: [],  # Terminal state
    }
    
    if new_status not in valid_transitions.get(po.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {po.status.value} to {new_status.value}"
        )
    
    po.status = new_status
    po.updated_at = datetime.now(timezone.utc)
    session.add(po)
    session.commit()
    
    return {"status": "updated", "new_status": new_status.value}


@router.post("/purchase-orders/{po_id}/receive")
def receive_purchase_order(
    po_id: int,
    receive_input: ReceiveGoodsInput,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Receive goods against a purchase order (GRN)"""
    po = session.get(PurchaseOrder, po_id)
    
    if not po or po.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    # Must be approved or partially received to receive goods
    if po.status not in [PurchaseOrderStatus.approved, PurchaseOrderStatus.partially_received]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot receive goods for order in {po.status.value} status"
        )
    
    # Convert input to dict format for service
    received_items = [
        {
            "purchase_order_item_id": item.purchase_order_item_id,
            "quantity_received": item.quantity_received,
            "unit_cost_cents": item.unit_cost_cents,
        }
        for item in receive_input.items
    ]
    
    batches = receive_goods(
        session=session,
        purchase_order=po,
        received_items=received_items,
        created_by_id=current_user.id,
        notes=receive_input.notes,
    )
    
    session.commit()
    
    return {
        "status": "received",
        "po_status": po.status.value,
        "batches_created": len(batches),
    }


@router.delete("/purchase-orders/{po_id}")
def cancel_purchase_order(
    po_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Cancel a purchase order (only if not yet received)"""
    po = session.get(PurchaseOrder, po_id)
    
    if not po or po.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if po.status in [PurchaseOrderStatus.received, PurchaseOrderStatus.partially_received]:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel a purchase order that has received goods"
        )
    
    po.status = PurchaseOrderStatus.cancelled
    po.updated_at = datetime.now(timezone.utc)
    session.add(po)
    session.commit()
    
    return {"status": "cancelled", "id": po_id}


@router.get("/purchase-orders/{po_id}/pdf")
def get_purchase_order_pdf(
    po_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Generate a professional PDF for a purchase order"""
    from .pdf_generator import generate_purchase_order_pdf
    
    po = session.get(PurchaseOrder, po_id)
    
    if not po or po.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    try:
        # Get supplier details
        supplier = session.get(Supplier, po.supplier_id)
        supplier_data = {}
        if supplier:
            supplier_data = {
                "name": supplier.name,
                "code": supplier.code,
                "contact_name": supplier.contact_name,
                "phone": supplier.phone,
                "email": supplier.email,
                "address": supplier.address,
            }
        
        # Get line items with inventory item details using explicit query
        po_items = session.exec(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
        ).all()
        
        items = []
        for po_item in po_items:
            inv_item = session.get(InventoryItem, po_item.inventory_item_id)
            items.append({
                "inventory_item_sku": inv_item.sku if inv_item else "-",
                "inventory_item_name": inv_item.name if inv_item else "Unknown Item",
                "quantity_ordered": float(po_item.quantity_ordered),
                "unit": po_item.unit.value if po_item.unit else "piece",
                "unit_cost_cents": po_item.unit_cost_cents or 0,
                "line_total_cents": po_item.line_total_cents or 0,
            })
        
        # Get tenant for company name
        tenant = session.get(models.Tenant, current_user.tenant_id)
        company_name = tenant.name if tenant else "Your Restaurant"
        
        # Prepare order data
        order_data = {
            "order_number": po.order_number,
            "order_date": po.order_date.isoformat() if po.order_date else None,
            "expected_date": po.expected_date.isoformat() if po.expected_date else None,
            "status": po.status.value if po.status else "draft",
            "notes": po.notes,
            "subtotal_cents": po.subtotal_cents or 0,
            "tax_cents": po.tax_cents or 0,
            "total_cents": po.total_cents or 0,
        }
        
        # Generate PDF
        pdf_buffer = generate_purchase_order_pdf(
            order_data=order_data,
            supplier_data=supplier_data,
            items=items,
            company_name=company_name,
        )
        
        # Return as downloadable PDF
        filename = f"PO-{po.order_number}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


# ============ PRODUCT RECIPES ============

@router.get("/recipes/product/{product_id}")
def get_product_recipe(
    product_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Get recipe (BOM) for a product"""
    # Verify product exists and belongs to tenant
    product = session.get(models.Product, product_id)
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Get recipe items
    statement = (
        select(ProductRecipe)
        .where(ProductRecipe.product_id == product_id)
        .where(ProductRecipe.tenant_id == current_user.tenant_id)
    )
    recipe_items = session.exec(statement).all()
    
    items = []
    for ri in recipe_items:
        inv_item = session.get(InventoryItem, ri.inventory_item_id)
        items.append({
            "id": ri.id,
            "inventory_item_id": ri.inventory_item_id,
            "inventory_item_name": inv_item.name if inv_item else None,
            "inventory_item_sku": inv_item.sku if inv_item else None,
            "inventory_item_unit": inv_item.unit.value if inv_item else None,
            "quantity_required": float(ri.quantity_required),
            "unit": ri.unit.value,
            "waste_percentage": float(ri.waste_percentage),
            "notes": ri.notes,
        })
    
    return {
        "product_id": product_id,
        "product_name": product.name,
        "items": items,
    }


@router.put("/recipes/product/{product_id}")
def update_product_recipe(
    product_id: int,
    recipe_update: ProductRecipeUpdate,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_MANAGE))
    ],
    session: Session = Depends(get_session),
):
    """Replace entire recipe for a product"""
    # Verify product exists and belongs to tenant
    product = session.get(models.Product, product_id)
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Delete existing recipe items
    statement = (
        select(ProductRecipe)
        .where(ProductRecipe.product_id == product_id)
        .where(ProductRecipe.tenant_id == current_user.tenant_id)
    )
    existing_items = session.exec(statement).all()
    for item in existing_items:
        session.delete(item)
    
    # Add new recipe items
    for item_data in recipe_update.items:
        # Validate inventory item
        inv_item = session.get(InventoryItem, item_data.inventory_item_id)
        if not inv_item or inv_item.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=404,
                detail=f"Inventory item {item_data.inventory_item_id} not found"
            )
        
        recipe_item = ProductRecipe(
            tenant_id=current_user.tenant_id,
            product_id=product_id,
            inventory_item_id=item_data.inventory_item_id,
            quantity_required=item_data.quantity_required,
            unit=item_data.unit,
            waste_percentage=item_data.waste_percentage,
            notes=item_data.notes,
        )
        session.add(recipe_item)
    
    session.commit()
    
    return {"status": "updated", "product_id": product_id, "items_count": len(recipe_update.items)}


@router.get("/recipes/product/{product_id}/cost", response_model=ProductCostResponse)
def get_product_cost(
    product_id: int,
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Calculate theoretical cost for a product based on its recipe"""
    # Verify product exists
    product = session.get(models.Product, product_id)
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Product not found")
    
    cost_data = calculate_product_cost(session, product_id, current_user.tenant_id)
    
    return ProductCostResponse(
        product_id=product_id,
        product_name=product.name,
        ingredients=cost_data["ingredients"],
        total_cost_cents=cost_data["total_cost_cents"],
        cost_per_unit_cents=cost_data["total_cost_cents"],  # Per unit = total for 1 unit
    )


# ============ STOCK REPORTS ============

@router.get("/stock-levels", response_model=list[StockLevelResponse])
def get_stock_levels(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
    category: InventoryCategory | None = None,
):
    """Get current stock levels for all items"""
    statement = (
        select(InventoryItem)
        .where(InventoryItem.tenant_id == current_user.tenant_id)
        .where(InventoryItem.is_deleted == False)
        .where(InventoryItem.is_active == True)
    )
    
    if category:
        statement = statement.where(InventoryItem.category == category)
    
    statement = statement.order_by(InventoryItem.name)
    items = session.exec(statement).all()
    
    result = []
    for item in items:
        total_value = int(float(item.current_quantity) * item.average_cost_cents)
        
        result.append(StockLevelResponse(
            id=item.id,
            sku=item.sku,
            name=item.name,
            unit=item.unit.value if item.unit else "piece",
            current_quantity=float(item.current_quantity),
            reorder_level=float(item.reorder_level),
            average_cost_cents=item.average_cost_cents,
            total_value_cents=total_value,
            is_low_stock=item.current_quantity <= item.reorder_level,
            category=item.category.value if item.category else "other",
        ))
    
    return result


@router.get("/low-stock")
def get_low_stock_alerts(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Get items at or below reorder level"""
    items = get_low_stock_items(session, current_user.tenant_id)
    
    return [
        {
            "id": item.id,
            "sku": item.sku,
            "name": item.name,
            "unit": item.unit.value if item.unit else "piece",
            "current_quantity": float(item.current_quantity),
            "reorder_level": float(item.reorder_level),
            "reorder_quantity": float(item.reorder_quantity),
            "suggested_order_quantity": float(max(0, item.reorder_level - item.current_quantity + item.reorder_quantity)),
            "default_supplier_id": item.default_supplier_id,
        }
        for item in items
    ]


@router.get("/valuation", response_model=InventoryValuationResponse)
def get_inventory_valuation(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
):
    """Get FIFO inventory valuation report"""
    valuation = calculate_fifo_valuation(session, current_user.tenant_id)
    
    return InventoryValuationResponse(
        as_of_date=datetime.now(timezone.utc),
        items=valuation["items"],
        total_value_cents=valuation["total_value_cents"],
    )


@router.get("/transactions")
def get_inventory_transactions(
    current_user: Annotated[
        models.User, Depends(PermissionChecker(Permissions.INVENTORY_READ))
    ],
    session: Session = Depends(get_session),
    item_id: int | None = None,
    transaction_type: TransactionType | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    """Get inventory transaction history"""
    statement = (
        select(InventoryTransaction)
        .where(InventoryTransaction.tenant_id == current_user.tenant_id)
    )
    
    if item_id:
        statement = statement.where(InventoryTransaction.inventory_item_id == item_id)
    
    if transaction_type:
        statement = statement.where(InventoryTransaction.transaction_type == transaction_type)
    
    statement = statement.order_by(InventoryTransaction.created_at.desc())
    statement = statement.offset(offset).limit(limit)
    
    transactions = session.exec(statement).all()
    
    result = []
    for txn in transactions:
        inv_item = session.get(InventoryItem, txn.inventory_item_id)
        
        result.append({
            "id": txn.id,
            "inventory_item_id": txn.inventory_item_id,
            "inventory_item_name": inv_item.name if inv_item else None,
            "transaction_type": txn.transaction_type.value,
            "quantity": float(txn.quantity),
            "unit": txn.unit.value,
            "unit_cost_cents": txn.unit_cost_cents,
            "total_cost_cents": txn.total_cost_cents,
            "balance_after": float(txn.balance_after),
            "order_id": txn.order_id,
            "purchase_order_id": txn.purchase_order_id,
            "notes": txn.notes,
            "created_at": txn.created_at.isoformat(),
        })
    
    return result


# ============ UNIT OF MEASURE INFO ============

@router.get("/units")
def get_available_units():
    """Get list of available units of measure with metadata"""
    return {
        "units": [
            {
                "value": unit.value,
                "label": unit.value.replace("_", " ").title(),
                "type": "count" if unit == UnitOfMeasure.piece else (
                    "weight" if unit in [UnitOfMeasure.gram, UnitOfMeasure.kilogram, UnitOfMeasure.ounce, UnitOfMeasure.pound] else "volume"
                ),
            }
            for unit in UnitOfMeasure
        ]
    }
