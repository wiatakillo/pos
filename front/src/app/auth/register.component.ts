import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <h1>Create account</h1>
          <p>Set up your organization</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="tenant">Organization Name</label>
            <input 
              id="tenant" 
              type="text" 
              formControlName="tenant_name" 
              placeholder="Acme Restaurant"
            >
          </div>
          
          <div class="form-group">
            <label for="name">Full Name</label>
            <input 
              id="name" 
              type="text" 
              formControlName="full_name" 
              placeholder="John Doe"
            >
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input 
              id="email" 
              type="email" 
              formControlName="email" 
              placeholder="you@example.com"
              autocomplete="email"
            >
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input 
              id="password" 
              type="password" 
              formControlName="password" 
              placeholder="At least 6 characters"
              autocomplete="new-password"
            >
          </div>

          @if (error()) {
            <div class="error-banner">{{ error() }}</div>
          }

          @if (success()) {
            <div class="success-banner">{{ success() }}</div>
          }

          <button type="submit" class="btn-submit" [disabled]="form.invalid || loading()">
            {{ loading() ? 'Creating account...' : 'Create account' }}
          </button>
        </form>

        <div class="auth-footer">
          <span>Already have an account?</span>
          <a routerLink="/login">Sign in</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-5);
      background: var(--color-bg);
    }

    .auth-card {
      width: 100%;
      max-width: 420px;
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: var(--space-8);
    }

    .auth-header {
      text-align: center;
      margin-bottom: var(--space-6);

      h1 {
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      p {
        color: var(--color-text-muted);
        font-size: 0.9375rem;
      }
    }

    .error-banner {
      background: rgba(220, 38, 38, 0.1);
      color: var(--color-error);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      margin-bottom: var(--space-4);
    }

    .success-banner {
      background: var(--color-success-light);
      color: var(--color-success);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      margin-bottom: var(--space-4);
    }

    .btn-submit {
      width: 100%;
      padding: var(--space-4);
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover:not(:disabled) {
        background: var(--color-primary-hover);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .auth-footer {
      margin-top: var(--space-5);
      text-align: center;
      font-size: 0.9375rem;
      color: var(--color-text-muted);

      a {
        color: var(--color-primary);
        font-weight: 500;
        margin-left: var(--space-2);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  `]
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);

  error = signal<string>('');
  success = signal<string>('');
  loading = signal(false);

  form = this.fb.group({
    tenant_name: ['', Validators.required],
    full_name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  onSubmit() {
    if (this.form.valid) {
      this.error.set('');
      this.success.set('');
      this.loading.set(true);

      this.api.register(this.form.value).subscribe({
        next: () => {
          this.success.set('Account created! Redirecting...');
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 1500);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.detail || 'Registration failed');
        }
      });
    }
  }
}
