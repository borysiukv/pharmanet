
import './HomePage.css'

export type HomeSection =
  | 'products'
  | 'inventory'
  | 'locations'
  | 'sales'
  | 'purchases'
  | 'transfers'
  | 'writeoffs'
  | 'analytics'

interface HomePageProps {
  onNavigate: (page: HomeSection) => void
}

const modules: {
  id: HomeSection
  title: string
  description: string
  icon: string
  color: string
}[] = [
  {
    id: 'products',
    title: 'Каталог товарів',
    description: 'Препарати, категорії та детальна інформація',
    icon: '▤',
    color: 'mint',
  },
  {
    id: 'inventory',
    title: 'Складські залишки',
    description: 'Облік запасів, партій і термінів придатності',
    icon: '▦',
    color: 'blue',
  },
  {
    id: 'locations',
    title: 'Аптеки',
    description: 'Аптеки та склади аптечної мережі',
    icon: '⌂',
    color: 'purple',
  },
  {
    id: 'sales',
    title: 'Продажі',
    description: 'Оформлення та перегляд продажів',
    icon: '◈',
    color: 'orange',
  },
  {
    id: 'purchases',
    title: 'Закупівлі',
    description: 'Замовлення та надходження товарів',
    icon: '⇣',
    color: 'teal',
  },
  {
    id: 'transfers',
    title: 'Переміщення',
    description: 'Переведення товарів між локаціями',
    icon: '⇄',
    color: 'blue',
  },
  {
    id: 'writeoffs',
    title: 'Списання',
    description: 'Облік пошкоджених і прострочених товарів',
    icon: '⊖',
    color: 'rose',
  },
  {
    id: 'analytics',
    title: 'Аналітика',
    description: 'Звіти, динаміка продажів та показники мережі',
    icon: '▥',
    color: 'purple',
  },
]

export default function HomePage({
  onNavigate,
}: HomePageProps) {
  return (
    <div className="ph-home">
      <div className="breadcrumb">
        Головна
      </div>

      {/* WELCOME BANNER */}

      <section className="ph-home-hero">
        <div className="ph-home-hero-content">
          <div className="ph-home-eyebrow">
            <span className="ph-home-eyebrow-dot" />
            PHARMANET PLATFORM
          </div>

          <h1>
            Вітаємо у <span>PharmaNet</span>
          </h1>

          <p>
            Ваш єдиний робочий простір для управління
            аптечною мережею. Усі необхідні інструменти
            в одному місці.
          </p>

          <button
            type="button"
            className="ph-home-primary-button"
            onClick={() => onNavigate('products')}
          >
            Перейти до каталогу
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div
          className="ph-home-hero-art"
          aria-hidden="true"
        >
          <div className="ph-home-art-glow" />

          <div className="ph-home-art-circle">
            <div className="ph-home-art-cross">
              <span />
              <span />
            </div>
          </div>

          <div className="ph-home-art-pill ph-home-art-pill-one" />
          <div className="ph-home-art-pill ph-home-art-pill-two" />

          <div className="ph-home-art-decoration ph-home-art-decoration-one" />
          <div className="ph-home-art-decoration ph-home-art-decoration-two" />
        </div>
      </section>

      {/* MODULES */}

      <div className="ph-home-section-heading">
        <div>
          <span className="ph-home-section-caption">
            МОЖЛИВОСТІ СИСТЕМИ
          </span>

          <h2>Розділи PharmaNet</h2>

          <p>
            Оберіть потрібний розділ, щоб розпочати роботу.
          </p>
        </div>
      </div>

      <div className="ph-home-modules">
        {modules.map(module => (
          <button
            type="button"
            key={module.id}
            className="ph-home-module"
            onClick={() => onNavigate(module.id)}
          >
            <span
              className={`ph-home-module-icon ph-home-icon-${module.color}`}
              aria-hidden="true"
            >
              {module.icon}
            </span>

            <span className="ph-home-module-content">
              <strong>{module.title}</strong>
              <small>{module.description}</small>
            </span>

            <span
              className="ph-home-module-arrow"
              aria-hidden="true"
            >
              ↗
            </span>
          </button>
        ))}
      </div>

      {/* INFORMATION BANNER */}

      <section className="ph-home-bottom-banner">
        <div className="ph-home-bottom-symbol">
          ✚
        </div>

        <div>
          <h3>Єдина система. Всі процеси.</h3>

          <p>
            PharmaNet об'єднує облік препаратів,
            продажі, закупівлі та складські операції
            в зручному інтерфейсі.
          </p>
        </div>

        <span className="ph-home-bottom-mark">
          PharmaNet
        </span>
      </section>

      <footer className="ph-home-footer">
        <span>© PharmaNet · Інформаційна система аптечної мережі</span>
        <span>Навчальний проєкт</span>
      </footer>
    </div>
  )
}
