
/* =====================================================
   PHARMANET - FRONTEND API
   React + TypeScript + FastAPI
   ===================================================== */
const API_BASE = '/api'
// =====================================================
// COMMON API HELPERS
// =====================================================
async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${url}`, {
      ...options,
      credentials: 'include',
    })
  } catch {
    throw new Error(
      'Немає з’єднання із сервером FastAPI. Перевір Backend.'
    )
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    let message = `Помилка сервера: HTTP ${response.status}`
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = data.detail
      if (typeof detail === 'string') {
        message = detail
      } else if (Array.isArray(detail)) {
        message = detail
          .map((item: { msg?: string }) => item.msg ?? 'Помилка валідації')
          .join('; ')
      }
    }
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.json() as Promise<T>
}
// =====================================================
// 1. PRODUCTS
// =====================================================
export interface Product {
  product_id: number
  name: string
  barcode: string | null
  sku: string | null
  unit: string
  description: string | null
  category: string | null
  manufacturer: string | null
  is_active: boolean
}
export interface ProductsResponse {
  count: number
  limit: number
  offset: number
  products: Product[]
}
export async function getProducts(
  search: string = ''
): Promise<ProductsResponse> {
  const params = new URLSearchParams({
    limit: '100',
    offset: '0',
  })
  if (search.trim()) {
    params.set('search', search.trim())
  }
  return apiRequest<ProductsResponse>(
    `/products?${params.toString()}`
  )
}
// =====================================================
// 2. PRODUCT DETAILS
// =====================================================
export interface ProductPrice {
  location_id: number
  location_name: string
  price: number
  valid_from: string
  valid_to: string | null
}
export interface ProductStock {
  location_id: number
  location_name: string
  total_quantity: number
  reserved_quantity: number
  available_quantity: number
  nearest_expiry_date: string | null
}
export interface ProductDetails {
  product: Product & {
    active_ingredient: string | null
    dosage: string | null
    dosage_form: string | null
    prescription_required: boolean | null
  }
  prices: ProductPrice[]
  stock_by_location: ProductStock[]
}
export async function getProductDetails(
  productId: number
): Promise<ProductDetails> {
  return apiRequest<ProductDetails>(
    `/products/${productId}`
  )
}
// =====================================================
// 3. LOCATIONS
// =====================================================
export interface Location {
  location_id: number
  name: string
  location_type: string
  address: string | null
  phone: string | null
  is_active: boolean
}
export interface LocationsResponse {
  count: number
  locations: Location[]
}
export async function getLocations(): Promise<Location[]> {
  const data = await apiRequest<LocationsResponse>(
    '/locations'
  )
  return data.locations
}
// =====================================================
// 4. INVENTORY
// =====================================================
export interface InventoryItem {
  inventory_id: number
  location_id: number
  location_name: string
  location_type: string
  product_id: number
  product_name: string
  barcode: string | null
  batch_id: number
  batch_number: string
  expiry_date: string | null
  quantity: number
  reserved_quantity: number
  available_quantity: number
  status: string
  updated_at: string
}
export interface InventoryResponse {
  count: number
  limit: number
  offset: number
  inventory: InventoryItem[]
}
export async function getInventory(
  locationId?: number
): Promise<InventoryItem[]> {
  const items: InventoryItem[] = []
  const limit = 100
  let offset = 0
  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (locationId !== undefined) {
      params.set('location_id', String(locationId))
    }
    const data = await apiRequest<InventoryResponse>(
      `/inventory?${params.toString()}`
    )
    items.push(...data.inventory)
    if (data.inventory.length < limit) {
      break
    }
    offset += limit
  }
  return items
}
// =====================================================
// 5. SALES HISTORY
// =====================================================
export interface Sale {
  sale_id: number
  sale_datetime: string
  location_id: number
  location_name: string
  employee_id: number
  employee_name: string
  customer_id: number | null
  subtotal: number | null
  discount_amount: number
  bonus_amount: number
  total_amount: number | null
  status: string
  item_count: number
}
export interface SalesResponse {
  count: number
  limit: number
  offset: number
  sales: Sale[]
}
export async function getSales(locationId?: number): Promise<Sale[]> {
  const allSales: Sale[] = []
  const limit = 100
  let offset = 0
  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (locationId !== undefined) {
      params.set('location_id', String(locationId))
    }

    const data = await apiRequest<SalesResponse>(
      `/sales?${params.toString()}`
    )
    allSales.push(...data.sales)
    if (data.sales.length < limit) {
      break
    }
    offset += limit
  }
  return allSales
}
// =====================================================
// 6. SINGLE PRODUCT SALE
// Backwards compatibility
// =====================================================
export interface SaleBatch {
  batch_id: number
  batch_number: string
  quantity: number
}
export interface CreateSaleResponse {
  message: string
  sale_id: number
  product_id?: number
  product_name: string
  quantity: number
  unit_price: number
  total_amount: number
  status: string
  payment_method?: string
  demo_payment: boolean
  request_key?: string
  duplicate?: boolean
  batches: SaleBatch[]
}
export async function createSale(
  productId: number,
  quantity: number
): Promise<CreateSaleResponse> {
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error('Некоректний ID препарату')
  }
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 100
  ) {
    throw new Error('Кількість має бути від 1 до 100')
  }
  return apiRequest<CreateSaleResponse>('/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_id: productId,
      quantity,
    }),
  })
}
// =====================================================
// 7. MULTI-PRODUCT SALES
// =====================================================
export interface SaleCartItem {
  product_id: number
  quantity: number
}
export interface MultiSaleItem {
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  total_amount: number
  batches: SaleBatch[]
}
export interface MultiSaleResponse {
  message: string
  sale_id: number
  location_id?: number
  employee_id?: number
  total_amount: number
  status: string
  payment_method?: string
  demo_payment?: boolean
  request_key: string
  duplicate: boolean
  items?: MultiSaleItem[]
}
// =====================================================
// 8. CREATE MULTI-PRODUCT SALE
// =====================================================
export async function createMultiSale(
  items: SaleCartItem[],
  requestKey: string,
  locationId?: number
): Promise<MultiSaleResponse> {
  if (items.length === 0) {
    throw new Error('Кошик порожній')
  }
  if (items.length > 50) {
    throw new Error('У кошику може бути максимум 50 позицій')
  }
  const combined = new Map<number, number>()
  for (const item of items) {
    if (
      !Number.isInteger(item.product_id) ||
      item.product_id <= 0
    ) {
      throw new Error('Некоректний ID товару')
    }
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    ) {
      throw new Error(
        'Кількість кожного товару має бути від 1 до 100'
      )
    }
    combined.set(
      item.product_id,
      (combined.get(item.product_id) ?? 0) + item.quantity
    )
  }
  const normalizedItems = Array.from(
    combined,
    ([product_id, quantity]) => ({
      product_id,
      quantity,
    })
  ).sort((a, b) => a.product_id - b.product_id)
  if (
    normalizedItems.some(item => item.quantity > 100)
  ) {
    throw new Error(
      'Не можна продати більше 100 одиниць одного товару'
    )
  }
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(requestKey)) {
    throw new Error('Некоректний request_key (UUID)')
  }
  return apiRequest<MultiSaleResponse>('/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_key: requestKey,
      items: normalizedItems,
      ...(locationId !== undefined ? { location_id: locationId } : {}),
    }),
  })
}
// =====================================================
// 9. HELPER - CREATE UNIQUE REQUEST KEY
// =====================================================
export function generateSaleRequestKey(): string {
  return crypto.randomUUID()
}
// =====================================================
// 10. PROCUREMENT API
// =====================================================
export interface Supplier {
  supplier_id: number
  name: string
  edrpou: string | null
  address: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  product_count: number
}
export interface PurchaseOrder {
  purchase_order_id: number
  supplier_id: number
  supplier_name: string
  destination_location_id: number
  destination_name: string
  created_by_employee_id: number
  order_date: string
  expected_date: string | null
  status: string
  total_amount: number
  item_count: number
}
export interface PurchaseOrderItemInput {
  product_id: number
  quantity: number
  unit_price: number
}
export interface CreatePurchaseOrderInput {
  supplier_id: number
  destination_location_id: number
  expected_date: string | null
  items: PurchaseOrderItemInput[]
}
export interface CreatePurchaseOrderResponse {
  message: string
  purchase_order_id: number
  supplier_id: number
  destination_location_id: number
  status: string
  total_amount: number
  item_count: number
}
export async function getSuppliers(): Promise<Supplier[]> {
  const result = await apiRequest<{
    count: number
    suppliers: Supplier[]
  }>('/suppliers')
  return result.suppliers
}
export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const result = await apiRequest<{
    count: number
    purchase_orders: PurchaseOrder[]
  }>('/purchase-orders')
  return result.purchase_orders
}
export async function createPurchaseOrder(
  order: CreatePurchaseOrderInput
): Promise<CreatePurchaseOrderResponse> {
  return apiRequest<CreatePurchaseOrderResponse>(
    '/purchase-orders',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(order),
    }
  )
}
// =====================================================
// 11. PURCHASE ORDER DETAILS & RECEIVING
// =====================================================
export interface PurchaseOrderDetailItem {
  purchase_order_item_id: number
  product_id: number
  product_name: string
  ordered_quantity: number
  received_quantity: number
  remaining_quantity: number
  unit_price: number
  line_total: number
}
export interface PurchaseOrderDetailsResponse {
  order: PurchaseOrder
  items: PurchaseOrderDetailItem[]
}
export interface ReceivePurchaseItem {
  purchase_order_item_id: number
  quantity: number
  batch_number: string
  expiry_date: string
}
export interface ReceivePurchaseResponse {
  message: string
  purchase_order_id: number
  status: string
  received_items: {
    purchase_order_item_id: number
    product_id: number
    batch_id: number
    batch_number: string
    quantity: number
  }[]
}
export async function getPurchaseOrderDetails(
  orderId: number
): Promise<PurchaseOrderDetailsResponse> {
  return apiRequest<PurchaseOrderDetailsResponse>(
    `/purchase-orders/${orderId}`
  )
}
export async function submitPurchaseOrder(
  orderId: number
): Promise<{
  message: string
  purchase_order_id: number
  status: string
}> {
  return apiRequest(
    `/purchase-orders/${orderId}/submit`,
    { method: 'POST' }
  )
}
export async function receivePurchaseOrder(
  orderId: number,
  items: ReceivePurchaseItem[]
): Promise<ReceivePurchaseResponse> {
  return apiRequest<ReceivePurchaseResponse>(
    `/purchase-orders/${orderId}/receive`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    }
  )
}
// =====================================================
// 12. STOCK TRANSFERS
// =====================================================
export interface TransferStockItem {
  inventory_id: number
  location_id: number
  location_name: string
  batch_id: number
  product_id: number
  product_name: string
  batch_number: string
  expiry_date: string | null
  quantity: number
  reserved_quantity: number
  available_quantity: number
}
export interface Transfer {
  transfer_id: number
  from_location_id: number
  from_location_name: string
  to_location_id: number
  to_location_name: string
  created_by_employee_id: number
  created_at: string
  status: string
  confirmed_by_employee_id: number | null
  confirmed_at: string | null
  item_count?: number
  total_quantity?: number
}
export interface TransferItem {
  transfer_item_id: number
  product_id: number
  product_name: string
  batch_id: number
  batch_number: string
  expiry_date: string | null
  quantity: number
}
export interface CreateTransferItem {
  batch_id: number
  quantity: number
}
export interface CreateTransferInput {
  from_location_id: number
  to_location_id: number
  created_by_employee_id: number
  items: CreateTransferItem[]
}
export interface CreateTransferResponse {
  message: string
  transfer_id: number
  status: string
  item_count: number
}
export interface ConfirmTransferResponse {
  message: string
  transfer_id: number
  status: string
  item_count: number
}
export async function getTransferAvailableStock(
  locationId: number
): Promise<TransferStockItem[]> {
  const response = await apiRequest<{
    count: number
    items: TransferStockItem[]
  }>(
    `/transfers/available-stock?location_id=${encodeURIComponent(
      locationId
    )}`
  )
  return response.items
}
export async function getTransfers(): Promise<Transfer[]> {
  const response = await apiRequest<{
    count: number
    transfers: Transfer[]
  }>('/transfers')
  return response.transfers
}
export async function getTransferDetails(
  transferId: number
): Promise<{
  transfer: Transfer
  items: TransferItem[]
}> {
  return apiRequest(
    `/transfers/${transferId}`
  )
}
export async function createTransfer(
  data: CreateTransferInput
): Promise<CreateTransferResponse> {
  return apiRequest<CreateTransferResponse>(
    '/transfers',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  )
}
export async function confirmTransfer(
  transferId: number,
  employeeId: number
): Promise<ConfirmTransferResponse> {
  return apiRequest<ConfirmTransferResponse>(
    `/transfers/${transferId}/confirm?employee_id=${encodeURIComponent(
      employeeId
    )}`,
    {
      method: 'POST',
    }
  )
}
/* =====================================================
   13. WRITE-OFFS API
   ===================================================== */
export type WriteOffReason =
  | 'EXPIRED'
  | 'DAMAGED'
  | 'LOST'
  | 'OTHER'
export type WriteOffStatus =
  | 'CREATED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'CANCELLED'
export interface WriteOffStock {
  inventory_id: number
  location_id: number
  location_name: string
  batch_id: number
  product_id: number
  product_name: string
  batch_number: string
  expiry_date: string | null
  quantity: number
  reserved_quantity: number
  available_quantity: number
  status: string
  is_expired: boolean
}
export interface WriteOff {
  write_off_id: number
  location_id: number
  location_name: string
  employee_id: number
  reason: WriteOffReason
  status: WriteOffStatus
  created_at: string
  item_count: number
  total_quantity: number
}
export interface WriteOffItem {
  write_off_item_id: number
  product_id: number
  product_name: string
  batch_id: number
  batch_number: string
  expiry_date: string | null
  quantity: number
}
export interface WriteOffDetails {
  write_off: WriteOff
  items: WriteOffItem[]
}
export interface CreateWriteOffInput {
  location_id: number
  employee_id: number
  reason: WriteOffReason
  items: {
    batch_id: number
    quantity: number
  }[]
}
export interface WriteOffActionResult {
  message: string
  write_off_id: number
  status: WriteOffStatus
  item_count?: number
}
export interface ExpiryAlert {
  inventory_id: number
  location_id: number
  location_name: string
  batch_id: number
  batch_number: string
  product_id: number
  product_name: string
  expiry_date: string
  days_remaining: number
  quantity: number
  reserved_quantity: number
  status: string
  alert_type: string
}
export async function getWriteOffStock(
  locationId: number
): Promise<WriteOffStock[]> {
  const data = await apiRequest<{
    count: number
    items: WriteOffStock[]
  }>(
    `/write-offs/available-stock?location_id=${locationId}`
  )
  return data.items
}
export async function getWriteOffs(): Promise<WriteOff[]> {
  const data = await apiRequest<{
    count: number
    write_offs: WriteOff[]
  }>('/write-offs')
  return data.write_offs
}
export async function getWriteOffDetails(
  writeOffId: number
): Promise<WriteOffDetails> {
  return apiRequest<WriteOffDetails>(
    `/write-offs/${writeOffId}`
  )
}
export async function createWriteOff(
  payload: CreateWriteOffInput
): Promise<WriteOffActionResult> {
  return apiRequest<WriteOffActionResult>(
    '/write-offs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
}
export async function approveWriteOff(
  id: number,
  employeeId: number
): Promise<WriteOffActionResult> {
  return apiRequest<WriteOffActionResult>(
    `/write-offs/${id}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId }),
    }
  )
}
export async function completeWriteOff(
  id: number,
  employeeId: number
): Promise<WriteOffActionResult> {
  return apiRequest<WriteOffActionResult>(
    `/write-offs/${id}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId }),
    }
  )
}
export async function cancelWriteOff(
  id: number,
  employeeId: number
): Promise<WriteOffActionResult> {
  return apiRequest<WriteOffActionResult>(
    `/write-offs/${id}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId }),
    }
  )
}
export async function getExpiryAlerts(
  days = 30,
  locationId?: number
): Promise<ExpiryAlert[]> {
  const params = new URLSearchParams({
    days: String(days),
  })
  if (locationId) {
    params.set('location_id', String(locationId))
  }
  const data = await apiRequest<{
    count: number
    days: number
    items: ExpiryAlert[]
  }>(`/inventory/expiry-alerts?${params.toString()}`)
  return data.items
}
// =====================================================
// 14. INVENTORY BLOCKING
// =====================================================
export interface InventoryStatusActionResponse {
  message: string
  inventory_id: number
  status: string
}
export async function blockInventoryBatch(
  inventoryId: number
): Promise<InventoryStatusActionResponse> {
  return apiRequest<InventoryStatusActionResponse>(
    `/inventory/${inventoryId}/block`,
    { method: 'POST' }
  )
}
export async function unblockInventoryBatch(
  inventoryId: number
): Promise<InventoryStatusActionResponse> {
  return apiRequest<InventoryStatusActionResponse>(
    `/inventory/${inventoryId}/unblock`,
    { method: 'POST' }
  )
}
// =====================================================
// 15. DASHBOARD API
// =====================================================
export interface DashboardSummary {
  period_days: number
  sales: {
    sales_count: number
    total_revenue: number
    average_check: number
  }
  inventory: {
    stock_records: number
    total_quantity: number
    blocked_batches: number
    expired_batches: number
    low_stock_batches: number
  }
  purchases: {
    total_orders: number
    pending_orders: number
    total_purchase_amount: number
  }
  write_offs: {
    completed_write_offs: number
  }
}
export interface DashboardSalesDay {
  sale_date: string
  sales_count: number
  revenue: number
}
export interface DashboardTopProduct {
  product_id: number
  product_name: string
  quantity_sold: number
  revenue: number
  sales_count: number
}
export interface DashboardLocation {
  location_id: number
  location_name: string
  location_type: string
  sales_count: number
  revenue: number
  stock_records: number
  total_stock_quantity: number
  blocked_batches: number
}
export async function getDashboardSummary(
  days = 30
): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>(
    `/dashboard/summary?days=${days}`
  )
}
export async function getDashboardSalesTrend(
  days = 30
): Promise<DashboardSalesDay[]> {
  const result = await apiRequest<{
    days: number
    items: DashboardSalesDay[]
  }>(`/dashboard/sales-trend?days=${days}`)
  return result.items
}
export async function getDashboardTopProducts(
  days = 30,
  limit = 10
): Promise<DashboardTopProduct[]> {
  const result = await apiRequest<{
    days: number
    count: number
    items: DashboardTopProduct[]
  }>(`/dashboard/top-products?days=${days}&limit=${limit}`)
  return result.items
}
export async function getDashboardLocations(
  days = 30
): Promise<DashboardLocation[]> {
  const result = await apiRequest<{
    days: number
    count: number
    items: DashboardLocation[]
  }>(`/dashboard/locations?days=${days}`)
  return result.items
}
// =====================================================
// 16. FILTERED ANALYTICS REPORT
// =====================================================
export interface DashboardReport {
  period_days: number
  location_id: number | null
  location_name: string
  sales: DashboardSummary['sales']
  inventory: DashboardSummary['inventory']
  purchases: DashboardSummary['purchases']
  write_offs: DashboardSummary['write_offs']
  trend: DashboardSalesDay[]
  top_products: DashboardTopProduct[]
  locations: DashboardLocation[]
}
export async function getDashboardReport(
  days = 30,
  locationId?: number
): Promise<DashboardReport> {
  const params = new URLSearchParams({
    days: String(days),
  })
  if (locationId !== undefined) {
    params.set('location_id', String(locationId))
  }
  return apiRequest<DashboardReport>(
    `/dashboard/report?${params.toString()}`
  )
}
/* =====================================================
   EMPLOYEES API
   ===================================================== */
