# PharmaNet — розгортання демо на Render

## Архітектура

Один Render Docker Web Service віддає:
- `https://<site>.onrender.com/` — React/Vite
- `https://<site>.onrender.com/api/health` — FastAPI
- `https://<site>.onrender.com/api/auth/login` — авторизація
- Render PostgreSQL (окрема БД)

Це рішення **не змінює локальний `backend/app/database.py`**: Dockerfile замінює його адаптером тільки всередині контейнера.

## 1. Підготуй репозиторій

У корені `C:\Users\Admin\Desktop\pharmacy-system` мають бути:

```
pharmacy-system/
  Dockerfile
  .dockerignore
  render.yaml
  frontend/
    package.json
    package-lock.json
    src/
  backend/
    app/
      main.py
      database.py
      database_render.py
      serve.py
    requirements-render.txt
  database/
    01_create_tables.sql
    02_seed_data.sql
  scripts/
    init_demo_db.py
    rotate_demo_accounts.py
```

З архіву `pharmanet-render-kit.zip` **скопіюй файли у відповідні папки, НЕ замінюючи свій робочий `backend/app/main.py` або frontend-файли**. Якщо `frontend/package-lock.json` відсутній, у `frontend` виконай `npm install` — має з'явитися lockfile. `npm ci` використовує саме його.

Додай правила з `.gitignore.additions` до `.gitignore`. Рекомендовано створити **приватний GitHub-репозиторій**, не завантажуй `.env` та локальну БД у Git.

Перед Git перевір локально:

```powershell
cd C:\Users\Admin\Desktop\pharmacy-system\frontend
npm.cmd ci
npm.cmd run build
cd ..
.\backend\.venv\Scripts\python.exe -m py_compile .\backend\app\main.py
```

## 2. Завантаж у GitHub

Якщо репозиторію ще немає:

```powershell
cd C:\Users\Admin\Desktop\pharmacy-system
git init
git add .
git commit -m "Prepare PharmaNet Render demo"
git branch -M main
```

Створи порожній **private** репозиторій на https://github.com/new і скопіюй показані GitHub команди `git remote add origin ...` та `git push -u origin main` (не придумуй URL).

## 3. Render Blueprint

1. Відкрий https://dashboard.render.com/ → **New → Blueprint**.
2. Підключи GitHub і вибери репозиторій.
3. Render прочитає `render.yaml`, створить `pharmanet-demo-web` та `pharmanet-demo-db`.
4. Дочекайся завершення Docker build. До ініціалізації БД інтерфейс може працювати, а API запитів до БД — повертати помилки. Це очікувано.
5. Знайди Postgres → Connect → **External Database URL**. Не використовуй Internal URL для запуску з ПК. External URL — **секрет**, нікому не надсилай його.

## 4. Перший запуск нової бази (із власного ПК)

За потреби встанови Python-драйвери у віртуальне середовище:

```powershell
cd C:\Users\Admin\Desktop\pharmacy-system
.\backend\.venv\Scripts\python.exe -m pip install psycopg2-binary bcrypt
```

Надійніше вводити секрет інтерактивно, щоб він не опинився в історії термінала:

```powershell
$secure = Read-Host "Render External Database URL" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

.\backend\.venv\Scripts\python.exe .\scripts\init_demo_db.py --yes
.\backend\.venv\Scripts\python.exe .\scripts\rotate_demo_accounts.py
Remove-Item Env:\DATABASE_URL
```

**Увага:** `init_demo_db.py` працює тільки з новою пустою демо-БД; не запускай для реальних даних. `rotate_demo_accounts.py` вимикає зайві тестові акаунти та створює нові випадкові паролі для шести демонстраційних ролей. Збережи паролі локально, не публікуй в GitHub або скриншотах.

## 5. Smoke-test

У браузері:
- `https://<site>.onrender.com/api/health` → `status: ok`
- `https://<site>.onrender.com/` → сторінка входу
- вхід з новим паролем `sysadmin` → усі доступні модулі
- під `pharmacist01` → тільки дозволені модулі
- вихід → прямий запит до `/api/products` повертає 401
- перед створенням/прийманням закупівлі перевір вибір правильної локації.

На безкоштовному плані запуск після простою може бути повільнішим. Безкоштовний Render Postgres має строк дії **30 днів**, не має managed backup; подбай про резервне копіювання демо перед захистом.

## 6. Важливі обмеження

- Demo only. **Не завантажуй реальні персональні дані, рецепти або платежі.**
- Частина переміщень/списань ще може приймати чужий employee_id або location_id без належного серверного контролю. Продемонструй їх лише з довіреними тестовими акаунтами.
- `serve.py` перевіряє `Origin` для запитів на зміну даних; це базове обмеження проти cross-site запитів, не повноцінна стратегія CSRF для продакшену.
- Бажано вимкнути не потрібний для демо Swagger UI на публічному сайті; наразі він доступний через `/api/docs`, але маршрути захищені RBAC.
- **Не застосовувати до реальної аптечної мережі**, доки не готові аудит, location scoping, rate limit і повні security tests.

## 7. Якщо виникла помилка

- `ModuleNotFoundError`: звір Docker build logs і `backend/requirements-render.txt`.
- `relation "auth_sessions" does not exist`: не виконано `scripts/init_demo_db.py`.
- `relation "sale_requests" does not exist`: спробуй перевірити чи був застосований bootstrap для нової БД.
- `npm ci` failed: перевір `frontend/package-lock.json`.
- `403` після POST login: перевір, чи відкриваєш сайт саме на `https://...onrender.com`, а не на іншому домені.
- `DATABASE_URL` помилка: перевір Render Blueprint Postgres envVar.
