import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  // Public routes
  { path: 'login', loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./auth/register.component').then(m => m.RegisterComponent) },
  { path: 'menu/:token', loadComponent: () => import('./menu/menu.component').then(m => m.MenuComponent) },

  // Protected routes
  { path: '', canActivate: [authGuard], loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'products', canActivate: [authGuard], loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent) },
  { path: 'tables', canActivate: [authGuard], loadComponent: () => import('./tables/tables.component').then(m => m.TablesComponent) },
  { path: 'orders', canActivate: [authGuard], loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent) },
  { path: 'settings', canActivate: [authGuard], loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent) },

  { path: '**', redirectTo: '' }
];
