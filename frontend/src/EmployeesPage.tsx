
import { useEffect, useMemo, useState } from 'react'

import {
  getEmployees,
  getPositions,
  getLocations,
  type Employee,
  type EmployeePosition,
  type Location,
} from './api'

import './EmployeesPage.css'

const ROLE_LABELS: Record<string, string> = {
  PHARMACIST: 'Фармацевт',
  PHARMACY_MANAGER: 'Завідувач аптеки',
  WAREHOUSE_WORKER: 'Працівник складу',
  PURCHASING_MANAGER: 'Менеджер закупівель',
  NETWORK_MANAGER: 'Керівник мережі',
  SYSTEM_ADMIN: 'Адміністратор',
}

function fullName(employee: Employee): string {
  return [
    employee.last_name,
    employee.first_name,
    employee.middle_name,
  ]
    .filter(Boolean)
    .join(' ')
}

function formatDate(value: string | null): string {
  if (!value) return '—'

  const parts = value.slice(0, 10).split('-')

  if (parts.length !== 3) return value

  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function isWorking(employee: Employee): boolean {
  return (
    employee.is_active &&
    employee.employment_status === 'ACTIVE'
  )
}

function getError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не вдалося завантажити працівників'
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [positions, setPositions] = useState<EmployeePosition[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // ============================================
  // LOAD DATA
  // ============================================

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const [employeeData, positionData, locationData] =
          await Promise.all([
            getEmployees(),
            getPositions(),
            getLocations(),
          ])

        if (cancelled) return

        setEmployees(employeeData)
        setPositions(positionData)
        setLocations(locationData)
      } catch (err) {
        if (!cancelled) {
          setError(getError(err))
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
  }, [refreshKey])

  // ============================================
  // FILTERING
  // ============================================

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('uk-UA')

    return employees.filter(employee => {
      const searchable = [
        fullName(employee),
        employee.email,
        employee.phone,
        employee.username,
        employee.position_name,
        employee.location_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('uk-UA')

      if (term && !searchable.includes(term)) return false

      if (
        locationId &&
        employee.location_id !== Number(locationId)
      ) {
        return false
      }

      if (
        positionId &&
        employee.position_id !== Number(positionId)
      ) {
        return false
      }

      if (
        statusFilter === 'ACTIVE' &&
        !isWorking(employee)
      ) {
        return false
      }

      if (
        statusFilter === 'INACTIVE' &&
        isWorking(employee)
      ) {
        return false
      }

      if (
        statusFilter === 'WITH_ACCOUNT' &&
        employee.account_id === null
      ) {
        return false
      }

      if (
        statusFilter === 'WITHOUT_ACCOUNT' &&
        employee.account_id !== null
      ) {
        return false
      }

      return true
    })
  }, [
    employees,
    search,
    locationId,
    positionId,
    statusFilter,
  ])

  const activeCount = employees.filter(isWorking).length

  const accountCount = employees.filter(
    employee => employee.account_id !== null
  ).length

  const withoutAccountCount = employees.filter(
    employee => employee.account_id === null
  ).length

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="employees-page">
      <div className="breadcrumb">
        Головна / Працівники
      </div>

      <div className="page-heading employees-page-heading">
        <div>
          <h1>Працівники</h1>
          <p>
            Персонал аптечної мережі, посади,
            підрозділи та облікові записи
          </p>
        </div>

        <button
          type="button"
          className="employees-refresh-btn"
          disabled={loading}
          onClick={() => setRefreshKey(value => value + 1)}
        >
          ↻ Оновити
        </button>
      </div>

      {/* STATISTICS */}

      <div className="stats employees-stats">
        <div className="stat-card">
          <span>Усього працівників</span>
          <strong>{employees.length}</strong>
          <small>Зареєстровано в системі</small>
        </div>

        <div className="stat-card">
          <span>Працюють</span>
          <strong>{activeCount}</strong>
          <small>Активні співробітники</small>
        </div>

        <div className="stat-card">
          <span>Облікові записи</span>
          <strong>{accountCount}</strong>
          <small>Мають доступ до системи</small>
        </div>

        <div className="stat-card">
          <span>Без облікового запису</span>
          <strong>{withoutAccountCount}</strong>
          <small>Потребують налаштування доступу</small>
        </div>
      </div>

      {/* EMPLOYEE TABLE */}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Список працівників</h2>
            <p>
              Інформація про співробітників аптечної мережі
            </p>
          </div>
        </div>

        <div className="filters employees-filters">
          <input
            type="search"
            placeholder="ПІБ, email, телефон..."
            aria-label="Пошук працівника"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />

          <select
            aria-label="Фільтр за аптекою"
            value={locationId}
            onChange={event => setLocationId(event.target.value)}
          >
            <option value="">Усі локації</option>

            {locations.map(location => (
              <option
                key={location.location_id}
                value={location.location_id}
              >
                {location.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Фільтр за посадою"
            value={positionId}
            onChange={event => setPositionId(event.target.value)}
          >
            <option value="">Усі посади</option>

            {positions.map(position => (
              <option
                key={position.position_id}
                value={position.position_id}
              >
                {position.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Фільтр за статусом"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            <option value="ALL">Усі статуси</option>
            <option value="ACTIVE">Працюють</option>
            <option value="INACTIVE">Неактивні</option>
            <option value="WITH_ACCOUNT">Мають акаунт</option>
            <option value="WITHOUT_ACCOUNT">Без акаунта</option>
          </select>
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="message">
            Завантаження працівників...
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="employees-table">
              <thead>
                <tr>
                  <th>Працівник</th>
                  <th>Посада</th>
                  <th>Аптека / склад</th>
                  <th>Статус</th>
                  <th>Обліковий запис</th>
                  <th>Ролі</th>
                  <th>Деталі</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.map(employee => (
                  <tr key={employee.employee_id}>
                    <td>
                      <div className="employees-person">
                        <div className="employees-avatar">
                          {employee.first_name.slice(0, 1)}
                          {employee.last_name.slice(0, 1)}
                        </div>

                        <div>
                          <strong>{fullName(employee)}</strong>
                          <small>
                            ID #{employee.employee_id}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      {employee.position_name ?? '—'}
                    </td>

                    <td>
                      {employee.location_name ?? '—'}
                    </td>

                    <td>
                      <span
                        className={
                          isWorking(employee)
                            ? 'employees-badge employees-active'
                            : 'employees-badge employees-inactive'
                        }
                      >
                        {isWorking(employee)
                          ? 'Працює'
                          : 'Неактивний'}
                      </span>
                    </td>

                    <td>
                      {employee.account_id !== null ? (
                        <div className="employees-account">
                          <strong>
                            {employee.username ?? 'Акаунт'}
                          </strong>

                          <small>
                            {employee.account_is_active
                              ? 'Активний'
                              : 'Заблокований'}
                          </small>
                        </div>
                      ) : (
                        <span className="employees-muted">
                          Немає акаунта
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="employees-role-list">
                        {employee.roles.length > 0 ? (
                          employee.roles.map(role => (
                            <span
                              key={role}
                              className="employees-role"
                            >
                              {ROLE_LABELS[role] ?? role}
                            </span>
                          ))
                        ) : (
                          <span className="employees-muted">
                            Не призначено
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="employees-details-btn"
                        onClick={() =>
                          setSelectedEmployee(employee)
                        }
                      >
                        Переглянути
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredEmployees.length === 0 && (
              <div className="message">
                Працівників за вибраними фільтрами не знайдено
              </div>
            )}
          </div>
        )}

        <div className="table-footer">
          Відображено {filteredEmployees.length} із{' '}
          {employees.length} працівників
        </div>
      </section>

      {/* DETAILS MODAL */}

      {selectedEmployee && (
        <div
          className="employees-modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setSelectedEmployee(null)
            }
          }}
        >
          <div
            className="employees-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-modal-title"
          >
            <div className="employees-modal-header">
              <div>
                <span className="employees-modal-kicker">
                  КАРТКА ПРАЦІВНИКА
                </span>

                <h2 id="employee-modal-title">
                  {fullName(selectedEmployee)}
                </h2>

                <p>
                  Працівник #{selectedEmployee.employee_id}
                </p>
              </div>

              <button
                type="button"
                className="employees-modal-close"
                aria-label="Закрити картку"
                onClick={() => setSelectedEmployee(null)}
              >
                ×
              </button>
            </div>

            <div className="employees-modal-body">
              <div className="employees-detail">
                <span>Посада</span>
                <strong>
                  {selectedEmployee.position_name ?? '—'}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Підрозділ</span>
                <strong>
                  {selectedEmployee.department_name ?? '—'}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Аптека / склад</span>
                <strong>
                  {selectedEmployee.location_name ?? '—'}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Телефон</span>
                <strong>
                  {selectedEmployee.phone ?? '—'}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Email</span>
                <strong>
                  {selectedEmployee.email ?? '—'}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Дата прийняття</span>
                <strong>
                  {formatDate(selectedEmployee.hire_date)}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Дата звільнення</span>
                <strong>
                  {formatDate(selectedEmployee.termination_date)}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Статус зайнятості</span>
                <strong>
                  {selectedEmployee.employment_status}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Логін</span>
                <strong>
                  {selectedEmployee.username ?? 'Не створено'}
                </strong>
              </div>

              <div className="employees-detail">
                <span>Стан акаунта</span>
                <strong>
                  {selectedEmployee.account_id === null
                    ? 'Немає акаунта'
                    : selectedEmployee.account_is_active
                      ? 'Активний'
                      : 'Неактивний'}
                </strong>
              </div>

              <div className="employees-detail employees-detail-full">
                <span>Ролі доступу</span>
                <div className="employees-role-list">
                  {selectedEmployee.roles.length > 0
                    ? selectedEmployee.roles.map(role => (
                        <span
                          className="employees-role"
                          key={role}
                        >
                          {ROLE_LABELS[role] ?? role}
                        </span>
                      ))
                    : 'Ролі не призначені'}
                </div>
              </div>
            </div>

            <div className="employees-modal-footer">
              <button
                type="button"
                className="employees-refresh-btn"
                onClick={() => setSelectedEmployee(null)}
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
