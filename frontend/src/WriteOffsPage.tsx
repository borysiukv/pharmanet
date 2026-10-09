
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  getLocations,
  getWriteOffStock,
  getWriteOffs,
  getWriteOffDetails,
  getExpiryAlerts,
  createWriteOff,
  approveWriteOff,
  completeWriteOff,
  cancelWriteOff,
  type Location,
  type WriteOff,
  type WriteOffDetails,
  type WriteOffStock,
  type ExpiryAlert,
  type WriteOffReason,
} from './api'

import './WriteOffsPage.css'

const EMPLOYEE_ID = 1

type CartItem = {
  batch_id: number
  product_name: string
  batch_number: string
  expiry_date: string | null
  available_quantity: number
  quantity: number
}

type Action = 'create' | 'approve' | 'complete' | 'cancel'

const reasons: Record<WriteOffReason, string> = {
  EXPIRED: 'Закінчився термін придатності',
  DAMAGED: 'Пошкоджено',
  LOST: 'Втрачено',
  OTHER: 'Інша причина',
}

const statuses: Record<string, string> = {
  CREATED: 'Створено',
  APPROVED: 'Погоджено',
  COMPLETED: 'Списано',
  CANCELLED: 'Скасовано',
}

function errText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Невідома помилка'
}

function dateText(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '—'
}

