import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from '../services/api.service';

export const authGuard: CanActivateFn = (route, state) => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  // Check if we already have a user in memory
  if (apiService.getCurrentUser()) {
    return true;
  }

  // If not, verify with backend
  return apiService.checkAuth().pipe(
    map(user => {
      if (user) {
        return true;
      } else {
        return router.createUrlTree(['/login']);
      }
    }),
    catchError(() => {
      // Logic error or network error during check
      return of(router.createUrlTree(['/login']));
    })
  );
};
