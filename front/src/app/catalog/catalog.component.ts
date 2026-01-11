import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CatalogItem, TenantProduct } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>Product Catalog</h1>
        <p class="subtitle">Browse products from providers and add them to your menu</p>
      </div>

      <div class="content">
        <!-- Filters -->
        <div class="filters-card">
          <div class="form-row">
            <div class="form-group">
              <label for="category">Category</label>
              <select id="category" [(ngModel)]="selectedCategory" (change)="onFilterChange()">
                <option value="">All Categories</option>
                @for (cat of categories(); track cat) {
                  <option [value]="cat">{{ cat }}</option>
                }
              </select>
            </div>
            <div class="form-group">
              <label for="subcategory">Subcategory</label>
              <select id="subcategory" [(ngModel)]="selectedSubcategory" (change)="onFilterChange()" [disabled]="!selectedCategory">
                <option value="">All Subcategories</option>
                @for (subcat of getSubcategories(); track subcat) {
                  <option [value]="subcat">{{ subcat }}</option>
                }
              </select>
            </div>
            <div class="form-group">
              <label for="search">Search</label>
              <input id="search" type="text" [(ngModel)]="searchTerm" (input)="onSearch()" placeholder="Search products...">
            </div>
          </div>
        </div>

        <!-- Loading -->
        @if (loading()) {
          <div class="loading">Loading catalog...</div>
        }

        <!-- Error -->
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

        <!-- Catalog Items -->
        @if (!loading() && catalogItems().length > 0) {
          <div class="catalog-grid">
            @for (item of catalogItems(); track item.id) {
              <div class="catalog-card">
                @if (item.image_url) {
                  <div class="catalog-image">
                    <img [src]="getImageUrl(item.image_url)" [alt]="item.name" (error)="$event.target.style.display='none'">
                  </div>
                }
                <div class="catalog-header">
                  <h3>{{ item.name }}</h3>
                  @if (item.brand) {
                    <span class="brand-badge">{{ item.brand }}</span>
                  }
                </div>
                
                @if (item.country || item.region) {
                  <div class="catalog-origin">
                    @if (item.country) { {{ item.country }} }
                    @if (item.region) { - {{ item.region }} }
                  </div>
                }
                
                @if (item.detailed_description || item.description) {
                  <p class="catalog-description">{{ item.detailed_description || item.description }}</p>
                }
                
                @if (item.wine_style || item.vintage || item.winery || item.grape_variety) {
                  <div class="catalog-details">
                    @if (item.wine_style) {
                      <span class="detail-badge">{{ item.wine_style }}</span>
                    }
                    @if (item.vintage) {
                      <span class="detail-badge">Vintage {{ item.vintage }}</span>
                    }
                    @if (item.winery) {
                      <span class="detail-badge">{{ item.winery }}</span>
                    }
                    @if (item.grape_variety) {
                      <span class="detail-badge">{{ item.grape_variety }}</span>
                    }
                  </div>
                }
                
                @if (item.aromas) {
                  <div class="catalog-aromas">
                    <strong>Aromas:</strong> {{ item.aromas }}
                  </div>
                }
                
                @if (item.elaboration) {
                  <div class="catalog-elaboration">
                    <strong>Elaboration:</strong> {{ item.elaboration }}
                  </div>
                }

                <!-- Price Comparison -->
                @if (item.providers.length > 0) {
                  <div class="price-comparison">
                    <div class="price-header">
                      <span class="price-label">Provider Prices:</span>
                      @if (item.min_price_cents && item.max_price_cents) {
                        <span class="price-range">
                          {{ formatPrice(item.min_price_cents) }}
                          @if (item.min_price_cents !== item.max_price_cents) {
                            - {{ formatPrice(item.max_price_cents) }}
                          }
                        </span>
                      }
                    </div>
                    <div class="providers-list">
                      @for (provider of item.providers; track provider.provider_id) {
                        <div class="provider-item">
                          <div class="provider-info">
                            <span class="provider-name">{{ provider.provider_name }}</span>
                            @if (provider.price_cents) {
                              <span class="provider-price">{{ formatPrice(provider.price_cents) }}</span>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                } @else {
                  <div class="no-providers">No providers available</div>
                }

                <!-- Add to Menu Button -->
                <div class="catalog-actions">
                  @if (isInMenu(item.id)) {
                    <button class="btn btn-danger" (click)="removeFromMenu(item.id)" [disabled]="removing()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                      {{ removing() ? 'Removing...' : 'Remove from Menu' }}
                    </button>
                  } @else {
                    <button class="btn btn-primary" (click)="openAddDialog(item)" [disabled]="adding()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Add to Menu
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        } @else if (!loading() && catalogItems().length === 0) {
          <div class="empty-state">
            <p>No products found. Try adjusting your filters.</p>
          </div>
        }

        <!-- Add Product Dialog -->
        @if (selectedItem()) {
          <div class="modal-overlay" (click)="closeAddDialog()">
            <div class="modal-content" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>Add to Menu</h3>
                <button class="icon-btn" (click)="closeAddDialog()">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="modal-body">
                <div class="form-group">
                  <label>Product Name</label>
                  <input type="text" [(ngModel)]="addFormData.name" placeholder="Product name">
                </div>
                <div class="form-group">
                  <label>Select Provider</label>
                  <select [(ngModel)]="addFormData.providerProductId">
                    <option [value]="null">No specific provider</option>
                    @for (provider of selectedItem()!.providers; track provider.provider_id) {
                      <option [value]="provider.provider_product_id || null">
                        {{ provider.provider_name }}
                        @if (provider.price_cents) {
                          - {{ formatPrice(provider.price_cents) }}
                        }
                      </option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Your Price</label>
                  <div class="price-input">
                    <span class="currency">{{ currency() }}</span>
                    <input type="number" step="0.01" [(ngModel)]="addFormData.price" placeholder="0.00" required>
                  </div>
                  @if (getSelectedProviderPrice()) {
                    <small class="hint">Provider price: {{ formatPrice(getSelectedProviderPrice()!) }}</small>
                  }
                </div>
              </div>
              <div class="modal-actions">
                <button class="btn btn-secondary" (click)="closeAddDialog()">Cancel</button>
                <button class="btn btn-primary" (click)="addToMenu()" [disabled]="adding()">
                  {{ adding() ? 'Adding...' : 'Add to Menu' }}
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    </app-sidebar>
  `,
  styles: [`
    .subtitle {
      color: #666;
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }

    .filters-card {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .catalog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .catalog-card {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow: hidden;
    }

    .catalog-image {
      width: 100%;
      height: 200px;
      overflow: hidden;
      border-radius: 8px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: -1.5rem -1.5rem 1rem -1.5rem;
      flex-shrink: 0;
    }

    .catalog-image img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: center;
    }

    .catalog-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 1rem;
    }

    .catalog-header h3 {
      margin: 0;
      font-size: 1.2rem;
      flex: 1;
    }

    .brand-badge {
      background: #f0f0f0;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #666;
    }

    .catalog-origin {
      color: #666;
      font-size: 0.85rem;
      margin: 0.25rem 0;
      font-style: italic;
    }

    .catalog-description {
      color: #666;
      font-size: 0.9rem;
      margin: 0;
      line-height: 1.5;
    }

    .catalog-details {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0.75rem 0;
    }

    .detail-badge {
      background: #f0f0f0;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      color: #555;
      font-weight: 500;
    }

    .catalog-aromas,
    .catalog-elaboration {
      font-size: 0.85rem;
      color: #666;
      margin-top: 0.5rem;
      line-height: 1.4;
    }

    .catalog-aromas strong,
    .catalog-elaboration strong {
      color: #333;
      font-weight: 600;
    }

    .price-comparison {
      border-top: 1px solid #eee;
      padding-top: 1rem;
    }

    .price-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .price-label {
      font-weight: 600;
      color: #333;
    }

    .price-range {
      color: #2563eb;
      font-weight: 600;
    }

    .providers-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .provider-item {
      padding: 0.5rem;
      background: #f9fafb;
      border-radius: 4px;
    }

    .provider-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .provider-name {
      font-weight: 500;
      color: #333;
    }

    .provider-price {
      color: #2563eb;
      font-weight: 600;
    }

    .provider-meta {
      font-size: 0.85rem;
      color: #666;
      margin-top: 0.25rem;
    }

    .no-providers {
      color: #999;
      font-style: italic;
      text-align: center;
      padding: 1rem;
    }

    .catalog-actions {
      margin-top: auto;
      padding-top: 1rem;
      border-top: 1px solid #eee;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #eee;
    }

    .modal-header h3 {
      margin: 0;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      padding: 1.5rem;
      border-top: 1px solid #eee;
    }

    .hint {
      color: #666;
      font-size: 0.85rem;
      margin-top: 0.25rem;
      display: block;
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #666;
    }

    .btn-danger {
      background: var(--color-error);
      color: white;
      &:hover:not(:disabled) {
        background: #b91c1c;
      }
    }
  `]
})
export class CatalogComponent implements OnInit {
  private apiService = inject(ApiService);

  loading = signal(false);
  error = signal('');
  catalogItems = signal<CatalogItem[]>([]);
  categories = signal<string[]>([]);
  categoriesMap = signal<Record<string, string[]>>({});
  tenantProducts = signal<TenantProduct[]>([]);
  
  selectedCategory = signal<string>('');
  selectedSubcategory = signal<string>('');
  searchTerm = signal<string>('');
  
  selectedItem = signal<CatalogItem | null>(null);
  adding = signal(false);
  removing = signal(false);
  
  addFormData = {
    name: '',
    providerProductId: null as number | null,
    price: ''
  };

  currency = computed(() => {
    // Get currency from tenant settings or default
    return '€'; // TODO: Get from tenant settings
  });

  ngOnInit() {
    this.loadCatalog();
    this.loadCategories();
    this.loadTenantProducts();
  }

  loadCatalog() {
    this.loading.set(true);
    this.error.set('');
    
    this.apiService.getCatalog(
      this.selectedCategory() || undefined,
      this.selectedSubcategory() || undefined,
      this.searchTerm() || undefined
    ).subscribe({
      next: (items) => {
        this.catalogItems.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load catalog: ' + (err.error?.detail || err.message));
        this.loading.set(false);
      }
    });
  }

  loadCategories() {
    this.apiService.getCatalogCategories().subscribe({
      next: (map) => {
        this.categoriesMap.set(map);
        this.categories.set(Object.keys(map));
      },
      error: (err) => {
        console.error('Failed to load categories:', err);
      }
    });
  }

  loadTenantProducts() {
    this.apiService.getTenantProducts(true).subscribe({
      next: (products) => {
        this.tenantProducts.set(products);
      },
      error: (err) => {
        console.error('Failed to load tenant products:', err);
      }
    });
  }

  getSubcategories(): string[] {
    const cat = this.selectedCategory();
    if (!cat) return [];
    return this.categoriesMap()[cat] || [];
  }

  onFilterChange() {
    this.loadCatalog();
  }

  onSearch() {
    // Debounce search
    setTimeout(() => {
      if (this.searchTerm() === this.searchTerm()) {
        this.loadCatalog();
      }
    }, 300);
  }

  isInMenu(catalogId: number): boolean {
    return this.tenantProducts().some(tp => tp.catalog_id === catalogId && tp.is_active);
  }

  getTenantProductId(catalogId: number): number | null {
    const product = this.tenantProducts().find(tp => tp.catalog_id === catalogId && tp.is_active);
    return product?.id || null;
  }

  openAddDialog(item: CatalogItem) {
    this.selectedItem.set(item);
    this.addFormData = {
      name: item.name,
      providerProductId: item.providers.length > 0 ? (item.providers[0].provider_product_id || null) : null,
      price: item.min_price_cents ? (item.min_price_cents / 100).toFixed(2) : ''
    };
  }

  closeAddDialog() {
    this.selectedItem.set(null);
    this.addFormData = {
      name: '',
      providerProductId: null,
      price: ''
    };
  }

  getSelectedProviderPrice(): number | null {
    const item = this.selectedItem();
    if (!item || !this.addFormData.providerProductId) return null;
    
    const provider = item.providers.find(p => 
      p.provider_product_id === this.addFormData.providerProductId
    );
    return provider?.price_cents || null;
  }

  addToMenu() {
    const item = this.selectedItem();
    if (!item) return;

    const priceCents = Math.round(parseFloat(this.addFormData.price) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      this.error.set('Please enter a valid price');
      return;
    }

    this.adding.set(true);
    this.error.set('');

    this.apiService.createTenantProduct(
      item.id,
      this.addFormData.providerProductId || undefined,
      this.addFormData.name || undefined,
      priceCents
    ).subscribe({
      next: () => {
        this.loadTenantProducts();
        this.closeAddDialog();
        this.adding.set(false);
      },
      error: (err) => {
        this.error.set('Failed to add product: ' + (err.error?.detail || err.message));
        this.adding.set(false);
      }
    });
  }

  removeFromMenu(catalogId: number) {
    const tenantProductId = this.getTenantProductId(catalogId);
    if (!tenantProductId) {
      this.error.set('Product not found in menu');
      return;
    }

    this.removing.set(true);
    this.error.set('');

    this.apiService.deleteTenantProduct(tenantProductId).subscribe({
      next: () => {
        this.loadTenantProducts();
        this.removing.set(false);
      },
      error: (err) => {
        this.error.set('Failed to remove product: ' + (err.error?.detail || err.message));
        this.removing.set(false);
      }
    });
  }

  formatPrice(cents: number): string {
    return `${this.currency()}${(cents / 100).toFixed(2)}`;
  }

  getImageUrl(url: string | null | undefined): string {
    if (!url) return '';
    // If URL is relative (starts with /), prepend API URL
    if (url.startsWith('/')) {
      return `${environment.apiUrl}${url}`;
    }
    // Otherwise return as-is (absolute URL)
    return url;
  }
}
