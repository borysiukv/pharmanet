-- ============================================================
-- 02_seed_data.sql
-- Початкове тестове наповнення БД аптечної мережі
-- Виконується ПІСЛЯ 01_create_tables.sql
--
-- Тестові паролі:
-- PHARMACIST         -> Pharm123!
-- PHARMACY_MANAGER   -> Manager123!
-- WAREHOUSE_WORKER   -> Warehouse123!
-- PURCHASING_MANAGER -> Purchase123!
-- NETWORK_MANAGER    -> Network123!
-- SYSTEM_ADMIN       -> Admin123!
--
-- Паролі НЕ зберігаються у відкритому вигляді в user_accounts.
-- Для password_hash використовується PostgreSQL pgcrypto + bcrypt.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. LOCATIONS
-- ============================================================

INSERT INTO locations (name, location_type, address, phone, is_active) VALUES
('Аптека №1 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Хрещатик, 10', '+380441000001', TRUE),
('Аптека №2 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Велика Васильківська, 25', '+380441000002', TRUE),
('Аптека №3 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Антоновича, 40', '+380441000003', TRUE),
('Аптека №4 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Саксаганського, 55', '+380441000004', TRUE),
('Аптека №5 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Жилянська, 70', '+380441000005', TRUE),
('Аптека №6 «Здоров''я»', 'PHARMACY', 'м. Київ, просп. Перемоги, 35', '+380441000006', TRUE),
('Аптека №7 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Дорогожицька, 18', '+380441000007', TRUE),
('Аптека №8 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Оболонська, 30', '+380441000008', TRUE),
('Аптека №9 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Русанівська, 12', '+380441000009', TRUE),
('Аптека №10 «Здоров''я»', 'PHARMACY', 'м. Київ, вул. Ломоносова, 15', '+380441000010', TRUE),
('Центральний склад', 'WAREHOUSE', 'м. Київ, вул. Промислова, 20', '+380441000011', TRUE),
('Головний офіс', 'OFFICE', 'м. Київ, вул. Ділова, 8', '+380441000012', TRUE);

-- ============================================================
-- 2. DEPARTMENTS
-- ============================================================

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Адміністрація', l.location_id, 'ADMINISTRATION', NULL, TRUE
FROM locations l WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ кадрів', l.location_id, 'HR', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ закупівель', l.location_id, 'PURCHASING', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Фінансовий відділ', l.location_id, 'FINANCE', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Бухгалтерія', l.location_id, 'ACCOUNTING', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Фінансовий відділ' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'ІТ-відділ', l.location_id, 'IT', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ маркетингу', l.location_id, 'MARKETING', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ аналітики', l.location_id, 'ANALYTICS', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ логістики', l.location_id, 'LOGISTICS', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Адміністрація' AND d.location_id = l.location_id
WHERE l.name = 'Головний офіс';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Складський відділ', l.location_id, 'WAREHOUSE', NULL, TRUE
FROM locations l WHERE l.name = 'Центральний склад';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ приймання товару', l.location_id, 'RECEIVING', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Складський відділ' AND d.location_id = l.location_id
WHERE l.name = 'Центральний склад';

INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Відділ комплектації та відвантаження', l.location_id, 'SHIPPING', d.department_id, TRUE
FROM locations l
JOIN departments d ON d.name = 'Складський відділ' AND d.location_id = l.location_id
WHERE l.name = 'Центральний склад';

-- Окремий аптечний підрозділ у кожній аптеці.
INSERT INTO departments (name, location_id, department_type, parent_department_id, is_active)
SELECT 'Аптечний персонал', l.location_id, 'PHARMACY', NULL, TRUE
FROM locations l
WHERE l.location_type = 'PHARMACY';

-- ============================================================
-- 3. POSITIONS
-- ============================================================

INSERT INTO positions (name, description) VALUES
('Фармацевт', 'Обслуговування клієнтів, продаж товарів та робота з рецептами.'),
('Завідувач аптеки', 'Організація та контроль роботи конкретної аптеки.'),
('Працівник складу', 'Приймання, облік, комплектація та переміщення товарів.'),
('Менеджер із закупівель', 'Формування та контроль замовлень постачальникам.'),
('Менеджер мережі', 'Контроль та аналіз діяльності аптечної мережі.'),
('Системний адміністратор', 'Керування обліковими записами, доступом та технічною частиною системи.'),
('Логіст', 'Організація логістичних процесів та переміщення товарів.'),
('Бухгалтер', 'Ведення бухгалтерського та фінансового обліку.'),
('HR-менеджер', 'Кадровий облік та робота з персоналом.'),
('Фінансовий менеджер', 'Фінансове планування та контроль.'),
('Маркетолог', 'Маркетинговий аналіз та планування.'),
('Аналітик', 'Аналітика продажів, залишків та показників мережі.'),
('Директор', 'Загальне управління аптечною мережею.');

-- ============================================================
-- 4. ROLES
-- ============================================================

INSERT INTO roles (name, description) VALUES
('PHARMACIST', 'Операційна робота фармацевта в аптеці.'),
('PHARMACY_MANAGER', 'Керування конкретною аптекою.'),
('WAREHOUSE_WORKER', 'Робота з товарами центрального складу.'),
('PURCHASING_MANAGER', 'Закупівля товарів та робота з постачальниками.'),
('NETWORK_MANAGER', 'Контроль та аналіз роботи всієї аптечної мережі.'),
('SYSTEM_ADMIN', 'Адміністрування системи та керування доступом.');

