-- ============================================================
-- DATABASE: apteka_db
-- Pharmacy Network Information System
-- PostgreSQL
-- ============================================================


-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

CREATE TYPE location_type_enum AS ENUM (
    'PHARMACY',
    'WAREHOUSE',
    'OFFICE'
);

CREATE TYPE employment_status_enum AS ENUM (
    'ACTIVE',
    'TERMINATED',
    'TRANSFERRED'
);

CREATE TYPE purchase_order_status_enum AS ENUM (
    'DRAFT',
    'ORDERED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED'
);

CREATE TYPE inventory_status_enum AS ENUM (
    'AVAILABLE',
    'LOW_STOCK',
    'OUT_OF_STOCK',
    'BLOCKED'
);

CREATE TYPE movement_type_enum AS ENUM (
    'PURCHASE',
    'SALE',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'WRITE_OFF',
    'RETURN',
    'ADJUSTMENT'
);

CREATE TYPE transfer_status_enum AS ENUM (
    'CREATED',
    'IN_TRANSIT',
    'RECEIVED',
    'CANCELLED'
);

CREATE TYPE write_off_reason_enum AS ENUM (
    'EXPIRED',
    'DAMAGED',
    'LOST',
    'OTHER'
);

CREATE TYPE write_off_status_enum AS ENUM (
    'CREATED',
    'APPROVED',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE inventory_check_status_enum AS ENUM (
    'CREATED',
    'IN_PROGRESS',
    'COMPLETED',
    'APPROVED',
    'CANCELLED'
);

CREATE TYPE sale_status_enum AS ENUM (
    'CREATED',
    'PAID',
    'CANCELLED',
    'RETURNED'
);

CREATE TYPE payment_method_enum AS ENUM (
    'CASH',
    'CARD',
    'ONLINE'
);

CREATE TYPE payment_status_enum AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED',
    'REFUNDED'
);

CREATE TYPE prescription_status_enum AS ENUM (
    'ACTIVE',
    'USED',
    'EXPIRED',
    'CANCELLED'
);

CREATE TYPE loyalty_status_enum AS ENUM (
    'ACTIVE',
    'BLOCKED',
    'CLOSED'
);

CREATE TYPE loyalty_transaction_type_enum AS ENUM (
    'EARN',
    'SPEND',
    'ADJUSTMENT'
);

CREATE TYPE reservation_status_enum AS ENUM (
    'CREATED',
    'CONFIRMED',
    'READY',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED'
);


-- ============================================================
-- 2. ORGANIZATION AND ACCESS
-- ============================================================

CREATE TABLE locations (
    location_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location_type location_type_enum NOT NULL,
    address VARCHAR(255),
    phone VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE
);


CREATE TABLE departments (
    department_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location_id INTEGER,
    department_type VARCHAR(50),
    parent_department_id INTEGER,
    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT fk_departments_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_departments_parent
        FOREIGN KEY (parent_department_id)
        REFERENCES departments(department_id)
);


CREATE TABLE positions (
    position_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);


CREATE TABLE employees (
    employee_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    phone VARCHAR(30),
    email VARCHAR(100),
    position_id INTEGER,
    department_id INTEGER,
    location_id INTEGER,
    hire_date DATE NOT NULL,
    termination_date DATE,
    employment_status employment_status_enum NOT NULL DEFAULT 'ACTIVE',
    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT fk_employees_position
        FOREIGN KEY (position_id)
        REFERENCES positions(position_id),

    CONSTRAINT fk_employees_department
        FOREIGN KEY (department_id)
        REFERENCES departments(department_id),

    CONSTRAINT fk_employees_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id)
);


CREATE TABLE user_accounts (
    account_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_accounts_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id)
);


CREATE TABLE roles (
    role_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);


CREATE TABLE account_roles (
    account_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,

    PRIMARY KEY (account_id, role_id),

    CONSTRAINT fk_account_roles_account
        FOREIGN KEY (account_id)
        REFERENCES user_accounts(account_id),

    CONSTRAINT fk_account_roles_role
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
);


-- ============================================================
-- 3. PRODUCT CATALOG
-- ============================================================

CREATE TABLE product_categories (
    category_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id INTEGER,

    CONSTRAINT fk_product_categories_parent
        FOREIGN KEY (parent_category_id)
        REFERENCES product_categories(category_id)
);


CREATE TABLE therapeutic_categories (
    therapeutic_category_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id INTEGER,

    CONSTRAINT fk_therapeutic_categories_parent
        FOREIGN KEY (parent_category_id)
        REFERENCES therapeutic_categories(therapeutic_category_id)
);


