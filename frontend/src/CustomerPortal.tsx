import { useEffect, useState } from 'react'
import './CustomerPortal.css'

type Pharmacy = {
  location_id: number
  name: string
  address: string | null
  phone: string | null
}

type CustomerProduct = {
  product_id: number
  name: string
  category: string | null
  manufacturer: string | null
  unit: string
  prescription_required: boolean
  price: number | null
  in_stock: boolean
}

type Props = { onBack: () => void }
type BookingResponse = { reservation_id: number; product_name: string; location_name: string; quantity: number; expires_at: string; message: string }

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal, credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Помилка сервера: ${response.status}`)
  return (await response.json()) as T
}

export default function CustomerPortal({ onBack }: Props) {
  const [locations, setLocations] = useState<Pharmacy[]>([])
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<CustomerProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [bookingProduct, setBookingProduct] = useState<CustomerProduct | null>(null)
  const [bookingQuantity, setBookingQuantity] = useState(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [bookingError, setBookingError] = useState('')
  const [bookingBusy, setBookingBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<BookingResponse | null>(null)
  const limit = 50

  useEffect(() => {
    const controller = new AbortController()
    fetchJson<{ locations: Pharmacy[] }>('/public/locations', controller.signal)
      .then(result => setLocations(result.locations))
      .catch(err => { if (!controller.signal.aborted) setError(String(err)) })
    return () => controller.abort()
  }, [])

  useEffect(() => setPage(0), [search, locationId])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) })
        if (search.trim()) params.set('search', search.trim())
        if (locationId) params.set('location_id', locationId)
        const result = await fetchJson<{ products: CustomerProduct[] }>(
          `/public/products?${params}`, controller.signal,
        )
        if (!controller.signal.aborted) setProducts(result.products)
      } catch (err) {
        if (!controller.signal.aborted) { setError(String(err)); setProducts([]) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 280)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [search, locationId, page])

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bookingProduct || !locationId || bookingBusy) return
    setBookingBusy(true)
    setBookingError('')
    try {
      const response = await fetch('/api/public/reservations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: bookingProduct.product_id,
          location_id: Number(locationId),
          quantity: bookingQuantity,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`)
      setConfirmation(body as BookingResponse)
      setBookingProduct(null)
    } catch (err) { setBookingError(err instanceof Error ? err.message : 'Помилка бронювання') }
    finally { setBookingBusy(false) }
  }

  const visible = inStockOnly ? products.filter(p => p.in_stock) : products
  const money = (v: number) => `${Number(v).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`

  return (
    <main className="customer-portal">
      <header className="customer-header">
        <div className="customer-logo">✚ <span>PharmaNet</span><small>Для клієнтів</small></div>
        <button type="button" className="customer-back" onClick={onBack}>← Змінити режим</button>
      </header>
      <section className="customer-hero">
        <p className="customer-eyebrow">Аптечна мережа PharmaNet</p>
        <h1>Знайдіть потрібні препарати</h1>
        <p>Порівнюйте наявність і орієнтовні ціни в аптеках. Оберіть аптеку, перевірте ціну й наявність та забронюйте товар на 30 хвилин. Оплата — в аптеці.</p>
      </section>
      <section className="customer-filters">
        <label>Пошук препарату
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Введіть назву препарату" type="search" />
        </label>
        <label>Аптека
          <select value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">Усі аптеки</option>
            {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
          </select>
        </label>
        <label className="customer-check"><input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} /> Лише в наявності</label>
      </section>
      {error && <p className="customer-error" role="alert">{error}</p>}
      {confirmation && <section className="customer-reservation-success" role="status">
        <strong>Бронювання №{confirmation.reservation_id} підтверджено!</strong>
        <p>{confirmation.product_name}, {confirmation.quantity} од. · {confirmation.location_name}</p>
        <p>Дійсне до {new Date(confirmation.expires_at).toLocaleString('uk-UA')}. Оплата на касі аптеки.</p>
        <button type="button" onClick={() => setConfirmation(null)}>Зрозуміло</button>
      </section>}
      {loading ? <p className="customer-empty">Завантаження каталогу...</p> : (
        <section className="customer-product-grid" aria-label="Каталог препаратів">
          {visible.length === 0 && <p className="customer-empty">За вашими фільтрами нічого не знайдено.</p>}
          {visible.map(p => <article className="customer-product" key={p.product_id}>
            <span className="customer-category">{p.category || 'Препарати'}</span>
            <h2>{p.name}</h2>
            <p className="customer-muted">{p.manufacturer || 'Виробник не вказаний'} · {p.unit}</p>
            {p.prescription_required && <p className="customer-rx">Рецептурний препарат</p>}
            <div className="customer-product-bottom">
              <strong>{p.price == null ? 'Ціну уточнюйте' : money(p.price)}</strong>
              <span className={p.in_stock ? 'customer-available' : 'customer-unavailable'}>{p.in_stock ? 'Є в наявності' : 'Немає в наявності'}</span>
            </div>
            {!p.prescription_required && <button type="button" className="customer-reserve-button"
              disabled={!p.in_stock || p.price == null || !locationId}
              onClick={() => { setBookingProduct(p); setBookingQuantity(1); setBookingError('') }}>
              {!locationId ? 'Оберіть аптеку для бронювання' : 'Забронювати на 30 хв'}
            </button>}
          </article>)}
        </section>
      )}
      <div className="customer-pagination">
        <button type="button" onClick={() => setPage(x => Math.max(0, x - 1))} disabled={page === 0 || loading}>← Назад</button>
        <span>Сторінка {page + 1}</span>
        <button type="button" onClick={() => setPage(x => x + 1)} disabled={loading || products.length < limit}>Далі →</button>
      </div>
      {bookingProduct && <div className="customer-booking-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !bookingBusy) setBookingProduct(null) }}>
        <section className="customer-booking-modal" role="dialog" aria-modal="true" aria-label="Бронювання препарату">
          <button type="button" className="customer-booking-close" onClick={() => setBookingProduct(null)}>×</button>
          <h2>Бронювання препарату</h2>
          <p><strong>{bookingProduct.name}</strong> · {locations.find(l => String(l.location_id) === locationId)?.name}</p>
          <p>Резерв на 30 хвилин. Оплата безпосередньо в аптеці.</p>
          <form onSubmit={submitBooking} className="customer-booking-form">
            <label>Ім’я<input required minLength={2} maxLength={50} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" /></label>
            <label>Прізвище<input required minLength={2} maxLength={50} value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" /></label>
            <label>Телефон<input required type="tel" minLength={7} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="+380..." /></label>
            <label>Кількість<input type="number" min="1" max="10" value={bookingQuantity} onChange={e => setBookingQuantity(Math.max(1,Math.min(10,Number(e.target.value) || 1)))} /></label>
            {bookingError && <p className="customer-error" role="alert">{bookingError}</p>}
            <button type="submit" disabled={bookingBusy}>{bookingBusy ? 'Бронюємо…' : 'Підтвердити бронювання'}</button>
          </form>
        </section>
      </div>}
      <p className="customer-disclaimer">Наявність може змінюватися. Інформація на сайті не замінює консультації фармацевта чи лікаря.</p>
    </main>
  )
}
