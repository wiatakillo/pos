import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Order } from '../services/api.service';
import { AudioService } from '../services/audio.service';
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
  imports: [DecimalPipe, AgGridAngular, SidebarComponent, FormsModule],
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
            <!-- Filter Toggle -->
            <div class="filter-tabs">
              <button 
                class="filter-tab" 
                [class.active]="viewMode() === 'active'"
                (click)="viewMode.set('active')">
                Active Orders
                @if (activeOrders().length > 0) {
                  <span class="tab-badge">{{ activeOrders().length }}</span>
                }
              </button>
              <button 
                class="filter-tab" 
                [class.active]="viewMode() === 'not_paid'"
                (click)="viewMode.set('not_paid')">
                Not Paid Yet
                @if (notPaidOrders().length > 0) {
                  <span class="tab-badge">{{ notPaidOrders().length }}</span>
                }
              </button>
              @if (viewMode() === 'active') {
                <label class="toggle-removed">
                  <input type="checkbox" [(ngModel)]="showRemovedItems" (change)="loadOrders()">
                  <span>Show Removed Items</span>
                </label>
              }
            </div>

            <!-- Active Orders Section -->
            @if (viewMode() === 'active' && activeOrders().length > 0) {
              <div class="order-grid">
                @for (order of activeOrders(); track order.id) {
                  <div class="order-card" [class]="'status-' + order.status">
                    <div class="order-header">
                      <div>
                        <span class="order-id">#{{ order.id }}</span>
                        <span class="order-table">{{ order.table_name }}</span>
                        @if (order.customer_name) {
                          <span class="order-customer">Customer: {{ order.customer_name }}</span>
                        }
                        <span class="order-time" [title]="formatExactTime(order.created_at)">Order Time: {{ formatOrderTime(order.created_at) }}</span>
                      </div>
                      <span class="status-badge" [class]="order.status">{{ getStatusLabel(order.status) }}</span>
                    </div>

                    <div class="order-items">
                      @for (item of order.items; track item.id) {
                        <div class="order-item" [class.removed]="item.removed_by_customer">
                          <div class="item-main">
                            <span class="item-qty">
                              @if (!item.removed_by_customer && item.status !== 'delivered') {
                                <input type="number" 
                                  [value]="item.quantity" 
                                  (change)="updateItemQuantity(order.id, item.id!, +$any($event.target).value)"
                                  min="1" 
                                  class="quantity-input"
                                />
                              } @else {
                                {{ item.quantity }}x
                              }
                            </span>
                            <span class="item-name">{{ item.product_name }}</span>
                            <span class="item-price">{{ formatPrice(item.price_cents * item.quantity) }}</span>
                            @if (!item.removed_by_customer && item.status !== 'delivered') {
                              <button class="btn-remove-item" (click)="removeItemStaff(order.id, item.id!, item.status ?? 'pending')" title="Remove item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M18 6L6 18M6 6l12 12"/>
                                </svg>
                              </button>
                            }
                            @if (item.status && !item.removed_by_customer) {
                              <div class="item-status-control">
                                <button 
                                  class="item-status-badge clickable" 
                                  [class]="'status-' + item.status"
                                  (click)="toggleItemStatusDropdown(order.id, item.id!)"
                                  [title]="'Click to change status'">
                                  {{ getItemStatusLabel(item.status) }}
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6,9 12,15 18,9"/>
                                  </svg>
                                </button>
                                @if (itemStatusDropdownOpen() === order.id + '-' + item.id) {
                                  <div class="status-dropdown item-status-dropdown" (click)="$event.stopPropagation()">
                                    @if (getItemStatusTransitions(item.status).backward.length > 0) {
                                      <div class="dropdown-section">
                                        <div class="dropdown-label">Go Back</div>
                                        @for (status of getItemStatusTransitions(item.status).backward; track status) {
                                          <button 
                                            class="dropdown-item backward"
                                            (click)="updateItemStatus(order.id, item.id!, status); itemStatusDropdownOpen.set(null)">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <polyline points="15,18 9,12 15,6"/>
                                            </svg>
                                            {{ getItemStatusLabel(status) }}
                                          </button>
                                        }
                                      </div>
                                    }
                                    @if (getItemStatusTransitions(item.status).forward.length > 0) {
                                      <div class="dropdown-section">
                                        <div class="dropdown-label">Move Forward</div>
                                        @for (status of getItemStatusTransitions(item.status).forward; track status) {
                                          <button 
                                            class="dropdown-item forward"
                                            (click)="updateItemStatus(order.id, item.id!, status); itemStatusDropdownOpen.set(null)">
                                            {{ getItemStatusLabel(status) }}
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <polyline points="9,18 15,12 9,6"/>
                                            </svg>
                                          </button>
                                        }
                                      </div>
                                    }
                                  </div>
                                }
                              </div>
                            }
                          </div>
                          @if (item.removed_by_customer) {
                            <div class="removed-indicator">
                              <span class="removed-label">Removed by customer</span>
                              @if (item.removed_at) {
                                <span class="removed-time">{{ formatTime(item.removed_at) }}</span>
                              }
                            </div>
                          }
                        </div>
                      }
                    </div>

                    <div class="order-footer">
                      <div class="order-footer-left">
                        <span class="order-total">Total: {{ formatPrice(order.total_cents) }}</span>
                        @if (order.removed_items_count && order.removed_items_count > 0) {
                          <span class="removed-count">{{ order.removed_items_count }} item(s) removed</span>
                        }
                      </div>
                      <div class="order-actions">
                        <div class="status-control">
                          <button 
                            class="status-badge-btn" 
                            [class]="order.status"
                            (click)="toggleStatusDropdown(order.id)"
                            [title]="'Click to change status'">
                            {{ getStatusLabel(order.status) }}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="6,9 12,15 18,9"/>
                            </svg>
                          </button>
                          @if (statusDropdownOpen() === order.id) {
                            <div class="status-dropdown" (click)="$event.stopPropagation()">
                              @if (getOrderStatusTransitions(order.status).backward.length > 0) {
                                <div class="dropdown-section">
                                  <div class="dropdown-label">Go Back</div>
                                  @for (status of getOrderStatusTransitions(order.status).backward; track status) {
                                    <button 
                                      class="dropdown-item backward"
                                      (click)="updateStatus(order, status)">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="15,18 9,12 15,6"/>
                                      </svg>
                                      {{ getStatusLabel(status) }}
                                    </button>
                                  }
                                </div>
                              }
                              @if (getOrderStatusTransitions(order.status).forward.length > 0) {
                                <div class="dropdown-section">
                                  <div class="dropdown-label">Move Forward</div>
                                  @for (status of getOrderStatusTransitions(order.status).forward; track status) {
                                    <button 
                                      class="dropdown-item forward"
                                      (click)="updateStatus(order, status)">
                                      {{ getStatusLabel(status) }}
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="9,18 15,12 9,6"/>
                                      </svg>
                                    </button>
                                  }
                                </div>
                              }
                              @if (order.status === 'completed') {
                                <div class="dropdown-section">
                                  <button 
                                    class="dropdown-item forward"
                                    (click)="markAsPaid(order); statusDropdownOpen.set(null)">
                                    Mark as Paid
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <polyline points="9,18 15,12 9,6"/>
                                    </svg>
                                  </button>
                                </div>
                              }
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @else if (viewMode() === 'active' && activeOrders().length === 0 && notPaidOrders().length === 0) {
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

            <!-- Not Paid Yet Section -->
            @if (viewMode() === 'not_paid') {
              @if (notPaidOrders().length > 0) {
                <div class="order-grid">
                  @for (order of notPaidOrders(); track order.id) {
                    <div class="order-card" [class]="'status-' + order.status">
                      <div class="order-header">
                        <div>
                          <span class="order-id">#{{ order.id }}</span>
                          <span class="order-table">{{ order.table_name }}</span>
                          @if (order.customer_name) {
                            <span class="order-customer">Customer: {{ order.customer_name }}</span>
                          }
                          <span class="order-time" [title]="formatExactTime(order.created_at)">Order Time: {{ formatOrderTime(order.created_at) }}</span>
                        </div>
                        <span class="status-badge" [class]="order.status">{{ getStatusLabel(order.status) }}</span>
                      </div>

                      <div class="order-items">
                        @for (item of order.items; track item.id) {
                          <div class="order-item" [class.removed]="item.removed_by_customer">
                            <div class="item-main">
                              <span class="item-qty">{{ item.quantity }}x</span>
                              <span class="item-name">{{ item.product_name }}</span>
                              <span class="item-price">{{ formatPrice(item.price_cents * item.quantity) }}</span>
                              @if (item.status && !item.removed_by_customer) {
                                <span class="item-status-badge" [class]="'status-' + item.status">
                                  {{ getItemStatusLabel(item.status) }}
                                </span>
                              }
                            </div>
                          </div>
                        }
                      </div>

                      <div class="order-footer">
                        <div class="order-footer-left">
                          <span class="order-total">Total: {{ formatPrice(order.total_cents) }}</span>
                          @if (order.removed_items_count && order.removed_items_count > 0) {
                            <span class="removed-count">{{ order.removed_items_count }} item(s) removed</span>
                          }
                        </div>
                        <div class="order-actions">
                          <div class="status-control">
                            <button 
                              class="status-badge-btn" 
                              [class]="order.status"
                              (click)="toggleStatusDropdown(order.id)"
                              [title]="'Click to change status'">
                              {{ getStatusLabel(order.status) }}
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6,9 12,15 18,9"/>
                              </svg>
                            </button>
                            @if (statusDropdownOpen() === order.id) {
                              <div class="status-dropdown" (click)="$event.stopPropagation()">
                                @if (getOrderStatusTransitions(order.status).backward.length > 0) {
                                  <div class="dropdown-section">
                                    <div class="dropdown-label">Go Back</div>
                                    @for (status of getOrderStatusTransitions(order.status).backward; track status) {
                                      <button 
                                        class="dropdown-item backward"
                                        (click)="updateStatus(order, status)">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <polyline points="15,18 9,12 15,6"/>
                                        </svg>
                                        {{ getStatusLabel(status) }}
                                      </button>
                                    }
                                  </div>
                                }
                                @if (getOrderStatusTransitions(order.status).forward.length > 0) {
                                  <div class="dropdown-section">
                                    <div class="dropdown-label">Move Forward</div>
                                    @for (status of getOrderStatusTransitions(order.status).forward; track status) {
                                      <button 
                                        class="dropdown-item forward"
                                        (click)="updateStatus(order, status)">
                                        {{ getStatusLabel(status) }}
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <polyline points="9,18 15,12 9,6"/>
                                        </svg>
                                      </button>
                                    }
                                  </div>
                                }
                                <div class="dropdown-section">
                                  <button 
                                    class="dropdown-item forward"
                                    (click)="markAsPaid(order); statusDropdownOpen.set(null)">
                                    Mark as Paid
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <polyline points="9,18 15,12 9,6"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty-state">
                  <div class="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>
                    </svg>
                  </div>
                  <h3>All orders are paid</h3>
                  <p>No unpaid orders at this time</p>
                </div>
              }
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

        <!-- Mark as Paid Modal -->
        @if (orderToMarkPaid()) {
          <div class="modal-overlay" (click)="closePaymentModal()">
            <div class="modal" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>Mark Order as Paid</h3>
                <button class="icon-btn" (click)="closePaymentModal()">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="modal-body">
                <p>Order #{{ orderToMarkPaid()!.id }} - Total: {{ formatPrice(orderToMarkPaid()!.total_cents) }}</p>
                <div class="form-group">
                  <label for="payment-method">Payment Method</label>
                  <select id="payment-method" [(ngModel)]="paymentMethod" class="form-select">
                    <option value="cash">Cash</option>
                    <option value="terminal">Card Terminal</option>
                    <option value="stripe">Stripe (Online)</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div class="modal-actions">
                <button class="btn btn-secondary" (click)="closePaymentModal()">Cancel</button>
                <button class="btn btn-primary" (click)="confirmMarkAsPaid()" [disabled]="processingPayment()">
                  {{ processingPayment() ? 'Processing...' : 'Mark as Paid' }}
                </button>
              </div>
            </div>
          </div>
        }
    </app-sidebar>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
    .page-header h1 { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; }

    .filter-tabs {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
      border-bottom: 2px solid var(--color-border);
    }
    .filter-tab {
      padding: var(--space-3) var(--space-4);
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: -2px;
    }
    .filter-tab:hover {
      color: var(--color-text);
    }
    .filter-tab.active {
      color: var(--color-primary);
      border-bottom-color: var(--color-primary);
    }
    .tab-badge {
      background: var(--color-primary);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }
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
      background: none; 
      border: none; 
      border-left: 3px solid transparent;
      border-radius: 0;
      overflow: visible;
      &.status-pending { border-left-color: var(--color-warning); }
      &.status-preparing { border-left-color: #3B82F6; }
      &.status-ready { border-left-color: var(--color-success); }
      &.status-paid { border-left-color: var(--color-success); }
      &.status-completed { border-left-color: var(--color-text-muted); }
    }

    .order-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4); border-bottom: 1px solid var(--color-border); margin-bottom: var(--space-3); }
    .order-header > div { display: flex; flex-direction: column; gap: var(--space-1); }
    .order-id { font-weight: 600; color: var(--color-text); }
    .order-table { color: var(--color-text-muted); font-size: 0.875rem; }
    .order-customer { color: var(--color-primary); font-size: 0.875rem; font-weight: 500; }
    .order-time { color: var(--color-text-muted); font-size: 0.75rem; }

    .status-badge {
      padding: var(--space-1) var(--space-3); border-radius: 20px; font-size: 0.75rem; font-weight: 600;
      &.pending { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
      &.preparing { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
      &.ready { background: var(--color-success-light); color: var(--color-success); }
      &.paid { background: var(--color-success-light); color: var(--color-success); }
      &.completed { background: var(--color-bg); color: var(--color-text-muted); }
    }

    .order-items { padding: 0 var(--space-4); }
    .order-item { 
      display: flex; 
      flex-direction: column;
      gap: var(--space-1); 
      padding: var(--space-2) 0; 
      font-size: 0.9375rem; 
    }
    .order-item:not(:last-child) { border-bottom: 1px solid var(--color-border); }
    .order-item.removed { 
      opacity: 0.6; 
      text-decoration: line-through;
      background: var(--color-bg);
    }
    .item-main { 
      display: flex; 
      gap: 12px; 
      align-items: center;
      flex-wrap: wrap;
    }
    .item-qty { 
      font-weight: 600; 
      color: var(--color-primary); 
      min-width: 50px; 
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }
    .quantity-input {
      width: 50px;
      padding: 4px 6px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-size: 0.9375rem;
      text-align: center;
      background: var(--color-surface);
      color: var(--color-text);
      box-sizing: border-box;
    }
    .quantity-input:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-primary-light);
    }
    .item-name { flex: 1; color: var(--color-text); min-width: 0; }
    .item-price { color: var(--color-text-muted); }
    .item-status-badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      display: inline-block;
      white-space: nowrap;
      border: 1px solid var(--color-border);
    }
    .item-status-badge.status-pending { 
      background: rgba(245, 158, 11, 0.15); 
      color: var(--color-warning);
    }
    .item-status-badge.status-pending.clickable:hover {
      background: var(--color-warning);
      color: white;
      transform: scale(1.05);
    }
    .item-status-badge.status-preparing { 
      background: rgba(59, 130, 246, 0.15); 
      color: #3B82F6;
    }
    .item-status-badge.status-preparing.clickable:hover {
      background: #3B82F6;
      color: white;
      transform: scale(1.05);
    }
    .item-status-badge.status-ready { 
      background: var(--color-success-light); 
      color: var(--color-success);
    }
    .item-status-badge.clickable {
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .item-status-badge.clickable svg {
      transition: transform 0.15s;
    }
    .item-status-control:has(.item-status-dropdown:not([style*="display: none"])) .item-status-badge.clickable svg {
      transform: rotate(180deg);
    }
    .item-status-badge.status-ready.clickable:hover {
      background: var(--color-success);
      color: white;
      transform: scale(1.05);
    }
    .item-status-badge.status-delivered { 
      background: var(--color-bg); 
      color: var(--color-text-muted);
      border: 1px solid var(--color-border);
    }
    .item-status-badge.status-delivered.clickable:hover {
      background: rgba(59, 130, 246, 0.15);
      color: #3B82F6;
      border-color: #3B82F6;
      transform: scale(1.05);
    }
    .item-status-badge.status-cancelled { background: var(--color-bg); color: var(--color-text-muted); }
    .item-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
    .btn-xs {
      padding: 4px 8px;
      font-size: 0.75rem;
    }
    .btn-info {
      background: #3B82F6;
      color: white;
    }
    .btn-info:hover {
      background: #2563eb;
    }
    .btn-secondary {
      background: var(--color-text-muted);
      color: white;
    }
    .btn-secondary:hover {
      background: #57534e;
    }
    .btn-danger {
      background: var(--color-error);
      color: white;
    }
    .btn-danger:hover {
      background: #dc2626;
    }
    .btn-remove-item {
      background: none;
      border: none;
      color: var(--color-error);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    .btn-remove-item:hover {
      opacity: 1;
    }
    .quantity-input {
      width: 50px;
      padding: 4px 6px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-size: 0.9375rem;
      text-align: center;
      background: var(--color-surface);
      color: var(--color-text);
      box-sizing: border-box;
    }
    .quantity-input:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-primary-light);
    }
    .removed-indicator {
      display: flex;
      gap: var(--space-2);
      font-size: 0.75rem;
      color: var(--color-text-muted);
      font-style: italic;
      margin-top: var(--space-1);
    }
    .removed-label { color: var(--color-error); }
    .removed-time { color: var(--color-text-muted); }
    .removed-count {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      font-style: italic;
    }
    .toggle-removed {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.875rem;
      color: var(--color-text);
      cursor: pointer;
      margin-left: auto;
      padding: var(--space-2) var(--space-3);
    }
    .toggle-removed input[type="checkbox"] {
      cursor: pointer;
    }

    .order-footer { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      padding: var(--space-4); 
      background: none;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
      border-top: 1px solid var(--color-border);
    }
    .order-footer-left {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .order-total { font-weight: 600; color: var(--color-text); }
    .order-actions { display: flex; gap: var(--space-2); position: relative; }
    
    .status-control {
      position: relative;
    }
    
    .status-badge-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--color-border);
      transition: all 0.15s;
      position: relative;
    }
    .status-badge-btn svg {
      transition: transform 0.15s;
    }
    .status-control:has(.status-dropdown:not([style*="display: none"])) .status-badge-btn svg {
      transform: rotate(180deg);
    }
    .status-badge-btn.pending { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
    .status-badge-btn.preparing { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
    .status-badge-btn.ready { background: var(--color-success-light); color: var(--color-success); }
    .status-badge-btn.completed { background: var(--color-bg); color: var(--color-text-muted); }
    .status-badge-btn.paid { background: var(--color-success-light); color: var(--color-success); }
    .status-badge-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .status-dropdown {
      position: absolute;
      bottom: 100%;
      right: 0;
      margin-bottom: 8px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 100;
      min-width: 180px;
      overflow: hidden;
      animation: slideDown 0.2s ease;
    }
    .item-status-dropdown {
      bottom: auto;
      top: 100%;
      margin-top: 4px;
      margin-bottom: 0;
      min-width: 160px;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .dropdown-section {
      padding: 8px 0;
    }
    .dropdown-section:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
    }
    
    .dropdown-label {
      padding: 6px 12px;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .dropdown-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: none;
      border: none;
      text-align: left;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text);
      cursor: pointer;
      transition: background 0.15s;
    }
    .dropdown-item:hover {
      background: var(--color-bg);
    }
    .dropdown-item.forward {
      color: var(--color-primary);
    }
    .dropdown-item.backward {
      color: var(--color-text-muted);
    }
    .dropdown-item svg {
      flex-shrink: 0;
    }
    
    .item-status-control {
      position: relative;
      display: inline-block;
    }

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

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      width: 90%;
      max-width: 400px;
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text);
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-2);
      display: flex;
      align-items: center;
      transition: color 0.15s;
    }

    .icon-btn:hover {
      color: var(--color-text);
    }

    .modal-body {
      padding: var(--space-4);
    }

    .modal-body p {
      margin: 0 0 var(--space-4);
      color: var(--color-text);
      font-weight: 500;
    }

    .form-group {
      margin-bottom: var(--space-4);
    }

    .form-group label {
      display: block;
      margin-bottom: var(--space-2);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text);
    }

    .form-select {
      width: 100%;
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      background: var(--color-surface);
      color: var(--color-text);
    }

    .form-select:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px var(--color-primary-light);
    }

    .modal-actions {
      display: flex;
      gap: var(--space-3);
      justify-content: flex-end;
      padding: var(--space-4);
      border-top: 1px solid var(--color-border);
    }

    @media (max-width: 768px) {
      .mobile-header { display: flex; }
      .sidebar { transform: translateX(-100%); transition: transform 0.25s ease; }
      .sidebar-open .sidebar { transform: translateX(0); }
      .sidebar-open .overlay { display: block; }
      .close-btn { display: block; }
      .main { margin-left: 0; padding: calc(56px + var(--space-4)) var(--space-4) var(--space-4); }
      .order-grid { grid-template-columns: 1fr; }
      
      .status-dropdown {
        right: 0;
        left: auto;
        min-width: 200px;
      }
      .item-status-dropdown {
        right: 0;
        left: auto;
      }
    }
  `]
})
export class OrdersComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private audio = inject(AudioService);
  
  // Get browser's timezone automatically
  private getBrowserTimezone(): string {
    try {
      // Use Intl API to get the timezone
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      // Fallback: try to detect from date offset
      const offset = -new Date().getTimezoneOffset();
      const hours = Math.floor(Math.abs(offset) / 60);
      const minutes = Math.abs(offset) % 60;
      const sign = offset >= 0 ? '+' : '-';
      return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  private wsSub?: Subscription;

  orders = signal<Order[]>([]);
  loading = signal(true);
  currency = signal<string>('$');
  showRemovedItems = false;
  viewMode = signal<'active' | 'not_paid'>('active');
  orderToMarkPaid = signal<Order | null>(null);
  paymentMethod = 'cash';
  processingPayment = signal(false);
  statusDropdownOpen = signal<number | null>(null); // Order ID for which dropdown is open
  itemStatusDropdownOpen = signal<string | null>(null); // "orderId-itemId" for which dropdown is open

  // Computed signals for separating active and completed orders
  activeOrders = computed(() =>
    this.orders().filter(o => ['pending', 'preparing', 'ready', 'partially_delivered'].includes(o.status))
  );
  completedOrders = computed(() =>
    this.orders().filter(o => ['completed', 'paid', 'cancelled'].includes(o.status))
  );
  notPaidOrders = computed(() =>
    this.orders().filter(o => o.status === 'completed' && !o.paid_at)
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
        field: 'customer_name',
        headerName: 'Customer',
        width: 150,
        valueFormatter: (params) => params.value || '-',
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
        width: 220,
        valueFormatter: (params) => {
          if (!params.value) return '';
          // Parse date - backend sends ISO without timezone, treat as UTC
          const dateStr = params.value.endsWith('Z') || params.value.includes('+') || params.value.includes('-', 10)
            ? params.value
            : params.value + 'Z';
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return '';
          // Use browser's local timezone for display
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          return date.toLocaleString(undefined, {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: timeZone,
            hour12: false
          });
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
    // Connect WebSocket for real-time updates (non-blocking - HTTP requests work without it)
    try {
      this.api.connectWebSocket();
      this.wsSub = this.api.orderUpdates$.subscribe((update: any) => {
        // Play sound notification for order changes (restaurant-specific sound)
        if (update && update.type) {
          const changeTypes = ['item_removed', 'item_updated', 'order_cancelled', 'new_order', 'items_added'];
          if (changeTypes.includes(update.type)) {
            this.audio.playRestaurantOrderChange();
          }
        }
        this.loadOrders();
      });
    } catch (error) {
      console.warn('WebSocket connection failed, continuing without real-time updates:', error);
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.status-control') && !target.closest('.item-status-control')) {
        this.statusDropdownOpen.set(null);
        this.itemStatusDropdownOpen.set(null);
      }
    });
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
  }


  loadOrders() {
    this.loading.set(true);
    this.api.getOrders(this.showRemovedItems).subscribe({
      next: orders => { this.orders.set(orders); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      partially_delivered: 'Partially Delivered',
      paid: 'Paid',
      completed: 'Delivered',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  }

  getItemStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      delivered: 'Delivered',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  }

  formatTime(isoString: string): string {
    // Parse date - backend sends ISO without timezone, treat as UTC
    const dateStr = isoString.endsWith('Z') || isoString.includes('+') || isoString.includes('-', 10)
      ? isoString
      : isoString + 'Z';
    const date = new Date(dateStr);
    // Use browser's local timezone for display
    const timeZone = this.getBrowserTimezone();
    return date.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: timeZone
    });
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
      // Parse as UTC if it has timezone indicator, otherwise assume UTC
      // Backend sends ISO format without timezone, so we treat it as UTC
      const dateStr = dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10) 
        ? dateString 
        : dateString + 'Z';
      const date = new Date(dateStr);
      
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      // Explicitly use browser's timezone for display
      const timeZone = this.getBrowserTimezone();
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: timeZone
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
    // Otherwise show formatted date and time in local timezone
    const timeZone = this.getBrowserTimezone();
    return date.toLocaleString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timeZone
    });
  }

  // Get available status transitions for an order
  getOrderStatusTransitions(currentStatus: string): { forward: string[]; backward: string[] } {
    const transitions: Record<string, { forward: string[]; backward: string[] }> = {
      pending: { forward: ['preparing'], backward: [] },
      preparing: { forward: ['ready'], backward: ['pending'] },
      ready: { forward: ['completed'], backward: ['preparing'] },
      completed: { forward: [], backward: ['ready'] }, // Paid is handled via modal
      partially_delivered: { forward: ['completed'], backward: [] },
      paid: { forward: [], backward: ['completed'] },
      cancelled: { forward: [], backward: [] }
    };
    return transitions[currentStatus] || { forward: [], backward: [] };
  }

  // Get available status transitions for an item
  getItemStatusTransitions(currentStatus: string): { forward: string[]; backward: string[] } {
    const transitions: Record<string, { forward: string[]; backward: string[] }> = {
      pending: { forward: ['preparing'], backward: [] },
      preparing: { forward: ['ready'], backward: ['pending'] },
      ready: { forward: ['delivered'], backward: ['preparing'] },
      delivered: { forward: [], backward: ['ready'] },
      cancelled: { forward: [], backward: [] }
    };
    return transitions[currentStatus] || { forward: [], backward: [] };
  }

  toggleStatusDropdown(orderId: number) {
    this.statusDropdownOpen.update(current => current === orderId ? null : orderId);
  }

  toggleItemStatusDropdown(orderId: number, itemId: number) {
    const key = `${orderId}-${itemId}`;
    this.itemStatusDropdownOpen.update(current => current === key ? null : key);
  }

  updateStatus(order: Order, status: string) {
    this.statusDropdownOpen.set(null); // Close dropdown
    this.api.updateOrderStatus(order.id, status).subscribe({
      next: () => {
        this.orders.update(list =>
          list.map(o => o.id === order.id ? { ...o, status } : o)
        );
      }
    });
  }

  updateItemStatus(orderId: number, itemId: number, status: string) {
    this.api.updateOrderItemStatus(orderId, itemId, status).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        console.error('Failed to update item status:', err);
        alert('Failed to update item status');
      }
    });
  }

  resetItemStatus(orderId: number, itemId: number) {
    this.api.resetItemStatus(orderId, itemId).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to reset item status';
        alert(errorMsg);
      }
    });
  }

  cancelItemWithReason(orderId: number, itemId: number) {
    const reason = prompt('Reason for cancellation (required for tax reporting):');
    if (!reason || !reason.trim()) {
      alert('Reason is required when cancelling ready items');
      return;
    }
    this.api.cancelOrderItemStaff(orderId, itemId, reason).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to cancel item';
        alert(errorMsg);
      }
    });
  }

  updateItemQuantity(orderId: number, itemId: number, quantity: number) {
    if (quantity <= 0) {
      alert('Quantity must be at least 1');
      return;
    }
    this.api.updateOrderItemQuantityStaff(orderId, itemId, quantity).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to update quantity';
        alert(errorMsg);
      }
    });
  }

  removeItemStaff(orderId: number, itemId: number, itemStatus: string) {
    let reason: string | null = null;
    
    // If item is ready, require reason
    if (itemStatus === 'ready') {
      reason = prompt('Reason for removal (required for tax reporting):');
      if (!reason || !reason.trim()) {
        alert('Reason is required when removing ready items');
        return;
      }
    }
    
    if (!confirm('Are you sure you want to remove this item?')) {
      return;
    }
    
    this.api.removeOrderItemStaff(orderId, itemId, reason || undefined).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to remove item';
        alert(errorMsg);
      }
    });
  }

  markAsPaid(order: Order) {
    this.statusDropdownOpen.set(null); // Close dropdown
    this.orderToMarkPaid.set(order);
    this.paymentMethod = 'cash'; // Reset to default
  }

  closePaymentModal() {
    this.orderToMarkPaid.set(null);
    this.processingPayment.set(false);
  }

  confirmMarkAsPaid() {
    const order = this.orderToMarkPaid();
    if (!order || !this.paymentMethod) return;
    
    this.processingPayment.set(true);
    this.api.markOrderPaid(order.id, this.paymentMethod).subscribe({
      next: () => {
        this.processingPayment.set(false);
        this.closePaymentModal();
        this.loadOrders();
      },
      error: (err) => {
        this.processingPayment.set(false);
        const errorMsg = err.error?.detail || 'Failed to mark order as paid';
        alert(errorMsg);
      }
    });
  }
}
