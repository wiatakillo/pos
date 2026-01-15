import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SidebarComponent } from '../shared/sidebar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [SidebarComponent, RouterLink],
  template: `
    <app-sidebar>
        <div class="page-header">
          <h1>Dashboard</h1>
        </div>

        <div class="welcome-section">
          <h2>Welcome back</h2>
          <p class="welcome-text">Manage your restaurant from here.</p>
        </div>

        <div class="quick-actions">
          <a routerLink="/products" class="action-card">
            <div class="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              </svg>
            </div>
            <span class="action-label">Products</span>
            <span class="action-desc">Manage menu items</span>
          </a>
          <a routerLink="/tables" class="action-card">
            <div class="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
            </div>
            <span class="action-label">Tables</span>
            <span class="action-desc">QR codes for customers</span>
          </a>
          <a routerLink="/orders" class="action-card">
            <div class="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <span class="action-label">Orders</span>
            <span class="action-desc">View incoming orders</span>
          </a>
        </div>
    </app-sidebar>
  `,
  styles: [`
    .page-header {
      margin-bottom: var(--space-6);

      h1 {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text);
      }
    }

    .welcome-section {
      margin-bottom: var(--space-6);

      h2 {
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      .welcome-user {
        color: var(--color-text-muted);
        margin-bottom: var(--space-1);

        strong {
          color: var(--color-text);
        }
      }

      .welcome-text {
        color: var(--color-text-muted);
      }
    }

    .quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--space-4);
    }

    .action-card {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      text-decoration: none;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--color-primary);
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }
    }

    .action-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary-light);
      border-radius: var(--radius-md);
      color: var(--color-primary);
      margin-bottom: var(--space-4);
    }

    .action-label {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--space-1);
    }

    .action-desc {
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }

    @media (max-width: 768px) {
      .quick-actions {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  ngOnInit() {
    // Component initialization if needed
  }
}