export default function WriteOffsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [stock, setStock] = useState<WriteOffStock[]>([])
  const [history, setHistory] = useState<WriteOff[]>([])
  const [alerts, setAlerts] = useState<ExpiryAlert[]>([])
  const [reason, setReason] = useState<WriteOffReason>('EXPIRED')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])

  const [details, setDetails] = useState<WriteOffDetails | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [stockLoading, setStockLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<Action | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailSuccess, setDetailSuccess] = useState('')
  const [uncertain, setUncertain] = useState(false)

  const operationLock = useRef(false)
  const stockRequest = useRef(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [l, w, a] = await Promise.all([
          getLocations(),
          getWriteOffs(),
          getExpiryAlerts(30),
        ])

        if (!active) return

        setLocations(l)
        setHistory(w)
        setAlerts(a)

        const first = l.find(
          item =>
            item.is_active &&
            item.location_type === 'WAREHOUSE'
        ) ?? l.find(item => item.is_active)

        if (first) {
          setLocationId(String(first.location_id))
        }
      } catch (e) {
        if (active) setError(errText(e))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const id = Number(locationId)
    const token = ++stockRequest.current

    if (!id) {
      setStock([])
      setStockLoading(false)
      return
    }

    setStockLoading(true)

    getWriteOffStock(id)
      .then(rows => {
        if (token === stockRequest.current) {
          setStock(rows)
        }
      })
      .catch(e => {
        if (token === stockRequest.current) {
          setStock([])
          setError(errText(e))
        }
      })
      .finally(() => {
        if (token === stockRequest.current) {
          setStockLoading(false)
        }
      })
  }, [locationId])

  async function refreshData() {
    const [w, a, s] = await Promise.all([
      getWriteOffs(),
      getExpiryAlerts(30),
      locationId
        ? getWriteOffStock(Number(locationId))
        : Promise.resolve([] as WriteOffStock[]),
    ])

    setHistory(w)
    setAlerts(a)
    setStock(s)
  }

  async function openDetails(id: number) {
    if (operationLock.current) return
    setDetailError('')
    setDetailSuccess('')

    try {
      setDetails(await getWriteOffDetails(id))
    } catch (e) {
      setDetailError(errText(e))
    }
  }

  function addItem(item: WriteOffStock) {
    if (busy || uncertain) return

    if (cart.some(x => x.batch_id === item.batch_id)) {
      setError('Ця партія вже є в списку')
      return
    }

    if (cart.length >= 100) {
      setError('Максимум 100 партій')
      return
    }

    const available = Number(item.available_quantity)

    if (available < 1) {
      setError('Недостатньо товару')
      return
    }

    setCart(current => [
      ...current,
      {
        batch_id: item.batch_id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        available_quantity: available,
        quantity: 1,
      },
    ])
    setError('')
  }

  function changeQuantity(batchId: number, value: number) {
    setCart(current =>
      current.map(item =>
        item.batch_id === batchId
          ? { ...item, quantity: value }
          : item
      )
    )
  }

  const filtered = stock.filter(item => {
    const q = search.trim().toLocaleLowerCase('uk-UA')

    return (
      !q ||
      item.product_name
        .toLocaleLowerCase('uk-UA')
        .includes(q) ||
      item.batch_number
        .toLocaleLowerCase('uk-UA')
        .includes(q)
    )
  })

  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  function prepareCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy || uncertain) return

    if (!locationId || cart.length === 0) {
      setError('Виберіть локацію та хоча б одну партію')
      return
    }

    for (const item of cart) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > item.available_quantity
      ) {
        setError(
          `Некоректна кількість для ${item.product_name}`
        )
        return
      }
    }

    setModal('create')
  }

  function prepareAction(action: Action) {
    if (!details || busy || uncertain) return

    if (
      (action === 'approve' &&
        details.write_off.status !== 'CREATED') ||
      (action === 'complete' &&
        details.write_off.status !== 'APPROVED') ||
      (action === 'cancel' &&
        !['CREATED', 'APPROVED'].includes(
          details.write_off.status
        ))
    ) return

    setModal(action)
  }

  async function executeAction() {
    if (!modal || operationLock.current) return

    const action = modal
    setModal(null)
    operationLock.current = true
    setBusy(true)
    setError('')
    setSuccess('')
    setDetailError('')
    setDetailSuccess('')

    let succeeded = false

    try {
      if (action === 'create') {
        const result = await createWriteOff({
          location_id: Number(locationId),
          employee_id: EMPLOYEE_ID,
          reason,
          items: cart.map(item => ({
            batch_id: item.batch_id,
            quantity: item.quantity,
          })),
        })

        succeeded = true
        setSuccess(
          `Списання #${result.write_off_id} створено`
        )
        setCart([])
      } else {
        if (!details) return

        const id = details.write_off.write_off_id

        let result

        if (action === 'approve') {
          result = await approveWriteOff(id, EMPLOYEE_ID)
        } else if (action === 'complete') {
          result = await completeWriteOff(id, EMPLOYEE_ID)
        } else {
          result = await cancelWriteOff(id, EMPLOYEE_ID)
        }

        succeeded = true
        setDetailSuccess(
          `Списання #${id}: ${statuses[result.status]}`
        )
      }
    } catch (e) {
      setUncertain(true)

      const message =
        errText(e) +
        '. Перевірте історію перед повторною операцією.'

      if (action === 'create') {
        setError(message)
      } else {
        setDetailError(message)
      }
    } finally {
      operationLock.current = false
      setBusy(false)
    }

    if (succeeded) {
      try {
        await refreshData()

        if (action !== 'create' && details) {
          const updated = await getWriteOffDetails(
            details.write_off.write_off_id
          )
          setDetails(updated)
        }
      } catch (e) {
        setDetailError(
          'Операція виконана, але дані не вдалося оновити: ' +
          errText(e)
        )
      }
    }
  }

  async function verifyData() {
    try {
      await refreshData()

      if (details) {
        const updated = await getWriteOffDetails(
          details.write_off.write_off_id
        )
        setDetails(updated)
      }

      setSuccess(
        'Дані оновлені. Звірте стан операції. ' +
        'Для нового списання почніть з нової форми.'
      )
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }

  return (
    <div className="writeoffs-page">
      <div className="breadcrumb">
        Головна / Списання
      </div>

      <div className="page-heading">
        <div>
          <h1>Списання препаратів</h1>
          <p>
            Контроль термінів придатності та облік втрат
          </p>
        </div>
        <div className="status-pill">
          ● Stock control
        </div>
      </div>

      <div className="stats writeoffs-stats">
        <div className="stat-card">
          <span>Списань</span>
          <strong>{history.length}</strong>
          <small>Останні 200 операцій</small>
        </div>
        <div className="stat-card">
          <span>Очікують погодження</span>
          <strong>
            {history.filter(
              x => x.status === 'CREATED'
            ).length}
          </strong>
          <small>Статус CREATED</small>
        </div>
        <div className="stat-card">
          <span>Прострочені партії</span>
          <strong>
            {alerts.filter(
              x => x.alert_type === 'EXPIRED'
            ).length}
          </strong>
          <small>З ненульовими залишками</small>
        </div>
      </div>

      <section className="panel writeoffs-panel">
        <div className="panel-heading">
          <h2>Нове списання</h2>
          <p>Виберіть локацію, причину та партії</p>
        </div>

        <form
          className="writeoffs-form"
          onSubmit={prepareCreate}
        >
          <div className="writeoffs-grid">
            <label className="writeoffs-field">
              Місце списання
              <select
                value={locationId}
                disabled={busy || uncertain}
                onChange={e => {
                  setLocationId(e.target.value)
                  setCart([])
                  setError('')
                }}
              >
                <option value="">Оберіть локацію</option>
                {locations.filter(l => l.is_active).map(l => (
                  <option
                    key={l.location_id}
                    value={l.location_id}
                  >
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="writeoffs-field">
              Причина списання
              <select
                value={reason}
                disabled={busy || uncertain}
                onChange={e =>
                  setReason(
                    e.target.value as WriteOffReason
                  )
                }
              >
                {(
                  Object.entries(reasons) as [
                    WriteOffReason,
                    string
                  ][]
                ).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="writeoffs-section">
            <h3>Доступні партії</h3>
            <p>
              Для списання показуються партії з
              фізичними незарезервованими залишками.
            </p>
          </div>

          <input
            className="writeoffs-search"
            type="search"
            placeholder="Пошук препарату або партії..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="writeoffs-stock-list">
            {stockLoading || loading ? (
              <div className="message">
                Завантаження залишків...
              </div>
            ) : filtered.length === 0 ? (
              <div className="message">
                Доступних партій не знайдено
              </div>
            ) : (
              filtered.slice(0, 60).map(item => {
                const added = cart.some(
                  x => x.batch_id === item.batch_id
                )

                return (
                  <div
                    className="writeoffs-stock-card"
                    key={item.inventory_id}
                  >
                    <div>
                      <strong>{item.product_name}</strong>
                      <small>
                        Партія: {item.batch_number}
                        {' · '}
                        Придатний до: {
                          dateText(item.expiry_date)
                        }
                        {item.is_expired
                          ? ' · ПРОСТРОЧЕНО'
                          : ''}
                        {item.status === 'BLOCKED'
                          ? ' · ЗАБЛОКОВАНО'
                          : ''}
                      </small>
                    </div>

                    <span>
                      Доступно: {
                        item.available_quantity
                      }
                    </span>

                    <button
                      type="button"
                      className="sale-add-button"
                      disabled={
                        added || busy || uncertain
                      }
                      onClick={() => addItem(item)}
                    >
                      {added ? 'Додано' : '+ Додати'}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="sale-cart-header">
            <h3>Партії до списання ({cart.length})</h3>
            <button
              type="button"
              className="sale-clear-button"
              disabled={busy || uncertain}
              onClick={() => setCart([])}
            >
              Очистити
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="sale-empty-cart">
              Додайте партії зі списку вище
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="sale-cart-table">
                <thead>
                  <tr>
                    <th>Препарат</th>
                    <th>Партія</th>
                    <th>Доступно</th>
                    <th>Кількість</th>
                    <th>Дія</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.batch_id}>
                      <td>{item.product_name}</td>
                      <td>{item.batch_number}</td>
                      <td>{item.available_quantity}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max={item.available_quantity}
                          step="1"
                          value={item.quantity}
                          disabled={busy || uncertain}
                          onChange={e =>
                            changeQuantity(
                              item.batch_id,
                              Number(e.target.value)
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="sale-remove-button"
                          disabled={busy || uncertain}
                          onClick={() =>
                            setCart(old =>
                              old.filter(
                                x =>
                                  x.batch_id !==
                                  item.batch_id
                              )
                            )
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

          <div className="writeoffs-summary">
            <div>
              <span>Партій</span>
              <strong>{cart.length}</strong>
            </div>
            <div>
              <span>Одиниць</span>
              <strong>{totalQuantity}</strong>
            </div>
          </div>

          <button
            type="submit"
            className="sale-submit"
            disabled={
              busy ||
              uncertain ||
              !locationId ||
              cart.length === 0
            }
          >
            Створити списання
          </button>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="writeoffs-success">
              {success}
            </div>
          )}

          {uncertain && (
            <div className="writeoffs-warning">
              <strong>
                Результат операції потребує перевірки
              </strong>
              <p>
                Запит міг виконатися. Не повторюйте його
                без перевірки історії.
              </p>
              <button
                type="button"
                className="purchase-secondary-button"
                onClick={() => void verifyData()}
              >
                Оновити та перевірити дані
              </button>
              <button
                type="button"
                className="purchase-secondary-button"
                onClick={() => {
                  setUncertain(false)
                  setCart([])
                  setError('')
                  setDetails(null)
                }}
              >
                Я перевірила — почати заново
              </button>
            </div>
          )}
        </form>
      </section>

      <section className="panel writeoffs-history">
        <div className="panel-heading writeoffs-heading">
          <div>
            <h2>Історія списань</h2>
            <p>Створені, погоджені та завершені операції</p>
          </div>
          <button
            type="button"
            className="purchase-secondary-button"
            disabled={busy}
            onClick={() => void refreshData()}
          >
            Оновити
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Місце</th>
                <th>Причина</th>
                <th>Дата</th>
                <th>Партій</th>
                <th>Кількість</th>
                <th>Статус</th>
                <th>Дія</th>
              </tr>
            </thead>
            <tbody>
              {history.map(item => (
                <tr key={item.write_off_id}>
                  <td>#{item.write_off_id}</td>
                  <td>{item.location_name}</td>
                  <td>{reasons[item.reason]}</td>
                  <td>{dateText(item.created_at)}</td>
                  <td>{item.item_count}</td>
                  <td>{item.total_quantity}</td>
                  <td>
                    <span className="writeoffs-status">
                      {statuses[item.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="purchase-secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void openDetails(
                          item.write_off_id
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
          {!loading && history.length === 0 && (
            <div className="message">
              Історія списань порожня
            </div>
          )}
        </div>
      </section>

      {details && (
        <section className="panel writeoffs-details">
          <div className="panel-heading writeoffs-heading">
            <div>
              <h2>
                Списання #{details.write_off.write_off_id}
              </h2>
              <p>
                {details.write_off.location_name}
                {' · '}
                {reasons[details.write_off.reason]}
              </p>
            </div>
            <button
              type="button"
              className="purchase-secondary-button"
              onClick={() => setDetails(null)}
            >
              Закрити
            </button>
          </div>

          <div className="writeoffs-details-content">
            <div className="writeoffs-detail-status">
              Статус:
              <strong>
                {statuses[details.write_off.status]}
              </strong>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Препарат</th>
                    <th>Партія</th>
                    <th>Термін придатності</th>
                    <th>Кількість</th>
                  </tr>
                </thead>
                <tbody>
                  {details.items.map(item => (
                    <tr key={item.write_off_item_id}>
                      <td>{item.product_name}</td>
                      <td>{item.batch_number}</td>
                      <td>{dateText(item.expiry_date)}</td>
                      <td>{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detailError && (
              <div className="error">{detailError}</div>
            )}
            {detailSuccess && (
              <div className="writeoffs-success">
                {detailSuccess}
              </div>
            )}

            <div className="writeoffs-actions">
              {details.write_off.status === 'CREATED' && (
                <button
                  type="button"
                  className="sale-add-button"
                  disabled={busy || uncertain}
                  onClick={() => prepareAction('approve')}
                >
                  Погодити списання
                </button>
              )}

              {details.write_off.status === 'APPROVED' && (
                <button
                  type="button"
                  className="sale-add-button"
                  disabled={busy || uncertain}
                  onClick={() => prepareAction('complete')}
                >
                  Завершити списання
                </button>
              )}

              {['CREATED', 'APPROVED'].includes(
                details.write_off.status
              ) && (
                <button
                  type="button"
                  className="purchase-secondary-button"
                  disabled={busy || uncertain}
                  onClick={() => prepareAction('cancel')}
                >
                  Скасувати списання
                </button>
              )}
            </div>

            <p className="sales-note">
              Фактичний залишок зменшується тільки на етапі
              COMPLETED. Використовуй це у тестовій базі.
            </p>
          </div>
        </section>
      )}

      <section className="panel writeoffs-history">
        <div className="panel-heading">
          <h2>Контроль термінів придатності</h2>
          <p>
            Прострочені та ті, що спливають упродовж 30 днів
          </p>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Препарат</th>
                <th>Локація</th>
                <th>Партія</th>
                <th>Придатний до</th>
                <th>Залишок</th>
                <th>Днів</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(item => (
                <tr key={item.inventory_id}>
                  <td>{item.product_name}</td>
                  <td>{item.location_name}</td>
                  <td>{item.batch_number}</td>
                  <td>{dateText(item.expiry_date)}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <span
                      className={
                        item.days_remaining < 0
                          ? 'writeoffs-expired'
                          : 'writeoffs-soon'
                      }
                    >
                      {item.days_remaining}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {alerts.length === 0 && (
            <div className="message">
              Критичних термінів придатності немає
            </div>
          )}
        </div>
      </section>

      {modal && (
        <div className="writeoffs-modal-backdrop">
          <div
            className="writeoffs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="writeoffs-modal-title"
          >
            <div className="writeoffs-modal-icon">
              {modal === 'create' ? '📋' : '✓'}
            </div>

            <h2 id="writeoffs-modal-title">
              {modal === 'create'
                ? 'Створити списання?'
                : modal === 'approve'
                  ? 'Погодити списання?'
                  : modal === 'complete'
                    ? 'Списати товар із залишків?'
                    : 'Скасувати списання?'}
            </h2>

            <p>
              {modal === 'create'
                ? `Буде створено ${cart.length} позицій. Залишки поки не зміняться.`
                : modal === 'complete'
                  ? 'Це зменшить фізичні залишки та створить рухи WRITE_OFF у PostgreSQL.'
                  : 'Статус операції буде змінено в базі даних.'}
            </p>

            <div className="writeoffs-modal-actions">
              <button
                type="button"
                className="purchase-secondary-button"
                onClick={() => setModal(null)}
              >
                Назад
              </button>
              <button
                type="button"
                className="sale-add-button"
                disabled={busy}
                onClick={() => void executeAction()}
              >
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
