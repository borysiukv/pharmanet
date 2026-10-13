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
        <p>Порівнюйте наявність і орієнтовні ціни в аптеках. Онлайн-оплата та бронювання наразі недоступні.</p>
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
          </article>)}
        </section>
      )}
      <div className="customer-pagination">
        <button type="button" onClick={() => setPage(x => Math.max(0, x - 1))} disabled={page === 0 || loading}>← Назад</button>
        <span>Сторінка {page + 1}</span>
        <button type="button" onClick={() => setPage(x => x + 1)} disabled={loading || products.length < limit}>Далі →</button>
      </div>
      <p className="customer-disclaimer">Наявність може змінюватися. Інформація на сайті не замінює консультації фармацевта чи лікаря.</p>
    </main>
  )
}
