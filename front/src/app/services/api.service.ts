import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, Subject, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

// Interfaces
export interface User {
  email: string;
  tenant_id: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterResponse {
  status: string;
  tenant_id: number;
  email: string;
}

export interface Product {
  id?: number;
  name: string;
  price_cents: number;
  tenant_id?: number;
  image_filename?: string;
  ingredients?: string;
  image_size_bytes?: number | null;
  image_size_formatted?: string | null;
  category?: string; // Main category: "Starters", "Main Course", "Desserts", "Beverages", "Sides"
  subcategory?: string; // Subcategory: "Red Wine", "Appetizers", etc.
  // Legacy fields (for menu products from catalog)
  category_code?: string; // Category code for i18n: "STARTERS", "MAIN_COURSE", "BEVERAGES", etc.
  subcategory_codes?: string[]; // Subcategory codes for i18n: ["WINE_RED", "WINE_BY_GLASS"], etc.
  // Wine details (for catalog products)
  description?: string;
  detailed_description?: string;
  country?: string;
  region?: string;
  wine_type?: string; // "Red Wine", "White Wine", "Sparkling Wine", etc.
  wine_style?: string;
  vintage?: number;
  winery?: string;
  grape_variety?: string;
  aromas?: string;
  elaboration?: string;
  _source?: string; // "tenant_product" or "product" to distinguish between TenantProduct and legacy Product
}

export interface CatalogCategories {
  [category: string]: string[]; // category -> list of subcategories
}

export interface Floor {
  id?: number;
  name: string;
  sort_order: number;
  tenant_id?: number;
}

export interface Table {
  id?: number;
  name: string;
  token?: string;
  tenant_id?: number;
  floor_id?: number;
  x_position?: number;
  y_position?: number;
  rotation?: number;
  shape?: 'rectangle' | 'circle' | 'oval' | 'booth' | 'bar';
  width?: number;
  height?: number;
  seat_count?: number;
}

export interface CanvasTable extends Table {
  status?: 'available' | 'occupied' | 'reserved';
}

export interface OrderItem {
  id?: number;
  product_name: string;
  quantity: number;
  price_cents: number;
  notes?: string;
  status?: string;  // pending, preparing, ready, delivered, cancelled
  removed_by_customer?: boolean;
  removed_at?: string;
  removed_reason?: string;
}

export interface Order {
  id: number;
  table_name: string;
  status: string;
  notes?: string;
  session_id?: string;
  customer_name?: string;
  created_at: string;
  items: OrderItem[];
  total_cents: number;
  removed_items_count?: number;
  paid_at?: string | null;
  payment_method?: string | null;
}

export interface MenuResponse {
  table_name: string;
  table_id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_logo?: string | null;
  tenant_description?: string | null;
  tenant_phone?: string | null;
  tenant_whatsapp?: string | null;
  tenant_address?: string | null;
  tenant_website?: string | null;
  tenant_currency?: string | null;
  tenant_stripe_publishable_key?: string | null;
  products: Product[];
}

export interface TenantSettings {
  id?: number;
  name: string;
  business_type?: string | null;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  logo_filename?: string | null;
  opening_hours?: string | null;
  immediate_payment_required?: boolean;
  currency?: string | null;
  stripe_secret_key?: string | null;
  stripe_publishable_key?: string | null;
  logo_size_bytes?: number | null;
  logo_size_formatted?: string | null;
}

export interface OrderItemCreate {
  product_id: number;
  quantity: number;
  notes?: string;
  source?: string; // "tenant_product" or "product" to distinguish between TenantProduct and legacy Product
}

export interface OrderCreate {
  items: OrderItemCreate[];
  notes?: string;
  session_id?: string;  // Session identifier for order isolation
  customer_name?: string;  // Optional customer name
}

// Provider & Catalog Interfaces
export interface Provider {
  id?: number;
  name: string;
  url?: string | null;
  api_endpoint?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface ProviderProduct {
  id?: number;
  catalog_id: number;
  provider_id: number;
  external_id: string;
  name: string;
  price_cents?: number | null;
  image_url?: string | null;
  availability?: boolean;
  country?: string | null;
  region?: string | null;
  grape_variety?: string | null;
  volume_ml?: number | null;
  unit?: string | null;
}

export interface CatalogItem {
  id: number;
  name: string;
  description?: string | null;
  detailed_description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  barcode?: string | null;
  brand?: string | null;
  image_url?: string | null;
  country?: string | null;
  region?: string | null;
  wine_style?: string | null;
  vintage?: number | null;
  winery?: string | null;
  grape_variety?: string | null;
  aromas?: string | null;
  elaboration?: string | null;
  providers: ProviderInfo[];
  min_price_cents?: number | null;
  max_price_cents?: number | null;
}

export interface ProviderInfo {
  provider_id: number;
  provider_name: string;
  provider_product_id?: number;
  price_cents?: number | null;
  image_url?: string | null;
  country?: string | null;
  region?: string | null;
  grape_variety?: string | null;
  volume_ml?: number | null;
  unit?: string | null;
}

export interface TenantProduct {
  id?: number;
  tenant_id?: number;
  catalog_id: number;
  provider_product_id?: number | null;
  product_id?: number | null;
  name: string;
  price_cents: number;
  image_filename?: string | null;
  ingredients?: string | null;
  is_active?: boolean;
  catalog_name?: string | null;
  provider_info?: {
    provider_id: number;
    provider_name: string;
    provider_price_cents?: number | null;
  } | null;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private wsUrl = environment.wsUrl;


