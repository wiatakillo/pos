/**
 * Suppliers Component
 *
 * Manage inventory suppliers (vendors).
 * Follows app design patterns.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SidebarComponent } from '../../shared/sidebar.component';
import { InventoryService } from '../inventory.service';
import { Supplier, SupplierCreate, SupplierUpdate } from '../inventory.types';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SidebarComponent],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>Suppliers</h1>
        @if (!showModal()) {
          <button class="btn btn-primary" (click)="openCreateModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Supplier
          </button>
        }
      </div>

      <div class="content">
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
            <p>Loading suppliers...</p>
          </div>
        } @else if (suppliers().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <h3>No suppliers yet</h3>
            <p>Add your first supplier to get started</p>
            <button class="btn btn-primary" (click)="openCreateModal()">Add Supplier</button>
          </div>
        } @else {
          <div class="table-card">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Terms</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (supplier of suppliers(); track supplier.id) {
                  <tr>
                    <td class="code-cell">{{ supplier.code || '-' }}</td>
                    <td>{{ supplier.name }}</td>
                    <td>{{ supplier.contact_name || '-' }}</td>
                    <td>{{ supplier.phone || '-' }}</td>
                    <td>{{ supplier.email || '-' }}</td>
                    <td>{{ supplier.payment_terms || '-' }}</td>
                    <td>
                      <span class="status-badge" [class.success]="supplier.is_active">
                        {{ supplier.is_active ? 'Active' : 'Inactive' }}
                      </span>
                    </td>
                    <td class="actions">
                      <button class="icon-btn" title="Edit" (click)="openEditModal(supplier)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button class="icon-btn icon-btn-danger" title="Delete" (click)="confirmDelete(supplier)">
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
      </div>

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="form-header">
              <h3>{{ editingSupplier() ? 'Edit Supplier' : 'New Supplier' }}</h3>
              <button class="icon-btn" (click)="closeModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form [formGroup]="form" (ngSubmit)="saveSupplier()">
              <div class="form-row">
                <div class="form-group form-group-sm">
                  <label for="code">Code</label>
                  <input type="text" id="code" formControlName="code" placeholder="SUP001" />
                </div>
                <div class="form-group">
                  <label for="name">Name</label>
                  <input type="text" id="name" formControlName="name" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="contact_name">Contact Name</label>
                  <input type="text" id="contact_name" formControlName="contact_name" />
                </div>
                <div class="form-group">
                  <label for="phone">Phone</label>
                  <input type="text" id="phone" formControlName="phone" />
                </div>
              </div>
              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" formControlName="email" />
              </div>
              <div class="form-group">
                <label for="address">Address</label>
                <input type="text" id="address" formControlName="address" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="payment_terms">Payment Terms</label>
                  <input type="text" id="payment_terms" formControlName="payment_terms" placeholder="e.g., Net 30" />
                </div>
                <div class="form-group form-group-sm">
                  <label for="lead_time_days">Lead Time (Days)</label>
                  <input type="number" id="lead_time_days" formControlName="lead_time_days" min="0" />
                </div>
              </div>
              <div class="form-group">
                <label for="notes">Notes</label>
                <input type="text" id="notes" formControlName="notes" />
              </div>
              @if (editingSupplier()) {
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" formControlName="is_active" />
                    <span>Supplier is Active</span>
                  </label>
                </div>
              }
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" [disabled]="!form.valid || saving()">
                  {{ saving() ? 'Saving...' : (editingSupplier() ? 'Update' : 'Create') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation -->
      @if (showDeleteModal()) {
        <div class="modal-overlay" (click)="showDeleteModal.set(false)">
          <div class="modal modal-sm" (click)="$event.stopPropagation()">
            <h3>Delete Supplier</h3>
            <p>Are you sure you want to delete "{{ deletingSupplier()?.name }}"?</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" (click)="showDeleteModal.set(false)">Cancel</button>
              <button class="btn btn-danger" (click)="deleteSupplier()" [disabled]="saving()">
                {{ saving() ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      }
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

    .code-cell { font-family: monospace; font-size: 0.8rem; color: var(--color-text-muted); }
    .actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

    .status-badge {
      display: inline-block;
      padding: var(--space-1) var(--space-3);
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--color-bg);
      color: var(--color-text-muted);
      &.success { background: var(--color-success-light); color: var(--color-success); }
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

    .icon-btn {
      background: none;
      border: none;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      &:hover { background: var(--color-bg); color: var(--color-text); }
    }

    .icon-btn-danger:hover { background: rgba(220, 38, 38, 0.1); color: var(--color-error); }

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
      max-width: 500px;
      width: 90%;
      box-shadow: var(--shadow-lg);
      max-height: 90vh;
      overflow-y: auto;
      &.modal-sm { max-width: 400px; }
      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; }
      p { margin: 0 0 var(--space-5); color: var(--color-text-muted); }
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    }

    .form-row { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-3); }
    .form-group { flex: 1; min-width: 150px; margin-bottom: var(--space-3); }
    .form-group-sm { flex: 0 0 100px; min-width: 80px; }
    .form-group label { display: block; margin-bottom: var(--space-2); font-size: 0.875rem; font-weight: 500; color: var(--color-text); }
    .form-group input { width: 100%; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.9375rem; background: var(--color-surface); color: var(--color-text); }
    .form-group input:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }

    .form-actions { display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4); }
    .modal-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .form-row { flex-direction: column; }
      .form-group, .form-group-sm { min-width: 100%; flex: none; }
    }
  `]
})
export class SuppliersComponent implements OnInit {
  private inventoryService = inject(InventoryService);
  private fb = inject(FormBuilder);

  suppliers = signal<Supplier[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  showModal = signal(false);
  showDeleteModal = signal(false);
  editingSupplier = signal<Supplier | null>(null);
  deletingSupplier = signal<Supplier | null>(null);

  form: FormGroup = this.fb.group({
    code: [''],
    name: ['', Validators.required],
    contact_name: [''],
    phone: [''],
    email: [''],
    address: [''],
    payment_terms: [''],
    lead_time_days: [null],
    notes: [''],
    is_active: [true],
  });

  ngOnInit() {
    this.loadSuppliers();
  }

  loadSuppliers() {
    this.loading.set(true);
    this.inventoryService.getSuppliers().subscribe({
      next: suppliers => { this.suppliers.set(suppliers); this.loading.set(false); },
      error: err => { this.error.set(err.error?.detail || 'Failed to load suppliers'); this.loading.set(false); }
    });
  }

  openCreateModal() {
    this.editingSupplier.set(null);
    this.form.reset({ is_active: true });
    this.showModal.set(true);
  }

  openEditModal(supplier: Supplier) {
    this.editingSupplier.set(supplier);
    this.form.patchValue(supplier);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingSupplier.set(null);
  }

  confirmDelete(supplier: Supplier) {
    this.deletingSupplier.set(supplier);
    this.showDeleteModal.set(true);
  }

  saveSupplier() {
    if (!this.form.valid) return;
    this.saving.set(true);
    const data = this.form.value;

    if (this.editingSupplier()) {
      this.inventoryService.updateSupplier(this.editingSupplier()!.id, data).subscribe({
        next: () => { this.saving.set(false); this.closeModal(); this.loadSuppliers(); },
        error: err => { this.error.set(err.error?.detail || 'Failed to update'); this.saving.set(false); }
      });
    } else {
      this.inventoryService.createSupplier(data).subscribe({
        next: () => { this.saving.set(false); this.closeModal(); this.loadSuppliers(); },
        error: err => { this.error.set(err.error?.detail || 'Failed to create'); this.saving.set(false); }
      });
    }
  }

  deleteSupplier() {
    if (!this.deletingSupplier()) return;
    this.saving.set(true);
    this.inventoryService.deleteSupplier(this.deletingSupplier()!.id).subscribe({
      next: () => { this.saving.set(false); this.showDeleteModal.set(false); this.deletingSupplier.set(null); this.loadSuppliers(); },
      error: err => { this.error.set(err.error?.detail || 'Delete failed'); this.saving.set(false); }
    });
  }
}
