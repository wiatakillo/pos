/**
 * Purchase Order Detail Component
 *
 * View and receive goods for a purchase order.
 * Follows app design patterns.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../../shared/sidebar.component';
import { InventoryService } from '../inventory.service';
import { PurchaseOrder, ReceiveGoodsInput, ReceivedItemInput } from '../inventory.types';

@Component({
  selector: 'app-purchase-order-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SidebarComponent],
  template: `
    <app-sidebar>
      @if (loading()) {
        <div class="empty-state"><p>Loading order...</p></div>
      } @else if (order()) {
        <div class="page-header">
          <div>
            <a routerLink="/inventory/purchase-orders" class="back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Orders
            </a>
            <h1>{{ order()!.order_number }}</h1>
          </div>
          @if (canReceive()) {
            <button class="btn btn-primary" (click)="showReceiveModal.set(true)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 2 13.5 11 9 8"/>
                <path d="M22 2L15 22l-4-9-9-4z"/>
              </svg>
              Receive Goods
            </button>
          }
        </div>

        <div class="content">
          <!-- Order Info Cards -->
          <div class="info-row">
            <div class="info-card">
              <span class="info-label">Supplier</span>
              <span class="info-value">{{ order()!.supplier?.name || order()!.supplier_name || '-' }}</span>
            </div>
            <div class="info-card">
              <span class="info-label">Order Date</span>
              <span class="info-value">{{ formatDate(order()!.order_date) }}</span>
            </div>
            <div class="info-card">
              <span class="info-label">Expected Date</span>
              <span class="info-value">{{ order()!.expected_date ? formatDate(order()!.expected_date!) : '-' }}</span>
            </div>
            <div class="info-card">
              <span class="info-label">Total</span>
              <span class="info-value price">{{ formatCurrency(order()!.total_cents) }}</span>
            </div>
            <div class="info-card">
              <span class="info-label">Status</span>
              <span class="status-badge" [class]="order()!.status">{{ formatStatus(order()!.status) }}</span>
            </div>
          </div>

          <!-- Line Items -->
          <div class="section">
            <h2>Line Items</h2>
            <div class="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Unit Cost</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of order()!.items; track item.id) {
                    <tr>
                      <td>
                        <strong>{{ item.inventory_item_name }}</strong>
                        <small class="text-muted">{{ item.inventory_item_sku }}</small>
                      </td>
                      <td>{{ item.quantity_ordered }} {{ item.unit }}</td>
                      <td>
                        <span [class.complete]="item.quantity_received >= item.quantity_ordered">
                          {{ item.quantity_received }}
                        </span>
                      </td>
                      <td>{{ formatCurrency(item.unit_cost_cents) }}</td>
                      <td class="price">{{ formatCurrency(item.line_total_cents) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (order()!.notes) {
            <div class="notes-section">
              <h3>Notes</h3>
              <p>{{ order()!.notes }}</p>
            </div>
          }
        </div>

        <!-- Receive Goods Modal -->
        @if (showReceiveModal()) {
          <div class="modal-overlay" (click)="showReceiveModal.set(false)">
            <div class="modal modal-lg" (click)="$event.stopPropagation()">
              <div class="form-header">
                <h3>Receive Goods</h3>
                <button class="icon-btn" (click)="showReceiveModal.set(false)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="receive-table-wrapper">
                <table class="receive-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Ordered</th>
                      <th>Already Received</th>
                      <th>Receive Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of order()!.items; track item.id; let i = $index) {
                      <tr>
                        <td>{{ item.inventory_item_name }}</td>
                        <td>{{ item.quantity_ordered }}</td>
                        <td>{{ item.quantity_received }}</td>
                        <td>
                          <input
                            type="number"
                            [(ngModel)]="receiveQuantities[i]"
                            min="0"
                            [max]="item.quantity_ordered - item.quantity_received"
                            step="0.01"
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="form-group">
                <label for="receive_notes">Notes</label>
                <input type="text" id="receive_notes" [(ngModel)]="receiveNotes" placeholder="Optional notes" />
              </div>
              <div class="form-actions">
                <button class="btn btn-secondary" (click)="showReceiveModal.set(false)">Cancel</button>
                <button class="btn btn-primary" (click)="submitReceive()" [disabled]="receiving()">
                  {{ receiving() ? 'Processing...' : 'Confirm Receipt' }}
                </button>
              </div>
            </div>
          </div>
        }
      }
    </app-sidebar>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-5);
      h1 { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; }
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: 0.875rem;
      margin-bottom: var(--space-2);
      &:hover { color: var(--color-primary); }
    }

    .info-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-5);
    }

    .info-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
    }

    .info-label {
      display: block;
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-1);
    }

    .info-value { font-size: 1rem; font-weight: 600; color: var(--color-text); }
    .info-value.price { color: var(--color-success); }

    .section { margin-bottom: var(--space-5); }
    .section h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: var(--space-4); }

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

    .text-muted { color: var(--color-text-muted); font-size: 0.8125rem; display: block; }
    .complete { color: var(--color-success); font-weight: 600; }
    .price { color: var(--color-success); font-weight: 600; }

    .status-badge {
      display: inline-block;
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      &.draft { background: var(--color-bg); color: var(--color-text-muted); }
      &.approved { background: var(--color-success-light); color: var(--color-success); }
      &.partially_received { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
      &.received { background: var(--color-success-light); color: var(--color-success); }
    }

    .notes-section {
      background: var(--color-bg);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      h3 { margin: 0 0 var(--space-2); font-size: 0.875rem; color: var(--color-text-muted); }
      p { margin: 0; }
    }

    .empty-state {
      text-align: center;
      padding: var(--space-8);
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
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    .btn-primary { background: var(--color-primary); color: white; &:hover:not(:disabled) { background: var(--color-primary-hover); } }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover:not(:disabled) { background: var(--color-border); } }

    .icon-btn {
      background: none;
      border: none;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      &:hover { background: var(--color-bg); color: var(--color-text); }
    }

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
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      &.modal-lg { max-width: 700px; }
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    }

    .receive-table-wrapper { margin-bottom: var(--space-4); }

    .receive-table {
      width: 100%;
      border-collapse: collapse;
      th, td { padding: var(--space-3); text-align: left; border-bottom: 1px solid var(--color-border); }
      th { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
      input { width: 80px; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); text-align: right; }
    }

    .form-group { margin-bottom: var(--space-4); }
    .form-group label { display: block; margin-bottom: var(--space-2); font-size: 0.875rem; font-weight: 500; }
    .form-group input { width: 100%; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }

    .form-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }
  `]
})
export class PurchaseOrderDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private inventoryService = inject(InventoryService);

  order = signal<PurchaseOrder | null>(null);
  loading = signal(true);
  showReceiveModal = signal(false);
  receiving = signal(false);

  receiveQuantities: number[] = [];
  receiveNotes = '';

  ngOnInit() {
    const id = +this.route.snapshot.paramMap.get('id')!;
    this.loadOrder(id);
  }

  loadOrder(id: number) {
    this.loading.set(true);
    this.inventoryService.getPurchaseOrder(id).subscribe({
      next: order => {
        this.order.set(order);
        this.receiveQuantities = order.items?.map(i => i.quantity_ordered - i.quantity_received) || [];
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  canReceive(): boolean {
    const status = this.order()?.status;
    return status === 'approved' || status === 'partially_received';
  }

  submitReceive() {
    const order = this.order();
    if (!order?.items) return;

    const items: ReceivedItemInput[] = order.items
      .map((item, i) => ({ purchase_order_item_id: item.id, quantity_received: this.receiveQuantities[i] || 0 }))
      .filter(r => r.quantity_received > 0);

    if (items.length === 0) {
      alert('Enter quantities to receive');
      return;
    }

    this.receiving.set(true);
    const input: ReceiveGoodsInput = { items, notes: this.receiveNotes || undefined };

    this.inventoryService.receivePurchaseOrder(order.id, input).subscribe({
      next: () => { this.receiving.set(false); this.showReceiveModal.set(false); this.loadOrder(order.id); },
      error: () => this.receiving.set(false)
    });
  }

  formatDate(dateStr: string): string { return new Date(dateStr).toLocaleDateString(); }
  formatCurrency(cents: number): string { return this.inventoryService.formatCurrency(cents); }
  formatStatus(status: string): string { return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
}