CREATE TABLE manufacturers (
    manufacturer_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    country VARCHAR(100),
    address VARCHAR(255),
    phone VARCHAR(30),
    email VARCHAR(100)
);


CREATE TABLE products (
    product_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category_id INTEGER,
    manufacturer_id INTEGER,
    barcode VARCHAR(50) UNIQUE,
    sku VARCHAR(50) UNIQUE,
    description TEXT,
    unit VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id)
        REFERENCES product_categories(category_id),

    CONSTRAINT fk_products_manufacturer
        FOREIGN KEY (manufacturer_id)
        REFERENCES manufacturers(manufacturer_id)
);


CREATE TABLE medicines (
    medicine_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER NOT NULL UNIQUE,
    active_ingredient VARCHAR(255),
    dosage VARCHAR(100),
    dosage_form VARCHAR(100),
    prescription_required BOOLEAN NOT NULL DEFAULT FALSE,
    registration_number VARCHAR(100),

    CONSTRAINT fk_medicines_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id)
);


CREATE TABLE medicine_therapeutic_categories (
    medicine_id INTEGER NOT NULL,
    therapeutic_category_id INTEGER NOT NULL,

    PRIMARY KEY (medicine_id, therapeutic_category_id),

    CONSTRAINT fk_medicine_therapeutic_medicine
        FOREIGN KEY (medicine_id)
        REFERENCES medicines(medicine_id),

    CONSTRAINT fk_medicine_therapeutic_category
        FOREIGN KEY (therapeutic_category_id)
        REFERENCES therapeutic_categories(therapeutic_category_id)
);


CREATE TABLE product_prices (
    price_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT fk_product_prices_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_product_prices_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT chk_product_prices_price
        CHECK (price >= 0)
);


-- ============================================================
-- 4. PROCUREMENT
-- ============================================================

CREATE TABLE suppliers (
    supplier_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    edrpou VARCHAR(20) UNIQUE,
    address VARCHAR(255),
    phone VARCHAR(30),
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE
);


CREATE TABLE supplier_products (
    supplier_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    supplier_product_code VARCHAR(50),
    purchase_price NUMERIC(12,2),

    PRIMARY KEY (supplier_id, product_id),

    CONSTRAINT fk_supplier_products_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(supplier_id),

    CONSTRAINT fk_supplier_products_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT chk_supplier_products_price
        CHECK (purchase_price IS NULL OR purchase_price >= 0)
);