export interface Employee {
  employee_id: number
  first_name: string
  last_name: string
  middle_name: string | null
  phone: string | null
  email: string | null
  position_id: number | null
  position_name: string | null
  department_id: number | null
  department_name: string | null
  location_id: number | null
  location_name: string | null
  hire_date: string | null
  termination_date: string | null
  employment_status: string
  is_active: boolean
  account_id: number | null
  username: string | null
  account_is_active: boolean
  roles: string[]
}
export interface EmployeePosition {
  position_id: number
  name: string
  description: string | null
}
export async function getEmployees(): Promise<Employee[]> {
  const result = await apiRequest<{
    count: number
    employees: Employee[]
  }>('/employees')
  return result.employees
}
export async function getPositions(): Promise<EmployeePosition[]> {
  const result = await apiRequest<{
    count: number
    positions: EmployeePosition[]
  }>('/positions')
  return result.positions
}
/* =====================================================
   AUTHENTICATION API
   ===================================================== */
export interface AuthUser {
  account_id: number
  employee_id: number
  username: string
  first_name: string
  last_name: string
  middle_name: string | null
  position_id: number | null
  position_name: string | null
  location_id: number | null
  location_name: string | null
  roles: string[]
}
export interface AuthLoginResponse {
  message: string
  user: AuthUser
}
const AUTH_API_BASE = '/api'
async function authRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${AUTH_API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    let message = 'Помилка запиту'
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') {
        message = body.detail
      }
    } catch {
      // Залишаємо стандартне повідомлення
    }
    const error = new Error(message) as Error & {
      status?: number
    }
    error.status = response.status
    throw error
  }
  return (await response.json()) as T
}
export function login(
  username: string,
  password: string
): Promise<AuthLoginResponse> {
  return authRequest<AuthLoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}
export function getCurrentUser(): Promise<AuthUser> {
  return authRequest<AuthUser>('/auth/me')
}
export function logout(): Promise<{ message: string }> {
  return authRequest<{ message: string }>('/auth/logout', {
    method: 'POST',
  })
}