-- ============================================================
-- 5. EMPLOYEES
-- ============================================================

-- ----------------------------
-- 5.1. Фармацевти: по одному в кожній аптеці
-- ----------------------------

INSERT INTO employees
(first_name, last_name, middle_name, phone, email, position_id,
 department_id, location_id, hire_date, employment_status, is_active)
SELECT
    v.first_name, v.last_name, v.middle_name, v.phone, v.email,
    p.position_id, d.department_id, l.location_id,
    v.hire_date, 'ACTIVE', TRUE
FROM (VALUES
    ('Олена','Іваненко','Сергіївна','+380501000001','pharmacist01@health.test','Аптека №1 «Здоров''я»','2025-01-15'::date),
    ('Марія','Петренко','Олександрівна','+380501000002','pharmacist02@health.test','Аптека №2 «Здоров''я»','2025-02-10'::date),
    ('Ірина','Шевченко','Вікторівна','+380501000003','pharmacist03@health.test','Аптека №3 «Здоров''я»','2025-02-20'::date),
    ('Анна','Коваленко','Миколаївна','+380501000004','pharmacist04@health.test','Аптека №4 «Здоров''я»','2025-03-05'::date),
    ('Оксана','Мельник','Ігорівна','+380501000005','pharmacist05@health.test','Аптека №5 «Здоров''я»','2025-03-12'::date),
    ('Наталія','Бондаренко','Андріївна','+380501000006','pharmacist06@health.test','Аптека №6 «Здоров''я»','2025-03-20'::date),
    ('Катерина','Романенко','Петрівна','+380501000007','pharmacist07@health.test','Аптека №7 «Здоров''я»','2025-04-01'::date),
    ('Юлія','Ткаченко','Олексіївна','+380501000008','pharmacist08@health.test','Аптека №8 «Здоров''я»','2025-04-10'::date),
    ('Світлана','Мороз','Василівна','+380501000009','pharmacist09@health.test','Аптека №9 «Здоров''я»','2025-04-18'::date),
    ('Вікторія','Мазур','Романівна','+380501000010','pharmacist10@health.test','Аптека №10 «Здоров''я»','2025-05-01'::date)
) AS v(first_name,last_name,middle_name,phone,email,location_name,hire_date)
JOIN locations l ON l.name = v.location_name
JOIN departments d ON d.name = 'Аптечний персонал' AND d.location_id = l.location_id
JOIN positions p ON p.name = 'Фармацевт';

-- ----------------------------
-- 5.2. Завідувачі: по одному в кожній аптеці
-- ----------------------------

INSERT INTO employees
(first_name, last_name, middle_name, phone, email, position_id,
 department_id, location_id, hire_date, employment_status, is_active)
SELECT
    v.first_name, v.last_name, v.middle_name, v.phone, v.email,
    p.position_id, d.department_id, l.location_id,
    v.hire_date, 'ACTIVE', TRUE
FROM (VALUES
    ('Олександр','Кравченко','Іванович','+380502000001','manager01@health.test','Аптека №1 «Здоров''я»','2024-09-01'::date),
    ('Дмитро','Бондар','Олександрович','+380502000002','manager02@health.test','Аптека №2 «Здоров''я»','2024-09-10'::date),
    ('Андрій','Коваленко','Сергійович','+380502000003','manager03@health.test','Аптека №3 «Здоров''я»','2024-09-20'::date),
    ('Максим','Романюк','Петрович','+380502000004','manager04@health.test','Аптека №4 «Здоров''я»','2024-10-01'::date),
    ('Сергій','Мельник','Олегович','+380502000005','manager05@health.test','Аптека №5 «Здоров''я»','2024-10-10'::date),
    ('Владислав','Шевченко','Андрійович','+380502000006','manager06@health.test','Аптека №6 «Здоров''я»','2024-10-20'::date),
    ('Роман','Ткаченко','Миколайович','+380502000007','manager07@health.test','Аптека №7 «Здоров''я»','2024-11-01'::date),
    ('Олег','Мороз','Вікторович','+380502000008','manager08@health.test','Аптека №8 «Здоров''я»','2024-11-10'::date),
    ('Павло','Мазур','Ігорович','+380502000009','manager09@health.test','Аптека №9 «Здоров''я»','2024-11-20'::date),
    ('Микола','Іванов','Романович','+380502000010','manager10@health.test','Аптека №10 «Здоров''я»','2024-12-01'::date)
) AS v(first_name,last_name,middle_name,phone,email,location_name,hire_date)
JOIN locations l ON l.name = v.location_name
JOIN departments d ON d.name = 'Аптечний персонал' AND d.location_id = l.location_id
JOIN positions p ON p.name = 'Завідувач аптеки';

-- ----------------------------
-- 5.3. Центральний склад
-- ----------------------------

INSERT INTO employees
(first_name, last_name, middle_name, phone, email, position_id,
 department_id, location_id, hire_date, employment_status, is_active)
SELECT
    v.first_name, v.last_name, v.middle_name, v.phone, v.email,
    p.position_id, d.department_id, l.location_id,
    v.hire_date, 'ACTIVE', TRUE
