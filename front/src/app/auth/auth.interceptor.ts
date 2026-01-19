import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, switchMap, Observable } from 'rxjs';
import { ApiService } from '../services/api.service';

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  // Ensure cookies are sent with requests
  req = req.clone({
    withCredentials: true
  });

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized errors
      if (error.status === 401) {
        // Don't try to refresh if the failing request is the refresh or login endpoint
        const isAuthEndpoint = req.url.includes('/refresh') ||
          req.url.includes('/token') ||
          req.url.includes('/logout');

        if (!isAuthEndpoint && !isRefreshing) {
          isRefreshing = true;

          // Attempt to refresh the token
          return apiService.refreshToken().pipe(
            switchMap(() => {
              isRefreshing = false;
              // Retry the original request with fresh token
              return next(req.clone({ withCredentials: true }));
            }),
            catchError((refreshError) => {
              isRefreshing = false;
              // Refresh failed - logout and redirect to login
              apiService.logout();
              if (!router.url.startsWith('/login')) {
                router.navigate(['/login']);
              }
              return throwError(() => refreshError);
            })
          );
        } else {
          // Auth endpoint failed or already refreshing - logout
          apiService.logout();
          if (!router.url.startsWith('/login')) {
            router.navigate(['/login']);
          }
        }
      }
      return throwError(() => error);
    })
  );
};
