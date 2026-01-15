/**
 * Stock Dashboard Component
 *
 * Overview of inventory with low-stock alerts.
 * Follows app design patterns.
 */

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../../shared/sidebar.component';
import { InventoryService } from '../inventory.service';
import { StockLevel, LowStockItem, InventoryCategory } from '../inventory.types';

@Component({
  selector: 'app-stock-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>Stock Dashboard</h1>
        <button class="btn btn-secondary" (click)="loadData()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      <div class="content">
        <!-- Summary Cards -->
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-value">{{ totalItems() }}</span>
            <span class="stat-label">Total Items</span>
          </div>
          <div class="stat-card stat-warning">
            <span class="stat-value">{{ lowStockCount() }}</span>
            <span class="stat-label">Low Stock Alerts</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ formatCurrency(totalValue()) }}</span>
            <span class="stat-label">Total Inventory Value</span>
          </div>
        </div>

        <!-- Low Stock Alerts -->
        @if (lowStockItems().length > 0) {
          <div class="section">
            <div class="section-header">
              <h2>Low Stock Alerts</h2>
              <span class="badge warning">{{ lowStockItems().length }}</span>
            </div>
            <div class="alert-cards">
              @for (item of lowStockItems(); track item.id) {
                <div class="alert-card">
                  <div class="alert-info">
                    <strong>{{ item.name }}</strong>
                    <span class="sku">{{ item.sku }}</span>
                  </div>
                  <div class="alert-details">
                    <div class="alert-stat">
                      <span class="label">Current</span>
                      <span class="value negative">{{ item.current_quantity.toFixed(2) }}</span>
                    </div>
                    <div class="alert-stat">
                      <span class="label">Reorder</span>
                      <span class="value">{{ item.reorder_level.toFixed(2) }}</span>
                    </div>
                    <div class="alert-stat">
                      <span class="label">Suggest</span>
                      <span class="value primary">{{ item.suggested_order_quantity.toFixed(2) }}</span>
                    </div>
                  </div>
                  <a routerLink="/inventory/purchase-orders" class="btn btn-primary btn-sm">
                    Create PO
                  </a>
                </div>
              }
            </div>
          </div>
        }

        <!-- Stock Levels Table -->
        <div class="section">
          <div class="section-header">
            <h2>Stock Levels</h2>
            <select [(ngModel)]="categoryFilter" (change)="applyFilter()">
              <option value="">All Categories</option>
              @for (cat of categories; track cat) {
                <option [value]="cat">{{ formatCategory(cat) }}</option>
              }
            </select>
          </div>

          @if (loading()) {
            <div class="empty-state"><p>Loading stock levels...</p></div>
          } @else if (filteredStockLevels().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
              </div>
              <h3>No inventory items</h3>
              <p>Add items from the inventory page</p>
              <a routerLink="/inventory/items" class="btn btn-primary">Go to Items</a>
            </div>
          } @else {
            <div class="table-card">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Reorder Level</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of filteredStockLevels(); track item.id) {
                    <tr [class.low-stock-row]="item.is_low_stock">
                      <td class="sku-cell">{{ item.sku }}</td>
                      <td>{{ item.name }}</td>
                      <td>{{ formatCategory(item.category) }}</td>
                      <td [class.negative]="item.current_quantity < 0">
                        {{ item.current_quantity.toFixed(2) }} {{ item.unit }}
                      </td>
                      <td>{{ item.reorder_level.toFixed(2) }}</td>
                      <td>{{ formatCurrency(item.total_value_cents) }}</td>
                      <td>
                        @if (item.is_low_stock) {
                          <span class="status-badge warning">Low</span>
                        } @else {
                          <span class="status-badge success">OK</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
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

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-6);
    }

    .stat-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      text-align: center;
    }

    .stat-card.stat-warning {
      border-color: var(--color-warning);
      background: rgba(245, 158, 11, 0.05);
    }

    .stat-value {
      display: block;
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .section { margin-bottom: var(--space-6); }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h2 { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0; }
      select {
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
        background: var(--color-surface);
      }
    }

    .badge {
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      &.warning { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
    }

    .alert-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-4);
    }

    .alert-card {
      background: var(--color-surface);
      border: 1px solid var(--color-warning);
      border-left: 3px solid var(--color-warning);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .alert-info {
      strong { display: block; font-size: 0.9375rem; }
      .sku { font-size: 0.75rem; color: var(--color-text-muted); font-family: monospace; }
    }

    .alert-details {
      display: flex;
      gap: var(--space-4);
    }

    .alert-stat {
      .label { display: block; font-size: 0.6875rem; color: var(--color-text-muted); text-transform: uppercase; }
      .value { font-size: 0.9375rem; font-weight: 600; }
      .value.negative { color: var(--color-error); }
      .value.primary { color: var(--color-primary); }
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
    .negative { color: var(--color-error); }

    .status-badge {
      display: inline-block;
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
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
      text-decoration: none;
      transition: all 0.15s ease;
    }

    .btn-primary { background: var(--color-primary); color: white; &:hover { background: var(--color-primary-hover); } }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover { background: var(--color-border); } }
    .btn-sm { padding: var(--space-2) var(--space-3); font-size: 0.8125rem; }

    @media (max-width: 768px) {
      .stats-row { grid-template-columns: 1fr; }
      .alert-cards { grid-template-columns: 1fr; }
    }
  `]
})
export class StockDashboardComponent implements OnInit {
  private inventoryService = inject(InventoryService);

  stockLevels = signal<StockLevel[]>([]);
  lowStockItems = signal<LowStockItem[]>([]);
  loading = signal(true);
  categoryFilter = '';

  categories: InventoryCategory[] = ['ingredients', 'beverages', 'packaging', 'cleaning', 'equipment', 'other'];

  filteredStockLevels = computed(() => {
    let result = this.stockLevels();
    if (this.categoryFilter) {
      result = result.filter(i => i.category === this.categoryFilter);
    }
    return result;
  });

  totalItems = computed(() => this.stockLevels().length);
  lowStockCount = computed(() => this.lowStockItems().length);
  totalValue = computed(() => this.stockLevels().reduce((sum, i) => sum + i.total_value_cents, 0));

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.inventoryService.getStockLevels().subscribe({
      next: levels => { this.stockLevels.set(levels); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.inventoryService.getLowStockItems().subscribe({
      next: items => this.lowStockItems.set(items),
      error: () => { }
    });
  }

  applyFilter() {
    this.stockLevels.update(levels => [...levels]);
  }

  formatCurrency(cents: number): string {
    return this.inventoryService.formatCurrency(cents);
  }

  formatCategory(cat: string): string {
    return cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : '-';
  }
}
