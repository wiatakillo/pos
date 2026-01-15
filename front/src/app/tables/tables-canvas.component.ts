import { Component, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Floor, CanvasTable } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';

interface TableShape {
  id: string;
  name: string;
  shape: 'rectangle' | 'circle' | 'oval' | 'booth' | 'bar';
  width: number;
  height: number;
  seats: number;
}

@Component({
  selector: 'app-tables-canvas',
  standalone: true,
  imports: [FormsModule, SidebarComponent, RouterLink],
  template: `
    <app-sidebar>
      <div class="canvas-container">
        <!-- Header -->
        <div class="page-header">
          <div class="header-left">
            <h1>Floor Plan</h1>
            <a routerLink="/tables" class="btn btn-ghost btn-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              List View
            </a>
          </div>
          <div class="header-actions">
            @if (hasUnsavedChanges()) {
              <span class="unsaved-indicator">Unsaved changes</span>
            }
            <button class="btn btn-primary" (click)="saveAllPositions()" [disabled]="!hasUnsavedChanges()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/>
              </svg>
              Save Layout
            </button>
          </div>
        </div>

        @if (error()) {
          <div class="error-banner">{{ error() }}</div>
        }

        <!-- Floor Tabs -->
        <div class="floor-tabs">
          @for (floor of floors(); track floor.id) {
            <button
              class="floor-tab"
              [class.active]="selectedFloorId() === floor.id"
              [class.editing]="editingFloorId() === floor.id"
              (click)="selectFloor(floor.id!)"
              (dblclick)="editFloor()"
            >
              @if (editingFloorId() === floor.id) {
                <input
                  type="text"
                  [(ngModel)]="editingFloorName"
                  (blur)="saveFloorName(floor)"
                  (keydown.enter)="saveFloorName(floor)"
                  (keydown.escape)="cancelFloorEdit()"
                  class="floor-name-input"
                  autofocus
                >
              } @else {
                {{ floor.name }}
              }
            </button>
          }
          <button class="floor-tab add-floor" (click)="addFloor()" title="Add Floor">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          @if (floors().length > 0 && selectedFloorId()) {
            <button class="floor-tab floor-action edit-action" (click)="editFloor()" title="Rename floor">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="floor-tab floor-action danger" (click)="deleteCurrentFloor()" title="Delete floor">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          }
          <button class="floor-tab add-table-btn" (click)="showAddTableModal = true" title="Add Table">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Add Table
          </button>
        </div>

        <!-- Main Canvas -->
        <div class="canvas-wrapper">
          <!-- Zoom Controls -->
          <div class="zoom-controls">
            <button class="zoom-btn" (click)="zoomIn()" title="Zoom In">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
            <button class="zoom-btn" (click)="zoomOut()" title="Zoom Out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button class="zoom-btn" (click)="resetZoom()" title="Reset Zoom">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
          <div
            class="canvas-area"
            #canvasArea
            (mousedown)="onCanvasMouseDown($event)"
            (dragover)="onCanvasDragOver($event)"
            (drop)="onCanvasDrop($event)"
            (click)="onCanvasClick($event)"
            (wheel)="onCanvasWheel($event)"
          >
            @if (floors().length === 0) {
              <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                  <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                </svg>
                <h3>Create your first floor</h3>
                <p>Start by adding a floor to design your restaurant layout</p>
                <button class="btn btn-primary" (click)="addFloor()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Floor
                </button>
              </div>
            } @else {
              <svg
                class="canvas-svg"
                #canvasSvg
                [attr.viewBox]="getViewBox()"
                preserveAspectRatio="xMidYMid meet"
                (touchstart)="onCanvasTouchStart($event)"
              >
                <!-- Professional SVG Definitions -->
                <defs>
                  <!-- Wood grain pattern for tables -->
                  <pattern id="woodGrain" patternUnits="userSpaceOnUse" width="60" height="60">
                    <rect width="60" height="60" fill="#d4c4a8"/>
                    <path d="M0 30 Q15 28 30 30 T60 30" stroke="#c9b896" stroke-width="1" fill="none" opacity="0.5"/>
                    <path d="M0 15 Q15 13 30 15 T60 15" stroke="#c9b896" stroke-width="1" fill="none" opacity="0.3"/>
                    <path d="M0 45 Q15 47 30 45 T60 45" stroke="#c9b896" stroke-width="1" fill="none" opacity="0.4"/>
                  </pattern>
                  
                  <!-- Occupied table pattern (green) -->
                  <pattern id="occupiedPattern" patternUnits="userSpaceOnUse" width="60" height="60">
                    <rect width="60" height="60" fill="#22c55e"/>
                    <path d="M0 30 Q15 28 30 30 T60 30" stroke="#16a34a" stroke-width="1" fill="none" opacity="0.3"/>
                  </pattern>
                  
                  <!-- Chair gradient (neutral gray, professional look) -->
                  <linearGradient id="chairGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#e8e8e8"/>
                    <stop offset="100%" style="stop-color:#c0c0c0"/>
                  </linearGradient>
                  
                  <!-- Chair shadow -->
                  <filter id="chairShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.2"/>
                  </filter>
                  
                  <!-- Table shadow - softer and more professional -->
                  <filter id="tableShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.15"/>
                  </filter>
                  
                  <!-- Selected glow -->
                  <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#22c55e" flood-opacity="0.6"/>
                  </filter>
                </defs>

                <!-- Tables -->
                @for (table of tablesOnCurrentFloor(); track table.id) {
                  <g
                    class="table-group"
                    [class.selected]="selectedTable()?.id === table.id"
                    [class.dragging]="isDragging && draggedTable?.id === table.id"
                    [attr.transform]="'translate(' + (table.x_position || 100) + ',' + (table.y_position || 100) + ')'"
                    (mousedown)="onTableMouseDown($event, table)"
                    (touchstart)="onTableTouchStart($event, table)"
                  >
                    <!-- Chairs around table (rendered first, behind table) -->
                    @for (seat of getSeatPositions(table); track $index) {
                      <g [attr.transform]="'translate(' + seat.x + ',' + seat.y + ') rotate(' + seat.angle + ')'" filter="url(#chairShadow)">
                        <!-- Chair seat (square with rounded corners) -->
                        <rect
                          x="-10" y="-12"
                          width="20" height="24"
                          rx="3"
                          fill="url(#chairGradient)"
                          stroke="#999"
                          stroke-width="1"
                        />
                        <!-- Chair back (darker bar at top) -->
                        <rect
                          x="-8" y="-10"
                          width="16" height="5"
                          rx="2"
                          fill="#b0b0b0"
                          stroke="#888"
                          stroke-width="0.5"
                        />
                      </g>
                    }
                    
                    <!-- Table shape with shadow -->
                    <g [attr.filter]="selectedTable()?.id === table.id ? 'url(#selectedGlow)' : 'url(#tableShadow)'">
                      @if (table.shape === 'circle') {
                        <ellipse
                          cx="0" cy="0"
                          [attr.rx]="(table.width || 80) / 2"
                          [attr.ry]="(table.height || 80) / 2"
                          [attr.fill]="table.status === 'occupied' ? 'url(#occupiedPattern)' : 'url(#woodGrain)'"
                          [attr.stroke]="table.status === 'occupied' ? '#16a34a' : '#8b7355'"
                          stroke-width="2"
                        />
                      } @else if (table.shape === 'oval') {
                        <ellipse
                          cx="0" cy="0"
                          [attr.rx]="(table.width || 120) / 2"
                          [attr.ry]="(table.height || 70) / 2"
                          [attr.fill]="table.status === 'occupied' ? 'url(#occupiedPattern)' : 'url(#woodGrain)'"
                          [attr.stroke]="table.status === 'occupied' ? '#16a34a' : '#8b7355'"
                          stroke-width="2"
                        />
                      } @else if (table.shape === 'booth') {
                        <!-- Booth: U-shaped bench seating -->
                        <rect
                          [attr.x]="-((table.width || 100) / 2)"
                          [attr.y]="-((table.height || 80) / 2)"
                          [attr.width]="table.width || 100"
                          [attr.height]="table.height || 80"
                          rx="4"
                          [attr.fill]="table.status === 'occupied' ? 'url(#occupiedPattern)' : 'url(#woodGrain)'"
                          [attr.stroke]="table.status === 'occupied' ? '#16a34a' : '#8b7355'"
                          stroke-width="2"
                        />
                        <!-- Booth bench backs (decorative lines) -->
                        <line
                          [attr.x1]="-((table.width || 100) / 2) + 5"
                          [attr.y1]="-((table.height || 80) / 2) + 8"
                          [attr.x2]="((table.width || 100) / 2) - 5"
                          [attr.y2]="-((table.height || 80) / 2) + 8"
                          stroke="#8b7355"
                          stroke-width="1"
                          opacity="0.5"
                        />
                        <line
                          [attr.x1]="-((table.width || 100) / 2) + 5"
                          [attr.y1]="((table.height || 80) / 2) - 8"
                          [attr.x2]="((table.width || 100) / 2) - 5"
                          [attr.y2]="((table.height || 80) / 2) - 8"
                          stroke="#8b7355"
                          stroke-width="1"
                          opacity="0.5"
                        />
                      } @else if (table.shape === 'bar') {
                        <!-- Bar counter: long narrow rectangle -->
                        <rect
                          [attr.x]="-((table.width || 160) / 2)"
                          [attr.y]="-((table.height || 40) / 2)"
                          [attr.width]="table.width || 160"
                          [attr.height]="table.height || 40"
                          rx="4"
                          [attr.fill]="table.status === 'occupied' ? 'url(#occupiedPattern)' : '#5c4033'"
                          [attr.stroke]="table.status === 'occupied' ? '#16a34a' : '#3d2817'"
                          stroke-width="2"
                        />
                        <!-- Bar top edge highlight -->
                        <line
                          [attr.x1]="-((table.width || 160) / 2) + 4"
                          [attr.y1]="-((table.height || 40) / 2) + 4"
                          [attr.x2]="((table.width || 160) / 2) - 4"
                          [attr.y2]="-((table.height || 40) / 2) + 4"
                          stroke="#8b6914"
                          stroke-width="2"
                          stroke-linecap="round"
                        />
                      } @else {
                        <!-- Standard rectangle table -->
                        <rect
                          [attr.x]="-((table.width || 100) / 2)"
                          [attr.y]="-((table.height || 70) / 2)"
                          [attr.width]="table.width || 100"
                          [attr.height]="table.height || 70"
                          rx="4"
                          [attr.fill]="table.status === 'occupied' ? 'url(#occupiedPattern)' : 'url(#woodGrain)'"
                          [attr.stroke]="table.status === 'occupied' ? '#16a34a' : '#8b7355'"
                          stroke-width="2"
                        />
                      }
                    </g>
                    
                    <!-- Table number -->
                    <text
                      class="table-number"
                      text-anchor="middle"
                      dominant-baseline="middle"
                      [attr.fill]="table.status === 'occupied' ? 'white' : '#4a3728'"
                      font-weight="600"
                    >
                      {{ getTableNumber(table) }}
                    </text>
                  </g>
                }
              </svg>
            }
          </div>

          <!-- Properties Panel (shown when table selected) - Bottom sheet on mobile -->
          @if (selectedTable()) {
            <div class="properties-panel-backdrop" (click)="selectedTable.set(null)"></div>
            <div class="properties-panel" [class.expanded]="propertiesPanelExpanded">
              <!-- Drag handle for mobile -->
              <div class="panel-drag-handle" (click)="propertiesPanelExpanded = !propertiesPanelExpanded">
                <span class="drag-indicator"></span>
              </div>
              <div class="panel-header">
                <div class="panel-title-row">
                  <h3>{{ selectedTable()?.name }}</h3>
                  <div class="status-badge" [class.occupied]="selectedTable()?.status === 'occupied'">
                    {{ selectedTable()?.status === 'occupied' ? 'Occupied' : 'Available' }}
                  </div>
                </div>
                <button class="close-btn" (click)="selectedTable.set(null)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="panel-body">
                <div class="form-row">
                  <div class="form-group">
                    <label>Name</label>
                    <input type="text" [(ngModel)]="selectedTableName" (blur)="updateSelectedTable()">
                  </div>
                  <div class="form-group">
                    <label>Seats</label>
                    <input type="number" min="1" max="20" [(ngModel)]="selectedTableSeats" (blur)="updateSelectedTable()">
                  </div>
                </div>
                <button class="delete-btn" (click)="deleteSelectedTable()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Add Table Modal -->
        @if (showAddTableModal) {
          <div class="modal-overlay" (click)="showAddTableModal = false">
            <div class="modal-content" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>Add Table</h3>
                <button class="close-btn" (click)="showAddTableModal = false">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="modal-body">
                <div class="shape-grid">
                  @for (shape of tableShapes; track shape.id) {
                    <div
                      class="shape-option"
                      [class.selected]="selectedShape?.id === shape.id"
                      (click)="selectedShape = shape"
                    >
                      <div class="shape-preview">
                        @if (shape.shape === 'rectangle') {
                          <div class="preview-rect"></div>
                        } @else if (shape.shape === 'circle') {
                          <div class="preview-circle"></div>
                        } @else if (shape.shape === 'oval') {
                          <div class="preview-oval"></div>
                        } @else if (shape.shape === 'booth') {
                          <div class="preview-booth"></div>
                        } @else if (shape.shape === 'bar') {
                          <div class="preview-bar"></div>
                        }
                      </div>
                      <span>{{ shape.name }}</span>
                      <small>{{ shape.seats }} seats</small>
                    </div>
                  }
                </div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" (click)="showAddTableModal = false">Cancel</button>
                <button class="btn btn-primary" (click)="addTableFromModal()" [disabled]="!selectedShape">Add Table</button>
              </div>
            </div>
          </div>
        }
      </div>
    </app-sidebar>
  `,
  styles: [`
    .canvas-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 2rem);
      gap: var(--space-3);
    }

    /* Page Header - matches app style */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }

    .header-left h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text);
      margin: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .unsaved-indicator {
      color: var(--color-warning);
      font-size: 0.875rem;
    }

    .error-banner {
      background: rgba(220, 38, 38, 0.1);
      color: var(--color-error);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-3);
      border: 1px solid rgba(220, 38, 38, 0.15);
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
      text-decoration: none;
    }
    .btn-primary { background: var(--color-primary); color: white; }
    .btn-primary:hover:not(:disabled) { background: var(--color-primary-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); }
    .btn-secondary:hover:not(:disabled) { background: var(--color-border); }
    .btn-ghost { background: transparent; color: var(--color-text-muted); }
    .btn-ghost:hover { background: var(--color-bg); color: var(--color-text); }
    .btn-sm { padding: var(--space-2) var(--space-3); font-size: 0.8125rem; }

    /* Floor Tabs - matches app style */
    .floor-tabs {
      display: flex;
      gap: var(--space-1);
      padding: var(--space-2);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow-x: auto;
      margin-bottom: var(--space-4);
    }

    .floor-tab {
      padding: var(--space-2) var(--space-4);
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.15s ease;
      white-space: nowrap;
      position: relative;
    }
    .floor-tab:hover { background: var(--color-bg); color: var(--color-text); }
    .floor-tab.active {
      background: var(--color-primary);
      color: white;
    }
    .floor-tab.active.editing {
      background: transparent;
      color: var(--color-text);
      border: 1px solid var(--color-primary);
    }
    .floor-tab.add-floor {
      padding: var(--space-2);
      color: var(--color-text-muted);
    }
    .floor-tab.floor-action {
      padding: var(--space-2);
    }
    .floor-tab.floor-action.edit-action {
      /* Position right next to the add-floor button (no margin-left: auto) */
    }
    .floor-tab.floor-action.danger {
      margin-left: auto;
    }
    .floor-tab.floor-action.danger:hover {
      background: rgba(220, 38, 38, 0.1);
      color: var(--color-error);
    }
    .floor-tab.add-table-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      background: var(--color-primary);
      color: white;
    }
    .floor-tab.add-table-btn:hover {
      background: var(--color-primary-hover);
    }

    .floor-name-input {
      width: auto;
      min-width: 60px;
      max-width: 150px;
      padding: var(--space-1) var(--space-2);
      border: none;
      border-bottom: 1px solid var(--color-primary);
      border-radius: 0;
      font-size: 0.875rem;
      font-weight: 500;
      background: transparent;
      color: var(--color-text);
      outline: none;
    }
    .floor-name-input:focus {
      border-bottom-width: 2px;
    }

    /* Canvas Area */
    .canvas-wrapper {
      flex: 1;
      display: flex;
      position: relative;
      min-height: 0;
    }

    .canvas-area {
      flex: 1;
      background:
        linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px),
        var(--color-bg);
      background-size: 48px 48px, 48px 48px, auto;
      overflow: hidden;
      position: relative;
      touch-action: none; /* Prevent browser handling of touch gestures */
      cursor: grab;
    }
    .canvas-area:active {
      cursor: grabbing;
    }

    /* Zoom Controls */
    .zoom-controls {
      position: absolute;
      bottom: var(--space-4);
      right: var(--space-4);
      display: flex;
      align-items: center;
      gap: var(--space-2);
      background: var(--color-surface);
      padding: var(--space-2);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-md);
      z-index: 50;
    }

    .zoom-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s;
    }
    .zoom-btn:hover {
      background: var(--color-bg);
      color: var(--color-text);
    }
    .zoom-btn:active {
      transform: scale(0.95);
    }

    .zoom-level {
      min-width: 50px;
      text-align: center;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-text-muted);
    }

    .empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: var(--color-bg);
      color: var(--color-text);
    }
    .empty-state h3 {
      margin: 1.5rem 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .empty-state p {
      margin: 0 0 1.5rem;
      color: var(--color-text-muted);
    }

    .canvas-svg {
      width: 100%;
      height: 100%;
      display: block;
      user-select: none; /* Prevent text selection */
      -webkit-user-select: none;
    }

    .table-group {
      cursor: grab;
      /* No transition - makes dragging instant and smooth */
    }
    .table-group:active {
      cursor: grabbing;
    }
    .table-group:hover {
      filter: brightness(1.05);
    }
    .table-group.selected {
      filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.6));
    }

    .table-number {
      font-size: 20px;
      font-weight: 700;
      pointer-events: none;
    }

    /* Touch/drag state for mobile */
    .table-group.dragging {
      cursor: grabbing;
      filter: brightness(1.1) drop-shadow(0 0 12px rgba(34, 197, 94, 0.8));
    }

    /* Properties Panel - Mobile-first (Bottom Sheet) */
    .properties-panel-backdrop {
      display: none;
    }

    .properties-panel {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--color-surface);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      border: 1px solid var(--color-border);
      border-bottom: none;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.15);
      z-index: 100;
      transform: translateY(0);
      transition: transform 0.3s ease;
      max-height: 50vh;
      overflow-y: auto;
    }

    .panel-drag-handle {
      display: flex;
      justify-content: center;
      padding: var(--space-2) 0;
      cursor: pointer;
    }

    .drag-indicator {
      width: 40px;
      height: 4px;
      background: var(--color-border);
      border-radius: 2px;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 var(--space-4) var(--space-3);
    }

    .panel-title-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .panel-header h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text);
    }

    .status-badge {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      background: #e8dcc8;
      color: #5a4a3a;
    }
    .status-badge.occupied {
      background: var(--color-success-light);
      color: var(--color-success);
    }

    .close-btn {
      padding: var(--space-2);
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: var(--radius-sm);
      transition: all 0.15s;
    }
    .close-btn:hover {
      background: var(--color-bg);
      color: var(--color-text);
    }

    .panel-body {
      padding: 0 var(--space-4) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .form-row {
      display: flex;
      gap: var(--space-3);
    }

    .form-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .form-group label {
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .form-group input {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      background: var(--color-bg);
    }
    .form-group input:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-primary-light);
    }

    .delete-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: rgba(220, 38, 38, 0.1);
      color: var(--color-error);
      border: none;
      border-radius: var(--radius-md);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .delete-btn:hover { background: rgba(220, 38, 38, 0.15); }

    /* Modal - Mobile-first */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
      padding: 0;
    }

    .modal-content {
      background: var(--color-surface);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      background: var(--color-surface);
      z-index: 1;
    }
    .modal-header h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text);
    }

    .modal-body {
      padding: var(--space-4);
    }

    .modal-footer {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-4);
      border-top: 1px solid var(--color-border);
      background: var(--color-bg);
      position: sticky;
      bottom: 0;
    }
    .modal-footer .btn {
      flex: 1;
    }

    /* Shape Grid - 2 columns on mobile */
    .shape-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3);
    }

    .shape-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-4) var(--space-3);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.15s ease;
      min-height: 88px;
    }
    .shape-option:hover { border-color: var(--color-text-muted); background: var(--color-bg); }
    .shape-option:active { transform: scale(0.98); }
    .shape-option.selected { border-color: var(--color-primary); background: var(--color-primary-light); }
    .shape-option span { font-weight: 500; color: var(--color-text); font-size: 0.875rem; }
    .shape-option small { color: var(--color-text-muted); font-size: 0.75rem; }

    .shape-preview {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .preview-rect {
      width: 40px;
      height: 26px;
      background: #e8dcc8;
      border: 2px solid #d4c4a8;
      border-radius: 4px;
    }
    .preview-circle {
      width: 32px;
      height: 32px;
      background: #e8dcc8;
      border: 2px solid #d4c4a8;
      border-radius: 50%;
    }
    .preview-oval {
      width: 40px;
      height: 26px;
      background: #e8dcc8;
      border: 2px solid #d4c4a8;
      border-radius: 50%;
    }
    .preview-booth {
      width: 36px;
      height: 28px;
      background: #e8dcc8;
      border: 2px solid #d4c4a8;
      border-radius: 4px;
      position: relative;
    }
    .preview-booth::before,
    .preview-booth::after {
      content: '';
      position: absolute;
      left: 3px;
      right: 3px;
      height: 2px;
      background: #c9b896;
      border-radius: 1px;
    }
    .preview-booth::before { top: 3px; }
    .preview-booth::after { bottom: 3px; }
    .preview-bar {
      width: 44px;
      height: 18px;
      background: #5c4033;
      border: 2px solid #3d2817;
      border-radius: 4px;
      position: relative;
    }
    .preview-bar::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 3px;
      right: 3px;
      height: 2px;
      background: #8b6914;
      border-radius: 1px;
    }

    /* ========== DESKTOP STYLES (min-width: 768px) ========== */
    @media (min-width: 768px) {
      .page-header {
        flex-direction: row;
      }

      .header-actions {
        flex-direction: row;
      }

      .floor-tabs {
        padding: var(--space-2);
      }

      .floor-tab {
        padding: var(--space-2) var(--space-4);
      }

      /* Properties Panel - Desktop: Right sidebar */
      .properties-panel-backdrop {
        display: none;
      }

      .properties-panel {
        position: absolute;
        top: 1rem;
        right: 1rem;
        bottom: auto;
        left: auto;
        width: 280px;
        max-height: none;
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-border);
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        z-index: 10;
      }

      .panel-drag-handle {
        display: none;
      }

      .panel-header {
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }

      .panel-body {
        padding: var(--space-4);
        gap: var(--space-3);
      }

      .form-row {
        flex-direction: column;
        gap: var(--space-3);
      }

      .delete-btn {
        padding: var(--space-3);
        font-size: 0.875rem;
      }

      /* Modal - Desktop: Centered */
      .modal-overlay {
        align-items: center;
        padding: var(--space-4);
      }

      .modal-content {
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 520px;
        max-height: 85vh;
      }

      .modal-header {
        padding: var(--space-5) var(--space-6);
      }

      .modal-body {
        padding: var(--space-5) var(--space-6);
      }

      .modal-footer {
        padding: var(--space-5) var(--space-6);
      }
      .modal-footer .btn {
        flex: none;
      }

      /* Shape Grid - 4 columns on desktop */
      .shape-grid {
        grid-template-columns: repeat(4, 1fr);
        gap: 0.75rem;
      }

      .shape-option {
        padding: var(--space-5) var(--space-3);
      }

      .shape-preview {
        width: 48px;
        height: 48px;
      }

      .preview-rect { width: 44px; height: 28px; }
      .preview-circle { width: 36px; height: 36px; }
      .preview-oval { width: 44px; height: 28px; }
      .preview-booth { width: 40px; height: 32px; }
      .preview-booth::before, .preview-booth::after { height: 3px; left: 4px; right: 4px; }
      .preview-booth::before { top: 4px; }
      .preview-booth::after { bottom: 4px; }
      .preview-bar { width: 48px; height: 20px; }
      .preview-bar::before { top: 3px; left: 4px; right: 4px; }
    }
  `]
})
export class TablesCanvasComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  @ViewChild('canvasArea') canvasAreaRef!: ElementRef;
  @ViewChild('canvasSvg') canvasSvgRef!: ElementRef<SVGSVGElement>;

  error = signal('');
  floors = signal<Floor[]>([]);
  tables = signal<CanvasTable[]>([]);
  selectedFloorId = signal<number | null>(null);
  selectedTable = signal<CanvasTable | null>(null);
  editingFloorId = signal<number | null>(null);
  editingFloorName = '';
  hasUnsavedChanges = signal(false);

  selectedTableName = '';
  selectedTableSeats = 4;
  showAddTableModal = false;
  selectedShape: TableShape | null = null;

  canvasWidth = 1200;
  canvasHeight = 800;

  // Mobile UI state
  propertiesPanelExpanded = false;
  isDragging = false;
  draggedTable: CanvasTable | null = null;
  private dragOffset = { x: 0, y: 0 };

  // Zoom and pan state
  zoomLevel = 1;
  private panOffset = { x: 0, y: 0 };
  private minZoom = 0.25;
  private maxZoom = 3;
  private lastPinchDistance = 0;
  private isPanning = false;
  private lastPanPosition = { x: 0, y: 0 };
  Math = Math; // Expose Math for template

  tableShapes: TableShape[] = [
    { id: 'square4', name: 'Square 4', shape: 'rectangle', width: 80, height: 80, seats: 4 },
    { id: 'rect4', name: 'Rectangle 4', shape: 'rectangle', width: 100, height: 70, seats: 4 },
    { id: 'rect6', name: 'Rectangle 6', shape: 'rectangle', width: 140, height: 70, seats: 6 },
    { id: 'circle4', name: 'Round 4', shape: 'circle', width: 80, height: 80, seats: 4 },
    { id: 'circle6', name: 'Round 6', shape: 'circle', width: 100, height: 100, seats: 6 },
    { id: 'oval6', name: 'Oval 6', shape: 'oval', width: 120, height: 70, seats: 6 },
    { id: 'booth4', name: 'Booth 4', shape: 'booth', width: 100, height: 80, seats: 4 },
    { id: 'bar4', name: 'Bar 4', shape: 'bar', width: 160, height: 50, seats: 4 }
  ];

  ngOnInit() {
    this.loadData();
    // Mouse event listeners
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    // Touch event listeners for mobile
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('touchend', this.onTouchEnd);
    document.addEventListener('touchcancel', this.onTouchEnd);
  }

  ngOnDestroy() {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('touchmove', this.onTouchMove);
    document.removeEventListener('touchend', this.onTouchEnd);
    document.removeEventListener('touchcancel', this.onTouchEnd);
  }

  loadData() {
    this.error.set('');
    this.api.getFloors().subscribe({
      next: floors => {
        this.floors.set(floors);
        if (floors.length > 0 && !this.selectedFloorId()) {
          this.selectedFloorId.set(floors[0].id!);
        }
      },
      error: err => {
        this.error.set(err.error?.detail || 'Failed to load floors');
        this.floors.set([]);
      }
    });

    this.api.getTablesWithStatus().subscribe({
      next: tables => this.tables.set(tables),
      error: err => {
        this.error.set(err.error?.detail || 'Failed to load tables');
        this.tables.set([]);
      }
    });
  }

  tablesOnCurrentFloor() {
    const floorId = this.selectedFloorId();
    return this.tables().filter(t => t.floor_id === floorId || (!t.floor_id && !floorId));
  }

  selectFloor(id: number) {
    this.selectedFloorId.set(id);
    this.selectedTable.set(null);
  }

  addFloor() {
    this.error.set('');
    const name = `Floor ${this.floors().length + 1}`;
    this.api.createFloor(name).subscribe({
      next: floor => {
        this.floors.update(f => [...f, floor]);
        this.selectedFloorId.set(floor.id!);
      },
      error: err => this.error.set(err.error?.detail || 'Failed to create floor')
    });
  }

  editFloor() {
    const floor = this.floors().find(f => f.id === this.selectedFloorId());
    if (floor) {
      this.editingFloorId.set(floor.id!);
      this.editingFloorName = floor.name;
    }
  }

  saveFloorName(floor: Floor) {
    if (this.editingFloorName && this.editingFloorName !== floor.name) {
      this.error.set('');
      this.api.updateFloor(floor.id!, { name: this.editingFloorName }).subscribe({
        next: updated => {
          this.floors.update(floors => floors.map(f => f.id === updated.id ? updated : f));
        },
        error: err => this.error.set(err.error?.detail || 'Failed to rename floor')
      });
    }
    this.editingFloorId.set(null);
  }

  cancelFloorEdit() {
    this.editingFloorId.set(null);
  }

  deleteCurrentFloor() {
    const id = this.selectedFloorId();
    if (!id) return;

    if (confirm('Delete this floor? Tables will be unassigned.')) {
      this.error.set('');
      this.api.deleteFloor(id).subscribe({
        next: () => {
          this.floors.update(floors => floors.filter(f => f.id !== id));
          const remaining = this.floors();
          this.selectedFloorId.set(remaining.length > 0 ? remaining[0].id! : null);
        },
        error: err => this.error.set(err.error?.detail || 'Failed to delete floor')
      });
    }
  }

  getTableNumber(table: CanvasTable): string {
    // Extract number from name like "Table 5" -> "5"
    const match = table.name.match(/\d+/);
    return match ? match[0] : table.name;
  }

  // Zoom and pan methods
  getViewBox(): string {
    const viewWidth = this.canvasWidth / this.zoomLevel;
    const viewHeight = this.canvasHeight / this.zoomLevel;
    // Center the viewport
    const x = (this.canvasWidth - viewWidth) / 2 + this.panOffset.x;
    const y = (this.canvasHeight - viewHeight) / 2 + this.panOffset.y;
    return `${x} ${y} ${viewWidth} ${viewHeight}`;
  }

  zoomIn() {
    this.setZoom(this.zoomLevel * 1.25);
  }

  zoomOut() {
    this.setZoom(this.zoomLevel / 1.25);
  }

  resetZoom() {
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
  }

  private setZoom(level: number) {
    this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, level));
  }

  onCanvasWheel(event: WheelEvent) {
    // Prevent page zoom, only zoom canvas
    event.preventDefault();

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    this.setZoom(this.zoomLevel * zoomFactor);
  }

  // Pinch-to-zoom for touch devices
  onCanvasTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      // Two-finger pinch start
      event.preventDefault();
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.lastPinchDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
    }
  }

  private onPinchMove = (event: TouchEvent) => {
    if (event.touches.length !== 2 || this.lastPinchDistance === 0) return;

    event.preventDefault();
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    const currentDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );

    const scale = currentDistance / this.lastPinchDistance;
    this.setZoom(this.zoomLevel * scale);
    this.lastPinchDistance = currentDistance;
  };

  // Drag handlers
  onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onCanvasDrop(event: DragEvent) {
    // Not used with modal approach
  }

  addTableFromModal() {
    this.error.set('');
    if (!this.selectedShape || !this.selectedFloorId()) return;

    const shape = this.selectedShape;
    const tableName = `Table ${this.tables().length + 1}`;

    // Position in center of canvas
    const x = this.canvasWidth / 2;
    const y = this.canvasHeight / 2;

    this.api.createTable(tableName, this.selectedFloorId()!).subscribe({
      next: table => {
        this.api.updateTable(table.id!, {
          x_position: x,
          y_position: y,
          shape: shape.shape,
          width: shape.width,
          height: shape.height,
          seat_count: shape.seats
        }).subscribe({
          next: updated => {
            const canvasTable: CanvasTable = { ...updated, status: 'available' };
            this.tables.update(t => [...t, canvasTable]);
          },
          error: err => this.error.set(err.error?.detail || 'Failed to set table layout')
        });
      },
      error: err => this.error.set(err.error?.detail || 'Failed to create table')
    });

    this.showAddTableModal = false;
    this.selectedShape = null;
  }

  onTableMouseDown(event: MouseEvent, table: CanvasTable) {
    event.preventDefault(); // Prevent text selection
    event.stopPropagation();

    this.selectedTable.set(table);
    this.selectedTableName = table.name;
    this.selectedTableSeats = table.seat_count || 4;

    this.isDragging = true;
    this.draggedTable = table;
    document.body.style.userSelect = 'none'; // Prevent text selection globally
    document.body.style.cursor = 'grabbing';

    // Get SVG coordinates using native transformation
    const svgPoint = this.getSvgPoint(event.clientX, event.clientY);
    if (svgPoint) {
      this.dragOffset = {
        x: svgPoint.x - (table.x_position || 0),
        y: svgPoint.y - (table.y_position || 0)
      };
    }
  }

  // Touch start handler for mobile
  onTableTouchStart(event: TouchEvent, table: CanvasTable) {
    if (event.touches.length !== 1) return; // Only single touch

    const touch = event.touches[0];
    event.preventDefault(); // Prevent scrolling while dragging

    this.selectedTable.set(table);
    this.selectedTableName = table.name;
    this.selectedTableSeats = table.seat_count || 4;
    this.propertiesPanelExpanded = false; // Start collapsed on mobile

    this.isDragging = true;
    this.draggedTable = table;

    const svgPoint = this.getSvgPoint(touch.clientX, touch.clientY);
    if (svgPoint) {
      this.dragOffset = {
        x: svgPoint.x - (table.x_position || 0),
        y: svgPoint.y - (table.y_position || 0)
      };
    }
  }

  // Convert screen coordinates to SVG viewBox coordinates
  private getSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.canvasSvgRef?.nativeElement) return null;

    const svg = this.canvasSvgRef.nativeElement;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    // Get the inverse of the screen CTM to convert screen coords to SVG coords
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;

    const svgPoint = point.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  // Canvas mousedown - start panning if not clicking on a table
  onCanvasMouseDown(event: MouseEvent) {
    // Only pan with left mouse button and when not clicking on a table
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.table-group')) return;

    // Start panning
    this.isPanning = true;
    this.lastPanPosition = { x: event.clientX, y: event.clientY };
    document.body.style.cursor = 'grabbing';
    event.preventDefault();
  }

  onMouseMove = (event: MouseEvent) => {
    // Handle canvas panning
    if (this.isPanning) {
      const dx = (event.clientX - this.lastPanPosition.x) / this.zoomLevel;
      const dy = (event.clientY - this.lastPanPosition.y) / this.zoomLevel;

      this.panOffset.x -= dx;
      this.panOffset.y -= dy;

      this.lastPanPosition = { x: event.clientX, y: event.clientY };
      return;
    }

    // Handle table dragging
    if (!this.isDragging || !this.draggedTable) return;

    const svgPoint = this.getSvgPoint(event.clientX, event.clientY);
    if (!svgPoint) return;

    const x = svgPoint.x - this.dragOffset.x;
    const y = svgPoint.y - this.dragOffset.y;

    // Clamp to canvas bounds
    const clampedX = Math.max(50, Math.min(this.canvasWidth - 50, x));
    const clampedY = Math.max(50, Math.min(this.canvasHeight - 50, y));

    this.tables.update(tables =>
      tables.map(t =>
        t.id === this.draggedTable?.id
          ? { ...t, x_position: clampedX, y_position: clampedY }
          : t
      )
    );

    this.hasUnsavedChanges.set(true);
  };

  onMouseUp = () => {
    // Stop panning
    if (this.isPanning) {
      this.isPanning = false;
      document.body.style.cursor = '';
    }

    // Stop table dragging
    if (this.isDragging) {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    this.isDragging = false;
    this.draggedTable = null;
  };

  // Touch move handler for mobile dragging and pinch-to-zoom
  onTouchMove = (event: TouchEvent) => {
    // Handle pinch-to-zoom with 2 fingers
    if (event.touches.length === 2 && this.lastPinchDistance > 0) {
      event.preventDefault();
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      const scale = currentDistance / this.lastPinchDistance;
      this.setZoom(this.zoomLevel * scale);
      this.lastPinchDistance = currentDistance;
      return;
    }

    // Handle single-finger table drag
    if (!this.isDragging || !this.draggedTable) return;
    if (event.touches.length !== 1) return;

    event.preventDefault(); // Prevent scrolling while dragging

    const touch = event.touches[0];
    const svgPoint = this.getSvgPoint(touch.clientX, touch.clientY);
    if (!svgPoint) return;

    const x = svgPoint.x - this.dragOffset.x;
    const y = svgPoint.y - this.dragOffset.y;

    // Clamp to canvas bounds
    const clampedX = Math.max(50, Math.min(this.canvasWidth - 50, x));
    const clampedY = Math.max(50, Math.min(this.canvasHeight - 50, y));

    this.tables.update(tables =>
      tables.map(t =>
        t.id === this.draggedTable?.id
          ? { ...t, x_position: clampedX, y_position: clampedY }
          : t
      )
    );

    this.hasUnsavedChanges.set(true);
  };

  // Touch end handler for mobile
  onTouchEnd = () => {
    this.isDragging = false;
    this.draggedTable = null;
    this.lastPinchDistance = 0; // Reset pinch tracking
  };

  onCanvasClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('.table-group')) return;
    this.selectedTable.set(null);
  }

  updateSelectedTable() {
    const table = this.selectedTable();
    if (!table?.id) return;

    this.error.set('');
    this.api.updateTable(table.id, {
      name: this.selectedTableName,
      seat_count: this.selectedTableSeats
    }).subscribe({
      next: updated => {
        // IMPORTANT:
        // Do not overwrite local layout fields (x/y/shape/etc) with the server response.
        // Otherwise, if the user has unsaved drag changes, editing properties would "jump"
        // back to the DB-stored position (often the initial center).
        this.tables.update(tables =>
          tables.map(t => {
            if (t.id !== updated.id) return t;
            return {
              ...t,
              name: updated.name,
              seat_count: updated.seat_count
            };
          })
        );
        this.selectedTable.update(t => {
          if (!t) return null;
          return {
            ...t,
            name: updated.name,
            seat_count: updated.seat_count
          };
        });
      },
      error: err => this.error.set(err.error?.detail || 'Failed to update table')
    });
  }

  deleteSelectedTable() {
    const table = this.selectedTable();
    if (!table?.id) return;

    if (confirm(`Delete ${table.name}?`)) {
      this.error.set('');
      this.api.deleteTable(table.id).subscribe({
        next: () => {
          this.tables.update(tables => tables.filter(t => t.id !== table.id));
          this.selectedTable.set(null);
        },
        error: err => this.error.set(err.error?.detail || 'Failed to delete table')
      });
    }
  }

  saveAllPositions() {
    const updates = this.tablesOnCurrentFloor().map(table =>
      this.api.updateTable(table.id!, {
        x_position: table.x_position,
        y_position: table.y_position
      }).toPromise()
    );

    Promise.all(updates)
      .then(() => this.hasUnsavedChanges.set(false))
      .catch(() => this.error.set('Failed to save layout'));
  }

  getSeatPositions(table: CanvasTable): { x: number; y: number; angle: number }[] {
    const seats: { x: number; y: number; angle: number }[] = [];
    const count = table.seat_count || 4;
    const w = (table.width || 100) / 2;
    const h = (table.height || 70) / 2;
    const chairOffset = 22; // Distance from table edge

    if (table.shape === 'circle' || table.shape === 'oval') {
      // Circular layout - distribute evenly around perimeter
      for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        seats.push({
          x: (w + chairOffset) * Math.cos(angle),
          y: (h + chairOffset) * Math.sin(angle),
          angle: (angle * 180) / Math.PI + 90
        });
      }
    } else if (table.shape === 'booth') {
      // Booth layout - seats on top and bottom only (bench seating)
      const topSeats = Math.ceil(count / 2);
      const bottomSeats = count - topSeats;

      // Top bench
      for (let i = 0; i < topSeats; i++) {
        seats.push({
          x: -w + (w * 2 * (i + 1)) / (topSeats + 1),
          y: -h - chairOffset,
          angle: 180
        });
      }
      // Bottom bench
      for (let i = 0; i < bottomSeats; i++) {
        seats.push({
          x: -w + (w * 2 * (i + 1)) / (bottomSeats + 1),
          y: h + chairOffset,
          angle: 0
        });
      }
    } else if (table.shape === 'bar') {
      // Bar layout - all seats on one side (bottom/front of bar)
      for (let i = 0; i < count; i++) {
        seats.push({
          x: -w + (w * 2 * (i + 1)) / (count + 1),
          y: h + chairOffset,
          angle: 0
        });
      }
    } else {
      // Rectangle - distribute evenly on all 4 sides
      const topSeats = Math.ceil(count / 4);
      const bottomSeats = Math.ceil(count / 4);
      const leftSeats = Math.floor((count - topSeats - bottomSeats) / 2);
      const rightSeats = count - topSeats - bottomSeats - leftSeats;

      // Top
      for (let i = 0; i < topSeats; i++) {
        seats.push({
          x: -w + (w * 2 * (i + 1)) / (topSeats + 1),
          y: -h - chairOffset,
          angle: 180
        });
      }
      // Bottom
      for (let i = 0; i < bottomSeats; i++) {
        seats.push({
          x: -w + (w * 2 * (i + 1)) / (bottomSeats + 1),
          y: h + chairOffset,
          angle: 0
        });
      }
      // Left
      for (let i = 0; i < leftSeats; i++) {
        seats.push({
          x: -w - chairOffset,
          y: -h + (h * 2 * (i + 1)) / (leftSeats + 1),
          angle: 90
        });
      }
      // Right
      for (let i = 0; i < rightSeats; i++) {
        seats.push({
          x: w + chairOffset,
          y: -h + (h * 2 * (i + 1)) / (rightSeats + 1),
          angle: -90
        });
      }
    }

    return seats;
  }
}
