import './CustomerPortal.css'

type Props = { onCustomer: () => void; onEmployee: () => void }

export default function EntryChoice({ onCustomer, onEmployee }: Props) {
  return (
    <main className="customer-entry">
      <div className="customer-entry-panel">
        <div className="customer-logo">✚ <span>PharmaNet</span></div>
        <p className="customer-eyebrow">Єдина інформаційна платформа аптечної мережі</p>
        <h1>Ласкаво просимо!</h1>
        <p className="customer-entry-text">Оберіть, як хочете користуватися системою.</p>
        <div className="customer-choice-grid">
          <button type="button" onClick={onCustomer} className="customer-choice">
            <span className="customer-choice-icon">♡</span>
            <strong>Я клієнт</strong>
            <span>Каталог препаратів, ціни та наявність в аптеках</span>
            <span className="customer-arrow">Переглянути каталог →</span>
          </button>
          <button type="button" onClick={onEmployee} className="customer-choice">
            <span className="customer-choice-icon">▦</span>
            <strong>Я співробітник</strong>
            <span>Вхід для фармацевтів, менеджерів та адміністратора</span>
            <span className="customer-arrow">Увійти до системи →</span>
          </button>
        </div>
      </div>
    </main>
  )
}