FROM (VALUES
    ('Андрій','Кравченко','Петрович','+380503000001','warehouse01@health.test','Працівник складу','Складський відділ','2024-06-01'::date),
    ('Максим','Бондар','Ігорович','+380503000002','warehouse02@health.test','Працівник складу','Складський відділ','2024-07-15'::date),
    ('Олег','Романюк','Васильович','+380503000003','logistic@health.test','Логіст','Відділ логістики','2024-08-01'::date)
) AS v(first_name,last_name,middle_name,phone,email,position_name,department_name,hire_date)
JOIN positions p ON p.name = v.position_name
JOIN locations l ON l.name = CASE
    WHEN v.department_name = 'Складський відділ' THEN 'Центральний склад'
    ELSE 'Головний офіс'
END
JOIN departments d ON d.name = v.department_name AND d.location_id = l.location_id;

-- ----------------------------
-- 5.4. Головний офіс
-- ----------------------------

INSERT INTO employees
(first_name, last_name, middle_name, phone, email, position_id,
 department_id, location_id, hire_date, employment_status, is_active)
SELECT
    v.first_name, v.last_name, v.middle_name, v.phone, v.email,
    p.position_id, d.department_id, l.location_id,
    v.hire_date, 'ACTIVE', TRUE
FROM (VALUES
    ('Ірина','Мельник','Олександрівна','+380504000001','purchasing01@health.test','Менеджер із закупівель','Відділ закупівель','2024-04-01'::date),
    ('Сергій','Коваленко','Іванович','+380504000002','purchasing02@health.test','Менеджер із закупівель','Відділ закупівель','2024-05-15'::date),
    ('Наталія','Шевченко','Петрівна','+380504000003','network01@health.test','Менеджер мережі','Відділ аналітики','2024-03-01'::date),
    ('Дмитро','Ткаченко','Олексійович','+380504000004','sysadmin@health.test','Системний адміністратор','ІТ-відділ','2024-02-01'::date),
    ('Олена','Петренко','Василівна','+380504000005','hr@health.test','HR-менеджер','Відділ кадрів','2024-01-15'::date),
    ('Марія','Бондаренко','Ігорівна','+380504000006','accounting@health.test','Бухгалтер','Бухгалтерія','2024-01-20'::date),
    ('Анна','Романенко','Сергіївна','+380504000007','finance@health.test','Фінансовий менеджер','Фінансовий відділ','2024-02-15'::date),
    ('Катерина','Мазур','Олегівна','+380504000008','marketing@health.test','Маркетолог','Відділ маркетингу','2024-03-15'::date),
    ('Владислав','Мороз','Андрійович','+380504000009','analyst@health.test','Аналітик','Відділ аналітики','2024-04-15'::date),
    ('Олександр','Іваненко','Миколайович','+380504000010','director@health.test','Директор','Адміністрація','2023-01-10'::date)
) AS v(first_name,last_name,middle_name,phone,email,position_name,department_name,hire_date)
JOIN positions p ON p.name = v.position_name
JOIN locations l ON l.name = 'Головний офіс'
JOIN departments d ON d.name = v.department_name AND d.location_id = l.location_id;

-- ============================================================
-- 6. USER ACCOUNTS
-- ============================================================

-- Для кожної категорії користувача створюємо тестові акаунти.
-- Паролі генеруються як bcrypt-хеші через pgcrypto.

INSERT INTO user_accounts
(employee_id, username, password_hash, is_active)
SELECT e.employee_id, v.username, crypt(v.password, gen_salt('bf', 12)), TRUE
FROM (VALUES
    ('pharmacist01','Pharm123!','pharmacist01@health.test'),
    ('pharmacist02','Pharm123!','pharmacist02@health.test'),
    ('pharmacist03','Pharm123!','pharmacist03@health.test'),
    ('pharmacist04','Pharm123!','pharmacist04@health.test'),
    ('pharmacist05','Pharm123!','pharmacist05@health.test'),
    ('pharmacist06','Pharm123!','pharmacist06@health.test'),
    ('pharmacist07','Pharm123!','pharmacist07@health.test'),
    ('pharmacist08','Pharm123!','pharmacist08@health.test'),
    ('pharmacist09','Pharm123!','pharmacist09@health.test'),
    ('pharmacist10','Pharm123!','pharmacist10@health.test'),
    ('manager01','Manager123!','manager01@health.test'),
    ('manager02','Manager123!','manager02@health.test'),
    ('manager03','Manager123!','manager03@health.test'),
    ('manager04','Manager123!','manager04@health.test'),
    ('manager05','Manager123!','manager05@health.test'),
    ('manager06','Manager123!','manager06@health.test'),
    ('manager07','Manager123!','manager07@health.test'),
    ('manager08','Manager123!','manager08@health.test'),
    ('manager09','Manager123!','manager09@health.test'),
    ('manager10','Manager123!','manager10@health.test'),
    ('warehouse01','Warehouse123!','warehouse01@health.test'),
    ('warehouse02','Warehouse123!','warehouse02@health.test'),
    ('purchasing01','Purchase123!','purchasing01@health.test'),
    ('purchasing02','Purchase123!','purchasing02@health.test'),
    ('network01','Network123!','network01@health.test'),
    ('sysadmin','Admin123!','sysadmin@health.test')
) AS v(username,password,email)
JOIN employees e ON e.email = v.email;

-- ============================================================
-- 7. ACCOUNT ROLES
-- ============================================================

