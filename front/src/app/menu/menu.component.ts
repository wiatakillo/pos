import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, Product, OrderItemCreate } from '../services/api.service';
import { environment } from '../../environments/environment';

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
}

interface PlacedOrder {
  id: number;
  items: CartItem[];
  notes: string;
  total: number;
  status: string;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="menu-page">
      @if (loading()) {
        <div class="loading-screen">
          <div class="spinner"></div>
          <p>Loading menu...</p>
        </div>
      } @else if (error()) {
        <div class="error-screen">
          <h1>Menu Not Found</h1>
          <p>This table link may be invalid or expired.</p>
        </div>
      } @else {
        <header class="header">
          @if (tenantLogo()) {
            <img [src]="tenantLogo()" alt="Business Logo" class="tenant-logo" />
          }
          <div class="header-content">
            <h1>{{ tenantName() }}</h1>
            @if (tenantDescription()) {
              <p class="tenant-description">{{ tenantDescription() }}</p>
            }
            <span class="table-badge">{{ tableName() }}</span>
          </div>
        </header>

        <main class="content">
          <!-- Active Order -->
          @if (placedOrders().length > 0) {
            <section class="section">
              <button class="section-header" (click)="ordersExpanded.set(!ordersExpanded())">
                <span class="section-title">Your Order</span>
                <span class="status-pill" [class]="'status-' + placedOrders()[0].status">
                  {{ getStatusLabel(placedOrders()[0].status) }}
                </span>
                <svg class="chevron" [class.expanded]="ordersExpanded()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6,9 12,15 18,9"/>
                </svg>
              </button>
              
              @if (ordersExpanded()) {
                <div class="section-body">
                  @for (order of placedOrders(); track order.id) {
                    <div class="order-card">
                      <div class="order-meta">
                        <span>Order #{{ order.id }}</span>
                        <span class="order-total">{{ formatPrice(order.total) }}</span>
                      </div>
                      <div class="order-items">
                        @for (item of order.items; track item.product.id) {
                          <div class="order-item">
                            <span class="item-qty">{{ item.quantity }}x</span>
                            <span class="item-name">{{ item.product.name }}</span>
                            <span class="item-price">{{ formatPrice(item.product.price_cents * item.quantity) }}</span>
                          </div>
                        }
                      </div>
                      @if (isPaid()) {
                        <div class="paid-banner">Paid</div>
                      } @else {
                        <button class="pay-btn" (click)="startCheckout(order)" [disabled]="processingPayment()">
                          {{ processingPayment() ? 'Processing...' : 'Pay Now' }}
                        </button>
                      }
                    </div>
                  }
                </div>
              }
            </section>
          }

          <!-- Menu -->
          <section class="section">
            <button class="section-header" (click)="menuExpanded.set(!menuExpanded())">
              <span class="section-title">Menu</span>
              <span class="count-badge">{{ filteredProducts().length }}</span>
              <svg class="chevron" [class.expanded]="menuExpanded()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>
            
            @if (menuExpanded()) {
              <div class="section-body">
                <!-- Main Category Filters -->
                @if (availableCategories().length > 0) {
                  <div class="category-filters">
                    <button 
                      class="category-btn" 
                      [class.active]="selectedCategory() === null"
                      (click)="selectCategory(null)">
                      All Categories
                    </button>
                    @for (category of availableCategories(); track category) {
                      <button 
                        class="category-btn" 
                        [class.active]="selectedCategory() === category"
                        (click)="selectCategory(category)">
                        {{ category }}
                      </button>
                    }
                  </div>
                }
                
                <!-- Subcategory Filters (shown when main category is selected) -->
                @if (selectedCategory() && availableSubcategories().length > 0) {
                  <div class="subcategory-filters">
                    <button 
                      class="subcategory-btn" 
                      [class.active]="selectedSubcategory() === null"
                      (click)="selectSubcategory(null)">
                      All {{ selectedCategory() }}
                    </button>
                    @for (subcategoryCode of availableSubcategories(); track subcategoryCode) {
                      <button 
                        class="subcategory-btn" 
                        [class.active]="selectedSubcategory() === subcategoryCode"
                        (click)="selectSubcategory(subcategoryCode)">
                        {{ getSubcategoryLabel(subcategoryCode) }}
                      </button>
                    }
                  </div>
                }
                
                @for (product of filteredProducts(); track product.id) {
                  <div class="product-card">
                    @if (product.image_filename) {
                      <img [src]="getProductImageUrl(product)" class="product-img" alt="">
                    } @else {
                      <div class="product-img-placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <path d="M21 15l-5-5L5 21"/>
                        </svg>
                      </div>
                    }
                    <div class="product-details">
                      <div class="product-main">
                        <div class="product-header">
                          <h3>{{ product.name }}</h3>
                          @if (product.wine_type) {
                            <span class="wine-type-badge" [class]="'wine-type-' + getWineTypeClass(product.wine_type)">
                              {{ getWineTypeLabel(product.wine_type) }}
                            </span>
                          }
                        </div>
                        <span class="product-price">{{ formatPrice(product.price_cents) }}</span>
                      </div>
                      
                      <!-- Origin (Country/Region) -->
                      @if (product.country || product.region) {
                        <div class="product-origin">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          <span>{{ product.country }}{{ product.country && product.region ? ', ' : '' }}{{ product.region }}</span>
                        </div>
                      }
                      
                      <!-- Wine Details (Style, Vintage, Winery, Grape Variety) -->
                      @if (product.wine_style || product.vintage || product.winery || product.grape_variety) {
                        <div class="wine-details">
                          @if (product.wine_style) {
                            <span class="wine-badge">{{ product.wine_style }}</span>
                          }
                          @if (product.vintage) {
                            <span class="wine-badge">Vintage {{ product.vintage }}</span>
                          }
                          @if (product.winery) {
                            <span class="wine-badge">{{ product.winery }}</span>
                          }
                          @if (product.grape_variety) {
                            <span class="wine-badge">{{ product.grape_variety }}</span>
                          }
                        </div>
                      }
                      
                      <!-- Description -->
                      @if (product.detailed_description || product.description) {
                        <p class="product-description">{{ product.detailed_description || product.description }}</p>
                      }
                      
                      <!-- Aromas -->
                      @if (product.aromas) {
                        <div class="product-aromas">
                          <strong>Aromas:</strong> {{ product.aromas }}
                        </div>
                      }
                      
                      <!-- Elaboration -->
                      @if (product.elaboration) {
                        <div class="product-elaboration">
                          <strong>Elaboration:</strong> {{ product.elaboration }}
                        </div>
                      }
                      
                      @if (product.ingredients) {
                        <button class="ingredients-toggle" (click)="toggleIngredients(product.id!); $event.stopPropagation()">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                          </svg>
                          <span>Ingredients</span>
                          <svg class="chevron-icon" [class.open]="showIngredientsFor() === product.id" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="6,9 12,15 18,9"/>
                          </svg>
                        </button>
                      }
                      @if (showIngredientsFor() === product.id && product.ingredients) {
                        <div class="ingredients-content">
                          <p>{{ product.ingredients }}</p>
                        </div>
                      }
                    </div>
                    <button class="add-btn" (click)="addToCart(product)">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                  </div>
                }
              </div>
            }
          </section>
        </main>

        <!-- Cart -->
        @if (cart().length > 0) {
          <div class="cart-panel">
            <div class="cart-header">
              <h3>Your Cart</h3>
              <span class="cart-count">{{ getTotalItems() }} items</span>
            </div>
            
            <div class="cart-items">
              @for (item of cart(); track item.product.id) {
                <div class="cart-item">
                  <div class="cart-item-row">
                    <span class="cart-qty">{{ item.quantity }}x</span>
                    <span class="cart-name">{{ item.product.name }}</span>
                    <span class="cart-price">{{ formatPrice(item.product.price_cents * item.quantity) }}</span>
                  </div>
                  <div class="cart-controls">
                    <button class="qty-btn" (click)="decrementItem(item)">-</button>
                    <button class="qty-btn" (click)="incrementItem(item)">+</button>
                  </div>
                </div>
              }
            </div>

            <div class="cart-footer">
              <div class="cart-total">
                <span>Total</span>
                <span class="total-amount">{{ formatPrice(getTotal()) }}</span>
              </div>
              <button class="submit-btn" (click)="submitOrder()" [disabled]="submitting()">
                {{ submitting() ? 'Placing Order...' : (placedOrders().length > 0 ? 'Add to Order' : 'Place Order') }}
              </button>
            </div>
          </div>
        }

        <!-- Success Toast -->
        @if (showSuccessToast()) {
          <div class="toast">Items added to Order #{{ lastOrderId() }}</div>
        }

        <!-- Payment Modal -->
        @if (showPaymentModal()) {
          <div class="modal-overlay" (click)="cancelPayment()">
            <div class="modal" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>Checkout</h3>
                <button class="close-btn" (click)="cancelPayment()">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="modal-body">
                <div class="payment-total">
                  Total: <strong>{{ formatPrice(paymentAmount()) }}</strong>
                </div>
                <div id="card-element" class="card-element"></div>
                @if (cardError()) {
                  <div class="card-errors">{{ cardError() }}</div>
                }
                @if (paymentSuccess()) {
                  <div class="payment-success">Payment successful!</div>
                }
              </div>
              <div class="modal-footer">
                @if (!paymentSuccess()) {
                  <button class="btn-cancel" (click)="cancelPayment()">Cancel</button>
                  <button class="btn-pay" (click)="processPayment()" [disabled]="processingPayment()">
                    {{ processingPayment() ? 'Processing...' : 'Pay' }}
                  </button>
                } @else {
                  <button class="btn-done" (click)="finishPayment()">Done</button>
                }
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .menu-page {
      min-height: 100vh;
      background: var(--color-bg);
      padding-bottom: 280px;
    }

    .loading-screen, .error-screen {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--color-text-muted);
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .error-screen h1 { font-size: 1.5rem; color: var(--color-text); margin-bottom: 8px; }

    .header {
      background: var(--color-primary);
      padding: 24px 16px;
      text-align: center;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
    }

    .tenant-logo {
      max-width: 120px;
      max-height: 120px;
      width: auto;
      height: auto;
      object-fit: contain;
      background: white;
      border-radius: var(--radius-md);
      padding: var(--space-2);
    }

    .header-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
    }

    .header h1 { font-size: 1.375rem; font-weight: 600; margin: 0; }
    .tenant-description {
      font-size: 0.875rem;
      opacity: 0.9;
      margin: 0;
      max-width: 500px;
    }
    .table-badge { font-size: 0.875rem; opacity: 0.9; }

    .content { padding: 16px; max-width: 600px; margin: 0 auto; }

    .section {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      margin-bottom: 16px;
      overflow: hidden;
    }

    .section-header {
      width: 100%;
      padding: 16px;
      background: none;
      border: none;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      text-align: left;
    }

    .section-title { font-weight: 600; font-size: 1rem; flex: 1; color: var(--color-text); }

    .status-pill {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-pill.status-pending { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
    .status-pill.status-preparing { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
    .status-pill.status-ready { background: var(--color-success-light); color: var(--color-success); }
    .status-pill.status-paid { background: var(--color-success-light); color: var(--color-success); }
    .status-pill.status-completed { background: var(--color-bg); color: var(--color-text-muted); }

    .count-badge {
      background: var(--color-bg);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }

    .chevron { color: var(--color-text-muted); transition: transform 0.2s; }
    .chevron.expanded { transform: rotate(180deg); }

    .section-body { padding: 0 16px 16px; }

    .order-card { background: var(--color-bg); border-radius: var(--radius-md); padding: 16px; }
    .order-meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 600; }
    .order-total { color: var(--color-primary); }
    .order-items { margin-bottom: 16px; }
    .order-item { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--color-border); font-size: 0.9375rem; }
    .order-item:last-child { border-bottom: none; }
    .item-qty { font-weight: 600; color: var(--color-primary); width: 32px; }
    .item-name { flex: 1; }
    .item-price { color: var(--color-text-muted); }

    .paid-banner {
      text-align: center;
      padding: 12px;
      background: var(--color-success-light);
      color: var(--color-success);
      border-radius: var(--radius-md);
      font-weight: 600;
    }

    .pay-btn {
      width: 100%;
      padding: 14px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      &:hover:not(:disabled) { background: var(--color-primary-hover); }
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    .product-card {
      display: flex;
      gap: 14px;
      padding: 14px;
      background: var(--color-bg);
      border-radius: var(--radius-lg);
      margin-bottom: 10px;
    }

    .product-card:last-child { margin-bottom: 0; }

    .category-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .category-btn {
      padding: 10px 18px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 24px;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text);
      cursor: pointer;
      transition: all 0.15s;
      touch-action: manipulation;
    }

    .category-btn:hover {
      background: var(--color-bg);
      border-color: var(--color-primary);
      transform: translateY(-1px);
    }

    .category-btn.active {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .subcategory-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--color-bg);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }

    .subcategory-btn {
      padding: 6px 14px;
      background: white;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-text);
      cursor: pointer;
      transition: all 0.15s;
      touch-action: manipulation;
    }

