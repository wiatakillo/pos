import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, SlicePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService, Product, OrderItemCreate } from '../services/api.service';
import { AudioService } from '../services/audio.service';
import { environment } from '../../environments/environment';
import { LanguagePickerComponent } from '../shared/language-picker.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
  status?: string;  // Item status from backend
  itemId?: number;  // Backend item ID for editing
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
  imports: [CommonModule, FormsModule, LanguagePickerComponent, TranslateModule, SlicePipe],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss'
})
export class MenuComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private audio = inject(AudioService);

  // Core state
  loading = signal(true);
  error = signal(false);
  products = signal<Product[]>([]);
  filteredProducts = signal<Product[]>([]);
  selectedCategory = signal<string | null>(null);
  selectedSubcategory = signal<string | null>(null);
  availableCategories = signal<string[]>([]);
  availableSubcategories = signal<string[]>([]);

  // Tenant info
  tenantName = signal('');
  tableName = signal('');
  tenantLogo = signal<string | null>(null);
  tenantDescription = signal<string | null>(null);
  tenantPhone = signal<string | null>(null);
  tenantWhatsapp = signal<string | null>(null);
  tenantAddress = signal<string | null>(null);
  tenantWebsite = signal<string | null>(null);
  tenantCurrency = signal<string>('$');
  tenantCurrencyCode = signal<string | null>(null);

  // Cart & Orders
  cart = signal<CartItem[]>([]);
  orderNotes = '';
  submitting = signal(false);
  placedOrders = signal<PlacedOrder[]>([]);
  showSuccessToast = signal(false);
  lastOrderId = signal(0);
  ordersExpanded = signal(true);
  menuExpanded = signal(true);

  // Product details toggles (legacy)
  showIngredientsFor = signal<number | null>(null);
  showDescriptionFor = signal<number | null>(null);

  // New UI state
  isScrolled = signal(false);
  cartExpanded = signal(false);
  selectedProduct = signal<Product | null>(null);

  // Customer identity
  customerName = signal('');
  showNameModal = signal(false);
  nameInputValue = '';

  // Payment
  showPaymentModal = signal(false);
  paymentAmount = signal(0);
  cardError = signal('');
  processingPayment = signal(false);
  paymentSuccess = signal(false);
  private stripe: any = null;
  private cardElement: any = null;
  private clientSecret = '';
  private currentOrderId = 0;
  private paymentIntentId = '';

  // Internal
  private tableToken = '';
  private tenantId = 0;
  private ws: WebSocket | null = null;
  private sessionId = '';

  // Computed
  tableGreeting = computed(() => {
    const name = this.customerName();
    const table = this.tableName();
    if (name) {
      return `Hey, ${name}! · ${table}`;
    }
    return table;
  });

  isPaid = computed(() => {
    const orders = this.placedOrders();
    if (orders.length === 0) return false;
    return orders[0].status === 'paid';
  });

  // Featured products (first 5 with images, for now)
  featuredProducts = computed(() => {
    return this.products()
      .filter(p => p.image_filename)
      .slice(0, 6);
  });

  // Listen for scroll to update sticky nav state
  @HostListener('window:scroll')
  onScroll() {
    this.isScrolled.set(window.scrollY > 200);
  }

  ngOnInit() {
    this.tableToken = this.route.snapshot.params['token'];
    this.initializeSession();
    this.loadMenu();
    this.loadStoredOrders();
  }

  ngOnDestroy() {
    this.ws?.close();
  }

  // ============================================
  // SESSION & CUSTOMER NAME
  // ============================================
  private initializeSession() {
    const sessionKey = `session_${this.tableToken}`;
    let sessionId = localStorage.getItem(sessionKey);

    if (!sessionId) {
      sessionId = this.generateUUID();
      localStorage.setItem(sessionKey, sessionId);
    }
    this.sessionId = sessionId;

    const nameKey = `customer_name_${this.tableToken}`;
    const customerName = localStorage.getItem(nameKey);

    if (!customerName) {
      this.showNameModal.set(true);
    } else {
      this.customerName.set(customerName);
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  skipName() {
    this.showNameModal.set(false);
    this.nameInputValue = '';
  }

  confirmName() {
    const name = this.nameInputValue.trim();
    if (name) {
      this.customerName.set(name);
      localStorage.setItem(`customer_name_${this.tableToken}`, name);
    }
    this.showNameModal.set(false);
    this.nameInputValue = '';
  }

  // ============================================
  // MENU LOADING
  // ============================================
  loadMenu() {
    this.api.getMenu(this.tableToken).subscribe({
      next: data => {
        const productsWithSource = data.products.map((product: Product) => ({
          ...product,
          _source: product._source || 'unknown'
        }));
        this.products.set(productsWithSource);
        this.tenantName.set(data.tenant_name);
        this.tableName.set(data.table_name);
        this.tenantId = data.tenant_id;

        this.connectWebSocket();

        const categories = new Set<string>();
        productsWithSource.forEach((product: Product) => {
          if (product.category) {
            categories.add(product.category);
          }
        });
        this.availableCategories.set(Array.from(categories).sort());

        this.updateSubcategories(null);
        this.applyFilter(null, null);

        if (data.tenant_logo && data.tenant_id) {
          this.tenantLogo.set(`${environment.apiUrl}/uploads/${data.tenant_id}/logo/${data.tenant_logo}`);
        }

        this.tenantDescription.set(data.tenant_description || null);
        this.tenantPhone.set(data.tenant_phone || null);
        this.tenantWhatsapp.set(data.tenant_whatsapp || null);
        this.tenantAddress.set(data.tenant_address || null);
        this.tenantWebsite.set(data.tenant_website || null);
        this.tenantCurrency.set(data.tenant_currency || '$');
        this.tenantCurrencyCode.set(data.tenant_currency_code || null);

        if (data.tenant_stripe_publishable_key) {
          this.api.setTenantStripeKey(data.tenant_stripe_publishable_key);
        }

        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  // ============================================
  // WEBSOCKET
  // ============================================
  connectWebSocket() {
    if (this.ws || !this.tableToken) return;
    const wsUrl = environment.wsUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    this.ws = new WebSocket(`${wsUrl}/ws/table/${this.tableToken}`);
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status_update') {
          this.audio.playCustomerStatusChange();
          this.placedOrders.update(orders => orders.map(o => o.id === data.order_id ? { ...o, status: data.status } : o));
          this.saveOrders();
          this.loadStoredOrders();
        } else if (data.type === 'item_status_update') {
          this.audio.playCustomerStatusChange();
          if (data.status) {
            this.placedOrders.update(orders =>
              orders.map(o => o.id === data.order_id ? { ...o, status: data.status } : o)
            );
          }
          this.loadStoredOrders();
        } else if (data.type === 'item_removed' || data.type === 'item_updated' || data.type === 'order_cancelled' || data.type === 'items_added' || data.type === 'new_order') {
          this.audio.playCustomerOrderChange();
          this.loadStoredOrders();
        }
      } catch { }
    };
    this.ws.onclose = () => {
      this.ws = null;
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  // ============================================
  // ORDER STORAGE
  // ============================================
  loadStoredOrders() {
    if (this.sessionId) {
      this.api.getCurrentOrder(this.tableToken, this.sessionId).subscribe({
        next: (response) => {
          if (response.order) {
            if (response.order.session_id === this.sessionId) {
              const activeItems = response.order.items.filter((item: any) => !item.removed_by_customer);
              const order: PlacedOrder = {
                id: response.order.id,
                items: activeItems.map((item: any) => ({
                  product: {
                    id: item.product_id,
                    name: item.product_name,
                    price_cents: item.price_cents
                  } as Product,
                  quantity: item.quantity,
                  notes: item.notes || '',
                  status: item.status,
                  itemId: item.id
                } as CartItem)),
                notes: response.order.notes || '',
                total: response.order.total_cents,
                status: response.order.status
              };
              this.placedOrders.set([order]);
              this.saveOrders();
            } else {
              this.loadStoredOrdersFromLocalStorage();
            }
          } else {
            this.loadStoredOrdersFromLocalStorage();
          }
        },
        error: () => {
          this.loadStoredOrdersFromLocalStorage();
        }
      });
    } else {
      this.loadStoredOrdersFromLocalStorage();
    }
  }

  private loadStoredOrdersFromLocalStorage() {
    if (this.sessionId) {
      this.api.getCurrentOrder(this.tableToken, this.sessionId).subscribe({
        next: (response) => {
          if (response.order && response.order.session_id === this.sessionId) {
            const activeItems = response.order.items.filter((item: any) => !item.removed_by_customer);
            const order: PlacedOrder = {
              id: response.order.id,
              items: activeItems.map((item: any) => ({
                product: {
                  id: item.product_id,
                  name: item.product_name,
                  price_cents: item.price_cents
                } as Product,
                quantity: item.quantity,
                notes: item.notes || '',
                status: item.status,
                itemId: item.id
              } as CartItem)),
              notes: response.order.notes || '',
              total: response.order.total_cents,
              status: response.order.status
            };
            this.placedOrders.set([order]);
            this.saveOrders();
            return;
          }
          this.loadFromLocalStorageFallback();
        },
        error: () => {
          this.loadFromLocalStorageFallback();
        }
      });
    } else {
      this.loadFromLocalStorageFallback();
    }
  }

  private loadFromLocalStorageFallback() {
    const stored = localStorage.getItem(`orders_${this.tableToken}`);
    if (stored) {
      try {
        const orders: PlacedOrder[] = JSON.parse(stored);
        const activeOrders = orders.filter(o => o.status !== 'paid' && o.status !== 'completed');
        this.placedOrders.set(activeOrders);
        if (activeOrders.length !== orders.length) {
          this.saveOrders();
        }
      } catch { }
    }
  }

  saveOrders() {
    localStorage.setItem(`orders_${this.tableToken}`, JSON.stringify(this.placedOrders()));
  }

  // ============================================
  // CATEGORY FILTERING
  // ============================================
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

    const subcategoryCodes = new Set<string>();

    this.products().forEach((product: Product) => {
      if (product.category === category) {
        if (product.subcategory_codes && product.subcategory_codes.length > 0) {
          product.subcategory_codes.forEach(code => subcategoryCodes.add(code));
        } else {
          if (product.subcategory) {
            const wineTypeCode = this.getWineTypeCodeFromString(product.wine_type || product.subcategory);
            if (wineTypeCode) {
              subcategoryCodes.add(wineTypeCode);
            }
            if (product.subcategory.includes('Wine by Glass')) {
              subcategoryCodes.add('WINE_BY_GLASS');
            }
            const otherCodes = this.extractOtherSubcategoryCodes(product.subcategory);
            otherCodes.forEach(code => subcategoryCodes.add(code));
          }
        }
      }
    });

    const orderedCodes = [
      'WINE_RED', 'WINE_WHITE', 'WINE_SPARKLING', 'WINE_ROSE', 'WINE_SWEET', 'WINE_FORTIFIED',
      'HOT_DRINKS', 'COLD_DRINKS', 'ALCOHOLIC', 'NON_ALCOHOLIC', 'BEER', 'COCKTAILS', 'SOFT_DRINKS',
      'APPETIZERS', 'SALADS', 'SOUPS', 'BREAD_DIPS',
      'MEAT', 'FISH', 'POULTRY', 'VEGETARIAN', 'VEGAN', 'PASTA', 'RICE', 'PIZZA',
      'CAKES', 'ICE_CREAM', 'FRUIT', 'CHEESE',
      'VEGETABLES', 'POTATOES', 'BREAD',
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

    if (category) {
      filtered = filtered.filter(p => p.category === category);
    }

    if (subcategoryCode) {
      if (subcategoryCode === 'WINE_BY_GLASS') {
        filtered = filtered.filter(p =>
          p.subcategory_codes?.includes('WINE_BY_GLASS') ||
          (p.subcategory && p.subcategory.includes('Wine by Glass'))
        );
      } else {
        filtered = filtered.filter(p => {
          if (p.subcategory_codes && p.subcategory_codes.includes(subcategoryCode)) {
            return true;
          }
          const wineTypeCode = this.getWineTypeCodeFromString(p.wine_type);
          return wineTypeCode === subcategoryCode;
        });
      }
    }

    filtered = filtered.map(p => ({
      ...p,
      _source: p._source || 'unknown'
    }));

    this.filteredProducts.set(filtered);
  }

  getSubcategoryLabel(subcategoryCode: string): string {
    const labels: Record<string, string> = {
      'WINE_RED': 'Tinto',
      'WINE_WHITE': 'Blanco',
      'WINE_SPARKLING': 'Espumoso',
      'WINE_ROSE': 'Rosado',
      'WINE_SWEET': 'Dulce',
      'WINE_FORTIFIED': 'Generoso',
      'WINE_BY_GLASS': 'Por Copas',
      'HOT_DRINKS': 'Bebidas Calientes',
      'COLD_DRINKS': 'Bebidas Frías',
      'ALCOHOLIC': 'Alcohólicas',
      'NON_ALCOHOLIC': 'Sin Alcohol',
      'BEER': 'Cerveza',
      'COCKTAILS': 'Cócteles',
      'SOFT_DRINKS': 'Refrescos',
      'APPETIZERS': 'Aperitivos',
      'SALADS': 'Ensaladas',
      'SOUPS': 'Sopas',
      'BREAD_DIPS': 'Pan y Salsas',
      'MEAT': 'Carne',
      'FISH': 'Pescado',
      'POULTRY': 'Aves',
      'VEGETARIAN': 'Vegetariano',
      'VEGAN': 'Vegano',
      'PASTA': 'Pasta',
      'RICE': 'Arroz',
      'PIZZA': 'Pizza',
      'CAKES': 'Pasteles',
      'ICE_CREAM': 'Helados',
      'FRUIT': 'Fruta',
      'CHEESE': 'Queso',
      'VEGETABLES': 'Verduras',
      'POTATOES': 'Patatas',
      'BREAD': 'Pan',
    };
    return labels[subcategoryCode] || subcategoryCode;
  }

  // ============================================
  // CATEGORY ICONS (for sticky nav)
  // ============================================
  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'Starters': '🥗',
      'Main Course': '🍝',
      'Desserts': '🍰',
      'Beverages': '🍷',
      'Sides': '🥔',
      'Wine': '🍷',
      'Appetizers': '🥗',
      'Entrees': '🍖',
      'Pasta': '🍝',
      'Pizza': '🍕',
      'Seafood': '🦐',
      'Meat': '🥩',
      'Salads': '🥗',
      'Soups': '🍲',
      'Coffee': '☕',
      'Tea': '🍵',
    };
    return icons[category] || '🍽️';
  }

  // ============================================
  // PRODUCT HELPERS
  // ============================================
  getProductImageUrl(product: Product): string | null {
    if (!product.image_filename || !product.tenant_id) return null;
    if (product.image_filename.startsWith('providers/')) {
      return `${environment.apiUrl}/uploads/${product.image_filename}`;
    } else {
      return `${environment.apiUrl}/uploads/${product.tenant_id}/products/${product.image_filename}`;
    }
  }

  getProductKey(product: Product): string {
    if (!product) return 'null-product';
    const source = product._source || 'unknown';
    const id = product.id ?? 'no-id';
    const name = product.name || 'no-name';
    const price = product.price_cents ?? 0;
    return `${source}-${id}-${name}-${price}`;
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
    if (wineType.includes('Red')) return 'Tinto';
    if (wineType.includes('White')) return 'Blanco';
    if (wineType.includes('Sparkling')) return 'Espumoso';
    if (wineType.includes('Rosé') || wineType.includes('Rose')) return 'Rosado';
    if (wineType.includes('Sweet')) return 'Dulce';
    if (wineType.includes('Fortified')) return 'Generoso';
    return wineType;
  }

  // ============================================
  // DIETARY INFO HELPERS
  // ============================================
  hasDietaryInfo(product: Product): boolean {
    return this.isVegetarian(product) || this.isVegan(product) || this.isGlutenFree(product);
  }

  isVegetarian(product: Product): boolean {
    const ingredients = product.ingredients?.toLowerCase() || '';
    const subcategory = product.subcategory?.toLowerCase() || '';
    return subcategory.includes('vegetarian') ||
      ingredients.includes('vegetariano') ||
      ingredients.includes('vegetarian');
  }

  isVegan(product: Product): boolean {
    const ingredients = product.ingredients?.toLowerCase() || '';
    const subcategory = product.subcategory?.toLowerCase() || '';
    return subcategory.includes('vegan') ||
      ingredients.includes('vegano') ||
      ingredients.includes('vegan');
  }

  isGlutenFree(product: Product): boolean {
    const ingredients = product.ingredients?.toLowerCase() || '';
    return ingredients.includes('sin gluten') ||
      ingredients.includes('gluten-free') ||
      ingredients.includes('gluten free');
  }

  // ============================================
  // PRODUCT DETAIL (legacy toggles + new modal)
  // ============================================
  toggleIngredients(productId: number) {
    this.showIngredientsFor.update(current => current === productId ? null : productId);
  }

  toggleDescription(productId: number) {
    this.showDescriptionFor.update(current => current === productId ? null : productId);
  }

  openProductDetail(product: Product) {
    this.selectedProduct.set(product);
    document.body.style.overflow = 'hidden';
  }

  closeProductDetail() {
    this.selectedProduct.set(null);
    document.body.style.overflow = '';
  }

  // ============================================
  // CART OPERATIONS
  // ============================================
  addToCart(product: Product) {
    const productKey = this.getProductKey(product);
    this.cart.update(items => {
      const existing = items.find(i => this.getProductKey(i.product) === productKey);
      if (existing) {
        return items.map(i => this.getProductKey(i.product) === productKey ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...items, { product, quantity: 1, notes: '' }];
    });
    // Auto-expand cart when adding first item
    if (this.cart().length === 1) {
      this.cartExpanded.set(true);
    }
  }

  incrementItem(item: CartItem) {
    const productKey = this.getProductKey(item.product);
    this.cart.update(items => items.map(i => this.getProductKey(i.product) === productKey ? { ...i, quantity: i.quantity + 1 } : i));
  }

  decrementItem(item: CartItem) {
    const productKey = this.getProductKey(item.product);
    if (item.quantity <= 1) {
      this.cart.update(items => items.filter(i => this.getProductKey(i.product) !== productKey));
    } else {
      this.cart.update(items => items.map(i => this.getProductKey(i.product) === productKey ? { ...i, quantity: i.quantity - 1 } : i));
    }
  }

  getTotalItems(): number {
    return this.cart().reduce((sum, item) => sum + item.quantity, 0);
  }

  getTotal(): number {
    return this.cart().reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0);
  }

  formatPrice(priceCents: number): string {
    const currencyCode = this.tenantCurrencyCode();
    const locale = navigator.language || 'en-US';
    if (currencyCode) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'symbol'
      }).format(priceCents / 100);
    }
    const currencySymbol = this.tenantCurrency();
    return `${currencySymbol}${(priceCents / 100).toFixed(2)}`;
  }

  // ============================================
  // ORDER SUBMISSION
  // ============================================
  submitOrder() {
    const items: OrderItemCreate[] = this.cart().map(item => ({
      product_id: item.product.id!,
      quantity: item.quantity,
      notes: item.notes || undefined,
      source: item.product._source || undefined
    }));
    this.submitting.set(true);
    this.api.submitOrder(this.tableToken, {
      items,
      notes: this.orderNotes || undefined,
      session_id: this.sessionId,
      customer_name: this.customerName() || undefined
    }).subscribe({
      next: (response: any) => {
        const orderId = response.order_id;

        if (response.session_id && response.session_id !== this.sessionId) {
          console.warn('Session ID mismatch - order may belong to different session');
        }

        if (response.customer_name && response.customer_name !== this.customerName()) {
          this.customerName.set(response.customer_name);
          localStorage.setItem(`customer_name_${this.tableToken}`, response.customer_name);
        }

        this.cart.set([]);
        this.cartExpanded.set(false);
        this.orderNotes = '';
        this.lastOrderId.set(orderId);
        this.showSuccessToast.set(true);
        setTimeout(() => this.showSuccessToast.set(false), 3000);
        this.ordersExpanded.set(true);
        this.submitting.set(false);

        this.loadStoredOrders();
      },
      error: () => {
        this.submitting.set(false);
        alert('Failed to place order.');
      }
    });
  }

  // ============================================
  // ORDER MANAGEMENT
  // ============================================
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      partially_delivered: 'Partially Delivered',
      paid: 'Paid',
      completed: 'Done',
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

  getSortedOrderItems(items: CartItem[]): CartItem[] {
    return [...items].sort((a, b) => {
      if (a.itemId && b.itemId) {
        return b.itemId - a.itemId;
      }
      if (a.itemId && !b.itemId) return -1;
      if (!a.itemId && b.itemId) return 1;
      return 0;
    });
  }

  canCancelOrder(order: PlacedOrder): boolean {
    if (order.status === 'paid' || order.status === 'completed' || order.status === 'cancelled') {
      return false;
    }

    const hasNonPendingItems = order.items.some(item => {
      const itemStatus = item.status || 'pending';
      return itemStatus !== 'pending' && itemStatus !== 'cancelled';
    });

    return !hasNonPendingItems;
  }

  cancelOrder(orderId: number) {
    if (!confirm('Are you sure you want to cancel this entire order?')) {
      return;
    }

    this.api.cancelOrder(this.tableToken, orderId, this.sessionId).subscribe({
      next: () => {
        this.placedOrders.set([]);
        localStorage.removeItem(`orders_${this.tableToken}`);
        alert('Order cancelled');
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to cancel order';
        if (errorMsg.includes('delivered')) {
          alert('Cannot cancel order with delivered items');
        } else if (errorMsg.includes('preparing') || errorMsg.includes('ready')) {
          alert('Cannot cancel order with items that are being prepared or ready');
        } else {
          alert(errorMsg);
        }
      }
    });
  }

  removeItemFromOrder(orderId: number, itemId: number) {
    if (!confirm('Are you sure you want to remove this item from your order?')) {
      return;
    }

    const currentOrder = this.placedOrders().find(o => o.id === orderId);
    const itemToRemove = currentOrder?.items.find(item => item.itemId === itemId);
    const productId = itemToRemove?.product.id;

    this.api.removeOrderItem(this.tableToken, orderId, itemId, this.sessionId).subscribe({
      next: () => {
        this.loadStoredOrders();
        if (productId) {
          this.cart.update(items => items.filter(i => i.product.id !== productId));
        }
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to remove item';
        if (errorMsg.includes('delivered')) {
          alert('Cannot remove items that have already been delivered');
        } else {
          alert(errorMsg);
        }
      }
    });
  }

  updateItemQuantity(orderId: number, itemId: number, quantity: number) {
    if (quantity <= 0) {
      alert('Quantity must be at least 1');
      return;
    }
    this.api.updateOrderItemQuantity(this.tableToken, orderId, itemId, quantity, this.sessionId).subscribe({
      next: () => {
        this.loadStoredOrders();
      },
      error: (err) => {
        const errorMsg = err.error?.detail || 'Failed to update quantity';
        if (errorMsg.includes('preparing') || errorMsg.includes('ready') || errorMsg.includes('delivered')) {
          alert('Cannot modify items that are being prepared, ready, or delivered');
        } else {
          alert(errorMsg);
        }
      }
    });
  }

  // ============================================
  // PAYMENT
  // ============================================
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
      error: (err) => {
        this.processingPayment.set(false);
        alert(err.error?.detail || 'Failed');
      }
    });
  }

  async loadStripe() {
    if (this.stripe) {
      this.mountCard();
      return;
    }
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
    this.cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#1C1917',
          '::placeholder': { color: '#78716C' }
        }
      }
    });
    setTimeout(() => {
      const container = document.getElementById('card-element');
      if (container) {
        container.innerHTML = '';
        this.cardElement.mount('#card-element');
        this.cardElement.on('change', (e: any) => this.cardError.set(e.error ? e.error.message : ''));
      }
    }, 100);
  }

  async processPayment() {
    if (!this.stripe || !this.cardElement) return;
    this.processingPayment.set(true);
    this.cardError.set('');
    const { error, paymentIntent } = await this.stripe.confirmCardPayment(this.clientSecret, {
      payment_method: { card: this.cardElement }
    });
    if (error) {
      this.cardError.set(error.message);
      this.processingPayment.set(false);
    } else if (paymentIntent.status === 'succeeded') {
      this.api.confirmPayment(this.currentOrderId, this.tableToken, this.paymentIntentId).subscribe({
        next: () => {
          this.processingPayment.set(false);
          this.paymentSuccess.set(true);
          this.loadStoredOrders();
        },
        error: () => {
          this.processingPayment.set(false);
          this.cardError.set('Payment confirmed but failed to update order.');
        }
      });
    }
  }

  cancelPayment() {
    this.showPaymentModal.set(false);
    this.cardError.set('');
    this.paymentSuccess.set(false);
    document.body.style.overflow = '';
  }

  finishPayment() {
    this.showPaymentModal.set(false);
    this.paymentSuccess.set(false);
    document.body.style.overflow = '';
    this.loadStoredOrders();
  }
}
