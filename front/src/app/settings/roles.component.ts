import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-roles-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="roles-container">
      <div class="header">
        <h3>Roles & Permissions</h3>
        <button class="btn btn-primary" (click)="openCreateModal()">Create Role</button>
      </div>

      <div class="roles-list">
        @for (role of roles(); track role.id) {
          <div class="role-card">
            <div class="role-header">
              <span class="role-name">{{ role.name }}</span>
              @if (role.is_default) {
                <span class="badge default">Default</span>
              }
            </div>
            <p class="role-desc">{{ role.description }}</p>
            <div class="role-actions">
              <button class="btn btn-sm btn-secondary" (click)="editRole(role)" [disabled]="role.is_default">Edit</button>
              @if (!role.is_default) {
                <button class="btn btn-sm btn-danger" (click)="deleteRole(role)">Delete</button>
              }
            </div>
          </div>
        }
      </div>

      <!-- Modal -->
      @if (showModal()) {
        <div class="modal-backdrop">
          <div class="modal">
            <div class="modal-header">
              <h3>{{ editingRole() ? 'Edit Role' : 'Create Role' }}</h3>
              <button class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Name</label>
                <input type="text" [(ngModel)]="formData.name" placeholder="e.g. Supervisor">
              </div>
              <div class="form-group">
                <label>Description</label>
                <input type="text" [(ngModel)]="formData.description" placeholder="Role description">
              </div>

              <div class="permissions-section">
                <h4>Permissions</h4>
                <div class="permissions-grid">
                  @for (perm of availablePermissions(); track perm) {
                    <label class="permission-item">
                      <input type="checkbox"
                             [checked]="formData.permissions.includes(perm)"
                             (change)="togglePermission(perm)">
                      <span>{{ perm }}</span>
                    </label>
                  }
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button class="btn btn-primary" (click)="saveRole()">Save</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .roles-container { padding: 1rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .roles-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
    .role-card { border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; background: white; }
    .role-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-weight: 600; }
    .role-desc { color: #64748b; font-size: 0.875rem; margin-bottom: 1rem; }
    .role-actions { display: flex; gap: 0.5rem; }
    .badge.default { background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; }

    .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 0.5rem; width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; }
    .modal-header { padding: 1rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .modal-body { padding: 1rem; overflow-y: auto; }
    .modal-footer { padding: 1rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 0.5rem; }

    .permissions-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-top: 0.5rem; }
    .permission-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer; }

    .btn { padding: 0.5rem 1rem; border-radius: 0.375rem; border: none; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-secondary { background: #f1f5f9; color: #0f172a; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
    .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }

    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.25rem; font-weight: 500; font-size: 0.875rem; }
    .form-group input { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; }
  `]
})
export class RolesComponent implements OnInit {
  private api = inject(ApiService);

  roles = signal<any[]>([]);
  availablePermissions = signal<string[]>([]);
  showModal = signal(false);
  editingRole = signal<any>(null);

  formData = {
    name: '',
    description: '',
    permissions: [] as string[]
  };

  ngOnInit() {
    this.loadRoles();
    this.api.getPermissions().subscribe(perms => this.availablePermissions.set(perms));
  }

  loadRoles() {
    this.api.getRoles().subscribe(roles => this.roles.set(roles));
  }

  openCreateModal() {
    this.editingRole.set(null);
    this.formData = { name: '', description: '', permissions: [] };
    this.showModal.set(true);
  }

  editRole(role: any) {
    this.editingRole.set(role);
    this.formData = {
      name: role.name,
      description: role.description,
      permissions: [...role.permissions]
    };
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  togglePermission(perm: string) {
    const index = this.formData.permissions.indexOf(perm);
    if (index === -1) {
      this.formData.permissions.push(perm);
    } else {
      this.formData.permissions.splice(index, 1);
    }
  }

  saveRole() {
    if (this.editingRole()) {
      this.api.updateRole(this.editingRole().id, this.formData).subscribe(() => {
        this.loadRoles();
        this.closeModal();
      });
    } else {
      this.api.createRole(this.formData).subscribe(() => {
        this.loadRoles();
        this.closeModal();
      });
    }
  }

  deleteRole(role: any) {
    if (confirm('Are you sure you want to delete this role?')) {
      this.api.deleteRole(role.id).subscribe(() => this.loadRoles());
    }
  }
}
