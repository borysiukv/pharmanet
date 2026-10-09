
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import {
  getLocations,
  getTransfers,
  getTransferDetails,
  getTransferAvailableStock,
  createTransfer,
  confirmTransfer,
  type Location,
  type Transfer,
  type TransferItem,
  type TransferStockItem,
  type CreateTransferItem,
} from './api'

import './TransfersPage.css'

const EMPLOYEE_ID = 1

type DialogAction = 'create' | 'confirm'

type DialogState = {
  action: DialogAction
  title: string
  description: string
}

type CartRow = {
  batch_id: number
  product_id: number
  product_name: string
  batch_number: string
  expiry_date: string | null
  available_quantity: number
  quantity: number
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Чернетка',
    PENDING: 'Очікує підтвердження',
    CREATED: 'Створено',
    ORDERED: 'Замовлено',
    CONFIRMED: 'Підтверджено',
    COMPLETED: 'Завершено',
    CANCELLED: 'Скасовано',
  }

  return labels[value] ?? value
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  return value.slice(0, 10)
}

function friendlyError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Сталася помилка. Спробуйте ще раз.'
}

export default function TransfersPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [availableStock, setAvailableStock] =
    useState<TransferStockItem[]>([])

  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartRow[]>([])

  const [selectedTransfer, setSelectedTransfer] =
    useState<Transfer | null>(null)
  const [selectedItems, setSelectedItems] =
    useState<TransferItem[]>([])

  const [loading, setLoading] = useState(true)
  const [stockLoading, setStockLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<DialogState | null>(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailSuccess, setDetailSuccess] = useState('')

  const [outcomeUnknown, setOutcomeUnknown] = useState(false)

  const operationLock = useRef(false)
  const stockRequest = useRef(0)
  const detailsRequest = useRef(0)

  // ==================================================
  // INITIAL LOAD
  // ==================================================

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [locationData, transferData] = await Promise.all([
          getLocations(),
          getTransfers(),
        ])

        if (cancelled) return

        const active = locationData.filter(l => l.is_active)

        setLocations(locationData)
        setTransfers(transferData)

        const warehouse = active.find(
          l => l.location_type === 'WAREHOUSE'
        )

        const source = warehouse ?? active[0]

        if (source) {
          setSourceId(String(source.location_id))

          const target = active.find(
            l =>
              l.location_id !== source.location_id &&
              l.location_type === 'PHARMACY'
          )

          const fallback = active.find(
            l => l.location_id !== source.location_id
          )

          if (target ?? fallback) {
            setDestinationId(
              String((target ?? fallback)!.location_id)
            )
          }
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  // ==================================================
  // LOAD STOCK WHEN SOURCE CHANGES
  // ==================================================

  useEffect(() => {
    const id = Number(sourceId)
    const requestId = ++stockRequest.current

    if (!id) {
      setAvailableStock([])
      setStockLoading(false)
      return
    }

    setStockLoading(true)

    getTransferAvailableStock(id)
      .then(items => {
        if (stockRequest.current !== requestId) return
        setAvailableStock(items)
      })
      .catch(err => {
        if (stockRequest.current !== requestId) return
        setAvailableStock([])
        setError(friendlyError(err))
      })
      .finally(() => {
        if (stockRequest.current === requestId) {
          setStockLoading(false)
        }
      })
  }, [sourceId])

  async function refreshTransfers() {
    const result = await getTransfers()
    setTransfers(result)
  }

  async function refreshStock() {
    const id = Number(sourceId)
    if (!id) return

    const requestId = ++stockRequest.current
    setStockLoading(true)

    try {
      const result = await getTransferAvailableStock(id)
      if (requestId === stockRequest.current) {
        setAvailableStock(result)
      }
    } catch (err) {
      if (requestId === stockRequest.current) {
        setError(friendlyError(err))
      }
    } finally {
      if (requestId === stockRequest.current) {
        setStockLoading(false)
      }
    }
  }

  function changeSource(value: string) {
    if (busy || outcomeUnknown) return

    setSourceId(value)
    setCart([])
    setSearch('')
    setError('')

    if (value === destinationId) {
      setDestinationId('')
    }
  }

  // ==================================================
  // CART
  // ==================================================

  function addToCart(stock: TransferStockItem) {
    if (busy || outcomeUnknown) return

    if (cart.some(row => row.batch_id === stock.batch_id)) {
      setError('Ця партія вже є у переміщенні')
      return
    }

    if (cart.length >= 100) {
      setError('Максимум 100 партій у переміщенні')
      return
    }

    const available = Number(stock.available_quantity)

    if (available < 1) {
      setError('Недостатньо доступного залишку')
      return
    }

    setCart(previous => [
      ...previous,
      {
        batch_id: stock.batch_id,
        product_id: stock.product_id,
        product_name: stock.product_name,
        batch_number: stock.batch_number,
        expiry_date: stock.expiry_date,
        available_quantity: available,
        quantity: 1,
      },
    ])

    setError('')
    setSuccess('')
    setSearch('')
  }

  function updateQuantity(batchId: number, quantity: number) {
    if (busy || outcomeUnknown) return

    setCart(previous =>
      previous.map(row =>
        row.batch_id === batchId
          ? { ...row, quantity }
          : row
      )
    )
  }

  function removeFromCart(batchId: number) {
    if (busy || outcomeUnknown) return

    setCart(previous =>
      previous.filter(row => row.batch_id !== batchId)
    )
  }

  const filteredStock = availableStock.filter(item => {
    const q = search.trim().toLocaleLowerCase('uk-UA')

    return (
      !q ||
      item.product_name.toLocaleLowerCase('uk-UA').includes(q) ||
      item.batch_number.toLocaleLowerCase('uk-UA').includes(q) ||
      String(item.product_id).includes(q)
    )
  })

  const cartQuantity = cart.reduce(
    (sum, row) => sum + row.quantity,
    0
  )

  // ==================================================
  // PREPARE CREATE
  // ==================================================

  function prepareCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy || outcomeUnknown) return

    setError('')
    setSuccess('')

    if (!sourceId || !destinationId) {
      setError('Оберіть склад та місце отримання')
      return
    }

    if (sourceId === destinationId) {
      setError('Місця відправлення та отримання мають відрізнятися')
      return
    }

    if (!cart.length) {
      setError('Додайте хоча б одну партію')
      return
    }

    for (const item of cart) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > item.available_quantity
      ) {
        setError(
          `Некоректна кількість для "${item.product_name}". ` +
          `Доступно: ${item.available_quantity}`
        )
        return
      }
    }

    setModal({
      action: 'create',
      title: 'Створити переміщення?',
      description:
        `Партій: ${cart.length}. Одиниць: ${cartQuantity}. ` +
        'Поки переміщення не підтверджене, залишки не зміняться.',
    })
  }

  // ==================================================
  // CREATE
  // ==================================================

  async function executeCreate() {
    const items: CreateTransferItem[] = cart.map(row => ({
      batch_id: row.batch_id,
      quantity: row.quantity,
    }))

    let created = false

    try {
      const result = await createTransfer({
        from_location_id: Number(sourceId),
        to_location_id: Number(destinationId),
        created_by_employee_id: EMPLOYEE_ID,
        items,
      })

      created = true

      setSuccess(
        `Переміщення #${result.transfer_id} створено. ` +
        `Статус: ${statusLabel(result.status)}.`
      )
      setCart([])
      setOutcomeUnknown(false)
    } catch (err) {
      setOutcomeUnknown(true)
      setError(
        friendlyError(err) +
        '. Перед повторним створенням перевірте історію переміщень.'
      )
    }

    if (created) {
      try {
        await Promise.all([
          refreshTransfers(),
          refreshStock(),
        ])
      } catch {
        setError('Переміщення створено, але список не оновився')
      }
    }
  }

  // ==================================================
  // DETAILS
  // ==================================================

  async function openDetails(transferId: number) {
    if (busy) return

    const requestId = ++detailsRequest.current
    setDetailsLoading(true)
    setDetailError('')
    setDetailSuccess('')
    setSelectedTransfer(null)
    setSelectedItems([])

    try {
      const response = await getTransferDetails(transferId)

      if (requestId !== detailsRequest.current) return

      setSelectedTransfer(response.transfer)
      setSelectedItems(response.items)
    } catch (err) {
      if (requestId === detailsRequest.current) {
        setDetailError(friendlyError(err))
      }
    } finally {
      if (requestId === detailsRequest.current) {
        setDetailsLoading(false)
      }
    }
  }

  function closeDetails() {
    if (busy) return

    ++detailsRequest.current
    setSelectedTransfer(null)
    setSelectedItems([])
    setDetailError('')
    setDetailSuccess('')
    setDetailsLoading(false)
  }

  // ==================================================
  // PREPARE CONFIRM
  // ==================================================

  function prepareConfirm() {
    if (!selectedTransfer || busy) return

    if (
      !['PENDING', 'DRAFT', 'CREATED'].includes(
        selectedTransfer.status
      )
    ) {
      setDetailError(
        'Поточний статус не дозволяє підтвердити переміщення'
      )
      return
    }

    setModal({
      action: 'confirm',
      title: `Завершити переміщення #${selectedTransfer.transfer_id}?`,
      description:
        'Операція зменшить залишки в місці відправлення, ' +
        'збільшить їх у місці отримання та запише рухи ' +
        'TRANSFER_OUT / TRANSFER_IN.',
    })
  }

  // ==================================================
  // CONFIRM
  // ==================================================

  async function executeConfirm() {
    if (!selectedTransfer) return

    const transferId = selectedTransfer.transfer_id
    let confirmed = false

    setDetailError('')
    setDetailSuccess('')

    try {
      const result = await confirmTransfer(
        transferId,
        EMPLOYEE_ID
      )

      confirmed = true

      setDetailSuccess(
        `Переміщення #${transferId} завершено. ` +
        `Статус: ${statusLabel(result.status)}.`
      )

      setOutcomeUnknown(false)
    } catch (err) {
      setOutcomeUnknown(true)
      setDetailError(
        friendlyError(err) +
        '. Не повторюйте підтвердження без перевірки статусу.'
      )
    }

    try {
      const response = await getTransferDetails(transferId)
      setSelectedTransfer(response.transfer)
      setSelectedItems(response.items)
    } catch {
      if (confirmed) {
        setDetailError(
          'Переміщення завершено, але деталі не оновилися.'
        )
      }
    }

    try {
      await refreshTransfers()
      await refreshStock()
    } catch {
      if (confirmed) {
        setDetailError(
          'Переміщення завершено, але дані на екрані могли не оновитися.'
        )
      }
    }
  }

  // ==================================================
  // EXECUTE MODAL
  // ==================================================

  async function executeModal() {
    if (!modal || operationLock.current) return

    const action = modal.action

    operationLock.current = true
    setBusy(true)
    setModal(null)

    try {
      if (action === 'create') {
        await executeCreate()
      } else {
        await executeConfirm()
      }
    } finally {
      operationLock.current = false
      setBusy(false)
    }
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="transfers-page">
      <div className="breadcrumb">
        Головна / Переміщення
      </div>

      <div className="page-heading">
        <div>
          <h1>Переміщення товарів</h1>
          <p>
            Розподіл препаратів між складом та аптеками
          </p>
        </div>

        <div className="status-pill">
          ● Stock transfers
        </div>
      </div>

      <div className="stats transfers-stats">
        <div className="stat-card">
          <span>Усі переміщення</span>
          <strong>{transfers.length}</strong>
          <small>Останні 200 записів</small>
        </div>

        <div className="stat-card">
          <span>Очікують підтвердження</span>
          <strong>
            {transfers.filter(t =>
              ['PENDING', 'DRAFT', 'CREATED'].includes(t.status)
            ).length}
          </strong>
          <small>Незавершені переміщення</small>
        </div>

        <div className="stat-card">
          <span>Завершено</span>
          <strong>
            {transfers.filter(t =>
              ['COMPLETED', 'CONFIRMED'].includes(t.status)
            ).length}
          </strong>
          <small>Успішні переміщення</small>
        </div>
      </div>

      {/* CREATE FORM */}

      <section className="panel transfers-panel">
        <div className="panel-heading">
          <h2>Нове переміщення</h2>
          <p>
            Виберіть джерело, пункт призначення та партії
          </p>
        </div>

        <form
          className="transfers-form"
          onSubmit={prepareCreate}
        >
          <div className="transfers-locations">
            <div className="transfers-field">
              <label htmlFor="transfer-source">
                Звідки перемістити
              </label>

              <select
                id="transfer-source"
                value={sourceId}
                disabled={busy || loading || outcomeUnknown}
                onChange={event =>
                  changeSource(event.target.value)
                }
                required
              >
                <option value="">Оберіть місце</option>

                {locations.filter(l => l.is_active).map(l => (
                  <option
                    key={l.location_id}
                    value={l.location_id}
                  >
                    {l.name} — {l.location_type}
                  </option>
                ))}
              </select>
            </div>

            <div className="transfers-direction">
              →
            </div>

            <div className="transfers-field">
              <label htmlFor="transfer-destination">
                Куди перемістити
              </label>

              <select
                id="transfer-destination"
                value={destinationId}
                disabled={busy || loading || outcomeUnknown}
                onChange={event =>
                  setDestinationId(event.target.value)
                }
                required
              >
                <option value="">Оберіть місце</option>

                {locations
                  .filter(
                    l =>
                      l.is_active &&
                      String(l.location_id) !== sourceId
                  )
                  .map(l => (
                    <option
                      key={l.location_id}
                      value={l.location_id}
                    >
                      {l.name} — {l.location_type}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="transfers-section-head">
            <h3>Доступні партії</h3>
            <p>
              Обирайте конкретну партію — термін придатності
              буде збережений після переміщення.
            </p>
          </div>

          <div className="transfers-search-line">
            <input
              type="search"
              placeholder="Пошук препарату або номера партії..."
              value={search}
              disabled={busy || outcomeUnknown}
              onChange={event =>
                setSearch(event.target.value)
              }
            />

            <button
              type="button"
              className="purchase-secondary-button"
              disabled={busy || stockLoading}
              onClick={() => void refreshStock()}
            >
              Оновити залишки
            </button>
          </div>

          {stockLoading ? (
            <div className="message">
              Завантаження доступних залишків...
            </div>
          ) : (
            <div className="transfers-stock-list">
              {filteredStock.slice(0, 50).map(stock => {
                const inCart = cart.some(
                  row => row.batch_id === stock.batch_id
                )

                return (
                  <div
                    key={stock.inventory_id}
                    className="transfers-stock-card"
                  >
                    <div className="transfers-stock-main">
                      <strong>
                        {stock.product_name}
                      </strong>

                      <small>
                        Партія: {stock.batch_number}
                        {' · '}
                        Придатний до: {formatDate(stock.expiry_date)}
                      </small>
                    </div>

                    <div className="transfers-stock-amount">
                      <span>Доступно</span>
                      <strong>{stock.available_quantity}</strong>
                    </div>

                    <button
                      type="button"
                      className="sale-add-button"
                      disabled={
                        inCart ||
                        busy ||
                        outcomeUnknown ||
                        Number(stock.available_quantity) < 1
                      }
                      onClick={() => addToCart(stock)}
                    >
                      {inCart ? 'Додано' : '+ Додати'}
                    </button>
                  </div>
                )
              })}

              {filteredStock.length === 0 && (
                <div className="message">
                  У цьому місці немає доступних партій
                  за заданим пошуком.
                </div>
              )}

              {filteredStock.length > 50 && (
                <p className="sales-note">
                  Показано перші 50 партій. Уточніть пошук,
                  щоб побачити інші.
                </p>
              )}
            </div>
          )}

          <div className="sale-cart-header">
            <h3>Товари для переміщення ({cart.length})</h3>

            <button
              type="button"
              className="sale-clear-button"
              disabled={
                cart.length === 0 ||
                busy ||
                outcomeUnknown
              }
              onClick={() => setCart([])}
            >
              Очистити
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="sale-empty-cart">
              Додайте партії з доступних залишків.
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="sale-cart-table">
                <thead>
                  <tr>
                    <th>Препарат</th>
                    <th>Партія</th>
                    <th>Доступно</th>
                    <th>Перемістити</th>
                    <th>Дія</th>
                  </tr>
                </thead>

                <tbody>
                  {cart.map(row => (
                    <tr key={row.batch_id}>
                      <td className="product-name">
                        {row.product_name}
                      </td>

                      <td>{row.batch_number}</td>

                      <td>{row.available_quantity}</td>

                      <td>
                        <input
                          className="transfers-quantity-input"
                          type="number"
                          min="1"
                          max={row.available_quantity}
                          step="1"
                          value={row.quantity}
                          disabled={busy || outcomeUnknown}
                          onChange={event =>
                            updateQuantity(
                              row.batch_id,
                              Number(event.target.value)
                            )
                          }
                        />
                      </td>

                      <td>
                        <button
                          type="button"
                          className="sale-remove-button"
                          disabled={busy || outcomeUnknown}
                          onClick={() =>
                            removeFromCart(row.batch_id)
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

          <div className="transfers-total">
            <div>
              <span>Партій</span>
              <strong>{cart.length}</strong>
            </div>

            <div>
              <span>Одиниць товару</span>
              <strong>{cartQuantity}</strong>
            </div>
          </div>

          <button
            type="submit"
            className="sale-submit"
            disabled={
              busy ||
              loading ||
              stockLoading ||
              outcomeUnknown ||
              cart.length === 0 ||
              !sourceId ||
              !destinationId
            }
          >
            {busy
              ? 'Обробка...'
              : 'Створити переміщення'}
          </button>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="transfers-success" role="status">
              {success}
            </div>
          )}

          {outcomeUnknown && (
            <div className="transfers-warning">
              <strong>
                Перевірте результат попередньої операції
              </strong>

              <p>
                Запит міг бути виконаний у базі.
                Оновіть історію, звірте переміщення й
                лише після цього починайте нову операцію.
              </p>

              <button
                type="button"
                className="purchase-secondary-button"
                onClick={async () => {
                  try {
                    await refreshTransfers()
                    await refreshStock()
                    setSuccess(
                      'Дані оновлено. Перевірте історію перед повторним створенням.'
                    )
                  } catch (err) {
                    setError(friendlyError(err))
                  }
                }}
              >
                Перевірити історію і залишки
              </button>

              <button
                type="button"
                className="purchase-secondary-button"
                onClick={() => {
                  setOutcomeUnknown(false)
                  setCart([])
                  setError('')
                }}
              >
                Я перевірила — почати заново
              </button>
            </div>
          )}
        </form>
      </section>

      {/* HISTORY */}

      <section className="panel transfers-history">
        <div className="panel-heading transfers-heading">
          <div>
            <h2>Історія переміщень</h2>
            <p>Останні 200 операцій</p>
          </div>

          <button
            type="button"
            className="purchase-secondary-button"
            disabled={busy}
            onClick={async () => {
              try {
                await refreshTransfers()
              } catch (err) {
                setError(friendlyError(err))
              }
            }}
          >
            Оновити
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Звідки</th>
                <th>Куди</th>
                <th>Дата</th>
                <th>Партій</th>
                <th>Кількість</th>
                <th>Статус</th>
                <th>Дія</th>
              </tr>
            </thead>

            <tbody>
              {transfers.map(transfer => (
                <tr key={transfer.transfer_id}>
                  <td>#{transfer.transfer_id}</td>

                  <td>{transfer.from_location_name}</td>
                  <td>{transfer.to_location_name}</td>

                  <td>{formatDate(transfer.created_at)}</td>

                  <td>{transfer.item_count ?? '—'}</td>
                  <td>{transfer.total_quantity ?? '—'}</td>

                  <td>
                    <span className="transfers-status">
                      {statusLabel(transfer.status)}
                    </span>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="purchase-secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void openDetails(transfer.transfer_id)
                      }
                    >
                      Переглянути
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && transfers.length === 0 && (
            <div className="message">
              Переміщень поки немає
            </div>
          )}
        </div>
      </section>

      {/* DETAILS */}

      {(selectedTransfer || detailsLoading || detailError) && (
        <section className="panel transfers-details">
          <div className="panel-heading transfers-heading">
            <div>
              <h2>
                {selectedTransfer
                  ? `Переміщення #${selectedTransfer.transfer_id}`
                  : 'Деталі переміщення'}
              </h2>

              <p>Партії та стан операції</p>
            </div>

            <button
              type="button"
              className="purchase-secondary-button"
              disabled={busy}
              onClick={closeDetails}
            >
              Закрити
            </button>
          </div>

          {detailsLoading && (
            <div className="message">
              Завантаження деталей...
            </div>
          )}

          {detailError && (
            <div className="error" role="alert">
              {detailError}
            </div>
          )}

          {detailSuccess && (
            <div className="transfers-success" role="status">
              {detailSuccess}
            </div>
          )}

          {selectedTransfer && (
            <div className="transfers-details-content">
              <div className="transfers-detail-grid">
                <div>
                  <span>Місце відправлення</span>
                  <strong>
                    {selectedTransfer.from_location_name}
                  </strong>
                </div>

                <div>
                  <span>Місце отримання</span>
                  <strong>
                    {selectedTransfer.to_location_name}
                  </strong>
                </div>

                <div>
                  <span>Статус</span>
                  <strong>
                    {statusLabel(selectedTransfer.status)}
                  </strong>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Препарат</th>
                      <th>Партія</th>
                      <th>Придатний до</th>
                      <th>Кількість</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedItems.map(item => (
                      <tr key={item.transfer_item_id}>
                        <td>{item.product_name}</td>
                        <td>{item.batch_number}</td>
                        <td>{formatDate(item.expiry_date)}</td>
                        <td>{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {['PENDING', 'DRAFT', 'CREATED'].includes(
                selectedTransfer.status
              ) && (
                <button
                  type="button"
                  className="sale-add-button"
                  disabled={busy || outcomeUnknown}
                  onClick={prepareConfirm}
                >
                  Завершити переміщення
                </button>
              )}

              <p className="sales-note">
                Завершення переміщення змінює складські
                залишки та створює два записи рухів.
              </p>
            </div>
          )}
        </section>
      )}

      {/* CONFIRMATION MODAL */}

      {modal && (
        <div className="transfers-modal-backdrop">
          <div
            className="transfers-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfers-modal-title"
          >
            <div className="transfers-modal-icon">⇄</div>

            <h2 id="transfers-modal-title">
              {modal.title}
            </h2>

            <p>{modal.description}</p>

            <div className="transfers-modal-actions">
              <button
                type="button"
                className="purchase-secondary-button"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Скасувати
              </button>

              <button
                type="button"
                className="sale-add-button"
                disabled={busy}
                onClick={() => void executeModal()}
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
