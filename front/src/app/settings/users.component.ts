import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, User } from '../services/api.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-users-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="users-container">
      <div class="header">
        <h3>Users</h3>
        <!-- TODO: Invite user feature <button class="btn btn-primary">Invite User</button> -->
      </div>

      <div class="users-list">
        <table class="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Full Name</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (user of users(); track user.id) {
              <tr>
                <td>{{ user.email }}</td>
                <td>{{ user.full_name || '-' }}</td>
                <td>
                  @if (user.role_name) {
                    <span class="badge role">{{ user.role_name }}</span>
                  } @else {
                    <span class="text-muted">No Role</span>
                  }
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" (click)="editUser(user)">Edit</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      @if (showModal()) {
        <div class="modal-backdrop">
          <div class="modal">
            <div class="modal-header">
              <h3>Edit User</h3>
              <button class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Full Name</label>
                <input type="text" [(ngModel)]="formData.full_name" placeholder="John Doe">
              </div>

              <div class="form-group">
                <label>Role</label>
                <select [(ngModel)]="formData.role_id">
                  <option [value]="null">Select Role</option>
                  @for (role of roles(); track role.id) {
                    <option [value]="role.id">{{ role.name }}</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label>Change Password (Optional)</label>
                <input type="password" [(ngModel)]="formData.password" placeholder="New password">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button class="btn btn-primary" (click)="saveUser()">Save</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .users-container { padding: 1rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }

    .users-table { width: 100%; border-collapse: collapse; }
    .users-table th, .users-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .users-table th { font-weight: 600; color: #475569; }

    .badge.role { background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
    .text-muted { color: #94a3b8; font-style: italic; }

    .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 0.5rem; width: 100%; max-width: 500px; display: flex; flex-direction: column; }
    .modal-header { padding: 1rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .modal-body { padding: 1rem; }
    .modal-footer { padding: 1rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 0.5rem; }

    .btn { padding: 0.5rem 1rem; border-radius: 0.375rem; border: none; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-secondary { background: #f1f5f9; color: #0f172a; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
    .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }

    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.25rem; font-weight: 500; font-size: 0.875rem; }
    .form-group input, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; }
  `]
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);

  users = signal<User[]>([]);
  roles = signal<any[]>([]);
  showModal = signal(false);
  editingUser = signal<User | null>(null);

  formData = {
    full_name: '',
    role_id: null as number | null,
    password: ''
  };

  ngOnInit() {
    this.loadUsers();
    this.loadRoles();
  }

  loadUsers() {
    this.api.getUsers().subscribe(users => this.users.set(users));
  }

  loadRoles() {
    this.api.getRoles().subscribe(roles => this.roles.set(roles));
  }

  editUser(user: User) {
    this.editingUser.set(user);
    this.formData = {
      full_name: user.full_name || '',
      role_id: user.role_id || null,
      password: ''
    };
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveUser() {
    if (this.editingUser()) {
      const updateData: any = {
        full_name: this.formData.full_name,
        role_id: this.formData.role_id
      };
      if (this.formData.password) {
        updateData.password = this.formData.password;
      }

      this.api.updateUser(this.editingUser()!.id, updateData).subscribe(() => {
        this.loadUsers();
        this.closeModal();
      });
    }
  }
}
