import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from '../services/api.service';

export const authGuard: CanActivateFn = (route, state) => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  const token = apiService.getToken();
  if (!token) {
    return router.createUrlTree(['/login']);
  }

  // Validate token format and expiration
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp;
    if (exp && exp * 1000 < Date.now()) {
      // Token expired
      apiService.logout();
      return router.createUrlTree(['/login']);
    }
    return true;
  } catch (e) {
    // Invalid token format
    apiService.logout();
    return router.createUrlTree(['/login']);
  }
};
