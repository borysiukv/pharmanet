
import { useEffect, useState } from 'react'
import {
  getProductDetails,
  type ProductDetails,
} from './api'

interface Props {
  productId: number
  onClose: () => void
}

function ProductModal({ productId, onClose }: Props) {
  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    getProductDetails(productId)
      .then(data => {
        if (!cancelled) setDetails(data)
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити інформацію')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [productId])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const priceMap = new Map(
    details?.prices.map(p => [p.location_id, p.price]) ?? []
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Інформація про препарат"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Інформація про препарат</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Закрити"
          >
            ×
          </button>
        </div>

        {loading && (
          <div className="message">Завантаження інформації...</div>
        )}

        {error && <div className="error">{error}</div>}

        {details && (
          <div className="modal-content">
            <h2 className="modal-product-name">
              {details.product.name}
            </h2>

            <div className="product-info-grid">
              <div>
                <span>Категорія</span>
                <strong>{details.product.category ?? '—'}</strong>
              </div>
              <div>
                <span>Виробник</span>
                <strong>{details.product.manufacturer ?? '—'}</strong>
              </div>
              <div>
                <span>Штрихкод</span>
                <strong>{details.product.barcode ?? '—'}</strong>
              </div>
              <div>
                <span>Діюча речовина</span>
                <strong>{details.product.active_ingredient ?? '—'}</strong>
              </div>
              <div>
                <span>Дозування</span>
                <strong>{details.product.dosage ?? '—'}</strong>
              </div>
              <div>
                <span>Рецептурний</span>
                <strong>
                  {details.product.prescription_required
                    ? 'Так'
                    : 'Ні'}
                </strong>
              </div>
            </div>

            <h3>Наявність в аптеках</h3>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Аптека / склад</th>
                    <th>Ціна</th>
                    <th>Усього</th>
                    <th>Зарезервовано</th>
                    <th>Доступно</th>
                    <th>Найближчий термін</th>
                  </tr>
                </thead>

                <tbody>
                  {details.stock_by_location.map(s => (
                    <tr key={s.location_id}>
                      <td>{s.location_name}</td>
                      <td>
                        {priceMap.has(s.location_id)
                          ? `${priceMap.get(s.location_id)} грн`
                          : '—'}
                      </td>
                      <td>{s.total_quantity}</td>
                      <td>{s.reserved_quantity}</td>
                      <td>
                        <strong>{s.available_quantity}</strong>
                      </td>
                      <td>{s.nearest_expiry_date ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {details.stock_by_location.length === 0 && (
              <div className="message">Залишків не знайдено</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProductModal
