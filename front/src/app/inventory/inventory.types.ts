/**
 * Inventory Module Types
 *
 * TypeScript interfaces for the inventory management API.
 */

// ============ ENUMS ============

export type UnitOfMeasure =
    | 'piece'
    | 'gram'
    | 'kilogram'
    | 'ounce'
    | 'pound'
    | 'milliliter'
    | 'liter'
    | 'fluid_ounce'
    | 'cup'
    | 'gallon';

export type TransactionType =
    | 'purchase'
    | 'sale'
    | 'adjustment_add'
    | 'adjustment_subtract'
    | 'waste'
    | 'transfer_in'
    | 'transfer_out';

export type PurchaseOrderStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'partially_received'
    | 'received'
    | 'cancelled';

export type InventoryCategory =
    | 'ingredients'
    | 'beverages'
    | 'packaging'
    | 'cleaning'
    | 'equipment'
    | 'other';

// ============ INVENTORY ITEMS ============

export interface InventoryItem {
    id: number;
    sku: string;
    name: string;
    description?: string | null;
    unit: string;  // Serialized as string from backend
    reorder_level: number;
    reorder_quantity: number;
    current_quantity: number;
    average_cost_cents: number;
    category: string;  // Serialized as string from backend
    default_supplier_id?: number | null;
    is_active: boolean;
    is_low_stock: boolean;
    created_at: string;
    updated_at: string;
}

export interface InventoryItemCreate {
    sku: string;
    name: string;
    description?: string | null;
    unit?: UnitOfMeasure;
    reorder_level?: number;
    reorder_quantity?: number;
    category?: InventoryCategory;
    default_supplier_id?: number | null;
}

export interface InventoryItemUpdate {
    sku?: string | null;
    name?: string | null;
    description?: string | null;
    unit?: UnitOfMeasure | null;
    reorder_level?: number | null;
    reorder_quantity?: number | null;
    category?: InventoryCategory | null;
    default_supplier_id?: number | null;
    is_active?: boolean | null;
}

export interface StockAdjustment {
    quantity: number;
    unit: UnitOfMeasure;
    adjustment_type: 'adjustment_add' | 'adjustment_subtract' | 'waste';
    notes?: string | null;
}

// ============ SUPPLIERS ============

export interface Supplier {
    id: number;
    name: string;
    code?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    payment_terms?: string | null;
    lead_time_days?: number | null;
    minimum_order_cents?: number | null;
    notes?: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SupplierCreate {
    name: string;
    code?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    payment_terms?: string | null;
    lead_time_days?: number | null;
    minimum_order_cents?: number | null;
    notes?: string | null;
}

export interface SupplierUpdate {
    name?: string | null;
    code?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    payment_terms?: string | null;
    lead_time_days?: number | null;
    minimum_order_cents?: number | null;
    notes?: string | null;
    is_active?: boolean | null;
}

// ============ PURCHASE ORDERS ============

export interface PurchaseOrderItemCreate {
    inventory_item_id: number;
    quantity_ordered: number;
    unit: UnitOfMeasure;
    unit_cost_cents: number;
}

export interface PurchaseOrderCreate {
    supplier_id: number;
    expected_date?: string | null;
    notes?: string | null;
    items: PurchaseOrderItemCreate[];
}

export interface PurchaseOrderUpdate {
    supplier_id?: number | null;
    expected_date?: string | null;
    notes?: string | null;
}

export interface PurchaseOrderItem {
    id: number;
    inventory_item_id: number;
    inventory_item_name?: string | null;
    inventory_item_sku?: string | null;
    quantity_ordered: number;
    quantity_received: number;
    unit: UnitOfMeasure;
    unit_cost_cents: number;
    line_total_cents: number;
}

export interface PurchaseOrder {
    id: number;
    order_number: string;
    supplier_id: number;
    supplier_name?: string | null;
    supplier?: {
        id: number;
        name: string;
        code?: string | null;
    } | null;
    status: PurchaseOrderStatus;
    order_date: string;
    expected_date?: string | null;
    received_date?: string | null;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    notes?: string | null;
    items?: PurchaseOrderItem[];
    items_count?: number;
    created_at?: string;
    updated_at?: string;
}

export interface ReceivedItemInput {
    purchase_order_item_id: number;
    quantity_received: number;
    unit_cost_cents?: number | null;
}

export interface ReceiveGoodsInput {
    items: ReceivedItemInput[];
    notes?: string | null;
}

// ============ RECIPES ============

export interface ProductRecipeItemCreate {
    inventory_item_id: number;
    quantity_required: number;
    unit: UnitOfMeasure;
    waste_percentage?: number;
    notes?: string | null;
}

export interface ProductRecipeUpdate {
    items: ProductRecipeItemCreate[];
}

export interface ProductRecipeItem {
    id: number;
    inventory_item_id: number;
    inventory_item_name?: string | null;
    inventory_item_sku?: string | null;
    inventory_item_unit?: UnitOfMeasure | null;
    quantity_required: number;
    unit: UnitOfMeasure;
    waste_percentage: number;
    notes?: string | null;
}

export interface ProductRecipe {
    product_id: number;
    product_name: string;
    items: ProductRecipeItem[];
}

export interface ProductCostIngredient {
    inventory_item_id: number;
    name: string;
    quantity: number;
    unit: UnitOfMeasure;
    waste_percentage: number;
    cost_cents: number;
}

export interface ProductCost {
    product_id: number;
    product_name: string;
    ingredients: ProductCostIngredient[];
    total_cost_cents: number;
    cost_per_unit_cents: number;
}

// ============ STOCK & REPORTS ============

export interface StockLevel {
    id: number;
    sku: string;
    name: string;
    unit: string;  // Serialized as string from backend
    current_quantity: number;
    reorder_level: number;
    average_cost_cents: number;
    total_value_cents: number;
    is_low_stock: boolean;
    category: string;  // Serialized as string from backend
}

export interface LowStockItem {
    id: number;
    sku: string;
    name: string;
    unit: string;  // Serialized as string from backend
    current_quantity: number;
    reorder_level: number;
    reorder_quantity: number;
    suggested_order_quantity: number;
    default_supplier_id?: number | null;
}

export interface InventoryValuationItem {
    inventory_item_id: number;
    sku: string;
    name: string;
    unit: UnitOfMeasure;
    quantity: number;
    fifo_value_cents: number;
}

export interface InventoryValuation {
    as_of_date: string;
    items: InventoryValuationItem[];
    total_value_cents: number;
}

export interface InventoryTransaction {
    id: number;
    inventory_item_id: number;
    inventory_item_name?: string | null;
    transaction_type: TransactionType;
    quantity: number;
    unit: UnitOfMeasure;
    unit_cost_cents?: number | null;
    total_cost_cents?: number | null;
    balance_after: number;
    order_id?: number | null;
    purchase_order_id?: number | null;
    notes?: string | null;
    created_at: string;
}

// ============ UNITS METADATA ============

export interface UnitInfo {
    value: UnitOfMeasure;
    label: string;
    type: 'count' | 'weight' | 'volume';
}

export interface UnitsResponse {
    units: UnitInfo[];
}
