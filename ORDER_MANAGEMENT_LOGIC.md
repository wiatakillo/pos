# Order Management Logic Specification

## Problem Statement

Currently, when multiple browsers/devices use the same table link (table token), they all share the same unpaid order. This causes:
- Orders from different customers/sessions to be mixed together
- Confusion about which items belong to which customer
- Payment issues when one customer pays for another's items

## Desired Behavior

### Core Principle
**Each browser session should have its own independent order, even when using the same table token.**

### Use Cases

1. **Single Customer, Single Browser**
   - Customer opens table link in one browser
   - Creates Order #10
   - Adds items, pays
   - Order is marked as paid
   - ✅ Works correctly

2. **Single Customer, Multiple Browsers (Same Session Intent)**
   - Customer opens table link in Brave browser → Creates Order #10
   - Customer opens same link in Safari browser → Should create Order #11 (separate order)
   - Each browser maintains its own order independently
   - ✅ Each browser has its own order

3. **Multiple Customers, Same Table (Physical Restaurant Scenario)**
   - Customer A opens table link on their phone → Creates Order #10
   - Customer B opens same table link on their phone → Creates Order #11
   - Both orders are for the same physical table
   - Restaurant staff can see both orders for the table
   - ✅ Each customer has their own order

4. **Customer Reopens Browser**
   - Customer creates Order #10, closes browser
   - Customer reopens browser with same table link
   - Should see their existing Order #10 (if not paid)
   - ✅ Order persists across browser sessions

## Implementation Logic

### Session Identification

1. **Generate Session ID**
   - On page load, generate a unique session ID (UUID)
   - Store in localStorage: `session_${tableToken} = <session_id>`
   - This session ID persists across page refreshes but is unique per browser/device

2. **Session ID Format**
   - UUID v4 format
   - Example: `550e8400-e29b-41d4-a716-446655440000`
   - Stored as string

### Order Creation Rules

#### Rule 1: New Order Creation
- **When**: No existing unpaid order exists for this `(table_id, session_id)` combination
- **Action**: Create a new order
- **Order Fields**:
  - `tenant_id`: From table
  - `table_id`: From table
  - `session_id`: New field to store session identifier
  - `status`: `pending`
  - `notes`: Optional, can include session info for debugging

#### Rule 2: Order Reuse (Same Session)
- **When**: An unpaid order exists for this `(table_id, session_id)` combination
- **Action**: Reuse existing order, add items to it
- **Validation**: 
  - Order must have matching `table_id` AND `session_id`
  - Order status must be `pending`, `preparing`, or `ready` (not `paid` or `completed`)
  - Order must not have `[PAID:]` marker in notes

