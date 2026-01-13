/**
 * Inventory Reports Component
 *
 * FIFO valuation and transaction history.
 * Follows app design patterns.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../shared/sidebar.component';
import { InventoryService } from '../inventory.service';
import { InventoryValuation, InventoryTransaction } from '../inventory.types';

@Component({
  selector: 'app-inventory-reports',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>Inventory Reports</h1>
        <button class="btn btn-secondary" (click)="loadData()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      <div class="content">
        <!-- Valuation Report -->
        <div class="section">
          <div class="section-header">
            <h2>FIFO Inventory Valuation</h2>
            @if (valuation()) {
              <span class="date-tag">As of {{ formatDateTime(valuation()!.as_of_date) }}</span>
            }
          </div>

          @if (loadingValuation()) {
            <div class="loading-state">Loading valuation...</div>
          } @else if (valuation()) {
            <div class="total-card">
              <span class="total-label">Total Inventory Value</span>
              <span class="total-value">{{ formatCurrency(valuation()!.total_value_cents) }}</span>
            </div>

            <div class="table-card">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>FIFO Value</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of valuation()!.items; track item.inventory_item_id) {
                    <tr>
                      <td class="sku-cell">{{ item.sku }}</td>
                      <td>{{ item.name }}</td>
                      <td>{{ item.quantity.toFixed(2) }} {{ item.unit }}</td>
                      <td class="price">{{ formatCurrency(item.fifo_value_cents) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <!-- Transaction History -->
        <div class="section">
          <div class="section-header">
            <h2>Recent Transactions</h2>
          </div>

          @if (loadingTransactions()) {
            <div class="loading-state">Loading transactions...</div>
          } @else if (transactions().length === 0) {
            <div class="empty-state">
              <p>No transactions yet</p>
            </div>
          } @else {
            <div class="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Cost</th>
                    <th>Balance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  @for (txn of transactions(); track txn.id) {
                    <tr>
                      <td class="date-cell">{{ formatDateTime(txn.created_at) }}</td>
                      <td>{{ txn.inventory_item_name }}</td>
                      <td>
                        <span class="type-badge" [class]="txn.transaction_type">
                          {{ formatType(txn.transaction_type) }}
                        </span>
                      </td>
                      <td [class.positive]="txn.quantity > 0" [class.negative]="txn.quantity < 0">
                        {{ txn.quantity > 0 ? '+' : '' }}{{ txn.quantity.toFixed(2) }}
                      </td>
                      <td>{{ txn.total_cost_cents ? formatCurrency(txn.total_cost_cents) : '-' }}</td>
                      <td>{{ txn.balance_after.toFixed(2) }}</td>
                      <td class="notes-cell">{{ txn.notes || '-' }}</td>
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

    .section { margin-bottom: var(--space-6); }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h2 { font-size: 1.125rem; font-weight: 600; margin: 0; }
    }

    .date-tag {
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }

    .total-card {
      background: var(--color-primary);
      color: white;
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .total-label { font-size: 0.875rem; opacity: 0.9; }
    .total-value { font-size: 2rem; font-weight: 700; }

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

    .sku-cell { font-family: monospace; font-size: 0.8rem; color: var(--color-text-muted); }
    .date-cell { font-size: 0.8rem; white-space: nowrap; }
    .notes-cell { font-size: 0.8rem; color: var(--color-text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .price { color: var(--color-success); font-weight: 600; }
    .positive { color: var(--color-success); }
    .negative { color: var(--color-error); }

    .type-badge {
      display: inline-block;
      padding: var(--space-1) var(--space-2);
      border-radius: 4px;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      &.purchase { background: var(--color-success-light); color: var(--color-success); }
      &.sale { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
      &.adjustment_add { background: var(--color-success-light); color: var(--color-success); }
      &.adjustment_subtract { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
      &.waste { background: rgba(220, 38, 38, 0.1); color: var(--color-error); }
    }

    .loading-state {
      text-align: center;
      padding: var(--space-6);
      color: var(--color-text-muted);
    }

    .empty-state {
      text-align: center;
      padding: var(--space-6);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-lg);
      color: var(--color-text-muted);
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
    }

    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover { background: var(--color-border); } }

    @media (max-width: 768px) {
      table { font-size: 0.875rem; }
      th, td { padding: var(--space-3); }
      .notes-cell { display: none; }
    }
  `]
})
export class InventoryReportsComponent implements OnInit {
  private inventoryService = inject(InventoryService);

  valuation = signal<InventoryValuation | null>(null);
  transactions = signal<InventoryTransaction[]>([]);
  loadingValuation = signal(true);
  loadingTransactions = signal(true);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loadingValuation.set(true);
    this.loadingTransactions.set(true);

    this.inventoryService.getInventoryValuation().subscribe({
      next: val => { this.valuation.set(val); this.loadingValuation.set(false); },
      error: () => this.loadingValuation.set(false)
    });

    this.inventoryService.getTransactions({ limit: 50 }).subscribe({
      next: txns => { this.transactions.set(txns); this.loadingTransactions.set(false); },
      error: () => this.loadingTransactions.set(false)
    });
  }

  formatCurrency(cents: number): string {
    return this.inventoryService.formatCurrency(cents);
  }

  formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ');
  }
}
