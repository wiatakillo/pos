import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, TenantSettings } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';
import { TranslationsComponent } from '../translations/translations.component';
import { TranslateModule } from '@ngx-translate/core';
import { RolesComponent } from './roles.component';
import { UsersComponent } from './users.component';
import { HasPermissionDirective } from '../shared/has-permission.directive';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarComponent,
    TranslateModule,
    TranslationsComponent,
    RolesComponent,
    UsersComponent,
    HasPermissionDirective,
  ],
  template: `
    <app-sidebar>
      <div class="page-header">
        <h1>{{ 'SETTINGS.TITLE' | translate }}</h1>
      </div>

      <!-- Tab Navigation - Mobile First (horizontal scrollable tabs) -->
      <div class="tabs-container">
        <div class="tabs">
          <button 
            type="button" 
            class="tab" 
            [class.active]="activeSection() === 'general'"
            (click)="activeSection.set('general')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span>{{ 'SETTINGS.BUSINESS_PROFILE' | translate }}</span>
          </button>
          
          <button 
            type="button" 
            class="tab" 
            [class.active]="activeSection() === 'contact'"
            (click)="activeSection.set('contact')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <span>{{ 'SETTINGS.CONTACT_INFO' | translate }}</span>
          </button>
          
          <button 
            type="button" 
            class="tab" 
            [class.active]="activeSection() === 'hours'"
            (click)="activeSection.set('hours')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{{ 'SETTINGS.OPENING_HOURS' | translate }}</span>
          </button>
          
          <button 
            type="button" 
            class="tab" 
            [class.active]="activeSection() === 'payments'"
            (click)="activeSection.set('payments')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <span>{{ 'SETTINGS.PAYMENT_SETTINGS' | translate }}</span>
          </button>
          
          <button 
            type="button" 
            class="tab" 
            [class.active]="activeSection() === 'translations'"
            (click)="activeSection.set('translations')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
            </svg>
            <span>{{ 'SETTINGS.TRANSLATIONS_TITLE' | translate }}</span>
          </button>

          <button
            *appHasPermission="'users:read'"
            type="button"
            class="tab"
            [class.active]="activeSection() === 'users'"
            (click)="activeSection.set('users')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>Users</span>
          </button>

          <button
            *appHasPermission="'roles:manage'"
            type="button"
            class="tab"
            [class.active]="activeSection() === 'roles'"
            (click)="activeSection.set('roles')">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>Roles</span>
          </button>
        </div>
      </div>

      <div class="content">
        @if (loading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{{ 'SETTINGS.LOADING_SETTINGS' | translate }}</p>
          </div>
        } @else {
          <!-- Translations Section (Independent) -->
          @if (activeSection() === 'translations') {
            <div class="section">
              <div class="section-header">
                <h2>{{ 'SETTINGS.TRANSLATIONS_TITLE' | translate }}</h2>
                <p>{{ 'SETTINGS.TRANSLATIONS_SUBTITLE' | translate }}</p>
              </div>
              <app-translations></app-translations>
            </div>
          }
          @else if (activeSection() === 'users') {
            <app-users-settings></app-users-settings>
          }
          @else if (activeSection() === 'roles') {
            <app-roles-settings></app-roles-settings>
          }
          @else {
            <!-- Tenant Settings Sections (Shared Form) -->
            <form (ngSubmit)="saveSettings()" class="settings-form">

              <!-- General Section -->
              @if (activeSection() === 'general') {
                <div class="section">
                  <div class="section-header">
                    <h2>{{ 'SETTINGS.BUSINESS_PROFILE' | translate }}</h2>
                    <p>{{ 'SETTINGS.SUBTITLE' | translate }}</p>
                  </div>
                  
                  <!-- Logo -->
                  <div class="form-group">
                    <label>{{ 'SETTINGS.LOGO' | translate }}</label>
                    <div class="logo-upload-wrapper">
                      @if (logoPreview() || settings()?.logo_filename) {
                        <div class="current-logo">
                          <img [src]="logoPreview() || getLogoUrl()" alt="Logo" />
                          <button type="button" class="btn-icon-danger" (click)="removeLogo()" title="{{ 'SETTINGS.REMOVE_LOGO' | translate }}">✕</button>
                        </div>
                      }
                      <div class="upload-controls">
                        <input
                          type="file"
                          id="logo-upload"
                          accept="image/*"
                          (change)="onLogoSelected($event)"
                          hidden
                        />
                        <label for="logo-upload" class="btn btn-secondary">
                          {{ 'SETTINGS.UPLOAD_LOGO' | translate }}
                        </label>
                        <span class="hint">{{ 'SETTINGS.UPLOAD_LOGO_HINT' | translate }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Basic Info -->
                  <div class="form-row">
                    <div class="form-group">
                      <label for="name">{{ 'SETTINGS.BUSINESS_NAME' | translate }} *</label>
                      <input type="text" id="name" [(ngModel)]="formData.name" name="name" required />
                    </div>

                    <div class="form-group">
                      <label for="business_type">{{ 'SETTINGS.BUSINESS_TYPE' | translate }}</label>
                      <select id="business_type" [(ngModel)]="formData.business_type" name="business_type">
                        <option [value]="null">{{ 'SETTINGS.SELECT_BUSINESS_TYPE' | translate }}</option>
                        <option value="restaurant">{{ 'SETTINGS.BUSINESS_TYPE_RESTAURANT' | translate }}</option>
                        <option value="bar">{{ 'SETTINGS.BUSINESS_TYPE_BAR' | translate }}</option>
                        <option value="cafe">{{ 'SETTINGS.BUSINESS_TYPE_CAFE' | translate }}</option>
                        <option value="retail">{{ 'SETTINGS.BUSINESS_TYPE_RETAIL' | translate }}</option>
                      </select>
                    </div>
                  </div>

                  <div class="form-group">
                    <label for="description">{{ 'SETTINGS.DESCRIPTION' | translate }}</label>
                    <textarea id="description" [(ngModel)]="formData.description" name="description" rows="3"></textarea>
                  </div>
                </div>
              }

              <!-- Contact Section -->
              @if (activeSection() === 'contact') {
                <div class="section">
                  <div class="section-header">
                    <h2>{{ 'SETTINGS.CONTACT_INFO' | translate }}</h2>
                    <p>{{ 'SETTINGS.CONTACT_INFO_SUBTITLE' | translate }}</p>
                  </div>
                  
                  <div class="form-row">
                    <div class="form-group">
                      <label for="phone">{{ 'SETTINGS.PHONE' | translate }}</label>
                      <input type="tel" id="phone" [(ngModel)]="formData.phone" name="phone" />
                    </div>
                    <div class="form-group">
                      <label for="whatsapp">{{ 'SETTINGS.WHATSAPP' | translate }}</label>
                      <input type="tel" id="whatsapp" [(ngModel)]="formData.whatsapp" name="whatsapp" />
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label for="email">{{ 'SETTINGS.EMAIL' | translate }}</label>
                    <input type="email" id="email" [(ngModel)]="formData.email" name="email" />
                  </div>
                  
                  <div class="form-group">
                    <label for="address">{{ 'SETTINGS.ADDRESS' | translate }}</label>
                    <input type="text" id="address" [(ngModel)]="formData.address" name="address" />
                  </div>
                  
                  <div class="form-group">
                    <label for="website">{{ 'SETTINGS.WEBSITE' | translate }}</label>
                    <input type="url" id="website" [(ngModel)]="formData.website" name="website" />
                  </div>
                </div>
              }

              <!-- Hours Section -->
              @if (activeSection() === 'hours') {
                <div class="section">
                  <div class="section-header">
                    <h2>{{ 'SETTINGS.OPENING_HOURS' | translate }}</h2>
                    <p>{{ 'SETTINGS.OPENING_HOURS_SUBTITLE' | translate }}</p>
                  </div>
                  
                  <div class="hours-grid">
                    @for (day of daysOfWeek; track day.key) {
                      <div class="day-row" [class.closed]="openingHours[day.key]?.closed">
                        <div class="day-header">
                          <label class="switch">
                            <input
                              type="checkbox"
                              [checked]="!openingHours[day.key]?.closed"
                              (change)="toggleDayClosed(day.key, $event)"
                            />
                            <span class="slider round"></span>
                          </label>
                          <span class="day-name">{{ day.label | translate }}</span>
                        </div>

                        @if (!openingHours[day.key]?.closed) {
                          <div class="hours-inputs">
                            @if (!openingHours[day.key]?.hasBreak) {
                              <div class="time-range">
                                <input type="time" [value]="openingHours[day.key]?.open || '09:00'" (change)="updateOpeningHours(day.key, 'open', $event)">
                                <span>-</span>
                                <input type="time" [value]="openingHours[day.key]?.close || '22:00'" (change)="updateOpeningHours(day.key, 'close', $event)">
                              </div>
                            } @else {
                              <div class="split-shifts">
                                <div class="shift">
                                  <span class="shift-label">Morning</span>
                                  <input type="time" [value]="openingHours[day.key]?.morningOpen" (change)="updateOpeningHours(day.key, 'morningOpen', $event)">
                                  <span>-</span>
                                  <input type="time" [value]="openingHours[day.key]?.morningClose" (change)="updateOpeningHours(day.key, 'morningClose', $event)">
                                </div>
                                <div class="shift">
                                  <span class="shift-label">Evening</span>
                                  <input type="time" [value]="openingHours[day.key]?.eveningOpen" (change)="updateOpeningHours(day.key, 'eveningOpen', $event)">
                                  <span>-</span>
                                  <input type="time" [value]="openingHours[day.key]?.eveningClose" (change)="updateOpeningHours(day.key, 'eveningClose', $event)">
                                </div>
                              </div>
                            }
                            <div class="break-option">
                              <label class="checkbox-small">
                                <input type="checkbox" [checked]="openingHours[day.key]?.hasBreak" (change)="toggleBreak(day.key, $event)">
                                {{ 'SETTINGS.HAS_BREAK' | translate }}
                              </label>
                            </div>
                          </div>
                        } @else {
                          <span class="closed-badge">{{ 'SETTINGS.CLOSED' | translate }}</span>
                        }
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Payments Section -->
              @if (activeSection() === 'payments') {
                <div class="section">
                  <div class="section-header">
                    <h2>{{ 'SETTINGS.PAYMENT_SETTINGS' | translate }}</h2>
                    <p>{{ 'SETTINGS.PAYMENT_SETTINGS_SUBTITLE' | translate }}</p>
                  </div>
                  
                  <div class="form-group">
                    <label for="currency">{{ 'SETTINGS.CURRENCY' | translate }}</label>
                    <input type="text" id="currency" [(ngModel)]="formData.currency" name="currency" placeholder="€" class="input-short" />
                  </div>
                  
                  <div class="divider"></div>
                  
                  <h3>Stripe Integration</h3>
                  <div class="form-group">
                    <label>{{ 'SETTINGS.STRIPE_PUBLISHABLE_KEY' | translate }}</label>
                    <input type="text" [(ngModel)]="formData.stripe_publishable_key" name="stripe_publishable_key" class="code-input" />
                  </div>
                  <div class="form-group">
                    <label>{{ 'SETTINGS.STRIPE_SECRET_KEY' | translate }}</label>
                    <input type="password" [(ngModel)]="formData.stripe_secret_key" name="stripe_secret_key" placeholder="••••••••••••••••" />
                  </div>
                  
                  <div class="form-group checkbox-row">
                    <label class="switch">
                      <input type="checkbox" [(ngModel)]="formData.immediate_payment_required" name="immediate_payment_required">
                      <span class="slider round"></span>
                    </label>
                    <div>
                      <label class="check-label">{{ 'SETTINGS.IMMEDIATE_PAYMENT' | translate }}</label>
                      <p class="hint">{{ 'SETTINGS.IMMEDIATE_PAYMENT_HINT' | translate }}</p>
                    </div>
                  </div>
                </div>
              }

              <!-- Form Actions -->
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" (click)="cancel()">{{ 'SETTINGS.CANCEL' | translate }}</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? ('SETTINGS.SAVING' | translate) : ('SETTINGS.SAVE_CHANGES' | translate) }}
                </button>
              </div>
              
              @if (error()) { <div class="toast error">{{ error() }}</div> }
              @if (success()) { <div class="toast success">{{ success() }}</div> }
              
            </form>
          }
        }
      </div>
    </app-sidebar>
  `,
  styles: [`
    /* ==========================================
       MOBILE-FIRST RESPONSIVE SETTINGS STYLES
       ========================================== */
    
    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);

      h1 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        margin: 0;
      }
    }
    
    @media (min-width: 640px) {
      .page-header h1 {
        font-size: 1.5rem;
      }
    }

    /* ==========================================
       TABS - Mobile First (Horizontal Scroll)
       ========================================== */
    .tabs-container {
      margin-bottom: var(--space-4);
      margin-left: calc(-1 * var(--space-4));
      margin-right: calc(-1 * var(--space-4));
      padding: 0 var(--space-4);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      display: block;
      max-width: calc(100% + (2 * var(--space-4)));
    }

    .tabs {
      display: flex;
      gap: var(--space-2);
      padding-bottom: var(--space-3);
      width: max-content;
      min-width: 100%;
    }

    /* Mobile: Icon-only tabs with smaller padding */
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;
      min-height: 44px; /* Touch-friendly minimum */
      min-width: 44px;
      flex-shrink: 0;
    }

    /* Hide text on small screens */
    .tab span {
      display: none;
    }

    .tab:hover {
      color: var(--color-text);
      border-color: var(--color-primary);
    }

    .tab.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: white;
    }

    .tab-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* Tablet+: Show text labels */
    @media (min-width: 480px) {
      .tab {
        padding: var(--space-3) var(--space-4);
      }
      
      .tab span {
        display: inline;
      }
      
      .tab-icon {
        width: 18px;
        height: 18px;
      }
    }

    /* ==========================================
       SECTION STYLING
       ========================================== */
    .content {
      /* Full width container */
    }

    .section {
      margin-bottom: var(--space-5);
    }
    
    @media (min-width: 640px) {
      .section {
        margin-bottom: var(--space-6);
      }
    }

    .section-header {
      margin-bottom: var(--space-4);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-border);

      h2 {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0 0 var(--space-1) 0;
        color: var(--color-text);
      }

      p {
        color: var(--color-text-muted);
        font-size: 0.8125rem;
        margin: 0;
      }
    }
    
    @media (min-width: 640px) {
      .section-header {
        margin-bottom: var(--space-5);
        padding-bottom: var(--space-4);
      }
      
      .section-header h2 {
        font-size: 1.25rem;
      }
      
      .section-header p {
        font-size: 0.875rem;
      }
    }

    /* ==========================================
       FORM ELEMENTS - Mobile First
       ========================================== */
    .form-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    @media (min-width: 640px) {
      .form-row {
        flex-direction: row;
        gap: var(--space-4);
      }
      
      .form-row .form-group {
        flex: 1;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-3);

      label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text);
      }

      input, select, textarea {
        width: 100%;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        font-size: 1rem; /* 16px prevents zoom on iOS */
        background: var(--color-surface);
        color: var(--color-text);
        min-height: 44px; /* Touch-friendly */

        &:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-light);
        }
      }

      textarea {
        resize: vertical;
        min-height: 100px;
      }

      .input-short {
        max-width: 100%;
      }

      .code-input {
        font-family: monospace;
        font-size: 0.875rem;
      }
    }

    @media (min-width: 640px) {
      .form-group {
        margin-bottom: var(--space-4);
      }
      
      .form-group input,
      .form-group select,
      .form-group textarea {
        font-size: 0.9375rem;
      }
      
      .form-group .input-short {
        max-width: 120px;
      }
    }

    .hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      line-height: 1.4;
    }
    
    @media (min-width: 640px) {
      .hint {
        font-size: 0.8125rem;
      }
    }

    /* ==========================================
       LOGO UPLOAD - Mobile First
       ========================================== */
    .logo-upload-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      align-items: center;
    }
    
    @media (min-width: 480px) {
      .logo-upload-wrapper {
        flex-direction: row;
        align-items: flex-start;
      }
    }

    .current-logo {
      position: relative;
      width: 120px;
      height: 120px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-2);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-surface);
      flex-shrink: 0;

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .btn-icon-danger {
        position: absolute;
        top: -10px;
        right: -10px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--color-error);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        touch-action: manipulation;
      }
    }
    
    @media (min-width: 640px) {
      .current-logo {
        width: 100px;
        height: 100px;
      }
      
      .current-logo .btn-icon-danger {
        width: 24px;
        height: 24px;
        top: -8px;
        right: -8px;
        font-size: 12px;
      }
    }

    .upload-controls {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: center;
      text-align: center;
    }
    
    @media (min-width: 480px) {
      .upload-controls {
        align-items: flex-start;
        text-align: left;
      }
    }

    /* ==========================================
       OPENING HOURS - Mobile First
       ========================================== */
    .hours-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .day-row {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);

      &.closed {
        opacity: 0.7;
      }
    }
    
    @media (min-width: 640px) {
      .day-row {
        padding: var(--space-4);
      }
    }

    .day-header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-2);
    }

    .day-name {
      font-weight: 500;
      font-size: 0.9375rem;
    }

    /* Mobile: Stack hours below header */
    .hours-inputs {
      padding-left: 0;
      margin-top: var(--space-3);
    }
    
    @media (min-width: 480px) {
      .hours-inputs {
        padding-left: 52px; /* Switch width + gap */
        margin-top: 0;
      }
    }

    /* Mobile: Full-width time inputs */
    .time-range {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;

      input {
        flex: 1;
        min-width: 90px;
        max-width: 120px;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font-size: 1rem; /* Prevents iOS zoom */
        min-height: 40px;
        text-align: center;
      }
      
      span {
        color: var(--color-text-muted);
        font-weight: 500;
      }
    }
    
    @media (min-width: 480px) {
      .time-range input {
        flex: 0 0 auto;
        width: 110px;
        min-width: unset;
      }
    }

    /* Split Shifts - Mobile First (Stacked) */
    .split-shifts {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);

      .shift {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--color-bg);
        border-radius: var(--radius-sm);

        .shift-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .shift-times {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        input {
          flex: 1;
          min-width: 80px;
          max-width: 110px;
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: 1rem;
          min-height: 40px;
          text-align: center;
        }
      }
    }
    
    @media (min-width: 480px) {
      .split-shifts .shift {
        flex-direction: row;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2);
        background: transparent;
        
        .shift-label {
          width: 60px;
          text-transform: none;
          font-weight: 500;
        }
        
        .shift-times {
          flex-wrap: nowrap;
        }
        
        input {
          flex: 0 0 auto;
          width: 100px;
          min-width: unset;
        }
      }
    }

    .break-option {
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px dashed var(--color-border);
    }
    
    .checkbox-small {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.875rem;
      cursor: pointer;
      min-height: 44px; /* Touch target */
      
      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
    }

    .closed-badge {
      display: inline-block;
      padding: var(--space-2) var(--space-3);
      background: var(--color-bg);
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin-left: auto;
    }

    /* ==========================================
       SWITCHES - Touch-Friendly
       ========================================== */
    .switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 28px;
      flex-shrink: 0;
      touch-action: manipulation;

      input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #cbd5e1;
        transition: .3s;

        &:before {
          position: absolute;
          content: "";
          height: 22px;
          width: 22px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
      }

      input:checked + .slider {
        background-color: var(--color-primary);
      }

      input:checked + .slider:before {
        transform: translateX(20px);
      }

      .slider.round {
        border-radius: 34px;
      }

      .slider.round:before {
        border-radius: 50%;
      }
    }
    
    @media (min-width: 640px) {
      .switch {
        width: 40px;
        height: 24px;
      }
      
      .switch .slider:before {
        height: 18px;
        width: 18px;
      }
      
      .switch input:checked + .slider:before {
        transform: translateX(16px);
      }
    }

    .checkbox-row {
      flex-direction: column;
      gap: var(--space-3);
    }
    
    @media (min-width: 480px) {
      .checkbox-row {
        flex-direction: row;
        align-items: flex-start;
      }
    }

    .check-label {
      font-weight: 500;
    }

    /* ==========================================
       DIVIDERS & HEADINGS
       ========================================== */
    .divider {
      height: 1px;
      background: var(--color-border);
      margin: var(--space-4) 0;
    }
    
    @media (min-width: 640px) {
      .divider {
        margin: var(--space-5) 0;
      }
    }

    h3 {
      font-size: 0.9375rem;
      font-weight: 600;
      margin: 0 0 var(--space-3) 0;
    }
    
    @media (min-width: 640px) {
      h3 {
        font-size: 1rem;
        margin: 0 0 var(--space-4) 0;
      }
    }

    /* ==========================================
       BUTTONS - Touch-Friendly
       ========================================== */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-5);
      border: none;
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      min-height: 48px; /* Touch-friendly */
      touch-action: manipulation;
      width: 100%;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
    
    @media (min-width: 640px) {
      .btn {
        min-height: 44px;
        padding: var(--space-3) var(--space-4);
        font-size: 0.875rem;
        width: auto;
      }
    }

    .btn-primary {
      background: var(--color-primary);
      color: white;

      &:hover:not(:disabled) {
        background: var(--color-primary-hover);
      }
      
      &:active:not(:disabled) {
        transform: scale(0.98);
      }
    }

    .btn-secondary {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);

      &:hover:not(:disabled) {
        background: var(--color-bg);
      }
      
      &:active:not(:disabled) {
        transform: scale(0.98);
      }
    }

    /* ==========================================
       FORM ACTIONS - Mobile First
       ========================================== */
    .form-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border);
      margin-top: var(--space-4);
    }

    @media (min-width: 640px) {
      .form-actions {
        flex-direction: row;
        justify-content: flex-end;
        padding-top: var(--space-5);
        margin-top: var(--space-5);
      }
    }

    /* ==========================================
       LOADING STATE
       ========================================== */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-6);
      color: var(--color-text-muted);
    }
    
    @media (min-width: 640px) {
      .loading-state {
        padding: var(--space-8);
      }
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: var(--space-4);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ==========================================
       TOASTS - Mobile First
       ========================================== */
    .toast {
      position: fixed;
      bottom: env(safe-area-inset-bottom, 16px);
      right: var(--space-4);
      left: var(--space-4);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      color: white;
      font-weight: 500;
      animation: slideUp 0.3s ease;
      z-index: 100;
      text-align: center;

      &.success {
        background: var(--color-success);
      }

      &.error {
        background: var(--color-error);
      }
    }

    @media (min-width: 640px) {
      .toast {
        left: auto;
        max-width: 400px;
      }
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `]
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  settings = signal<TenantSettings | null>(null);
  activeSection = signal<'general' | 'contact' | 'hours' | 'payments' | 'translations' | 'users' | 'roles'>('general');
  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  logoPreview = signal<string | null>(null);
  logoFile: File | null = null;

  daysOfWeek = [
    { key: 'monday', label: 'SETTINGS.DAY_MONDAY' },
    { key: 'tuesday', label: 'SETTINGS.DAY_TUESDAY' },
    { key: 'wednesday', label: 'SETTINGS.DAY_WEDNESDAY' },
    { key: 'thursday', label: 'SETTINGS.DAY_THURSDAY' },
    { key: 'friday', label: 'SETTINGS.DAY_FRIDAY' },
    { key: 'saturday', label: 'SETTINGS.DAY_SATURDAY' },
    { key: 'sunday', label: 'SETTINGS.DAY_SUNDAY' }
  ];

  openingHours: Record<string, {
    open: string;
    close: string;
    closed: boolean;
    hasBreak?: boolean;
    morningOpen?: string;
    morningClose?: string;
    eveningOpen?: string;
    eveningClose?: string;
  }> = {};

  formData: Partial<TenantSettings> = {
    name: '',
    business_type: null,
    description: null,
    phone: null,
    whatsapp: null,
    email: null,
    address: null,
    website: null,
    opening_hours: null,
    currency: null,
    stripe_secret_key: null,
    stripe_publishable_key: null,
    immediate_payment_required: false,
  };

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.loading.set(true);
    this.api.getTenantSettings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.formData = {
          name: settings.name || '',
          business_type: settings.business_type || null,
          description: settings.description || null,
          phone: settings.phone || null,
          whatsapp: settings.whatsapp || null,
          email: settings.email || null,
          address: settings.address || null,
          website: settings.website || null,
          opening_hours: settings.opening_hours || null,
          currency: settings.currency || null,
          // Don't load masked secret key - user must enter new one to update
          stripe_secret_key: null,
          stripe_publishable_key: settings.stripe_publishable_key || null,
          immediate_payment_required: settings.immediate_payment_required || false,
        };
        this.parseOpeningHours(settings.opening_hours);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load settings. Please try again.');
        this.loading.set(false);
        console.error('Error loading settings:', err);
      }
    });
  }

  parseOpeningHours(jsonString: string | null | undefined) {
    // Initialize all days with default values
    this.daysOfWeek.forEach(day => {
      this.openingHours[day.key] = {
        open: '09:00',
        close: '22:00',
        closed: false,
        hasBreak: false,
        morningOpen: '09:00',
        morningClose: '14:00',
        eveningOpen: '17:00',
        eveningClose: '22:00'
      };
    });

    // Parse JSON if provided
    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        this.daysOfWeek.forEach(day => {
          if (parsed[day.key]) {
            const dayData = parsed[day.key];
            this.openingHours[day.key] = {
              open: dayData.open || '09:00',
              close: dayData.close || '22:00',
              closed: dayData.closed === true,
              hasBreak: dayData.hasBreak === true,
              morningOpen: dayData.morningOpen || dayData.open || '09:00',
              morningClose: dayData.morningClose || '14:00',
              eveningOpen: dayData.eveningOpen || '17:00',
              eveningClose: dayData.eveningClose || dayData.close || '22:00'
            };
          }
        });
      } catch (e) {
        console.error('Error parsing opening hours JSON:', e);
      }
    }
  }

  toggleDayClosed(dayKey: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.openingHours[dayKey].closed = !checked;
    this.serializeOpeningHours();
  }

  toggleBreak(dayKey: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.openingHours[dayKey].hasBreak = checked;
    // If enabling break, initialize with default values if not set
    if (checked) {
      if (!this.openingHours[dayKey].morningOpen) {
        this.openingHours[dayKey].morningOpen = this.openingHours[dayKey].open || '09:00';
      }
      if (!this.openingHours[dayKey].morningClose) {
        this.openingHours[dayKey].morningClose = '14:00';
      }
      if (!this.openingHours[dayKey].eveningOpen) {
        this.openingHours[dayKey].eveningOpen = '17:00';
      }
      if (!this.openingHours[dayKey].eveningClose) {
        this.openingHours[dayKey].eveningClose = this.openingHours[dayKey].close || '22:00';
      }
    }
    this.serializeOpeningHours();
  }

  updateOpeningHours(dayKey: string, field: 'open' | 'close' | 'morningOpen' | 'morningClose' | 'eveningOpen' | 'eveningClose', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    (this.openingHours[dayKey] as any)[field] = value;
    this.serializeOpeningHours();
  }

  serializeOpeningHours() {
    const serialized: Record<string, any> = {};
    this.daysOfWeek.forEach(day => {
      const dayData = this.openingHours[day.key];
      if (dayData.hasBreak) {
        serialized[day.key] = {
          closed: dayData.closed,
          hasBreak: true,
          morningOpen: dayData.morningOpen,
          morningClose: dayData.morningClose,
          eveningOpen: dayData.eveningOpen,
          eveningClose: dayData.eveningClose,
          // Keep open/close for backward compatibility
          open: dayData.morningOpen,
          close: dayData.eveningClose
        };
      } else {
        serialized[day.key] = {
          closed: dayData.closed,
          open: dayData.open,
          close: dayData.close
        };
      }
    });
    this.formData.opening_hours = JSON.stringify(serialized);
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) {
        this.error.set('File size must be less than 2MB');
        return;
      }
      this.logoFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      this.error.set(null);
    }
  }

  removeLogo() {
    this.logoFile = null;
    this.logoPreview.set(null);
    // Note: To actually remove from server, we'd need a DELETE endpoint
    // For now, just clear the preview
  }

  getLogoUrl(): string | null {
    const settings = this.settings();
    if (!settings?.logo_filename || !settings.id) return null;
    return this.api.getTenantLogoUrl(settings.logo_filename, settings.id);
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

  saveSettings() {
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);

    // First upload logo if selected
    if (this.logoFile) {
      this.api.uploadTenantLogo(this.logoFile).subscribe({
        next: (updatedSettings) => {
          this.settings.set(updatedSettings);
          this.logoFile = null;
          this.logoPreview.set(null);
          // Then update other settings
          this.updateSettings();
        },
        error: (err) => {
          this.error.set('Failed to upload logo. Please try again.');
          this.saving.set(false);
          console.error('Error uploading logo:', err);
        }
      });
    } else {
      this.updateSettings();
    }
  }

  private updateSettings() {
    // Ensure opening hours are serialized before saving
    this.serializeOpeningHours();

    // Prepare update data - only include stripe_secret_key if it was actually changed
    const updateData = { ...this.formData };

    // If stripe_secret_key is empty string, don't send it (backend will keep existing value)
    if (updateData.stripe_secret_key === '') {
      delete updateData.stripe_secret_key;
    }

    this.api.updateTenantSettings(updateData).subscribe({
      next: (updatedSettings) => {
        this.settings.set(updatedSettings);
        this.success.set('Settings saved successfully!');
        this.saving.set(false);
        setTimeout(() => this.success.set(null), 3000);
      },
      error: (err) => {
        this.error.set('Failed to save settings. Please try again.');
        this.saving.set(false);
        console.error('Error updating settings:', err);
      }
    });
  }

  cancel() {
    this.router.navigate(['/']);
  }
}
