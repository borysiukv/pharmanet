
import { useEffect, useState } from 'react'

import {
  getProducts,
  getCurrentUser,
  logout,
  type Product,
  type AuthUser,
} from './api'

import LoginPage from './LoginPage'
import HomePage, { type HomeSection } from './HomePage'
import DashboardPage from './DashboardPage'
import ProductModal from './ProductModal'
import InventoryPage from './InventoryPage'
import LocationsPage from './LocationsPage'
import SalesPage from './SalesPage'
import PurchasesPage from './PurchasesPage'
import TransfersPage from './TransfersPage'
import WriteOffsPage from './WriteOffsPage'
import EmployeesPage from './EmployeesPage'

import './App.css'

// =====================================================
// TYPES
// =====================================================

type Page =
  | 'home'
  | HomeSection
  | 'employees'

type AuthState = 'checking' | 'guest' | 'authenticated'

type Role =
  | 'PHARMACIST'
  | 'PHARMACY_MANAGER'
  | 'WAREHOUSE_WORKER'
  | 'PURCHASING_MANAGER'
  | 'NETWORK_MANAGER'
  | 'SYSTEM_ADMIN'

// =====================================================
// ACCESS CONTROL
// Keep in sync with FastAPI RBAC.
// =====================================================

const ALL_ROLES: Role[] = [
  'PHARMACIST',
  'PHARMACY_MANAGER',
  'WAREHOUSE_WORKER',
  'PURCHASING_MANAGER',
  'NETWORK_MANAGER',
  'SYSTEM_ADMIN',
]

const ACCESS: Record<Page, readonly Role[]> = {
  home: ALL_ROLES,
  products: ALL_ROLES,
  inventory: ALL_ROLES,
  locations: ALL_ROLES,

  sales: [
    'PHARMACIST',
    'PHARMACY_MANAGER',
    'SYSTEM_ADMIN',
  ],

  purchases: [
    'PURCHASING_MANAGER',
    'NETWORK_MANAGER',
    'SYSTEM_ADMIN',
  ],

  transfers: [
    'WAREHOUSE_WORKER',
    'PHARMACY_MANAGER',
    'SYSTEM_ADMIN',
  ],

  writeoffs: [
    'PHARMACIST',
    'PHARMACY_MANAGER',
    'WAREHOUSE_WORKER',
    'SYSTEM_ADMIN',
  ],

  employees: [
    'NETWORK_MANAGER',
    'SYSTEM_ADMIN',
  ],

  analytics: [
    'PHARMACY_MANAGER',
    'NETWORK_MANAGER',
    'SYSTEM_ADMIN',
  ],
}

const MENU: {
  page: Page
  label: string
  icon: string
}[] = [
  { page: 'home', label: 'Головна', icon: '⌂' },
  { page: 'products', label: 'Каталог товарів', icon: '▤' },
  { page: 'inventory', label: 'Складські залишки', icon: '▥' },
  { page: 'locations', label: 'Аптеки', icon: '⌂' },
  { page: 'sales', label: 'Продажі', icon: '▣' },
  { page: 'purchases', label: 'Закупівлі', icon: '⇣' },
  { page: 'transfers', label: 'Переміщення', icon: '↔' },
  { page: 'writeoffs', label: 'Списання', icon: '⊖' },
  { page: 'employees', label: 'Працівники', icon: '♙' },
  { page: 'analytics', label: 'Аналітика', icon: '▥' },
]

const ROLE_LABELS: Record<Role, string> = {
  PHARMACIST: 'Фармацевт',
  PHARMACY_MANAGER: 'Завідувач аптеки',
  WAREHOUSE_WORKER: 'Працівник складу',
  PURCHASING_MANAGER: 'Менеджер закупівель',
  NETWORK_MANAGER: 'Керівник мережі',
  SYSTEM_ADMIN: 'Адміністратор',
}

function hasAccess(
  user: AuthUser | null,
  page: Page
): boolean {
  if (!user) return false

  return user.roles.some(role =>
    ACCESS[page].includes(role as Role)
  )
}

function isSessionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 401
  )
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error
  ) {
    return (error as { status?: number }).status
  }

  return undefined
}

// =====================================================
// MAIN APPLICATION
// =====================================================

