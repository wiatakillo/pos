import { Directive, Input, TemplateRef, ViewContainerRef, inject, OnDestroy } from '@angular/core';
import { ApiService, User } from '../services/api.service';
import { Subscription } from 'rxjs';

@Directive({
  selector: '[appHasPermission]',
  standalone: true
})
export class HasPermissionDirective implements OnDestroy {
  private api = inject(ApiService);
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);

  private permissions: string[] = [];
  private subscription: Subscription;

  constructor() {
    this.subscription = this.api.user$.subscribe((user) => {
      this.updateView(user);
    });
  }

  @Input() set appHasPermission(permission: string | string[]) {
    this.permissions = Array.isArray(permission) ? permission : [permission];
    this.updateView(this.api.getCurrentUser());
  }

  private updateView(user: User | null) {
    const hasPermission =
      user?.permissions &&
      this.permissions.some((p) => user.permissions!.includes(p));

    if (hasPermission) {
      if (this.viewContainer.length === 0) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    } else {
      this.viewContainer.clear();
    }
  }

  ngOnDestroy() {
      this.subscription.unsubscribe();
  }
}
