import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modal-overlay" (click)="onCancel()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{ title | translate }}</h3>
          <button class="close-btn" (click)="onCancel()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p>{{ message | translate:messageParams }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="onCancel()">
            {{ cancelText | translate }}
          </button>
          <button class="btn" [ngClass]="confirmBtnClass" (click)="onConfirm()">
            {{ confirmText | translate }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: var(--space-4);
      animation: fadeIn 0.2s ease-out;
    }

    .modal {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 400px;
      box-shadow: var(--shadow-xl);
      overflow: hidden;
      animation: slideUp 0.2s ease-out;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text);
    }

    .close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-1);
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }

    .close-btn:hover {
      background: var(--color-bg);
      color: var(--color-text);
    }

    .modal-body {
      padding: var(--space-5);
    }

    .modal-body p {
      margin: 0;
      color: var(--color-text);
      line-height: 1.5;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      background: var(--color-bg);
      border-top: 1px solid var(--color-border);
    }

    .btn {
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }

    .btn-secondary {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }

    .btn-secondary:hover {
      background: var(--color-bg);
    }

    .btn-danger {
      background: var(--color-error);
      color: white;
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    .btn-primary {
      background: var(--color-primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--color-primary-hover);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(10) scale(0.95); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
  `]
})
export class ConfirmationModalComponent {
  @Input() title = 'COMMON.CONFIRM';
  @Input() message = 'COMMON.CONFIRM_MESSAGE';
  @Input() messageParams: any = {};
  @Input() confirmText = 'COMMON.YES';
  @Input() cancelText = 'COMMON.NO';
  @Input() confirmBtnClass = 'btn-primary';

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}