  private userSubject = new BehaviorSubject<User | null>(null);
  private orderUpdates = new Subject<any>();
  private ws: WebSocket | null = null;

  user$ = this.userSubject.asObservable();
  orderUpdates$ = this.orderUpdates.asObservable();

  constructor() {
    this.checkAuth().subscribe();
  }

  // Check authentication status with backend (cookies)
  checkAuth(): Observable<User | null> {
    return this.http.get<User>(`${this.apiUrl}/users/me`).pipe(
      tap(user => this.userSubject.next(user)),
      catchError(() => {
        this.userSubject.next(null);
        return of(null); // Return null on error
      })
    );
  }

  getCurrentUser(): User | null {
    return this.userSubject.value;
  }

  // Auth
  register(data: any): Observable<RegisterResponse> {
    let params = new HttpParams();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        params = params.set(key, data[key]);
      }
    });
    return this.http.post<RegisterResponse>(`${this.apiUrl}/register`, null, { params });
  }

  login(credentials: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/token`, credentials).pipe(
      tap(() => {
        this.checkAuth();
      })
    );
  }

  logout() {
    this.http.post(`${this.apiUrl}/logout`, {}).subscribe({
      next: () => {
        this.userSubject.next(null);
        this.disconnectWebSocket();
      },
      error: () => {
        // Even if logout fails server-side, clear local state
        this.userSubject.next(null);
        this.disconnectWebSocket();
      }
    });
  }

  // Products
  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}/products`);
  }

  createProduct(product: Product): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/products`, product);
  }

  updateProduct(id: number, product: Partial<Product>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/products/${id}`, product);
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/products/${id}`);
  }

  uploadProductImage(productId: number, file: File): Observable<Product> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<Product>(`${this.apiUrl}/products/${productId}/image`, formData);
  }

  getProductImageUrl(product: Product): string | null {
    if (!product.image_filename) return null;
    // Provider images have full path like "providers/{token}/products/{filename}"
    if (product.image_filename.startsWith('providers/')) {
      return `${this.apiUrl}/uploads/${product.image_filename}`;
    }
    // Regular product images are in tenant folder
    if (!product.tenant_id) return null;
    return `${this.apiUrl}/uploads/${product.tenant_id}/products/${product.image_filename}`;
  }

  // Floors
  getFloors(): Observable<Floor[]> {
    return this.http.get<Floor[]>(`${this.apiUrl}/floors`);
  }

  createFloor(name: string, sortOrder?: number): Observable<Floor> {
    const body: { name: string; sort_order?: number } = { name };
    if (sortOrder !== undefined) body.sort_order = sortOrder;
    return this.http.post<Floor>(`${this.apiUrl}/floors`, body);
  }

  updateFloor(id: number, data: Partial<Floor>): Observable<Floor> {
    return this.http.put<Floor>(`${this.apiUrl}/floors/${id}`, data);
  }

  deleteFloor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/floors/${id}`);
  }

  // Tables
  getTables(): Observable<Table[]> {
    return this.http.get<Table[]>(`${this.apiUrl}/tables`);
  }

  getTablesWithStatus(): Observable<CanvasTable[]> {
    return this.http.get<CanvasTable[]>(`${this.apiUrl}/tables/with-status`);
  }

  createTable(name: string, floorId?: number): Observable<Table> {
    const body: { name: string; floor_id?: number } = { name };
    if (floorId !== undefined) body.floor_id = floorId;
    return this.http.post<Table>(`${this.apiUrl}/tables`, body);
  }

  updateTable(id: number, data: Partial<Table>): Observable<Table> {
    return this.http.put<Table>(`${this.apiUrl}/tables/${id}`, data);
  }

  deleteTable(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tables/${id}`);
  }

  // Orders
  getOrders(includeRemoved: boolean = false): Observable<Order[]> {
    const params = includeRemoved ? { params: { include_removed: 'true' } } : {};
    return this.http.get<Order[]>(`${this.apiUrl}/orders`, params);
  }

  updateOrderStatus(orderId: number, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/orders/${orderId}/status`, { status });
  }

  updateOrderItemStatus(orderId: number, itemId: number, status: string, userId?: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/orders/${orderId}/items/${itemId}/status`, { 
      status, 
      user_id: userId 
    });
  }

  removeOrderItem(tableToken: string, orderId: number, itemId: number, sessionId?: string, reason?: string): Observable<any> {
    let url = `${this.apiUrl}/menu/${tableToken}/order/${orderId}/items/${itemId}`;
    const params: string[] = [];
    if (sessionId) {
      params.push(`session_id=${encodeURIComponent(sessionId)}`);
    }
    if (reason) {
      params.push(`reason=${encodeURIComponent(reason)}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return this.http.delete(url);
  }

  updateOrderItemQuantity(tableToken: string, orderId: number, itemId: number, quantity: number, sessionId?: string): Observable<any> {
    let url = `${this.apiUrl}/menu/${tableToken}/order/${orderId}/items/${itemId}`;
    if (sessionId) {
      url += `?session_id=${encodeURIComponent(sessionId)}`;
    }
    return this.http.put(url, { quantity });
  }

  cancelOrder(tableToken: string, orderId: number, sessionId?: string): Observable<any> {
    let url = `${this.apiUrl}/menu/${tableToken}/order/${orderId}`;
    if (sessionId) {
      url += `?session_id=${encodeURIComponent(sessionId)}`;
    }
    return this.http.delete(url);
  }

  // Restaurant staff endpoints
  markOrderPaid(orderId: number, paymentMethod: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/orders/${orderId}/mark-paid`, { payment_method: paymentMethod });
  }

  resetItemStatus(orderId: number, itemId: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/orders/${orderId}/items/${itemId}/reset-status`, {});
  }

  cancelOrderItemStaff(orderId: number, itemId: number, reason: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/orders/${orderId}/items/${itemId}/cancel`, { reason });
  }

  updateOrderItemQuantityStaff(orderId: number, itemId: number, quantity: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/orders/${orderId}/items/${itemId}`, { quantity });
  }

  removeOrderItemStaff(orderId: number, itemId: number, reason?: string): Observable<any> {
    let url = `${this.apiUrl}/orders/${orderId}/items/${itemId}`;
    const params: string[] = [];
    if (reason) {
      params.push(`reason=${encodeURIComponent(reason)}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return this.http.delete(url);
  }

  // Public Menu (no auth)
  getMenu(tableToken: string): Observable<MenuResponse> {
    return this.http.get<MenuResponse>(`${this.apiUrl}/menu/${tableToken}`);
  }

  submitOrder(tableToken: string, order: OrderCreate): Observable<any> {
    return this.http.post(`${this.apiUrl}/menu/${tableToken}/order`, order);
  }

  getCurrentOrder(tableToken: string, sessionId?: string): Observable<any> {
    let params = new HttpParams();
    if (sessionId) {
      params = params.set('session_id', sessionId);
    }
    return this.http.get(`${this.apiUrl}/menu/${tableToken}/order`, { params });
  }

  // Payments
  createPaymentIntent(orderId: number, tableToken: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/orders/${orderId}/create-payment-intent?table_token=${tableToken}`, {});
  }

  confirmPayment(orderId: number, tableToken: string, paymentIntentId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/orders/${orderId}/confirm-payment?table_token=${tableToken}&payment_intent_id=${paymentIntentId}`,
      {}
    );
  }

  private tenantStripeKey = signal<string | null>(null);

  getStripePublishableKey(): string {
    // Use tenant-specific key if available, otherwise fallback to environment
    return this.tenantStripeKey() || environment.stripePublishableKey || '';
  }

  setTenantStripeKey(key: string | null): void {
    this.tenantStripeKey.set(key);
  }

  loadTenantStripeKey(): void {
    // Load tenant settings to get Stripe publishable key
    this.getTenantSettings().subscribe({
      next: (settings) => {
        this.tenantStripeKey.set(settings.stripe_publishable_key || null);
      },
      error: (err) => {
        console.error('Failed to load tenant Stripe key:', err);
        // Fallback to environment key
        this.tenantStripeKey.set(null);
      }
    });
  }

  // Tenant Settings
  getTenantSettings(): Observable<TenantSettings> {
    return this.http.get<TenantSettings>(`${this.apiUrl}/tenant/settings`);
  }

  updateTenantSettings(settings: Partial<TenantSettings>): Observable<TenantSettings> {
    return this.http.put<TenantSettings>(`${this.apiUrl}/tenant/settings`, settings);
  }

  uploadTenantLogo(file: File): Observable<TenantSettings> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<TenantSettings>(`${this.apiUrl}/tenant/logo`, formData);
  }

  getTenantLogoUrl(logoFilename: string | null | undefined, tenantId: number | null | undefined): string | null {
    if (!logoFilename || !tenantId) return null;
    return `${this.apiUrl}/uploads/${tenantId}/logo/${logoFilename}`;
  }

  // WebSocket for real-time updates (restaurant owners only)
  connectWebSocket(): void {
    const user = this.getCurrentUser();
    const token = this.getToken();
    if (!user || !token || this.ws) return;

    // Normalize WebSocket URL - handle both http/https and ws/wss formats
    let wsUrl = this.wsUrl;
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      // If it doesn't start with a protocol, assume ws://
      wsUrl = `ws://${wsUrl}`;
    }

    // Use tenant endpoint with JWT authentication
    const wsEndpoint = `${wsUrl}/ws/tenant/${user.tenant_id}?token=${encodeURIComponent(token)}`;
    
    try {
      this.ws = new WebSocket(wsEndpoint);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.orderUpdates.next(data);
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      };

      this.ws.onclose = (event) => {
        this.ws = null;
        console.log(`WebSocket closed: code=${event.code}, reason="${event.reason || 'none'}", wasClean=${event.wasClean}`);
        
        // Only reconnect if it wasn't a normal closure (code 1000)
        // Don't reconnect on authentication errors (code 1008)
        if (event.code !== 1000 && event.code !== 1008) {
          console.log('WebSocket will reconnect in 3 seconds...');
          // Reconnect after 3 seconds
          setTimeout(() => this.connectWebSocket(), 3000);
        } else if (event.code === 1008) {
          console.warn('WebSocket connection closed due to authentication error:', event.reason);
        } else if (event.code === 1000) {
          console.log('WebSocket closed normally');
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.error('WebSocket URL attempted:', wsEndpoint);
        console.error('User tenant_id:', user.tenant_id);
        console.error('Token present:', !!token);
        console.error('Token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'none');
        // Try to get more error details
        if (this.ws) {
          console.error('WebSocket readyState:', this.ws.readyState);
          console.error('WebSocket protocol:', this.ws.protocol);
          console.error('WebSocket url:', this.ws.url);
        }
        this.ws?.close();
      };
      
      this.ws.onopen = () => {
        console.log('WebSocket connection opened successfully');
        console.log('WebSocket URL:', wsEndpoint);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      console.error('WebSocket URL attempted:', wsEndpoint);
      console.error('User:', user);
    }
  }

  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Providers
  getProviders(activeOnly: boolean = true): Observable<Provider[]> {
    const params = new HttpParams().set('active_only', activeOnly.toString());
    return this.http.get<Provider[]>(`${this.apiUrl}/providers`, { params });
  }

  getProvider(id: number): Observable<Provider> {
    return this.http.get<Provider>(`${this.apiUrl}/providers/${id}`);
  }

  createProvider(provider: Provider): Observable<Provider> {
    return this.http.post<Provider>(`${this.apiUrl}/providers`, provider);
  }

  // Catalog
  getCatalog(category?: string, subcategory?: string, search?: string): Observable<CatalogItem[]> {
    let params = new HttpParams();
    if (category) params = params.set('category', category);
    if (subcategory) params = params.set('subcategory', subcategory);
    if (search) params = params.set('search', search);
    return this.http.get<CatalogItem[]>(`${this.apiUrl}/catalog`, { params });
  }

  getCatalogItem(id: number): Observable<CatalogItem> {
    return this.http.get<CatalogItem>(`${this.apiUrl}/catalog/${id}`);
  }

  getCatalogCategories(): Observable<Record<string, string[]>> {
    return this.http.get<Record<string, string[]>>(`${this.apiUrl}/catalog/categories`);
  }

  // Provider Products
  getProviderProducts(providerId: number): Observable<ProviderProduct[]> {
    return this.http.get<ProviderProduct[]>(`${this.apiUrl}/providers/${providerId}/products`);
  }

  // Tenant Products
  getTenantProducts(activeOnly: boolean = true): Observable<TenantProduct[]> {
    const params = new HttpParams().set('active_only', activeOnly.toString());
    return this.http.get<TenantProduct[]>(`${this.apiUrl}/tenant-products`, { params });
  }

  createTenantProduct(catalogId: number, providerProductId?: number, name?: string, priceCents?: number): Observable<TenantProduct> {
    const body: any = { catalog_id: catalogId };
    if (providerProductId) body.provider_product_id = providerProductId;
    if (name) body.name = name;
    if (priceCents !== undefined) body.price_cents = priceCents;
    return this.http.post<TenantProduct>(`${this.apiUrl}/tenant-products`, body);
  }

  updateTenantProduct(id: number, updates: { name?: string; price_cents?: number; is_active?: boolean }): Observable<TenantProduct> {
    return this.http.put<TenantProduct>(`${this.apiUrl}/tenant-products/${id}`, updates);
  }

  deleteTenantProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tenant-products/${id}`);
  }
}
