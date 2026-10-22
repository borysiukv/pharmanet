import { useEffect, useMemo, useRef, useState } from 'react'
import { createMultiSale, generateSaleRequestKey, getCurrentUser, getLocations, getSales, type AuthUser, type Location, type Sale } from './api'
import './SalesPage.css'

type CatalogItem = {
  product_id: number
  name: string
  sku: string | null
  barcode: string | null
  price: number | null
  available: number
  prescription_required: boolean
}
type CartLine = { product: CatalogItem; quantity: number }
type Pickup = { reservation_id: number; first_name: string; last_name: string; phone: string; location_name: string; product_name: string; quantity: number; expiry_date: string; status: string }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'include', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${response.status}`)
  return data as T
}
const money = (v: number) => `${v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`
const dateTime = (v: string) => new Date(v).toLocaleString('uk-UA')

export default function SalesPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [bookings, setBookings] = useState<Pickup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const submitLock = useRef(false)
  const pendingKey = useRef<{ signature: string; key: string } | null>(null)

  const admin = user?.roles.includes('SYSTEM_ADMIN') ?? false
  const pharmacyName = locations.find(l => l.location_id === locationId)?.name ?? user?.location_name ?? 'Оберіть аптеку'
  const revenue = sales.filter(s => s.status === 'PAID').reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0)
  const total = useMemo(() => cart.reduce((sum, x) => sum + Number(x.product.price ?? 0) * x.quantity, 0), [cart])
  const qtyTotal = cart.reduce((sum, x) => sum + x.quantity, 0)

  useEffect(() => {
    let alive = true
    Promise.all([getCurrentUser(), getLocations()]).then(([u, locs]) => {
      if (!alive) return
      const ph = locs.filter(l => l.is_active && l.location_type === 'PHARMACY')
      setUser(u); setLocations(ph)
      setLocationId(u.roles.includes('SYSTEM_ADMIN') ? ph[0]?.location_id ?? null : u.location_id ?? null)
    }).catch(e => { if (alive) { setError(String(e)); setLoading(false) } })
    return () => { alive = false }
  }, [])

  async function reloadHistory(id: number) {
    try {
      const [history, reservations] = await Promise.all([
        getSales(id),
        request<{ reservations: Pickup[] }>('/reservations').catch(() => ({ reservations: [] })),
      ])
      setSales(history.filter(s => s.location_id === id))
      setBookings(reservations.reservations.filter(b => b.status === 'CONFIRMED' && (admin ? b.location_name === pharmacyName : true)))
    } catch (e) { setError(e instanceof Error ? e.message : 'Не вдалося завантажити історію') }
  }

  useEffect(() => {
    if (!locationId) { setLoading(false); return }
    let alive = true
    setLoading(true); setError('')
    const id = locationId
    Promise.all([getSales(id), request<{ reservations: Pickup[] }>('/reservations')])
      .then(([history, b]) => { if (alive) { setSales(history.filter(s => s.location_id === id)); setBookings(b.reservations.filter(x => x.location_name === pharmacyName && x.status === 'CONFIRMED')) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [locationId, pharmacyName])

  useEffect(() => {
    if (!locationId) return
    const controller = new AbortController()
    const id = locationId
    const timer = window.setTimeout(() => {
      request<{ products: CatalogItem[] }>(`/sales/catalog?location_id=${id}&search=${encodeURIComponent(search)}&limit=80`, { signal: controller.signal })
        .then(d => { if (!controller.signal.aborted) setResults(d.products) })
        .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)) })
    }, 180)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [locationId, search, notice])

  function addProduct(p: CatalogItem) {
    if (p.prescription_required || p.price == null || p.price <= 0 || Number(p.available) < 1) return
    setCart(before => {
      const existing = before.find(x => x.product.product_id === p.product_id)
      if (!existing) return [...before, { product: p, quantity: 1 }]
      return before.map(x => x.product.product_id === p.product_id ? { ...x, quantity: Math.min(100, Math.floor(p.available), x.quantity + 1) } : x)
    })
    setNotice(''); setError(''); pendingKey.current = null
  }
  function updateQty(id: number, next: number) {
    if (!Number.isFinite(next)) return
    setCart(before => before.map(x => x.product.product_id === id
      ? { ...x, quantity: Math.max(1, Math.min(100, Math.floor(x.product.available), Math.floor(next))) }
      : x))
    pendingKey.current = null
  }
  function changePharmacy(id: number) {
    setLocationId(id); setCart([]); setResults([]); setSearch(''); setError(''); setNotice(''); pendingKey.current = null
  }

  async function checkout() {
    if (submitLock.current || busy || !locationId || cart.length === 0) return
    const payload = cart.map(x => ({ product_id: x.product.product_id, quantity: x.quantity })).sort((a, b) => a.product_id - b.product_id)
    if (cart.some(x => x.product.prescription_required || x.product.price == null || x.quantity > x.product.available)) {
      setError('Оновіть кошик: товар недоступний або перевищено залишок'); return
    }
    if (!window.confirm(`Провести тестовий продаж на ${money(total)}?\nТоварів: ${qtyTotal}\nЦе змінить залишки БД.`)) return
    const signature = JSON.stringify([locationId, payload])
    if (pendingKey.current?.signature !== signature) pendingKey.current = { signature, key: generateSaleRequestKey() }
    const key = pendingKey.current.key
    submitLock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const sale = await createMultiSale(payload, key, locationId)
      setNotice(`Продаж №${sale.sale_id} проведено. Сума: ${money(Number(sale.total_amount))}`)
      setCart([]); setSearch(''); pendingKey.current = null
      await reloadHistory(locationId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не вдалося завершити продаж') }
    finally { submitLock.current = false; setBusy(false) }
  }

  async function cancelBooking(id: number) {
    if (!window.confirm(`Скасувати бронювання №${id} і повернути резерв на склад?`)) return
    setBusy(true); setError('')
    try {
      await request(`/reservations/${id}/cancel`, { method: 'POST' })
      setNotice(`Бронювання №${id} скасовано`)
      setBookings(prev => prev.filter(x => x.reservation_id !== id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Помилка скасування') }
    finally { setBusy(false) }
  }

  return <main className="ph-sales">
    <div className="ph-sales-head"><div><span className="ph-sales-subtitle">Головна / Продажі</span><h1>Продажі</h1><p>Каса аптеки, історія операцій та бронювання клієнтів</p></div><span className="ph-sales-demo">● Тестовий режим</span></div>
    <div className="ph-sales-kpis"><div><small>Продажів</small><strong>{sales.length}</strong></div><div><small>Оплачених</small><strong>{sales.filter(x => x.status === 'PAID').length}</strong></div><div><small>Сума</small><strong>{money(revenue)}</strong></div></div>
    {error && <div className="ph-sales-alert" role="alert">{error}</div>}{notice && <div className="ph-sales-success" role="status">{notice}</div>}
    <section className="ph-sales-box"><div className="ph-sales-section-head"><div><h2>Новий продаж</h2><p>{pharmacyName} · {user ? `${user.first_name} ${user.last_name}` : 'Завантаження...'}</p></div></div>
      {admin && <label className="ph-sales-label">Аптека продажу<select value={locationId ?? ''} onChange={e => changePharmacy(Number(e.target.value))} disabled={busy}>{locations.map(x => <option key={x.location_id} value={x.location_id}>{x.name}</option>)}</select></label>}
      <div className="ph-sales-columns"><div><label className="ph-sales-label">Пошук препарату<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Назва, штрихкод або SKU" disabled={!locationId || busy} /></label><p className="ph-sales-help">Оберіть товар зі списку — ціни й наявність перевіряються для цієї аптеки.</p>
        <div className="ph-sales-results" aria-label="Товари для продажу">{results.length === 0 ? <p className="ph-sales-empty">Немає товарів за запитом у цій аптеці.</p> : results.map(p => {
          const canSell = !p.prescription_required && p.price != null && Number(p.price) > 0 && Number(p.available) >= 1
          return <button key={p.product_id} type="button" className="ph-sales-result" disabled={!canSell || busy} onClick={() => addProduct(p)}><span><b>{p.name}</b><small>{p.sku || p.barcode || `№${p.product_id}`}</small></span><span className="ph-sales-result-right"><b>{p.price == null ? 'Без ціни' : money(Number(p.price))}</b><small>{p.prescription_required ? 'Потребує рецепта' : `Доступно: ${Number(p.available)}`}</small></span><span className="ph-sales-plus">+</span></button>
        })}</div></div>
        <div className="ph-sales-cart"><h3>Кошик <span>({qtyTotal})</span></h3>{cart.length === 0 ? <p className="ph-sales-empty">Додайте препарати зі списку ліворуч</p> : cart.map(x => <div key={x.product.product_id} className="ph-sales-cart-row"><div><b>{x.product.name}</b><small>{money(Number(x.product.price))} / од.</small></div><div className="ph-sales-qty"><button type="button" onClick={() => updateQty(x.product.product_id, x.quantity-1)} disabled={busy || x.quantity<=1}>−</button><span>{x.quantity}</span><button type="button" onClick={() => updateQty(x.product.product_id, x.quantity+1)} disabled={busy || x.quantity>=Math.min(100,Math.floor(x.product.available))}>+</button></div><button className="ph-sales-remove" type="button" onClick={() => { setCart(prev => prev.filter(z => z.product.product_id !== x.product.product_id)); pendingKey.current = null }} disabled={busy}>×</button></div>)}<div className="ph-sales-total"><span>Разом</span><strong>{money(total)}</strong></div><button type="button" className="ph-sales-checkout" onClick={checkout} disabled={busy || cart.length===0 || !locationId}>{busy ? 'Опрацьовуємо…' : 'Провести продаж'}</button></div>
      </div>
    </section>
    <section className="ph-sales-box"><div className="ph-sales-section-head"><h2>Бронювання на самовивіз</h2><small>Автоматичний резерв на 30 хвилин</small></div>{bookings.length===0 ? <p className="ph-sales-empty">Активних бронювань немає</p> : <div className="ph-sales-table-wrap"><table><thead><tr><th>№</th><th>Клієнт</th><th>Товар</th><th>Кількість</th><th>Дійсне до</th><th>Дія</th></tr></thead><tbody>{bookings.map(b => <tr key={b.reservation_id}><td>#{b.reservation_id}</td><td>{b.first_name} {b.last_name}<small>{b.phone}</small></td><td>{b.product_name}</td><td>{b.quantity}</td><td>{dateTime(b.expiry_date)}</td><td><button type="button" className="ph-sales-small-button" onClick={() => cancelBooking(b.reservation_id)} disabled={busy}>Скасувати</button></td></tr>)}</tbody></table></div>}</section>
    <section className="ph-sales-box"><div className="ph-sales-section-head"><h2>Історія продажів</h2><span>{loading ? 'Завантаження…' : `${sales.length} операцій`}</span></div>{sales.length===0 ? <p className="ph-sales-empty">Поки немає продажів у цій аптеці</p> : <div className="ph-sales-table-wrap"><table><thead><tr><th>№</th><th>Дата</th><th>Аптека</th><th>Позицій</th><th>Сума</th><th>Статус</th></tr></thead><tbody>{sales.map(s => <tr key={s.sale_id}><td>#{s.sale_id}</td><td>{dateTime(s.sale_datetime)}</td><td>{s.location_name}</td><td>{s.item_count}</td><td>{money(Number(s.total_amount || 0))}</td><td>{s.status==='PAID' ? 'Оплачено' : s.status}</td></tr>)}</tbody></table></div>}</section>
  </main>
}
