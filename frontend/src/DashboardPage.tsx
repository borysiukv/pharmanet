
import { useEffect, useState } from 'react'

import {
  getDashboardReport,
  getLocations,
  type DashboardReport,
  type DashboardSalesDay,
  type Location,
} from './api'

import './DashboardPage.css'

// =====================================================
// TYPES AND CONSTANTS
// =====================================================

type Period = 7 | 30 | 90 | 365

// =====================================================
// FORMATTING
// =====================================================

function money(value: number | string): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function num(value: number | string): string {
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function shortDate(value: string): string {
  return value.slice(5, 10).replace('-', '.')
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не вдалося завантажити дані'
}

// =====================================================
// CSV EXPORT
// =====================================================

function csvCell(value: unknown): string {
  let cell = String(value ?? '')

  // Protect text cells from Excel formula injection.
  // Do not alter negative numeric values.
  if (
    typeof value === 'string' &&
    /^\s*[=+\-@\t\r]/.test(cell)
  ) {
    cell = "'" + cell
  }

  return `"${cell.replace(/"/g, '""')}"`
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(';')
}

function downloadCsv(
  fileName: string,
  rows: unknown[][]
): void {
  const content =
    '\uFEFF' + rows.map(csvRow).join('\r\n')

  const blob = new Blob([content], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

// =====================================================
// SALES CHART
// =====================================================

function SalesChart({
  data,
}: {
  data: DashboardSalesDay[]
}) {
  const [selectedDate, setSelectedDate] =
    useState<string | null>(null)

  const width = 800
  const height = 270

  const left = 58
  const right = 20
  const top = 20
  const bottom = 42

  const chartWidth = width - left - right
  const chartHeight = height - top - bottom

  const maxRevenue = Math.max(
    1,
    ...data.map(day => Number(day.revenue) || 0)
  )

  const points = data.map((day, index) => {
    const x =
      left +
      (data.length === 1
        ? chartWidth / 2
        : (index / (data.length - 1)) * chartWidth)

    const y =
      top +
      chartHeight -
      ((Number(day.revenue) || 0) / maxRevenue) *
        chartHeight

    return {
      x,
      y,
      day,
    }
  })

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    )
    .join(' ')

  const areaPath =
    points.length > 0
      ? `${linePath}
         L ${points[points.length - 1].x} ${top + chartHeight}
         L ${points[0].x} ${top + chartHeight}
         Z`
      : ''

  const activePoint =
    points.find(point => point.day.sale_date === selectedDate) ??
    null

  const labelIndexes = Array.from(
    new Set([
      0,
      Math.floor((data.length - 1) / 4),
      Math.floor((data.length - 1) / 2),
      Math.floor(((data.length - 1) * 3) / 4),
      data.length - 1,
    ])
  ).filter(index => index >= 0 && index < data.length)

  if (data.length === 0) {
    return (
      <div className="message">
        Даних для графіка немає
      </div>
    )
  }

  return (
    <div className="dashboard-chart-wrap">
      <svg
        className="dashboard-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Графік щоденної виручки"
      >
        {/* GRID AND Y AXIS */}

        {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
          const y =
            top + chartHeight * (1 - fraction)

          return (
            <g key={fraction}>
              <line
                x1={left}
                y1={y}
                x2={width - right}
                y2={y}
                className="dashboard-chart-grid"
              />

              <text
                x={left - 9}
                y={y + 4}
                textAnchor="end"
                className="dashboard-chart-axis"
              >
                {num(Math.round(maxRevenue * fraction))}
              </text>
            </g>
          )
        })}

        {/* X AXIS */}

        {labelIndexes.map(index => (
          <text
            key={index}
            x={points[index].x}
            y={height - 15}
            textAnchor="middle"
            className="dashboard-chart-axis"
          >
            {shortDate(data[index].sale_date)}
          </text>
        ))}

        {/* AREA AND LINE */}

        <path
          d={areaPath}
          className="dashboard-chart-area"
        />

        <path
          d={linePath}
          className="dashboard-chart-line"
        />

        {/* INTERACTIVE POINTS */}

        {points.map(point => (
          <circle
            key={point.day.sale_date}
            cx={point.x}
            cy={point.y}
            r={
              selectedDate === point.day.sale_date
                ? 6
                : 3
            }
            className="dashboard-chart-point"
            role="button"
            tabIndex={0}
            aria-label={
              `${point.day.sale_date}: ` +
              money(point.day.revenue)
            }
            onMouseEnter={() =>
              setSelectedDate(point.day.sale_date)
            }
            onFocus={() =>
              setSelectedDate(point.day.sale_date)
            }
            onClick={() =>
              setSelectedDate(point.day.sale_date)
            }
            onKeyDown={event => {
              if (
                event.key === 'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault()
                setSelectedDate(point.day.sale_date)
              }
            }}
          />
        ))}

        {/* HOVER INDICATOR */}

        {activePoint && (
          <line
            x1={activePoint.x}
            y1={top}
            x2={activePoint.x}
            y2={top + chartHeight}
            className="dashboard-chart-cursor"
          />
        )}
      </svg>

      <div className="dashboard-chart-caption">
        {activePoint
          ? `${activePoint.day.sale_date} · ` +
            `Виручка: ${money(activePoint.day.revenue)} · ` +
            `Продажів: ${num(activePoint.day.sales_count)}`
          : 'Наведи курсор на точку графіка для деталей'}
      </div>
    </div>
  )
}