CREATE TABLE purchase_orders (
    purchase_order_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    destination_location_id INTEGER NOT NULL,
    created_by_employee_id INTEGER NOT NULL,
    order_date DATE NOT NULL,
    expected_date DATE,
    status purchase_order_status_enum NOT NULL,
    total_amount NUMERIC(12,2),

    CONSTRAINT fk_purchase_orders_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(supplier_id),

    CONSTRAINT fk_purchase_orders_location
        FOREIGN KEY (destination_location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_purchase_orders_employee
        FOREIGN KEY (created_by_employee_id)
        REFERENCES employees(employee_id),

    CONSTRAINT chk_purchase_orders_total
        CHECK (total_amount IS NULL OR total_amount >= 0)
);


CREATE TABLE purchase_order_items (
    purchase_order_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    ordered_quantity NUMERIC(12,3) NOT NULL,
    received_quantity NUMERIC(12,3) DEFAULT 0,
    unit_price NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_purchase_order_items_order
        FOREIGN KEY (purchase_order_id)
        REFERENCES purchase_orders(purchase_order_id),

    CONSTRAINT fk_purchase_order_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT chk_purchase_order_items_ordered_quantity
        CHECK (ordered_quantity > 0),

    CONSTRAINT chk_purchase_order_items_received_quantity
        CHECK (received_quantity >= 0),

    CONSTRAINT chk_purchase_order_items_unit_price
        CHECK (unit_price >= 0)
);


CREATE TABLE batches (
    batch_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    supplier_id INTEGER,
    manufacture_date DATE,
    expiry_date DATE,
    purchase_price NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_batches_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_batches_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(supplier_id),

    CONSTRAINT uq_batches_product_number
        UNIQUE (product_id, batch_number),

    CONSTRAINT chk_batches_purchase_price
        CHECK (purchase_price >= 0)
);


-- ============================================================
-- 5. INVENTORY / WAREHOUSE
-- ============================================================

CREATE TABLE inventory (
    inventory_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    reserved_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    status inventory_status_enum NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inventory_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_inventory_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(batch_id),

    CONSTRAINT uq_inventory_location_batch
        UNIQUE (location_id, batch_id),

    CONSTRAINT chk_inventory_quantity
        CHECK (quantity >= 0),

    CONSTRAINT chk_inventory_reserved_quantity
        CHECK (reserved_quantity >= 0)
);


CREATE TABLE transfers (
    transfer_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_location_id INTEGER NOT NULL,
    to_location_id INTEGER NOT NULL,
    created_by_employee_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status transfer_status_enum NOT NULL,
    confirmed_by_employee_id INTEGER,
    confirmed_at TIMESTAMP,

    CONSTRAINT fk_transfers_from_location
        FOREIGN KEY (from_location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_transfers_to_location
        FOREIGN KEY (to_location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_transfers_created_by
        FOREIGN KEY (created_by_employee_id)
        REFERENCES employees(employee_id),

    CONSTRAINT fk_transfers_confirmed_by
        FOREIGN KEY (confirmed_by_employee_id)
        REFERENCES employees(employee_id),

    CONSTRAINT chk_transfers_different_locations
        CHECK (from_location_id <> to_location_id)
);


CREATE TABLE transfer_items (
    transfer_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,

    CONSTRAINT fk_transfer_items_transfer
        FOREIGN KEY (transfer_id)
        REFERENCES transfers(transfer_id),

    CONSTRAINT fk_transfer_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_transfer_items_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(batch_id),

    CONSTRAINT chk_transfer_items_quantity
        CHECK (quantity > 0)
);


CREATE TABLE write_offs (
    write_off_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    reason write_off_reason_enum NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status write_off_status_enum NOT NULL,

    CONSTRAINT fk_write_offs_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_write_offs_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id)
);


CREATE TABLE write_off_items (
    write_off_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    write_off_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,

    CONSTRAINT fk_write_off_items_write_off
        FOREIGN KEY (write_off_id)
        REFERENCES write_offs(write_off_id),

    CONSTRAINT fk_write_off_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_write_off_items_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(batch_id),

    CONSTRAINT chk_write_off_items_quantity
        CHECK (quantity > 0)
);


CREATE TABLE inventory_checks (
    inventory_check_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id INTEGER NOT NULL,
    created_by_employee_id INTEGER NOT NULL,
    check_date DATE NOT NULL,
    status inventory_check_status_enum NOT NULL,
    approved_by_employee_id INTEGER,

    CONSTRAINT fk_inventory_checks_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_inventory_checks_created_by
        FOREIGN KEY (created_by_employee_id)
        REFERENCES employees(employee_id),

    CONSTRAINT fk_inventory_checks_approved_by
        FOREIGN KEY (approved_by_employee_id)
        REFERENCES employees(employee_id)
);


CREATE TABLE inventory_check_items (
    inventory_check_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inventory_check_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    system_quantity NUMERIC(12,3) NOT NULL,
    actual_quantity NUMERIC(12,3) NOT NULL,
    difference NUMERIC(12,3) NOT NULL,

    CONSTRAINT fk_inventory_check_items_check
        FOREIGN KEY (inventory_check_id)
        REFERENCES inventory_checks(inventory_check_id),

    CONSTRAINT fk_inventory_check_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_inventory_check_items_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(batch_id),

    CONSTRAINT chk_inventory_check_system_quantity
        CHECK (system_quantity >= 0),

    CONSTRAINT chk_inventory_check_actual_quantity
        CHECK (actual_quantity >= 0)
);


CREATE TABLE stock_movements (
    movement_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_type movement_type_enum NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    employee_id INTEGER,
    transfer_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    comment TEXT,

    CONSTRAINT fk_stock_movements_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_stock_movements_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(batch_id),

    CONSTRAINT fk_stock_movements_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_stock_movements_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id),

    CONSTRAINT fk_stock_movements_transfer
        FOREIGN KEY (transfer_id)
        REFERENCES transfers(transfer_id),

    CONSTRAINT chk_stock_movements_quantity
        CHECK (quantity > 0)
);


-- ============================================================
-- 6. CUSTOMERS / LOYALTY
-- ============================================================

CREATE TABLE customers (
    customer_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(100),
    date_of_birth DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);


CREATE TABLE customer_accounts (
    account_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id INTEGER NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_customer_accounts_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id)
);


CREATE TABLE loyalty_accounts (
    loyalty_account_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id INTEGER NOT NULL UNIQUE,
    card_number VARCHAR(50) NOT NULL UNIQUE,
    bonus_balance NUMERIC(12,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    status loyalty_status_enum NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_loyalty_accounts_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id),

    CONSTRAINT chk_loyalty_bonus_balance
        CHECK (bonus_balance >= 0),

    CONSTRAINT chk_loyalty_discount_percent
        CHECK (discount_percent >= 0 AND discount_percent <= 100)
);


