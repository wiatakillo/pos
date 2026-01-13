/**
 * Inventory Module Routes
 */

import { Routes } from '@angular/router';

export const INVENTORY_ROUTES: Routes = [
    {
        path: '',
        redirectTo: 'items',
        pathMatch: 'full',
    },
    {
        path: 'items',
        loadComponent: () => import('./inventory-items/inventory-items.component').then((m) => m.InventoryItemsComponent),
    },
    {
        path: 'suppliers',
        loadComponent: () => import('./suppliers/suppliers.component').then((m) => m.SuppliersComponent),
    },
    {
        path: 'purchase-orders',
        loadComponent: () =>
            import('./purchase-orders/purchase-orders.component').then((m) => m.PurchaseOrdersComponent),
    },
    {
        path: 'purchase-orders/:id',
        loadComponent: () =>
            import('./purchase-orders/purchase-order-detail.component').then((m) => m.PurchaseOrderDetailComponent),
    },
    {
        path: 'stock',
        loadComponent: () => import('./stock-dashboard/stock-dashboard.component').then((m) => m.StockDashboardComponent),
    },
    {
        path: 'reports',
        loadComponent: () =>
            import('./reports/inventory-reports.component').then((m) => m.InventoryReportsComponent),
    },
];
