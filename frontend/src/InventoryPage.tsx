
import { useEffect, useState } from 'react'

import {
  getInventory,
  getLocations,
  blockInventoryBatch,
  unblockInventoryBatch,
  type InventoryItem,
  type Location,
} from './api'

import './InventoryPage.css'

type StockFilter =
  | 'ALL'
  | 'AVAILABLE'
  | 'LOW'
  | 'BLOCKED'
  | 'EXPIRED'

const LOW_STOCK_THRESHOLD = 10

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Невідома помилка сервера'
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '—'
}

function isExpired(item: InventoryItem) {
  if (!item.expiry_date) return false

  const today = new Date()
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  return item.expiry_date.slice(0, 10) <= todayString
}

function availableQuantity(item: InventoryItem): number {
  if (item.status === 'BLOCKED' || isExpired(item)) {
    return 0
  }

  return Math.max(0, Number(item.available_quantity))
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    AVAILABLE: 'Доступно',
    LOW_STOCK: 'Низький залишок',
    OUT_OF_STOCK: 'Немає в наявності',
    BLOCKED: 'Заблоковано',
  }

  return labels[status] ?? status
}

function InventoryPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<StockFilter>('ALL')

  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const [refreshKey, setRefreshKey] = useState(0)

  // ============================================
  // LOAD LOCATIONS
  // ============================================

  useEffect(() => {
    getLocations()
      .then(setLocations)
      .catch(() =>
        setError('Не вдалося завантажити аптеки')
      )
  }, [])

  // ============================================
  // LOAD INVENTORY
  // ============================================

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const data = await getInventory(
          locationId ? Number(locationId) : undefined
        )

        if (!cancelled) {
          setInventory(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [locationId, refreshKey])

  function refresh() {
    setSuccess('')
    setRefreshKey(key => key + 1)
  }

  // ============================================
  // FILTERS
  // ============================================

  const filtered = inventory.filter(item => {
    const q = search.trim().toLowerCase()

    const matchesSearch =
      item.product_name.toLowerCase().includes(q) ||
      (item.barcode ?? '').toLowerCase().includes(q) ||
      item.batch_number.toLowerCase().includes(q)

    const expired = isExpired(item)

    const low =
      item.status !== 'BLOCKED' &&
      !expired &&
      availableQuantity(item) > 0 &&
      availableQuantity(item) <= LOW_STOCK_THRESHOLD

    let matchesStatus = true

    if (statusFilter === 'AVAILABLE') {
      matchesStatus =
        item.status !== 'BLOCKED' &&
        !expired &&
        availableQuantity(item) > 0
    } else if (statusFilter === 'LOW') {
      matchesStatus = low
    } else if (statusFilter === 'BLOCKED') {
      matchesStatus = item.status === 'BLOCKED'
    } else if (statusFilter === 'EXPIRED') {
      matchesStatus = expired
    }

    return matchesSearch && matchesStatus
  })

  // ============================================
  // STATISTICS
  // ============================================

  const total = filtered.reduce(
    (sum, item) => sum + Number(item.quantity),
    0
  )

  const available = filtered.reduce(
    (sum, item) => sum + availableQuantity(item),
    0
  )

  const blockedCount = filtered.filter(
    item => item.status === 'BLOCKED'
  ).length

  const expiredCount = filtered.filter(isExpired).length

  const lowStockCount = filtered.filter(
    item =>
      item.status !== 'BLOCKED' &&
      !isExpired(item) &&
      availableQuantity(item) > 0 &&
      availableQuantity(item) <= LOW_STOCK_THRESHOLD
  ).length

  // ============================================
  // BLOCK / UNBLOCK
  // ============================================

  async function changeBlockStatus(item: InventoryItem) {
    if (busyId !== null) return

    const shouldBlock = item.status !== 'BLOCKED'

    const confirmed = window.confirm(
      shouldBlock
        ? `Заблокувати партію ${item.batch_number} (${item.product_name}) у локації "${item.location_name}"?`
        : `Розблокувати партію ${item.batch_number} (${item.product_name})?`
    )

    if (!confirmed) return

    setBusyId(item.inventory_id)
    setError('')
    setSuccess('')

    try {
      const result = shouldBlock
        ? await blockInventoryBatch(item.inventory_id)
        : await unblockInventoryBatch(item.inventory_id)

      // Re-read authoritative inventory data.
      const fresh = await getInventory(
        locationId ? Number(locationId) : undefined
      )

      setInventory(fresh)
      setSuccess(result.message)
    } catch (err) {
      setError(
        getErrorMessage(err) +
        '. Перевірте актуальний стан партії перед повторною дією.'
      )

      // The write might have succeeded even if the
      // response was lost, so refresh on failure too.
      setRefreshKey(key => key + 1)
    } finally {
      setBusyId(null)
    }
  }

  // ============================================
  // DISPLAY
  // ============================================

  return (
    <div className="inventory-page">
      <div className="breadcrumb">
        Головна / Складські залишки
      </div>

      <div className="page-heading">
        <div>
          <h1>Складські залишки</h1>

          <p>
            Облік препаратів, партій, термінів
            придатності та блокувань
          </p>
        </div>
      </div>

      {/* STATISTICS */}

      <div className="stats inventory-stats">
        <div className="stat-card">
          <span>Записи залишків</span>
          <strong>{filtered.length}</strong>
          <small>За поточними фільтрами</small>
        </div>

        <div className="stat-card">
          <span>Загальна кількість</span>
          <strong>{total}</strong>
          <small>Фізичний залишок</small>
        </div>

        <div className="stat-card">
          <span>Доступно</span>
          <strong>{available}</strong>
          <small>Без заблокованих і прострочених</small>
        </div>

        <div className="stat-card">
          <span>Заблоковані</span>
          <strong>{blockedCount}</strong>
          <small>Записи партій</small>
        </div>

        <div className="stat-card">
          <span>Критичний залишок</span>
          <strong>{lowStockCount}</strong>
          <small>Від 1 до {LOW_STOCK_THRESHOLD} одиниць</small>
        </div>

        <div className="stat-card">
          <span>Прострочені</span>
          <strong>{expiredCount}</strong>
          <small>За терміном придатності</small>
        </div>
      </div>

      {/* INVENTORY TABLE */}

      <section className="panel">
        <div className="panel-heading inventory-heading">
          <div>
            <h2>Залишки за аптеками</h2>

            <p>
              Дані з PostgreSQL: inventory, batches,
              products і locations
            </p>
          </div>

          <button
            type="button"
            className="purchase-secondary-button"
            onClick={refresh}
            disabled={loading || busyId !== null}
          >
            Оновити
          </button>
        </div>

        <div className="filters inventory-filters">
          <select
            value={locationId}
            disabled={busyId !== null}
            onChange={e => setLocationId(e.target.value)}
            aria-label="Фільтр за аптекою"
          >
            <option value="">
              Усі аптеки та склади
            </option>

            {locations
              .filter(l => l.location_type !== 'OFFICE')
              .map(l => (
                <option
                  key={l.location_id}
                  value={l.location_id}
                >
                  {l.name}
                </option>
              ))}
          </select>

          <input
            type="search"
            placeholder="Назва, штрихкод або партія..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            value={statusFilter}
            onChange={e =>
              setStatusFilter(e.target.value as StockFilter)
            }
            aria-label="Фільтр за статусом"
          >
            <option value="ALL">Усі статуси</option>
            <option value="AVAILABLE">Доступні</option>
            <option value="LOW">Критичний залишок</option>
            <option value="BLOCKED">Заблоковані</option>
            <option value="EXPIRED">Прострочені</option>
          </select>
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="inventory-success" role="status">
            {success}
          </div>
        )}

        {loading ? (
          <div className="message">
            Завантаження залишків...
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Аптека / склад</th>
                  <th>Товар</th>
                  <th>Партія</th>
                  <th>Термін придатності</th>
                  <th>Усього</th>
                  <th>Резерв</th>
                  <th>Доступно</th>
                  <th>Статус</th>
                  <th>Дія</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(item => {
                  const expired = isExpired(item)

                  const low =
                    item.status !== 'BLOCKED' &&
                    !expired &&
                    availableQuantity(item) > 0 &&
                    availableQuantity(item) <= LOW_STOCK_THRESHOLD

                  const blocked = item.status === 'BLOCKED'

                  const cannotUnblock =
                    blocked && expired

                  return (
                    <tr key={item.inventory_id}>
                      <td>{item.location_name}</td>

                      <td className="product-name">
                        {item.product_name}
                      </td>

                      <td>{item.batch_number}</td>

                      <td>
                        <span
                          className={
                            expired
                              ? 'inventory-expired-date'
                              : ''
                          }
                        >
                          {formatDate(item.expiry_date)}
                        </span>
                      </td>

                      <td>{item.quantity}</td>

                      <td>{item.reserved_quantity}</td>

                      <td>
                        <strong>
                          {availableQuantity(item)}
                        </strong>
                      </td>

                      <td>
                        <div className="inventory-statuses">
                          <span
                            className={`inventory-status ${
                              blocked
                                ? 'inventory-status-blocked'
                                : 'inventory-status-available'
                            }`}
                          >
                            {statusLabel(item.status)}
                          </span>

                          {expired && (
                            <span className="inventory-status inventory-status-expired">
                              Прострочено
                            </span>
                          )}

                          {low && (
                            <span className="inventory-status inventory-status-low">
                              Критичний
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={
                            blocked
                              ? 'inventory-action-unblock'
                              : 'inventory-action-block'
                          }
                          disabled={
                            busyId !== null ||
                            cannotUnblock
                          }
                          title={
                            cannotUnblock
                              ? 'Прострочену партію не можна розблокувати'
                              : ''
                          }
                          onClick={() =>
                            void changeBlockStatus(item)
                          }
                        >
                          {busyId === item.inventory_id
                            ? 'Обробка...'
                            : blocked
                              ? 'Розблокувати'
                              : 'Заблокувати'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="message">
                Залишків за поточними фільтрами не знайдено
              </div>
            )}
          </div>
        )}

        <div className="table-footer">
          Відображено {filtered.length} записів
        </div>
      </section>
    </div>
  )
}

export default InventoryPage
