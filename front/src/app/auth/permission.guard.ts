import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { map } from 'rxjs';

export const permissionGuard = (requiredPermission: string): CanActivateFn => {
  return () => {
    const api = inject(ApiService);
    const router = inject(Router);

    return api.user$.pipe(
      map(user => {
        if (!user) {
            return router.createUrlTree(['/login']);
        }
        if (user.permissions?.includes(requiredPermission)) {
            return true;
        }
        // Redirect to dashboard if authorized but no permission
        return router.createUrlTree(['/']);
      })
    );
  };
};