INSERT INTO account_roles (account_id, role_id)
SELECT ua.account_id, r.role_id
FROM user_accounts ua
JOIN roles r ON
    (ua.username LIKE 'pharmacist%' AND r.name = 'PHARMACIST')
 OR (ua.username LIKE 'manager%' AND r.name = 'PHARMACY_MANAGER')
 OR (ua.username LIKE 'warehouse%' AND r.name = 'WAREHOUSE_WORKER')
 OR (ua.username LIKE 'purchasing%' AND r.name = 'PURCHASING_MANAGER')
 OR (ua.username = 'network01' AND r.name = 'NETWORK_MANAGER')
 OR (ua.username = 'sysadmin' AND r.name = 'SYSTEM_ADMIN');

-- ============================================================
-- 8. PRODUCT CATEGORIES
-- ============================================================

INSERT INTO product_categories (name, description, parent_category_id) VALUES
('Лікарські засоби', 'Лікарські препарати для профілактики та лікування захворювань.', NULL),
('Медичні вироби', 'Медичні вироби та приладдя.', NULL),
('Косметика', 'Косметичні засоби.', NULL),
('Засоби гігієни', 'Товари для особистої та медичної гігієни.', NULL),
('Дитячі товари', 'Товари для дітей.', NULL),
('Вітаміни та мінерали', 'Вітамінні та мінеральні комплекси.', NULL),
('Товари для здоров''я', 'Інші товари для підтримки здоров''я.', NULL);

-- ============================================================
-- 9. THERAPEUTIC CATEGORIES
-- ============================================================

INSERT INTO therapeutic_categories (name, description, parent_category_id) VALUES
('Знеболювальні', 'Препарати для зменшення болю.', NULL),
('Жарознижувальні', 'Препарати для зниження температури тіла.', NULL),
('Протизапальні', 'Препарати з протизапальною дією.', NULL),
('Антигістамінні', 'Препарати для лікування алергічних реакцій.', NULL),
('Засоби від застуди', 'Препарати для симптоматичного лікування застуди.', NULL),
('Засоби для травної системи', 'Препарати для лікування захворювань травної системи.', NULL),
('Серцево-судинні засоби', 'Препарати для серцево-судинної системи.', NULL),
('Антисептичні засоби', 'Засоби для антисептичної обробки.', NULL),
('Вітамінні препарати', 'Препарати та комплекси з вітамінами.', NULL),
('Засоби для лікування кашлю', 'Препарати для лікування кашлю.', NULL);

-- ============================================================
-- 10. MANUFACTURERS
-- ============================================================

INSERT INTO manufacturers (name, country, address, phone, email) VALUES
('PharmaNova', 'Україна', 'м. Київ, вул. Медична, 1', '+380441100001', 'info@pharmanova.test'),
('Medica Plus', 'Україна', 'м. Харків, вул. Наукова, 12', '+380571100002', 'info@medicaplus.test'),
('HealthLine', 'Україна', 'м. Львів, вул. Галицька, 20', '+380321100003', 'info@healthline.test'),
('BioMedica', 'Польща', 'Warszawa, ul. Zdrowia 5', '+48221000004', 'info@biomedica.test'),
('VitaLife', 'Україна', 'м. Дніпро, вул. Центральна, 8', '+380561100005', 'info@vitalife.test'),
('EuroPharm', 'Німеччина', 'Berlin, Gesundheitsstrasse 7', '+49301000006', 'info@europharm.test'),
('MedService', 'Україна', 'м. Одеса, вул. Аптечна, 14', '+380481100007', 'info@medservice.test'),
('WellCare', 'Чехія', 'Praha, Zdravi 9', '+420210000008', 'info@wellcare.test');

-- ============================================================
-- 11. PRODUCTS
-- ============================================================

INSERT INTO products
(name, category_id, manufacturer_id, barcode, sku, description, unit, is_active)
SELECT
    v.name, pc.category_id, m.manufacturer_id, v.barcode, v.sku,
    v.description, v.unit, TRUE
