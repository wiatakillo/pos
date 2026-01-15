import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService, User } from '../services/api.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="layout" [class.sidebar-open]="sidebarOpen()">
      <header class="mobile-header">
        <button class="menu-toggle" (click)="toggleSidebar()">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <span class="header-title">POS</span>
      </header>

      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo-container">
            <span class="logo">POS</span>
            <span class="version">v{{ version }}<span class="commit-hash">{{ commitHash }}</span></span>
          </div>
          <button class="close-btn" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <nav class="nav">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-link" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
            <span>Home</span>
          </a>
          <a routerLink="/products" routerLinkActive="active" class="nav-link" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            </svg>
            <span>Products</span>
          </a>
          <a routerLink="/catalog" routerLinkActive="active" class="nav-link" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            </svg>
            <span>Catalog</span>
          </a>
          <a routerLink="/tables" routerLinkActive="active" class="nav-link" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span>Tables</span>
          </a>
          <a routerLink="/orders" routerLinkActive="active" class="nav-link" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            <span>Orders</span>
          </a>
          <!-- Inventory Module -->
          <div class="nav-section">
            <button class="nav-section-header" (click)="toggleInventory()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
              <span>Inventory</span>
              <svg class="chevron" [class.open]="inventoryOpen()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            @if (inventoryOpen()) {
              <div class="nav-submenu">
                <a routerLink="/inventory/items" routerLinkActive="active" class="nav-sublink" (click)="closeSidebar()">
                  <span>Items</span>
                </a>
                <a routerLink="/inventory/suppliers" routerLinkActive="active" class="nav-sublink" (click)="closeSidebar()">
                  <span>Suppliers</span>
                </a>
                <a routerLink="/inventory/purchase-orders" routerLinkActive="active" class="nav-sublink" (click)="closeSidebar()">
                  <span>Purchase Orders</span>
                </a>
                <a routerLink="/inventory/stock" routerLinkActive="active" class="nav-sublink" (click)="closeSidebar()">
                  <span>Stock Dashboard</span>
                </a>
                <a routerLink="/inventory/reports" routerLinkActive="active" class="nav-sublink" (click)="closeSidebar()">
                  <span>Reports</span>
                </a>
              </div>
            }
          </div>

          <a routerLink="/settings" routerLinkActive="active" class="nav-link" (click)="closeSidebar()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
            </svg>
            <span>Settings</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          @if (user()) {
            <div class="user-info">
              <span class="user-email">{{ user()?.email }}</span>
            </div>
          }
          <button class="logout-btn" (click)="logout()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div class="overlay" (click)="closeSidebar()"></div>

      <main class="main">
        <ng-content></ng-content>
      </main>
    </div>
  `,
  styles: [`
    .layout {
      display: flex;
      min-height: 100vh;
      background: var(--color-bg);
    }

    /* Sidebar */
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
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border);
    }

    .logo-container {
      display: flex;
      flex-direction: column;
      gap: 1px;
      align-items: flex-start;
    }

    .logo {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-primary);
      line-height: 1.2;
    }

    .version {
      font-size: 0.6875rem;
      font-weight: 500;
      color: #6B7280;
      line-height: 1.2;
      letter-spacing: 0.01em;
      display: block;
      margin-top: 2px;
    }

    .commit-hash {
      margin-left: 6px;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 0.625rem;
      color: #9CA3AF;
      opacity: 0.8;
    }

    .close-btn {
      display: none;
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-2);
    }

    .nav {
      flex: 1;
      padding: var(--space-4) 0;
    }

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
    }

    .nav-link:hover {
      color: var(--color-text);
      background: var(--color-bg);
    }

    .nav-link.active {
      color: var(--color-primary);
      background: var(--color-primary-light);
      border-left-color: var(--color-primary);
    }

    .nav-link svg {
      flex-shrink: 0;
    }

    /* Inventory Section with Submenu */
    .nav-section {
    }

    .nav-section-header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-3) var(--space-5);
      background: none;
      border: none;
      color: var(--color-text-muted);
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border-left: 3px solid transparent;
    }

    .nav-section-header:hover {
      color: var(--color-text);
      background: var(--color-bg);
    }

    .nav-section-header .chevron {
      margin-left: auto;
      transition: transform 0.2s ease;
    }

    .nav-section-header .chevron.open {
      transform: rotate(180deg);
    }

    .nav-submenu {
      background: var(--color-bg);
      border-left: 3px solid var(--color-border);
      margin-left: calc(var(--space-5) + 10px);
    }

    .nav-sublink {
      display: block;
      padding: var(--space-2) var(--space-4);
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: 0.875rem;
      transition: all 0.15s ease;
    }

    .nav-sublink:hover {
      color: var(--color-text);
      background: var(--color-surface);
    }

    .nav-sublink.active {
      color: var(--color-primary);
      font-weight: 500;
    }

    .sidebar-footer {
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--color-border);
    }

    .user-info {
      margin-bottom: var(--space-3);
    }

    .user-email {
      font-size: 0.875rem;
      color: var(--color-text);
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
    }

    .logout-btn:hover {
      background: var(--color-bg);
      color: var(--color-text);
    }

    /* Mobile */
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
    }

    .menu-toggle span {
      display: block;
      width: 20px;
      height: 2px;
      background: var(--color-text);
      border-radius: 1px;
    }

    .header-title {
      font-weight: 700;
      color: var(--color-primary);
    }

    .overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 99;
    }

    /* Main */
    .main {
      flex: 1;
      margin-left: 240px;
      padding: var(--space-6);
    }

    @media (max-width: 768px) {
      .mobile-header {
        display: flex;
      }

      .sidebar {
        transform: translateX(-100%);
        transition: transform 0.25s ease;
      }

      .sidebar-open .sidebar {
        transform: translateX(0);
      }

      .sidebar-open .overlay {
        display: block;
      }

      .close-btn {
        display: block;
      }

      .main {
        margin-left: 0;
        padding: calc(56px + var(--space-5)) var(--space-4) var(--space-4);
      }
    }
  `]
})
export class SidebarComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  user = signal<User | null>(null);
  sidebarOpen = signal(false);
  inventoryOpen = signal(false);
  version = environment.version;
  commitHash = environment.commitHash;

  ngOnInit() {
    this.api.user$.subscribe(user => this.user.set(user));
    // Auto-open inventory submenu if on an inventory route
    if (this.router.url.startsWith('/inventory')) {
      this.inventoryOpen.set(true);
    }
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  toggleInventory() {
    this.inventoryOpen.update(v => !v);
  }

  logout() {
    this.api.logout();
    this.router.navigate(['/login']);
  }
}