    .subcategory-btn:hover {
      background: var(--color-surface);
      border-color: var(--color-primary);
    }

    .subcategory-btn.active {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
    }

    .product-img {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: var(--radius-md);
      flex-shrink: 0;
    }

    .product-img-placeholder {
      width: 72px;
      height: 72px;
      border-radius: var(--radius-md);
      flex-shrink: 0;
      background: var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
    }

    .product-details {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .product-main {
      margin-bottom: 6px;
    }

    .product-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }

    .product-main h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text);
      line-height: 1.3;
      flex: 1;
      min-width: 0;
    }

    .wine-type-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .wine-type-badge.wine-type-red {
      background: rgba(220, 38, 38, 0.15);
      color: #dc2626;
      border: 1px solid rgba(220, 38, 38, 0.3);
    }

    .wine-type-badge.wine-type-white {
      background: rgba(251, 191, 36, 0.15);
      color: #d97706;
      border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .wine-type-badge.wine-type-sparkling {
      background: rgba(59, 130, 246, 0.15);
      color: #2563eb;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .wine-type-badge.wine-type-rose {
      background: rgba(244, 114, 182, 0.15);
      color: #db2777;
      border: 1px solid rgba(244, 114, 182, 0.3);
    }

    .wine-type-badge.wine-type-sweet {
      background: rgba(168, 85, 247, 0.15);
      color: #9333ea;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }

    .wine-type-badge.wine-type-fortified {
      background: rgba(120, 53, 15, 0.15);
      color: #92400e;
      border: 1px solid rgba(120, 53, 15, 0.3);
    }

    .wine-type-badge.wine-type-other {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }

    .product-price {
      font-size: 1rem;
      font-weight: 700;
      color: var(--color-primary);
    }

    .product-origin {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin-top: 4px;
      margin-bottom: 8px;
    }

    .product-origin svg {
      flex-shrink: 0;
      color: var(--color-text-muted);
    }

    .wine-details {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      margin-bottom: 8px;
    }

    .wine-badge {
      display: inline-block;
      padding: 4px 10px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text);
    }

    .product-description {
      font-size: 0.875rem;
      color: var(--color-text);
      line-height: 1.5;
      margin: 8px 0;
    }

    .product-aromas,
    .product-elaboration {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin-top: 6px;
      line-height: 1.4;
    }

    .product-aromas strong,
    .product-elaboration strong {
      color: var(--color-text);
      font-weight: 600;
    }

    .ingredients-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      margin-top: 8px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 20px;
      color: var(--color-text-muted);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      touch-action: manipulation;
    }

    .ingredients-toggle:active {
      background: var(--color-bg);
    }

    .ingredients-toggle svg:first-child {
      color: var(--color-primary);
    }

    .chevron-icon {
      transition: transform 0.2s;
      margin-left: 2px;
    }

    .chevron-icon.open {
      transform: rotate(180deg);
    }

    .ingredients-content {
      margin-top: 10px;
      padding: 12px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      animation: slideIn 0.2s ease;
    }

    .ingredients-content p {
      margin: 0;
      font-size: 0.9375rem;
      color: var(--color-text);
      line-height: 1.5;
    }

    @keyframes slideIn {
      from { opacity: 0; max-height: 0; padding: 0 12px; margin-top: 0; }
      to { opacity: 1; max-height: 200px; padding: 12px; margin-top: 10px; }
    }

    .add-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: var(--color-primary);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      align-self: center;
      touch-action: manipulation;
      transition: background 0.15s, transform 0.1s;
    }

    .add-btn:hover { background: var(--color-primary-hover); }
    .add-btn:active { transform: scale(0.92); }

    /* Cart */
    .cart-panel {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      border-radius: 20px 20px 0 0;
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.1);
      padding: 16px;
      max-height: 50vh;
      overflow-y: auto;
      z-index: 100;
    }

    .cart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .cart-header h3 { margin: 0; font-size: 1rem; font-weight: 600; }
    .cart-count { color: var(--color-text-muted); font-size: 0.875rem; }

    .cart-items { margin-bottom: 16px; }

    .cart-item { padding: 10px 0; border-bottom: 1px solid var(--color-border); }
    .cart-item:last-child { border-bottom: none; }
    .cart-item-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .cart-qty { font-weight: 600; color: var(--color-primary); }
    .cart-name { flex: 1; font-size: 0.9375rem; }
    .cart-price { font-weight: 500; }
    .cart-controls { display: flex; gap: 8px; }

    .qty-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.15s;
      &:hover { background: var(--color-bg); }
    }

    .cart-total { display: flex; justify-content: space-between; font-size: 1rem; font-weight: 600; margin-bottom: 12px; }
    .total-amount { color: var(--color-primary); }

    .submit-btn {
      width: 100%;
      padding: 14px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      &:hover:not(:disabled) { background: var(--color-primary-hover); }
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    /* Toast */
    .toast {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-success);
      color: white;
      padding: 12px 20px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      z-index: 200;
      font-weight: 500;
      animation: slideDown 0.3s ease;
    }

    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 300;
      padding: 16px;
    }

    .modal {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 400px;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--color-border);
    }

    .modal-header h3 { margin: 0; font-size: 1.125rem; }
    .close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 4px; }

    .modal-body { padding: 20px; }
    .payment-total { text-align: center; font-size: 1.25rem; margin-bottom: 20px; }

    .card-element {
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-bg);
    }

    .card-errors { color: var(--color-error); font-size: 0.875rem; margin-top: 8px; }
    .payment-success { background: var(--color-success-light); color: var(--color-success); padding: 12px; border-radius: var(--radius-md); text-align: center; margin-top: 16px; font-weight: 600; }

    .modal-footer { display: flex; gap: 12px; padding: 16px; border-top: 1px solid var(--color-border); }
    .btn-cancel { flex: 1; padding: 12px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-weight: 500; cursor: pointer; }
    .btn-pay, .btn-done { flex: 2; padding: 12px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; }
    .btn-pay:disabled { opacity: 0.6; cursor: not-allowed; }
  `]
})
export class MenuComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  loading = signal(true);
  error = signal(false);
  products = signal<Product[]>([]);
  filteredProducts = signal<Product[]>([]);
  selectedCategory = signal<string | null>(null);
  selectedSubcategory = signal<string | null>(null);
  availableCategories = signal<string[]>([]);
  availableSubcategories = signal<string[]>([]);
  tenantName = signal('');
  tableName = signal('');
  tenantLogo = signal<string | null>(null);
  tenantDescription = signal<string | null>(null);
  tenantPhone = signal<string | null>(null);
  tenantWhatsapp = signal<string | null>(null);
  tenantAddress = signal<string | null>(null);
  tenantWebsite = signal<string | null>(null);
  tenantCurrency = signal<string>('$');
  cart = signal<CartItem[]>([]);
  orderNotes = '';
  submitting = signal(false);
  placedOrders = signal<PlacedOrder[]>([]);
  showSuccessToast = signal(false);
  lastOrderId = signal(0);
  ordersExpanded = signal(true);
  menuExpanded = signal(true);
  showIngredientsFor = signal<number | null>(null);
  private tableToken = '';
  private tenantId = 0;
  private ws: WebSocket | null = null;

  ngOnInit() {
    this.tableToken = this.route.snapshot.params['token'];
    this.loadMenu();
    this.loadStoredOrders();
  }

  ngOnDestroy() { this.ws?.close(); }

  loadStoredOrders() {
    const stored = localStorage.getItem(`orders_${this.tableToken}`);
    if (stored) {
      try {
        const orders: PlacedOrder[] = JSON.parse(stored);
        // Filter out paid or completed orders - they should not persist
        const activeOrders = orders.filter(o => o.status !== 'paid' && o.status !== 'completed');
        this.placedOrders.set(activeOrders);
        // Update storage with only active orders
        if (activeOrders.length !== orders.length) {
          this.saveOrders();
        }
      } catch { }
    }
  }

  saveOrders() { localStorage.setItem(`orders_${this.tableToken}`, JSON.stringify(this.placedOrders())); }

  connectWebSocket() {
    if (this.ws || this.tenantId === 0) return;
    const wsUrl = environment.wsUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    this.ws = new WebSocket(`${wsUrl}/ws/${this.tenantId}`);
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status_update') {
          this.placedOrders.update(orders => orders.map(o => o.id === data.order_id ? { ...o, status: data.status } : o));
          this.saveOrders();
        }
      } catch { }
    };
    this.ws.onclose = () => { this.ws = null; setTimeout(() => this.connectWebSocket(), 5000); };
  }

  loadMenu() {
    this.api.getMenu(this.tableToken).subscribe({
      next: data => {
        this.products.set(data.products);
        this.tenantName.set(data.tenant_name);
        this.tableName.set(data.table_name);
        this.tenantId = data.tenant_id;
        
        // Extract available main categories from products
        const categories = new Set<string>();
        data.products.forEach((product: Product) => {
          if (product.category) {
            categories.add(product.category);
          }
        });
        this.availableCategories.set(Array.from(categories).sort());
        
        // Update subcategories based on selected category
        this.updateSubcategories(null);
        
        // Apply initial filter (show all)
        this.applyFilter(null, null);
        
        // Set tenant logo if available
        if (data.tenant_logo && data.tenant_id) {
          this.tenantLogo.set(`${environment.apiUrl}/uploads/${data.tenant_id}/logo/${data.tenant_logo}`);
        }
        
        // Set additional tenant info
        this.tenantDescription.set(data.tenant_description || null);
        this.tenantPhone.set(data.tenant_phone || null);
        this.tenantWhatsapp.set(data.tenant_whatsapp || null);
        this.tenantAddress.set(data.tenant_address || null);
        this.tenantWebsite.set(data.tenant_website || null);
        this.tenantCurrency.set(data.tenant_currency || '$');
        
        // Set tenant Stripe publishable key for payments
        if (data.tenant_stripe_publishable_key) {
          this.api.setTenantStripeKey(data.tenant_stripe_publishable_key);
        }
        
        this.loading.set(false);
        this.connectWebSocket();
      },
      error: () => { this.error.set(true); this.loading.set(false); }
    });
  }

  selectCategory(category: string | null) {
    this.selectedCategory.set(category);
    this.selectedSubcategory.set(null);
    this.updateSubcategories(category);
    this.applyFilter(category, null);
  }

  selectSubcategory(subcategoryCode: string | null) {
    this.selectedSubcategory.set(subcategoryCode);
    this.applyFilter(this.selectedCategory(), subcategoryCode);
  }

  updateSubcategories(category: string | null) {
    if (!category) {
      this.availableSubcategories.set([]);
      return;
    }

    // Extract all subcategory codes from products in the selected category
    const subcategoryCodes = new Set<string>();
    
    this.products().forEach((product: Product) => {
      if (product.category === category) {
        // Use subcategory_codes if available (from backend)
        if (product.subcategory_codes && product.subcategory_codes.length > 0) {
          product.subcategory_codes.forEach(code => subcategoryCodes.add(code));
        } else {
          // Fallback: extract codes from subcategory string
          if (product.subcategory) {
            // Extract wine type code
            const wineTypeCode = this.getWineTypeCodeFromString(product.wine_type || product.subcategory);
            if (wineTypeCode) {
              subcategoryCodes.add(wineTypeCode);
            }
            // Check for Wine by Glass
            if (product.subcategory.includes('Wine by Glass')) {
              subcategoryCodes.add('WINE_BY_GLASS');
            }
            // Extract other subcategory codes (non-wine)
            const otherCodes = this.extractOtherSubcategoryCodes(product.subcategory);
            otherCodes.forEach(code => subcategoryCodes.add(code));
          }
        }
      }
    });
    
    // Build ordered subcategory list (wine types first, then others, then Wine by Glass)
    const orderedCodes = [
      // Wine types
      'WINE_RED', 'WINE_WHITE', 'WINE_SPARKLING', 'WINE_ROSE', 'WINE_SWEET', 'WINE_FORTIFIED',
      // Other beverage subcategories
      'HOT_DRINKS', 'COLD_DRINKS', 'ALCOHOLIC', 'NON_ALCOHOLIC', 'BEER', 'COCKTAILS', 'SOFT_DRINKS',
      // Starter subcategories
      'APPETIZERS', 'SALADS', 'SOUPS', 'BREAD_DIPS',
      // Main course subcategories
      'MEAT', 'FISH', 'POULTRY', 'VEGETARIAN', 'VEGAN', 'PASTA', 'RICE', 'PIZZA',
      // Dessert subcategories
      'CAKES', 'ICE_CREAM', 'FRUIT', 'CHEESE',
      // Side subcategories
      'VEGETABLES', 'POTATOES', 'BREAD',
      // Wine by Glass (always last)
      'WINE_BY_GLASS'
    ];
    
    const subcategories: string[] = [];
    
    orderedCodes.forEach(code => {
      if (subcategoryCodes.has(code)) {
        subcategories.push(code);
      }
    });
    
    this.availableSubcategories.set(subcategories);
  }

  extractOtherSubcategoryCodes(subcategory: string): string[] {
    const codes: string[] = [];
    const subcatLower = subcategory.toLowerCase();
    
    // Map common subcategory strings to codes
    if (subcategory === 'Appetizers' || subcatLower.includes('appetizers')) codes.push('APPETIZERS');
    if (subcategory === 'Salads' || subcatLower.includes('salads')) codes.push('SALADS');
    if (subcategory === 'Soups' || subcatLower.includes('soups')) codes.push('SOUPS');
    if (subcategory === 'Bread & Dips' || (subcatLower.includes('bread') && subcatLower.includes('dips'))) codes.push('BREAD_DIPS');
    if (subcategory === 'Meat') codes.push('MEAT');
    if (subcategory === 'Fish') codes.push('FISH');
    if (subcategory === 'Poultry') codes.push('POULTRY');
    if (subcategory === 'Vegetarian') codes.push('VEGETARIAN');
    if (subcategory === 'Vegan') codes.push('VEGAN');
    if (subcategory === 'Pasta') codes.push('PASTA');
    if (subcategory === 'Rice') codes.push('RICE');
    if (subcategory === 'Pizza') codes.push('PIZZA');
    if (subcategory === 'Cakes') codes.push('CAKES');
    if (subcategory === 'Ice Cream') codes.push('ICE_CREAM');
    if (subcategory === 'Fruit') codes.push('FRUIT');
    if (subcategory === 'Cheese') codes.push('CHEESE');
    if (subcategory === 'Hot Drinks') codes.push('HOT_DRINKS');
    if (subcategory === 'Cold Drinks') codes.push('COLD_DRINKS');
    if (subcategory === 'Alcoholic') codes.push('ALCOHOLIC');
    if (subcategory === 'Non-Alcoholic') codes.push('NON_ALCOHOLIC');
    if (subcategory === 'Beer') codes.push('BEER');
    if (subcategory === 'Cocktails') codes.push('COCKTAILS');
    if (subcategory === 'Soft Drinks') codes.push('SOFT_DRINKS');
    if (subcategory === 'Vegetables') codes.push('VEGETABLES');
    if (subcategory === 'Potatoes') codes.push('POTATOES');
    if (subcategory === 'Bread') codes.push('BREAD');
    
    return codes;
  }

  getWineTypeCodeFromString(wineType: string | undefined): string | null {
    if (!wineType) return null;
    if (wineType === 'Red Wine') return 'WINE_RED';
    if (wineType === 'White Wine') return 'WINE_WHITE';
    if (wineType === 'Sparkling Wine') return 'WINE_SPARKLING';
    if (wineType === 'Rosé Wine') return 'WINE_ROSE';
    if (wineType === 'Sweet Wine') return 'WINE_SWEET';
    if (wineType === 'Fortified Wine') return 'WINE_FORTIFIED';
    return null;
  }

  applyFilter(category: string | null, subcategoryCode: string | null) {
    let filtered = this.products();
    
    // Filter by main category
    if (category) {
      filtered = filtered.filter(p => p.category === category);
    }
    
    // Filter by subcategory code
    if (subcategoryCode) {
      if (subcategoryCode === 'WINE_BY_GLASS') {
        // Filter for products with "Wine by Glass" code
        filtered = filtered.filter(p => 
          p.subcategory_codes?.includes('WINE_BY_GLASS') || 
          (p.subcategory && p.subcategory.includes('Wine by Glass'))
        );
      } else {
        // Filter by subcategory code
        filtered = filtered.filter(p => {
          // Use subcategory_codes if available
          if (p.subcategory_codes && p.subcategory_codes.includes(subcategoryCode)) {
            return true;
          }
          // Fallback: check wine_type matches the code
          const wineTypeCode = this.getWineTypeCodeFromString(p.wine_type);
          return wineTypeCode === subcategoryCode;
        });
      }
    }
    
    this.filteredProducts.set(filtered);
  }

  getSubcategoryLabel(subcategoryCode: string): string {
    // Map subcategory codes to Spanish labels (can be extended for i18n)
    const labels: Record<string, string> = {
      // Wine types
      'WINE_RED': 'Tinto',
      'WINE_WHITE': 'Blanco',
      'WINE_SPARKLING': 'Espumoso',
      'WINE_ROSE': 'Rosado',
      'WINE_SWEET': 'Dulce',
      'WINE_FORTIFIED': 'Generoso',
      'WINE_BY_GLASS': 'Por Copas',
      // Beverages
      'HOT_DRINKS': 'Bebidas Calientes',
      'COLD_DRINKS': 'Bebidas Frías',
      'ALCOHOLIC': 'Alcohólicas',
      'NON_ALCOHOLIC': 'Sin Alcohol',
      'BEER': 'Cerveza',
      'COCKTAILS': 'Cócteles',
      'SOFT_DRINKS': 'Refrescos',
      // Starters
      'APPETIZERS': 'Aperitivos',
      'SALADS': 'Ensaladas',
      'SOUPS': 'Sopas',
      'BREAD_DIPS': 'Pan y Salsas',
      // Main Course
      'MEAT': 'Carne',
      'FISH': 'Pescado',
      'POULTRY': 'Aves',
      'VEGETARIAN': 'Vegetariano',
      'VEGAN': 'Vegano',
      'PASTA': 'Pasta',
      'RICE': 'Arroz',
      'PIZZA': 'Pizza',
      // Desserts
      'CAKES': 'Pasteles',
      'ICE_CREAM': 'Helados',
      'FRUIT': 'Fruta',
      'CHEESE': 'Queso',
      // Sides
      'VEGETABLES': 'Verduras',
      'POTATOES': 'Patatas',
      'BREAD': 'Pan',
    };
    return labels[subcategoryCode] || subcategoryCode;
  }

  getProductImageUrl(product: Product): string | null {
    if (!product.image_filename || !product.tenant_id) return null;
    // Handle both legacy product images and provider product images
    if (product.image_filename.startsWith('providers/')) {
      // Provider product image path
      return `${environment.apiUrl}/uploads/${product.image_filename}`;
    } else {
      // Legacy tenant product image path
      return `${environment.apiUrl}/uploads/${product.tenant_id}/products/${product.image_filename}`;
    }
  }

  toggleIngredients(productId: number) {
    this.showIngredientsFor.update(current => current === productId ? null : productId);
  }

  addToCart(product: Product) {
    this.cart.update(items => {
      const existing = items.find(i => i.product.id === product.id);
      if (existing) { return items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i); }
      return [...items, { product, quantity: 1, notes: '' }];
    });
  }

  incrementItem(item: CartItem) { this.cart.update(items => items.map(i => i.product.id === item.product.id ? { ...i, quantity: i.quantity + 1 } : i)); }

  decrementItem(item: CartItem) {
    if (item.quantity <= 1) { this.cart.update(items => items.filter(i => i.product.id !== item.product.id)); }
    else { this.cart.update(items => items.map(i => i.product.id === item.product.id ? { ...i, quantity: i.quantity - 1 } : i)); }
  }

  getTotalItems(): number { return this.cart().reduce((sum, item) => sum + item.quantity, 0); }
  getTotal(): number { return this.cart().reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0); }
  formatPrice(priceCents: number): string {
    const currencySymbol = this.tenantCurrency();
    return `${currencySymbol}${(priceCents / 100).toFixed(2)}`;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = { pending: 'Pending', preparing: 'Preparing', ready: 'Ready', paid: 'Paid', completed: 'Done' };
    return labels[status] || status;
  }

  submitOrder() {
    const items: OrderItemCreate[] = this.cart().map(item => ({ product_id: item.product.id!, quantity: item.quantity, notes: item.notes || undefined }));
    this.submitting.set(true);
    this.api.submitOrder(this.tableToken, { items, notes: this.orderNotes || undefined }).subscribe({
      next: (response: any) => {
        const orderId = response.order_id;
        const isNewOrder = response.status === 'created';
        if (isNewOrder) {
          const newOrder: PlacedOrder = { id: orderId, items: [...this.cart()], notes: this.orderNotes, total: this.getTotal(), status: 'pending' };
          this.placedOrders.set([newOrder]);
        } else {
          const currentOrder = this.placedOrders().find(o => o.id === orderId);
          if (currentOrder) {
            const updatedItems = [...currentOrder.items];
            for (const cartItem of this.cart()) {
              const existing = updatedItems.find(i => i.product.id === cartItem.product.id);
              if (existing) { existing.quantity += cartItem.quantity; }
              else { updatedItems.push(cartItem); }
            }
            const updatedOrder: PlacedOrder = { ...currentOrder, items: updatedItems, total: updatedItems.reduce((sum, i) => sum + i.product.price_cents * i.quantity, 0) };
            this.placedOrders.set([updatedOrder]);
          } else {
            const newOrder: PlacedOrder = { id: orderId, items: [...this.cart()], notes: this.orderNotes, total: this.getTotal(), status: 'pending' };
            this.placedOrders.set([newOrder]);
          }
        }
        this.saveOrders();
        this.lastOrderId.set(orderId);
        this.showSuccessToast.set(true);
        setTimeout(() => this.showSuccessToast.set(false), 3000);
        this.cart.set([]);
        this.orderNotes = '';
        this.submitting.set(false);
        this.ordersExpanded.set(true);
      },
      error: () => { this.submitting.set(false); alert('Failed to place order.'); }
    });
  }

  // Payment
  showPaymentModal = signal(false);
  paymentAmount = signal(0);
  cardError = signal('');
  processingPayment = signal(false);
  paymentSuccess = signal(false);
  isPaid = signal(false);
  private stripe: any = null;
  private cardElement: any = null;
  private clientSecret = '';
  private currentOrderId = 0;
  private paymentIntentId = '';

  async startCheckout(order: PlacedOrder) {
    this.currentOrderId = order.id;
    this.processingPayment.set(true);
    this.api.createPaymentIntent(order.id, this.tableToken).subscribe({
      next: async (response: any) => {
        this.clientSecret = response.client_secret;
        this.paymentIntentId = response.payment_intent_id;
        this.paymentAmount.set(response.amount);
        this.processingPayment.set(false);
        this.showPaymentModal.set(true);
        await this.loadStripe();
      },
      error: (err) => { this.processingPayment.set(false); alert(err.error?.detail || 'Failed'); }
    });
  }

  async loadStripe() {
    if (this.stripe) { this.mountCard(); return; }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => {
      this.stripe = (window as any).Stripe(this.api.getStripePublishableKey());
      this.mountCard();
    };
    document.head.appendChild(script);
  }

  mountCard() {
    if (!this.stripe) return;
    const elements = this.stripe.elements();
    this.cardElement = elements.create('card', { style: { base: { fontSize: '16px', color: '#1C1917', '::placeholder': { color: '#78716C' } } } });
    setTimeout(() => {
      const container = document.getElementById('card-element');
      if (container) { container.innerHTML = ''; this.cardElement.mount('#card-element'); this.cardElement.on('change', (e: any) => this.cardError.set(e.error ? e.error.message : '')); }
    }, 100);
  }

  async processPayment() {
    if (!this.stripe || !this.cardElement) return;
    this.processingPayment.set(true);
    this.cardError.set('');
    const { error, paymentIntent } = await this.stripe.confirmCardPayment(this.clientSecret, { payment_method: { card: this.cardElement } });
    if (error) { this.cardError.set(error.message); this.processingPayment.set(false); }
    else if (paymentIntent.status === 'succeeded') {
      this.api.confirmPayment(this.currentOrderId, this.tableToken, this.paymentIntentId).subscribe({
        next: () => {
          this.processingPayment.set(false);
          this.paymentSuccess.set(true);
          this.isPaid.set(true);
          localStorage.setItem(`paid_${this.tableToken}`, 'true');
        },
        error: () => { this.processingPayment.set(false); this.cardError.set('Payment confirmed but failed to update order.'); }
      });
    }
  }

  cancelPayment() { this.showPaymentModal.set(false); this.cardError.set(''); this.paymentSuccess.set(false); }

  finishPayment() {
    this.showPaymentModal.set(false);
    this.paymentSuccess.set(false);
    // Clear the order from localStorage since it's paid
    this.placedOrders.set([]);
    localStorage.removeItem(`orders_${this.tableToken}`);
  }

  getWineTypeClass(wineType: string): string {
    const type = wineType.toLowerCase();
    if (type.includes('red')) return 'red';
    if (type.includes('white')) return 'white';
    if (type.includes('sparkling')) return 'sparkling';
    if (type.includes('rosé') || type.includes('rose')) return 'rose';
    if (type.includes('sweet')) return 'sweet';
    if (type.includes('fortified')) return 'fortified';
    return 'other';
  }

  getWineTypeLabel(wineType: string): string {
    // Return shorter labels for display
    if (wineType.includes('Red')) return 'Tinto';
    if (wineType.includes('White')) return 'Blanco';
    if (wineType.includes('Sparkling')) return 'Espumoso';
    if (wineType.includes('Rosé') || wineType.includes('Rose')) return 'Rosado';
    if (wineType.includes('Sweet')) return 'Dulce';
    if (wineType.includes('Fortified')) return 'Generoso';
    return wineType;
  }
}