-- ============================================================
-- 7. SALES
-- ============================================================

CREATE TABLE sales (
    sale_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    customer_id INTEGER,
    sale_datetime TIMESTAMP NOT NULL,
    subtotal NUMERIC(12,2),
    discount_amount NUMERIC(12,2) DEFAULT 0,
    bonus_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2),
    status sale_status_enum NOT NULL,

    CONSTRAINT fk_sales_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    CONSTRAINT fk_sales_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id),

    CONSTRAINT fk_sales_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id),

    CONSTRAINT chk_sales_subtotal
        CHECK (subtotal IS NULL OR subtotal >= 0),

    CONSTRAINT chk_sales_discount
        CHECK (discount_amount >= 0),

    CONSTRAINT chk_sales_bonus
        CHECK (bonus_amount >= 0),

    CONSTRAINT chk_sales_total
        CHECK (total_amount IS NULL OR total_amount >= 0)
);


CREATE TABLE sale_items (
    sale_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_sale_items_sale
        FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id),

    CONSTRAINT fk_sale_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_sale_items_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(batch_id),

    CONSTRAINT chk_sale_items_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_sale_items_unit_price
        CHECK (unit_price >= 0),

    CONSTRAINT chk_sale_items_discount
        CHECK (discount_amount >= 0),

    CONSTRAINT chk_sale_items_total
        CHECK (total_amount >= 0)
);


CREATE TABLE payments (
    payment_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id INTEGER NOT NULL,
    payment_method payment_method_enum NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_status payment_status_enum NOT NULL,
    transaction_reference VARCHAR(100),
    paid_at TIMESTAMP,

    CONSTRAINT fk_payments_sale
        FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id),

    CONSTRAINT chk_payments_amount
        CHECK (amount > 0)
);


-- ============================================================
-- 8. PRESCRIPTIONS
-- ============================================================

CREATE TABLE prescriptions (
    prescription_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prescription_number VARCHAR(100) NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    issued_date DATE NOT NULL,
    expiry_date DATE,
    status prescription_status_enum NOT NULL,
    external_system_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_prescriptions_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id)
);


CREATE TABLE prescription_items (
    prescription_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prescription_id INTEGER NOT NULL,
    medicine_id INTEGER NOT NULL,
    prescribed_quantity NUMERIC(12,3) NOT NULL,
    dispensed_quantity NUMERIC(12,3) DEFAULT 0,

    CONSTRAINT fk_prescription_items_prescription
        FOREIGN KEY (prescription_id)
        REFERENCES prescriptions(prescription_id),

    CONSTRAINT fk_prescription_items_medicine
        FOREIGN KEY (medicine_id)
        REFERENCES medicines(medicine_id),

    CONSTRAINT chk_prescription_prescribed_quantity
        CHECK (prescribed_quantity > 0),

    CONSTRAINT chk_prescription_dispensed_quantity
        CHECK (dispensed_quantity >= 0)
);


-- ============================================================
-- 9. LOYALTY TRANSACTIONS
-- ============================================================

CREATE TABLE loyalty_transactions (
    loyalty_transaction_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loyalty_account_id INTEGER NOT NULL,
    sale_id INTEGER,
    transaction_type loyalty_transaction_type_enum NOT NULL,
    points NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_loyalty_transactions_account
        FOREIGN KEY (loyalty_account_id)
        REFERENCES loyalty_accounts(loyalty_account_id),

    CONSTRAINT fk_loyalty_transactions_sale
        FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id)
);


-- ============================================================
-- 10. RESERVATIONS
-- ============================================================

CREATE TABLE reservations (
    reservation_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    reservation_date TIMESTAMP NOT NULL,
    expiry_date TIMESTAMP,
    status reservation_status_enum NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reservations_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id),

    CONSTRAINT fk_reservations_location
        FOREIGN KEY (location_id)
        REFERENCES locations(location_id)
);


CREATE TABLE reservation_items (
    reservation_item_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reservation_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,

    CONSTRAINT fk_reservation_items_reservation
        FOREIGN KEY (reservation_id)
        REFERENCES reservations(reservation_id),

    CONSTRAINT fk_reservation_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT chk_reservation_items_quantity
        CHECK (quantity > 0)
);


-- ============================================================
-- 11. AUDIT
-- ============================================================

CREATE TABLE audit_log (
    audit_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),

    CONSTRAINT fk_audit_log_account
        FOREIGN KEY (account_id)
        REFERENCES user_accounts(account_id)
);


-- ============================================================
-- END OF DATABASE STRUCTURE
-- ============================================================