
import { useState, type FormEvent } from 'react'
import { login, type AuthUser } from './api'
import './LoginPage.css'

interface LoginPageProps {
  onLogin: (user: AuthUser) => void
}

export default function LoginPage({
  onLogin,
}: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setError('')
    setLoading(true)

    try {
      const result = await login(username.trim(), password)
      setPassword('')
      onLogin(result.user)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Не вдалося виконати вхід'

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-background login-background-one" />
      <div className="login-background login-background-two" />

      <div className="login-layout">
        <section className="login-presentation">
          <div className="login-brand">
            <div className="login-brand-symbol">✚</div>

            <div className="login-brand-copy">
              <strong>PharmaNet</strong>
              <span>PHARMACY MANAGEMENT SYSTEM</span>
            </div>
          </div>

          <div className="login-presentation-content">
            <span className="login-overline">
              ЄДИНА ІНФОРМАЦІЙНА ПЛАТФОРМА
            </span>

            <h1>
              Керуйте аптечною
              <br />
              мережею
              <span> ефективно.</span>
            </h1>

            <p>
              Препарати, складські залишки, продажі,
              закупівлі та управління персоналом —
              в одній сучасній системі.
            </p>

            <div className="login-feature-row">
              <div className="login-feature">
                <div className="login-feature-icon">▦</div>
                <div>
                  <strong>Єдиний облік</strong>
                  <span>Всі аптеки та склади</span>
                </div>
              </div>

              <div className="login-feature">
                <div className="login-feature-icon">⇄</div>
                <div>
                  <strong>Зручне управління</strong>
                  <span>Усі основні операції</span>
                </div>
              </div>
            </div>
          </div>

          <div className="login-illustration" aria-hidden="true">
            <div className="login-illustration-ring">
              <div className="login-illustration-cross">
                <span />
                <span />
              </div>
            </div>

            <div className="login-illustration-pill pill-a" />
            <div className="login-illustration-pill pill-b" />
            <div className="login-illustration-dot dot-a" />
            <div className="login-illustration-dot dot-b" />
          </div>

          <div className="login-presentation-footer">
            © PharmaNet · Інформаційна система аптечної мережі
          </div>
        </section>

        <section className="login-form-section">
          <div className="login-form-container">
            <div className="login-form-top">
              <div className="login-form-symbol">✚</div>

              <span className="login-form-eyebrow">
                ЛАСКАВО ПРОСИМО
              </span>

              <h2>Вхід до системи</h2>

              <p>
                Введіть свої облікові дані для продовження
                роботи в PharmaNet.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="login-username">
                  Логін користувача
                </label>

                <div className="login-input-wrap">
                  <span aria-hidden="true">♙</span>

                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Введіть логін"
                    value={username}
                    onChange={event => {
                      setUsername(event.target.value)
                      setError('')
                    }}
                    required
                    maxLength={150}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="login-password">
                  Пароль
                </label>

                <div className="login-input-wrap">
                  <span aria-hidden="true">⌑</span>

                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Введіть пароль"
                    value={password}
                    onChange={event => {
                      setPassword(event.target.value)
                      setError('')
                    }}
                    required
                    disabled={loading}
                  />

                  <button
                    type="button"
                    className="login-show-password"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={
                      showPassword
                        ? 'Приховати пароль'
                        : 'Показати пароль'
                    }
                    aria-pressed={showPassword}
                  >
                    {showPassword ? '◉' : '◎'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <span aria-hidden="true">!</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={loading}
              >
                {loading ? 'Виконується вхід...' : 'Увійти в систему'}
                {!loading && <span aria-hidden="true">→</span>}
              </button>
            </form>

            <div className="login-security">
              <span aria-hidden="true">◇</span>
              Захищене підключення до облікового запису
            </div>

            <div className="login-help">
              Не знаєте облікових даних?
              <br />
              Зверніться до адміністратора системи.
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
