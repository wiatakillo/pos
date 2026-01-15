/**
 * Inventory Items Component
 *
 * Main view for managing inventory items (raw materials, supplies).
 * Follows app design patterns from products.component.ts
 */

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../../shared/sidebar.component';
import { InventoryService } from '../inventory.service';
import {
  InventoryItem,
  InventoryItemCreate,
  InventoryItemUpdate,
  StockAdjustment,
  Supplier,
  UnitOfMeasure,
  InventoryCategory,
} from '../inventory.types';

@Component({
  selector: 'app-inventory-items',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, SidebarComponent],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>Inventory Items</h1>
        @if (!showItemModal() && !showAdjustModal()) {
          <button class="btn btn-primary" (click)="openCreateModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Item
          </button>
        }
      </div>

      <div class="content">
        <!-- Filters -->
        <div class="filters-bar">
          <div class="search-group">
            <input
              type="text"
              placeholder="Search by name or SKU..."
              [(ngModel)]="searchQuery"
              (input)="filterItems()"
            />
          </div>
          <select [(ngModel)]="categoryFilter" (change)="filterItems()">
            <option value="">All Categories</option>
            @for (cat of categories; track cat) {
              <option [value]="cat">{{ formatCategory(cat) }}</option>
            }
          </select>
          <label class="checkbox-filter">
            <input type="checkbox" [(ngModel)]="showLowStock" (change)="filterItems()" />
            <span>Low Stock Only</span>
          </label>
        </div>

        <!-- Stats Cards -->
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-value">{{ totalItems() }}</span>
            <span class="stat-label">Total Items</span>
          </div>
          <div class="stat-card stat-warning">
            <span class="stat-value">{{ lowStockCount() }}</span>
            <span class="stat-label">Low Stock</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ formatCurrency(totalValue()) }}</span>
            <span class="stat-label">Total Value</span>
          </div>
        </div>

        @if (error()) {
          <div class="error-banner">
            <span>{{ error() }}</span>
            <button class="icon-btn" (click)="error.set('')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        }

        @if (loading()) {
          <div class="empty-state">
            <p>Loading items...</p>
          </div>
        } @else if (filteredItems().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
            </div>
            <h3>No inventory items yet</h3>
            <p>Add your first item to start tracking inventory</p>
            <button class="btn btn-primary" (click)="openCreateModal()">Add Item</button>
          </div>
        } @else {
          <div class="table-card">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Reorder</th>
                  <th>Avg. Cost</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (item of filteredItems(); track item.id) {
                  <tr [class.low-stock-row]="item.is_low_stock">
                    <td class="sku-cell">{{ item.sku || '-' }}</td>
                    <td>
                      <div>{{ item.name || '-' }}</div>
                      @if (item.description) {
                        <small class="text-muted">{{ item.description }}</small>
                      }
                    </td>
                    <td>{{ item.category ? formatCategory(item.category) : '-' }}</td>
                    <td [class.negative]="(item.current_quantity || 0) < 0">
                      {{ (item.current_quantity || 0).toFixed(2) }} {{ item.unit || '' }}
                    </td>
                    <td>{{ (item.reorder_level || 0).toFixed(2) }}</td>
                    <td>{{ formatCurrency(item.average_cost_cents || 0) }}</td>
                    <td>{{ formatCurrency((item.current_quantity || 0) * (item.average_cost_cents || 0)) }}</td>
                    <td>
                      @if (item.is_low_stock) {
                        <span class="status-badge warning">Low Stock</span>
                      } @else if (!item.is_active) {
                        <span class="status-badge">Inactive</span>
                      } @else {
                        <span class="status-badge success">OK</span>
                      }
                    </td>
                    <td class="actions">
                      <button class="icon-btn" title="Adjust Stock" (click)="openAdjustModal(item)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 20V10M18 20V4M6 20v-4"/>
                        </svg>
                      </button>
                      <button class="icon-btn" title="Edit" (click)="openEditModal(item)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button class="icon-btn icon-btn-danger" title="Delete" (click)="confirmDelete(item)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- Create/Edit Modal -->
      @if (showItemModal()) {
        <div class="modal-overlay" (click)="closeModals()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="form-header">
              <h3>{{ editingItem() ? 'Edit Item' : 'New Item' }}</h3>
              <button class="icon-btn" (click)="closeModals()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form [formGroup]="itemForm" (ngSubmit)="saveItem()">
              <div class="form-row">
                <div class="form-group">
                  <label for="sku">SKU</label>
                  <input type="text" id="sku" formControlName="sku" placeholder="e.g., FLOUR-001" />
                </div>
                <div class="form-group">
                  <label for="name">Name</label>
                  <input type="text" id="name" formControlName="name" placeholder="e.g., All-Purpose Flour" />
                </div>
              </div>
              <div class="form-group">
                <label for="description">Description</label>
                <input type="text" id="description" formControlName="description" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="unit">Unit</label>
                  <select id="unit" formControlName="unit">
                    @for (unit of units; track unit) {
                      <option [value]="unit">{{ formatUnit(unit) }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label for="category">Category</label>
                  <select id="category" formControlName="category">
                    @for (cat of categories; track cat) {
                      <option [value]="cat">{{ formatCategory(cat) }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="reorder_level">Reorder Level</label>
                  <input type="number" id="reorder_level" formControlName="reorder_level" step="0.01" min="0" />
                </div>
                <div class="form-group">
                  <label for="reorder_quantity">Reorder Qty</label>
                  <input type="number" id="reorder_quantity" formControlName="reorder_quantity" step="0.01" min="0" />
                </div>
              </div>
              <div class="form-group">
                <label for="default_supplier_id">Default Supplier</label>
                <select id="default_supplier_id" formControlName="default_supplier_id">
                  <option [value]="null">-- None --</option>
                  @for (supplier of suppliers(); track supplier.id) {
                    <option [value]="supplier.id">{{ supplier.name }}</option>
                  }
                </select>
              </div>
              @if (editingItem()) {
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" formControlName="is_active" />
                    <span>Item is Active</span>
                  </label>
                </div>
              }
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModals()">Cancel</button>
                <button type="submit" class="btn btn-primary" [disabled]="!itemForm.valid || saving()">
                  {{ saving() ? 'Saving...' : (editingItem() ? 'Update' : 'Create') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Stock Adjustment Modal -->
      @if (showAdjustModal()) {
        <div class="modal-overlay" (click)="closeModals()">
          <div class="modal modal-sm" (click)="$event.stopPropagation()">
            <div class="form-header">
              <h3>Adjust Stock</h3>
              <button class="icon-btn" (click)="closeModals()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form [formGroup]="adjustForm" (ngSubmit)="submitAdjustment()">
              <div class="adjust-item-info">
                <strong>{{ adjustingItem()?.name }}</strong>
                <span>Current: {{ adjustingItem()?.current_quantity?.toFixed(2) }} {{ adjustingItem()?.unit }}</span>
              </div>
              <div class="form-group">
                <label>Adjustment Type</label>
                <div class="radio-group">
                  <label class="radio-label">
                    <input type="radio" formControlName="adjustment_type" value="adjustment_add" />
                    <span>Add Stock</span>
                  </label>
                  <label class="radio-label">
                    <input type="radio" formControlName="adjustment_type" value="adjustment_subtract" />
                    <span>Remove Stock</span>
                  </label>
                  <label class="radio-label">
                    <input type="radio" formControlName="adjustment_type" value="waste" />
                    <span>Record Waste</span>
                  </label>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="adjust_quantity">Quantity</label>
                  <input type="number" id="adjust_quantity" formControlName="quantity" step="0.01" min="0.01" />
                </div>
                <div class="form-group">
                  <label for="adjust_unit">Unit</label>
                  <select id="adjust_unit" formControlName="unit">
                    @for (unit of units; track unit) {
                      <option [value]="unit">{{ formatUnit(unit) }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="adjust_notes">Notes</label>
                <input type="text" id="adjust_notes" formControlName="notes" placeholder="Reason for adjustment" />
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModals()">Cancel</button>
                <button type="submit" class="btn btn-primary" [disabled]="!adjustForm.valid || saving()">
                  {{ saving() ? 'Processing...' : 'Apply' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (showDeleteModal()) {
        <div class="modal-overlay" (click)="closeModals()">
          <div class="modal modal-sm" (click)="$event.stopPropagation()">
            <h3>Delete Item</h3>
            <p>Are you sure you want to delete "{{ deletingItem()?.name }}"?</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" (click)="closeModals()">Cancel</button>
              <button class="btn btn-danger" (click)="deleteItem()" [disabled]="saving()">
                {{ saving() ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
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

    .filters-bar {
      display: flex;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
      flex-wrap: wrap;
      align-items: center;
    }

    .search-group {
      flex: 1;
      min-width: 200px;
      input {
        width: 100%;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        font-size: 0.9375rem;
        &:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
      }
    }

    .filters-bar select {
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      background: var(--color-surface);
      min-width: 150px;
    }

    .checkbox-filter {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.875rem;
      cursor: pointer;
      input { cursor: pointer; }
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-5);
    }

    .stat-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      text-align: center;
    }

    .stat-card.stat-warning {
      border-color: var(--color-warning);
      background: rgba(245, 158, 11, 0.05);
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .error-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(220, 38, 38, 0.1);
      color: var(--color-error);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-4);
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
    tr.low-stock-row td { background: rgba(245, 158, 11, 0.05); }

    .sku-cell { font-family: monospace; font-size: 0.8rem; color: var(--color-text-muted); }
    .text-muted { color: var(--color-text-muted); font-size: 0.8125rem; display: block; margin-top: 2px; }
    .negative { color: var(--color-error); }
    .actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

    .status-badge {
      display: inline-block;
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--color-bg);
      color: var(--color-text-muted);
      &.success { background: var(--color-success-light); color: var(--color-success); }
      &.warning { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
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
      transition: all 0.15s ease;
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    .btn-primary { background: var(--color-primary); color: white; &:hover:not(:disabled) { background: var(--color-primary-hover); } }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover:not(:disabled) { background: var(--color-border); } }
    .btn-danger { background: var(--color-error); color: white; &:hover:not(:disabled) { background: #b91c1c; } }

    .icon-btn {
      background: none;
      border: none;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      &:hover { background: var(--color-bg); color: var(--color-text); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .icon-btn-danger:hover { background: rgba(220, 38, 38, 0.1); color: var(--color-error); }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
    }

    .modal {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      max-width: 500px;
      width: 90%;
      box-shadow: var(--shadow-lg);
      &.modal-sm { max-width: 400px; }
      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; }
      p { margin: 0 0 var(--space-5); color: var(--color-text-muted); }
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    }

    .form-row { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4); }

    .form-group { flex: 1; min-width: 150px; margin-bottom: var(--space-3); }

    .form-group label { display: block; margin-bottom: var(--space-2); font-size: 0.875rem; font-weight: 500; color: var(--color-text); }

    .form-group input,
    .form-group select {
      width: 100%;
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      background: var(--color-surface);
      color: var(--color-text);
      &:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
      &:disabled { opacity: 0.6; cursor: not-allowed; background: var(--color-bg); }
    }

    .form-actions { display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4); }
    .modal-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
      font-size: 0.875rem;
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .radio-label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
      font-size: 0.875rem;
    }

    .adjust-item-info {
      background: var(--color-bg);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9375rem;
    }

    @media (max-width: 768px) {
      .filters-bar { flex-direction: column; }
      .search-group { width: 100%; }
      .form-row { flex-direction: column; }
      .form-group { min-width: 100%; }
      table { font-size: 0.875rem; }
      th, td { padding: var(--space-3); }
    }
  `]
})
export class InventoryItemsComponent implements OnInit {
  private inventoryService = inject(InventoryService);
  private fb = inject(FormBuilder);

  // State signals
  items = signal<InventoryItem[]>([]);
  suppliers = signal<Supplier[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  showItemModal = signal(false);
  showAdjustModal = signal(false);
  showDeleteModal = signal(false);
  editingItem = signal<InventoryItem | null>(null);
  adjustingItem = signal<InventoryItem | null>(null);
  deletingItem = signal<InventoryItem | null>(null);

  // Filter state
  searchQuery = '';
  categoryFilter = '';
  showLowStock = false;

  // Static data
  units: UnitOfMeasure[] = ['piece', 'gram', 'kilogram', 'ounce', 'pound', 'milliliter', 'liter', 'fluid_ounce', 'cup', 'gallon'];
  categories: InventoryCategory[] = ['ingredients', 'beverages', 'packaging', 'cleaning', 'equipment', 'other'];

  itemForm: FormGroup = this.fb.group({
    sku: ['', Validators.required],
    name: ['', Validators.required],
    description: [''],
    unit: ['piece', Validators.required],
    category: ['ingredients', Validators.required],
    reorder_level: [0],
    reorder_quantity: [0],
    default_supplier_id: [null],
    is_active: [true],
  });

  adjustForm: FormGroup = this.fb.group({
    quantity: [1, [Validators.required, Validators.min(0.01)]],
    unit: ['piece', Validators.required],
    adjustment_type: ['adjustment_add', Validators.required],
    notes: [''],
  });

  filteredItems = computed(() => {
    let result = this.items();
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
    }
    if (this.categoryFilter) {
      result = result.filter(i => i.category === this.categoryFilter);
    }
    if (this.showLowStock) {
      result = result.filter(i => i.is_low_stock);
    }
    return result;
  });

  totalItems = computed(() => this.filteredItems().length);
  lowStockCount = computed(() => this.items().filter(i => i.is_low_stock).length);
  totalValue = computed(() => this.filteredItems().reduce((sum, i) => sum + i.current_quantity * i.average_cost_cents, 0));

  ngOnInit() {
    this.loadItems();
    this.loadSuppliers();
  }

  loadItems() {
    this.loading.set(true);
    this.inventoryService.getItems({ activeOnly: false }).subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: err => { this.error.set(err.error?.detail || 'Failed to load items'); this.loading.set(false); }
    });
  }

  loadSuppliers() {
    this.inventoryService.getSuppliers().subscribe({
      next: suppliers => this.suppliers.set(suppliers),
      error: err => console.error('Failed to load suppliers:', err)
    });
  }

  filterItems() { this.items.update(items => [...items]); }

  openCreateModal() {
    this.editingItem.set(null);
    this.itemForm.reset({ sku: '', name: '', description: '', unit: 'piece', category: 'ingredients', reorder_level: 0, reorder_quantity: 0, default_supplier_id: null, is_active: true });
    this.showItemModal.set(true);
  }

  openEditModal(item: InventoryItem) {
    this.editingItem.set(item);
    this.itemForm.patchValue({ sku: item.sku, name: item.name, description: item.description || '', unit: item.unit, category: item.category, reorder_level: item.reorder_level, reorder_quantity: item.reorder_quantity, default_supplier_id: item.default_supplier_id, is_active: item.is_active });
    this.showItemModal.set(true);
  }

  openAdjustModal(item: InventoryItem) {
    this.adjustingItem.set(item);
    this.adjustForm.reset({ quantity: 1, unit: item.unit, adjustment_type: 'adjustment_add', notes: '' });
    this.showAdjustModal.set(true);
  }

  confirmDelete(item: InventoryItem) {
    this.deletingItem.set(item);
    this.showDeleteModal.set(true);
  }

  closeModals() {
    this.showItemModal.set(false);
    this.showAdjustModal.set(false);
    this.showDeleteModal.set(false);
    this.editingItem.set(null);
    this.adjustingItem.set(null);
    this.deletingItem.set(null);
  }

  saveItem() {
    if (!this.itemForm.valid) return;
    this.saving.set(true);
    const data = this.itemForm.value;

    if (this.editingItem()) {
      this.inventoryService.updateItem(this.editingItem()!.id, data).subscribe({
        next: () => { this.saving.set(false); this.closeModals(); this.loadItems(); },
        error: err => { this.error.set(err.error?.detail || 'Failed to update'); this.saving.set(false); }
      });
    } else {
      this.inventoryService.createItem(data).subscribe({
        next: () => { this.saving.set(false); this.closeModals(); this.loadItems(); },
        error: err => { this.error.set(err.error?.detail || 'Failed to create'); this.saving.set(false); }
      });
    }
  }

  submitAdjustment() {
    if (!this.adjustForm.valid || !this.adjustingItem()) return;
    this.saving.set(true);
    const data = this.adjustForm.value;
    const adjustment: StockAdjustment = { quantity: data.quantity, unit: data.unit, adjustment_type: data.adjustment_type, notes: data.notes || undefined };

    this.inventoryService.adjustStock(this.adjustingItem()!.id, adjustment).subscribe({
      next: () => { this.saving.set(false); this.closeModals(); this.loadItems(); },
      error: err => { this.error.set(err.error?.detail || 'Adjustment failed'); this.saving.set(false); }
    });
  }

  deleteItem() {
    if (!this.deletingItem()) return;
    this.saving.set(true);
    this.inventoryService.deleteItem(this.deletingItem()!.id).subscribe({
      next: () => { this.saving.set(false); this.closeModals(); this.loadItems(); },
      error: err => { this.error.set(err.error?.detail || 'Delete failed'); this.saving.set(false); }
    });
  }

  formatCurrency(cents: number): string { return this.inventoryService.formatCurrency(cents); }
  formatCategory(cat: string): string { return cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : '-'; }
  formatUnit(unit: string): string { return unit ? unit.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''; }
}