FROM (VALUES
('Парацетамол 500 мг','Лікарські засоби','PharmaNova','4820000000010','MED-0001','Таблетки парацетамолу 500 мг.','упаковка'),
('Ібупрофен 200 мг','Лікарські засоби','Medica Plus','4820000000027','MED-0002','Таблетки ібупрофену 200 мг.','упаковка'),
('Ібупрофен 400 мг','Лікарські засоби','Medica Plus','4820000000034','MED-0003','Таблетки ібупрофену 400 мг.','упаковка'),
('Амоксицилін 500 мг','Лікарські засоби','BioMedica','4820000000041','MED-0004','Капсули амоксициліну 500 мг.','упаковка'),
('Лоратадин 10 мг','Лікарські засоби','HealthLine','4820000000058','MED-0005','Таблетки лоратадину 10 мг.','упаковка'),
('Цетиризин 10 мг','Лікарські засоби','HealthLine','4820000000065','MED-0006','Таблетки цетиризину 10 мг.','упаковка'),
('Аспірин 500 мг','Лікарські засоби','EuroPharm','4820000000072','MED-0007','Таблетки ацетилсаліцилової кислоти.','упаковка'),
('Німесулід 100 мг','Лікарські засоби','PharmaNova','4820000000089','MED-0008','Таблетки німесуліду 100 мг.','упаковка'),
('Амброксол 30 мг','Лікарські засоби','Medica Plus','4820000000096','MED-0009','Таблетки амброксолу 30 мг.','упаковка'),
('Омепразол 20 мг','Лікарські засоби','VitaLife','4820000000102','MED-0010','Капсули омепразолу 20 мг.','упаковка'),
('Хлоргексидин 0,05%','Лікарські засоби','MedService','4820000000119','MED-0011','Розчин хлоргексидину 0,05%.','флакон'),
('Валеріана таблетки','Лікарські засоби','VitaLife','4820000000126','MED-0012','Таблетки екстракту валеріани.','упаковка'),
('Бинт стерильний','Медичні вироби','MedService','4820000000133','MED-0013','Стерильний медичний бинт.','шт'),
('Термометр електронний','Медичні вироби','WellCare','4820000000140','MED-0014','Електронний медичний термометр.','шт'),
('Шприц 5 мл','Медичні вироби','MedService','4820000000157','MED-0015','Одноразовий шприц 5 мл.','шт'),
('Крем для рук','Косметика','WellCare','4820000000164','COS-0001','Зволожувальний крем для рук.','шт'),
('Зволожувальний крем','Косметика','WellCare','4820000000171','COS-0002','Зволожувальний крем для обличчя.','шт'),
('Дитячий крем','Косметика','VitaLife','4820000000188','COS-0003','Дитячий захисний крем.','шт'),
('Антисептичний гель','Засоби гігієни','HealthLine','4820000000195','HYG-0001','Гель для гігієнічної обробки рук.','шт'),
('Вологі серветки','Засоби гігієни','HealthLine','4820000000201','HYG-0002','Вологі гігієнічні серветки.','упаковка'),
('Медична маска','Засоби гігієни','MedService','4820000000218','HYG-0003','Одноразова медична маска.','шт'),
('Дитячі підгузки','Дитячі товари','WellCare','4820000000225','CHD-0001','Одноразові дитячі підгузки.','упаковка'),
('Дитячий термометр','Дитячі товари','WellCare','4820000000232','CHD-0002','Термометр для дітей.','шт'),
('Вітамін C 500 мг','Вітаміни та мінерали','VitaLife','4820000000249','VIT-0001','Вітамін C 500 мг.','упаковка')
) AS v(name,category_name,manufacturer_name,barcode,sku,description,unit)
JOIN product_categories pc ON pc.name = v.category_name
JOIN manufacturers m ON m.name = v.manufacturer_name;

-- ============================================================
-- 12. MEDICINES
-- ============================================================

INSERT INTO medicines
(product_id, active_ingredient, dosage, dosage_form, prescription_required, registration_number)
SELECT p.product_id, v.active_ingredient, v.dosage, v.dosage_form,
       v.prescription_required, v.registration_number
FROM (VALUES
('Парацетамол 500 мг','Парацетамол','500 мг','таблетки',FALSE,'UA-MED-0001'),
('Ібупрофен 200 мг','Ібупрофен','200 мг','таблетки',FALSE,'UA-MED-0002'),
('Ібупрофен 400 мг','Ібупрофен','400 мг','таблетки',FALSE,'UA-MED-0003'),
('Амоксицилін 500 мг','Амоксицилін','500 мг','капсули',TRUE,'UA-MED-0004'),
('Лоратадин 10 мг','Лоратадин','10 мг','таблетки',FALSE,'UA-MED-0005'),
('Цетиризин 10 мг','Цетиризин','10 мг','таблетки',FALSE,'UA-MED-0006'),
('Аспірин 500 мг','Ацетилсаліцилова кислота','500 мг','таблетки',FALSE,'UA-MED-0007'),
('Німесулід 100 мг','Німесулід','100 мг','таблетки',TRUE,'UA-MED-0008'),
('Амброксол 30 мг','Амброксол','30 мг','таблетки',FALSE,'UA-MED-0009'),
('Омепразол 20 мг','Омепразол','20 мг','капсули',FALSE,'UA-MED-0010'),
('Хлоргексидин 0,05%','Хлоргексидин','0,05%','розчин',FALSE,'UA-MED-0011'),
('Валеріана таблетки','Екстракт валеріани','20 мг','таблетки',FALSE,'UA-MED-0012')
) AS v(product_name,active_ingredient,dosage,dosage_form,prescription_required,registration_number)
JOIN products p ON p.name = v.product_name;

-- ============================================================
-- 13. MEDICINE THERAPEUTIC CATEGORIES
-- ============================================================

INSERT INTO medicine_therapeutic_categories (medicine_id, therapeutic_category_id)
SELECT m.medicine_id, tc.therapeutic_category_id
FROM medicines m
JOIN products p ON p.product_id = m.product_id
JOIN therapeutic_categories tc ON
    (p.name = 'Парацетамол 500 мг' AND tc.name IN ('Знеболювальні','Жарознижувальні'))
 OR (p.name IN ('Ібупрофен 200 мг','Ібупрофен 400 мг') AND tc.name IN ('Знеболювальні','Жарознижувальні','Протизапальні'))
 OR (p.name IN ('Лоратадин 10 мг','Цетиризин 10 мг') AND tc.name = 'Антигістамінні')
 OR (p.name = 'Амоксицилін 500 мг' AND tc.name = 'Засоби від застуди')
 OR (p.name = 'Аспірин 500 мг' AND tc.name IN ('Знеболювальні','Жарознижувальні'))
 OR (p.name = 'Німесулід 100 мг' AND tc.name IN ('Знеболювальні','Протизапальні'))
 OR (p.name = 'Амброксол 30 мг' AND tc.name = 'Засоби для лікування кашлю')
 OR (p.name = 'Омепразол 20 мг' AND tc.name = 'Засоби для травної системи')
 OR (p.name = 'Хлоргексидин 0,05%' AND tc.name = 'Антисептичні засоби')
 OR (p.name = 'Валеріана таблетки' AND tc.name = 'Серцево-судинні засоби');

