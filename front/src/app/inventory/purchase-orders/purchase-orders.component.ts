/**
 * Purchase Orders Component
 *
 * List and manage purchase orders with create modal and PDF export.
 * Follows app design patterns.
 */

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { SidebarComponent } from '../../shared/sidebar.component';
import { InventoryService } from '../inventory.service';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderCreate,
  PurchaseOrderItemCreate,
  Supplier,
  InventoryItem,
  UnitOfMeasure,
} from '../inventory.types';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, SidebarComponent],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>Purchase Orders</h1>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="openCreateModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create PO
          </button>
        </div>
      </div>

      <div class="content">
        <!-- Filters -->
        <div class="filters-bar">
          <select [(ngModel)]="statusFilter" (change)="loadOrders()">
            <option value="">All Statuses</option>
            @for (status of statuses; track status) {
              <option [value]="status">{{ formatStatus(status) }}</option>
            }
          </select>
          <select [(ngModel)]="supplierFilter" (change)="loadOrders()">
            <option value="">All Suppliers</option>
            @for (supplier of suppliers(); track supplier.id) {
              <option [value]="supplier.id">{{ supplier.name }}</option>
            }
          </select>
        </div>

        @if (loading()) {
          <div class="empty-state"><p>Loading orders...</p></div>
        } @else if (orders().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <h3>No purchase orders found</h3>
            <p>Create your first purchase order to get started</p>
            <button class="btn btn-primary" (click)="openCreateModal()">Create PO</button>
          </div>
        } @else {
          <div class="table-card">
            <table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Expected</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (po of orders(); track po.id) {
                  <tr>
                    <td><strong>{{ po.order_number }}</strong></td>
                    <td>{{ po.supplier_name || '-' }}</td>
                    <td>{{ formatDate(po.order_date) }}</td>
                    <td>{{ po.expected_date ? formatDate(po.expected_date) : '-' }}</td>
                    <td class="price">{{ formatCurrency(po.total_cents) }}</td>
                    <td>
                      <span class="status-badge" [class]="po.status">
                        {{ formatStatus(po.status) }}
                      </span>
                    </td>
                    <td class="actions">
                      <button class="icon-btn" title="Print PDF" (click)="downloadPdf(po)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6 9 6 2 18 2 18 9"/>
                          <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                          <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                      </button>
                      <a [routerLink]="['/inventory/purchase-orders', po.id]" class="icon-btn" title="View">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </a>
                      @if (po.status === 'draft') {
                        <button class="icon-btn icon-btn-danger" title="Cancel" (click)="cancelOrder(po)">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- Create PO Modal -->
      @if (showCreateModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal modal-lg" (click)="$event.stopPropagation()">
            <div class="form-header">
              <h3>Create Purchase Order</h3>
              <button class="icon-btn" (click)="closeModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form [formGroup]="createForm" (ngSubmit)="submitCreateForm()">
              <div class="form-row">
                <div class="form-group">
                  <label for="supplier_id">Supplier *</label>
                  <select id="supplier_id" formControlName="supplier_id" (change)="onSupplierChange()">
                    <option value="">-- Select Supplier --</option>
                    @for (supplier of suppliers(); track supplier.id) {
                      <option [value]="supplier.id">{{ supplier.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label for="expected_date">Expected Delivery Date</label>
                  <input type="date" id="expected_date" formControlName="expected_date" />
                </div>
              </div>
              <div class="form-group">
                <label for="notes">Notes</label>
                <textarea id="notes" formControlName="notes" rows="2" placeholder="Optional notes for this order"></textarea>
              </div>

              <!-- Items Section -->
              <div class="items-section">
                <div class="section-header">
                  <h4>Order Items</h4>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="addItem()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Item
                  </button>
                </div>

                @if (itemsArray.length === 0) {
                  <div class="empty-items">
                    <p>No items added yet. Click "Add Item" to start.</p>
                  </div>
                } @else {
                  <div class="items-list" formArrayName="items">
                    @for (item of itemsArray.controls; track $index; let i = $index) {
                      <div class="item-row" [formGroupName]="i">
                        <div class="item-select">
                          <label>Item</label>
                          <select formControlName="inventory_item_id" (change)="onItemSelected(i)">
                            <option value="">-- Select --</option>
                            @for (invItem of filteredInventoryItems(); track invItem.id) {
                              <option [value]="invItem.id">{{ invItem.name }} ({{ invItem.sku }})</option>
                            }
                          </select>
                        </div>
                        <div class="item-qty">
                          <label>Qty</label>
                          <input type="number" formControlName="quantity_ordered" min="0.01" step="0.01" />
                        </div>
                        <div class="item-unit">
                          <label>Unit</label>
                          <select formControlName="unit">
                            @for (unit of units; track unit) {
                              <option [value]="unit">{{ formatUnit(unit) }}</option>
                            }
                          </select>
                        </div>
                        <div class="item-cost">
                          <label>Unit Cost ($)</label>
                          <input type="number" formControlName="unit_cost_dollars" min="0" step="0.01" placeholder="0.00" />
                        </div>
                        <div class="item-total">
                          <label>Total</label>
                          <span>{{ formatCurrency(getItemTotal(i)) }}</span>
                        </div>
                        <button type="button" class="icon-btn icon-btn-danger" (click)="removeItem(i)">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    }
                  </div>
                }

                <div class="order-total">
                  <span>Order Total:</span>
                  <strong>{{ formatCurrency(orderTotal()) }}</strong>
                </div>
              </div>

              <div class="form-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" [disabled]="!createForm.valid || itemsArray.length === 0 || saving()">
                  {{ saving() ? 'Creating...' : 'Create Order' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </app-sidebar>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-5);
      h1 { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; }
    }

    .header-actions { display: flex; gap: var(--space-3); }

    .filters-bar {
      display: flex;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
      flex-wrap: wrap;
    }

    .filters-bar select {
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      background: var(--color-surface);
      min-width: 150px;
    }

    .empty-state {
      text-align: center;
      padding: var(--space-8);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-lg);
      .empty-icon { color: var(--color-text-muted); margin-bottom: var(--space-4); }
      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; color: var(--color-text); }
      p { margin: 0 0 var(--space-4); color: var(--color-text-muted); }
    }

    .table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td { padding: var(--space-4); text-align: left; }
    th { background: var(--color-bg); font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
    td { border-top: 1px solid var(--color-border); font-size: 0.9375rem; }
    tr:hover td { background: var(--color-bg); }

    .price { font-weight: 600; color: var(--color-success); }
    .actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

    .status-badge {
      display: inline-block;
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      &.draft { background: var(--color-bg); color: var(--color-text-muted); }
      &.submitted { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
      &.approved { background: var(--color-success-light); color: var(--color-success); }
      &.partially_received { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
      &.received { background: var(--color-success-light); color: var(--color-success); }
      &.cancelled { background: rgba(220, 38, 38, 0.1); color: var(--color-error); }
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border: none;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    .btn-primary { background: var(--color-primary); color: white; &:hover:not(:disabled) { background: var(--color-primary-hover); } }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover:not(:disabled) { background: var(--color-border); } }
    .btn-sm { padding: var(--space-2) var(--space-3); font-size: 0.8125rem; }

    .icon-btn {
      background: none;
      border: none;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      transition: all 0.15s ease;
      &:hover { background: var(--color-bg); color: var(--color-text); }
    }

    .icon-btn-danger:hover { background: rgba(220, 38, 38, 0.1); color: var(--color-error); }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: var(--space-4);
    }

    .modal {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      max-width: 700px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
    }

    .modal-lg { max-width: 800px; }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h3 { margin: 0; font-size: 1.25rem; font-weight: 600; }
    }

    .form-row { display: flex; gap: var(--space-4); flex-wrap: wrap; }
    .form-group { flex: 1; min-width: 200px; margin-bottom: var(--space-4); }
    .form-group label { display: block; margin-bottom: var(--space-2); font-size: 0.875rem; font-weight: 500; }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      background: var(--color-surface);
      &:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
    }

    .form-group textarea { resize: vertical; }

    .items-section {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .items-section .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h4 { margin: 0; font-size: 1rem; font-weight: 600; }
    }

    .empty-items {
      text-align: center;
      padding: var(--space-4);
      color: var(--color-text-muted);
      font-size: 0.875rem;
    }

    .items-list { display: flex; flex-direction: column; gap: var(--space-3); }

    .item-row {
      display: grid;
      grid-template-columns: 2fr 80px 100px 100px 80px 32px;
      gap: var(--space-3);
      align-items: end;
      background: var(--color-surface);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }

    .item-row label {
      display: block;
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
    }

    .item-row select,
    .item-row input {
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      width: 100%;
      background: var(--color-surface);
      color: var(--color-text);
    }

    .item-total {
      text-align: right;
      span { font-weight: 600; color: var(--color-success); }
    }

    .order-total {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-4);
      padding-top: var(--space-4);
      border-top: 2px solid var(--color-border);
      font-size: 1.125rem;
      strong { color: var(--color-success); font-size: 1.25rem; }
    }

    .form-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

    @media (max-width: 768px) {
      .filters-bar { flex-direction: column; }
      .filters-bar select { width: 100%; }
      .item-row { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class PurchaseOrdersComponent implements OnInit {
  private inventoryService = inject(InventoryService);
  private fb = inject(FormBuilder);

  orders = signal<PurchaseOrder[]>([]);
  suppliers = signal<Supplier[]>([]);
  inventoryItems = signal<InventoryItem[]>([]);
  loading = signal(true);
  saving = signal(false);
  showCreateModal = signal(false);

  statusFilter = '';
  supplierFilter = '';

  statuses: PurchaseOrderStatus[] = ['draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled'];
  units: UnitOfMeasure[] = ['piece', 'gram', 'kilogram', 'ounce', 'pound', 'milliliter', 'liter', 'fluid_ounce', 'cup', 'gallon'];

  createForm: FormGroup = this.fb.group({
    supplier_id: ['', Validators.required],
    expected_date: [''],
    notes: [''],
    items: this.fb.array([]),
  });

  get itemsArray(): FormArray {
    return this.createForm.get('items') as FormArray;
  }

  orderTotal = computed(() => {
    let total = 0;
    for (let i = 0; i < this.itemsArray.length; i++) {
      total += this.getItemTotal(i);
    }
    return total;
  });

  selectedSupplierId = signal<number | null>(null);

  filteredInventoryItems = computed(() => {
    const supplierId = this.selectedSupplierId();
    if (!supplierId) {
      // No supplier selected - show only items with a supplier assigned
      return this.inventoryItems().filter(item => item.default_supplier_id != null);
    }
    // Filter by selected supplier
    return this.inventoryItems().filter(item => item.default_supplier_id === supplierId);
  });

  ngOnInit() {
    this.loadOrders();
    this.loadSuppliers();
    this.loadInventoryItems();
  }

  loadOrders() {
    this.loading.set(true);
    const options: { status?: PurchaseOrderStatus; supplierId?: number } = {};
    if (this.statusFilter) options.status = this.statusFilter as PurchaseOrderStatus;
    if (this.supplierFilter) options.supplierId = +this.supplierFilter;

    this.inventoryService.getPurchaseOrders(options).subscribe({
      next: orders => { this.orders.set(orders); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadSuppliers() {
    this.inventoryService.getSuppliers().subscribe({
      next: suppliers => this.suppliers.set(suppliers),
      error: () => { }
    });
  }

  loadInventoryItems() {
    this.inventoryService.getItems({ activeOnly: false }).subscribe({
      next: items => {
        console.log('Loaded inventory items:', items);
        this.inventoryItems.set(items);
      },
      error: (err) => console.error('Failed to load inventory items:', err)
    });
  }

  openCreateModal() {
    this.createForm.reset();
    this.itemsArray.clear();
    this.selectedSupplierId.set(null);
    this.showCreateModal.set(true);
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.selectedSupplierId.set(null);
  }

  onSupplierChange() {
    const supplierId = this.createForm.get('supplier_id')?.value;
    this.selectedSupplierId.set(supplierId ? +supplierId : null);
    // Clear items when supplier changes since they may not be valid for new supplier
    this.itemsArray.clear();
  }

  addItem() {
    const itemGroup = this.fb.group({
      inventory_item_id: ['', Validators.required],
      quantity_ordered: [1, [Validators.required, Validators.min(0.01)]],
      unit: ['piece', Validators.required],
      unit_cost_dollars: [0, [Validators.required, Validators.min(0)]],
    });
    this.itemsArray.push(itemGroup);
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
  }

  onItemSelected(index: number) {
    const itemId = this.itemsArray.at(index).get('inventory_item_id')?.value;
    if (itemId) {
      const invItem = this.inventoryItems().find(i => i.id === +itemId);
      if (invItem) {
        this.itemsArray.at(index).patchValue({
          unit: invItem.unit || 'piece',
          unit_cost_dollars: (invItem.average_cost_cents || 0) / 100,
        });
      }
    }
  }

  getItemTotal(index: number): number {
    const itemCtrl = this.itemsArray.at(index);
    const qty = itemCtrl.get('quantity_ordered')?.value || 0;
    const costDollars = itemCtrl.get('unit_cost_dollars')?.value || 0;
    return Math.round(qty * costDollars * 100); // Return in cents
  }

  submitCreateForm() {
    if (!this.createForm.valid || this.itemsArray.length === 0) return;
    this.saving.set(true);

    const formValue = this.createForm.value;
    const poCreate: PurchaseOrderCreate = {
      supplier_id: +formValue.supplier_id,
      expected_date: formValue.expected_date || null,
      notes: formValue.notes || null,
      items: formValue.items.map((item: any) => ({
        inventory_item_id: +item.inventory_item_id,
        quantity_ordered: +item.quantity_ordered,
        unit: item.unit as UnitOfMeasure,
        unit_cost_cents: Math.round(+item.unit_cost_dollars * 100), // Convert dollars to cents
      })),
    };

    this.inventoryService.createPurchaseOrder(poCreate).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadOrders();
      },
      error: () => this.saving.set(false)
    });
  }

  cancelOrder(po: PurchaseOrder) {
    if (!confirm(`Cancel order ${po.order_number}?`)) return;
    this.inventoryService.cancelPurchaseOrder(po.id).subscribe({
      next: () => this.loadOrders(),
      error: () => { }
    });
  }

  downloadPdf(po: PurchaseOrder) {
    this.inventoryService.getPurchaseOrderPdf(po.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PO-${po.order_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('Failed to download PDF')
    });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  formatCurrency(cents: number): string {
    return this.inventoryService.formatCurrency(cents);
  }

  formatStatus(status: PurchaseOrderStatus): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatUnit(unit: string): string {
    return unit.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
