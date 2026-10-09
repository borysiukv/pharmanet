

import { useEffect, useRef, useState } from 'react'

import type { FormEvent } from 'react'

import {

  getProducts,

  getProductDetails,


  getCurrentUser,
  getLocations,
  type AuthUser,
  type Location,

  generateSaleRequestKey,

  type Product,

  type Sale,

  type SaleCartItem,

  type MultiSaleResponse,

} from './api'

// =====================================================

// TYPES

// =====================================================

interface ProductAvailability {

  price: number | null

  available: number

  prescriptionRequired: boolean

  loaded: boolean

  error: boolean

}

interface CartItem {

  product_id: number

  quantity: number

}

interface PendingRequest {

  key: string

  signature: string

}


const MAX_QUANTITY = 100

// =====================================================

// HELPERS

// =====================================================

const currencyFormatter = new Intl.NumberFormat('uk-UA', {

  minimumFractionDigits: 2,

  maximumFractionDigits: 2,

})

function formatMoney(value: number) {

  return `${currencyFormatter.format(value)} грн`

}

function formatDate(value: string) {

  const date = new Date(value)

  return Number.isNaN(date.getTime())

    ? value

    : date.toLocaleString('uk-UA')

}

function normalizeText(value: string) {

  return value

    .toLocaleLowerCase('uk-UA')

    .trim()

    .replace(/\s+/g, ' ')

}

function availabilityFromDetails(

  details: Awaited<ReturnType<typeof getProductDetails>>,
  locationId: number

): ProductAvailability {

  const price = details.prices.find(

    p => p.location_id === locationId

  )

  const stock = details.stock_by_location.find(

    s => s.location_id === locationId

  )

  return {

    price:

      price?.price != null

        ? Number(price.price)

        : null,

    available: Math.max(

      0,

      Number(stock?.available_quantity ?? 0)

    ),

    prescriptionRequired:

      details.product.prescription_required === true,

    loaded: true,

    error: false,

  }

}

function failedAvailability(): ProductAvailability {

  return {

    price: null,

    available: 0,

    prescriptionRequired: false,

    loaded: false,

    error: true,

  }

}

// =====================================================

// MAIN COMPONENT

// =====================================================

function SalesPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const locationId = user?.roles.includes("SYSTEM_ADMIN")
    ? selectedLocationId
    : (user?.location_id ?? null)
  const locationName = locations.find(l => l.location_id === locationId)?.name
    ?? user?.location_name ?? "—"


  // ===================================================

  // STATE

  // ===================================================

  const [products, setProducts] = useState<Product[]>([])

  const [sales, setSales] = useState<Sale[]>([])

  const [availability, setAvailability] = useState<

    Record<number, ProductAvailability>

  >({})

  const [cart, setCart] = useState<CartItem[]>([])

  const [search, setSearch] = useState('')

  const [searchOpen, setSearchOpen] = useState(false)

  const [loading, setLoading] = useState(true)

  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState('')

  const [historyError, setHistoryError] = useState('')

  const [success, setSuccess] =

    useState<MultiSaleResponse | null>(null)

  const pendingRequest =

    useRef<PendingRequest | null>(null)

  const submitLock = useRef(false)

  const searchContainerRef = useRef<HTMLDivElement>(null)

  // ===================================================

  useEffect(() => {
    let cancelled = false
    Promise.all([getCurrentUser(), getLocations()]).then(([person, places]) => {
      if (cancelled) return
      setUser(person)
      const pharmacyLocations = places.filter(l => l.location_type === 'PHARMACY' && l.is_active)
      setLocations(pharmacyLocations)
      if (person.roles.includes('SYSTEM_ADMIN')) {
        setSelectedLocationId(pharmacyLocations[0]?.location_id ?? null)
      } else {
        setSelectedLocationId(person.location_id)
      }
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Не вдалося завантажити користувача та аптеки')
    })
    return () => { cancelled = true }
  }, [])

  async function loadLocationSales(id: number): Promise<Sale[]> {
    const result = await fetch(`/api/sales?location_id=${id}`, { credentials: 'include' })
    if (!result.ok) {
      const body = await result.json().catch(() => ({}))
      throw new Error(typeof body.detail === 'string' ? body.detail : `Помилка завантаження продажів: ${result.status}`)
    }
    const data = await result.json()
    return data.sales as Sale[]
  }

  async function submitLocationSale(items: SaleCartItem[], requestKey: string, id: number): Promise<MultiSaleResponse> {
    const response = await fetch('/api/sales', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, request_key: requestKey, location_id: id }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(typeof body.detail === 'string' ? body.detail : `Помилка продажу: ${response.status}`)
    }
    return response.json() as Promise<MultiSaleResponse>
  }

  // INITIAL DATA

  // ===================================================

  useEffect(() => {

    let cancelled = false

    async function loadData() {
      if (locationId === null) { setLoading(false); return }
      setLoading(true)

      setError('')

      try {

        const [productsResult, salesResult] =

          await Promise.all([

            getProducts(),

            loadLocationSales(locationId),

          ])

        if (cancelled) return

        setProducts(productsResult.products)

        setSales(salesResult)

      } catch (err) {

        if (!cancelled) {

          setError(

            err instanceof Error

              ? err.message

              : 'Не вдалося завантажити дані'

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

  // ===================================================

  function changeLocation(id: number) {
    if (submitLock.current) return
    setCart([])
    setSuccess(null)
    setError('')
    setAvailability({})
    pendingRequest.current = null
    setSelectedLocationId(id)
  }

  // PRODUCT AVAILABILITY

  // ===================================================

  useEffect(() => {

    if (products.length === 0 || locationId === null) return

    let cancelled = false

    async function loadAvailability() {

      const results = await Promise.allSettled(

        products.map(async product => {

          const details = await getProductDetails(

            product.product_id

          )

          return {

            id: product.product_id,

            info: availabilityFromDetails(details, locationId!),

          }

        })

      )

      if (cancelled) return

      const next: Record<number, ProductAvailability> = {}

      results.forEach((result, index) => {

        const id = products[index].product_id

        next[id] =

          result.status === 'fulfilled'

            ? result.value.info

            : failedAvailability()

      })

      setAvailability(next)

    }

    void loadAvailability()

    return () => {

      cancelled = true

    }

  }, [products, locationId])

  // ===================================================

  // CLOSE SEARCH WHEN CLICKING OUTSIDE

  // ===================================================

  useEffect(() => {

    function handlePointerDown(event: PointerEvent) {

      if (

        searchContainerRef.current &&

        !searchContainerRef.current.contains(

          event.target as Node

        )

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

  // ===================================================

  // SEARCH PRODUCTS

  // ===================================================

  const normalizedSearch = normalizeText(search)

  const filteredProducts = products

    .filter(product => {

      if (!product.is_active) return false

      if (!normalizedSearch) return true

      const name = normalizeText(product.name)

      const barcode = normalizeText(product.barcode ?? '')

      const sku = normalizeText(product.sku ?? '')

      return (

        name.includes(normalizedSearch) ||

        barcode.includes(normalizedSearch) ||

        sku.includes(normalizedSearch)

      )

    })

    .sort((a, b) => {

      const aStarts = normalizeText(a.name)

        .startsWith(normalizedSearch)

      const bStarts = normalizeText(b.name)

        .startsWith(normalizedSearch)

      if (aStarts !== bStarts) {

        return aStarts ? -1 : 1

      }

      return a.name.localeCompare(b.name, 'uk')

    })

  // ===================================================

  // REQUEST STATE

  // ===================================================

  function resetRequestState() {

    pendingRequest.current = null

    setSuccess(null)

    setError('')

  }

  // ===================================================

  // ADD PRODUCT TO CART

  // ===================================================

  function addToCart(product: Product) {

    if (submitLock.current || locationId === null) return

    const info = availability[product.product_id]

    if (!info || !info.loaded || info.error) {

      setError(

        'Інформація про товар ще не завантажилася'

      )

      return

    }

    if (info.prescriptionRequired) {

      setError(

        'Рецептурний препарат не можна оформити в деморежимі'

      )

      return

    }

    if (

      info.price === null ||

      info.price <= 0 ||

      info.available < 1

    ) {

      setError(

        `Товар "${product.name}" недоступний для продажу`

      )

      return

    }

    const existing = cart.find(

      item => item.product_id === product.product_id

    )

    if (existing) {

      if (

        existing.quantity >= info.available ||

        existing.quantity >= MAX_QUANTITY

      ) {

        setError(

          'Досягнуто максимальної доступної кількості'

        )

        return

      }

      setCart(previous =>

        previous.map(item =>

          item.product_id === product.product_id

            ? {

                ...item,

                quantity: item.quantity + 1,

              }

            : item

        )

      )

    } else {

      setCart(previous => [

        ...previous,

        {

          product_id: product.product_id,

          quantity: 1,

        },

      ])

    }

    resetRequestState()

    setSearch('')

    setSearchOpen(false)

  }

  // ===================================================

  // CHANGE QUANTITY

  // ===================================================

  function changeQuantity(

    productId: number,

    newQuantity: number

  ) {

    if (submitLock.current) return

    if (newQuantity <= 0) {

      removeFromCart(productId)

      return

    }

    const info = availability[productId]

    if (!info || !Number.isInteger(newQuantity)) return

    const maximum = Math.min(

      MAX_QUANTITY,

      Math.floor(info.available)

    )

    if (maximum < 1) return

    const validQuantity = Math.min(

      newQuantity,

      maximum

    )

    setCart(previous =>

      previous.map(item =>

        item.product_id === productId

          ? {

              ...item,

              quantity: validQuantity,

            }

          : item

      )

    )

    resetRequestState()

  }

  // ===================================================

  // REMOVE PRODUCT

  // ===================================================

  function removeFromCart(productId: number) {

    if (submitLock.current) return

    setCart(previous =>

      previous.filter(

        item => item.product_id !== productId

      )

    )

    resetRequestState()

  }

  function clearCart() {

    if (submitLock.current) return

    setCart([])

    resetRequestState()

  }

  // ===================================================

  // CART CALCULATIONS

  // ===================================================

  const cartRows = cart.map(item => {

    const product = products.find(

      p => p.product_id === item.product_id

    )

    const info = availability[item.product_id]

    const price = info?.price ?? null

    return {

      ...item,

      name: product?.name ?? `Товар #${item.product_id}`,

      unit: product?.unit ?? 'шт.',

      price,

      available: info?.available ?? 0,

      prescriptionRequired:

        info?.prescriptionRequired ?? false,

      ready: info?.loaded === true && !info.error,

      total:

        price === null

          ? 0

          : price * item.quantity,

    }

  })

  const totalQuantity = cartRows.reduce(

    (sum, item) => sum + item.quantity,

    0

  )

  const totalAmount = cartRows.reduce(

    (sum, item) => sum + item.total,

    0

  )

  const cartValid =

    cartRows.length > 0 &&

    cartRows.every(item =>

      item.ready &&

      !item.prescriptionRequired &&

      item.price !== null &&

      item.price > 0 &&

      Number.isInteger(item.quantity) &&

      item.quantity >= 1 &&

      item.quantity <= MAX_QUANTITY &&

      item.quantity <= item.available

    )

  // ===================================================

  // SALES STATISTICS

  // ===================================================

  const paidSales = sales.filter(

    sale => sale.status === 'PAID'

  )

  const totalRevenue = paidSales.reduce(

    (sum, sale) =>

      sum + Number(sale.total_amount ?? 0),

    0

  )

  // ===================================================

  // REFRESH DATA

  // ===================================================

  async function refreshAfterSale() {
    if (locationId === null) return

    const [salesResult, stockResult] =

      await Promise.allSettled([

        loadLocationSales(locationId),

        Promise.allSettled(

          products.map(async product => {

            const details = await getProductDetails(

              product.product_id

            )

            return {

              id: product.product_id,

              info: availabilityFromDetails(details, locationId!),

            }

          })

        ),

      ])

    if (salesResult.status === 'fulfilled') {

      setSales(salesResult.value)

      setHistoryError('')

    } else {

      setHistoryError(

        'Не вдалося оновити історію продажів'

      )

    }

    if (stockResult.status === 'fulfilled') {

      const next: Record<number, ProductAvailability> = {}

      stockResult.value.forEach((result, index) => {

        const id = products[index].product_id

        next[id] =

          result.status === 'fulfilled'

            ? result.value.info

            : failedAvailability()

      })

      setAvailability(next)

    }

  }

  // ===================================================

  // CHECKOUT

  // ===================================================

  async function handleCheckout(

    event: FormEvent<HTMLFormElement>

  ) {

    event.preventDefault()

    if (submitLock.current || !cartValid || locationId === null) return

    const items: SaleCartItem[] = cart

      .map(item => ({

        product_id: item.product_id,

        quantity: item.quantity,

      }))

      .sort((a, b) => a.product_id - b.product_id)

    const signature = JSON.stringify({ location_id: locationId, items })

    const confirmed = window.confirm(

      `Оформити тестовий продаж?\n\n` +

      `Найменувань: ${items.length}\n` +

      `Кількість одиниць: ${totalQuantity}\n` +

      `Сума: ${formatMoney(totalAmount)}\n\n` +

      `Це змінить залишки в PostgreSQL.`

    )

    if (!confirmed) return

    if (

      !pendingRequest.current ||

      pendingRequest.current.signature !== signature

    ) {

      pendingRequest.current = {

        signature,

        key: generateSaleRequestKey(),

      }

    }

    const requestKey = pendingRequest.current.key

    submitLock.current = true

    setSubmitting(true)

    setError('')

    setSuccess(null)

    try {

      const result = await submitLocationSale(items, requestKey, locationId)

      setSuccess(result)

      setCart([])

      setSearch('')

      setSearchOpen(false)

      pendingRequest.current = null

      // A refresh error must not cause another sale.

      try {

        await refreshAfterSale()

      } catch {

        setHistoryError(

          'Продаж збережено, але оновлення даних не завершено'

        )

      }

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : 'Не вдалося оформити продаж'

      )

      // Keep the request key for a retry of this basket.

    } finally {

      submitLock.current = false

      setSubmitting(false)

    }

  }

  // ===================================================

  // RENDER

  // ===================================================

  return (

    <>

      {/* BREADCRUMB */}

      <div className="breadcrumb">

        Головна / Продажі

      </div>

      {/* HEADER */}

      <div className="page-heading">

        <div>

          <h1>Продажі</h1>

          <p>

            Оформлення покупок та історія операцій

            аптечної мережі

          </p>

        </div>

        <div className="status-pill">

          ● Тестовий режим

        </div>

      </div>

      {/* STATISTICS */}

      <div className="stats">

        <div className="stat-card">

          <span>Кількість продажів</span>

          <strong>{sales.length}</strong>

          <small>Завантажені операції</small>

        </div>

        <div className="stat-card">

          <span>Оплачені продажі</span>

          <strong>{paidSales.length}</strong>

          <small>Статус PAID</small>

        </div>

        <div className="stat-card">

          <span>Сума продажів</span>

          <strong>{formatMoney(totalRevenue)}</strong>

          <small>За завантаженою історією</small>

        </div>

      </div>

      {/* =================================================

          NEW SALE

      ================================================= */}

      <section className="panel sales-panel">

        <div className="panel-heading">

          <div>

            <h2>Новий продаж</h2>

            <p>

              {locationName} · {user ? `${user.first_name} ${user.last_name}` : "Завантаження..."}

            </p>

          </div>

        </div>

        {user?.roles.includes('SYSTEM_ADMIN') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <label htmlFor="sale-location">Аптека продажу</label>
            <select id="sale-location" value={locationId ?? ''}
              disabled={submitting} onChange={e => changeLocation(Number(e.target.value))}
              style={{ padding: 10, border: '1px solid #dce5e9', borderRadius: 8, minWidth: 230 }}>
              {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <form
          className="sales-form"

          onSubmit={handleCheckout}

        >

          {/* PRODUCT SEARCH */}

          <div

            className="sale-product-selector"

            ref={searchContainerRef}

          >

            <label htmlFor="sale-product-search">

              Пошук препарату

            </label>

            <div

              className="sale-search-container"

              style={{ position: 'relative' }}

            >

              <input

                id="sale-product-search"

                type="search"

                value={search}

                onChange={e => {

                  setSearch(e.target.value)

                  setSearchOpen(true)

                }}

                onFocus={() => setSearchOpen(true)}

                onKeyDown={e => {

                  if (e.key === 'Escape') {

                    setSearchOpen(false)

                  }

                  if (

                    e.key === 'Enter' &&

                    searchOpen &&

                    filteredProducts.length > 0

                  ) {

                    e.preventDefault()

                    addToCart(filteredProducts[0])

                  }

                }}

                placeholder="Введіть назву, штрихкод або SKU..."

                disabled={submitting}

                autoComplete="off"

                aria-controls="sale-search-results"

                aria-expanded={searchOpen}

              />

              {searchOpen && (

                <div

                  id="sale-search-results"

                  role="group"

                  aria-label="Результати пошуку препаратів"

                  className="sale-search-results"

                  style={{

                    position: 'absolute',

                    top: 'calc(100% + 5px)',

                    left: 0,

                    right: 0,

                    zIndex: 50,

                    background: 'white',

                    border: '1px solid #dce5e9',

                    borderRadius: '10px',

                    boxShadow: '0 12px 30px rgba(0,0,0,0.12)',

                    maxHeight: '320px',

                    overflowY: 'auto',

                  }}

                >

                  {loading ? (

                    <div style={{ padding: '16px' }}>

                      Завантаження товарів...

                    </div>

                  ) : filteredProducts.length === 0 ? (

                    <div style={{ padding: '16px' }}>

                      Препаратів не знайдено

                    </div>

                  ) : (

                    filteredProducts.map(product => {

                      const info =

                        availability[product.product_id]

                      const canSell =

                        info?.loaded === true &&

                        !info.error &&

                        !info.prescriptionRequired &&

                        info.price !== null &&

                        info.price > 0 &&

                        info.available >= 1

                      return (

                        <button

                          key={product.product_id}

                          type="button"

                          onClick={() => addToCart(product)}

                          disabled={

                            submitting ||

                            !canSell

                          }

                          style={{

                            display: 'flex',

                            width: '100%',

                            justifyContent: 'space-between',

                            alignItems: 'center',

                            gap: '15px',

                            padding: '14px 16px',

                            border: 'none',

                            borderBottom: '1px solid #edf1f3',

                            background: 'white',

                            cursor: canSell

                              ? 'pointer'

                              : 'not-allowed',

                            textAlign: 'left',

                            color: canSell

                              ? '#203442'

                              : '#88949e',

                            opacity: canSell ? 1 : 0.7,

                          }}

                        >

                          <span

                            style={{

                              display: 'flex',

                              flexDirection: 'column',

                              gap: '4px',

                              minWidth: 0,

                            }}

                          >

                            <strong>{product.name}</strong>

                            <small style={{ color: '#8997a3' }}>

                              {product.sku ?? 'Без SKU'}

                              {' · '}

                              {product.barcode ?? 'Без штрихкоду'}

                            </small>

                          </span>

                          <span

                            style={{

                              display: 'flex',

                              flexDirection: 'column',

                              gap: '4px',

                              textAlign: 'right',

                              flexShrink: 0,

                            }}

                          >

                            <strong>

                              {info?.price != null

                                ? formatMoney(info.price)

                                : '—'}

                            </strong>

                            <small>

                              {!info

                                ? 'Завантаження...'

                                : info.error

                                  ? 'Помилка даних'

                                  : info.prescriptionRequired

                                    ? 'Рецептурний'

                                    : `Доступно: ${info.available}`}

                            </small>

                          </span>

                        </button>

                      )

                    })

                  )}

                </div>

              )}

            </div>

            <p className="sales-note">

              Введіть назву препарату та натисніть

              на потрібний результат, щоб додати його в кошик.

            </p>

          </div>

          {/* CART HEADER */}

          <div className="sale-cart-header">

            <h3>Кошик</h3>

            <button

              type="button"

              className="sale-clear-button"

              onClick={clearCart}

              disabled={

                cart.length === 0 || submitting

              }

            >

              Очистити кошик

            </button>

          </div>

          {/* CART TABLE */}

          {cartRows.length === 0 ? (

            <div className="sale-empty-cart">

              Кошик порожній. Знайдіть та додайте препарат.

            </div>

          ) : (

            <div className="table-wrapper">

              <table className="sale-cart-table">

                <thead>

                  <tr>

                    <th>Препарат</th>

                    <th>Ціна</th>

                    <th>Доступно</th>

                    <th>Кількість</th>

                    <th>Сума</th>

                    <th>Дія</th>

                  </tr>

                </thead>

                <tbody>

                  {cartRows.map(item => (

                    <tr key={item.product_id}>

                      <td className="product-name">

                        {item.name}

                      </td>

                      <td>

                        {item.price !== null

                          ? formatMoney(item.price)

                          : '—'}

                      </td>

                      <td>{item.available}</td>

                      <td>

                        <div className="sale-quantity-control">

                          <button

                            type="button"

                            onClick={() =>

                              changeQuantity(

                                item.product_id,

                                item.quantity - 1

                              )

                            }

                            disabled={submitting}

                            aria-label={`Зменшити ${item.name}`}

                          >

                            −

                          </button>

                          <span>{item.quantity}</span>

                          <button

                            type="button"

                            onClick={() =>

                              changeQuantity(

                                item.product_id,

                                item.quantity + 1

                              )

                            }

                            disabled={

                              submitting ||

                              item.quantity >= item.available ||

                              item.quantity >= MAX_QUANTITY

                            }

                            aria-label={`Збільшити ${item.name}`}

                          >

                            +

                          </button>

                        </div>

                      </td>

                      <td>

                        <strong>

                          {formatMoney(item.total)}

                        </strong>

                      </td>

                      <td>

                        <button

                          type="button"

                          className="sale-remove-button"

                          onClick={() =>

                            removeFromCart(item.product_id)

                          }

                          disabled={submitting}

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

          {/* SUMMARY */}

          <div className="sales-summary">

            <div>

              <span>Найменувань</span>

              <strong>{cartRows.length}</strong>

            </div>

            <div>

              <span>Кількість одиниць</span>

              <strong>{totalQuantity}</strong>

            </div>

            <div>

              <span>Загальна сума</span>

              <strong>

                {formatMoney(totalAmount)}

              </strong>

            </div>

          </div>

          {/* CHECKOUT */}

          <button

            type="submit"

            className="sale-submit"

            disabled={

              !cartValid ||

              submitting ||

              loading

            }

          >

            {submitting

              ? 'Оформлення продажу...'

              : `Оформити продаж — ${formatMoney(totalAmount)}`}

          </button>

          <p className="sales-note">

            Демонстраційний режим. Продажі записуються

            в локальну PostgreSQL, товари списуються

            зі складських залишків, але реальна оплата

            не проводиться.

          </p>

        </form>

        {/* ERRORS */}

        {error && (

          <div className="error" role="alert">

            {error}

            {pendingRequest.current && (

              <p>

                Якщо результат запиту невідомий,

                не змінюйте кошик до перевірки продажу.

                Повторна спроба використовуватиме

                той самий ключ запиту.

              </p>

            )}

          </div>

        )}

        {/* SUCCESS */}

        {success && (

          <div className="sale-success" role="status">

            <strong>

              {success.duplicate

                ? 'Продаж уже було оформлено'

                : 'Продаж успішно створено!'}

            </strong>

            <div>

              Номер продажу: #{success.sale_id}

            </div>

            <div>

              Сума: {formatMoney(success.total_amount)}

            </div>

            <div>

              Статус: {success.status}

            </div>

          </div>

        )}

      </section>

      {/* =================================================

          SALES HISTORY

      ================================================= */}

      <section className="panel">

        <div className="panel-heading">

          <div>

            <h2>Історія продажів</h2>

            <p>

              Інформація з таблиць sales та sale_items

            </p>

          </div>

        </div>

        {historyError && (

          <div className="error" role="alert">

            {historyError}

          </div>

        )}

        {loading ? (

          <div className="message">

            Завантаження історії продажів...

          </div>

        ) : (

          <div className="table-wrapper">

            <table>

              <thead>

                <tr>

                  <th>ID</th>

                  <th>Дата</th>

                  <th>Аптека</th>

                  <th>Фармацевт</th>

                  <th>Позицій</th>

                  <th>Сума</th>

                  <th>Статус</th>

                </tr>

              </thead>

              <tbody>

                {sales.map(sale => (

                  <tr key={sale.sale_id}>

                    <td>#{sale.sale_id}</td>

                    <td>

                      {formatDate(sale.sale_datetime)}

                    </td>

                    <td>{sale.location_name}</td>

                    <td>{sale.employee_name}</td>

                    <td>{sale.item_count}</td>

                    <td>

                      <strong>

                        {formatMoney(

                          Number(sale.total_amount ?? 0)

                        )}

                      </strong>

                    </td>

                    <td>

                      <span

                        className={

                          sale.status === 'PAID'

                            ? 'badge active'

                            : 'badge inactive'

                        }

                      >

                        {sale.status === 'PAID'

                          ? 'Оплачено'

                          : sale.status}

                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            {sales.length === 0 && (

              <div className="message">

                Продажів поки немає

              </div>

            )}

          </div>

        )}

        <div className="table-footer">

          Відображено {sales.length} продажів

        </div>

      </section>

    </>

  )

}

export default SalesPage