-- ============================================================
-- 14. PRODUCT PRICES
-- Початкові ціни для всіх товарів у всіх аптеках.
-- ============================================================

INSERT INTO product_prices
(product_id, location_id, price, valid_from, valid_to, is_active)
SELECT
    p.product_id,
    l.location_id,
    CASE p.sku
        WHEN 'MED-0001' THEN 45.00
        WHEN 'MED-0002' THEN 55.00
        WHEN 'MED-0003' THEN 78.00
        WHEN 'MED-0004' THEN 125.00
        WHEN 'MED-0005' THEN 62.00
        WHEN 'MED-0006' THEN 70.00
        WHEN 'MED-0007' THEN 48.00
        WHEN 'MED-0008' THEN 95.00
        WHEN 'MED-0009' THEN 68.00
        WHEN 'MED-0010' THEN 82.00
        WHEN 'MED-0011' THEN 32.00
        WHEN 'MED-0012' THEN 38.00
        WHEN 'MED-0013' THEN 25.00
        WHEN 'MED-0014' THEN 210.00
        WHEN 'MED-0015' THEN 12.00
        WHEN 'COS-0001' THEN 95.00
        WHEN 'COS-0002' THEN 145.00
        WHEN 'COS-0003' THEN 75.00
        WHEN 'HYG-0001' THEN 65.00
        WHEN 'HYG-0002' THEN 42.00
        WHEN 'HYG-0003' THEN 8.00
        WHEN 'CHD-0001' THEN 420.00
        WHEN 'CHD-0002' THEN 180.00
        WHEN 'VIT-0001' THEN 110.00
    END,
    CURRENT_DATE,
    NULL,
    TRUE
FROM products p
CROSS JOIN locations l
WHERE l.location_type = 'PHARMACY';

-- ============================================================
-- 15. SUPPLIERS
-- ============================================================

INSERT INTO suppliers (name, edrpou, address, phone, email, is_active) VALUES
('ФармаПостач', '40000001', 'м. Київ, вул. Складська, 10', '+380441200001', 'sales@pharmapostach.test', TRUE),
('МедСнаб', '40000002', 'м. Київ, вул. Промислова, 15', '+380441200002', 'sales@medsnab.test', TRUE),
('Аптека-Партнер', '40000003', 'м. Київ, вул. Логістична, 5', '+380441200003', 'sales@apteka-partner.test', TRUE),
('МедТрейд', '40000004', 'м. Львів, вул. Складська, 22', '+380321200004', 'sales@medtrade.test', TRUE),
('Health Supply', '40000005', 'м. Дніпро, вул. Медична, 30', '+380561200005', 'sales@healthsupply.test', TRUE);

-- ============================================================
-- 16. SUPPLIER PRODUCTS
-- ============================================================

INSERT INTO supplier_products
(supplier_id, product_id, supplier_product_code, purchase_price)
SELECT s.supplier_id, p.product_id, v.code, v.price
FROM (VALUES
('ФармаПостач','Парацетамол 500 мг','FP-001',32.00),
('ФармаПостач','Ібупрофен 200 мг','FP-002',40.00),
('ФармаПостач','Ібупрофен 400 мг','FP-003',58.00),
('ФармаПостач','Амоксицилін 500 мг','FP-004',92.00),
('ФармаПостач','Лоратадин 10 мг','FP-005',45.00),
('ФармаПостач','Цетиризин 10 мг','FP-006',51.00),
('ФармаПостач','Аспірин 500 мг','FP-007',34.00),
('ФармаПостач','Німесулід 100 мг','FP-008',68.00),
('ФармаПостач','Амброксол 30 мг','FP-009',49.00),
('ФармаПостач','Омепразол 20 мг','FP-010',60.00),
('МедСнаб','Парацетамол 500 мг','MS-001',31.50),
('МедСнаб','Бинт стерильний','MS-002',16.00),
('МедСнаб','Термометр електронний','MS-003',145.00),
('МедСнаб','Шприц 5 мл','MS-004',7.00),
('МедСнаб','Хлоргексидин 0,05%','MS-005',21.00),
('Аптека-Партнер','Лоратадин 10 мг','AP-001',44.00),
('Аптека-Партнер','Цетиризин 10 мг','AP-002',50.00),
('Аптека-Партнер','Амброксол 30 мг','AP-003',48.00),
('Аптека-Партнер','Валеріана таблетки','AP-004',25.00),
('МедТрейд','Крем для рук','MT-001',68.00),
('МедТрейд','Зволожувальний крем','MT-002',105.00),
('МедТрейд','Дитячий крем','MT-003',52.00),
('МедТрейд','Антисептичний гель','MT-004',45.00),
('МедТрейд','Вологі серветки','MT-005',29.00),
('Health Supply','Медична маска','HS-001',5.00),
('Health Supply','Дитячі підгузки','HS-002',310.00),
('Health Supply','Дитячий термометр','HS-003',125.00),
('Health Supply','Вітамін C 500 мг','HS-004',78.00),
('МедСнаб','Вітамін C 500 мг','MS-006',76.00)

) AS v(supplier_name,product_name,code,price)
JOIN suppliers s ON s.name = v.supplier_name
JOIN products p ON p.name = v.product_name;

-- ============================================================
-- 17. BATCHES
-- ============================================================

