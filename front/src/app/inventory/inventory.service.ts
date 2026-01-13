/**
 * Inventory Service
 *
 * API service for inventory management operations.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
    InventoryItem,
    InventoryItemCreate,
    InventoryItemUpdate,
    StockAdjustment,
    Supplier,
    SupplierCreate,
    SupplierUpdate,
    PurchaseOrder,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderStatus,
    ReceiveGoodsInput,
    ProductRecipe,
    ProductRecipeUpdate,
    ProductCost,
    StockLevel,
    LowStockItem,
    InventoryValuation,
    InventoryTransaction,
    InventoryCategory,
    TransactionType,
    UnitsResponse,
} from './inventory.types';

@Injectable({
    providedIn: 'root',
})
export class InventoryService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/inventory`;

    // ============ INVENTORY ITEMS ============

    getItems(options?: {
        category?: InventoryCategory;
        activeOnly?: boolean;
        search?: string;
    }): Observable<InventoryItem[]> {
        let params = new HttpParams();
        if (options?.category) params = params.set('category', options.category);
        if (options?.activeOnly !== undefined) params = params.set('active_only', String(options.activeOnly));
        if (options?.search) params = params.set('search', options.search);
        return this.http.get<InventoryItem[]>(`${this.apiUrl}/items`, { params });
    }

    getItem(id: number): Observable<InventoryItem> {
        return this.http.get<InventoryItem>(`${this.apiUrl}/items/${id}`);
    }

    createItem(item: InventoryItemCreate): Observable<InventoryItem> {
        return this.http.post<InventoryItem>(`${this.apiUrl}/items`, item);
    }

    updateItem(id: number, updates: InventoryItemUpdate): Observable<InventoryItem> {
        return this.http.put<InventoryItem>(`${this.apiUrl}/items/${id}`, updates);
    }

    deleteItem(id: number): Observable<{ status: string; id: number }> {
        return this.http.delete<{ status: string; id: number }>(`${this.apiUrl}/items/${id}`);
    }

    adjustStock(
        id: number,
        adjustment: StockAdjustment
    ): Observable<{ status: string; item_id: number; new_quantity: number; unit: string; transaction_id: number }> {
        return this.http.post<any>(`${this.apiUrl}/items/${id}/adjust`, adjustment);
    }

    // ============ SUPPLIERS ============

    getSuppliers(activeOnly = true): Observable<Supplier[]> {
        const params = new HttpParams().set('active_only', String(activeOnly));
        return this.http.get<Supplier[]>(`${this.apiUrl}/suppliers`, { params });
    }

    getSupplier(id: number): Observable<Supplier> {
        return this.http.get<Supplier>(`${this.apiUrl}/suppliers/${id}`);
    }

    createSupplier(supplier: SupplierCreate): Observable<Supplier> {
        return this.http.post<Supplier>(`${this.apiUrl}/suppliers`, supplier);
    }

    updateSupplier(id: number, updates: SupplierUpdate): Observable<Supplier> {
        return this.http.put<Supplier>(`${this.apiUrl}/suppliers/${id}`, updates);
    }

    deleteSupplier(id: number): Observable<{ status: string; id: number }> {
        return this.http.delete<{ status: string; id: number }>(`${this.apiUrl}/suppliers/${id}`);
    }

    // ============ PURCHASE ORDERS ============

    getPurchaseOrders(options?: {
        status?: PurchaseOrderStatus;
        supplierId?: number;
        limit?: number;
        offset?: number;
    }): Observable<PurchaseOrder[]> {
        let params = new HttpParams();
        if (options?.status) params = params.set('status', options.status);
        if (options?.supplierId) params = params.set('supplier_id', String(options.supplierId));
        if (options?.limit) params = params.set('limit', String(options.limit));
        if (options?.offset) params = params.set('offset', String(options.offset));
        return this.http.get<PurchaseOrder[]>(`${this.apiUrl}/purchase-orders`, { params });
    }

    getPurchaseOrder(id: number): Observable<PurchaseOrder> {
        return this.http.get<PurchaseOrder>(`${this.apiUrl}/purchase-orders/${id}`);
    }

    createPurchaseOrder(
        po: PurchaseOrderCreate
    ): Observable<{ id: number; order_number: string; status: string; total_cents: number }> {
        return this.http.post<any>(`${this.apiUrl}/purchase-orders`, po);
    }

    updatePurchaseOrder(id: number, updates: PurchaseOrderUpdate): Observable<{ status: string; id: number }> {
        return this.http.put<{ status: string; id: number }>(`${this.apiUrl}/purchase-orders/${id}`, updates);
    }

    updatePurchaseOrderStatus(
        id: number,
        newStatus: PurchaseOrderStatus
    ): Observable<{ status: string; new_status: string }> {
        const params = new HttpParams().set('new_status', newStatus);
        return this.http.put<{ status: string; new_status: string }>(
            `${this.apiUrl}/purchase-orders/${id}/status`,
            null,
            { params }
        );
    }

    receivePurchaseOrder(
        id: number,
        input: ReceiveGoodsInput
    ): Observable<{ status: string; po_status: string; batches_created: number }> {
        return this.http.post<any>(`${this.apiUrl}/purchase-orders/${id}/receive`, input);
    }

    cancelPurchaseOrder(id: number): Observable<{ status: string; id: number }> {
        return this.http.delete<{ status: string; id: number }>(`${this.apiUrl}/purchase-orders/${id}`);
    }

    getPurchaseOrderPdf(id: number): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/purchase-orders/${id}/pdf`, {
            responseType: 'blob',
        });
    }

    // ============ RECIPES ============

    getProductRecipe(productId: number): Observable<ProductRecipe> {
        return this.http.get<ProductRecipe>(`${this.apiUrl}/recipes/product/${productId}`);
    }

    updateProductRecipe(
        productId: number,
        recipe: ProductRecipeUpdate
    ): Observable<{ status: string; product_id: number; items_count: number }> {
        return this.http.put<any>(`${this.apiUrl}/recipes/product/${productId}`, recipe);
    }

    getProductCost(productId: number): Observable<ProductCost> {
        return this.http.get<ProductCost>(`${this.apiUrl}/recipes/product/${productId}/cost`);
    }

    // ============ STOCK & REPORTS ============

    getStockLevels(category?: InventoryCategory): Observable<StockLevel[]> {
        let params = new HttpParams();
        if (category) params = params.set('category', category);
        return this.http.get<StockLevel[]>(`${this.apiUrl}/stock-levels`, { params });
    }

    getLowStockItems(): Observable<LowStockItem[]> {
        return this.http.get<LowStockItem[]>(`${this.apiUrl}/low-stock`);
    }

    getInventoryValuation(): Observable<InventoryValuation> {
        return this.http.get<InventoryValuation>(`${this.apiUrl}/valuation`);
    }

    getTransactions(options?: {
        itemId?: number;
        transactionType?: TransactionType;
        limit?: number;
        offset?: number;
    }): Observable<InventoryTransaction[]> {
        let params = new HttpParams();
        if (options?.itemId) params = params.set('item_id', String(options.itemId));
        if (options?.transactionType) params = params.set('transaction_type', options.transactionType);
        if (options?.limit) params = params.set('limit', String(options.limit));
        if (options?.offset) params = params.set('offset', String(options.offset));
        return this.http.get<InventoryTransaction[]>(`${this.apiUrl}/transactions`, { params });
    }

    // ============ UNITS ============

    getUnits(): Observable<UnitsResponse> {
        return this.http.get<UnitsResponse>(`${this.apiUrl}/units`);
    }

    // ============ UTILITY METHODS ============

    formatCurrency(cents: number, currencySymbol = '$'): string {
        return `${currencySymbol}${(cents / 100).toFixed(2)}`;
    }

    formatQuantity(quantity: number, unit: string): string {
        return `${quantity.toFixed(2)} ${unit}`;
    }
}
