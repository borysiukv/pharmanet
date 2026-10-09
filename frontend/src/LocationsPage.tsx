
import { useEffect, useState } from 'react'
import { getLocations, type Location } from './api'

function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    getLocations()
      .then(data => {
        if (!cancelled) setLocations(data)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Не вдалося завантажити список локацій')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = locations.filter(location => {
    const matchesSearch =
      location.name.toLowerCase().includes(search.toLowerCase()) ||
      (location.address ?? '')
        .toLowerCase()
        .includes(search.toLowerCase())

    const matchesType =
      typeFilter === 'ALL' ||
      location.location_type === typeFilter

    return matchesSearch && matchesType
  })

  const pharmacies = locations.filter(
    l => l.location_type === 'PHARMACY'
  ).length

  const warehouses = locations.filter(
    l => l.location_type === 'WAREHOUSE'
  ).length

  const offices = locations.filter(
    l => l.location_type === 'OFFICE'
  ).length

  function getTypeLabel(type: string) {
    switch (type) {
      case 'PHARMACY':
        return 'Аптека'
      case 'WAREHOUSE':
        return 'Склад'
      case 'OFFICE':
        return 'Офіс'
      default:
        return type
    }
  }

  return (
    <>
      <div className="breadcrumb">
        Головна / Аптеки
      </div>

      <div className="page-heading">
        <div>
          <h1>Аптеки та підрозділи</h1>
          <p>Управління структурою аптечної мережі</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <span>Аптеки</span>
          <strong>{pharmacies}</strong>
          <small>Активні аптечні точки</small>
        </div>

        <div className="stat-card">
          <span>Склади</span>
          <strong>{warehouses}</strong>
          <small>Складські підрозділи</small>
        </div>

        <div className="stat-card">
          <span>Офіси</span>
          <strong>{offices}</strong>
          <small>Адміністративні підрозділи</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Список локацій</h2>
          <p>Інформація з бази даних аптечної мережі</p>
        </div>

        <div className="filters">
          <input
            type="search"
            placeholder="Пошук за назвою або адресою..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="ALL">Усі типи</option>
            <option value="PHARMACY">Аптеки</option>
            <option value="WAREHOUSE">Склади</option>
            <option value="OFFICE">Офіси</option>
          </select>
        </div>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <div className="message">
            Завантаження локацій...
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Назва</th>
                  <th>Тип</th>
                  <th>Адреса</th>
                  <th>Телефон</th>
                  <th>Статус</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(location => (
                  <tr key={location.location_id}>
                    <td>#{location.location_id}</td>
                    <td className="product-name">
                      {location.name}
                    </td>
                    <td>
                      {getTypeLabel(location.location_type)}
                    </td>
                    <td>{location.address ?? '—'}</td>
                    <td>{location.phone ?? '—'}</td>
                    <td>
                      <span
                        className={
                          location.is_active
                            ? 'badge active'
                            : 'badge inactive'
                        }
                      >
                        {location.is_active
                          ? 'Активна'
                          : 'Неактивна'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="message">
                Локацій не знайдено
              </div>
            )}
          </div>
        )}

        <div className="table-footer">
          Відображено {filtered.length} локацій
        </div>
      </section>
    </>
  )
}

export default LocationsPage