// =====================================================
// DASHBOARD PAGE
// =====================================================

export default function DashboardPage() {
  // =====================================================
  // STATE
  // =====================================================

  const [period, setPeriod] = useState<Period>(30)
  const [locationId, setLocationId] = useState('')

  const [locations, setLocations] = useState<Location[]>([])

  const [report, setReport] =
    useState<DashboardReport | null>(null)

  const [refreshKey, setRefreshKey] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [locationsError, setLocationsError] = useState('')

  // =====================================================
  // LOAD LOCATION OPTIONS
  // =====================================================

  useEffect(() => {
    let cancelled = false

    getLocations()
      .then(data => {
        if (!cancelled) {
          setLocations(data)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setLocationsError(errorMessage(err))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // =====================================================
  // LOAD FILTERED DASHBOARD REPORT
  // =====================================================

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      setLoading(true)
      setError('')
      setReport(null)

      try {
        const result = await getDashboardReport(
          period,
          locationId ? Number(locationId) : undefined
        )

        if (!cancelled) {
          setReport(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadReport()

    return () => {
      cancelled = true
    }
  }, [period, locationId, refreshKey])

  // =====================================================
  // EXPORT FULL ANALYTICS REPORT
  // =====================================================

  function exportFullReport() {
    if (!report || loading) return

    const rows: unknown[][] = [
      ['PHARMANET — АНАЛІТИЧНИЙ ЗВІТ'],
      ['Локація', report.location_name],
      [
        'Період',
        `Останні ${report.period_days} календарних днів`,
      ],
      [],
      ['ПОКАЗНИК', 'ЗНАЧЕННЯ'],
      ['Кількість продажів', report.sales.sales_count],
      ['Виручка, грн', report.sales.total_revenue],
      ['Середній чек, грн', report.sales.average_check],
      [
        'Фізичний залишок, од.',
        report.inventory.total_quantity,
      ],
      [
        'Записи залишків',
        report.inventory.stock_records,
      ],
      [
        'Заблоковані партії',
        report.inventory.blocked_batches,
      ],
      [
        'Прострочені партії',
        report.inventory.expired_batches,
      ],
      [
        'Критичні залишки',
        report.inventory.low_stock_batches,
      ],
      [
        'Кількість закупівель',
        report.purchases.total_orders,
      ],
      [
        'Очікують отримання',
        report.purchases.pending_orders,
      ],
      [
        'Сума закупівель, грн',
        report.purchases.total_purchase_amount,
      ],
      [
        'Завершені списання',
        report.write_offs.completed_write_offs,
      ],
      [],
      ['ДИНАМІКА ПРОДАЖІВ'],
      [
        'Дата',
        'Кількість продажів',
        'Виручка, грн',
      ],
      ...report.trend.map(day => [
        day.sale_date,
        day.sales_count,
        day.revenue,
      ]),
      [],
      ['ТОП ПРЕПАРАТІВ'],
      [
        'ID',
        'Препарат',
        'Продано, од.',
        'Виручка, грн',
        'Продажів',
      ],
      ...report.top_products.map(product => [
        product.product_id,
        product.product_name,
        product.quantity_sold,
        product.revenue,
        product.sales_count,
      ]),
      [],
      ['АПТЕКИ ТА СКЛАДИ'],
      [
        'Локація',
        'Тип',
        'Продажів',
        'Виручка, грн',
        'Залишок, од.',
        'Заблоковані',
      ],
      ...report.locations.map(location => [
        location.location_name,
        location.location_type,
        location.sales_count,
        location.revenue,
        location.total_stock_quantity,
        location.blocked_batches,
      ]),
    ]

    const fileLocation =
      report.location_id === null
        ? 'all'
        : `location_${report.location_id}`

    downloadCsv(
      `pharmanet_report_${fileLocation}_${report.period_days}.csv`,
      rows
    )
  }

  // =====================================================
  // EXPORT SALES TREND
  // =====================================================

  function exportSalesTrend() {
    if (!report || loading) return

    const rows: unknown[][] = [
      [
        'Дата',
        'Кількість продажів',
        'Виручка, грн',
      ],
      ...report.trend.map(day => [
        day.sale_date,
        day.sales_count,
        day.revenue,
      ]),
    ]

    const fileLocation =
      report.location_id === null
        ? 'all'
        : `location_${report.location_id}`

    downloadCsv(
      `pharmanet_sales_${fileLocation}_${report.period_days}.csv`,
      rows
    )
  }

  // =====================================================
  // CHART SCALE
  // =====================================================

  const maxProductQty = Math.max(
    1,
    ...(report?.top_products ?? []).map(
      product => Number(product.quantity_sold) || 0
    )
  )

  const maxLocationRevenue = Math.max(
    1,
    ...(report?.locations ?? []).map(
      location => Number(location.revenue) || 0
    )
  )

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="dashboard-page">
      {/* BREADCRUMB */}

      <div className="breadcrumb">
        Головна / Аналітика
      </div>

      {/* PAGE HEADING */}

      <div className="page-heading dashboard-page-heading">
        <div>
          <h1>Аналітика PharmaNet</h1>

          <p>
            Фінансові показники, продажі, залишки та
            ефективність аптечної мережі
          </p>
        </div>
      </div>

      {/* =====================================================
          FILTERS AND EXPORT
      ===================================================== */}

      <section className="panel dashboard-controls-panel">
        <div className="dashboard-controls">
          {/* LOCATION FILTER */}

          <div className="dashboard-control-field">
            <label htmlFor="dashboard-location">
              Аптека / склад
            </label>

            <select
              id="dashboard-location"
              value={locationId}
              disabled={loading}
              onChange={event => {
                setLocationId(event.target.value)
              }}
            >
              <option value="">
                Уся аптечна мережа
              </option>

              {locations
                .filter(
                  location =>
                    location.location_type !== 'OFFICE'
                )
                .map(location => (
                  <option
                    key={location.location_id}
                    value={location.location_id}
                  >
                    {location.name}
                  </option>
                ))}
            </select>
          </div>

          {/* PERIOD FILTER */}

          <div className="dashboard-control-field">
            <label htmlFor="dashboard-period">
              Період
            </label>

            <select
              id="dashboard-period"
              value={period}
              disabled={loading}
              onChange={event => {
                setPeriod(
                  Number(event.target.value) as Period
                )
              }}
            >
              <option value={7}>7 днів</option>
              <option value={30}>30 днів</option>
              <option value={90}>90 днів</option>
              <option value={365}>365 днів</option>
            </select>
          </div>

          {/* ACTION BUTTONS */}

          <div className="dashboard-control-actions">
            <button
              type="button"
              className="purchase-secondary-button"
              disabled={loading}
              onClick={() =>
                setRefreshKey(key => key + 1)
              }
            >
              Оновити
            </button>

            <button
              type="button"
              className="dashboard-export-btn"
              disabled={loading || !report}
              onClick={exportFullReport}
            >
              Експорт звіту CSV
            </button>

            <button
              type="button"
              className="dashboard-export-btn dashboard-export-secondary"
              disabled={loading || !report}
              onClick={exportSalesTrend}
            >
              Експорт продажів
            </button>
          </div>
        </div>
      </section>

      {/* ERRORS */}

      {locationsError && (
        <div className="error" role="alert">
          Не вдалося завантажити аптеки: {locationsError}
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {/* LOADING */}

      {loading && (
        <div className="message">
          Завантаження аналітики...
        </div>
      )}

      {/* =====================================================
          REPORT CONTENT
      ===================================================== */}

      {!loading && report && (
        <>
          {/* SELECTED FILTERS */}

          <div className="dashboard-report-context">
            <strong>{report.location_name}</strong>

            <span>
              Останні {report.period_days} календарних днів
            </span>
          </div>

          {/* =====================================================
              KPI CARDS
          ===================================================== */}

          <div className="dashboard-kpis">
            <div className="dashboard-kpi">
              <span>Виручка</span>

              <strong>
                {money(report.sales.total_revenue)}
              </strong>

              <small>
                {num(report.sales.sales_count)} продажів
              </small>
            </div>

            <div className="dashboard-kpi">
              <span>Середній чек</span>

              <strong>
                {money(report.sales.average_check)}
              </strong>

              <small>Оплачені продажі</small>
            </div>

            <div className="dashboard-kpi">
              <span>Складські залишки</span>

              <strong>
                {num(report.inventory.total_quantity)}
              </strong>

              <small>
                {num(report.inventory.stock_records)} записів
              </small>
            </div>

            <div className="dashboard-kpi">
              <span>Закупівлі</span>

              <strong>
                {num(report.purchases.total_orders)}
              </strong>

              <small>
                {num(report.purchases.pending_orders)} очікують
                отримання
              </small>
            </div>

            <div className="dashboard-kpi dashboard-kpi-warning">
              <span>Критичні залишки</span>

              <strong>
                {num(report.inventory.low_stock_batches)}
              </strong>

              <small>
                Партії з 1–10 доступними одиницями
              </small>
            </div>

            <div className="dashboard-kpi dashboard-kpi-danger">
              <span>Прострочені партії</span>

              <strong>
                {num(report.inventory.expired_batches)}
              </strong>

              <small>
                {num(report.inventory.blocked_batches)} заблокованих
              </small>
            </div>
          </div>

          {/* =====================================================
              MAIN ANALYTICS
          ===================================================== */}

          <div className="dashboard-main-grid">
            {/* SALES TREND */}

            <section className="panel dashboard-chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Динаміка продажів</h2>

                  <p>
                    Щоденна виручка за вибраний період
                  </p>
                </div>
              </div>

              <div className="dashboard-panel-body">
                <SalesChart data={report.trend} />
              </div>
            </section>

            {/* NETWORK STATUS */}

            <section className="panel dashboard-side-panel">
              <div className="panel-heading">
                <div>
                  <h2>Стан мережі</h2>

                  <p>Операційні показники</p>
                </div>
              </div>

              <div className="dashboard-network-list">
                <div>
                  <span>Локацій у звіті</span>

                  <strong>
                    {num(report.locations.length)}
                  </strong>
                </div>

                <div>
                  <span>Сума закупівель</span>

                  <strong>
                    {money(
                      report.purchases.total_purchase_amount
                    )}
                  </strong>
                </div>

                <div>
                  <span>Завершені списання</span>

                  <strong>
                    {num(
                      report.write_offs.completed_write_offs
                    )}
                  </strong>
                </div>

                <div>
                  <span>Заблоковані партії</span>

                  <strong>
                    {num(
                      report.inventory.blocked_batches
                    )}
                  </strong>
                </div>
              </div>
            </section>
          </div>

          {/* =====================================================
              BOTTOM ANALYTICS
          ===================================================== */}

          <div className="dashboard-bottom-grid">
            {/* TOP PRODUCTS */}

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Топ препаратів</h2>

                  <p>
                    За кількістю проданих одиниць
                  </p>
                </div>
              </div>

              <div className="dashboard-ranking">
                {report.top_products.length === 0 ? (
                  <div className="message">
                    Продажів за вибраний період немає
                  </div>
                ) : (
                  report.top_products.map(
                    (product, index) => (
                      <div
                        key={product.product_id}
                        className="dashboard-ranking-row"
                      >
                        <span className="dashboard-rank-number">
                          {index + 1}
                        </span>

                        <div className="dashboard-ranking-content">
                          <div className="dashboard-ranking-info">
                            <strong>
                              {product.product_name}
                            </strong>

                            <span>
                              {num(product.quantity_sold)} од. ·{' '}
                              {money(product.revenue)}
                            </span>
                          </div>

                          <div className="dashboard-progress">
                            <div
                              style={{
                                width: `${
                                  (Number(
                                    product.quantity_sold
                                  ) /
                                    maxProductQty) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </section>

            {/* LOCATIONS */}

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Показники аптек</h2>

                  <p>
                    Виручка та залишки за локаціями
                  </p>
                </div>
              </div>

              <div className="dashboard-location-list">
                {report.locations.length === 0 ? (
                  <div className="message">
                    Даних за локаціями немає
                  </div>
                ) : (
                  report.locations.map(location => (
                    <div
                      key={location.location_id}
                      className="dashboard-location-row"
                    >
                      <div className="dashboard-location-top">
                        <strong>
                          {location.location_name}
                        </strong>

                        <span>
                          {money(location.revenue)}
                        </span>
                      </div>

                      <div className="dashboard-progress">
                        <div
                          style={{
                            width: `${
                              (Number(location.revenue) /
                                maxLocationRevenue) *
                              100
                            }%`,
                          }}
                        />
                      </div>

                      <small>
                        {num(location.sales_count)} продажів ·{' '}
                        {num(
                          location.total_stock_quantity
                        )}{' '}
                        од. на залишках
                      </small>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* FOOTNOTE */}

          <p className="dashboard-footnote">
            Джерело даних: PostgreSQL. Продажі, закупівлі
            та списання обмежені вибраним календарним
            періодом. Складські залишки показані станом
            на зараз. CSV експортується в UTF-8 із
            роздільником крапка з комою.
          </p>
        </>
      )}
    </div>
  )
}