export default function App() {
  // AUTH

  const [authState, setAuthState] =
    useState<AuthState>('checking')

  const [currentUser, setCurrentUser] =
    useState<AuthUser | null>(null)

  const [logoutLoading, setLogoutLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // NAVIGATION

  const [page, setPage] = useState<Page>('home')
  const [navigationError, setNavigationError] = useState('')

  // PRODUCTS

  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Усі категорії')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [selectedProductId, setSelectedProductId] =
    useState<number | null>(null)

  // =====================================================
  // CHECK SESSION
  // =====================================================

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const user = await getCurrentUser()

        if (cancelled) return

        setCurrentUser(user)
        setAuthState('authenticated')
      } catch (err) {
        if (cancelled) return

        setCurrentUser(null)
        setAuthState('guest')

        if (!isSessionError(err)) {
          setAuthError(
            'Не вдалося перевірити сесію. ' +
            'Переконайтеся, що Backend запущено.'
          )
        }
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [])

  // =====================================================
  // LOGIN / LOGOUT
  // =====================================================

  function handleLogin(user: AuthUser) {
    setCurrentUser(user)
    setAuthError('')
    setNavigationError('')
    setPage('home')
    setSelectedProductId(null)
    setAuthState('authenticated')
  }

  async function handleLogout() {
    if (logoutLoading) return

    setLogoutLoading(true)
    setAuthError('')

    try {
      await logout()

      setCurrentUser(null)
      setSelectedProductId(null)
      setSearch('')
      setCategory('Усі категорії')
      setProducts([])
      setPage('home')
      setNavigationError('')
      setAuthState('guest')
    } catch {
      setAuthError(
        'Не вдалося завершити сесію на сервері. ' +
        'Спробуйте ще раз.'
      )
    } finally {
      setLogoutLoading(false)
    }
  }

  // =====================================================
  // PRODUCTS
  // =====================================================

  useEffect(() => {
    if (authState !== 'authenticated') return

    let cancelled = false

    async function loadProducts() {
      setLoading(true)
      setError('')

      try {
        const data = await getProducts(search)

        if (!cancelled) {
          setProducts(data.products)
        }
      } catch (err) {
        if (cancelled) return

        const status = getErrorStatus(err)

        if (status === 403) {
          setError(
            'Недостатньо прав для перегляду каталогу.'
          )
        } else if (status === 401) {
          setError(
            'Сесія завершилася. Увійдіть повторно.'
          )
        } else {
          setError('Не вдалося завантажити товари')
        }

        setProducts([])
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    const timer = setTimeout(() => {
      void loadProducts()
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, authState])

  const categories = [
    'Усі категорії',
    ...Array.from(
      new Set(
        products
          .map(p => p.category)
          .filter(
            (value): value is string => Boolean(value)
          )
      )
    ),
  ]

  const filteredProducts = products.filter(
    product =>
      category === 'Усі категорії' ||
      product.category === category
  )

  const activeProducts = filteredProducts.filter(
    product => product.is_active
  ).length

  // =====================================================
  // NAVIGATION WITH ROLE CHECK
  // =====================================================

  function navigateTo(newPage: Page) {
    setSelectedProductId(null)
    setNavigationError('')

    if (!hasAccess(currentUser, newPage)) {
      setNavigationError(
        'У вас немає прав для доступу до цього розділу.'
      )
      return
    }

    setPage(newPage)
  }

  const allowedMenu = MENU.filter(item =>
    hasAccess(currentUser, item.page)
  )

  const fullName = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}`
    : ''

  const initials = currentUser
    ? `${currentUser.first_name.charAt(0)}${currentUser.last_name.charAt(0)}`
    : 'AD'

  const primaryRole = currentUser?.roles.find(
    role => role in ROLE_LABELS
  ) as Role | undefined

  const roleLabel = primaryRole
    ? ROLE_LABELS[primaryRole]
    : 'Користувач'

  // =====================================================
  // INITIAL AUTH CHECK
  // =====================================================

  if (authState === 'checking') {
    return (
      <div className="ph-auth-loading">
        <div className="ph-auth-loading-icon">
          ✚
        </div>

        <h2>PharmaNet</h2>
        <p>Перевіряємо авторизацію...</p>
      </div>
    )
  }

  // =====================================================
  // LOGIN PAGE
  // =====================================================

  if (authState === 'guest') {
    return (
      <>
        <LoginPage onLogin={handleLogin} />

        {authError && (
          <div className="ph-auth-global-error" role="alert">
            {authError}
          </div>
        )}
      </>
    )
  }

  // =====================================================
  // AUTHENTICATED APPLICATION
  // =====================================================

  return (
    <div className="app">
      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✚</div>

          <div>
            <strong>PharmaNet</strong>
            <span>Система управління аптеками</span>
          </div>
        </div>

        <div className="sidebar-label">
          ГОЛОВНЕ МЕНЮ
        </div>

        <nav aria-label="Головна навігація">
          {allowedMenu.map(item => (
            <button
              key={item.page}
              type="button"
              className={`nav-item ${
                page === item.page ? 'active' : ''
              }`}
              onClick={() => navigateTo(item.page)}
              aria-current={
                page === item.page ? 'page' : undefined
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span className="online-dot" />
          <span>Авторизовано</span>
        </div>
      </aside>

      {/* MAIN */}

      <main className="main">
        <header className="topbar">
          <span>
            Інформаційна система аптечної мережі
          </span>

          <div className="ph-topbar-user">
            <div className="ph-topbar-user-details">
              <strong>{fullName}</strong>

              <small>
                {roleLabel}
                {currentUser?.location_name
                  ? ` · ${currentUser.location_name}`
                  : ''}
              </small>
            </div>

            <div className="avatar" title={fullName}>
              {initials}
            </div>

            <button
              type="button"
              className="ph-topbar-logout"
              onClick={() => void handleLogout()}
              disabled={logoutLoading}
            >
              {logoutLoading ? 'Вихід...' : 'Вийти'}
            </button>
          </div>
        </header>

        {authError && (
          <div className="ph-auth-global-error" role="alert">
            {authError}
          </div>
        )}

        <div className="content">
          {navigationError && (
            <div className="ph-rbac-error" role="alert">
              {navigationError}
            </div>
          )}

          {/* HOME — no analytics on the start page */}

          {page === 'home' && (
            <HomePage
              onNavigate={target => navigateTo(target)}
            />
          )}

          {/* PRODUCTS */}

          {page === 'products' && (
            <>
              <div className="breadcrumb">
                Головна / Каталог товарів
              </div>

              <div className="page-heading">
                <div>
                  <h1>Каталог товарів</h1>
                  <p>
                    Перегляд та пошук препаратів аптечної мережі
                  </p>
                </div>

                <div className="status-pill">
                  ● Система працює
                </div>
              </div>

              <div className="stats">
                <div className="stat-card">
                  <span>Знайдено товарів</span>
                  <strong>{filteredProducts.length}</strong>
                  <small>За поточними фільтрами</small>
                </div>

                <div className="stat-card">
                  <span>Активні товари</span>
                  <strong>{activeProducts}</strong>
                  <small>Доступні в каталозі</small>
                </div>

                <div className="stat-card">
                  <span>Категорії</span>
                  <strong>{categories.length - 1}</strong>
                  <small>У завантажених результатах</small>
                </div>
              </div>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Список препаратів</h2>
                    <p>
                      Дані завантажуються з PostgreSQL
                    </p>
                  </div>
                </div>

                <div className="filters">
                  <input
                    type="search"
                    placeholder="Пошук препарату за назвою..."
                    value={search}
                    onChange={event =>
                      setSearch(event.target.value)
                    }
                    aria-label="Пошук препарату"
                  />

                  <select
                    value={category}
                    onChange={event =>
                      setCategory(event.target.value)
                    }
                    aria-label="Категорія товару"
                  >
                    {categories.map(item => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}

                {loading ? (
                  <div className="message">
                    Завантаження товарів...
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Назва товару</th>
                          <th>Категорія</th>
                          <th>Виробник</th>
                          <th>Штрихкод</th>
                          <th>Статус</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredProducts.map(product => (
                          <tr key={product.product_id}>
                            <td>#{product.product_id}</td>

                            <td>
                              <button
                                type="button"
                                className="product-link"
                                onClick={() =>
                                  setSelectedProductId(
                                    product.product_id
                                  )
                                }
                              >
                                {product.name}
                              </button>
                            </td>

                            <td>{product.category ?? '—'}</td>
                            <td>{product.manufacturer ?? '—'}</td>

                            <td className="barcode">
                              {product.barcode ?? '—'}
                            </td>

                            <td>
                              <span
                                className={
                                  product.is_active
                                    ? 'badge active'
                                    : 'badge inactive'
                                }
                              >
                                {product.is_active
                                  ? 'Активний'
                                  : 'Неактивний'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {!error &&
                      filteredProducts.length === 0 && (
                        <div className="message">
                          Товарів не знайдено
                        </div>
                      )}
                  </div>
                )}

                <div className="table-footer">
                  Відображено {filteredProducts.length} товарів
                </div>
              </section>
            </>
          )}

          {/* INVENTORY */}

          {page === 'inventory' &&
            hasAccess(currentUser, 'inventory') && (
              <InventoryPage />
            )}

          {/* LOCATIONS */}

          {page === 'locations' &&
            hasAccess(currentUser, 'locations') && (
              <LocationsPage />
            )}

          {/* SALES */}

          {page === 'sales' &&
            hasAccess(currentUser, 'sales') && (
              <SalesPage />
            )}

          {/* PURCHASES */}

          {page === 'purchases' &&
            hasAccess(currentUser, 'purchases') && (
              <PurchasesPage />
            )}

          {/* TRANSFERS */}

          {page === 'transfers' &&
            hasAccess(currentUser, 'transfers') && (
              <TransfersPage />
            )}

          {/* WRITE-OFFS */}

          {page === 'writeoffs' &&
            hasAccess(currentUser, 'writeoffs') && (
              <WriteOffsPage />
            )}

          {/* EMPLOYEES */}

          {page === 'employees' &&
            hasAccess(currentUser, 'employees') && (
              <EmployeesPage />
            )}

          {/* ANALYTICS */}

          {page === 'analytics' &&
            hasAccess(currentUser, 'analytics') && (
              <DashboardPage />
            )}
        </div>
      </main>

      {/* PRODUCT DETAILS */}

      {selectedProductId !== null &&
        page === 'products' &&
        hasAccess(currentUser, 'products') && (
          <ProductModal
            productId={selectedProductId}
            onClose={() => setSelectedProductId(null)}
          />
        )}
    </div>
  )
}
