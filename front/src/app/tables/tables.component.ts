import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { ApiService, Table, TenantSettings, Floor } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';
import { ConfirmationModalComponent } from '../shared/confirmation-modal.component';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tables',
  standalone: true,
  imports: [CommonModule, FormsModule, QRCodeComponent, SidebarComponent, RouterLink, TranslateModule, ConfirmationModalComponent],
  template: `
    <app-sidebar>
        <div class="page-header">
          <div class="header-left">
            <h1>{{ 'TABLES.TITLE' | translate }}</h1>
            <a routerLink="/tables/canvas" class="btn btn-ghost btn-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
              </svg>
              {{ 'TABLES.FLOOR_PLAN' | translate }}
            </a>
          </div>
          @if (!showForm() && floors().length > 0) {
            <button class="btn btn-primary" (click)="showForm.set(true)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ 'TABLES.ADD_TABLE' | translate }}
            </button>
          }
        </div>

        <div class="content">
          @if (showForm()) {
            <div class="form-card">
              <form (submit)="createTable($event)">
                <div class="form-inline">
                  <div class="form-group-inline">
                    <label>{{ 'TABLES.NAME' | translate }}</label>
                    <input type="text" [(ngModel)]="newTableName" name="name" [placeholder]="'TABLES.TABLE_NAME' | translate" required>
                  </div>
                  <div class="form-group-inline">
                    <label>{{ 'TABLES.FLOOR' | translate }}</label>
                    <select [(ngModel)]="selectedFloorId" name="floor_id" required>
                      @for (floor of floors(); track floor.id) {
                        <option [value]="floor.id">{{ floor.name }}</option>
                      }
                    </select>
                  </div>
                  <div class="form-actions-inline">
                    <button type="submit" class="btn btn-primary">{{ 'COMMON.ADD' | translate }}</button>
                    <button type="button" class="btn btn-secondary" (click)="showForm.set(false)">{{ 'COMMON.CANCEL' | translate }}</button>
                  </div>
                </div>
              </form>
            </div>
          }

          @if (error()) {
            <div class="error-banner">{{ error() }}</div>
          }

          @if (loading()) {
            <div class="empty-state"><p>{{ 'COMMON.LOADING' | translate }}</p></div>
          } @else if (floors().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </div>
              <h3>{{ 'TABLES.CREATE_FIRST_FLOOR' | translate }}</h3>
              <p>{{ 'TABLES.CREATE_FIRST_FLOOR_DESC' | translate }}</p>
              <a routerLink="/tables/canvas" class="btn btn-primary">
                {{ 'TABLES.ADD_FLOOR' | translate }}
              </a>
            </div>
          } @else if (tables().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </div>
              <h3>{{ 'TABLES.NO_TABLES' | translate }}</h3>
              <p>{{ 'TABLES.CREATE_FIRST_FLOOR_DESC' | translate }}</p>
              <button class="btn btn-primary" (click)="showForm.set(true)">{{ 'TABLES.ADD_TABLE' | translate }}</button>
            </div>
          } @else {
            <!-- Grouped by Floor -->
            @for (floor of floors(); track floor.id) {
              @if (getTablesByFloor(floor.id!).length > 0) {
                <div class="floor-section">
                  <div class="section-header">
                    <h2>{{ floor.name }}</h2>
                    <span class="badge">{{ getTablesByFloor(floor.id!).length }}</span>
                  </div>
                  
                  <div class="table-grid">
                    @for (table of getTablesByFloor(floor.id!); track table.id) {
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
                                <button class="icon-btn icon-btn-success" (click)="saveTable(table)" [title]="'COMMON.SAVE' | translate">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20,6 9,17 4,12"/>
                                  </svg>
                                </button>
                                <button class="icon-btn" (click)="cancelEdit()" [title]="'COMMON.CANCEL' | translate">
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
                                {{ table.seat_count || '0' }} {{ 'TABLES.SEATS' | translate }}
                              </div>
                            </div>
                            <div class="header-actions">
                              <button class="icon-btn icon-btn-edit" (click)="startEdit(table)" [title]="'COMMON.EDIT' | translate">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button class="icon-btn icon-btn-danger" (click)="deleteTable(table)" [title]="'COMMON.DELETE' | translate">
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
                </div>
              }
            }
          }
        </div>

        <!-- Confirmation Modal -->
        @if (confirmationModal().show) {
          <app-confirmation-modal
            [title]="confirmationModal().title"
            [message]="confirmationModal().message"
            [confirmText]="confirmationModal().confirmText"
            [cancelText]="confirmationModal().cancelText"
            [confirmBtnClass]="confirmationModal().confirmBtnClass"
            (confirm)="onConfirmationConfirm()"
            (cancel)="onConfirmationCancel()"
          ></app-confirmation-modal>
        }
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
    .form-inline { display: flex; gap: var(--space-4); align-items: flex-end; flex-wrap: wrap; }
    .form-group-inline { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; min-width: 200px; }
    .form-group-inline label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
    .form-group-inline input, .form-group-inline select { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.9375rem; background: var(--color-surface); color: var(--color-text); }
    .form-actions-inline { display: flex; gap: var(--space-2); }

    .error-banner { background: rgba(220, 38, 38, 0.1); color: var(--color-error); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4); }

    .empty-state {
      text-align: center; padding: var(--space-8); background: var(--color-surface);
      border: 1px dashed var(--color-border); border-radius: var(--radius-lg);
      .empty-icon { color: var(--color-text-muted); margin-bottom: var(--space-4); }
      h3 { margin: 0 0 var(--space-2); font-size: 1.125rem; color: var(--color-text); }
      p { margin: 0 0 var(--space-4); color: var(--color-text-muted); }
    }

    .floor-section { margin-bottom: var(--space-8); }
    .floor-section .section-header { 
      display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4);
      padding-bottom: var(--space-2); border-bottom: 2px solid var(--color-bg);
    }
    .floor-section h2 { margin: 0; font-size: 1.25rem; font-weight: 600; }
    .badge { background: var(--color-bg); color: var(--color-text-muted); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }

    .table-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }

    .table-card {
      background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
      padding: var(--space-4); text-align: center;
    }
    .table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); gap: var(--space-2); }
    
    .table-info { flex: 1; min-width: 0; text-align: left; }
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
    
    .edit-fields { display: flex; gap: var(--space-2); align-items: center; flex: 1; flex-wrap: wrap; }
    .edit-input { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.9375rem; flex: 1; min-width: 120px; }
    .edit-input-seats { width: 80px; flex: 0 0 80px; }
    .edit-actions { display: flex; gap: var(--space-1); }
    
    .header-actions { display: flex; gap: var(--space-1); }
    
    .qr-section { margin-bottom: var(--space-4); }
    .qr-card {
      background: white; border: 2px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .qr-header { text-align: center; margin-bottom: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }
    .company-name { font-size: 1.125rem; font-weight: 700; color: var(--color-text); margin-bottom: var(--space-2); }
    .company-phone { display: flex; align-items: center; justify-content: center; gap: var(--space-1); font-size: 0.875rem; color: var(--color-text-muted); }
    .qr-code-wrapper { display: flex; justify-content: center; margin: var(--space-3) 0; }
    .qr-footer { text-align: center; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
    .table-number { font-size: 1rem; font-weight: 600; color: var(--color-primary); text-transform: uppercase; }
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
  floors = signal<Floor[]>([]);
  loading = signal(true);
  error = signal('');
  showForm = signal(false);
  newTableName = '';
  selectedFloorId: number | null = null;
  tenantSettings = signal<TenantSettings | null>(null);

  editingTableId = signal<number | null>(null);
  editingName = '';
  editingSeatCount: number | null = null;
  copiedTableId = signal<number | null>(null);

  // Confirmation Modal State
  confirmationModal = signal<{
    show: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    confirmBtnClass: string;
    tableToDelete: Table | null;
  }>({
    show: false,
    title: '',
    message: '',
    confirmText: 'COMMON.YES',
    cancelText: 'COMMON.NO',
    confirmBtnClass: 'btn-primary',
    tableToDelete: null
  });

  ngOnInit() {
    this.loadData();
    this.loadTenantSettings();
  }

  loadData() {
    this.loading.set(true);
    // Use forkJoin if needed, but sequential is fine for now
    this.api.getFloors().subscribe({
      next: floors => {
        this.floors.set(floors);
        if (floors.length > 0) {
          this.selectedFloorId = floors[0].id!;
        }
        this.api.getTables().subscribe({
          next: tables => { this.tables.set(tables); this.loading.set(false); },
          error: err => { this.error.set(err.error?.detail || 'Failed to load tables'); this.loading.set(false); }
        });
      },
      error: err => { this.error.set(err.error?.detail || 'Failed to load floors'); this.loading.set(false); }
    });
  }

  getTablesByFloor(floorId: number): Table[] {
    return this.tables().filter(t => t.floor_id === floorId);
  }

  createTable(e: Event) {
    e.preventDefault();
    if (!this.newTableName || !this.selectedFloorId) return;
    this.api.createTable(this.newTableName, this.selectedFloorId).subscribe({
      next: table => {
        this.tables.update(t => [...t, table]);
        this.newTableName = '';
        this.showForm.set(false);
      },
      error: err => this.error.set(err.error?.detail || 'Failed')
    });
  }

  deleteTable(table: Table) {
    if (!table.id) return;
    this.confirmationModal.set({
      show: true,
      title: 'TABLES.DELETE_TABLE',
      message: 'TABLES.DELETE_TABLE_CONFIRM',
      confirmText: 'COMMON.DELETE',
      cancelText: 'COMMON.CANCEL',
      confirmBtnClass: 'btn-danger',
      tableToDelete: table
    });
  }

  onConfirmationConfirm() {
    const table = this.confirmationModal().tableToDelete;
    if (table?.id) {
      this.api.deleteTable(table.id).subscribe({
        next: () => this.tables.update(t => t.filter(x => x.id !== table.id)),
        error: err => this.error.set(err.error?.detail || 'Failed')
      });
    }
    this.onConfirmationCancel();
  }

  onConfirmationCancel() {
    this.confirmationModal.update(m => ({ ...m, show: false, tableToDelete: null }));
  }

  getMenuUrl(table: Table): string {
    return `${window.location.origin}/menu/${table.token}`;
  }

  copyLink(table: Table) {
    if (!table.id) return;
    const url = this.getMenuUrl(table);
    const tableId = table.id;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.showCopiedFeedback(tableId);
      }).catch(err => {
        this.fallbackCopy(url, tableId);
      });
    } else {
      this.fallbackCopy(url, tableId);
    }
  }

  private showCopiedFeedback(tableId: number) {
    this.copiedTableId.set(tableId);
    setTimeout(() => {
      this.copiedTableId.set(null);
    }, 2000);
  }

  private fallbackCopy(text: string, tableId: number) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      if (document.execCommand('copy')) {
        this.showCopiedFeedback(tableId);
      }
    } catch (err) {
      this.error.set('Failed to copy link');
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
