import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { ApiService, Table, TenantSettings } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';

@Component({
  selector: 'app-tables',
  standalone: true,
  imports: [FormsModule, QRCodeComponent, SidebarComponent, RouterLink],
  template: `
    <app-sidebar>
        <div class="page-header">
          <div class="header-left">
            <h1>Tables</h1>
            <a routerLink="/tables/canvas" class="btn btn-ghost btn-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
              </svg>
              Canvas View
            </a>
          </div>
          @if (!showForm()) {
            <button class="btn btn-primary" (click)="showForm.set(true)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Table
            </button>
          }
        </div>

        <div class="content">
          @if (showForm()) {
            <div class="form-card">
              <form (submit)="createTable($event)">
                <div class="form-inline">
                  <input type="text" [(ngModel)]="newTableName" name="name" placeholder="Table name (e.g., Table 5)" required>
                  <button type="submit" class="btn btn-primary">Add</button>
                  <button type="button" class="btn btn-secondary" (click)="showForm.set(false)">Cancel</button>
                </div>
              </form>
            </div>
          }

          @if (error()) {
            <div class="error-banner">{{ error() }}</div>
          }

          @if (loading()) {
            <div class="empty-state"><p>Loading tables...</p></div>
          } @else if (tables().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </div>
              <h3>No tables yet</h3>
              <p>Add tables to generate QR codes for customers</p>
              <button class="btn btn-primary" (click)="showForm.set(true)">Add Table</button>
            </div>
          } @else {
            <div class="table-grid">
              @for (table of tables(); track table.id) {
                <div class="table-card">
                  <div class="table-header">
                    @if (editingTableId() === table.id) {
                      <div class="edit-fields">
                        <input 
                          type="text" 
                          [(ngModel)]="editingName" 
                          class="edit-input"
                          (keydown.enter)="saveTable(table)"
                          (keydown.escape)="cancelEdit()"
                          autofocus
                        >
                        <input 
                          type="number" 
                          [(ngModel)]="editingSeatCount" 
                          class="edit-input edit-input-seats"
                          min="1"
                          max="20"
                          placeholder="Seats"
                          (keydown.enter)="saveTable(table)"
                          (keydown.escape)="cancelEdit()"
                        >
                        <div class="edit-actions">
                          <button class="icon-btn icon-btn-success" (click)="saveTable(table)" title="Save">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                          </button>
                          <button class="icon-btn" (click)="cancelEdit()" title="Cancel">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    } @else {
                      <div class="table-info">
                        <h3 (click)="startEdit(table)" class="editable-name">{{ table.name }}</h3>
                        <div class="seat-count" (click)="startEdit(table)">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                          </svg>
                          {{ table.seat_count || 'Not set' }} seats
                        </div>
                      </div>
                      <div class="header-actions">
                        <button class="icon-btn icon-btn-edit" (click)="startEdit(table)" title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button class="icon-btn icon-btn-danger" (click)="deleteTable(table)" title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                          </svg>
                        </button>
                      </div>
                    }
                  </div>
                  <div class="qr-section">
                    <div class="qr-card">
                      @if (tenantSettings()) {
                        <div class="qr-header">
                          <div class="company-name">{{ tenantSettings()!.name }}</div>
                          @if (tenantSettings()!.phone) {
                            <div class="company-phone">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                              </svg>
                              {{ tenantSettings()!.phone }}
                            </div>
                          }
                        </div>
                        <div class="qr-code-wrapper">
                          <qrcode [qrdata]="getMenuUrl(table)" [width]="180" [errorCorrectionLevel]="'M'" cssClass="qr-code"></qrcode>
                        </div>
                        <div class="qr-footer">
                          <div class="table-number">{{ table.name }}</div>
                        </div>
                      } @else {
                        <div class="qr-code-wrapper">
                          <qrcode [qrdata]="getMenuUrl(table)" [width]="180" [errorCorrectionLevel]="'M'" cssClass="qr-code"></qrcode>
                        </div>
                        <div class="qr-footer">
                          <div class="table-number">{{ table.name }}</div>
                        </div>
                      }
                    </div>
                  </div>
                  <div class="table-actions">
                    <a [href]="getMenuUrl(table)" target="_blank" class="btn btn-secondary btn-sm">Open Menu</a>
                    <button 
                      class="btn btn-sm" 
                      [class.btn-ghost]="copiedTableId() !== table.id"
                      [class.btn-copied]="copiedTableId() === table.id"
                      (click)="copyLink(table)">
                      @if (copiedTableId() === table.id) {
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="20,6 9,17 4,12"/>
                        </svg>
                        Copied!
                      } @else {
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        Copy
                      }
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
    </app-sidebar>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
    .header-left { display: flex; align-items: center; gap: var(--space-4); }
    .page-header h1 { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; }

    .btn { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: none; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s ease; text-decoration: none; }
    .btn-primary { background: var(--color-primary); color: white; &:hover { background: var(--color-primary-hover); } }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); &:hover { background: var(--color-border); } }
    .btn-ghost { background: transparent; color: var(--color-text-muted); &:hover { background: var(--color-bg); color: var(--color-text); } }
    .btn-sm { padding: var(--space-2) var(--space-3); font-size: 0.8125rem; }
    .btn-copied { 
      background: rgba(34, 197, 94, 0.1); 
      color: #22c55e; 
      border: 1px solid rgba(34, 197, 94, 0.2);
      animation: copiedPulse 0.3s ease;
    }
    @keyframes copiedPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }

    .form-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); margin-bottom: var(--space-5); }
    .form-inline { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
    .form-inline input { flex: 1; min-width: 200px; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.9375rem; }
    .form-inline input:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }

    .error-banner { background: rgba(220, 38, 38, 0.1); color: var(--color-error); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4); }

    .empty-state {
      text-align: center; padding: var(--space-8); background: var(--color-surface);
      border: 1px dashed var(--color-border); border-radius: var(--radius-lg);
      .empty-icon { color: var(--color-text-muted); margin-bottom: var(--space-4); }
      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; color: var(--color-text); }
      p { margin: 0 0 var(--space-4); color: var(--color-text-muted); }
    }

    .table-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }

    .table-card {
      background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
      padding: var(--space-4); text-align: center;
    }
    .table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); gap: var(--space-2); }
    .table-header h3 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--color-text); }
    
    .table-info { flex: 1; min-width: 0; }
    .editable-name { cursor: pointer; margin: 0; font-size: 1rem; font-weight: 600; color: var(--color-text); }
    .editable-name:hover { color: var(--color-primary); }
    .seat-count {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin-top: var(--space-1);
      cursor: pointer;
    }
    .seat-count:hover { color: var(--color-text); }
    .seat-count svg { flex-shrink: 0; }
    
    .edit-fields {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      flex: 1;
      flex-wrap: wrap;
    }
    .edit-input {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      flex: 1;
      min-width: 120px;
    }
    .edit-input-seats {
      width: 80px;
      flex: 0 0 80px;
    }
    .edit-input:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px var(--color-primary-light);
    }
    .edit-actions {
      display: flex;
      gap: var(--space-1);
    }
    
    .header-actions {
      display: flex;
      gap: var(--space-1);
    }
    
    .icon-btn-edit:hover { background: var(--color-bg); color: var(--color-primary); }
    .icon-btn-success:hover { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
    
    .qr-section { margin-bottom: var(--space-4); }
    .qr-card {
      background: white;
      border: 2px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .qr-header {
      text-align: center;
      margin-bottom: var(--space-3);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }
    .company-name {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-text);
      margin-bottom: var(--space-2);
    }
    .company-phone {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }
    .qr-code-wrapper {
      display: flex;
      justify-content: center;
      margin: var(--space-3) 0;
    }
    .qr-section :global(qrcode canvas) {
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      padding: var(--space-2);
      background: white;
    }
    .qr-footer {
      text-align: center;
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border);
    }
    .table-number {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-primary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .table-actions { display: flex; gap: var(--space-2); justify-content: center; }

    .icon-btn { background: none; border: none; padding: var(--space-2); border-radius: var(--radius-sm); color: var(--color-text-muted); cursor: pointer; transition: all 0.15s ease; }
    .icon-btn:hover { background: var(--color-bg); color: var(--color-text); }
    .icon-btn-danger:hover { background: rgba(220, 38, 38, 0.1); color: var(--color-error); }

    @media (max-width: 768px) {
      .table-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class TablesComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  tables = signal<Table[]>([]);
  loading = signal(true);
  error = signal('');
  showForm = signal(false);
  newTableName = '';
  tenantSettings = signal<TenantSettings | null>(null);
  
  editingTableId = signal<number | null>(null);
  editingName = '';
  editingSeatCount: number | null = null;
  copiedTableId = signal<number | null>(null);

  ngOnInit() {
    this.loadTables();
    this.loadTenantSettings();
  }

  loadTables() {
    this.loading.set(true);
    this.api.getTables().subscribe({
      next: tables => { this.tables.set(tables); this.loading.set(false); },
      error: err => { this.error.set(err.error?.detail || 'Failed to load'); this.loading.set(false); }
    });
  }

  createTable(e: Event) {
    e.preventDefault();
    if (!this.newTableName) return;
    this.api.createTable(this.newTableName).subscribe({
      next: table => { this.tables.update(t => [...t, table]); this.newTableName = ''; this.showForm.set(false); },
      error: err => this.error.set(err.error?.detail || 'Failed')
    });
  }

  deleteTable(table: Table) {
    if (!table.id) return;
    this.api.deleteTable(table.id).subscribe({
      next: () => this.tables.update(t => t.filter(x => x.id !== table.id)),
      error: err => this.error.set(err.error?.detail || 'Failed')
    });
  }

  getMenuUrl(table: Table): string {
    return `${window.location.origin}/menu/${table.token}`;
  }

  copyLink(table: Table) {
    if (!table.id) return;
    const url = this.getMenuUrl(table);
    const tableId = table.id;
    
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.showCopiedFeedback(tableId);
      }).catch(err => {
        console.error('Failed to copy using Clipboard API:', err);
        this.fallbackCopy(url, tableId);
      });
    } else {
      // Fallback to older method
      this.fallbackCopy(url, tableId);
    }
  }

  private showCopiedFeedback(tableId: number) {
    this.copiedTableId.set(tableId);
    // Reset after 2 seconds
    setTimeout(() => {
      this.copiedTableId.set(null);
    }, 2000);
  }

  private fallbackCopy(text: string, tableId: number) {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.showCopiedFeedback(tableId);
      } else {
        this.error.set('Failed to copy link. Please copy manually.');
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      this.error.set('Failed to copy link. Please copy manually.');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  loadTenantSettings() {
    this.api.getTenantSettings().subscribe({
      next: settings => this.tenantSettings.set(settings),
      error: () => this.tenantSettings.set(null)
    });
  }

  startEdit(table: Table) {
    if (!table.id) return;
    this.editingTableId.set(table.id);
    this.editingName = table.name;
    this.editingSeatCount = table.seat_count || null;
  }

  cancelEdit() {
    this.editingTableId.set(null);
    this.editingName = '';
    this.editingSeatCount = null;
  }

  saveTable(table: Table) {
    if (!table.id || !this.editingName.trim()) return;
    
    const updates: Partial<Table> = {
      name: this.editingName.trim()
    };
    
    if (this.editingSeatCount !== null && this.editingSeatCount > 0) {
      updates.seat_count = this.editingSeatCount;
    }
    
    this.api.updateTable(table.id, updates).subscribe({
      next: updated => {
        this.tables.update(t => t.map(x => x.id === table.id ? updated : x));
        this.cancelEdit();
      },
      error: err => this.error.set(err.error?.detail || 'Failed to update table')
    });
  }
}