INSERT INTO batches
(product_id, batch_number, supplier_id, manufacture_date, expiry_date, purchase_price)
SELECT
    p.product_id, v.batch_number, s.supplier_id,
    v.manufacture_date, v.expiry_date, v.purchase_price
FROM (VALUES
('Парацетамол 500 мг','PAR-2026-001','ФармаПостач','2026-01-15'::date,'2027-06-30'::date,32.00),
('Парацетамол 500 мг','PAR-2026-002','МедСнаб','2026-03-10'::date,'2028-01-15'::date,31.50),
('Ібупрофен 200 мг','IBU-2026-001','ФармаПостач','2026-02-01'::date,'2027-09-30'::date,40.00),
('Ібупрофен 400 мг','IBU-2026-002','ФармаПостач','2026-02-10'::date,'2027-11-30'::date,58.00),
('Амоксицилін 500 мг','AMX-2026-001','ФармаПостач','2026-01-20'::date,'2027-07-31'::date,92.00),
('Лоратадин 10 мг','LOR-2026-001','ФармаПостач','2026-02-15'::date,'2028-02-28'::date,45.00),
('Цетиризин 10 мг','CET-2026-001','Аптека-Партнер','2026-03-01'::date,'2028-03-31'::date,50.00),
('Аспірин 500 мг','ASP-2026-001','ФармаПостач','2026-01-05'::date,'2027-05-31'::date,33.00),
('Німесулід 100 мг','NIM-2026-001','ФармаПостач','2026-02-05'::date,'2027-10-31'::date,67.00),
('Амброксол 30 мг','AMB-2026-001','Аптека-Партнер','2026-01-25'::date,'2027-12-31'::date,48.00),
('Омепразол 20 мг','OME-2026-001','ФармаПостач','2026-02-20'::date,'2028-02-28'::date,59.00),
('Хлоргексидин 0,05%','CHL-2026-001','МедСнаб','2026-03-05'::date,'2028-03-31'::date,21.00),
('Валеріана таблетки','VAL-2026-001','Аптека-Партнер','2026-01-10'::date,'2028-01-31'::date,25.00),
('Бинт стерильний','BIN-2026-001','МедСнаб','2026-03-01'::date,'2030-03-01'::date,16.00),
('Термометр електронний','THERM-2026-001','МедСнаб','2026-01-01'::date,'2030-01-01'::date,145.00),
('Шприц 5 мл','SYR-2026-001','МедСнаб','2026-02-01'::date,'2031-02-01'::date,7.00),
('Крем для рук','CREAM-2026-001','МедТрейд','2026-02-01'::date,'2028-02-01'::date,68.00),
('Зволожувальний крем','CREAM-2026-002','МедТрейд','2026-02-15'::date,'2028-02-15'::date,105.00),
('Дитячий крем','CREAM-2026-003','МедТрейд','2026-01-20'::date,'2028-01-20'::date,52.00),
('Антисептичний гель','GEL-2026-001','МедТрейд','2026-03-01'::date,'2028-03-01'::date,45.00),
('Вологі серветки','WIPES-2026-001','МедТрейд','2026-02-01'::date,'2028-02-01'::date,29.00),
('Медична маска','MASK-2026-001','Health Supply','2026-01-15'::date,'2029-01-15'::date,5.00),
('Дитячі підгузки','DIAP-2026-001','Health Supply','2026-02-10'::date,'2028-02-10'::date,310.00),
('Дитячий термометр','CTH-2026-001','Health Supply','2026-01-10'::date,'2030-01-10'::date,125.00),
('Вітамін C 500 мг','VITC-2026-001','Health Supply','2026-02-01'::date,'2028-02-01'::date,78.00)
) AS v(product_name,batch_number,supplier_name,manufacture_date,expiry_date,purchase_price)
JOIN products p ON p.name = v.product_name
JOIN suppliers s ON s.name = v.supplier_name;

-- ============================================================
-- 18. INVENTORY
-- Початкові залишки. Центральний склад отримує великі запаси,
-- аптеки -- менші запаси.
-- ============================================================

INSERT INTO inventory
(location_id, batch_id, quantity, reserved_quantity, status, updated_at)
SELECT
    l.location_id,
    b.batch_id,
    CASE
        WHEN l.name = 'Центральний склад' THEN
            CASE p.sku
                WHEN 'MED-0001' THEN 500
                WHEN 'MED-0002' THEN 400
                WHEN 'MED-0003' THEN 300
                WHEN 'MED-0004' THEN 250
                WHEN 'MED-0005' THEN 350
                WHEN 'MED-0006' THEN 300
                WHEN 'MED-0007' THEN 250
                WHEN 'MED-0008' THEN 220
                WHEN 'MED-0009' THEN 280
                WHEN 'MED-0010' THEN 300
                WHEN 'MED-0011' THEN 250
                WHEN 'MED-0012' THEN 200
                WHEN 'MED-0013' THEN 400
                WHEN 'MED-0014' THEN 80
                WHEN 'MED-0015' THEN 600
                WHEN 'COS-0001' THEN 100
                WHEN 'COS-0002' THEN 100
                WHEN 'COS-0003' THEN 100
                WHEN 'HYG-0001' THEN 150
                WHEN 'HYG-0002' THEN 200
                WHEN 'HYG-0003' THEN 500
                WHEN 'CHD-0001' THEN 100
                WHEN 'CHD-0002' THEN 80
                WHEN 'VIT-0001' THEN 150
            END
        ELSE
            CASE p.sku
                WHEN 'MED-0001' THEN 50
                WHEN 'MED-0002' THEN 40
                WHEN 'MED-0003' THEN 30
                WHEN 'MED-0004' THEN 20
                WHEN 'MED-0005' THEN 35
                WHEN 'MED-0006' THEN 30
                WHEN 'MED-0007' THEN 25
                WHEN 'MED-0008' THEN 20
                WHEN 'MED-0009' THEN 25
                WHEN 'MED-0010' THEN 30
                WHEN 'MED-0011' THEN 25
                WHEN 'MED-0012' THEN 20
                WHEN 'MED-0013' THEN 40
                WHEN 'MED-0014' THEN 10
                WHEN 'MED-0015' THEN 50
                WHEN 'COS-0001' THEN 15
                WHEN 'COS-0002' THEN 15
                WHEN 'COS-0003' THEN 15
                WHEN 'HYG-0001' THEN 20
                WHEN 'HYG-0002' THEN 25
                WHEN 'HYG-0003' THEN 50
                WHEN 'CHD-0001' THEN 10
                WHEN 'CHD-0002' THEN 10
                WHEN 'VIT-0001' THEN 20
            END
    END,
    0,
    'AVAILABLE',
    CURRENT_TIMESTAMP
