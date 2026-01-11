import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, Order } from '../services/api.service';
import { Subscription } from 'rxjs';
import { AgGridAngular } from 'ag-grid-angular';
import { SidebarComponent } from '../shared/sidebar.component';
import {
  ColDef,
  ModuleRegistry,
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  themeQuartz,
  ICellRendererParams,
} from 'ag-grid-community';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
]);

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [DecimalPipe, AgGridAngular, SidebarComponent],
  template: `
    <app-sidebar>
        <div class="page-header">
          <h1>Orders</h1>
          <button class="btn btn-secondary" (click)="loadOrders()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>

        <div class="content">
          @if (loading()) {
            <div class="empty-state"><p>Loading orders...</p></div>
          } @else {
            <!-- Active Orders Section -->
            @if (activeOrders().length > 0) {
              <div class="section-header">
                <h2>Active Orders</h2>
                <span class="badge">{{ activeOrders().length }}</span>
              </div>
              <div class="order-grid">
                @for (order of activeOrders(); track order.id) {
                  <div class="order-card" [class]="'status-' + order.status">
                    <div class="order-header">
                      <div>
                        <span class="order-id">#{{ order.id }}</span>
                        <span class="order-table">{{ order.table_name }}</span>
                        <span class="order-time" [title]="formatExactTime(order.created_at)">Order Time: {{ formatOrderTime(order.created_at) }}</span>
                      </div>
                      <span class="status-badge" [class]="order.status">{{ getStatusLabel(order.status) }}</span>
                    </div>

                    <div class="order-items">
                      @for (item of order.items; track item.id) {
                        <div class="order-item">
                          <span class="item-qty">{{ item.quantity }}x</span>
                          <span class="item-name">{{ item.product_name }}</span>
                          <span class="item-price">{{ formatPrice(item.price_cents * item.quantity) }}</span>
                        </div>
                      }
                    </div>

                    <div class="order-footer">
                      <span class="order-total">Total: \${{ (order.total_cents / 100) | number:'1.2-2' }}</span>
                      <div class="order-actions">
                        @if (order.status === 'pending') {
                          <button class="btn btn-sm btn-primary" (click)="updateStatus(order, 'preparing')">Start</button>
                        } @else if (order.status === 'preparing') {
                          <button class="btn btn-sm btn-success" (click)="updateStatus(order, 'ready')">Ready</button>
                        } @else if (order.status === 'ready') {
                          <button class="btn btn-sm btn-secondary" (click)="updateStatus(order, 'completed')">Complete</button>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @else if (completedOrders().length === 0) {
              <div class="empty-state">
                <div class="empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                  </svg>
                </div>
                <h3>No orders yet</h3>
                <p>Orders will appear here when customers place them</p>
              </div>
            }

            <!-- Order History Section (AG Grid) -->
            @if (completedOrders().length > 0) {
              <div class="section-header history-header">
                <h2>Order History</h2>
                <span class="badge secondary">{{ completedOrders().length }}</span>
              </div>
              <div class="grid-container">
                <ag-grid-angular
                  style="width: 100%; height: 400px;"
                  [theme]="gridTheme"
                  [rowData]="completedOrders()"
                  [columnDefs]="columnDefs"
                  [defaultColDef]="defaultColDef"
                />
              </div>
            }
          }
        </div>
    </app-sidebar>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
    .page-header h1 { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; }

    .section-header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
    .section-header h2 { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0; }
    .history-header { margin-top: var(--space-6); }
    .badge {
      padding: var(--space-1) var(--space-3); border-radius: 20px; font-size: 0.75rem; font-weight: 600;
      background: var(--color-primary); color: white;
      &.secondary { background: var(--color-text-muted); }
    }

    .btn { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: none; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s ease; }
    .btn-primary { background: var(--color-primary); color: white; &:hover { background: var(--color-primary-hover); } }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover { background: var(--color-border); } }
    .btn-success { background: var(--color-success); color: white; &:hover { background: #15803d; } }
    .btn-sm { padding: var(--space-2) var(--space-3); font-size: 0.8125rem; }

    .empty-state {
      text-align: center; padding: var(--space-8); background: var(--color-surface);
      border: 1px dashed var(--color-border); border-radius: var(--radius-lg);
      .empty-icon { color: var(--color-text-muted); margin-bottom: var(--space-4); }
      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; color: var(--color-text); }
      p { margin: 0; color: var(--color-text-muted); }
    }

    .order-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4); }

    .order-card {
      background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
      overflow: hidden;
      &.status-pending { border-left: 3px solid var(--color-warning); }
      &.status-preparing { border-left: 3px solid #3B82F6; }
      &.status-ready { border-left: 3px solid var(--color-success); }
      &.status-paid { border-left: 3px solid var(--color-success); }
      &.status-completed { border-left: 3px solid var(--color-text-muted); }
    }

    .order-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4); border-bottom: 1px solid var(--color-border); }
    .order-header > div { display: flex; flex-direction: column; gap: var(--space-1); }
    .order-id { font-weight: 600; color: var(--color-text); }
    .order-table { color: var(--color-text-muted); font-size: 0.875rem; }
    .order-time { color: var(--color-text-muted); font-size: 0.75rem; }

    .status-badge {
      padding: var(--space-1) var(--space-3); border-radius: 20px; font-size: 0.75rem; font-weight: 600;
      &.pending { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
      &.preparing { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
      &.ready { background: var(--color-success-light); color: var(--color-success); }
      &.paid { background: var(--color-success-light); color: var(--color-success); }
      &.completed { background: var(--color-bg); color: var(--color-text-muted); }
    }

    .order-items { padding: var(--space-4); }
    .order-item { display: flex; gap: var(--space-2); padding: var(--space-2) 0; font-size: 0.9375rem; }
    .order-item:not(:last-child) { border-bottom: 1px solid var(--color-border); }
    .item-qty { font-weight: 600; color: var(--color-primary); width: 32px; }
    .item-name { flex: 1; color: var(--color-text); }
    .item-price { color: var(--color-text-muted); }

    .order-footer { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4); background: var(--color-bg); }
    .order-total { font-weight: 600; color: var(--color-text); }
    .order-actions { display: flex; gap: var(--space-2); }

    .grid-container {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .mobile-header { display: none; position: fixed; top: 0; left: 0; right: 0; height: 56px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); padding: 0 var(--space-4); align-items: center; gap: var(--space-3); z-index: 99; }
    .menu-toggle { display: flex; flex-direction: column; gap: 4px; background: none; border: none; padding: var(--space-2); cursor: pointer; }
    .menu-toggle span { display: block; width: 20px; height: 2px; background: var(--color-text); border-radius: 1px; }
    .header-title { font-weight: 700; color: var(--color-primary); }
    .overlay { display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 99; }

    @media (max-width: 768px) {
      .mobile-header { display: flex; }
      .sidebar { transform: translateX(-100%); transition: transform 0.25s ease; }
      .sidebar-open .sidebar { transform: translateX(0); }
      .sidebar-open .overlay { display: block; }
      .close-btn { display: block; }
      .main { margin-left: 0; padding: calc(56px + var(--space-4)) var(--space-4) var(--space-4); }
      .order-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class OrdersComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private wsSub?: Subscription;

  orders = signal<Order[]>([]);
  loading = signal(true);
  currency = signal<string>('$');

  // Computed signals for separating active and completed orders
  activeOrders = computed(() =>
    this.orders().filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
  );
  completedOrders = computed(() =>
    this.orders().filter(o => ['completed', 'paid'].includes(o.status))
  );

  // AG Grid configuration - custom light theme matching app colors
  gridTheme = themeQuartz.withParams({
    backgroundColor: '#FFFFFF',
    foregroundColor: '#1C1917',
    accentColor: '#D35233',
    borderColor: '#E7E5E4',
    chromeBackgroundColor: '#FAF9F7',
    headerTextColor: '#1C1917',
    oddRowBackgroundColor: 'rgba(0, 0, 0, 0.02)',
    rowHoverColor: 'rgba(211, 82, 51, 0.05)',
    selectedRowBackgroundColor: 'rgba(211, 82, 51, 0.1)',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    borderRadius: 10,
    wrapperBorderRadius: 10,
  });

  get columnDefs(): ColDef[] {
    const currencySymbol = this.currency();
    return [
      {
        field: 'id',
        headerName: 'Order #',
        width: 100,
        valueFormatter: (params) => `#${params.value}`,
      },
      {
        field: 'table_name',
        headerName: 'Table',
        width: 120,
      },
      {
        field: 'items',
        headerName: 'Items',
        flex: 1,
        valueFormatter: (params) => {
          if (!params.value) return '';
          return params.value.map((item: any) => `${item.quantity}x ${item.product_name}`).join(', ');
        },
      },
      {
        field: 'total_cents',
        headerName: 'Total',
        width: 110,
        valueFormatter: (params) => {
          if (params.value == null) return '';
          return `${currencySymbol}${(params.value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        },
        },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        cellRenderer: (params: ICellRendererParams) => {
          const status = params.value;
          const colorMap: Record<string, string> = {
            completed: '#78716C',  // matches --color-text-muted
            paid: '#16A34A',       // matches --color-success
          };
          const color = colorMap[status] || '#78716C';
          return `<span style="
            display: inline-block;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 600;
            background: ${color}20;
            color: ${color};
            text-transform: capitalize;
            line-height: 1.4;
          ">${status}</span>`;
        },
      },
      {
        field: 'created_at',
        headerName: 'Date',
        width: 160,
        valueFormatter: (params) => {
          if (!params.value) return '';
          return new Date(params.value).toLocaleString();
        },
      },
    ];
  }

  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  ngOnInit() {
    this.loadTenantSettings();
    this.loadOrders();
    this.api.connectWebSocket();
    this.wsSub = this.api.orderUpdates$.subscribe(() => this.loadOrders());
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
  }


  loadOrders() {
    this.loading.set(true);
    this.api.getOrders().subscribe({
      next: orders => { this.orders.set(orders); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      paid: 'Paid',
      completed: 'Completed'
    };
    return labels[status] || status;
  }

  loadTenantSettings() {
    this.api.getTenantSettings().subscribe({
      next: (settings) => {
        this.currency.set(settings.currency || '$');
      },
      error: (err) => {
        console.error('Failed to load tenant settings:', err);
        // Default to $ if settings can't be loaded
      }
    });
  }

  formatPrice(priceCents: number): string {
    const currencySymbol = this.currency();
    return `${currencySymbol}${(priceCents / 100).toFixed(2)}`;
  }

  formatExactTime(dateString: string): string {
    if (!dateString) return 'Unknown';
    
    try {
      const dateStr = dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10) 
        ? dateString 
        : dateString + 'Z';
      const date = new Date(dateStr);
      
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return dateString;
    }
  }

  formatOrderTime(dateString: string): string {
    if (!dateString) return 'Unknown';
    
    // Parse the date string - ensure it's treated as UTC if no timezone is specified
    let date: Date;
    try {
      // If the string doesn't end with Z or timezone, assume it's UTC
      const dateStr = dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10) 
        ? dateString 
        : dateString + 'Z';
      date = new Date(dateStr);
    } catch {
      date = new Date(dateString);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return 'Invalid date';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // Handle negative differences (future dates) - shouldn't happen but just in case
    if (diffMs < 0) {
      return 'Just now';
    }
    
    // Calculate time differences
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // If less than 1 minute ago
    if (diffSeconds < 60) {
      return diffSeconds < 10 ? 'Just now' : `${diffSeconds}s ago`;
    }
    // If less than 1 hour ago
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    // If less than 24 hours ago
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    // If less than 7 days ago
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    // Otherwise show formatted date and time
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  updateStatus(order: Order, status: string) {
    this.api.updateOrderStatus(order.id, status).subscribe({
      next: () => {
        this.orders.update(list =>
          list.map(o => o.id === order.id ? { ...o, status } : o)
        );
      }
    });
  }
}