**Status Reset Logic When Adding Items:**
- **If order status is `completed`**: Reset to `pending` (new items need to be prepared)
- **If order status is `ready`**: Reset to `preparing` (new items need to be prepared, existing items were ready)
- **If order status is `preparing`**: Keep as `preparing` (items are still being prepared)
- **If order status is `pending`**: Keep as `pending` (items haven't started being prepared)
- **Rationale**: When new items are added to an order, those items need to be prepared. If the order was already "ready", it means the previous items were ready, but now with new items, the order needs to go back to "preparing" so staff can prepare the new items.

#### Rule 3: Order Retrieval
- **When**: Frontend loads page
- **Action**: 
  1. Get or generate session ID
  2. Fetch order from backend using `(table_token, session_id)`
  3. If backend returns order, use it
  4. If no order exists, show empty state

#### Rule 4: Order Payment
- **When**: Customer pays for order
- **Action**: 
  - Mark order as `paid`
  - Add `[PAID: <payment_intent_id>]` to notes
  - Clear localStorage order data (order is complete)
  - Session ID remains for potential future orders

#### Rule 5: Order Completion & Payment
- **When**: Restaurant marks order as `completed` (all items delivered)
- **Action**:
  - Order status changes to `completed`
  - **Payment Status**: Order is `completed` but NOT `paid` yet (`paid_at = null`)
  - Frontend clears order from localStorage
  - Session can still create new orders
- **Payment Methods**:
  - **Online Payment**: Customer pays via Stripe → Order automatically marked as `paid`
  - **Terminal/Cash Payment**: Restaurant staff manually marks order as `paid` in backend interface
  - **Use Case**: Customer orders, receives items, then pays at bar/terminal with cash or card
- **Payment Tracking**:
  - Restaurant backend has "Not Paid Yet" filter view to show all `completed` orders with `paid_at = null`
  - Staff can switch between "Active Orders" (work to be done) and "Not Paid Yet" (payment tracking)
  - After marking as paid, order moves to "Order History"

### Database Schema Changes

#### Add `session_id` to Order Table

```sql
ALTER TABLE "order" ADD COLUMN session_id VARCHAR(255);
CREATE INDEX idx_order_session ON "order"(table_id, session_id);
```

**Field Details**:
- `session_id`: VARCHAR(255), nullable
- Index on `(table_id, session_id)` for fast lookups
- Allows NULL for backward compatibility with existing orders

### API Changes

#### 1. Order Creation Endpoint
**Current**: `POST /menu/{table_token}/order`
**Change**: Accept optional `session_id` in request body

```json
{
  "items": [...],
  "notes": "...",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"  // Optional
}
```

**Backend Logic**:
1. If `session_id` provided:
   - Look for existing order with `(table_id, session_id)` AND status != paid
   - If found, reuse it
   - If not found, create new order with this `session_id`
2. If `session_id` NOT provided (backward compatibility):
   - Generate a new session_id
   - Create new order (never reuse old orders without session_id)

#### 2. Get Current Order Endpoint
**Current**: `GET /menu/{table_token}/order`
**Change**: Accept optional `session_id` query parameter

**Backend Logic**:
1. If `session_id` provided:
   - Look for order with `(table_id, session_id)` AND status != paid
   - Return that order
2. If `session_id` NOT provided:
   - Return most recent unpaid order for table (backward compatibility)
   - Or return null if no order exists

#### 3. Order Modification Endpoints (Security: Session Validation Required)
**Endpoints**: 
- `DELETE /menu/{table_token}/order/{order_id}/items/{item_id}?session_id={session_id}`
- `PUT /menu/{table_token}/order/{order_id}/items/{item_id}?session_id={session_id}`
- `DELETE /menu/{table_token}/order/{order_id}?session_id={session_id}`

**Security Requirement**: 
- All modification endpoints **require** `session_id` as query parameter
- Backend validates that `order.session_id` matches provided `session_id`
- Returns `403 Forbidden` if order doesn't belong to the session
- **Purpose**: Prevents customers from modifying orders belonging to other sessions at the same table

**Backend Logic**:
1. Validate `table_token` → get `table_id`
2. Validate `order_id` belongs to `table_id`
3. **Security Check**: Validate `order.session_id == session_id` (if both are provided)
4. If validation fails → Return `403 Forbidden`
5. If validation passes → Proceed with modification

#### 3. Get All Orders for Table (Admin View)
**Current**: `GET /orders` (tenant-scoped)
**Change**: Show all orders for a table, grouped by session_id

**Display**:
- Show all orders for the table
- Group by session_id (if available)
- Show which orders belong to which session
- Allow restaurant to see all active orders for a table

### Frontend Changes

#### 1. Session Management

```typescript
// On component init
generateOrGetSessionId(): string {
  const key = `session_${this.tableToken}`;
  let sessionId = localStorage.getItem(key);
  
  if (!sessionId) {
    sessionId = this.generateUUID();
    localStorage.setItem(key, sessionId);
  }
  
  return sessionId;
}
```

#### 2. Order Loading

```typescript
loadCurrentOrder() {
  const sessionId = this.generateOrGetSessionId();
  
  this.api.getCurrentOrder(this.tableToken, sessionId).subscribe({
    next: (response) => {
      if (response.order) {
        // Validate order belongs to this session
        if (response.order.session_id === sessionId) {
          this.placedOrders.set([this.mapToPlacedOrder(response.order)]);
        } else {
          // Order mismatch - clear and create new
          this.placedOrders.set([]);
        }
      } else {
        // No order exists - clear localStorage
        this.clearStoredOrders();
      }
    }
  });
}
```

#### 3. Order Submission

```typescript
submitOrder() {
  const sessionId = this.generateOrGetSessionId();
  
  this.api.submitOrder(this.tableToken, {
    items: [...],
    notes: this.orderNotes,
    session_id: sessionId  // Include session ID
  }).subscribe({
    next: (response) => {
      // Update local state with returned order
      // Order will have session_id from backend
    }
  });
}
```

### Edge Cases

#### Edge Case 1: Session ID Collision
- **Probability**: Extremely low (UUID v4)
- **Handling**: If collision detected, generate new session ID
- **Detection**: Backend returns order with different session_id than requested

#### Edge Case 2: localStorage Cleared
- **Scenario**: User clears browser data
- **Handling**: Generate new session ID, create new order
- **Result**: Old order remains in database but not accessible to this session

#### Edge Case 3: Multiple Tabs Same Browser
- **Scenario**: User opens same table link in multiple tabs
- **Handling**: All tabs share same session_id (from localStorage)
- **Result**: All tabs see same order (desired behavior)

#### Edge Case 4: Backward Compatibility
- **Scenario**: Existing orders without session_id
- **Handling**: 
  - Old orders remain accessible via admin view
  - New orders always get session_id
  - Old orders can be migrated if needed

#### Edge Case 5: Order Already Paid
- **Scenario**: Customer tries to add items to paid order
- **Handling**: Backend creates new order automatically
- **Validation**: Backend checks status before reusing

#### Edge Case 7: Order Modification/Cancellation ✅ **IMPLEMENTED**
- **Scenario**: Customer wants to modify or cancel order before delivery
- **Use Cases**:
  1. **Remove items**: Customer ordered 2x Pizza, wants to cancel 1x
  2. **Change quantity**: Customer ordered 3x Beer, wants to change to 2x
  3. **Remove entire order**: Customer wants to cancel everything
  4. **Replace items**: Customer ordered Pizza Margherita, wants to change to Pizza Pepperoni
- **Current Behavior**: 
  - ✅ API endpoint for order modification: `PUT /menu/{table_token}/order/{order_id}/items/{item_id}`
  - ✅ API endpoint for item removal: `DELETE /menu/{table_token}/order/{order_id}/items/{item_id}`
  - ✅ API endpoint for order cancellation: `DELETE /menu/{table_token}/order/{order_id}`
  - ✅ Customer can modify orders before delivery
- **Expected Behavior**:
  - Allow modification if **no items have been delivered yet**
  - Allow modification if order status is `pending` or `preparing`
  - Block modification if any item status is `delivered` or order is `paid`
  - Support item removal, quantity changes, and full cancellation
- **Business Rules**:
  - **Can modify**: Order status is `pending`, `preparing`, or items are `ready` but not `delivered`
  - **Cannot modify**: Any item is `delivered`, order is `paid`, or order is `completed`
  - **Partial cancellation**: Remove specific items, recalculate total
  - **Full cancellation**: Mark order as `cancelled`, remove all items
- **Implementation Needed** (✅ **IMPLEMENTED**):
  - `DELETE /menu/{table_token}/order/{order_id}/items/{item_id}?session_id={session_id}` - Remove item from order
  - `PUT /menu/{table_token}/order/{order_id}/items/{item_id}?session_id={session_id}` - Update item quantity
  - `DELETE /menu/{table_token}/order/{order_id}?session_id={session_id}` - Cancel entire order
  - Validation: Check item status before allowing modification
  - **Security**: Validate `session_id` to prevent cross-session order modification
  - Recalculate order total after modification
  - Notify restaurant staff of order changes

#### Edge Case 6: Adding Items to Ready Order ✅ **FIXED**
- **Scenario**: 
  1. Customer orders Pizza #1
  2. Restaurant sets order status to `ready`
  3. Customer orders Pizza #2 (same session, same order)
  4. Restaurant cannot set order back to `preparing` to prepare Pizza #2
- **Current Behavior**: 
  - ✅ Order status automatically resets to `preparing` when new items are added to `ready` order
  - ✅ Restaurant staff can prepare new items
  - ✅ Order workflow is functional
- **Expected Behavior**:
  - When new items are added to an order with status `ready`, automatically reset status to `preparing`
  - This allows restaurant staff to prepare the new items
  - Once all items (including new ones) are ready, staff can mark order as `ready` again
- **Root Cause**: 
  - In `create_order` endpoint, status reset logic only handles `completed` → `pending`
  - Missing logic to reset `ready` → `preparing` when new items are added
- **Impact**: 
  - Restaurant cannot prepare newly added items if order was already marked as ready
  - Workflow is broken: order stuck in `ready` state with unprepared items

### Migration Strategy

1. **Phase 1: Add session_id field** (nullable)
   - Add column to database
   - Existing orders have NULL session_id
   - New orders get session_id

2. **Phase 2: Update API** (backward compatible)
   - Accept session_id in requests
   - Generate if not provided
   - Return session_id in responses

3. **Phase 3: Update Frontend**
   - Generate and store session IDs
   - Include in all order requests
   - Handle session validation

4. **Phase 4: Cleanup** (optional)
   - Mark old orders without session_id as "legacy"
   - Optionally migrate or archive

### Testing Scenarios

1. **Test 1: Two Browsers, Same Table Token**
   - Open table link in Browser A → Creates Order #10
   - Open same link in Browser B → Creates Order #11
   - Verify orders are separate
   - ✅ Pass

2. **Test 2: Same Browser, Page Refresh**
   - Create Order #10
   - Refresh page
   - Verify Order #10 is still shown
   - ✅ Pass

3. **Test 3: Payment Clears Order**
   - Create Order #10
   - Pay for order
   - Refresh page
   - Verify no order shown (can create new one)
   - ✅ Pass

4. **Test 4: Admin Sees All Orders**
   - Customer A creates Order #10
   - Customer B creates Order #11
   - Admin views table orders
   - Verify both orders visible
   - ✅ Pass

5. **Test 5: Backward Compatibility**
   - Create order without session_id (old API)
   - Verify order created successfully
   - Verify new orders work with session_id
   - ✅ Pass

6. **Test 6: Adding Items to Ready Order** ✅ **PASSING**
   - Create Order #10 with Pizza #1
   - Restaurant sets order status to `ready`
   - Customer adds Pizza #2 to same order
   - Verify order status automatically resets to `preparing`
   - Verify restaurant can prepare Pizza #2 and mark order as `ready` again
   - ✅ Currently passes: Order status resets correctly

7. **Test 7: Order Modification** ✅ **IMPLEMENTED**
   - Create Order #10 with 2x Pizza + 3x Beer
   - Customer removes 1x Pizza (before delivery)
   - Verify order total recalculated correctly
   - Verify restaurant sees updated order
   - ✅ Currently passes: API endpoint implemented, soft delete working

8. **Test 8: Order Cancellation** ✅ **IMPLEMENTED**
   - Create Order #10 with items
   - Customer cancels order (before any items delivered)
   - Verify order marked as `cancelled`
   - Verify items removed or marked as `cancelled`
   - ✅ Currently passes: API endpoint implemented, soft delete working

9. **Test 9: Prevent Modification After Delivery** ✅ **IMPLEMENTED**
   - Create Order #10 with 2x Pizza
   - Restaurant marks 1x Pizza as `delivered`
   - Customer tries to remove the delivered Pizza
   - Verify modification is blocked
   - Customer can still remove the undelivered Pizza
   - ✅ Currently passes: Validation logic implemented

10. **Test 10: Soft Delete - Show Removed Items** ✅ **IMPLEMENTED**
    - Create Order #10 with 3x Pizza
    - Customer removes 1x Pizza
    - Verify item is NOT deleted from database (soft delete)
    - Verify `removed_by_customer = true`, `removed_at` is set
    - Verify order total excludes removed item
    - Restaurant views order (default): See only 2x Pizza
    - Restaurant toggles "Show Removed Items": See 2x Pizza + 1x Pizza (removed)
    - Verify removed item shows with strikethrough/grayed out
    - ✅ Currently passes: Soft delete fully implemented

## Item-Level Status Tracking (Proposed Enhancement)

### Problem Statement
Currently, order status is tracked at the **order level** only. All items in an order share the same status. This creates problems in real-world restaurant scenarios:

**Example Scenario:**
- Customer orders: 2x Beer (bar) + 1x Pizza (kitchen)
- Beer can be served immediately (30 seconds)
- Pizza needs 15-20 minutes to bake
- **Current behavior**: Whole order must wait until pizza is ready
- **Desired behavior**: Beer can be delivered immediately, pizza delivered when ready

### Proposed Solution: Item-Level Status

#### Concept
- Add `status` field to `OrderItem` model
- Each item can have independent status: `pending`, `preparing`, `ready`, `delivered`, `cancelled`
- Order-level status becomes **computed/aggregate** based on item statuses
- Allow **partial delivery** - some items delivered while others still preparing
- Allow **item cancellation** - customers can remove items before delivery

#### Database Schema Changes

```sql
-- Add status to OrderItem table
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_orderitem_status ON orderitem(order_id, status);

-- Add soft delete fields for audit trail
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_by_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP NULL;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_reason VARCHAR(255) NULL;  -- Optional: why was it removed
CREATE INDEX IF NOT EXISTS idx_orderitem_removed ON orderitem(order_id, removed_by_customer);

-- Add cancellation tracking to Order table
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50) NULL;  -- 'customer' or 'staff'

-- Status values: pending, preparing, ready, delivered, cancelled
```

#### Order Status Aggregation Rules

Order-level status should be computed based on item statuses:

1. **`pending`**: All items are `pending`
2. **`preparing`**: At least one item is `preparing` or `ready`, but none are `delivered`
3. **`ready`**: All items are `ready` (but not all delivered)
4. **`partially_delivered`**: Some items are `delivered`, but not all
5. **`completed`**: All items are `delivered` OR order marked as completed manually
6. **`paid`**: Order has been paid (independent of item status)

#### API Changes

**New Endpoints:**
- `PUT /orders/{order_id}/items/{item_id}/status` - Update individual item status
- `PUT /orders/{order_id}/items/batch-status` - Update multiple items at once
- `PUT /orders/{order_id}/mark-delivered` - Mark specific items as delivered
- `DELETE /menu/{table_token}/order/{order_id}/items/{item_id}` - Remove item from order (customer) - **Soft delete**
- `PUT /menu/{table_token}/order/{order_id}/items/{item_id}` - Update item quantity (customer)
- `DELETE /menu/{table_token}/order/{order_id}` - Cancel entire order (customer) - **Soft delete**
- `PUT /orders/{order_id}/items/{item_id}/cancel` - Cancel individual item (restaurant staff) - **Soft delete**
- `GET /orders/{order_id}?include_removed=true` - Get order with removed items (restaurant staff)

**Modified Endpoints:**
- `PUT /orders/{order_id}/status` - Still works, but updates all items to that status
- `GET /orders` - Returns item-level statuses, computed order status

#### UI Changes

**Restaurant Interface:**
- Show item-level status badges next to each item
- Allow clicking individual items to change their status
- Show aggregate order status (computed)
- "Mark as Delivered" button for individual items
- "Mark All as Delivered" button for entire order
- "Cancel Item" button for items not yet delivered
- Visual distinction: delivered items grayed out or checked, cancelled items crossed out

**Customer Interface:**
- "Remove Item" button for items not yet delivered
- "Change Quantity" button for items not yet delivered
- "Cancel Order" button (if no items delivered)
- Visual indication of which items can be modified (not delivered)
- Confirmation dialog before cancellation

**Example UI:**
```
Order #10 - Table 5
Status: Partially Delivered (2/3 items)

Items:
  ✓ 2x Beer - Delivered
  ⏳ 1x Pizza - Preparing
  [Mark Pizza as Ready] [Mark Pizza as Delivered]
```

#### Benefits

1. **Realistic Workflow**: Matches how restaurants actually work
2. **Better Customer Experience**: Quick items (drinks) served immediately
3. **Kitchen Efficiency**: Kitchen can focus on food, bar on drinks
4. **Flexibility**: Handle complex orders with mixed preparation times
5. **Partial Payments**: Could enable paying for delivered items separately (future)

#### Challenges & Considerations

1. **Order Aggregation Logic**: Need clear rules for computing order status
2. **Payment Timing**: When can customer pay? After all items delivered? Or partial?
3. **UI Complexity**: More buttons/actions per order
4. **Status Transitions**: Need to define valid transitions (e.g., can't go from `delivered` back to `preparing`)
5. **Backward Compatibility**: Existing orders without item status need default values
6. **Order Modification Rules**: When can customers modify orders? Before delivery? Before payment?
7. **Cancellation Handling**: How to handle partial vs full cancellation? Refund logic?
8. **Audit Trail**: Track who cancelled items and when (customer vs staff)

#### Implementation Priority

**Phase 1: Basic Item Status**
- Add `status` field to OrderItem
- Default all existing items to `pending`
- Allow updating item status individually
- Compute order status from items

**Phase 2: Partial Delivery**
- Add `delivered` status
- Update order aggregation logic
- UI for marking items as delivered
- Visual indicators for delivered items

**Phase 3: Order Modification & Cancellation**
- Allow customers to remove items before delivery
- Allow customers to change item quantities
- Allow customers to cancel entire order (if no items delivered)
- Restaurant staff can cancel individual items
- Recalculate order totals after modification
- Notify staff of order changes

**Phase 4: Advanced Features**
- Batch status updates
- Status history/audit trail
- Automatic status transitions (e.g., ready → delivered after X minutes)
- Integration with kitchen display systems
- Refund processing for cancelled items (if paid)

#### Example Workflow

1. **Order Placed**: All items → `pending`
2. **Bar starts beer**: 2x Beer → `preparing`
3. **Bar serves beer**: 2x Beer → `ready`
4. **Beer delivered**: 2x Beer → `delivered`
5. **Kitchen starts pizza**: 1x Pizza → `preparing`
6. **Pizza ready**: 1x Pizza → `ready`
7. **Pizza delivered**: 1x Pizza → `delivered`
8. **Order complete**: All items `delivered` → Order status `completed`

**Order Status During Process:**
- Step 1: `pending` (all items pending)
- Step 2-3: `preparing` (beer preparing/ready, pizza pending)
- Step 4: `partially_delivered` (beer delivered, pizza pending)
- Step 5-6: `partially_delivered` (beer delivered, pizza preparing/ready)
- Step 7-8: `completed` (all items delivered)

## Industry Reference: TastyIgniter & Similar Systems

### TastyIgniter Approach (Industry Standard)

TastyIgniter and similar restaurant POS systems (Toast, Square, Lightspeed) typically implement item-level status tracking with the following patterns:

#### 1. **Order Item Status Model**
- Each `OrderItem` has its own `status_id` field
- Status values: `pending`, `preparing`, `ready`, `delivered`, `cancelled`
- Status is independent per item, allowing partial fulfillment

#### 2. **Order Status Aggregation**
Order-level status is **computed** from item statuses, not stored directly:
```php
// Pseudo-code from TastyIgniter pattern
function getOrderStatus($order) {
    $items = $order->items;
    $allDelivered = $items->every(fn($item) => $item->status === 'delivered');
    $allReady = $items->every(fn($item) => $item->status === 'ready');
    $anyPreparing = $items->some(fn($item) => $item->status === 'preparing');
    $anyDelivered = $items->some(fn($item) => $item->status === 'delivered');
    
    if ($allDelivered) return 'completed';
    if ($anyDelivered && !$allDelivered) return 'partially_delivered';
    if ($allReady) return 'ready';
    if ($anyPreparing) return 'preparing';
    return 'pending';
}
```

#### 3. **Kitchen Display System (KDS) Integration**
- Items are grouped by preparation location (bar, kitchen, dessert station)
- Each station sees only items relevant to them
- Status updates propagate in real-time via WebSocket/SSE
- Bar sees drinks immediately, kitchen sees food items

#### 4. **Status Transition Rules**
- **Valid transitions**: `pending` → `preparing` → `ready` → `delivered`
- **Direct transitions allowed**: `pending` → `ready` (for pre-made items), `ready` → `delivered`
- **Cancellation**: Any status → `cancelled` (if not `delivered` or `paid`)
- **Invalid transitions**: `delivered` → `preparing` (can't undo delivery), `cancelled` → any status, `paid` → any status (except refund)
- **Special case**: When new items added to order with `ready` items, new items start at `pending`
- **Modification rules**: Items can only be modified/cancelled if status is `pending`, `preparing`, or `ready` (not `delivered`)

#### 5. **UI Patterns**
**Restaurant Staff Interface:**
- **Card-based layout**: Each order is a card showing all items
- **Item-level actions**: Each item has its own status badge and action buttons
- **Visual indicators**: 
  - Color-coded status badges (red=pending, blue=preparing, green=ready, gray=delivered)
  - Checkmarks for delivered items
  - Timestamps for status changes
- **Group actions**: "Mark all ready", "Mark all delivered" buttons
- **Filtering**: Filter orders by status, table, or station

**Example UI Structure:**
```
┌─────────────────────────────────────┐
│ Order #42 - Table 5 - John         │
│ Status: Partially Delivered (1/2)   │
├─────────────────────────────────────┤
│ ✓ 2x Beer - Delivered [12:05]      │
│   [Undo]                            │
│                                     │
│ ⏳ 1x Pizza Margherita - Preparing  │
│   [Mark Ready] [Mark Delivered]     │
├─────────────────────────────────────┤
│ Total: $28.50                       │
│ [Mark All Delivered] [Complete]     │
└─────────────────────────────────────┘
```

#### 6. **Database Schema Pattern**
```sql
-- Order Items table with soft delete
CREATE TABLE order_items (
    id INT PRIMARY KEY,
    order_id INT,
    product_id INT,
    quantity INT,
    status_id INT DEFAULT 1,  -- 1=pending, 2=preparing, 3=ready, 4=delivered, 5=cancelled
    status_updated_at TIMESTAMP,
    prepared_by_user_id INT NULL,  -- Who marked it as ready
    delivered_by_user_id INT NULL,  -- Who delivered it
    
    -- Soft delete fields (NEVER actually delete)
    removed_by_customer BOOLEAN DEFAULT FALSE,
    removed_at TIMESTAMP NULL,
    removed_reason VARCHAR(255) NULL,
    
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (status_id) REFERENCES order_item_statuses(id)
);

-- Index for active items (performance)
CREATE INDEX idx_order_items_active ON order_items(order_id, removed_by_customer) 
WHERE removed_by_customer = FALSE;
```

-- Status lookup table (optional, or use enum)
CREATE TABLE order_item_statuses (
    id INT PRIMARY KEY,
    name VARCHAR(50),  -- pending, preparing, ready, delivered
    display_name VARCHAR(50),  -- "Pending", "Preparing", "Ready", "Delivered"
    color_code VARCHAR(7)  -- "#FF0000" for red, etc.
);
```

#### 7. **API Endpoint Patterns**
```php
// Update single item status
PUT /api/orders/{order_id}/items/{item_id}/status
Body: { "status": "ready", "user_id": 5 }

// Update multiple items (batch)
PUT /api/orders/{order_id}/items/batch-status
Body: { 
    "items": [
        { "item_id": 1, "status": "ready" },
        { "item_id": 2, "status": "preparing" }
    ],
    "user_id": 5
}

// Mark items as delivered
PUT /api/orders/{order_id}/items/mark-delivered
Body: { "item_ids": [1, 2], "user_id": 5 }

// Get order with computed status
GET /api/orders/{order_id}
Response: {
    "id": 42,
    "status": "partially_delivered",  // Computed
    "items": [
        { "id": 1, "status": "delivered", ... },
        { "id": 2, "status": "preparing", ... }
    ]
}
```

#### 8. **Real-time Updates**
- WebSocket/SSE for live status updates
- When item status changes, broadcast to:
  - Restaurant staff dashboard
  - Kitchen display screens
  - Customer-facing order status page
- Update order-level computed status automatically

#### 9. **Key Insights from Industry**
1. **Status is computed, not stored** - Order status is always derived from items
2. **Audit trail** - Track who changed status and when (`status_updated_at`, `prepared_by_user_id`)
3. **Station-based filtering** - Bar staff only see drink items, kitchen sees food
4. **Partial payment support** - Some systems allow paying for delivered items separately
5. **Cancellation handling** - Items can be cancelled individually without affecting others
6. **Preparation time tracking** - Track time from `pending` → `ready` for analytics

#### 10. **Best Practices**
- ✅ Always compute order status from items (single source of truth)
- ✅ Allow flexible status transitions (pending → ready for pre-made items)
- ✅ Track user who made status change (accountability)
- ✅ Show timestamps for transparency
- ✅ Support batch operations (mark multiple items at once)
- ✅ Real-time updates for all stakeholders
- ✅ Visual distinction between delivered and pending items
- ✅ Filter orders by station/location (bar vs kitchen)
- ✅ **NEVER delete order data** - Always use soft delete for audit trail
- ✅ **Show removed items toggle** - Restaurant staff can view deleted items
- ✅ **Preserve all data** - Keep removed items for analytics and dispute resolution

## Order Modification & Cancellation

### Use Case: Customer Changes Mind Before Delivery

**Scenario**: Customer places order, then wants to modify or cancel before items are delivered.

**Real-World Examples**:
1. **Remove items**: Ordered 2x Pizza, realized only need 1x
2. **Change quantity**: Ordered 3x Beer, want to change to 2x
3. **Cancel item**: Ordered Pizza Margherita, want to cancel it
4. **Cancel order**: Changed mind, want to cancel entire order
5. **Replace item**: Ordered Pizza Margherita, want Pizza Pepperoni instead

### Business Rules

#### When Modification is Allowed ✅
- Order status is `pending` (not started)
- Order status is `preparing` (items being prepared, but not delivered)
- Item status is `pending`, `preparing`, or `ready` (not `delivered`)
- Order has not been paid yet

#### When Modification is Blocked ❌
- Any item has status `delivered` (can't undo delivery)
- Order status is `paid` (requires refund process)
- Order status is `completed` (order is finished)
- Order status is `cancelled` (already cancelled)

### Implementation Requirements

#### 1. Item Removal (Soft Delete)
**Endpoint**: `DELETE /menu/{table_token}/order/{order_id}/items/{item_id}?session_id={session_id}`
- **Parameters**: 
  - `session_id` (query, required): Session identifier to validate order ownership
  - `reason` (query, optional): Optional reason for removal
- **Validation**: 
  - Check item status is not `delivered`
  - **Security**: Validate that `order.session_id` matches provided `session_id` (prevents cross-session modification)
- **Action**: **Mark item as removed** (soft delete), do NOT delete from database
- **Database**: Set `removed_by_customer = true`, `removed_at = NOW()`, `status = 'cancelled'`
- **Recalculation**: Recalculate order total (exclude removed items)
- **Notification**: Notify restaurant staff of item removal
- **Response**: Updated order with new total

**Important**: Never actually delete order items from database. Always use soft delete for:
- Audit trail and accountability
- Order history and analytics
- Dispute resolution
- Financial reporting

**Example**:
```json
DELETE /menu/abc123/order/10/items/5
Response: {
  "status": "item_removed",
  "order_id": 10,
  "removed_item_id": 5,
  "new_total_cents": 2500,
  "items_remaining": 2,
  "removed_items_count": 1
}
```

#### 2. Quantity Update
**Endpoint**: `PUT /menu/{table_token}/order/{order_id}/items/{item_id}?session_id={session_id}`
- **Parameters**: 
  - `session_id` (query, required): Session identifier to validate order ownership
- **Body**: `{ "quantity": 2 }`
- **Validation**: 
  - Check item status is not `delivered`
  - **Security**: Validate that `order.session_id` matches provided `session_id` (prevents cross-session modification)
- **Action**: Update quantity, recalculate total
- **Special case**: If quantity set to 0, remove item
- **Notification**: Notify restaurant staff of quantity change

**Example**:
```json
PUT /menu/abc123/order/10/items/5
Body: { "quantity": 2 }
Response: {
  "status": "item_updated",
  "order_id": 10,
  "item_id": 5,
  "new_quantity": 2,
  "new_total_cents": 3000
}
```

#### 3. Full Order Cancellation (Soft Delete)
**Endpoint**: `DELETE /menu/{table_token}/order/{order_id}?session_id={session_id}`
- **Parameters**: 
  - `session_id` (query, required): Session identifier to validate order ownership
- **Validation**: 
  - Check no items are `delivered`
  - **Security**: Validate that `order.session_id` matches provided `session_id` (prevents cross-session modification)
- **Action**: Mark order as `cancelled`, mark all items as `cancelled` and `removed_by_customer = true`
- **Database**: Set `order.status = 'cancelled'`, `order.cancelled_at = NOW()`, all items `removed_by_customer = true`
- **Notification**: Notify restaurant staff of cancellation
- **Important**: Do NOT delete order or items from database - keep for audit trail

**Example**:
```json
DELETE /menu/abc123/order/10
Response: {
  "status": "order_cancelled",
  "order_id": 10,
  "cancelled_items": 3
}
```

#### 4. Item Replacement (Future Enhancement)
**Endpoint**: `PUT /menu/{table_token}/order/{order_id}/items/{item_id}/replace`
- **Validation**: Check item status is not `delivered`
- **Action**: Replace item with different product
- **Use case**: Change Pizza Margherita to Pizza Pepperoni

### UI/UX Considerations

#### Customer Interface
- **Visual indicators**: Show which items can be modified (not delivered)
- **Action buttons**: 
  - "Remove" button next to each item (if not delivered)
  - "Change Quantity" button (if not delivered)
  - "Cancel Order" button (if no items delivered)
- **Confirmation dialogs**: 
  - "Are you sure you want to remove this item?"
  - "Are you sure you want to cancel this order?"
- **Feedback**: 
  - Show success message after modification
  - Update order total immediately
  - Show which items were removed/modified

#### Restaurant Interface
- **Notifications**: Alert staff when customer modifies order
- **Visual indicators**: Show cancelled/removed items (grayed out, crossed out)
- **Show deleted items**: Toggle button "Show Removed Items" to view items removed by customer
- **Audit trail**: Show who cancelled what and when (customer vs staff)
- **Order history**: Keep record of modifications for analytics
- **Removed items view**: 
  - Default: Hide removed items (show only active items)
  - Toggle on: Show all items including removed ones
  - Visual distinction: Removed items shown with strikethrough, grayed out, "Removed by customer" label

### Edge Cases

#### Edge Case: Partial Delivery + Modification
- **Scenario**: Order has 2x Pizza, 1x delivered, customer wants to remove the other
- **Handling**: Allow removal of undelivered item, block removal of delivered item
- **Result**: Order shows 1x Pizza (delivered), 1x Pizza (removed)

#### Edge Case: Modification During Preparation
- **Scenario**: Customer removes item while kitchen is preparing it
- **Handling**: 
  - If item status is `preparing`, mark as `cancelled`
  - Notify kitchen staff to stop preparation
  - Recalculate order total
- **Note**: May result in wasted ingredients, but customer satisfaction is priority

#### Edge Case: Multiple Modifications
- **Scenario**: Customer removes item, then adds different item, then changes quantity
- **Handling**: Each modification is independent, recalculate after each change
- **Audit**: Track all modifications in order history

#### Edge Case: Modification After Payment
- **Scenario**: Customer paid, then wants to modify order
- **Handling**: 
  - Block modification (order is paid)
  - If refund needed, handle through separate refund process
  - Consider: Allow modification if order not yet delivered (requires refund)

### Status Transitions for Cancelled Items

- **Item cancellation**: `pending` → `cancelled`, `preparing` → `cancelled`, `ready` → `cancelled`
- **Cannot cancel**: `delivered` → `cancelled` (already delivered)
- **Order cancellation**: All items → `cancelled`, order status → `cancelled`

### Order Total Recalculation

After modification:
1. Sum all non-removed items: `total = sum(item.price_cents * item.quantity WHERE removed_by_customer = false)`
2. Exclude removed items from total (but keep them in database)
3. Update order total in database
4. Return new total to customer
5. Notify restaurant staff of new total

**Important**: Removed items are still in database, just excluded from calculations and default views.

### Soft Delete Implementation (Never Delete Data)

#### Principle: Preserve All Data for Audit Trail

**Why Soft Delete?**
- ✅ **Audit Trail**: Track what was ordered, when, and why it was removed
- ✅ **Financial Reporting**: Accurate revenue tracking (know what was cancelled)
- ✅ **Dispute Resolution**: Customer says "I didn't order that" - can verify
- ✅ **Analytics**: Understand cancellation patterns, popular items, etc.
- ✅ **Legal Compliance**: Some jurisdictions require keeping order records
- ✅ **Data Integrity**: Maintain referential integrity in database

#### Database Schema for Soft Delete

```sql
-- OrderItem table with soft delete fields
CREATE TABLE orderitem (
    id INT PRIMARY KEY,
    order_id INT,
    product_id INT,
    product_name VARCHAR(255),
    quantity INT,
    price_cents INT,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    
    -- Soft delete fields
    removed_by_customer BOOLEAN DEFAULT FALSE,
    removed_at TIMESTAMP NULL,
    removed_reason VARCHAR(255) NULL,  -- Optional: "Changed mind", "Wrong item", etc.
    removed_by_user_id INT NULL,  -- If removed by staff, track who
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (order_id) REFERENCES "order"(id)
);

-- Index for filtering removed items
CREATE INDEX idx_orderitem_active ON orderitem(order_id, removed_by_customer) 
WHERE removed_by_customer = FALSE;
```

#### Query Patterns

**Get Active Items (Default View)**:
```sql
SELECT * FROM orderitem 
WHERE order_id = 10 
  AND removed_by_customer = FALSE
ORDER BY created_at;
```

**Get All Items Including Removed (Restaurant View)**:
```sql
SELECT * FROM orderitem 
WHERE order_id = 10 
ORDER BY 
  removed_by_customer ASC,  -- Active items first
  created_at;
```

**Calculate Order Total (Exclude Removed Items)**:
```sql
SELECT SUM(price_cents * quantity) as total_cents
FROM orderitem
WHERE order_id = 10 
  AND removed_by_customer = FALSE;
```

#### API Response Patterns

**Default Response (Active Items Only)**:
```json
{
  "order_id": 10,
  "items": [
    { "id": 1, "product_name": "Pizza", "quantity": 1, "status": "pending" },
    { "id": 2, "product_name": "Beer", "quantity": 2, "status": "preparing" }
  ],
  "total_cents": 3500
}
```

**With Removed Items (Restaurant View)**:
```json
{
  "order_id": 10,
  "items": [
    { "id": 1, "product_name": "Pizza", "quantity": 1, "status": "pending" },
    { "id": 2, "product_name": "Beer", "quantity": 2, "status": "preparing" },
    { 
      "id": 3, 
      "product_name": "Salad", 
      "quantity": 1, 
      "status": "cancelled",
      "removed_by_customer": true,
      "removed_at": "2026-01-13T12:30:00Z",
      "removed_reason": "Changed mind"
    }
  ],
  "total_cents": 3500,
  "removed_items_count": 1
}
```

#### Restaurant Backend UI

**Order Detail View with Toggle**:
```
┌─────────────────────────────────────────┐
│ Order #10 - Table 5 - John             │
│ Total: $35.00                           │
│                                         │
│ [✓] Show Removed Items                  │
├─────────────────────────────────────────┤
│ Active Items:                           │
│ • 1x Pizza Margherita - Pending        │
│ • 2x Beer - Preparing                  │
│                                         │
│ Removed Items (when toggle ON):         │
│ • ~~1x Salad~~ - Removed by customer    │
│   Removed at: 12:30 PM                 │
│   Reason: Changed mind                  │
└─────────────────────────────────────────┘
```

**Features**:
- **Toggle button**: "Show Removed Items" checkbox
- **Visual distinction**: Removed items with strikethrough, grayed out, different background
- **Metadata display**: Show `removed_at` timestamp and `removed_reason` if provided
- **Filtering**: Default view excludes removed items, toggle shows all
- **Export**: Include removed items in order history exports for analytics

### Implementation Priority

**Phase 1: Basic Cancellation with Soft Delete**
- Implement soft delete (never delete from database)
- Add `removed_by_customer`, `removed_at` fields to OrderItem
- Mark items as removed instead of deleting
- Recalculate order total (exclude removed items)
- Allow cancelling entire order (if no items delivered)

**Phase 2: Restaurant Backend - Show Removed Items**
- Add toggle "Show Removed Items" in restaurant interface
- Display removed items with visual distinction (strikethrough, grayed out)
- Show removal metadata (when, why, by whom)
- Default view: Hide removed items
- Toggle view: Show all items including removed

**Phase 3: Quantity Updates**
- Allow changing item quantities
- Handle quantity = 0 as removal (soft delete)

**Phase 4: Advanced Features**
- Item replacement (change product)
- Modification after payment (with refund)
- Modification history/audit trail
- Automatic cancellation of items in preparation
- Analytics dashboard showing cancellation patterns

## Known Issues

### Issue 1: Order Status Not Reset When Adding Items to Ready Order ✅
**Status**: FIXED
**Severity**: High - Breaks restaurant workflow (RESOLVED)

**Problem**: 
When a customer adds new items to an order that's already marked as `ready`, the order status should be reset to `preparing` so restaurant staff can prepare the new items. Currently, the order remains in `ready` status, and staff cannot prepare the new items.

**Fixed Code** (line 1956-1962 in `main.py`):
```python
# Reset order status when new items are added (Issue 1 fix)
if order.status == models.OrderStatus.completed:
    order.status = models.OrderStatus.pending
    print(f"[DEBUG] Reset order status from completed to pending")
elif order.status == models.OrderStatus.ready:
    order.status = models.OrderStatus.preparing  # New items need to be prepared
    print(f"[DEBUG] Reset order status from ready to preparing (new items added)")
# If status is pending or preparing, keep it as is
```

**Implementation**: 
- ✅ Handles `completed` → `pending` reset
- ✅ Handles `ready` → `preparing` reset
- ✅ Preserves `pending` and `preparing` statuses

**Impact**:
- ✅ Restaurant staff can prepare newly added items
- ✅ Order workflow is functional
- ✅ Customers receive complete orders

## Summary

### Key Changes
1. Add `session_id` field to Order table
2. Generate unique session ID per browser/device
3. Scope order lookup by `(table_id, session_id)` instead of just `table_id`
4. Maintain backward compatibility with existing orders

### Benefits
- ✅ Each browser session has independent orders
- ✅ No order mixing between different customers
- ✅ Orders persist across page refreshes
- ✅ Restaurant can see all orders for a table
- ✅ Backward compatible with existing orders

### Risks
- ⚠️ Session ID stored in localStorage (can be cleared)
- ⚠️ UUID collision (extremely rare)
- ⚠️ Need to handle migration of existing orders

### Outstanding Issues
- ✅ **RESOLVED**: Order status reset when adding items to ready order (see Issue 1 above) - FIXED
- ✅ **RESOLVED**: Order modification/cancellation (see Edge Case 7 above) - IMPLEMENTED
- ✅ **RESOLVED**: Missing enum values (`partially_delivered`, `cancelled`) causing 500 errors - FIXED
- ✅ **RESOLVED**: Customer frontend visual feedback for item statuses - IMPLEMENTED
- ✅ **RESOLVED**: Restaurant backend "Not Paid Yet" filter view - IMPLEMENTED

### Security Implementation

#### Session ID Validation
All customer-facing order modification endpoints require and validate `session_id`:

- ✅ `POST /menu/{table_token}/order` - Accepts `session_id` in body
- ✅ `GET /menu/{table_token}/order` - Accepts `session_id` as query param
- ✅ `DELETE /menu/{table_token}/order/{order_id}/items/{item_id}` - **Requires** `session_id` query param
- ✅ `PUT /menu/{table_token}/order/{order_id}/items/{item_id}` - **Requires** `session_id` query param
- ✅ `DELETE /menu/{table_token}/order/{order_id}` - **Requires** `session_id` query param

**Security Logic**:
- Backend validates that `order.session_id == provided_session_id`
- Returns `403 Forbidden` if validation fails
- Prevents cross-session order modification (customers can only modify their own orders)

## Restaurant Staff Order Management

### Use Case: Manual Payment (Terminal/Cash)

**Scenario**: Customer orders, receives items, then pays at bar/terminal with cash or card terminal (not via online Stripe payment).

**Business Rules**:
- Order status `completed` means all items are delivered, but payment may not be received yet
- Restaurant staff can manually mark order as `paid` in the backend interface
- This is separate from online Stripe payment flow

**Implementation**:
- Add "Mark as Paid" button in restaurant orders interface for `completed` orders
- Endpoint: `PUT /orders/{order_id}/mark-paid` (restaurant staff only)
- Updates order status from `completed` → `paid`
- Records payment method (cash/terminal) for audit trail

### Use Case: Staff Edit Orders (Customer Verbal Requests)

**Scenario**: Customer approaches waiter/bar staff and requests changes to order (e.g., "I ordered 154x by mistake, please change to 1x").

**Business Rules**:
- Restaurant staff can edit orders when customers request changes verbally
- Staff can modify item quantities, remove items, or add items
- Changes should be tracked for audit purposes (who made the change, when, why)

**Implementation**:
- Add "Edit Order" button in restaurant orders interface
- Endpoint: `PUT /orders/{order_id}/items/{item_id}` (restaurant staff) - Update quantity
- Endpoint: `DELETE /orders/{order_id}/items/{item_id}` (restaurant staff) - Remove item (with reason)
- Endpoint: `POST /orders/{order_id}/items` (restaurant staff) - Add items to existing order
- Track `modified_by_user_id` and `modified_at` for audit trail

### Use Case: Customer Edit Quantities (Before Preparation)

**Scenario**: Customer realizes they ordered wrong quantity before items are being prepared.

**Business Rules**:
- Customers can edit item quantities if items are still `pending` (not yet `preparing`)
- Once items are `preparing`, `ready`, or `delivered`, customers cannot modify
- Restaurant staff can always modify (see above)

**Implementation**:
- Add quantity edit controls in customer frontend for `pending` items
- Use existing `PUT /menu/{table_token}/order/{order_id}/items/{item_id}` endpoint
- Validation: Only allow if item status is `pending`

### Use Case: Reset Item Status (Restaurant Staff)

**Scenario**: Waiter marked item as "preparing" by mistake, needs to reset to "pending".

**Business Rules**:
- Restaurant staff can reset item status from `preparing` → `pending`
- Cannot reset from `ready` → `preparing` (item is already prepared)
- Cannot reset from `delivered` → any status (already delivered)

**Implementation**:
- Add "Reset Status" button in restaurant orders interface for items with status `preparing`
- Endpoint: `PUT /orders/{order_id}/items/{item_id}/reset-status` (restaurant staff only)
- Validation: Only allow reset from `preparing` → `pending`

### Use Case: Cancel Ready Items with Justification

**Scenario**: Item is marked as "ready" but customer cancels or item is lost/wasted. Need justification for tax authorities.

**Business Rules**:
- If item is `ready`, canceling requires a justification/reason
- Justification is stored for audit trail and tax reporting
- Cannot cancel `delivered` items

**Implementation**:
- When canceling `ready` items, require justification field
- Store `cancelled_reason` and `cancelled_by_user_id` in database
- Endpoint: `PUT /orders/{order_id}/items/{item_id}/cancel` (restaurant staff)
- Validation: Require `reason` field if item status is `ready`

## Restaurant Staff Order Management ✅ **IMPLEMENTED**

### Use Case: Manual Payment (Terminal/Cash) ✅ **IMPLEMENTED**

**Scenario**: Customer orders, receives items, then pays at bar/terminal with cash or card terminal (not via online Stripe payment).

**Business Rules**:
- Order status `completed` means all items are delivered, but payment may not be received yet
- Restaurant staff can manually mark order as `paid` in the backend interface
- This is separate from online Stripe payment flow
- Orders with `status = completed` and `paid_at = null` are considered "not paid yet"

**Implementation**:
- ✅ "Mark as Paid" button in restaurant orders interface for `completed` orders
- ✅ Endpoint: `PUT /orders/{order_id}/mark-paid` (restaurant staff only)
- ✅ Updates order status from `completed` → `paid`
- ✅ Records payment method (cash/terminal) and `paid_by_user_id` for audit trail
- ✅ **"Not Paid Yet" Filter View**: Dedicated tab to show all unpaid completed orders
- ✅ Filter tabs allow switching between "Active Orders" (work to be done) and "Not Paid Yet" (payment tracking)
- ✅ Badge count on "Not Paid Yet" tab shows number of unpaid orders
- ✅ Backend includes `paid_at` and `payment_method` in order response

### Use Case: Staff Edit Orders (Customer Verbal Requests) ✅ **IMPLEMENTED**

**Scenario**: Customer approaches waiter/bar staff and requests changes to order (e.g., "I ordered 154x by mistake, please change to 1x").

**Business Rules**:
- Restaurant staff can edit orders when customers request changes verbally
- Staff can modify item quantities, remove items, or add items
- Changes are tracked for audit purposes (who made the change, when, why)

**Implementation**:
- ✅ Quantity input field in restaurant orders interface (editable for non-delivered items)
- ✅ "Remove Item" button for staff (requires reason if item is `ready`)
- ✅ Endpoint: `PUT /orders/{order_id}/items/{item_id}` (restaurant staff) - Update quantity
- ✅ Endpoint: `DELETE /orders/{order_id}/items/{item_id}` (restaurant staff) - Remove item (with reason if ready)
- ✅ Tracks `modified_by_user_id` and `modified_at` for audit trail

### Use Case: Customer Edit Quantities (Before Preparation) ✅ **IMPLEMENTED**

**Scenario**: Customer realizes they ordered wrong quantity before items are being prepared.

**Business Rules**:
- Customers can edit item quantities if items are still `pending` (not yet `preparing`)
- Once items are `preparing`, `ready`, or `delivered`, customers cannot modify
- Restaurant staff can always modify (see above)

**Implementation**:
- ✅ Quantity input field in customer frontend for `pending` items
- ✅ Uses existing `PUT /menu/{table_token}/order/{order_id}/items/{item_id}` endpoint
- ✅ Validation: Only allows if item status is `pending`

### Use Case: Reset Item Status (Restaurant Staff) ✅ **IMPLEMENTED**

**Scenario**: Waiter marked item as "preparing" by mistake, needs to reset to "pending".

**Business Rules**:
- Restaurant staff can reset item status from `preparing` → `pending`
- Cannot reset from `ready` → `preparing` (item is already prepared)
- Cannot reset from `delivered` → any status (already delivered)

**Implementation**:
- ✅ "Reset" button in restaurant orders interface for items with status `preparing`
- ✅ Endpoint: `PUT /orders/{order_id}/items/{item_id}/reset-status` (restaurant staff only)
- ✅ Validation: Only allows reset from `preparing` → `pending`

### Use Case: Cancel Ready Items with Justification ✅ **IMPLEMENTED**

**Scenario**: Item is marked as "ready" but customer cancels or item is lost/wasted. Need justification for tax authorities.

**Business Rules**:
- If item is `ready`, canceling requires a justification/reason
- Justification is stored for audit trail and tax reporting
- Cannot cancel `delivered` items

**Implementation**:
- ✅ When canceling `ready` items, requires justification field
- ✅ Stores `cancelled_reason` and `removed_by_user_id` in database
- ✅ Endpoint: `PUT /orders/{order_id}/items/{item_id}/cancel` (restaurant staff)
- ✅ Validation: Requires `reason` field if item status is `ready`
- ✅ Prompt in UI asks for reason when canceling ready items

## Customer Frontend Visual Feedback ✅ **IMPLEMENTED**

### Use Case: Item Status Indicators

**Scenario**: Customer wants to see the status of individual items in their order (e.g., "Preparing", "Ready", "Delivered") for better transparency.

**Business Rules**:
- Each order item displays its current status with a visual badge
- Status updates in real-time via WebSocket
- Status badges use color coding for quick recognition

**Implementation**:
- ✅ Visual status badges for each item in customer order view
- ✅ Status labels: `Pending` (orange), `Preparing` (blue), `Ready` (green), `Delivered` (gray), `Cancelled` (gray)
- ✅ Real-time updates via WebSocket when restaurant staff change item status
- ✅ Badges appear next to item name and price
- ✅ Method: `getItemStatusLabel()` formats status for display

**Visual Design**:
- Pending: Orange/yellow badge with warning color
- Preparing: Blue badge indicating work in progress
- Ready: Green badge indicating item is ready for delivery
- Delivered: Gray badge indicating completion
- Cancelled: Gray badge for cancelled items

## Restaurant Backend Payment Management ✅ **IMPLEMENTED**

### Use Case: "Not Paid Yet" Filter View

**Scenario**: Order is fully delivered (`completed` status) but customer pays with cash or card terminal (not online). Restaurant staff needs a dedicated view to track and mark these orders as paid.

**Business Rules**:
- Orders with `status = completed` and `paid_at = null` are considered "not paid yet"
- Staff can filter orders to show only unpaid completed orders
- Staff can switch between "Active Orders" (work to be done) and "Not Paid Yet" (payment tracking)
- After marking as paid, order moves to "Order History"

**Implementation**:
- ✅ Filter tabs: "Active Orders" and "Not Paid Yet"
- ✅ "Not Paid Yet" tab shows badge count of unpaid orders
- ✅ Computed signal `notPaidOrders()` filters orders: `status === 'completed' && !paid_at`
- ✅ Each unpaid order displays "Mark as Paid" button
- ✅ Backend includes `paid_at` and `payment_method` in order response
- ✅ Empty state message when all orders are paid

**User Flow**:
1. Order is delivered → Status becomes `completed`, `paid_at = null`
2. Order appears in "Not Paid Yet" view
3. Customer pays cash/terminal at bar
4. Staff clicks "Not Paid Yet" tab → Sees order #11
5. Staff clicks "Mark as Paid" → Enters payment method (cash/terminal)
6. Order status changes to `paid`, `paid_at` is recorded
7. Order moves to "Order History" section

## Database Schema Fixes ✅ **IMPLEMENTED**

### Issue: Missing Enum Values

**Problem**: Database enum `orderstatus` was missing `partially_delivered` and `cancelled` values, causing 500 errors when trying to update order status.

**Root Cause**:
- Python `OrderStatus` enum included: `pending`, `preparing`, `ready`, `partially_delivered`, `paid`, `completed`, `cancelled`
- Database enum only had: `pending`, `preparing`, `ready`, `paid`, `completed`
- When `compute_order_status_from_items()` returned `partially_delivered`, PostgreSQL rejected it

**Fix**:
- ✅ Migration: `20260113000003_add_missing_order_status_enum_values.sql`
- ✅ Added `partially_delivered` to `orderstatus` enum
- ✅ Added `cancelled` to `orderstatus` enum
- ✅ Migration applied successfully

**Result**: Order status updates now work correctly, including partial delivery scenarios.

### Future Enhancements (Phase 4 - Optional)
- ⚠️ **LOW PRIORITY**: Batch status updates (`PUT /orders/{order_id}/items/batch-status`)
- ⚠️ **LOW PRIORITY**: Status history/audit trail
- ⚠️ **LOW PRIORITY**: Item replacement (change product)
- ⚠️ **LOW PRIORITY**: Modification after payment (with refund)
- ⚠️ **LOW PRIORITY**: Analytics dashboard for cancellation patterns