FROM locations l
CROSS JOIN batches b
JOIN products p ON p.product_id = b.product_id
WHERE l.location_type IN ('PHARMACY','WAREHOUSE');

-- ============================================================
-- 19. CUSTOMERS
-- ============================================================

INSERT INTO customers
(first_name, last_name, phone, email, date_of_birth, is_active)
VALUES
('Андрій','Коваленко','+380671000001','customer1@health.test','1992-05-12',TRUE),
('Марія','Шевченко','+380671000002','customer2@health.test','1988-09-24',TRUE),
('Олена','Бондар','+380671000003','customer3@health.test','1995-02-18',TRUE),
('Ірина','Мельник','+380671000004','customer4@health.test','1990-11-03',TRUE),
('Дмитро','Ткаченко','+380671000005','customer5@health.test','1985-07-21',TRUE),
('Наталія','Романенко','+380671000006','customer6@health.test','1998-01-30',TRUE);

-- ============================================================
-- 20. CUSTOMER ACCOUNTS
-- ============================================================

INSERT INTO customer_accounts
(customer_id, password_hash, is_active)
SELECT c.customer_id, crypt(v.password, gen_salt('bf', 12)), TRUE
FROM (VALUES
('customer1@health.test','Customer123!'),
('customer2@health.test','Customer123!'),
('customer3@health.test','Customer123!')
) AS v(email,password)
JOIN customers c ON c.email = v.email;

-- ============================================================
-- 21. LOYALTY ACCOUNTS
-- ============================================================

INSERT INTO loyalty_accounts
(customer_id, card_number, bonus_balance, discount_percent, status)
SELECT c.customer_id, v.card_number, v.bonus_balance, v.discount_percent, 'ACTIVE'
FROM (VALUES
('customer1@health.test','100001',250.00,5.00),
('customer2@health.test','100002',120.00,3.00),
('customer3@health.test','100003',500.00,7.00)
) AS v(email,card_number,bonus_balance,discount_percent)
JOIN customers c ON c.email = v.email;

-- ============================================================
-- 22. PRESCRIPTIONS
-- ============================================================

INSERT INTO prescriptions
(prescription_number, customer_id, issued_date, expiry_date, status, external_system_id)
SELECT
    v.prescription_number,
    c.customer_id,
    v.issued_date,
    v.expiry_date,
    'ACTIVE',
    v.external_system_id
FROM (VALUES
('RX-0001','customer1@health.test','2026-09-20'::date,'2026-10-20'::date,'EXT-RX-0001'),
('RX-0002','customer2@health.test','2026-09-22'::date,'2026-10-22'::date,'EXT-RX-0002'),
('RX-0003','customer3@health.test','2026-09-25'::date,'2026-10-25'::date,'EXT-RX-0003')
) AS v(prescription_number,email,issued_date,expiry_date,external_system_id)
JOIN customers c ON c.email = v.email;

-- ============================================================
-- 23. PRESCRIPTION ITEMS
-- ============================================================

INSERT INTO prescription_items
(prescription_id, medicine_id, prescribed_quantity, dispensed_quantity)
SELECT pr.prescription_id, m.medicine_id, v.quantity, 0
FROM (VALUES
('RX-0001','Амоксицилін 500 мг',2.000),
('RX-0002','Амоксицилін 500 мг',1.000),
('RX-0002','Німесулід 100 мг',1.000),
('RX-0003','Амоксицилін 500 мг',1.000)
) AS v(prescription_number,product_name,quantity)
JOIN prescriptions pr ON pr.prescription_number = v.prescription_number
JOIN products p ON p.name = v.product_name
JOIN medicines m ON m.product_id = p.product_id;

COMMIT;

-- ============================================================
-- КІНЕЦЬ 02_seed_data.sql
--
-- Операційні таблиці навмисно залишаються порожніми:
-- purchase_orders
-- purchase_order_items
-- stock_movements
-- transfers
-- transfer_items
-- write_offs
-- write_off_items
-- inventory_checks
-- inventory_check_items
-- sales
-- sale_items
-- payments
-- loyalty_transactions
-- reservations
-- reservation_items
-- audit_log
-- ============================================================
