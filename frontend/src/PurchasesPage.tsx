
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import {
  getSuppliers,
  getPurchaseOrders,
  getPurchaseOrderDetails,
  getProducts,
  getLocations,
  createPurchaseOrder,
  submitPurchaseOrder,
  receivePurchaseOrder,
  type Supplier,
  type PurchaseOrder,
  type PurchaseOrderDetailsResponse,
  type Product,
  type Location,
  type PurchaseOrderItemInput,
  type ReceivePurchaseItem,
} from './api'

// =====================================================
// TYPES
// =====================================================

type ConfirmAction = 'create' | 'submit' | 'receive'

interface DraftItem {
  product_id: number
  quantity: number
  unit_price: number
}

interface ReceiptRow {
  selected: boolean
  quantity: string
  batch_number: string
  expiry_date: string
}

interface ConfirmDialog {
  action: ConfirmAction
  title: string
  description: string
  details: string[]
}

const MAX_ITEMS = 100

// =====================================================
// HELPERS
// =====================================================

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)

  return `${amount.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} грн`
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('uk-UA')
    .replace(/\s+/g, ' ')
}

function statusLabel(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'Чернетка'
    case 'ORDERED':
      return 'Замовлено'
    case 'PARTIALLY_RECEIVED':
      return 'Частково отримано'
    case 'RECEIVED':
      return 'Отримано'
    case 'CANCELLED':
      return 'Скасовано'
    default:
      return status
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'draft'
    case 'ORDERED':
      return 'ordered'
    case 'PARTIALLY_RECEIVED':
      return 'partial'
    case 'RECEIVED':
      return 'received'
    default:
      return 'cancelled'
  }
}

function canReceive(status: string) {
  return (
    status === 'ORDERED' ||
    status === 'PARTIALLY_RECEIVED'
  )
}

function makeReceiptRows(
  data: PurchaseOrderDetailsResponse
): Record<number, ReceiptRow> {
  const result: Record<number, ReceiptRow> = {}

  for (const item of data.items) {
    result[item.purchase_order_item_id] = {
      selected: false,
      quantity: String(
        Math.max(0, Number(item.remaining_quantity))
      ),
      batch_number: '',
      expiry_date: '',
    }
  }

  return result
}

function localToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function PurchasesPage() {
  // ---------------------------------------------------
  // INITIAL DATA
  // ---------------------------------------------------

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ---------------------------------------------------
  // CREATE PURCHASE ORDER
  // ---------------------------------------------------

  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const [draftItems, setDraftItems] = useState<DraftItem[]>([])

  // ---------------------------------------------------
  // DETAILS / RECEIVING
  // ---------------------------------------------------

  const [details, setDetails] =
    useState<PurchaseOrderDetailsResponse | null>(null)

  const [detailsLoading, setDetailsLoading] = useState(false)

  const [receiptRows, setReceiptRows] = useState<
    Record<number, ReceiptRow>
  >({})

  const [detailError, setDetailError] = useState('')
  const [detailSuccess, setDetailSuccess] = useState('')
  const [receiptNeedsVerification, setReceiptNeedsVerification] =
    useState(false)

  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialog | null>(null)

  const operationLock = useRef(false)
  const detailsRequestId = useRef(0)
  const searchRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------
  // INITIAL LOAD
  // ---------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)

      try {
        const [s, o, p, l] = await Promise.all([
          getSuppliers(),
          getPurchaseOrders(),
          getProducts(),
          getLocations(),
        ])

        if (cancelled) return

        setSuppliers(s)
        setOrders(o)
        setProducts(p.products)
        setLocations(l)

        if (s.length > 0) {
          setSupplierId(String(s[0].supplier_id))
        }

        const warehouse = l.find(
          item =>
            item.is_active &&
            item.location_type === 'WAREHOUSE'
        )

        if (warehouse) {
          setLocationId(String(warehouse.location_id))
        } else {
          const first = l.find(item => item.is_active)

          if (first) {
            setLocationId(String(first.location_id))
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Не вдалося завантажити закупівлі'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [])

  // ---------------------------------------------------
  // SEARCH CLOSE ON OUTSIDE CLICK
  // ---------------------------------------------------

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false)
      }
    }

    document.addEventListener(
      'pointerdown',
      handlePointerDown
    )

    return () => {
      document.removeEventListener(
        'pointerdown',
        handlePointerDown
      )
    }
  }, [])

  // ---------------------------------------------------
  // PREPARE PRODUCT DATA
  // ---------------------------------------------------

  const productMap = new Map(
    products.map(product => [
      product.product_id,
      product,
    ])
  )

  const activeProducts = products.filter(p => p.is_active)

  const query = normalize(search)

  const filteredProducts = activeProducts
    .filter(product => {
      if (!query) return true

      return (
        normalize(product.name).includes(query) ||
        normalize(product.sku ?? '').includes(query) ||
        normalize(product.barcode ?? '').includes(query)
      )
    })
    .sort((a, b) => {
      const aStarts = normalize(a.name).startsWith(query)
      const bStarts = normalize(b.name).startsWith(query)

      if (aStarts !== bStarts) {
        return aStarts ? -1 : 1
      }

      return a.name.localeCompare(b.name, 'uk-UA')
    })

  // ---------------------------------------------------
  // CART OPERATIONS
  // ---------------------------------------------------

  function addProduct(product: Product) {
    if (processing || operationLock.current) return

    if (draftItems.length >= MAX_ITEMS) {
      setError('Максимум 100 позицій у замовленні')
      return
    }

    const exists = draftItems.some(
      item => item.product_id === product.product_id
    )

    if (exists) {
      setError(
        `Препарат "${product.name}" уже є в замовленні`
      )
      return
    }

    setDraftItems(previous => [
      ...previous,
      {
        product_id: product.product_id,
        quantity: 1,
        unit_price: 0,
      },
    ])

    setSearch('')
    setSearchOpen(false)
    setError('')
    setSuccess('')
  }

  function updateDraftItem(
    productId: number,
    field: 'quantity' | 'unit_price',
    value: number
  ) {
    if (processing) return

    setDraftItems(previous =>
      previous.map(item =>
        item.product_id === productId
          ? { ...item, [field]: value }
          : item
      )
    )

    setError('')
  }

  function removeDraftItem(productId: number) {
    if (processing) return

    setDraftItems(previous =>
      previous.filter(item => item.product_id !== productId)
    )

    setError('')
  }

  const draftTotal = draftItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )

  const draftQuantity = draftItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  // ---------------------------------------------------
  // VALIDATE NEW PURCHASE ORDER
  // ---------------------------------------------------

  function prepareCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (processing || operationLock.current) return

    setError('')
    setSuccess('')

    if (!supplierId || !locationId) {
      setError('Оберіть постачальника та місце доставки')
      return
    }

    if (draftItems.length === 0) {
      setError('Додайте хоча б один препарат')
      return
    }

    if (
      expectedDate &&
      expectedDate < localToday()
    ) {
      setError(
        'Очікувана дата доставки не може бути в минулому'
      )
      return
    }

    for (const item of draftItems) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 10000
      ) {
        setError(
          'Кількість кожного препарату має бути від 1 до 10000'
        )
        return
      }

      if (
        !Number.isFinite(item.unit_price) ||
        item.unit_price < 0 ||
        Math.abs(
          item.unit_price * 100 -
          Math.round(item.unit_price * 100)
        ) > 0.000001
      ) {
        setError(
          'Закупівельна ціна має бути невід’ємною, з максимум двома десятковими знаками'
        )
        return
      }
    }

    setConfirmDialog({
      action: 'create',
      title: 'Створити закупівлю?',
      description:
        'Буде створено нове замовлення зі статусом DRAFT. ' +
        'Складські залишки поки не зміняться.',
      details: [
        `Постачальник: ${
          suppliers.find(
            s => s.supplier_id === Number(supplierId)
          )?.name ?? supplierId
        }`,
        `Місце доставки: ${
          locations.find(
            l => l.location_id === Number(locationId)
          )?.name ?? locationId
        }`,
        `Позицій: ${draftItems.length}`,
        `Кількість одиниць: ${draftQuantity}`,
        `Загальна сума: ${money(draftTotal)}`,
      ],
    })
  }

  // ---------------------------------------------------
  // REFRESH HISTORY
  // ---------------------------------------------------

  async function refreshOrders() {
    const updated = await getPurchaseOrders()
    setOrders(updated)
  }

  // ---------------------------------------------------
  // CREATE PURCHASE ORDER
  // ---------------------------------------------------

  async function executeCreateOrder() {
    const payloadItems: PurchaseOrderItemInput[] =
      draftItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))

    let createdId: number | null = null

    try {
      const result = await createPurchaseOrder({
        supplier_id: Number(supplierId),
        destination_location_id: Number(locationId),
        expected_date: expectedDate || null,
        items: payloadItems,
      })

      createdId = result.purchase_order_id

      setSuccess(
        `Замовлення #${result.purchase_order_id} створено! ` +
        `Статус: Чернетка. Сума: ${money(result.total_amount)}`
      )

      setDraftItems([])
      setExpectedDate('')
      setSearch('')
    } catch (err) {
      setError(
        (err instanceof Error
          ? err.message
          : 'Не вдалося створити замовлення') +
        '. Якщо результат запиту невідомий, перевірте історію перед повторним створенням.'
      )
    }

    if (createdId !== null) {
      try {
        await refreshOrders()
      } catch {
        setError(
          `Замовлення #${createdId} створено, але список не оновився. Оновіть сторінку.`
        )
      }
    }
  }

  // ---------------------------------------------------
  // LOAD ORDER DETAILS
  // ---------------------------------------------------

  async function openDetails(orderId: number) {
    if (operationLock.current) return

    const requestId = ++detailsRequestId.current

    setDetailsLoading(true)
    setDetails(null)
    setDetailError('')
    setDetailSuccess('')
    setReceiptNeedsVerification(false)

    try {
      const result = await getPurchaseOrderDetails(orderId)

      if (requestId !== detailsRequestId.current) return

      setDetails(result)
      setReceiptRows(makeReceiptRows(result))
    } catch (err) {
      if (requestId !== detailsRequestId.current) return

      setDetailError(
        err instanceof Error
          ? err.message
          : 'Не вдалося отримати деталі замовлення'
      )
    } finally {
      if (requestId === detailsRequestId.current) {
        setDetailsLoading(false)
      }
    }
  }

  function closeDetails() {
    if (operationLock.current) return

    ++detailsRequestId.current
    setDetails(null)
    setDetailsLoading(false)
    setDetailError('')
    setDetailSuccess('')
    setReceiptRows({})
    setReceiptNeedsVerification(false)
  }

  // ---------------------------------------------------
  // SUBMIT ORDER
  // ---------------------------------------------------

  function prepareSubmitOrder() {
    if (
      !details ||
      processing ||
      details.order.status !== 'DRAFT'
    ) {
      return
    }

    setConfirmDialog({
      action: 'submit',
      title: 'Підтвердити замовлення?',
      description:
        'Замовлення перейде зі статусу DRAFT у ORDERED. ' +
        'Після цього стане доступним приймання товарів.',
      details: [
        `Номер: #${details.order.purchase_order_id}`,
        `Постачальник: ${details.order.supplier_name}`,
        `Склад: ${details.order.destination_name}`,
        `Сума: ${money(details.order.total_amount)}`,
      ],
    })
  }

  async function executeSubmitOrder() {
    if (!details) return

    const orderId = details.order.purchase_order_id
    let submitted = false

    setDetailError('')
    setDetailSuccess('')

    try {
      await submitPurchaseOrder(orderId)
      submitted = true

      setDetailSuccess(
        `Замовлення #${orderId} підтверджено. Статус: ORDERED.`
      )
    } catch (err) {
      setDetailError(
        (err instanceof Error
          ? err.message
          : 'Помилка підтвердження') +
        '. Перевірте актуальний статус замовлення.'
      )
    }

    try {
      const updated = await getPurchaseOrderDetails(orderId)
      setDetails(updated)
      setReceiptRows(makeReceiptRows(updated))
    } catch {
      setDetailError(
        submitted
          ? 'Замовлення підтверджено, але деталі не оновилися.'
          : 'Не вдалося перевірити актуальний стан замовлення.'
      )
    }

    try {
      await refreshOrders()
    } catch {
      if (submitted) {
        setDetailError(
          'Замовлення підтверджено, але список не оновився.'
        )
      }
    }
  }

  // ---------------------------------------------------
  // RECEIVING FORM
  // ---------------------------------------------------

  function updateReceiptRow(
    itemId: number,
    patch: Partial<ReceiptRow>
  ) {
    if (
      processing ||
      operationLock.current ||
      receiptNeedsVerification
    ) {
      return
    }

    setReceiptRows(previous => ({
      ...previous,
      [itemId]: {
        ...previous[itemId],
        ...patch,
      },
    }))

    setDetailError('')
  }

  function prepareReceive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (
      !details ||
      processing ||
      receiptNeedsVerification ||
      !canReceive(details.order.status)
    ) {
      return
    }

    setDetailError('')
    setDetailSuccess('')

    let positions = 0
    let totalUnits = 0

    for (const line of details.items) {
      const row = receiptRows[line.purchase_order_item_id]

      if (!row?.selected) continue

      positions += 1

      const quantity = Number(row.quantity)
      const remaining = Number(line.remaining_quantity)

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > remaining
      ) {
        setDetailError(
          `Некоректна кількість для "${line.product_name}". ` +
          `Залишилось отримати: ${remaining}.`
        )
        return
      }

      if (
        !row.batch_number.trim() ||
        row.batch_number.trim().length > 100
      ) {
        setDetailError(
          `Вкажіть коректний номер партії для "${line.product_name}".`
        )
        return
      }

      if (
        !row.expiry_date ||
        row.expiry_date <= localToday()
      ) {
        setDetailError(
          `Вкажіть майбутній термін придатності для "${line.product_name}".`
        )
        return
      }

      totalUnits += quantity
    }

    if (positions === 0) {
      setDetailError(
        'Виберіть хоча б один препарат для приймання'
      )
      return
    }

    setConfirmDialog({
      action: 'receive',
      title: 'Підтвердити надходження?',
      description:
        'Ця операція збільшить залишки у PostgreSQL, ' +
        'створить партії за потреби та зареєструє рух PURCHASE.',
      details: [
        `Замовлення: #${details.order.purchase_order_id}`,
        `Місце: ${details.order.destination_name}`,
        `Позицій: ${positions}`,
        `Отримується одиниць: ${totalUnits}`,
      ],
    })
  }

  // ---------------------------------------------------
  // EXECUTE RECEIVING
  // ---------------------------------------------------

  async function executeReceive() {
    if (!details || receiptNeedsVerification) return

    const orderId = details.order.purchase_order_id

    const items: ReceivePurchaseItem[] = details.items
      .filter(
        line => receiptRows[
          line.purchase_order_item_id
        ]?.selected
      )
      .map(line => {
        const row = receiptRows[line.purchase_order_item_id]

        return {
          purchase_order_item_id: line.purchase_order_item_id,
          quantity: Number(row.quantity),
          batch_number: row.batch_number.trim(),
          expiry_date: row.expiry_date,
        }
      })

    setDetailError('')
    setDetailSuccess('')

    let received = false

    try {
      const result = await receivePurchaseOrder(
        orderId,
        items
      )

      received = true

      setDetailSuccess(
        `Надходження збережено! Статус: ${statusLabel(result.status)}.`
      )

      // Successfully committed: only refresh data.
      try {
        const updated = await getPurchaseOrderDetails(
          orderId
        )

        setDetails(updated)
        setReceiptRows(makeReceiptRows(updated))
        setReceiptNeedsVerification(false)
      } catch {
        setReceiptNeedsVerification(true)
        setDetailError(
          'Надходження збережено, але деталі не вдалося оновити.'
        )
      }

    } catch (err) {
      if (!received) {
        setReceiptNeedsVerification(true)

        setDetailError(
          (err instanceof Error
            ? err.message
            : 'Помилка приймання') +
          '. Не повторюйте запит без перевірки фактично отриманої кількості.'
        )
      }
    }

    try {
      await refreshOrders()
    } catch {
      if (received) {
        setDetailError(
          'Надходження збережено, але історія не оновилася.'
        )
      }
    }
  }

  // ---------------------------------------------------
  // VERIFY RECEIPT AFTER AN UNKNOWN RESULT
  // ---------------------------------------------------

  async function verifyReceipt() {
    if (!details || operationLock.current) return

    const orderId = details.order.purchase_order_id
    setDetailsLoading(true)
    setDetailError('')

    try {
      const updated = await getPurchaseOrderDetails(
        orderId
      )

      setDetails(updated)
      setReceiptRows(makeReceiptRows(updated))

      // Keep receipt submission blocked after an
      // uncertain response. The operator must explicitly
      // inspect the updated quantities and reopen.
      if (receiptNeedsVerification) {
        setDetailSuccess(
          'Дані оновлено. Звірте отримані кількості. ' +
          'Для нової операції закрийте і заново відкрийте замовлення.'
        )
      } else {
        setDetailSuccess('Дані замовлення оновлено')
      }
    } catch (err) {
      setDetailError(
        err instanceof Error
          ? err.message
          : 'Не вдалося оновити деталі'
      )
    } finally {
      setDetailsLoading(false)
    }

    try {
      await refreshOrders()
    } catch {
      // The detailed record is the primary check.
    }
  }

  // ---------------------------------------------------
  // CONFIRM DIALOG ACTIONS
  // ---------------------------------------------------

  async function confirmAction() {
    if (!confirmDialog || operationLock.current) return

    const action = confirmDialog.action

    operationLock.current = true
    setProcessing(true)
    setConfirmDialog(null)

    try {
      if (action === 'create') {
        await executeCreateOrder()
      }

      if (action === 'submit') {
        await executeSubmitOrder()
      }

      if (action === 'receive') {
        await executeReceive()
      }
    } finally {
      operationLock.current = false
      setProcessing(false)
    }
  }

  // ---------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------

  const pendingOrders = orders.filter(
    order =>
      order.status === 'DRAFT' ||
      order.status === 'ORDERED' ||
      order.status === 'PARTIALLY_RECEIVED'
  ).length

  const ordersTotal = orders.reduce(
    (sum, order) => sum + Number(order.total_amount ?? 0),
    0
  )

  const remainingLines = details?.items.filter(
    item => Number(item.remaining_quantity) > 0
  ) ?? []

  const selectedReceiptCount = remainingLines.filter(
    item => receiptRows[
      item.purchase_order_item_id
    ]?.selected
  ).length

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <>
      <div className="breadcrumb">
        Головна / Закупівлі
      </div>

      <div className="page-heading">
        <div>
          <h1>Закупівлі</h1>
          <p>
            Управління замовленнями, постачальниками
            та надходженнями препаратів
          </p>
        </div>

        <div className="status-pill">
          ● Procurement
        </div>
      </div>

      {/* STATISTICS */}

      <div className="stats">
        <div className="stat-card">
          <span>Постачальники</span>
          <strong>{suppliers.length}</strong>
          <small>Активні постачальники</small>
        </div>

        <div className="stat-card">
          <span>Замовлення</span>
          <strong>{orders.length}</strong>
          <small>Зареєстровані закупівлі</small>
        </div>

        <div className="stat-card">
          <span>Незавершені</span>
          <strong>{pendingOrders}</strong>
          <small>Чернетки та замовлення в роботі</small>
        </div>

        <div className="stat-card">
          <span>Сума закупівель</span>
          <strong>{money(ordersTotal)}</strong>
          <small>За всіма статусами</small>
        </div>
      </div>

      {/* =================================================
          CREATE ORDER
      ================================================= */}

      <section className="panel purchases-panel">
        <div className="panel-heading">
          <div>
            <h2>Нове замовлення постачальнику</h2>
            <p>
              Додайте препарати та створіть чернетку
              майбутньої закупівлі
            </p>
          </div>
        </div>

        <form
          className="purchases-form"
          onSubmit={prepareCreateOrder}
        >
          <div className="purchase-form-grid">
            <div className="purchase-field">
              <label htmlFor="purchase-supplier">
                Постачальник
              </label>

              <select
                id="purchase-supplier"
                value={supplierId}
                onChange={event =>
                  setSupplierId(event.target.value)
                }
                disabled={loading || processing}
                required
              >
                <option value="">
                  Оберіть постачальника
                </option>

                {suppliers.map(supplier => (
                  <option
                    key={supplier.supplier_id}
                    value={supplier.supplier_id}
                  >
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="purchase-field">
              <label htmlFor="purchase-location">
                Місце доставки
              </label>

              <select
                id="purchase-location"
                value={locationId}
                onChange={event =>
                  setLocationId(event.target.value)
                }
                disabled={loading || processing}
                required
              >
                <option value="">
                  Оберіть місце доставки
                </option>

                {locations
                  .filter(location => location.is_active)
                  .map(location => (
                    <option
                      key={location.location_id}
                      value={location.location_id}
                    >
                      {location.name}
                      {' — '}
                      {location.location_type}
                    </option>
                  ))}
              </select>
            </div>

            <div className="purchase-field">
              <label htmlFor="purchase-date">
                Очікувана дата доставки
              </label>

              <input
                id="purchase-date"
                type="date"
                value={expectedDate}
                min={localToday()}
                onChange={event =>
                  setExpectedDate(event.target.value)
                }
                disabled={processing}
              />
            </div>
          </div>

          {/* PRODUCT SEARCH */}

          <div className="purchase-section-title">
            <h3>Препарати для закупівлі</h3>
            <p>
              Шукайте за назвою, штрихкодом або SKU.
              Після додавання введіть кількість і ціну.
            </p>
          </div>

          <div
            className="purchase-search"
            ref={searchRef}
          >
            <label htmlFor="purchase-search-input">
              Знайти препарат
            </label>

            <input
              id="purchase-search-input"
              type="search"
              value={search}
              placeholder="Наприклад: парацетамол, ібупрофен..."
              autoComplete="off"
              disabled={loading || processing}
              onChange={event => {
                setSearch(event.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  setSearchOpen(false)
                }

                if (
                  event.key === 'Enter' &&
                  searchOpen &&
                  filteredProducts.length > 0
                ) {
                  event.preventDefault()
                  addProduct(filteredProducts[0])
                }
              }}
            />

            {searchOpen && (
              <div className="purchase-search-results">
                {filteredProducts.length === 0 ? (
                  <div className="purchase-search-empty">
                    Препаратів не знайдено
                  </div>
                ) : (
                  filteredProducts.map(product => {
                    const alreadyAdded = draftItems.some(
                      item =>
                        item.product_id === product.product_id
                    )

                    return (
                      <button
                        key={product.product_id}
                        type="button"
                        className="purchase-search-item"
                        disabled={
                          alreadyAdded ||
                          processing ||
                          draftItems.length >= MAX_ITEMS
                        }
                        onClick={() => addProduct(product)}
                      >
                        <span>
                          <strong>{product.name}</strong>

                          <small>
                            SKU: {product.sku ?? '—'}
                            {' · '}
                            Штрихкод: {product.barcode ?? '—'}
                          </small>
                        </span>

                        <span className="purchase-search-action">
                          {alreadyAdded
                            ? 'У кошику'
                            : '+ Додати'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* CART */}

          <div className="sale-cart-header">
            <h3>
              Позиції замовлення ({draftItems.length})
            </h3>

            <button
              type="button"
              className="sale-clear-button"
              disabled={
                draftItems.length === 0 || processing
              }
              onClick={() => {
                setDraftItems([])
                setError('')
              }}
            >
              Очистити кошик
            </button>
          </div>

          {draftItems.length === 0 ? (
            <div className="sale-empty-cart">
              Кошик закупівлі порожній.
              Знайдіть і додайте препарати.
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="sale-cart-table">
                <thead>
                  <tr>
                    <th>Препарат</th>
                    <th>Кількість</th>
                    <th>Ціна закупівлі</th>
                    <th>Сума</th>
                    <th>Дія</th>
                  </tr>
                </thead>

                <tbody>
                  {draftItems.map(item => (
                    <tr key={item.product_id}>
                      <td className="product-name">
                        {productMap.get(item.product_id)?.name ??
                          `Товар #${item.product_id}`}
                      </td>

                      <td>
                        <input
                          className="purchase-number-input"
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          value={item.quantity}
                          disabled={processing}
                          onChange={event =>
                            updateDraftItem(
                              item.product_id,
                              'quantity',
                              Number(event.target.value)
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          className="purchase-number-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          disabled={processing}
                          onChange={event =>
                            updateDraftItem(
                              item.product_id,
                              'unit_price',
                              Number(event.target.value)
                            )
                          }
                        />
                      </td>

                      <td>
                        <strong>
                          {money(
                            item.quantity * item.unit_price
                          )}
                        </strong>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="sale-remove-button"
                          disabled={processing}
                          onClick={() =>
                            removeDraftItem(item.product_id)
                          }
                        >
                          Видалити
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TOTAL */}

          <div className="sales-summary">
            <div>
              <span>Позицій</span>
              <strong>{draftItems.length}</strong>
            </div>

            <div>
              <span>Одиниць товару</span>
              <strong>{draftQuantity}</strong>
            </div>

            <div>
              <span>Загальна сума</span>
              <strong>{money(draftTotal)}</strong>
            </div>
          </div>

          <button
            className="sale-submit"
            type="submit"
            disabled={
              loading ||
              processing ||
              !supplierId ||
              !locationId ||
              draftItems.length === 0
            }
          >
            {processing
              ? 'Обробка...'
              : `Створити замовлення — ${money(draftTotal)}`}
          </button>

          <p className="sales-note">
            Закупівля спочатку створюється як DRAFT.
            Залишки не зміняться до фактичного
            приймання препаратів.
          </p>
        </form>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="sale-success" role="status">
            {success}
          </div>
        )}
      </section>

      {/* =================================================
          PURCHASE HISTORY
      ================================================= */}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Історія закупівель</h2>
            <p>
              Перегляд замовлень, підтвердження
              та контроль надходжень
            </p>
          </div>

          <button
            type="button"
            className="purchase-secondary-button"
            disabled={processing}
            onClick={async () => {
              try {
                await refreshOrders()
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : 'Не вдалося оновити список'
                )
              }
            }}
          >
            Оновити список
          </button>
        </div>

        {loading ? (
          <div className="message">
            Завантаження закупівель...
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Постачальник</th>
                  <th>Місце доставки</th>
                  <th>Дата</th>
                  <th>Позицій</th>
                  <th>Сума</th>
                  <th>Статус</th>
                  <th>Дія</th>
                </tr>
              </thead>

              <tbody>
                {orders.map(order => (
                  <tr key={order.purchase_order_id}>
                    <td>#{order.purchase_order_id}</td>
                    <td>{order.supplier_name}</td>
                    <td>{order.destination_name}</td>
                    <td>{order.order_date}</td>
                    <td>{order.item_count}</td>
                    <td>{money(order.total_amount)}</td>

                    <td>
                      <span
                        className={
                          `purchase-status ` +
                          statusClass(order.status)
                        }
                      >
                        {statusLabel(order.status)}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="purchase-secondary-button"
                        disabled={processing}
                        onClick={() =>
                          void openDetails(
                            order.purchase_order_id
                          )
                        }
                      >
                        Переглянути
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {orders.length === 0 && (
              <div className="message">
                Замовлень поки немає
              </div>
            )}
          </div>
        )}

        <div className="table-footer">
          Відображено {orders.length} замовлень
        </div>
      </section>

      {/* =================================================
          ORDER DETAILS
      ================================================= */}

      {(details || detailsLoading || detailError) && (
        <section className="panel purchase-details-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {details
                  ? `Замовлення #${details.order.purchase_order_id}`
                  : 'Деталі замовлення'}
              </h2>

              <p>
                Перегляд позицій і контроль надходження
              </p>
            </div>

            <button
              type="button"
              className="purchase-secondary-button"
              disabled={processing}
              onClick={closeDetails}
            >
              Закрити
            </button>
          </div>

          {detailsLoading && (
            <div className="message">
              Оновлення деталей замовлення...
            </div>
          )}

          {detailError && (
            <div className="error" role="alert">
              {detailError}
            </div>
          )}

          {detailSuccess && (
            <div className="sale-success" role="status">
              {detailSuccess}
            </div>
          )}

          {receiptNeedsVerification && (
            <div className="purchase-warning">
              <strong>
                Потрібно перевірити результат надходження
              </strong>

              <p>
                Дані могли бути вже записані в PostgreSQL.
                Повторне відправлення заблоковане.
                Оновіть деталі та звірте отриману кількість.
              </p>

              <button
                type="button"
                className="purchase-secondary-button"
                disabled={processing || detailsLoading}
                onClick={() => void verifyReceipt()}
              >
                Перевірити дані
              </button>
            </div>
          )}

          {details && (
            <>
              <div className="purchase-detail-summary">
                <div className="purchase-info-card">
                  <span>Постачальник</span>
                  <strong>
                    {details.order.supplier_name}
                  </strong>
                  <small>
                    ID: {details.order.supplier_id}
                  </small>
                </div>

                <div className="purchase-info-card">
                  <span>Місце доставки</span>
                  <strong>
                    {details.order.destination_name}
                  </strong>
                  <small>
                    ID: {details.order.destination_location_id}
                  </small>
                </div>

                <div className="purchase-info-card">
                  <span>Статус</span>
                  <strong>
                    {statusLabel(details.order.status)}
                  </strong>
                  <small>
                    {details.order.expected_date
                      ? `Очікується: ${details.order.expected_date}`
                      : 'Дата доставки не вказана'}
                  </small>
                </div>
              </div>

              <div className="purchase-actions">
                {details.order.status === 'DRAFT' && (
                  <button
                    type="button"
                    className="sale-add-button"
                    disabled={processing || detailsLoading}
                    onClick={prepareSubmitOrder}
                  >
                    Підтвердити замовлення
                  </button>
                )}

                <button
                  type="button"
                  className="purchase-secondary-button"
                  disabled={processing || detailsLoading}
                  onClick={() => void verifyReceipt()}
                >
                  Оновити деталі
                </button>
              </div>

              {/* ORDER ITEMS */}

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>ID позиції</th>
                      <th>Препарат</th>
                      <th>Замовлено</th>
                      <th>Отримано</th>
                      <th>Залишилось</th>
                      <th>Ціна</th>
                    </tr>
                  </thead>

                  <tbody>
                    {details.items.map(item => (
                      <tr key={item.purchase_order_item_id}>
                        <td>
                          #{item.purchase_order_item_id}
                        </td>

                        <td>{item.product_name}</td>
                        <td>{item.ordered_quantity}</td>
                        <td>{item.received_quantity}</td>

                        <td>
                          <strong>
                            {item.remaining_quantity}
                          </strong>
                        </td>

                        <td>{money(item.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* RECEIVING FORM */}

              {canReceive(details.order.status) &&
                remainingLines.length > 0 && (
                  <form
                    className="purchase-receive-form"
                    onSubmit={prepareReceive}
                  >
                    <div className="purchase-section-title">
                      <h3>Прийняти товари на склад</h3>
                      <p>
                        Оберіть препарати та вкажіть
                        фактичні дані отриманих партій.
                      </p>
                    </div>

                    <div className="table-wrapper">
                      <table className="purchase-receive-table">
                        <thead>
                          <tr>
                            <th>Обрати</th>
                            <th>Препарат</th>
                            <th>Залишилось</th>
                            <th>Прийняти</th>
                            <th>Номер партії</th>
                            <th>Придатний до</th>
                          </tr>
                        </thead>

                        <tbody>
                          {remainingLines.map(line => {
                            const itemId =
                              line.purchase_order_item_id

                            const row = receiptRows[itemId]

                            if (!row) return null

                            const disabled =
                              processing ||
                              receiptNeedsVerification ||
                              detailsLoading

                            return (
                              <tr key={itemId}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={row.selected}
                                    disabled={disabled}
                                    onChange={event =>
                                      updateReceiptRow(itemId, {
                                        selected:
                                          event.target.checked,
                                      })
                                    }
                                    aria-label={`Обрати ${line.product_name}`}
                                  />
                                </td>

                                <td>{line.product_name}</td>

                                <td>
                                  {line.remaining_quantity}
                                </td>

                                <td>
                                  <input
                                    type="number"
                                    min="1"
                                    max={Number(
                                      line.remaining_quantity
                                    )}
                                    step="1"
                                    value={row.quantity}
                                    disabled={
                                      disabled || !row.selected
                                    }
                                    required={row.selected}
                                    onChange={event =>
                                      updateReceiptRow(itemId, {
                                        quantity:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </td>

                                <td>
                                  <input
                                    type="text"
                                    maxLength={100}
                                    value={row.batch_number}
                                    placeholder="LOT-2026-001"
                                    disabled={
                                      disabled || !row.selected
                                    }
                                    required={row.selected}
                                    onChange={event =>
                                      updateReceiptRow(itemId, {
                                        batch_number:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </td>

                                <td>
                                  <input
                                    type="date"
                                    value={row.expiry_date}
                                    min={localToday()}
                                    disabled={
                                      disabled || !row.selected
                                    }
                                    required={row.selected}
                                    onChange={event =>
                                      updateReceiptRow(itemId, {
                                        expiry_date:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="purchase-receive-footer">
                      <span>
                        Обрано позицій: {selectedReceiptCount}
                      </span>

                      <button
                        type="submit"
                        className="sale-add-button"
                        disabled={
                          processing ||
                          detailsLoading ||
                          receiptNeedsVerification ||
                          selectedReceiptCount === 0
                        }
                      >
                        Підтвердити надходження
                      </button>
                    </div>

                    <p className="sales-note">
                      Надходження змінює реальні залишки
                      у локальній базі PostgreSQL.
                      Реального платежу не відбувається.
                    </p>
                  </form>
                )}

              {details.order.status === 'DRAFT' && (
                <div className="purchase-info-note">
                  Для приймання товарів спочатку
                  підтвердьте замовлення.
                </div>
              )}

              {details.order.status === 'RECEIVED' && (
                <div className="sale-success" role="status">
                  Усі позиції цього замовлення отримано.
                </div>
              )}

              {details.order.status === 'CANCELLED' && (
                <div className="purchase-info-note">
                  Це замовлення скасоване.
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* =================================================
          CUSTOM CONFIRMATION MODAL
      ================================================= */}

      {confirmDialog && (
        <div
          className="purchase-modal-backdrop"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget &&
              !processing
            ) {
              setConfirmDialog(null)
            }
          }}
        >
          <div
            className="purchase-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-confirm-title"
          >
            <div className="purchase-modal-icon">
              {confirmDialog.action === 'receive'
                ? '📦'
                : confirmDialog.action === 'submit'
                  ? '✓'
                  : '🧾'}
            </div>

            <h2 id="purchase-confirm-title">
              {confirmDialog.title}
            </h2>

            <p className="purchase-modal-description">
              {confirmDialog.description}
            </p>

            <div className="purchase-modal-summary">
              {confirmDialog.details.map((detail, index) => (
                <div key={index}>
                  {detail}
                </div>
              ))}
            </div>

            <div className="purchase-modal-actions">
              <button
                type="button"
                className="purchase-secondary-button"
                disabled={processing}
                onClick={() => setConfirmDialog(null)}
              >
                Скасувати
              </button>

              <button
                type="button"
                className="sale-add-button"
                disabled={processing}
                onClick={() => void confirmAction()}
              >
                {processing
                  ? 'Обробка...'
                  : 'Підтвердити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
