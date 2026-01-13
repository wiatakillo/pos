import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, Product } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [FormsModule, SidebarComponent, CommonModule],
  template: `
    <app-sidebar>
        <div class="page-header">
          <h1>Products</h1>
          @if (!showAddForm() && !editingProduct()) {
            <button class="btn btn-primary" (click)="showAddForm.set(true)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Product
            </button>
          }
        </div>

        <div class="content">
          @if (showAddForm() || editingProduct()) {
            <div class="form-card">
              <div class="form-header">
                <h3>{{ editingProduct() ? 'Edit Product' : 'New Product' }}</h3>
                <button class="icon-btn" (click)="cancelForm()">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <form (submit)="saveProduct($event)">
                <div class="form-row">
                  <div class="form-group">
                    <label for="name">Product Name</label>
                    <input id="name" type="text" [(ngModel)]="formData.name" name="name" required placeholder="e.g. Margherita Pizza">
                  </div>
                  <div class="form-group form-group-sm">
                    <label for="price">Price</label>
                    <div class="price-input">
                      <span class="currency">{{ currency() }}</span>
                      <input id="price" type="number" step="0.01" [(ngModel)]="formData.price" name="price" required placeholder="0.00">
                    </div>
                  </div>
                </div>
                <div class="form-group">
                  <label for="ingredients">Ingredients (comma-separated)</label>
                  <input id="ingredients" type="text" [(ngModel)]="formData.ingredients" name="ingredients" placeholder="e.g. Tomato, Mozzarella, Basil">
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="category">Category</label>
                    <select id="category" [(ngModel)]="formData.category" name="category" (change)="onCategoryChange()">
                      <option value="">Select Category</option>
                      @for (category of getCategoryKeys(); track category) {
                        <option [value]="category">{{ category }}</option>
                      }
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="subcategory">Subcategory</label>
                    <select id="subcategory" [(ngModel)]="formData.subcategory" name="subcategory" [disabled]="!formData.category || availableSubcategories().length === 0">
                      <option value="">Select Subcategory</option>
                      @for (subcat of availableSubcategories(); track subcat) {
                        <option [value]="subcat">{{ subcat }}</option>
                      }
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label>Product Image</label>
                  <div class="image-upload-row">
                    @if (editingProduct()?.image_filename) {
                      <div class="image-preview-wrapper">
                        <img [src]="getImageUrl(editingProduct()!)" class="product-thumb" alt="">
                        @if (editingProduct()?.image_size_formatted) {
                          <div class="file-size">{{ editingProduct()!.image_size_formatted }}</div>
                        }
                      </div>
                    } @else if (pendingImagePreview()) {
                      <div class="image-preview-wrapper">
                        <img [src]="pendingImagePreview()" class="product-thumb" alt="">
                        @if (pendingImageFile()?.size) {
                          <div class="file-size">{{ formatFileSize(pendingImageFile()!.size) }}</div>
                        }
                      </div>
                    }
                    <input type="file" #fileInput accept="image/jpeg,image/png,image/webp" (change)="handleImageSelect($event)" style="display:none">
                    <button type="button" class="btn btn-secondary" (click)="fileInput.click()" [disabled]="uploading()">
                      {{ uploading() ? 'Uploading...' : (pendingImageFile() ? 'Change Image' : 'Upload Image') }}
                    </button>
                    @if (pendingImageFile()) {
                      <span class="pending-file-name">{{ pendingImageFile()?.name }}</span>
                    }
                  </div>
                </div>
                <div class="form-actions">
                  <button type="button" class="btn btn-secondary" (click)="cancelForm()">Cancel</button>
                  <button type="submit" class="btn btn-primary" [disabled]="saving()">
                    {{ saving() ? 'Saving...' : (editingProduct() ? 'Update' : 'Add Product') }}
                  </button>
                </div>
              </form>
            </div>
          }

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
              <p>Loading products...</p>
            </div>
          } @else if (products().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
              </div>
              <h3>No products yet</h3>
              <p>Add your first product to get started</p>
              <button class="btn btn-primary" (click)="showAddForm.set(true)">Add Product</button>
            </div>
          } @else if (filteredProducts().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
              </div>
              <h3>No products match the selected filters</h3>
              <p>Try selecting a different category or subcategory</p>
              <button class="btn btn-secondary" (click)="selectCategory(null)">Clear Filters</button>
            </div>
          } @else {
            <!-- Filter Buttons -->
            <div class="filters-section">
              <!-- Category Filters -->
              @if (availableCategories().length > 0) {
                <div class="category-filters">
                  <button 
                    class="filter-btn" 
                    [class.active]="selectedCategory() === null"
                    (click)="selectCategory(null)">
                    All Categories
                  </button>
                  @for (category of availableCategories(); track category) {
                    <button 
                      class="filter-btn" 
                      [class.active]="selectedCategory() === category"
                      (click)="selectCategory(category)">
                      {{ category }}
                    </button>
                  }
                </div>
              }
              
              <!-- Subcategory Filters (shown when category is selected) -->
              @if (selectedCategory() && availableSubcategoriesForFilter().length > 0) {
                <div class="subcategory-filters">
                  <button 
                    class="filter-btn filter-btn-sub" 
                    [class.active]="selectedSubcategory() === null"
                    (click)="selectSubcategory(null)">
                    All {{ selectedCategory() }}
                  </button>
                  @for (subcategory of availableSubcategoriesForFilter(); track subcategory) {
                    <button 
                      class="filter-btn filter-btn-sub" 
                      [class.active]="selectedSubcategory() === subcategory"
                      (click)="selectSubcategory(subcategory)">
                      {{ subcategory }}
                    </button>
                  }
                </div>
              }
            </div>

            <div class="table-card">
              <table>
                <thead>
                  <tr>
                    <th style="width:60px"></th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Subcategory</th>
                    <th>Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (product of filteredProducts(); track product.id) {
                    <tr>
                      <td>
                        @if (product.image_filename) {
                          <div class="image-preview-wrapper">
                            <img [src]="getImageUrl(product)" class="table-thumb" alt="" (error)="handleImageError($event)">
                            @if (product.image_size_formatted) {
                              <div class="file-size">{{ product.image_size_formatted }}</div>
                            }
                          </div>
                        } @else {
                          <div class="no-image"></div>
                        }
                      </td>
                      <td>
                        <div>{{ product.name }}</div>
                        @if (product.ingredients) {
                          <small class="ingredients">{{ product.ingredients }}</small>
                        }
                      </td>
                      <td>
                        @if (editingCategoryProductId() === product.id) {
                          <select 
                            class="inline-select" 
                            [(ngModel)]="editingCategory" 
                            (change)="onCategoryChangeInline()"
                            (blur)="saveCategoryInline(product)"
                            (keydown.escape)="cancelCategoryEdit()"
                            [attr.data-product-id]="product.id">
                            <option value="">None</option>
                            @for (category of getCategoryKeys(); track category) {
                              <option [value]="category">{{ category }}</option>
                            }
                          </select>
                        } @else {
                          <span class="category-cell" (click)="startCategoryEdit(product, $event)">
                            {{ product.category || '—' }}
                          </span>
                        }
                      </td>
                      <td>
                        @if (editingCategoryProductId() === product.id) {
                          <select 
                            class="inline-select" 
                            [(ngModel)]="editingSubcategory"
                            [disabled]="!editingCategory || getSubcategoriesForCategory(editingCategory || '').length === 0"
                            (blur)="saveCategoryInline(product)"
                            (keydown.escape)="cancelCategoryEdit()">
                            <option value="">None</option>
                            @for (subcat of getSubcategoriesForCategory(editingCategory); track subcat) {
                              <option [value]="subcat">{{ subcat }}</option>
                            }
                          </select>
                        } @else {
                          <span class="category-cell" (click)="startCategoryEdit(product, $event)">
                            {{ product.subcategory || '—' }}
                          </span>
                        }
                      </td>
                      <td class="price">{{ formatPrice(product.price_cents) }}</td>
                      <td class="actions">
                        <button class="icon-btn" (click)="startEdit(product)" title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button class="icon-btn icon-btn-danger" (click)="confirmDelete(product)" title="Delete" [disabled]="deleting() === product.id">
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

          @if (productToDelete()) {
            <div class="modal-overlay" (click)="productToDelete.set(null)">
              <div class="modal" (click)="$event.stopPropagation()">
                <h3>Delete Product</h3>
                <p>Are you sure you want to delete "{{ productToDelete()?.name }}"?</p>
                <div class="modal-actions">
                  <button class="btn btn-secondary" (click)="productToDelete.set(null)">Cancel</button>
                  <button class="btn btn-danger" (click)="deleteProduct()">Delete</button>
                </div>
              </div>
            </div>
          }
        </div>
    </app-sidebar>
  `,
  styles: [`
    .layout { display: flex; min-height: 100vh; background: var(--color-bg); }

    .sidebar {
      width: 240px;
      background: var(--color-surface);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      position: fixed;
      height: 100vh;
      left: 0;
      top: 0;
      z-index: 100;
    }

    .sidebar-header {
      padding: var(--space-5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border);
    }

    .logo { font-size: 1.25rem; font-weight: 700; color: var(--color-primary); }

    .close-btn {
      display: none;
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-2);
    }

    .nav { flex: 1; padding: var(--space-4) 0; }

    .nav-link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-5);
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: 0.9375rem;
      font-weight: 500;
      transition: all 0.15s ease;
      border-left: 3px solid transparent;

      &:hover { color: var(--color-text); background: var(--color-bg); }
      &.active { color: var(--color-primary); background: var(--color-primary-light); border-left-color: var(--color-primary); }
    }

    .sidebar-footer {
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--color-border);
    }

    .user-info { margin-bottom: var(--space-3); }
    .user-email { font-size: 0.875rem; color: var(--color-text); display: block; overflow: hidden; text-overflow: ellipsis; }

    .logout-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-3);
      background: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.15s ease;
      &:hover { background: var(--color-bg); color: var(--color-text); }
    }

    .main { flex: 1; margin-left: 240px; padding: var(--space-6); }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-5);

      h1 { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; }
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

    .form-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      margin-bottom: var(--space-5);
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    }

    .form-row { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4); }

    .form-group { flex: 1; min-width: 200px; }
    .form-group-sm { flex: 0 0 150px; min-width: 120px; }

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

    .price-input {
      position: relative;
      .currency { position: absolute; left: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }
      input { padding-left: var(--space-6); }
    }

    .form-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

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

    .filters-section {
      margin-bottom: var(--space-4);
    }

    .category-filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .subcategory-filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--color-bg);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }

    .filter-btn {
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .filter-btn:hover {
      background: var(--color-bg);
      border-color: var(--color-primary);
    }

    .filter-btn.active {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
    }

    .filter-btn-sub {
      font-size: 0.8125rem;
      padding: var(--space-1) var(--space-3);
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
    td { border-top: 1px solid var(--color-border); }
    tr:hover td { background: var(--color-bg); }
    .price { font-weight: 600; color: var(--color-success); }
    .actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

    .image-upload-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
    .image-preview-wrapper { 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      gap: var(--space-1);
      position: relative;
      min-width: 48px;
      min-height: 48px;
    }
    .product-thumb { 
      width: 60px; 
      height: 60px; 
      object-fit: cover; 
      border-radius: var(--radius-md); 
      border: 1px solid var(--color-border);
      display: block;
    }
    .table-thumb { 
      width: 48px; 
      height: 48px; 
      object-fit: cover; 
      border-radius: var(--radius-sm);
      display: block;
      background: var(--color-bg);
    }
    .no-image { 
      width: 48px; 
      height: 48px; 
      background: var(--color-bg); 
      border-radius: var(--radius-sm); 
      border: 1px dashed var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .file-size { font-size: 0.6875rem; color: var(--color-text-muted); text-align: center; }
    .pending-file-name { font-size: 0.8125rem; color: var(--color-text-muted); font-style: italic; }
    .ingredients { color: var(--color-text-muted); font-size: 0.8125rem; display: block; margin-top: 2px; }
    
    .category-cell {
      cursor: pointer;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      transition: background 0.15s ease;
      display: inline-block;
      min-width: 60px;
      &:hover { background: var(--color-bg); }
    }
    
    .inline-select {
      width: 100%;
      padding: var(--space-2);
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      background: var(--color-surface);
      color: var(--color-text);
      &:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light); }
      &:disabled { opacity: 0.6; cursor: not-allowed; }
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
      padding: var(--space-6);
      max-width: 400px;
      width: 90%;
      box-shadow: var(--shadow-lg);

      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; }
      p { margin: 0 0 var(--space-5); color: var(--color-text-muted); }
    }

    .modal-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

    .mobile-header {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: 0 var(--space-4);
      align-items: center;
      gap: var(--space-3);
      z-index: 99;
    }

    .menu-toggle {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: none;
      border: none;
      padding: var(--space-2);
      cursor: pointer;
      span { display: block; width: 20px; height: 2px; background: var(--color-text); border-radius: 1px; }
    }

    .header-title { font-weight: 700; color: var(--color-primary); }

    .overlay { display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 99; }

    @media (max-width: 768px) {
      .mobile-header { display: flex; }
      .sidebar { transform: translateX(-100%); transition: transform 0.25s ease; }
      .sidebar-open .sidebar { transform: translateX(0); }
      .sidebar-open .overlay { display: block; }
      .close-btn { display: block; }
      .main { margin-left: 0; padding: calc(56px + var(--space-4)) var(--space-4) var(--space-4); }
      .form-row { flex-direction: column; }
      .form-group, .form-group-sm { min-width: 100%; flex: none; }
    }
  `]
})
export class ProductsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  products = signal<Product[]>([]);
  filteredProducts = signal<Product[]>([]);
  loading = signal(true);
  saving = signal(false);
  deleting = signal<number | null>(null);
  showAddForm = signal(false);
  editingProduct = signal<Product | null>(null);
  productToDelete = signal<Product | null>(null);
  error = signal('');
  formData = { name: '', price: 0, ingredients: '', category: '', subcategory: '' };
  uploading = signal(false);
  pendingImageFile = signal<File | null>(null);
  pendingImagePreview = signal<string | null>(null);
  currency = signal<string>('$');
  categories = signal<Record<string, string[]>>({});
  availableSubcategories = signal<string[]>([]);
  editingCategoryProductId = signal<number | null>(null);
  editingCategory: string = '';
  editingSubcategory: string = '';
  // Filter state
  selectedCategory = signal<string | null>(null);
  selectedSubcategory = signal<string | null>(null);
  availableCategories = signal<string[]>([]);
  availableSubcategoriesForFilter = signal<string[]>([]);

  ngOnInit() {
    this.loadTenantSettings();
    this.loadProducts();
    this.loadCategories();
  }

  loadCategories() {
    this.api.getCatalogCategories().subscribe({
      next: (cats) => {
        this.categories.set(cats);
      },
      error: (err) => {
        console.error('Failed to load categories:', err);
      }
    });
  }

  getCategoryKeys(): string[] {
    return Object.keys(this.categories());
  }

  getSubcategoriesForCategory(category: string): string[] {
    return this.categories()[category] || [];
  }

  onCategoryChange() {
    // Update available subcategories when category changes
    const selectedCategory = this.formData.category;
    if (selectedCategory && this.categories()[selectedCategory]) {
      this.availableSubcategories.set(this.categories()[selectedCategory]);
    } else {
      this.availableSubcategories.set([]);
      this.formData.subcategory = '';
    }
  }

  onCategoryChangeInline() {
    // Update subcategory when category changes inline
    const selectedCategory = this.editingCategory;
    if (selectedCategory && this.categories()[selectedCategory]) {
      // Keep subcategory if it's still valid, otherwise clear it
      const validSubcats = this.categories()[selectedCategory];
      if (this.editingSubcategory && !validSubcats.includes(this.editingSubcategory)) {
        this.editingSubcategory = '';
      }
    } else {
      this.editingSubcategory = '';
    }
  }

  startCategoryEdit(product: Product, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (!product.id) return;
    // Don't start editing if already editing this product or another product
    if (this.editingCategoryProductId() === product.id) return;
    if (this.editingCategoryProductId() !== null) {
      // Save current edit first
      const currentProduct = this.products().find(p => p.id === this.editingCategoryProductId());
      if (currentProduct) {
        this.saveCategoryInline(currentProduct);
      }
    }
    this.editingCategoryProductId.set(product.id);
    this.editingCategory = product.category || '';
    this.editingSubcategory = product.subcategory || '';
    // Focus the category select after a brief delay
    setTimeout(() => {
      const select = document.querySelector(`[data-product-id="${product.id}"]`) as HTMLSelectElement;
      if (select) select.focus();
    }, 10);
  }

  cancelCategoryEdit() {
    this.editingCategoryProductId.set(null);
    this.editingCategory = '';
    this.editingSubcategory = '';
  }

  saveCategoryInline(product: Product) {
    if (!product.id || this.editingCategoryProductId() !== product.id) return;
    
    const category = this.editingCategory || undefined;
    const subcategory = this.editingSubcategory || undefined;
    
    // Only update if changed
    if (category === product.category && subcategory === product.subcategory) {
      this.cancelCategoryEdit();
      return;
    }

    this.saving.set(true);
    this.api.updateProduct(product.id, { category, subcategory }).subscribe({
        next: (updated) => {
          this.products.update(list => list.map(p => p.id === updated.id ? updated : p));
          this.updateAvailableCategories();
          this.updateAvailableSubcategories(this.selectedCategory());
          this.applyFilters();
          this.cancelCategoryEdit();
          this.saving.set(false);
        },
      error: (err) => {
        this.error.set(err.error?.detail || 'Failed to update category');
        this.cancelCategoryEdit();
        this.saving.set(false);
      }
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

  loadProducts() {
    this.loading.set(true);
    this.api.getProducts().subscribe({
      next: (products) => { 
        this.products.set(products);
        this.updateAvailableCategories();
        this.applyFilters();
        this.loading.set(false);
      },
      error: (err) => {
        if (err.status === 401) { this.router.navigate(['/login']); }
        else { this.error.set(err.error?.detail || 'Failed to load products'); }
        this.loading.set(false);
      }
    });
  }

  updateAvailableCategories() {
    const categories = new Set<string>();
    this.products().forEach((product: Product) => {
      if (product.category) {
        categories.add(product.category);
      }
    });
    this.availableCategories.set(Array.from(categories).sort());
  }

  selectCategory(category: string | null) {
    this.selectedCategory.set(category);
    this.selectedSubcategory.set(null);
    this.updateAvailableSubcategories(category);
    this.applyFilters();
  }

  selectSubcategory(subcategory: string | null) {
    this.selectedSubcategory.set(subcategory);
    this.applyFilters();
  }

  updateAvailableSubcategories(category: string | null) {
    if (!category) {
      this.availableSubcategoriesForFilter.set([]);
      return;
    }

    const subcategories = new Set<string>();
    this.products().forEach((product: Product) => {
      if (product.category === category && product.subcategory) {
        subcategories.add(product.subcategory);
      }
    });
    this.availableSubcategoriesForFilter.set(Array.from(subcategories).sort());
  }

  applyFilters() {
    let filtered = this.products();
    
    // Filter by category
    if (this.selectedCategory()) {
      filtered = filtered.filter(p => p.category === this.selectedCategory());
    }
    
    // Filter by subcategory
    if (this.selectedSubcategory()) {
      filtered = filtered.filter(p => p.subcategory === this.selectedSubcategory());
    }
    
    this.filteredProducts.set(filtered);
  }

  startEdit(product: Product) {
    // Cancel any inline category editing
    if (this.editingCategoryProductId() === product.id) {
      this.cancelCategoryEdit();
    }
    this.editingProduct.set(product);
    this.formData = { 
      name: product.name, 
      price: product.price_cents / 100, 
      ingredients: product.ingredients || '',
      category: product.category || '',
      subcategory: product.subcategory || ''
    };
    this.onCategoryChange(); // Update available subcategories
    this.showAddForm.set(false);
  }

  cancelForm() {
    this.showAddForm.set(false);
    this.editingProduct.set(null);
    this.formData = { name: '', price: 0, ingredients: '', category: '', subcategory: '' };
    this.availableSubcategories.set([]);
    this.clearPendingImage();
  }

  clearPendingImage() {
    this.pendingImageFile.set(null);
    if (this.pendingImagePreview()) {
      URL.revokeObjectURL(this.pendingImagePreview()!);
      this.pendingImagePreview.set(null);
    }
  }

  saveProduct(event: Event) {
    event.preventDefault();
    if (!this.formData.name || this.formData.price <= 0) return;

    this.saving.set(true);
    const productData = { 
      name: this.formData.name, 
      price_cents: Math.round(this.formData.price * 100), 
      ingredients: this.formData.ingredients || undefined,
      category: this.formData.category || undefined,
      subcategory: this.formData.subcategory || undefined
    };

    const editing = this.editingProduct();
    if (editing?.id) {
      this.api.updateProduct(editing.id, productData).subscribe({
        next: (updated) => { 
          this.products.update(list => list.map(p => p.id === updated.id ? updated : p));
          this.updateAvailableCategories();
          this.applyFilters();
          this.cancelForm(); 
          this.saving.set(false); 
        },
        error: (err) => { this.error.set(err.error?.detail || 'Failed to update'); this.saving.set(false); }
      });
    } else {
      this.api.createProduct(productData as Product).subscribe({
        next: (product) => {
          this.products.update(list => [...list, product]);
          this.updateAvailableCategories();
          this.applyFilters();
          // Upload pending image if one was selected
          const pendingFile = this.pendingImageFile();
          if (pendingFile && product.id) {
            this.uploading.set(true);
            this.api.uploadProductImage(product.id, pendingFile).subscribe({
              next: (updated) => {
                this.products.update(list => list.map(p => p.id === updated.id ? updated : p));
                this.clearPendingImage();
                this.uploading.set(false);
              },
              error: (err) => {
                this.error.set(err.error?.detail || 'Product created but image upload failed');
                this.clearPendingImage();
                this.uploading.set(false);
              }
            });
          } else {
            this.clearPendingImage();
          }
          this.cancelForm();
          this.saving.set(false);
        },
        error: (err) => { this.error.set(err.error?.detail || 'Failed to create'); this.saving.set(false); }
      });
    }
  }

  confirmDelete(product: Product) { this.productToDelete.set(product); }

  deleteProduct() {
    const product = this.productToDelete();
    if (!product?.id) return;
    this.deleting.set(product.id);
    this.productToDelete.set(null);
    this.api.deleteProduct(product.id).subscribe({
      next: () => { 
        this.products.update(list => list.filter(p => p.id !== product.id));
        this.updateAvailableCategories();
        this.applyFilters();
        this.deleting.set(null); 
      },
      error: (err) => { this.error.set(err.error?.detail || 'Failed to delete'); this.deleting.set(null); }
    });
  }

  getImageUrl(product: Product): string | null {
    return this.api.getProductImageUrl(product);
  }

  handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    // Show placeholder if parent has no-image div
    const wrapper = img.closest('.image-preview-wrapper');
    if (wrapper) {
      const placeholder = wrapper.querySelector('.no-image') as HTMLElement;
      if (!placeholder) {
        const noImageDiv = document.createElement('div');
        noImageDiv.className = 'no-image';
        wrapper.insertBefore(noImageDiv, img);
      } else {
        placeholder.style.display = 'block';
      }
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  handleImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const editing = this.editingProduct();
    if (editing?.id) {
      // Direct upload for existing products
      this.uploading.set(true);
      this.api.uploadProductImage(editing.id, file).subscribe({
        next: (updated) => {
          this.products.update(list => list.map(p => p.id === updated.id ? updated : p));
          this.editingProduct.set(updated);
          this.uploading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Failed to upload image');
          this.uploading.set(false);
        }
      });
    } else {
      // Store file for upload after product creation
      this.clearPendingImage();
      this.pendingImageFile.set(file);
      this.pendingImagePreview.set(URL.createObjectURL(file));
    }
    // Reset input to allow selecting the same file again
    input.value = '';
  }
}
