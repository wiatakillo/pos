import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, TenantSettings } from '../services/api.service';
import { SidebarComponent } from '../shared/sidebar.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  template: `
    <app-sidebar>
        <div class="settings-container">
      <div class="page-header">
        <h1>Business Profile Settings</h1>
        <p class="subtitle">Manage your business information and branding</p>
      </div>

      @if (loading()) {
        <div class="loading">Loading settings...</div>
      } @else {
        <form (ngSubmit)="saveSettings()" class="settings-form">
          <!-- Logo Upload -->
          <div class="form-section">
            <h2>Logo</h2>
            <div class="logo-upload">
              @if (logoPreview() || settings()?.logo_filename) {
                <div class="logo-preview">
                  <div class="logo-image-wrapper">
                    <img [src]="logoPreview() || getLogoUrl()" alt="Business Logo" />
                    @if (settings()?.logo_size_formatted && !logoPreview()) {
                      <div class="file-size">{{ settings()!.logo_size_formatted }}</div>
                    } @else if (logoFile) {
                      <div class="file-size">{{ formatFileSize(logoFile.size) }}</div>
                    }
                  </div>
                  <button type="button" class="remove-logo" (click)="removeLogo()">Remove</button>
                </div>
              }
              <div class="upload-area">
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/*"
                  (change)="onLogoSelected($event)"
                  style="display: none"
                />
                <label for="logo-upload" class="upload-button">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17,8 12,3 7,8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload Logo
                </label>
                <p class="upload-hint">Recommended: Square image, max 2MB (JPG, PNG, WebP)</p>
              </div>
            </div>
          </div>

          <!-- Basic Information -->
          <div class="form-section">
            <h2>Basic Information</h2>
            <div class="form-group">
              <label for="name">Business Name *</label>
              <input
                type="text"
                id="name"
                [(ngModel)]="formData.name"
                name="name"
                required
                placeholder="Your Business Name"
              />
            </div>

            <div class="form-group">
              <label for="business_type">Business Type</label>
              <select id="business_type" [(ngModel)]="formData.business_type" name="business_type">
                <option [value]="null">Select type...</option>
                <option value="restaurant">Restaurant</option>
                <option value="bar">Bar</option>
                <option value="cafe">Café</option>
                <option value="retail">Retail Store</option>
                <option value="service">Service Business</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea
                id="description"
                [(ngModel)]="formData.description"
                name="description"
                rows="4"
                placeholder="A brief description of your business..."
              ></textarea>
            </div>
          </div>

          <!-- Contact Information -->
          <div class="form-section">
            <h2>Contact Information</h2>
            <div class="form-group">
              <label for="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                [(ngModel)]="formData.phone"
                name="phone"
                placeholder="+1 234 567 8900"
              />
            </div>

            <div class="form-group">
              <label for="whatsapp">WhatsApp Number</label>
              <input
                type="tel"
                id="whatsapp"
                [(ngModel)]="formData.whatsapp"
                name="whatsapp"
                placeholder="+1 234 567 8900"
              />
            </div>

            <div class="form-group">
              <label for="email">Email</label>
              <input
                type="email"
                id="email"
                [(ngModel)]="formData.email"
                name="email"
                placeholder="contact@yourbusiness.com"
              />
            </div>

            <div class="form-group">
              <label for="address">Address</label>
              <input
                type="text"
                id="address"
                [(ngModel)]="formData.address"
                name="address"
                placeholder="123 Main St, City, State 12345"
              />
            </div>

            <div class="form-group">
              <label for="website">Website</label>
              <input
                type="url"
                id="website"
                [(ngModel)]="formData.website"
                name="website"
                placeholder="https://www.yourbusiness.com"
              />
            </div>
          </div>

          <!-- Opening Hours -->
          <div class="form-section">
            <h2>Opening Hours</h2>
            <p class="section-hint">Set your business hours for each day of the week. You can add a break between shifts.</p>
            <div class="opening-hours-container">
              @for (day of daysOfWeek; track day.key) {
                <div class="opening-hours-row">
                  <div class="day-label">
                    <label class="checkbox-label">
                      <input
                        type="checkbox"
                        [checked]="!openingHours[day.key]?.closed"
                        (change)="toggleDayClosed(day.key, $event)"
                      />
                      <span>{{ day.label }}</span>
                    </label>
                  </div>
                  @if (!openingHours[day.key]?.closed) {
                    <div class="time-inputs-wrapper">
                      @if (!openingHours[day.key]?.hasBreak) {
                        <div class="time-inputs">
                          <div class="time-group">
                            <label [for]="'open-' + day.key">Open</label>
                            <input
                              type="time"
                              [id]="'open-' + day.key"
                              [value]="openingHours[day.key]?.open || '09:00'"
                              (change)="updateOpeningHours(day.key, 'open', $event)"
                            />
                          </div>
                          <span class="time-separator">to</span>
                          <div class="time-group">
                            <label [for]="'close-' + day.key">Close</label>
                            <input
                              type="time"
                              [id]="'close-' + day.key"
                              [value]="openingHours[day.key]?.close || '22:00'"
                              (change)="updateOpeningHours(day.key, 'close', $event)"
                            />
                          </div>
                        </div>
                      }
                      <div class="break-toggle">
                        <label class="checkbox-label small">
                          <input
                            type="checkbox"
                            [checked]="openingHours[day.key]?.hasBreak || false"
                            (change)="toggleBreak(day.key, $event)"
                          />
                          <span>Has break</span>
                        </label>
                      </div>
                      @if (openingHours[day.key]?.hasBreak) {
                        <div class="break-shifts">
                          <div class="shift-group">
                            <div class="shift-label">Morning</div>
                            <div class="time-inputs">
                              <div class="time-group">
                                <label [for]="'morning-open-' + day.key">Open</label>
                                <input
                                  type="time"
                                  [id]="'morning-open-' + day.key"
                                  [value]="openingHours[day.key]?.morningOpen || '09:00'"
                                  (change)="updateOpeningHours(day.key, 'morningOpen', $event)"
                                />
                              </div>
                              <span class="time-separator">to</span>
                              <div class="time-group">
                                <label [for]="'morning-close-' + day.key">Close</label>
                                <input
                                  type="time"
                                  [id]="'morning-close-' + day.key"
                                  [value]="openingHours[day.key]?.morningClose || '14:00'"
                                  (change)="updateOpeningHours(day.key, 'morningClose', $event)"
                                />
                              </div>
                            </div>
                          </div>
                          <div class="shift-group">
                            <div class="shift-label">Evening</div>
                            <div class="time-inputs">
                              <div class="time-group">
                                <label [for]="'evening-open-' + day.key">Open</label>
                                <input
                                  type="time"
                                  [id]="'evening-open-' + day.key"
                                  [value]="openingHours[day.key]?.eveningOpen || '17:00'"
                                  (change)="updateOpeningHours(day.key, 'eveningOpen', $event)"
                                />
                              </div>
                              <span class="time-separator">to</span>
                              <div class="time-group">
                                <label [for]="'evening-close-' + day.key">Close</label>
                                <input
                                  type="time"
                                  [id]="'evening-close-' + day.key"
                                  [value]="openingHours[day.key]?.eveningClose || '22:00'"
                                  (change)="updateOpeningHours(day.key, 'eveningClose', $event)"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="closed-indicator">Closed</div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Payment Settings -->
          <div class="form-section">
            <div class="section-header-with-link">
              <h2>Payment Settings</h2>
              <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer" class="external-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15,3 21,3 21,9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Stripe Dashboard
              </a>
            </div>
            <div class="form-group">
              <label for="currency">Currency</label>
              <input
                type="text"
                id="currency"
                [(ngModel)]="formData.currency"
                name="currency"
                placeholder="€, $, £, ¥, etc."
                maxlength="10"
              />
              <p class="field-hint">Enter the currency symbol used for pricing (e.g., €, $, £, ¥)</p>
            </div>
            <div class="form-group">
              <label for="stripe_publishable_key">Stripe Publishable Key</label>
              <input
                type="text"
                id="stripe_publishable_key"
                [(ngModel)]="formData.stripe_publishable_key"
                name="stripe_publishable_key"
                placeholder="pk_test_..."
              />
              <p class="field-hint">Your Stripe publishable key (starts with pk_test_ or pk_live_)</p>
            </div>
            <div class="form-group">
              <label for="stripe_secret_key">Stripe Secret Key</label>
              <input
                type="password"
                id="stripe_secret_key"
                [(ngModel)]="formData.stripe_secret_key"
                name="stripe_secret_key"
                placeholder="sk_test_... or leave blank to keep current"
              />
              <p class="field-hint">Your Stripe secret key (starts with sk_test_ or sk_live_). Leave blank to keep current value.</p>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  id="immediate_payment_required"
                  [(ngModel)]="formData.immediate_payment_required"
                  name="immediate_payment_required"
                />
                <span>Immediate payment required</span>
              </label>
              <p class="field-hint">When enabled, customers must pay to place an order.</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <button type="button" class="btn-secondary" (click)="cancel()">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>

          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }
          @if (success()) {
            <div class="success-message">{{ success() }}</div>
          }
        </form>
      }
        </div>
    </app-sidebar>
  `,
  styles: [`
    .settings-container {
      max-width: 800px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: var(--space-6);

      h1 {
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      .subtitle {
        color: var(--color-text-muted);
        font-size: 0.9375rem;
      }
    }

    .loading {
      text-align: center;
      padding: var(--space-8);
      color: var(--color-text-muted);
    }

    .settings-form {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-6);
    }

    .form-section {
      margin-bottom: var(--space-8);

      &:last-of-type {
        margin-bottom: var(--space-6);
      }

      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        margin-bottom: var(--space-4);
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--color-border);
      }

      .section-header-with-link {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-4);
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--color-border);

        h2 {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }
      }

      .external-link {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 0.875rem;
        color: var(--color-primary);
        text-decoration: none;
        font-weight: 500;
        transition: color 0.15s ease;

        &:hover {
          color: var(--color-primary-hover);
        }

        svg {
          flex-shrink: 0;
        }
      }

      .section-hint {
        font-size: 0.875rem;
        color: var(--color-text-muted);
        margin-bottom: var(--space-3);
      }
    }

    .form-group {
      margin-bottom: var(--space-4);

      label {
        display: block;
        font-size: 0.9375rem;
        font-weight: 500;
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      input[type="text"],
      input[type="tel"],
      input[type="email"],
      input[type="url"],
      select,
      textarea {
        width: 100%;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        font-size: 0.9375rem;
        color: var(--color-text);
        background: var(--color-bg);
        transition: border-color 0.15s ease;

        &:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        &::placeholder {
          color: var(--color-text-muted);
        }
      }

      textarea {
        font-family: inherit;
        resize: vertical;
      }

      .checkbox-label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        cursor: pointer;
        font-weight: 500;

        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: var(--color-primary);
        }
      }

      .field-hint {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        margin-top: var(--space-1);
        margin-left: calc(18px + var(--space-2));
      }
    }

    .logo-upload {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .logo-preview {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4);
      background: var(--color-bg);
    }

    .logo-image-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
    }

    .logo-image-wrapper img {
      max-width: 200px;
      max-height: 200px;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: var(--radius-md);
      background: white;
      padding: var(--space-2);
      border: 1px solid var(--color-border);
    }

    .file-size {
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      text-align: center;
      margin-top: var(--space-1);

      .remove-logo {
        padding: var(--space-2) var(--space-4);
        background: var(--color-error);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.875rem;
        transition: opacity 0.15s ease;

        &:hover {
          opacity: 0.9;
        }
      }
    }

    .upload-area {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .upload-button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 0.9375rem;
      font-weight: 500;
      transition: opacity 0.15s ease;
      width: fit-content;

      &:hover {
        opacity: 0.9;
      }
    }

    .upload-hint {
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }

    .form-actions {
      display: flex;
      gap: var(--space-3);
      justify-content: flex-end;
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border);
    }

    .btn-primary,
    .btn-secondary {
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border: none;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background: var(--color-primary);
      color: white;

      &:hover:not(:disabled) {
        opacity: 0.9;
      }
    }

    .btn-secondary {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);

      &:hover:not(:disabled) {
        background: var(--color-bg);
      }
    }

    .error-message {
      margin-top: var(--space-4);
      padding: var(--space-3);
      background: #fee;
      color: #c33;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
    }

    .success-message {
      margin-top: var(--space-4);
      padding: var(--space-3);
      background: #efe;
      color: #3c3;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
    }

    .opening-hours-container {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .opening-hours-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-6);
      padding: var(--space-5);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      transition: all 0.2s ease;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);

      &:hover {
        background: var(--color-surface);
        border-color: var(--color-primary);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
      }
    }

    .day-label {
      min-width: 140px;
      flex-shrink: 0;
      padding-top: var(--space-3);
      padding-left: var(--space-2);

      .checkbox-label {
        margin: 0;
        font-weight: 600;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: var(--space-3);

        input[type="checkbox"] {
          margin: 0;
          flex-shrink: 0;
        }

        span {
          flex: 1;
        }
      }
    }

    .time-inputs-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      flex: 1;
    }

    .time-inputs {
      display: flex;
      align-items: flex-end;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .break-toggle {
      margin-top: var(--space-1);
      padding: var(--space-2) 0;

      .checkbox-label.small {
        font-size: 0.9375rem;
        font-weight: 500;
        color: var(--color-text);

        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          margin-right: var(--space-2);
        }
      }
    }

    .break-shifts {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      margin-top: var(--space-3);
      padding: var(--space-5);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
    }

    .shift-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .shift-label {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--space-1);
      text-transform: capitalize;
      letter-spacing: 0.01em;
    }

    .time-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 160px;

      label {
        font-size: 0.875rem;
        color: var(--color-text-muted);
        margin: 0;
        font-weight: 500;
        letter-spacing: 0.01em;
      }

      input[type="time"] {
        padding: var(--space-3) var(--space-4);
        border: 2px solid var(--color-border);
        border-radius: var(--radius-md);
        font-size: 1rem;
        color: var(--color-text);
        background: white;
        transition: all 0.2s ease;
        width: 180px;
        min-height: 44px;
        font-weight: 500;
        cursor: pointer;

        &:hover {
          border-color: var(--color-primary);
          background: var(--color-bg);
        }

        &:focus {
          outline: none;
          border-color: var(--color-primary);
          background: white;
          box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb, 59, 130, 246), 0.1);
        }

        &::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 0.6;
          padding: var(--space-2);
          margin-left: var(--space-2);

          &:hover {
            opacity: 1;
          }
        }
      }
    }

    .time-separator {
      color: var(--color-text-muted);
      font-size: 0.9375rem;
      font-weight: 500;
      margin-bottom: var(--space-5);
      padding: 0 var(--space-1);
      align-self: flex-end;
      user-select: none;
    }

    .closed-indicator {
      color: var(--color-text-muted);
      font-style: italic;
      padding: var(--space-3) 0;
      flex: 1;
      font-size: 0.9375rem;
    }
  `]
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  settings = signal<TenantSettings | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  logoPreview = signal<string | null>(null);
  logoFile: File | null = null;

  daysOfWeek = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
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
