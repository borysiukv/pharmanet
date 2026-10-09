
import hashlib
import json
import re

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import FastAPI, Depends, Query, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db


# =====================================================
# FASTAPI APPLICATION
# =====================================================

app = FastAPI(
    title="Pharmacy Network API",
    description="Інформаційна система для мережі аптек",
    version="1.1.0"
)


# =====================================================
# 1. HOME
# =====================================================

@app.get("/", tags=["General"])
def home():
    return {
        "message": "Welcome to Pharmacy Network API",
        "status": "running"
    }


# =====================================================
# 2. HEALTH CHECK
# =====================================================

@app.get("/health", tags=["General"])
def health():
    return {
        "status": "ok",
        "service": "pharmacy-backend"
    }


# =====================================================
# 3. DATABASE CHECK
# =====================================================

@app.get("/db-check", tags=["General"])
def database_check(db: Session = Depends(get_db)):
    count = db.execute(
        text("SELECT COUNT(*) FROM locations")
    ).scalar_one()

    return {
        "database": "connected",
        "locations_count": count
    }


# =====================================================
# 4. PRODUCTS API
# =====================================================

@app.get("/products", tags=["Products"])
def get_products(
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    query = """
        SELECT
            p.product_id,
            p.name,
            p.barcode,
            p.sku,
            p.unit,
            p.description,
            pc.name AS category,
            m.name AS manufacturer,
            p.is_active
        FROM products p
        LEFT JOIN product_categories pc
            ON pc.category_id = p.category_id
        LEFT JOIN manufacturers m
            ON m.manufacturer_id = p.manufacturer_id
        WHERE 1 = 1
    """

    params = {
        "limit": limit,
        "offset": offset
    }

    if search and search.strip():
        query += " AND p.name ILIKE :search"
        params["search"] = f"%{search.strip()}%"

    query += """
        ORDER BY p.product_id
        LIMIT :limit OFFSET :offset
    """

    rows = db.execute(
        text(query),
        params
    ).mappings().all()

    return {
        "count": len(rows),
        "limit": limit,
        "offset": offset,
        "products": [dict(row) for row in rows]
    }


# =====================================================
# 5. INVENTORY API
# =====================================================

@app.get("/inventory", tags=["Inventory"])
def get_inventory(
    location_id: int | None = Query(default=None, ge=1),
    product_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    query = """
        SELECT
            i.inventory_id,
            l.location_id,
            l.name AS location_name,
            l.location_type,
            p.product_id,
            p.name AS product_name,
            p.barcode,
            b.batch_id,
            b.batch_number,
            b.expiry_date,
            i.quantity,
            i.reserved_quantity,
            GREATEST(
                i.quantity - i.reserved_quantity,
                0
            ) AS available_quantity,
            i.status,
            i.updated_at
        FROM inventory i
        JOIN locations l
            ON l.location_id = i.location_id
        JOIN batches b
            ON b.batch_id = i.batch_id
        JOIN products p
            ON p.product_id = b.product_id
        WHERE 1 = 1
    """

    params = {
        "limit": limit,
        "offset": offset
    }

    if location_id is not None:
        query += " AND i.location_id = :location_id"
        params["location_id"] = location_id

    if product_id is not None:
        query += " AND p.product_id = :product_id"
        params["product_id"] = product_id

    query += """
        ORDER BY
            l.location_id,
            p.name,
            b.expiry_date NULLS LAST,
            i.inventory_id
        LIMIT :limit OFFSET :offset
    """

    rows = db.execute(
        text(query),
        params
    ).mappings().all()

    return {
        "count": len(rows),
        "limit": limit,
        "offset": offset,
        "inventory": [dict(row) for row in rows]
    }


# =====================================================
# 6. LOCATIONS API
# =====================================================

@app.get("/locations", tags=["Locations"])
def get_locations(
    location_type: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    query = """
        SELECT
            location_id,
            name,
            location_type,
            address,
            phone,
            is_active
        FROM locations
        WHERE is_active = TRUE
    """

    params = {}

    if location_type:
        location_type = location_type.upper()

        if location_type not in (
            "PHARMACY", "WAREHOUSE", "OFFICE"
        ):
            raise HTTPException(
                status_code=422,
                detail="Некоректний тип локації"
            )

        query += """
            AND location_type =
                CAST(:location_type AS location_type_enum)
        """
        params["location_type"] = location_type

    query += " ORDER BY location_id"

    rows = db.execute(
        text(query),
        params
    ).mappings().all()

    return {
        "count": len(rows),
        "locations": [dict(row) for row in rows]
    }


# =====================================================
# 7. PRODUCT DETAILS API
# =====================================================

@app.get("/products/{product_id}", tags=["Products"])
def get_product_details(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = db.execute(
        text("""
            SELECT
                p.product_id,
                p.name,
                p.barcode,
                p.sku,
                p.description,
                p.unit,
                p.is_active,
                pc.name AS category,
                mf.name AS manufacturer,
                med.active_ingredient,
                med.dosage,
                med.dosage_form,
                med.prescription_required
            FROM products p
            LEFT JOIN product_categories pc
                ON pc.category_id = p.category_id
            LEFT JOIN manufacturers mf
                ON mf.manufacturer_id = p.manufacturer_id
            LEFT JOIN medicines med
                ON med.product_id = p.product_id
            WHERE p.product_id = :product_id
        """),
        {"product_id": product_id}
    ).mappings().first()

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Препарат не знайдено"
        )

    prices = db.execute(
        text("""
            SELECT DISTINCT ON (l.location_id)
                l.location_id,
                l.name AS location_name,
                pp.price,
                pp.valid_from,
                pp.valid_to
            FROM product_prices pp
            JOIN locations l
                ON l.location_id = pp.location_id
            WHERE pp.product_id = :product_id
              AND pp.is_active = TRUE
              AND pp.valid_from <= CURRENT_DATE
              AND (
                  pp.valid_to IS NULL
                  OR pp.valid_to >= CURRENT_DATE
              )
            ORDER BY
                l.location_id,
                pp.valid_from DESC,
                pp.price_id DESC
        """),
        {"product_id": product_id}
    ).mappings().all()

    stock = db.execute(
        text("""
            SELECT
                l.location_id,
                l.name AS location_name,
                SUM(i.quantity) AS total_quantity,
                SUM(i.reserved_quantity)
                    AS reserved_quantity,
                SUM(
                    CASE
                        WHEN i.status = 'AVAILABLE'
                         AND (
                            b.expiry_date IS NULL
                            OR b.expiry_date >= CURRENT_DATE
                         )
                        THEN GREATEST(
                            i.quantity - i.reserved_quantity,
                            0
                        )
                        ELSE 0
                    END
                ) AS available_quantity,
                MIN(
                    CASE
                        WHEN i.status = 'AVAILABLE'
                         AND b.expiry_date >= CURRENT_DATE
                        THEN b.expiry_date
                    END
                ) AS nearest_expiry_date
            FROM inventory i
            JOIN batches b
                ON b.batch_id = i.batch_id
            JOIN locations l
                ON l.location_id = i.location_id
            WHERE b.product_id = :product_id
            GROUP BY l.location_id, l.name
            ORDER BY l.location_id
        """),
        {"product_id": product_id}
    ).mappings().all()

    return {
        "product": dict(product),
        "prices": [dict(row) for row in prices],
        "stock_by_location": [dict(row) for row in stock]
    }


# =====================================================
# 8. SALES HISTORY API
# =====================================================

@app.get("/sales", tags=["Sales"])
def get_sales(
    request: Request,
    location_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    # Authenticated employee's branch. Only SYSTEM_ADMIN can view others.
    roles = set(request.state.roles)
    if "SYSTEM_ADMIN" not in roles:
        user_location = db.execute(
            text("""
                SELECT e.location_id, l.location_type, l.is_active
                FROM employees e
                JOIN locations l ON l.location_id = e.location_id
                WHERE e.employee_id = :employee_id
            """),
            {"employee_id": request.state.employee_id},
        ).mappings().first()

        if (
            user_location is None
            or user_location["location_type"] != "PHARMACY"
            or user_location["is_active"] is not True
        ):
            raise HTTPException(status_code=403, detail="Працівник не прив'язаний до активної аптеки")
        if location_id is not None and location_id != user_location["location_id"]:
            raise HTTPException(status_code=403, detail="Не можна переглядати продажі іншої аптеки")
        location_id = user_location["location_id"]

    query = """
        SELECT
            s.sale_id,
            s.sale_datetime,
            s.location_id,
            l.name AS location_name,
            s.employee_id,
            CONCAT(
                e.last_name, ' ', e.first_name
            ) AS employee_name,
            s.customer_id,
            s.subtotal,
            s.discount_amount,
            s.bonus_amount,
            s.total_amount,
            s.status,
            COUNT(si.sale_item_id) AS item_count
        FROM sales s
        JOIN locations l
            ON l.location_id = s.location_id
        JOIN employees e
            ON e.employee_id = s.employee_id
        LEFT JOIN sale_items si
            ON si.sale_id = s.sale_id
        WHERE 1 = 1
    """

    params = {
        "limit": limit,
        "offset": offset
    }

    if location_id is not None:
        query += " AND s.location_id = :location_id"
        params["location_id"] = location_id

    query += """
        GROUP BY
            s.sale_id,
            l.name,
            e.last_name,
            e.first_name
        ORDER BY
            s.sale_datetime DESC,
            s.sale_id DESC
        LIMIT :limit OFFSET :offset
    """

    rows = db.execute(
        text(query),
        params
    ).mappings().all()

    return {
        "count": len(rows),
        "limit": limit,
        "offset": offset,
        "sales": [dict(row) for row in rows]
    }


# =====================================================
# 9. MULTI-PRODUCT SALES API
# LOCAL DEMO ONLY
# =====================================================

class SaleItemInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


class CreateSaleRequest(BaseModel):
    # Required for office-based administrators; ignored for branch employees.
    location_id: int | None = Field(default=None, gt=0)
    request_key: UUID | None = None

    # New basket format
    items: list[SaleItemInput] | None = None

    # Old single-product format
    product_id: int | None = Field(default=None, gt=0)
    quantity: int | None = Field(default=None, gt=0, le=100)

    @model_validator(mode="after")
    def validate_request(self):
        if self.items is not None:
            if self.product_id is not None or self.quantity is not None:
                raise ValueError(
                    "Використовуй items або product_id/quantity"
                )

            if not 1 <= len(self.items) <= 50:
                raise ValueError(
                    "Кошик повинен містити від 1 до 50 позицій"
                )

        elif self.product_id is None or self.quantity is None:
            raise ValueError(
                "Необхідно передати товари"
            )

        return self

    def normalized_items(self):
        if self.items is not None:
            source = self.items
        else:
            source = [
                SaleItemInput(
                    product_id=self.product_id,
                    quantity=self.quantity
                )
            ]

        combined = {}

        for item in source:
            combined[item.product_id] = (
                combined.get(item.product_id, 0)
                + item.quantity
            )

        if any(qty > 100 for qty in combined.values()):
            raise HTTPException(
                status_code=422,
                detail="Максимум 100 одиниць одного товару"
            )

        return [
            {
                "product_id": pid,
                "quantity": qty
            }
            for pid, qty in sorted(combined.items())
        ]


# =====================================================
# 10. CREATE SALE
# =====================================================

@app.post("/sales", tags=["Sales"], status_code=201)
def create_sale(
    request: CreateSaleRequest,
    http_request: Request,
    db: Session = Depends(get_db)
):
    # Identity comes from the validated session, never from the browser.
    employee_id = http_request.state.employee_id
    roles = set(http_request.state.roles)

    employee_location = db.execute(
        text("""
            SELECT e.location_id, l.location_type, l.is_active
            FROM employees e
            JOIN locations l ON l.location_id = e.location_id
            WHERE e.employee_id = :employee_id
        """),
        {"employee_id": employee_id},
    ).mappings().first()

    if "SYSTEM_ADMIN" in roles:
        if request.location_id is None:
            raise HTTPException(
                status_code=422,
                detail="Адміністратор повинен вибрати аптеку для продажу",
            )
        location_id = request.location_id
    else:
        if (
            employee_location is None
            or employee_location["location_type"] != "PHARMACY"
            or employee_location["is_active"] is not True
        ):
            raise HTTPException(
                status_code=403,
                detail="Працівник не прив'язаний до активної аптеки",
            )
        location_id = employee_location["location_id"]
        if request.location_id is not None and request.location_id != location_id:
            raise HTTPException(
                status_code=403,
                detail="Не можна виконувати продаж в іншій аптеці",
            )

    target_location = db.execute(
        text("""
            SELECT location_id
            FROM locations
            WHERE location_id = :location_id
              AND is_active = TRUE
              AND location_type = 'PHARMACY'
        """),
        {"location_id": location_id},
    ).first()

    if target_location is None:
        raise HTTPException(
            status_code=422,
            detail="Вибрана локація не є активною аптекою",
        )

    items = request.normalized_items()

    request_key = str(
        request.request_key or uuid4()
    )

    payload = {
        "location_id": location_id,
        "employee_id": employee_id,
        "items": items
    }

    payload_json = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":")
    )

    request_hash = hashlib.sha256(
        payload_json.encode("utf-8")
    ).hexdigest()

    try:
        # =================================================
        # 10.1. IDEMPOTENCY
        # =================================================

        db.execute(
            text("""
                INSERT INTO sale_requests (
                    request_key,
                    request_hash
                )
                VALUES (
                    CAST(:request_key AS UUID),
                    :request_hash
                )
                ON CONFLICT (request_key) DO NOTHING
            """),
            {
                "request_key": request_key,
                "request_hash": request_hash
            }
        )

        existing = db.execute(
            text("""
                SELECT
                    request_hash,
                    sale_id
                FROM sale_requests
                WHERE request_key =
                    CAST(:request_key AS UUID)
                FOR UPDATE
            """),
            {"request_key": request_key}
        ).mappings().one()

        if existing["request_hash"] != request_hash:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Цей request_key вже використовується "
                    "для іншого кошика"
                )
            )

        if existing["sale_id"] is not None:
            previous = db.execute(
                text("""
                    SELECT sale_id, total_amount, status
                    FROM sales
                    WHERE sale_id = :sale_id
                """),
                {"sale_id": existing["sale_id"]}
            ).mappings().one()

            db.commit()

            return {
                "message": "Продаж уже було створено",
                "sale_id": previous["sale_id"],
                "total_amount": float(
                    previous["total_amount"]
                ),
                "status": previous["status"],
                "request_key": request_key,
                "duplicate": True
            }

        # =================================================
        # 10.2. LOAD PRODUCT, PRICES AND STOCK
        # =================================================

        prepared = []
        subtotal = Decimal("0.00")

        today = db.execute(
            text("SELECT CURRENT_DATE")
        ).scalar_one()

        for item in items:
            product_id = item["product_id"]
            requested_qty = Decimal(item["quantity"])

            # ---------------------------------------------
            # Product validation
            # ---------------------------------------------

            product = db.execute(
                text("""
                    SELECT
                        p.product_id,
                        p.name,
                        p.is_active,
                        COALESCE(
                            med.prescription_required,
                            FALSE
                        ) AS prescription_required
                    FROM products p
                    LEFT JOIN medicines med
                        ON med.product_id = p.product_id
                    WHERE p.product_id = :product_id
                """),
                {"product_id": product_id}
            ).mappings().first()

            if product is None or not product["is_active"]:
                raise HTTPException(
                    status_code=404,
                    detail=f"Товар {product_id} не знайдено"
                )

            if product["prescription_required"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Препарат {product['name']} "
                        "потребує перевірки рецепта"
                    )
                )

            # ---------------------------------------------
            # Current price
            # ---------------------------------------------

            price_row = db.execute(
                text("""
                    SELECT price
                    FROM product_prices
                    WHERE product_id = :product_id
                      AND location_id = :location_id
                      AND is_active = TRUE
                      AND valid_from <= CURRENT_DATE
                      AND (
                          valid_to IS NULL
                          OR valid_to >= CURRENT_DATE
                      )
                    ORDER BY
                        valid_from DESC,
                        price_id DESC
                    LIMIT 1
                """),
                {
                    "product_id": product_id,
                    "location_id": location_id
                }
            ).mappings().first()

            if price_row is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Не знайдено чинну ціну "
                        f"для {product['name']}"
                    )
                )

            unit_price = Decimal(
                str(price_row["price"])
            )

            if unit_price <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Некоректна ціна товару"
                )

            # ---------------------------------------------
            # Lock stock in stable order
            # ---------------------------------------------

            batches = db.execute(
                text("""
                    SELECT
                        i.inventory_id,
                        i.batch_id,
                        i.quantity,
                        i.reserved_quantity,
                        i.status,
                        b.batch_number,
                        b.expiry_date
                    FROM inventory i
                    JOIN batches b
                        ON b.batch_id = i.batch_id
                    WHERE i.location_id = :location_id
                      AND b.product_id = :product_id
                    ORDER BY i.inventory_id
                    FOR UPDATE OF i
                """),
                {
                    "location_id": location_id,
                    "product_id": product_id
                }
            ).mappings().all()

            # ---------------------------------------------
            # FEFO allocation
            # ---------------------------------------------

            eligible = [
                batch
                for batch in batches
                if batch["status"] == "AVAILABLE"
                and (
                    batch["expiry_date"] is None
                    or batch["expiry_date"] >= today
                )
            ]

            eligible.sort(
                key=lambda batch: (
                    batch["expiry_date"] is None,
                    batch["expiry_date"] or date.max,
                    batch["inventory_id"]
                )
            )

            remaining = requested_qty
            allocations = []

            for batch in eligible:
                available = (
                    Decimal(str(batch["quantity"]))
                    - Decimal(str(batch["reserved_quantity"]))
                )

                if available <= 0:
                    continue

                take_qty = min(
                    available,
                    remaining
                )

                allocations.append({
                    "inventory_id": batch["inventory_id"],
                    "batch_id": batch["batch_id"],
                    "batch_number": batch["batch_number"],
                    "quantity": take_qty
                })

                remaining -= take_qty

                if remaining == 0:
                    break

            if remaining > 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Недостатньо залишків "
                        f"для {product['name']}"
                    )
                )

            line_total = (
                requested_qty * unit_price
            ).quantize(Decimal("0.01"))

            subtotal += line_total

            prepared.append({
                "product_id": product_id,
                "product_name": product["name"],
                "quantity": requested_qty,
                "unit_price": unit_price,
                "total": line_total,
                "allocations": allocations
            })

        # =================================================
        # 10.3. CREATE SALE HEADER
        # =================================================

        sale_id = db.execute(
            text("""
                INSERT INTO sales (
                    location_id,
                    employee_id,
                    customer_id,
                    sale_datetime,
                    subtotal,
                    discount_amount,
                    bonus_amount,
                    total_amount,
                    status
                )
                VALUES (
                    :location_id,
                    :employee_id,
                    NULL,
                    CURRENT_TIMESTAMP,
                    :subtotal,
                    0,
                    0,
                    :subtotal,
                    'PAID'
                )
                RETURNING sale_id
            """),
            {
                "location_id": location_id,
                "employee_id": employee_id,
                "subtotal": subtotal
            }
        ).scalar_one()

        response_items = []

        # =================================================
        # 10.4. SALE ITEMS AND STOCK DEDUCTION
        # =================================================

        for product in prepared:
            response_batches = []

            for batch in product["allocations"]:
                qty = batch["quantity"]

                batch_total = (
                    qty * product["unit_price"]
                ).quantize(Decimal("0.01"))

                # Deduct physical stock
                updated = db.execute(
                    text("""
                        UPDATE inventory
                        SET
                            quantity = quantity - :quantity,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE inventory_id = :inventory_id
                          AND quantity - reserved_quantity
                              >= :quantity
                          AND status = 'AVAILABLE'
                        RETURNING inventory_id
                    """),
                    {
                        "quantity": qty,
                        "inventory_id": batch["inventory_id"]
                    }
                ).first()

                if updated is None:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Залишки змінилися. "
                            "Необхідно повторити перевірку."
                        )
                    )

                # Insert sale item
                db.execute(
                    text("""
                        INSERT INTO sale_items (
                            sale_id,
                            product_id,
                            batch_id,
                            quantity,
                            unit_price,
                            discount_amount,
                            total_amount
                        )
                        VALUES (
                            :sale_id,
                            :product_id,
                            :batch_id,
                            :quantity,
                            :unit_price,
                            0,
                            :total_amount
                        )
                    """),
                    {
                        "sale_id": sale_id,
                        "product_id": product["product_id"],
                        "batch_id": batch["batch_id"],
                        "quantity": qty,
                        "unit_price": product["unit_price"],
                        "total_amount": batch_total
                    }
                )

                # Save stock movement
                db.execute(
                    text("""
                        INSERT INTO stock_movements (
                            movement_type,
                            product_id,
                            batch_id,
                            location_id,
                            quantity,
                            employee_id,
                            comment
                        )
                        VALUES (
                            'SALE',
                            :product_id,
                            :batch_id,
                            :location_id,
                            :quantity,
                            :employee_id,
                            :comment
                        )
                    """),
                    {
                        "product_id": product["product_id"],
                        "batch_id": batch["batch_id"],
                        "location_id": location_id,
                        "quantity": qty,
                        "employee_id": employee_id,
                        "comment": f"Demo sale #{sale_id}"
                    }
                )

                response_batches.append({
                    "batch_id": batch["batch_id"],
                    "batch_number": batch["batch_number"],
                    "quantity": float(qty)
                })

            response_items.append({
                "product_id": product["product_id"],
                "product_name": product["product_name"],
                "quantity": float(product["quantity"]),
                "unit_price": float(product["unit_price"]),
                "total_amount": float(product["total"]),
                "batches": response_batches
            })

        # =================================================
        # 10.5. SIMULATED PAYMENT
        # =================================================

        db.execute(
            text("""
                INSERT INTO payments (
                    sale_id,
                    payment_method,
                    amount,
                    payment_status,
                    transaction_reference,
                    paid_at
                )
                VALUES (
                    :sale_id,
                    'CASH',
                    :amount,
                    'COMPLETED',
                    :reference,
                    CURRENT_TIMESTAMP
                )
            """),
            {
                "sale_id": sale_id,
                "amount": subtotal,
                "reference": f"DEMO-{sale_id}"
            }
        )

        # =================================================
        # 10.6. SAVE IDEMPOTENCY RESULT
        # =================================================

        db.execute(
            text("""
                UPDATE sale_requests
                SET sale_id = :sale_id
                WHERE request_key =
                    CAST(:request_key AS UUID)
            """),
            {
                "sale_id": sale_id,
                "request_key": request_key
            }
        )

        # =================================================
        # 10.7. COMMIT TRANSACTION
        # =================================================

        db.commit()

        result = {
            "message": "Тестовий продаж успішно створено",
            "sale_id": sale_id,
            "location_id": location_id,
            "employee_id": employee_id,
            "total_amount": float(subtotal),
            "status": "PAID",
            "payment_method": "CASH",
            "demo_payment": True,
            "request_key": request_key,
            "duplicate": False,
            "items": response_items
        }

        # Compatibility with old frontend
        if len(response_items) == 1:
            single = response_items[0]

            result.update({
                "product_id": single["product_id"],
                "product_name": single["product_name"],
                "quantity": single["quantity"],
                "unit_price": single["unit_price"],
                "batches": single["batches"]
            })

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise

# =====================================================
# 11. SUPPLIERS API
# =====================================================

@app.get("/suppliers", tags=["Procurement"])
def get_suppliers(
    search: str | None = Query(
        default=None,
        description="Пошук за назвою або ЄДРПОУ"
    ),
    active_only: bool = Query(
        default=True,
        description="Показувати лише активних"
    ),
    db: Session = Depends(get_db)
):
    query = """
        SELECT
            s.supplier_id,
            s.name,
            s.edrpou,
            s.address,
            s.phone,
            s.email,
            s.is_active,
            COUNT(sp.product_id) AS product_count
        FROM suppliers s
        LEFT JOIN supplier_products sp
            ON sp.supplier_id = s.supplier_id
        WHERE 1 = 1
    """

    params = {}

    if active_only:
        query += " AND s.is_active = TRUE"

    if search and search.strip():
        query += """
            AND (
                s.name ILIKE :search
                OR s.edrpou ILIKE :search
            )
        """
        params["search"] = f"%{search.strip()}%"

    query += """
        GROUP BY
            s.supplier_id,
            s.name,
            s.edrpou,
            s.address,
            s.phone,
            s.email,
            s.is_active
        ORDER BY s.name, s.supplier_id
    """

    rows = db.execute(
        text(query),
        params
    ).mappings().all()

    return {
        "count": len(rows),
        "suppliers": [dict(row) for row in rows]
    }


# =====================================================
# 12. PURCHASE ORDERS API
# =====================================================

class PurchaseOrderItemInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=10000)
    unit_price: Decimal = Field(ge=0, decimal_places=2)


class CreatePurchaseOrderRequest(BaseModel):
    supplier_id: int = Field(gt=0)
    destination_location_id: int = Field(gt=0)
    # Legacy clients may send this field; the server does not trust it.
    created_by_employee_id: int | None = Field(default=None, gt=0)
    expected_date: date | None = None
    items: list[PurchaseOrderItemInput] = Field(
        min_length=1,
        max_length=100
    )


@app.get("/purchase-orders", tags=["Procurement"])
def get_purchase_orders(
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT
                po.purchase_order_id,
                po.supplier_id,
                s.name AS supplier_name,
                po.destination_location_id,
                l.name AS destination_name,
                po.created_by_employee_id,
                po.order_date,
                po.expected_date,
                CAST(po.status AS VARCHAR) AS status,
                po.total_amount,
                COUNT(poi.purchase_order_item_id) AS item_count
            FROM purchase_orders po
            JOIN suppliers s
                ON s.supplier_id = po.supplier_id
            JOIN locations l
                ON l.location_id = po.destination_location_id
            LEFT JOIN purchase_order_items poi
                ON poi.purchase_order_id = po.purchase_order_id
            GROUP BY
                po.purchase_order_id,
                po.supplier_id,
                s.name,
                po.destination_location_id,
                l.name,
                po.created_by_employee_id,
                po.order_date,
                po.expected_date,
                po.status,
                po.total_amount
            ORDER BY po.purchase_order_id DESC
        """)
    ).mappings().all()

    return {
        "count": len(rows),
        "purchase_orders": [dict(row) for row in rows]
    }


@app.post(
    "/purchase-orders",
    tags=["Procurement"],
    status_code=201
)
def create_purchase_order(
    request: CreatePurchaseOrderRequest,
    http_request: Request,
    db: Session = Depends(get_db)
):
    # Trust the authenticated session, not created_by_employee_id from JSON.
    actor_employee_id = http_request.state.employee_id
    try:
        # Validate supplier
        supplier = db.execute(
            text("""
                SELECT supplier_id
                FROM suppliers
                WHERE supplier_id = :supplier_id
                  AND is_active = TRUE
            """),
            {"supplier_id": request.supplier_id}
        ).first()

        if not supplier:
            raise HTTPException(
                status_code=400,
                detail="Постачальник не існує або неактивний"
            )

        # Validate location
        location = db.execute(
            text("""
                SELECT location_id
                FROM locations
                WHERE location_id = :location_id
                  AND is_active = TRUE
            """),
            {"location_id": request.destination_location_id}
        ).first()

        if not location:
            raise HTTPException(
                status_code=400,
                detail="Місце доставки не існує або неактивне"
            )

        # Prevent duplicate products
        product_ids = [item.product_id for item in request.items]

        if len(product_ids) != len(set(product_ids)):
            raise HTTPException(
                status_code=400,
                detail="Один препарат не можна додати двічі"
            )

        # Validate products
        product_rows = db.execute(
            text("""
                SELECT product_id
                FROM products
                WHERE product_id = ANY(:product_ids)
                  AND is_active = TRUE
            """),
            {"product_ids": product_ids}
        ).fetchall()

        found_ids = {row[0] for row in product_rows}

        if len(found_ids) != len(product_ids):
            raise HTTPException(
                status_code=400,
                detail="Деякі препарати не знайдені або неактивні"
            )

        # Calculate total
        total = sum(
            (
                item.quantity * item.unit_price
                for item in request.items
            ),
            Decimal("0.00")
        )

        # Create purchase order
        order_id = db.execute(
            text("""
                INSERT INTO purchase_orders (
                    supplier_id,
                    destination_location_id,
                    created_by_employee_id,
                    order_date,
                    expected_date,
                    status,
                    total_amount
                )
                VALUES (
                    :supplier_id,
                    :destination_location_id,
                    :employee_id,
                    CURRENT_DATE,
                    :expected_date,
                    'DRAFT',
                    :total_amount
                )
                RETURNING purchase_order_id
            """),
            {
                "supplier_id": request.supplier_id,
                "destination_location_id":
                    request.destination_location_id,
                "employee_id":
                    actor_employee_id,
                "expected_date": request.expected_date,
                "total_amount": total
            }
        ).scalar_one()

        # Create purchase order items
        for item in request.items:
            db.execute(
                text("""
                    INSERT INTO purchase_order_items (
                        purchase_order_id,
                        product_id,
                        ordered_quantity,
                        received_quantity,
                        unit_price
                    )
                    VALUES (
                        :order_id,
                        :product_id,
                        :quantity,
                        0,
                        :unit_price
                    )
                """),
                {
                    "order_id": order_id,
                    "product_id": item.product_id,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price
                }
            )

        db.commit()

        return {
            "message": "Замовлення успішно створено",
            "purchase_order_id": order_id,
            "supplier_id": request.supplier_id,
            "destination_location_id":
                request.destination_location_id,
            "status": "DRAFT",
            "total_amount": float(total),
            "item_count": len(request.items)
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise


# =====================================================
# 13. PURCHASE ORDER RECEIVING
# =====================================================

from decimal import Decimal
from datetime import date

from fastapi import HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session


class ReceivePurchaseItem(BaseModel):
    purchase_order_item_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    batch_number: str = Field(min_length=1, max_length=100)
    expiry_date: date


class ReceivePurchaseRequest(BaseModel):
    items: list[ReceivePurchaseItem] = Field(
        min_length=1,
        max_length=100
    )


# =====================================================
# 13.1 GET PURCHASE ORDER DETAILS
# =====================================================

@app.get(
    "/purchase-orders/{order_id}",
    tags=["Procurement"]
)
def get_purchase_order_details(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.execute(
        text("""
            SELECT
                po.purchase_order_id,
                po.supplier_id,
                s.name AS supplier_name,
                po.destination_location_id,
                l.name AS destination_name,
                po.created_by_employee_id,
                po.order_date,
                po.expected_date,
                CAST(po.status AS VARCHAR) AS status,
                po.total_amount
            FROM purchase_orders po
            JOIN suppliers s
                ON s.supplier_id = po.supplier_id
            JOIN locations l
                ON l.location_id = po.destination_location_id
            WHERE po.purchase_order_id = :order_id
        """),
        {"order_id": order_id}
    ).mappings().first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Замовлення не знайдено"
        )

    items = db.execute(
        text("""
            SELECT
                poi.purchase_order_item_id,
                poi.product_id,
                p.name AS product_name,
                poi.ordered_quantity,
                COALESCE(
                    poi.received_quantity, 0
                ) AS received_quantity,
                poi.ordered_quantity -
                COALESCE(
                    poi.received_quantity, 0
                ) AS remaining_quantity,
                poi.unit_price,
                poi.ordered_quantity * poi.unit_price
                    AS line_total
            FROM purchase_order_items poi
            JOIN products p
                ON p.product_id = poi.product_id
            WHERE poi.purchase_order_id = :order_id
            ORDER BY poi.purchase_order_item_id
        """),
        {"order_id": order_id}
    ).mappings().all()

    return {
        "order": dict(order),
        "items": [dict(item) for item in items]
    }


# =====================================================
# 13.2 SUBMIT PURCHASE ORDER
# DRAFT -> ORDERED
# =====================================================

@app.post(
    "/purchase-orders/{order_id}/submit",
    tags=["Procurement"]
)
def submit_purchase_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    try:
        result = db.execute(
            text("""
                UPDATE purchase_orders
                SET status =
                    CAST('ORDERED' AS purchase_order_status_enum)
                WHERE purchase_order_id = :order_id
                  AND status =
                    CAST('DRAFT' AS purchase_order_status_enum)
                RETURNING purchase_order_id
            """),
            {"order_id": order_id}
        ).first()

        if not result:
            existing = db.execute(
                text("""
                    SELECT CAST(status AS VARCHAR)
                    FROM purchase_orders
                    WHERE purchase_order_id = :order_id
                """),
                {"order_id": order_id}
            ).scalar_one_or_none()

            if existing is None:
                raise HTTPException(
                    status_code=404,
                    detail="Замовлення не знайдено"
                )

            raise HTTPException(
                status_code=409,
                detail=(
                    "Підтвердити можна лише чернетку. "
                    f"Поточний статус: {existing}"
                )
            )

        db.commit()

        return {
            "message": "Замовлення підтверджено",
            "purchase_order_id": order_id,
            "status": "ORDERED"
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# =====================================================
# 13.3 RECEIVE PURCHASE ORDER
# =====================================================

@app.post(
    "/purchase-orders/{order_id}/receive",
    tags=["Procurement"]
)
def receive_purchase_order(
    order_id: int,
    request: ReceivePurchaseRequest,
    http_request: Request,
    db: Session = Depends(get_db)
):
    # Receiving stock is attributed to the employee performing this operation.
    actor_employee_id = http_request.state.employee_id
    try:
        # Lock purchase order so that two receiving
        # requests cannot update it simultaneously.

        order = db.execute(
            text("""
                SELECT
                    purchase_order_id,
                    supplier_id,
                    destination_location_id,
                    created_by_employee_id,
                    CAST(status AS VARCHAR) AS status
                FROM purchase_orders
                WHERE purchase_order_id = :order_id
                FOR UPDATE
            """),
            {"order_id": order_id}
        ).mappings().first()

        if not order:
            raise HTTPException(
                status_code=404,
                detail="Замовлення не знайдено"
            )

        if order["status"] not in (
            "ORDERED",
            "PARTIALLY_RECEIVED"
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Приймання доступне лише для "
                    "підтверджених замовлень"
                )
            )

        today = db.execute(
            text("SELECT CURRENT_DATE")
        ).scalar_one()

        ids = [
            item.purchase_order_item_id
            for item in request.items
        ]

        if len(ids) != len(set(ids)):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Одна позиція замовлення не може "
                    "повторюватися в одному прийманні"
                )
            )

        received_results = []

        for item in sorted(
            request.items,
            key=lambda x: x.purchase_order_item_id
        ):
            batch_number = item.batch_number.strip()

            if not batch_number:
                raise HTTPException(
                    status_code=400,
                    detail="Номер партії не може бути порожнім"
                )

            if item.expiry_date <= today:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Партія {batch_number} має "
                        "некоректний термін придатності"
                    )
                )

            # Lock the order line.

            line = db.execute(
                text("""
                    SELECT
                        purchase_order_item_id,
                        product_id,
                        ordered_quantity,
                        COALESCE(
                            received_quantity, 0
                        ) AS received_quantity,
                        unit_price
                    FROM purchase_order_items
                    WHERE purchase_order_item_id = :item_id
                      AND purchase_order_id = :order_id
                    FOR UPDATE
                """),
                {
                    "item_id":
                        item.purchase_order_item_id,
                    "order_id": order_id
                }
            ).mappings().first()

            if not line:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Позицію закупівлі не знайдено"
                    )
                )

            remaining = (
                line["ordered_quantity"]
                - line["received_quantity"]
            )

            quantity = Decimal(item.quantity)

            if quantity > remaining:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Отримана кількість перевищує "
                        f"залишок замовлення. "
                        f"Доступно для приймання: {remaining}"
                    )
                )

            # Serialize receipt of the same batch across
            # different purchase orders.

            db.execute(
                text("""
                    SELECT pg_advisory_xact_lock(
                        hashtextextended(
                            :lock_key, 0
                        )
                    )
                """),
                {
                    "lock_key": (
                        f"pharmanet-batch:"
                        f"{line['product_id']}:"
                        f"{order['supplier_id']}:"
                        f"{batch_number}"
                    )
                }
            )

            # Find an existing physical batch.

            batches = db.execute(
                text("""
                    SELECT
                        batch_id,
                        expiry_date,
                        purchase_price
                    FROM batches
                    WHERE product_id = :product_id
                      AND supplier_id = :supplier_id
                      AND batch_number = :batch_number
                    ORDER BY batch_id
                    FOR UPDATE
                """),
                {
                    "product_id": line["product_id"],
                    "supplier_id": order["supplier_id"],
                    "batch_number": batch_number
                }
            ).mappings().all()

            if len(batches) > 1:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"У базі знайдено кілька партій "
                        f"з номером {batch_number}. "
                        "Потрібна перевірка даних."
                    )
                )

            if batches:
                batch = batches[0]

                if batch["expiry_date"] != item.expiry_date:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Партія {batch_number} вже "
                            "існує з іншою датою придатності"
                        )
                    )

                if (
                    batch["purchase_price"]
                    != line["unit_price"]
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Партія {batch_number} вже "
                            "існує з іншою закупівельною ціною"
                        )
                    )

                batch_id = batch["batch_id"]

            else:
                batch_id = db.execute(
                    text("""
                        INSERT INTO batches (
                            product_id,
                            batch_number,
                            supplier_id,
                            expiry_date,
                            purchase_price
                        )
                        VALUES (
                            :product_id,
                            :batch_number,
                            :supplier_id,
                            :expiry_date,
                            :purchase_price
                        )
                        RETURNING batch_id
                    """),
                    {
                        "product_id": line["product_id"],
                        "batch_number": batch_number,
                        "supplier_id": order["supplier_id"],
                        "expiry_date": item.expiry_date,
                        "purchase_price": line["unit_price"]
                    }
                ).scalar_one()

            # Lock existing inventory row.

            stock_rows = db.execute(
                text("""
                    SELECT
                        inventory_id,
                        CAST(status AS VARCHAR) AS status
                    FROM inventory
                    WHERE location_id = :location_id
                      AND batch_id = :batch_id
                    ORDER BY inventory_id
                    FOR UPDATE
                """),
                {
                    "location_id":
                        order["destination_location_id"],
                    "batch_id": batch_id
                }
            ).mappings().all()

            if len(stock_rows) > 1:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Знайдено дублікати залишків "
                        "однієї партії на одному складі"
                    )
                )

            if stock_rows:
                stock = stock_rows[0]

                if stock["status"] == "BLOCKED":
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Партія заблокована. "
                            "Приймання потребує перевірки."
                        )
                    )

                db.execute(
                    text("""
                        UPDATE inventory
                        SET
                            quantity = quantity + :quantity,
                            status =
                                CAST(
                                    'AVAILABLE'
                                    AS inventory_status_enum
                                ),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE inventory_id = :inventory_id
                    """),
                    {
                        "quantity": quantity,
                        "inventory_id": stock["inventory_id"]
                    }
                )

            else:
                db.execute(
                    text("""
                        INSERT INTO inventory (
                            location_id,
                            batch_id,
                            quantity,
                            reserved_quantity,
                            status
                        )
                        VALUES (
                            :location_id,
                            :batch_id,
                            :quantity,
                            0,
                            CAST(
                                'AVAILABLE'
                                AS inventory_status_enum
                            )
                        )
                    """),
                    {
                        "location_id":
                            order["destination_location_id"],
                        "batch_id": batch_id,
                        "quantity": quantity
                    }
                )

            # Record stock movement.

            db.execute(
                text("""
                    INSERT INTO stock_movements (
                        movement_type,
                        product_id,
                        batch_id,
                        location_id,
                        quantity,
                        employee_id,
                        comment
                    )
                    VALUES (
                        CAST(
                            'PURCHASE'
                            AS movement_type_enum
                        ),
                        :product_id,
                        :batch_id,
                        :location_id,
                        :quantity,
                        :employee_id,
                        :comment
                    )
                """),
                {
                    "product_id": line["product_id"],
                    "batch_id": batch_id,
                    "location_id":
                        order["destination_location_id"],
                    "quantity": quantity,
                    "employee_id":
                        actor_employee_id,
                    "comment": (
                        f"Purchase order #{order_id}; "
                        f"item #{item.purchase_order_item_id}"
                    )
                }
            )

            # Update received quantity.

            db.execute(
                text("""
                    UPDATE purchase_order_items
                    SET received_quantity =
                        COALESCE(received_quantity, 0)
                        + :quantity
                    WHERE purchase_order_item_id = :item_id
                """),
                {
                    "quantity": quantity,
                    "item_id":
                        item.purchase_order_item_id
                }
            )

            received_results.append({
                "purchase_order_item_id":
                    item.purchase_order_item_id,
                "product_id": line["product_id"],
                "batch_id": batch_id,
                "batch_number": batch_number,
                "quantity": item.quantity
            })

        # Recalculate complete order status.

        totals = db.execute(
            text("""
                SELECT
                    COUNT(*) AS total_lines,
                    COUNT(*) FILTER (
                        WHERE COALESCE(
                            received_quantity, 0
                        ) >= ordered_quantity
                    ) AS completed_lines
                FROM purchase_order_items
                WHERE purchase_order_id = :order_id
            """),
            {"order_id": order_id}
        ).mappings().one()

        new_status = (
            "RECEIVED"
            if (
                totals["total_lines"] > 0
                and totals["total_lines"]
                    == totals["completed_lines"]
            )
            else "PARTIALLY_RECEIVED"
        )

        db.execute(
            text("""
                UPDATE purchase_orders
                SET status = CAST(
                    :status AS purchase_order_status_enum
                )
                WHERE purchase_order_id = :order_id
            """),
            {
                "order_id": order_id,
                "status": new_status
            }
        )

        db.commit()

        return {
            "message": "Надходження успішно записано",
            "purchase_order_id": order_id,
            "status": new_status,
            "received_items": received_results
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise

# ============================================================
# 14. STOCK TRANSFERS
# ============================================================

from decimal import Decimal
from fastapi import HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session


class TransferLineInput(BaseModel):
    batch_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class CreateTransferInput(BaseModel):
    from_location_id: int = Field(gt=0)
    to_location_id: int = Field(gt=0)
    created_by_employee_id: int = Field(gt=0)
    items: list[TransferLineInput] = Field(
        min_length=1,
        max_length=100
    )


def transfer_enum_values(db: Session) -> list[str]:
    rows = db.execute(
        text("""
            SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            JOIN information_schema.columns c
              ON c.udt_name = t.typname
            WHERE c.table_schema = 'public'
              AND c.table_name = 'transfers'
              AND c.column_name = 'status'
            ORDER BY e.enumsortorder
        """)
    ).scalars().all()

    return list(rows)


def transfer_workflow(db: Session) -> tuple[str, str]:
    """This database uses CREATED, IN_TRANSIT, RECEIVED and CANCELLED."""
    statuses = set(transfer_enum_values(db))
    required = {"CREATED", "IN_TRANSIT", "RECEIVED", "CANCELLED"}
    if not required.issubset(statuses):
        raise HTTPException(
            status_code=500,
            detail="Непідтримувані статуси переміщень: " + ", ".join(sorted(statuses)),
        )
    # This MVP completes the physical transfer in one atomic operation.
    return "CREATED", "RECEIVED"


def transfer_status_type(db: Session) -> str:
    """Read enum name from the actual PostgreSQL column, never assume it."""
    type_name = db.execute(text("""
        SELECT udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transfers'
          AND column_name = 'status'
    """)).scalar_one_or_none()
    # SQL identifiers cannot be parameterized. Whitelist simple identifiers.
    if not type_name or not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", type_name):
        raise HTTPException(status_code=500, detail="Некоректний тип статусу transfers")
    return '"' + type_name + '"'


# ============================================================
# 14.1 AVAILABLE STOCK FOR TRANSFERS
# ============================================================

@app.get("/transfers/available-stock", tags=["Transfers"])
def get_transfer_available_stock(
    location_id: int,
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT
                i.inventory_id,
                i.location_id,
                l.name AS location_name,
                b.batch_id,
                b.product_id,
                p.name AS product_name,
                b.batch_number,
                b.expiry_date,
                i.quantity,
                i.reserved_quantity,
                i.quantity - i.reserved_quantity
                    AS available_quantity
            FROM inventory i
            JOIN batches b ON b.batch_id = i.batch_id
            JOIN products p ON p.product_id = b.product_id
            JOIN locations l ON l.location_id = i.location_id
            WHERE i.location_id = :location_id
              AND CAST(i.status AS VARCHAR)
                  IN ('AVAILABLE', 'LOW_STOCK')
              AND i.quantity - i.reserved_quantity > 0
              AND (
                  b.expiry_date IS NULL
                  OR b.expiry_date > CURRENT_DATE
              )
            ORDER BY
                p.name,
                b.expiry_date NULLS LAST,
                b.batch_id
        """),
        {"location_id": location_id}
    ).mappings().all()

    return {
        "count": len(rows),
        "items": [dict(row) for row in rows]
    }


# ============================================================
# 14.2 LIST TRANSFERS
# ============================================================

@app.get("/transfers", tags=["Transfers"])
def get_transfers(db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT
                t.transfer_id,
                t.from_location_id,
                lf.name AS from_location_name,
                t.to_location_id,
                lt.name AS to_location_name,
                t.created_by_employee_id,
                t.created_at,
                CAST(t.status AS VARCHAR) AS status,
                t.confirmed_by_employee_id,
                t.confirmed_at,
                COUNT(ti.transfer_item_id) AS item_count,
                COALESCE(SUM(ti.quantity), 0)
                    AS total_quantity
            FROM transfers t
            JOIN locations lf
              ON lf.location_id = t.from_location_id
            JOIN locations lt
              ON lt.location_id = t.to_location_id
            LEFT JOIN transfer_items ti
              ON ti.transfer_id = t.transfer_id
            GROUP BY
                t.transfer_id,
                t.from_location_id,
                lf.name,
                t.to_location_id,
                lt.name,
                t.created_by_employee_id,
                t.created_at,
                t.status,
                t.confirmed_by_employee_id,
                t.confirmed_at
            ORDER BY t.transfer_id DESC
            LIMIT 200
        """)
    ).mappings().all()

    return {
        "count": len(rows),
        "transfers": [dict(row) for row in rows]
    }


# ============================================================
# 14.3 TRANSFER DETAILS
# ============================================================

@app.get("/transfers/{transfer_id}", tags=["Transfers"])
def get_transfer_details(
    transfer_id: int,
    db: Session = Depends(get_db)
):
    transfer = db.execute(
        text("""
            SELECT
                t.transfer_id,
                t.from_location_id,
                lf.name AS from_location_name,
                t.to_location_id,
                lt.name AS to_location_name,
                t.created_by_employee_id,
                t.created_at,
                CAST(t.status AS VARCHAR) AS status,
                t.confirmed_by_employee_id,
                t.confirmed_at
            FROM transfers t
            JOIN locations lf
              ON lf.location_id = t.from_location_id
            JOIN locations lt
              ON lt.location_id = t.to_location_id
            WHERE t.transfer_id = :transfer_id
        """),
        {"transfer_id": transfer_id}
    ).mappings().first()

    if not transfer:
        raise HTTPException(
            status_code=404,
            detail="Переміщення не знайдено"
        )

    items = db.execute(
        text("""
            SELECT
                ti.transfer_item_id,
                ti.product_id,
                p.name AS product_name,
                ti.batch_id,
                b.batch_number,
                b.expiry_date,
                ti.quantity
            FROM transfer_items ti
            JOIN products p
              ON p.product_id = ti.product_id
            JOIN batches b
              ON b.batch_id = ti.batch_id
            WHERE ti.transfer_id = :transfer_id
            ORDER BY ti.transfer_item_id
        """),
        {"transfer_id": transfer_id}
    ).mappings().all()

    return {
        "transfer": dict(transfer),
        "items": [dict(item) for item in items]
    }


# ============================================================
# 14.4 CREATE TRANSFER DRAFT
# ============================================================

@app.post(
    "/transfers",
    status_code=201,
    tags=["Transfers"]
)
def create_transfer(
    request: CreateTransferInput,
    db: Session = Depends(get_db)
):
    if request.from_location_id == request.to_location_id:
        raise HTTPException(
            status_code=400,
            detail="Склад відправлення і отримання мають відрізнятися"
        )

    batch_ids = [item.batch_id for item in request.items]

    if len(batch_ids) != len(set(batch_ids)):
        raise HTTPException(
            status_code=400,
            detail="Одна партія не може повторюватися в замовленні"
        )

    try:
        initial_status, _ = transfer_workflow(db)
        enum_type = transfer_status_type(db)

        locations = db.execute(
            text("""
                SELECT location_id, is_active
                FROM locations
                WHERE location_id IN (:source_id, :target_id)
            """),
            {
                "source_id": request.from_location_id,
                "target_id": request.to_location_id
            }
        ).mappings().all()

        active_location_ids = {
            int(row["location_id"])
            for row in locations
            if row["is_active"]
        }

        if not {
            request.from_location_id,
            request.to_location_id
        } <= active_location_ids:
            raise HTTPException(
                status_code=400,
                detail="Обидві локації мають існувати та бути активними"
            )

        employee = db.execute(
            text("""
                SELECT 1
                FROM employees
                WHERE employee_id = :employee_id
            """),
            {
                "employee_id":
                    request.created_by_employee_id
            }
        ).first()

        if not employee:
            raise HTTPException(
                status_code=400,
                detail="Працівника не знайдено"
            )

        verified_items = []

        for item in sorted(
            request.items,
            key=lambda row: row.batch_id
        ):
            stock = db.execute(
                text("""
                    SELECT
                        i.inventory_id,
                        i.quantity,
                        i.reserved_quantity,
                        CAST(i.status AS VARCHAR) AS status,
                        b.batch_id,
                        b.product_id,
                        b.expiry_date
                    FROM inventory i
                    JOIN batches b ON b.batch_id = i.batch_id
                    WHERE i.location_id = :location_id
                      AND i.batch_id = :batch_id
                    FOR UPDATE OF i
                """),
                {
                    "location_id": request.from_location_id,
                    "batch_id": item.batch_id
                }
            ).mappings().all()

            if len(stock) != 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Для партії #{item.batch_id} "
                        "немає єдиного запису залишку"
                    )
                )

            row = stock[0]

            if row["status"] not in (
                "AVAILABLE",
                "LOW_STOCK"
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"Партія #{item.batch_id} недоступна"
                )

            if (
                row["expiry_date"] is not None
                and row["expiry_date"]
                    <= db.execute(
                        text("SELECT CURRENT_DATE")
                    ).scalar_one()
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"Партія #{item.batch_id} прострочена"
                )

            available = (
                row["quantity"] -
                row["reserved_quantity"]
            )

            if Decimal(item.quantity) > available:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Недостатньо залишків партії "
                        f"#{item.batch_id}. Доступно: {available}"
                    )
                )

            verified_items.append({
                "batch_id": item.batch_id,
                "product_id": row["product_id"],
                "quantity": item.quantity
            })

        transfer_id = db.execute(
            text(f"""
                INSERT INTO transfers (
                    from_location_id,
                    to_location_id,
                    created_by_employee_id,
                    status
                )
                VALUES (
                    :source_id,
                    :target_id,
                    :employee_id,
                    CAST(:status AS {enum_type})
                )
                RETURNING transfer_id
            """),
            {
                "source_id": request.from_location_id,
                "target_id": request.to_location_id,
                "employee_id":
                    request.created_by_employee_id,
                "status": initial_status
            }
        ).scalar_one()

        for item in verified_items:
            db.execute(
                text("""
                    INSERT INTO transfer_items (
                        transfer_id,
                        product_id,
                        batch_id,
                        quantity
                    )
                    VALUES (
                        :transfer_id,
                        :product_id,
                        :batch_id,
                        :quantity
                    )
                """),
                {
                    "transfer_id": transfer_id,
                    **item
                }
            )

        db.commit()

        return {
            "message": "Переміщення створено",
            "transfer_id": transfer_id,
            "status": initial_status,
            "item_count": len(verified_items)
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ============================================================
# 14.5 CONFIRM AND COMPLETE TRANSFER
# ============================================================

@app.post(
    "/transfers/{transfer_id}/confirm",
    tags=["Transfers"]
)
def confirm_transfer(
    transfer_id: int,
    employee_id: int,
    db: Session = Depends(get_db)
):
    try:
        initial_status, completed_status = transfer_workflow(db)
        enum_type = transfer_status_type(db)

        transfer = db.execute(
            text("""
                SELECT
                    transfer_id,
                    from_location_id,
                    to_location_id,
                    CAST(status AS VARCHAR) AS status
                FROM transfers
                WHERE transfer_id = :transfer_id
                FOR UPDATE
            """),
            {"transfer_id": transfer_id}
        ).mappings().first()

        if not transfer:
            raise HTTPException(
                status_code=404,
                detail="Переміщення не знайдено"
            )

        if transfer["status"] != initial_status:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Переміщення вже оброблено або "
                    "має інший статус"
                )
            )

        employee = db.execute(
            text("""
                SELECT 1
                FROM employees
                WHERE employee_id = :employee_id
            """),
            {"employee_id": employee_id}
        ).first()

        if not employee:
            raise HTTPException(
                status_code=400,
                detail="Працівника не знайдено"
            )

        items = db.execute(
            text("""
                SELECT
                    transfer_item_id,
                    product_id,
                    batch_id,
                    quantity
                FROM transfer_items
                WHERE transfer_id = :transfer_id
                ORDER BY batch_id
            """),
            {"transfer_id": transfer_id}
        ).mappings().all()

        if not items:
            raise HTTPException(
                status_code=400,
                detail="Переміщення не містить товарів"
            )

        # Serialize destination inventory creation for each batch across transfers.
        for item in sorted(items, key=lambda row: row["batch_id"]):
            db.execute(text("""
                SELECT pg_advisory_xact_lock(
                    hashtextextended(:lock_key, 0)
                )
            """), {"lock_key": f"pharmanet-transfer-batch:{item['batch_id']}"})

        # Lock all affected stock rows in a consistent
        # order to reduce the risk of deadlocks.

        location_ids = sorted([
            transfer["from_location_id"],
            transfer["to_location_id"]
        ])

        for location_id in location_ids:
            for item in items:
                db.execute(
                    text("""
                        SELECT inventory_id
                        FROM inventory
                        WHERE location_id = :location_id
                          AND batch_id = :batch_id
                        FOR UPDATE
                    """),
                    {
                        "location_id": location_id,
                        "batch_id": item["batch_id"]
                    }
                ).all()

        today = db.execute(
            text("SELECT CURRENT_DATE")
        ).scalar_one()

        for item in items:
            source_rows = db.execute(
                text("""
                    SELECT
                        i.inventory_id,
                        i.quantity,
                        i.reserved_quantity,
                        CAST(i.status AS VARCHAR) AS status,
                        b.product_id,
                        b.expiry_date
                    FROM inventory i
                    JOIN batches b ON b.batch_id = i.batch_id
                    WHERE i.location_id = :location_id
                      AND i.batch_id = :batch_id
                    FOR UPDATE OF i
                """),
                {
                    "location_id": transfer["from_location_id"],
                    "batch_id": item["batch_id"]
                }
            ).mappings().all()

            if len(source_rows) != 1:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Не знайдено єдиний залишок "
                        f"для партії #{item['batch_id']}"
                    )
                )

            source = source_rows[0]

            if source["product_id"] != item["product_id"]:
                raise HTTPException(
                    status_code=409,
                    detail="Препарат у переміщенні не відповідає партії"
                )

            if source["status"] not in (
                "AVAILABLE",
                "LOW_STOCK"
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Партія заблокована або недоступна"
                )

            if (
                source["expiry_date"] is not None
                and source["expiry_date"] <= today
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Неможливо перемістити прострочену партію"
                )

            quantity = Decimal(item["quantity"])

            available = (
                source["quantity"] -
                source["reserved_quantity"]
            )

            if available < quantity:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Недостатньо залишків партії "
                        f"#{item['batch_id']}. Доступно: {available}"
                    )
                )

            # 1. Decrease source stock.

            db.execute(
                text("""
                    UPDATE inventory
                    SET
                        quantity = quantity - :quantity,
                        status = CASE
                            WHEN quantity - :quantity = 0
                                THEN CAST(
                                    'OUT_OF_STOCK'
                                    AS inventory_status_enum
                                )
                            ELSE CAST(
                                'AVAILABLE'
                                AS inventory_status_enum
                            )
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE inventory_id = :inventory_id
                """),
                {
                    "quantity": quantity,
                    "inventory_id": source["inventory_id"]
                }
            )

            # 2. Increase or create destination stock.

            destination_rows = db.execute(
                text("""
                    SELECT
                        inventory_id,
                        CAST(status AS VARCHAR) AS status
                    FROM inventory
                    WHERE location_id = :location_id
                      AND batch_id = :batch_id
                    FOR UPDATE
                """),
                {
                    "location_id": transfer["to_location_id"],
                    "batch_id": item["batch_id"]
                }
            ).mappings().all()

            if len(destination_rows) > 1:
                raise HTTPException(
                    status_code=409,
                    detail="Дублікати залишків у місці призначення"
                )

            if destination_rows:
                destination = destination_rows[0]

                if destination["status"] == "BLOCKED":
                    raise HTTPException(
                        status_code=409,
                        detail="Партія заблокована у місці призначення"
                    )

                db.execute(
                    text("""
                        UPDATE inventory
                        SET
                            quantity = quantity + :quantity,
                            status = CAST(
                                'AVAILABLE'
                                AS inventory_status_enum
                            ),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE inventory_id = :inventory_id
                    """),
                    {
                        "quantity": quantity,
                        "inventory_id": destination["inventory_id"]
                    }
                )

            else:
                db.execute(
                    text("""
                        INSERT INTO inventory (
                            location_id,
                            batch_id,
                            quantity,
                            reserved_quantity,
                            status
                        )
                        VALUES (
                            :location_id,
                            :batch_id,
                            :quantity,
                            0,
                            CAST(
                                'AVAILABLE'
                                AS inventory_status_enum
                            )
                        )
                    """),
                    {
                        "location_id": transfer["to_location_id"],
                        "batch_id": item["batch_id"],
                        "quantity": quantity
                    }
                )

            # 3. Record both movements.

            for movement_type, location_id in [
                ("TRANSFER_OUT", transfer["from_location_id"]),
                ("TRANSFER_IN", transfer["to_location_id"])
            ]:
                db.execute(
                    text("""
                        INSERT INTO stock_movements (
                            movement_type,
                            product_id,
                            batch_id,
                            location_id,
                            quantity,
                            employee_id,
                            transfer_id,
                            comment
                        )
                        VALUES (
                            CAST(:movement_type AS movement_type_enum),
                            :product_id,
                            :batch_id,
                            :location_id,
                            :quantity,
                            :employee_id,
                            :transfer_id,
                            :comment
                        )
                    """),
                    {
                        "movement_type": movement_type,
                        "product_id": item["product_id"],
                        "batch_id": item["batch_id"],
                        "location_id": location_id,
                        "quantity": quantity,
                        "employee_id": employee_id,
                        "transfer_id": transfer_id,
                        "comment": (
                            f"Transfer #{transfer_id}: "
                            f"{movement_type}"
                        )
                    }
                )

        db.execute(
            text(f"""
                UPDATE transfers
                SET
                    status = CAST(:status AS {enum_type}),
                    confirmed_by_employee_id = :employee_id,
                    confirmed_at = CURRENT_TIMESTAMP
                WHERE transfer_id = :transfer_id
            """),
            {
                "transfer_id": transfer_id,
                "status": completed_status,
                "employee_id": employee_id
            }
        )

        db.commit()

        return {
            "message": "Переміщення успішно завершено",
            "transfer_id": transfer_id,
            "status": completed_status,
            "item_count": len(items)
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

# ============================================================
# 15. WRITE-OFFS AND STOCK CONTROL
# ============================================================

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session


WRITE_OFF_REASONS = {
    "EXPIRED",
    "DAMAGED",
    "LOST",
    "OTHER",
}


class WriteOffLineInput(BaseModel):
    batch_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100000)


class CreateWriteOffInput(BaseModel):
    location_id: int = Field(gt=0)
    employee_id: int = Field(gt=0)
    reason: str
    items: list[WriteOffLineInput] = Field(
        min_length=1,
        max_length=100
    )


class WriteOffEmployeeInput(BaseModel):
    employee_id: int = Field(gt=0)


def ensure_write_off_employee(
    db: Session,
    employee_id: int
):
    found = db.execute(
        text("""
            SELECT 1
            FROM employees
            WHERE employee_id = :employee_id
        """),
        {"employee_id": employee_id}
    ).first()

    if not found:
        raise HTTPException(
            status_code=400,
            detail="Працівника не знайдено"
        )


def lock_write_off(
    db: Session,
    write_off_id: int
):
    row = db.execute(
        text("""
            SELECT
                write_off_id,
                location_id,
                employee_id,
                CAST(reason AS VARCHAR) AS reason,
                CAST(status AS VARCHAR) AS status,
                created_at
            FROM write_offs
            WHERE write_off_id = :write_off_id
            FOR UPDATE
        """),
        {"write_off_id": write_off_id}
    ).mappings().first()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Списання не знайдено"
        )

    return row


# ============================================================
# 15.1 STOCK AVAILABLE FOR WRITE-OFF
# ============================================================

@app.get(
    "/write-offs/available-stock",
    tags=["Write-offs"]
)
def get_write_off_available_stock(
    location_id: int = Query(gt=0),
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT
                i.inventory_id,
                i.location_id,
                l.name AS location_name,
                b.batch_id,
                b.product_id,
                p.name AS product_name,
                b.batch_number,
                b.expiry_date,
                i.quantity,
                i.reserved_quantity,
                i.quantity - i.reserved_quantity
                    AS available_quantity,
                CAST(i.status AS VARCHAR) AS status,
                CASE
                    WHEN b.expiry_date < CURRENT_DATE
                        THEN TRUE
                    ELSE FALSE
                END AS is_expired
            FROM inventory i
            JOIN batches b
                ON b.batch_id = i.batch_id
            JOIN products p
                ON p.product_id = b.product_id
            JOIN locations l
                ON l.location_id = i.location_id
            WHERE i.location_id = :location_id
              AND i.quantity - i.reserved_quantity > 0
            ORDER BY
                b.expiry_date NULLS LAST,
                p.name,
                b.batch_id
        """),
        {"location_id": location_id}
    ).mappings().all()

    return {
        "count": len(rows),
        "items": [dict(row) for row in rows]
    }


# ============================================================
# 15.2 EXPIRY MONITORING
# ============================================================

@app.get(
    "/inventory/expiry-alerts",
    tags=["Inventory"]
)
def get_inventory_expiry_alerts(
    days: int = Query(default=30, ge=0, le=365),
    location_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db)
):
    query = """
        SELECT
            i.inventory_id,
            i.location_id,
            l.name AS location_name,
            b.batch_id,
            b.batch_number,
            b.product_id,
            p.name AS product_name,
            b.expiry_date,
            b.expiry_date - CURRENT_DATE AS days_remaining,
            i.quantity,
            i.reserved_quantity,
            CAST(i.status AS VARCHAR) AS status,
            CASE
                WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED'
                WHEN b.expiry_date = CURRENT_DATE THEN 'EXPIRES_TODAY'
                ELSE 'EXPIRING_SOON'
            END AS alert_type
        FROM inventory i
        JOIN batches b ON b.batch_id = i.batch_id
        JOIN products p ON p.product_id = b.product_id
        JOIN locations l ON l.location_id = i.location_id
        WHERE i.quantity > 0
          AND b.expiry_date IS NOT NULL
          AND b.expiry_date <= CURRENT_DATE + CAST(:days AS INTEGER)
    """
    params = {"days": days}
    if location_id is not None:
        query += " AND i.location_id = :location_id"
        params["location_id"] = location_id
    query += " ORDER BY b.expiry_date, l.name, p.name"

    rows = db.execute(text(query), params).mappings().all()
    return {
        "count": len(rows),
        "days": days,
        "items": [dict(row) for row in rows]
    }


# ============================================================
# 15.3 WRITE-OFF HISTORY
# ============================================================

@app.get("/write-offs", tags=["Write-offs"])
def get_write_offs(
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT
                w.write_off_id,
                w.location_id,
                l.name AS location_name,
                w.employee_id,
                CAST(w.reason AS VARCHAR) AS reason,
                CAST(w.status AS VARCHAR) AS status,
                w.created_at,
                COUNT(wi.write_off_item_id)
                    AS item_count,
                COALESCE(SUM(wi.quantity), 0)
                    AS total_quantity
            FROM write_offs w
            JOIN locations l
                ON l.location_id = w.location_id
            LEFT JOIN write_off_items wi
                ON wi.write_off_id = w.write_off_id
            GROUP BY
                w.write_off_id,
                w.location_id,
                l.name,
                w.employee_id,
                w.reason,
                w.status,
                w.created_at
            ORDER BY w.write_off_id DESC
            LIMIT 200
        """)
    ).mappings().all()

    return {
        "count": len(rows),
        "write_offs": [dict(row) for row in rows]
    }


# ============================================================
# 15.4 WRITE-OFF DETAILS
# ============================================================

@app.get(
    "/write-offs/{write_off_id}",
    tags=["Write-offs"]
)
def get_write_off_details(
    write_off_id: int,
    db: Session = Depends(get_db)
):
    header = db.execute(
        text("""
            SELECT
                w.write_off_id,
                w.location_id,
                l.name AS location_name,
                w.employee_id,
                CAST(w.reason AS VARCHAR) AS reason,
                CAST(w.status AS VARCHAR) AS status,
                w.created_at
            FROM write_offs w
            JOIN locations l
                ON l.location_id = w.location_id
            WHERE w.write_off_id = :write_off_id
        """),
        {"write_off_id": write_off_id}
    ).mappings().first()

    if not header:
        raise HTTPException(
            status_code=404,
            detail="Списання не знайдено"
        )

    items = db.execute(
        text("""
            SELECT
                wi.write_off_item_id,
                wi.product_id,
                p.name AS product_name,
                wi.batch_id,
                b.batch_number,
                b.expiry_date,
                wi.quantity
            FROM write_off_items wi
            JOIN products p
                ON p.product_id = wi.product_id
            JOIN batches b
                ON b.batch_id = wi.batch_id
            WHERE wi.write_off_id = :write_off_id
            ORDER BY wi.write_off_item_id
        """),
        {"write_off_id": write_off_id}
    ).mappings().all()

    return {
        "write_off": dict(header),
        "items": [dict(row) for row in items]
    }


# ============================================================
# 15.5 CREATE WRITE-OFF
# ============================================================

@app.post(
    "/write-offs",
    tags=["Write-offs"],
    status_code=201
)
def create_write_off(
    request: CreateWriteOffInput,
    db: Session = Depends(get_db)
):
    reason = request.reason.strip().upper()

    if reason not in WRITE_OFF_REASONS:
        raise HTTPException(
            status_code=422,
            detail="Некоректна причина списання"
        )

    batch_ids = [
        item.batch_id for item in request.items
    ]

    if len(batch_ids) != len(set(batch_ids)):
        raise HTTPException(
            status_code=400,
            detail="Не можна додати одну партію двічі"
        )

    try:
        ensure_write_off_employee(
            db,
            request.employee_id
        )

        location = db.execute(
            text("""
                SELECT location_id
                FROM locations
                WHERE location_id = :location_id
                  AND is_active = TRUE
            """),
            {"location_id": request.location_id}
        ).first()

        if not location:
            raise HTTPException(
                status_code=400,
                detail="Локація не існує або неактивна"
            )

        prepared = []

        for item in sorted(
            request.items,
            key=lambda x: x.batch_id
        ):
            rows = db.execute(
                text("""
                    SELECT
                        i.inventory_id,
                        i.quantity,
                        i.reserved_quantity,
                        b.product_id
                    FROM inventory i
                    JOIN batches b
                        ON b.batch_id = i.batch_id
                    WHERE i.location_id = :location_id
                      AND i.batch_id = :batch_id
                    FOR UPDATE OF i
                """),
                {
                    "location_id": request.location_id,
                    "batch_id": item.batch_id
                }
            ).mappings().all()

            if len(rows) != 1:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Не знайдено єдиний залишок "
                        f"для партії #{item.batch_id}"
                    )
                )

            row = rows[0]

            available = (
                row["quantity"] -
                row["reserved_quantity"]
            )

            if item.quantity > available:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Недостатньо залишків партії "
                        f"#{item.batch_id}. "
                        f"Доступно: {available}"
                    )
                )

            prepared.append({
                "product_id": row["product_id"],
                "batch_id": item.batch_id,
                "quantity": item.quantity
            })

        write_off_id = db.execute(
            text("""
                INSERT INTO write_offs (
                    location_id,
                    employee_id,
                    reason,
                    status
                )
                VALUES (
                    :location_id,
                    :employee_id,
                    CAST(
                        :reason AS write_off_reason_enum
                    ),
                    CAST(
                        'CREATED' AS write_off_status_enum
                    )
                )
                RETURNING write_off_id
            """),
            {
                "location_id": request.location_id,
                "employee_id": request.employee_id,
                "reason": reason
            }
        ).scalar_one()

        for item in prepared:
            db.execute(
                text("""
                    INSERT INTO write_off_items (
                        write_off_id,
                        product_id,
                        batch_id,
                        quantity
                    )
                    VALUES (
                        :write_off_id,
                        :product_id,
                        :batch_id,
                        :quantity
                    )
                """),
                {
                    "write_off_id": write_off_id,
                    **item
                }
            )

        db.commit()

        return {
            "message": "Списання створено",
            "write_off_id": write_off_id,
            "reason": reason,
            "status": "CREATED",
            "item_count": len(prepared)
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ============================================================
# 15.6 APPROVE WRITE-OFF
# ============================================================

@app.post(
    "/write-offs/{write_off_id}/approve",
    tags=["Write-offs"]
)
def approve_write_off(
    write_off_id: int,
    request: WriteOffEmployeeInput,
    db: Session = Depends(get_db)
):
    try:
        ensure_write_off_employee(
            db,
            request.employee_id
        )

        write_off = lock_write_off(
            db,
            write_off_id
        )

        if write_off["status"] != "CREATED":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Підтвердити можна лише списання "
                    "зі статусом CREATED"
                )
            )

        db.execute(
            text("""
                UPDATE write_offs
                SET status = CAST(
                    'APPROVED' AS write_off_status_enum
                )
                WHERE write_off_id = :write_off_id
            """),
            {"write_off_id": write_off_id}
        )

        db.commit()

        return {
            "message": "Списання погоджено",
            "write_off_id": write_off_id,
            "status": "APPROVED"
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ============================================================
# 15.7 COMPLETE WRITE-OFF
# ============================================================

@app.post(
    "/write-offs/{write_off_id}/complete",
    tags=["Write-offs"]
)
def complete_write_off(
    write_off_id: int,
    request: WriteOffEmployeeInput,
    db: Session = Depends(get_db)
):
    try:
        ensure_write_off_employee(
            db,
            request.employee_id
        )

        write_off = lock_write_off(
            db,
            write_off_id
        )

        if write_off["status"] != "APPROVED":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Завершити можна лише погоджене "
                    "списання зі статусом APPROVED"
                )
            )

        items = db.execute(
            text("""
                SELECT
                    write_off_item_id,
                    product_id,
                    batch_id,
                    quantity
                FROM write_off_items
                WHERE write_off_id = :write_off_id
                ORDER BY batch_id
            """),
            {"write_off_id": write_off_id}
        ).mappings().all()

        if not items:
            raise HTTPException(
                status_code=400,
                detail="У списанні немає препаратів"
            )

        if len({
            item["batch_id"] for item in items
        }) != len(items):
            raise HTTPException(
                status_code=409,
                detail="У списанні є дублікати партій"
            )

        location_id = write_off["location_id"]

        for item in items:
            # Lock a physical stock record.

            stocks = db.execute(
                text("""
                    SELECT
                        i.inventory_id,
                        i.quantity,
                        i.reserved_quantity,
                        CAST(i.status AS VARCHAR) AS status,
                        b.product_id
                    FROM inventory i
                    JOIN batches b
                        ON b.batch_id = i.batch_id
                    WHERE i.location_id = :location_id
                      AND i.batch_id = :batch_id
                    FOR UPDATE OF i
                """),
                {
                    "location_id": location_id,
                    "batch_id": item["batch_id"]
                }
            ).mappings().all()

            if len(stocks) != 1:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Партія #{item['batch_id']} "
                        "не має єдиного запису залишку"
                    )
                )

            stock = stocks[0]

            if stock["product_id"] != item["product_id"]:
                raise HTTPException(
                    status_code=409,
                    detail="Невідповідність препарату та партії"
                )

            available = (
                stock["quantity"] -
                stock["reserved_quantity"]
            )

            if item["quantity"] <= 0:
                raise HTTPException(
                    status_code=409,
                    detail="Некоректна кількість у списанні"
                )

            if available < item["quantity"]:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Недостатньо залишків партії "
                        f"#{item['batch_id']}. "
                        f"Доступно: {available}"
                    )
                )

            # Deduct stock, retaining any reservations.

            db.execute(
                text("""
                    UPDATE inventory
                    SET
                        quantity = quantity - :quantity,
                        status = CASE
                            WHEN status = CAST('BLOCKED' AS inventory_status_enum)
                                THEN CAST('BLOCKED' AS inventory_status_enum)
                            WHEN quantity - :quantity = 0
                                THEN CAST(
                                    'OUT_OF_STOCK'
                                    AS inventory_status_enum
                                )
                            ELSE CAST(
                                'AVAILABLE'
                                AS inventory_status_enum
                            )
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE inventory_id = :inventory_id
                """),
                {
                    "inventory_id": stock["inventory_id"],
                    "quantity": item["quantity"]
                }
            )

            # Register stock movement.

            db.execute(
                text("""
                    INSERT INTO stock_movements (
                        movement_type,
                        product_id,
                        batch_id,
                        location_id,
                        quantity,
                        employee_id,
                        comment
                    )
                    VALUES (
                        CAST(
                            'WRITE_OFF' AS movement_type_enum
                        ),
                        :product_id,
                        :batch_id,
                        :location_id,
                        :quantity,
                        :employee_id,
                        :comment
                    )
                """),
                {
                    "product_id": item["product_id"],
                    "batch_id": item["batch_id"],
                    "location_id": location_id,
                    "quantity": item["quantity"],
                    "employee_id": request.employee_id,
                    "comment": (
                        f"Write-off #{write_off_id}; "
                        f"reason: {write_off['reason']}"
                    )
                }
            )

        db.execute(
            text("""
                UPDATE write_offs
                SET status = CAST(
                    'COMPLETED' AS write_off_status_enum
                )
                WHERE write_off_id = :write_off_id
            """),
            {"write_off_id": write_off_id}
        )

        db.commit()

        return {
            "message": "Списання завершено",
            "write_off_id": write_off_id,
            "status": "COMPLETED",
            "item_count": len(items)
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ============================================================
# 15.8 CANCEL WRITE-OFF
# ============================================================

@app.post(
    "/write-offs/{write_off_id}/cancel",
    tags=["Write-offs"]
)
def cancel_write_off(
    write_off_id: int,
    request: WriteOffEmployeeInput,
    db: Session = Depends(get_db)
):
    try:
        ensure_write_off_employee(
            db,
            request.employee_id
        )

        write_off = lock_write_off(
            db,
            write_off_id
        )

        if write_off["status"] not in (
            "CREATED",
            "APPROVED"
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Скасувати можна лише незавершене списання"
                )
            )

        db.execute(
            text("""
                UPDATE write_offs
                SET status = CAST(
                    'CANCELLED' AS write_off_status_enum
                )
                WHERE write_off_id = :write_off_id
            """),
            {"write_off_id": write_off_id}
        )

        db.commit()

        return {
            "message": "Списання скасовано",
            "write_off_id": write_off_id,
            "status": "CANCELLED"
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ============================================================
# 16. INVENTORY BLOCKING / UNBLOCKING
# ============================================================

@app.post(
    "/inventory/{inventory_id}/block",
    tags=["Inventory"]
)
def block_inventory_batch(
    inventory_id: int,
    db: Session = Depends(get_db)
):
    try:
        stock = db.execute(
            text("""
                SELECT
                    inventory_id,
                    batch_id,
                    location_id,
                    quantity,
                    reserved_quantity,
                    CAST(status AS VARCHAR) AS status
                FROM inventory
                WHERE inventory_id = :inventory_id
                FOR UPDATE
            """),
            {"inventory_id": inventory_id}
        ).mappings().first()

        if stock is None:
            raise HTTPException(
                status_code=404,
                detail="Залишок не знайдено"
            )

        if stock["status"] == "BLOCKED":
            db.commit()
            return {
                "message": "Партія вже заблокована",
                "inventory_id": inventory_id,
                "status": "BLOCKED"
            }

        db.execute(
            text("""
                UPDATE inventory
                SET status = CAST(
                        'BLOCKED' AS inventory_status_enum
                    ),
                    updated_at = CURRENT_TIMESTAMP
                WHERE inventory_id = :inventory_id
            """),
            {"inventory_id": inventory_id}
        )

        db.commit()

        return {
            "message": "Партію заблоковано",
            "inventory_id": inventory_id,
            "status": "BLOCKED"
        }

    except Exception:
        db.rollback()
        raise


@app.post(
    "/inventory/{inventory_id}/unblock",
    tags=["Inventory"]
)
def unblock_inventory_batch(
    inventory_id: int,
    db: Session = Depends(get_db)
):
    try:
        stock = db.execute(
            text("""
                SELECT
                    i.inventory_id,
                    i.quantity,
                    i.reserved_quantity,
                    CAST(i.status AS VARCHAR) AS status,
                    b.expiry_date,
                    CURRENT_DATE AS today
                FROM inventory i
                JOIN batches b
                    ON b.batch_id = i.batch_id
                WHERE i.inventory_id = :inventory_id
                FOR UPDATE OF i
            """),
            {"inventory_id": inventory_id}
        ).mappings().first()

        if stock is None:
            raise HTTPException(
                status_code=404,
                detail="Залишок не знайдено"
            )

        if stock["status"] != "BLOCKED":
            raise HTTPException(
                status_code=409,
                detail="Партія не заблокована"
            )

        if (
            stock["expiry_date"] is not None
            and stock["expiry_date"] <= stock["today"]
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Прострочену партію або партію "
                    "з останнім днем придатності сьогодні "
                    "не можна розблокувати"
                )
            )

        if stock["quantity"] < stock["reserved_quantity"]:
            raise HTTPException(
                status_code=409,
                detail="Некоректні резерви товару"
            )

        new_status = (
            "AVAILABLE"
            if stock["quantity"] > 0
            else "OUT_OF_STOCK"
        )

        db.execute(
            text("""
                UPDATE inventory
                SET status = CAST(
                        :status AS inventory_status_enum
                    ),
                    updated_at = CURRENT_TIMESTAMP
                WHERE inventory_id = :inventory_id
            """),
            {
                "inventory_id": inventory_id,
                "status": new_status
            }
        )

        db.commit()

        return {
            "message": "Партію розблоковано",
            "inventory_id": inventory_id,
            "status": new_status
        }

    except Exception:
        db.rollback()
        raise


# ============================================================
# 17. DASHBOARD AND ANALYTICS
# ============================================================

from fastapi import Query, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session


# ============================================================
# 17.1 DASHBOARD SUMMARY
# ============================================================

@app.get("/dashboard/summary", tags=["Dashboard"])
def dashboard_summary(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    sales = db.execute(
        text("""
            SELECT
                COUNT(*) AS sales_count,
                COALESCE(SUM(total_amount), 0)
                    AS total_revenue,
                COALESCE(AVG(total_amount), 0)
                    AS average_check
            FROM sales
            WHERE sale_datetime >=
                CURRENT_TIMESTAMP - (:days * INTERVAL '1 day')
              AND CAST(status AS VARCHAR) = 'PAID'
        """),
        {"days": days}
    ).mappings().one()

    inventory = db.execute(
        text("""
            SELECT
                COUNT(*) AS stock_records,
                COALESCE(SUM(i.quantity), 0)
                    AS total_quantity,
                COUNT(*) FILTER (
                    WHERE CAST(i.status AS VARCHAR) = 'BLOCKED'
                      AND i.quantity > 0
                ) AS blocked_batches,
                COUNT(*) FILTER (
                    WHERE i.quantity > 0
                      AND b.expiry_date < CURRENT_DATE
                ) AS expired_batches,
                COUNT(*) FILTER (
                    WHERE i.quantity - i.reserved_quantity
                          BETWEEN 1 AND 10
                      AND CAST(i.status AS VARCHAR)
                          IN ('AVAILABLE', 'LOW_STOCK')
                      AND (
                          b.expiry_date IS NULL
                          OR b.expiry_date > CURRENT_DATE
                      )
                ) AS low_stock_batches
            FROM inventory i
            JOIN batches b
                ON b.batch_id = i.batch_id
        """)
    ).mappings().one()

    purchases = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (
                    WHERE CAST(status AS VARCHAR)
                        IN ('ORDERED', 'PARTIALLY_RECEIVED')
                ) AS pending_orders,
                COALESCE(SUM(total_amount), 0)
                    AS total_purchase_amount
            FROM purchase_orders
            WHERE order_date >=
                CURRENT_DATE - :days
        """),
        {"days": days}
    ).mappings().one()

    write_offs = db.execute(
        text("""
            SELECT
                COUNT(*) AS completed_write_offs
            FROM write_offs
            WHERE CAST(status AS VARCHAR) = 'COMPLETED'
              AND created_at >=
                  CURRENT_TIMESTAMP - (:days * INTERVAL '1 day')
        """),
        {"days": days}
    ).mappings().one()

    return {
        "period_days": days,
        "sales": dict(sales),
        "inventory": dict(inventory),
        "purchases": dict(purchases),
        "write_offs": dict(write_offs)
    }


# ============================================================
# 17.2 SALES TREND
# ============================================================

@app.get("/dashboard/sales-trend", tags=["Dashboard"])
def dashboard_sales_trend(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            WITH calendar AS (
                SELECT
                    generate_series(
                        CURRENT_DATE - (:days - 1),
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    )::date AS sale_date
            ),
            daily_sales AS (
                SELECT
                    sale_datetime::date AS sale_date,
                    COUNT(*) AS sales_count,
                    COALESCE(SUM(total_amount), 0)
                        AS revenue
                FROM sales
                WHERE sale_datetime >=
                    CURRENT_DATE - (:days - 1)
                  AND sale_datetime <
                    CURRENT_DATE + INTERVAL '1 day'
                  AND CAST(status AS VARCHAR) = 'PAID'
                GROUP BY sale_datetime::date
            )
            SELECT
                c.sale_date,
                COALESCE(d.sales_count, 0)
                    AS sales_count,
                COALESCE(d.revenue, 0)
                    AS revenue
            FROM calendar c
            LEFT JOIN daily_sales d
                ON d.sale_date = c.sale_date
            ORDER BY c.sale_date
        """),
        {"days": days}
    ).mappings().all()

    return {
        "days": days,
        "items": [dict(row) for row in rows]
    }


# ============================================================
# 17.3 TOP PRODUCTS
# ============================================================

@app.get("/dashboard/top-products", tags=["Dashboard"])
def dashboard_top_products(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT
                si.product_id,
                p.name AS product_name,
                SUM(si.quantity) AS quantity_sold,
                SUM(si.total_amount) AS revenue,
                COUNT(DISTINCT si.sale_id)
                    AS sales_count
            FROM sale_items si
            JOIN sales s
                ON s.sale_id = si.sale_id
            JOIN products p
                ON p.product_id = si.product_id
            WHERE s.sale_datetime >=
                CURRENT_TIMESTAMP - (:days * INTERVAL '1 day')
              AND CAST(s.status AS VARCHAR) = 'PAID'
            GROUP BY
                si.product_id,
                p.name
            ORDER BY
                quantity_sold DESC,
                revenue DESC
            LIMIT :limit
        """),
        {
            "days": days,
            "limit": limit
        }
    ).mappings().all()

    return {
        "days": days,
        "count": len(rows),
        "items": [dict(row) for row in rows]
    }


# ============================================================
# 17.4 ANALYTICS BY LOCATION
# ============================================================

@app.get("/dashboard/locations", tags=["Dashboard"])
def dashboard_locations(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            WITH sales_by_location AS (
                SELECT
                    location_id,
                    COUNT(*) AS sales_count,
                    COALESCE(SUM(total_amount), 0)
                        AS revenue
                FROM sales
                WHERE sale_datetime >=
                    CURRENT_TIMESTAMP - (:days * INTERVAL '1 day')
                  AND CAST(status AS VARCHAR) = 'PAID'
                GROUP BY location_id
            ),
            stock_by_location AS (
                SELECT
                    i.location_id,
                    COUNT(*) AS stock_records,
                    COALESCE(SUM(i.quantity), 0)
                        AS total_stock_quantity,
                    COUNT(*) FILTER (
                        WHERE CAST(i.status AS VARCHAR) = 'BLOCKED'
                          AND i.quantity > 0
                    ) AS blocked_batches
                FROM inventory i
                GROUP BY i.location_id
            )
            SELECT
                l.location_id,
                l.name AS location_name,
                CAST(l.location_type AS VARCHAR)
                    AS location_type,
                COALESCE(s.sales_count, 0)
                    AS sales_count,
                COALESCE(s.revenue, 0)
                    AS revenue,
                COALESCE(st.stock_records, 0)
                    AS stock_records,
                COALESCE(st.total_stock_quantity, 0)
                    AS total_stock_quantity,
                COALESCE(st.blocked_batches, 0)
                    AS blocked_batches
            FROM locations l
            LEFT JOIN sales_by_location s
                ON s.location_id = l.location_id
            LEFT JOIN stock_by_location st
                ON st.location_id = l.location_id
            WHERE l.is_active = TRUE
              AND CAST(l.location_type AS VARCHAR)
                  IN ('PHARMACY', 'WAREHOUSE')
            ORDER BY
                revenue DESC,
                l.name
        """),
        {"days": days}
    ).mappings().all()

    return {
        "days": days,
        "count": len(rows),
        "items": [dict(row) for row in rows]
    }


# ============================================================
# 18. FILTERED DASHBOARD REPORT
# ============================================================

@app.get("/dashboard/report", tags=["Dashboard"])
def get_dashboard_report(
    days: int = Query(default=30, ge=1, le=365),
    location_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db)
):
    # One consistent calendar period for every metric.
    # Optional location conditions are added dynamically
    # to avoid PostgreSQL untyped NULL parameter errors.

    params = {"days": days}

    if location_id is not None:
        location = db.execute(
            text("""
                SELECT
                    location_id,
                    name,
                    CAST(location_type AS VARCHAR)
                        AS location_type
                FROM locations
                WHERE location_id = :location_id
                  AND is_active = TRUE
            """),
            {"location_id": location_id}
        ).mappings().first()

        if location is None:
            raise HTTPException(
                status_code=404,
                detail="Локацію не знайдено"
            )

        params["location_id"] = location_id
        location_name = location["name"]
    else:
        location_name = "Уся аптечна мережа"

    sales_filter = (
        " AND s.location_id = :location_id"
        if location_id is not None else ""
    )

    inventory_filter = (
        " AND i.location_id = :location_id"
        if location_id is not None else ""
    )

    purchase_filter = (
        " AND po.destination_location_id = :location_id"
        if location_id is not None else ""
    )

    write_off_filter = (
        " AND w.location_id = :location_id"
        if location_id is not None else ""
    )

    # --------------------------------------------------------
    # SALES SUMMARY
    # --------------------------------------------------------

    sales = db.execute(
        text(f"""
            SELECT
                COUNT(*) AS sales_count,
                COALESCE(
                    SUM(s.total_amount), 0
                ) AS total_revenue,
                COALESCE(
                    AVG(s.total_amount), 0
                ) AS average_check
            FROM sales s
            WHERE s.sale_datetime >=
                CURRENT_DATE - (:days - 1)
              AND s.sale_datetime <
                CURRENT_DATE + INTERVAL '1 day'
              AND CAST(s.status AS VARCHAR) = 'PAID'
              {sales_filter}
        """),
        params
    ).mappings().one()

    # --------------------------------------------------------
    # SALES TREND
    # --------------------------------------------------------

    trend = db.execute(
        text(f"""
            WITH calendar AS (
                SELECT
                    generate_series(
                        CURRENT_DATE - (:days - 1),
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    )::date AS sale_date
            ),
            daily_sales AS (
                SELECT
                    s.sale_datetime::date AS sale_date,
                    COUNT(*) AS sales_count,
                    COALESCE(
                        SUM(s.total_amount), 0
                    ) AS revenue
                FROM sales s
                WHERE s.sale_datetime >=
                    CURRENT_DATE - (:days - 1)
                  AND s.sale_datetime <
                    CURRENT_DATE + INTERVAL '1 day'
                  AND CAST(s.status AS VARCHAR) = 'PAID'
                  {sales_filter}
                GROUP BY s.sale_datetime::date
            )
            SELECT
                c.sale_date,
                COALESCE(d.sales_count, 0)
                    AS sales_count,
                COALESCE(d.revenue, 0)
                    AS revenue
            FROM calendar c
            LEFT JOIN daily_sales d
                ON d.sale_date = c.sale_date
            ORDER BY c.sale_date
        """),
        params
    ).mappings().all()

    # --------------------------------------------------------
    # TOP PRODUCTS
    # --------------------------------------------------------

    top_products = db.execute(
        text(f"""
            SELECT
                si.product_id,
                p.name AS product_name,
                SUM(si.quantity) AS quantity_sold,
                COALESCE(
                    SUM(si.total_amount), 0
                ) AS revenue,
                COUNT(DISTINCT si.sale_id)
                    AS sales_count
            FROM sale_items si
            JOIN sales s
                ON s.sale_id = si.sale_id
            JOIN products p
                ON p.product_id = si.product_id
            WHERE s.sale_datetime >=
                CURRENT_DATE - (:days - 1)
              AND s.sale_datetime <
                CURRENT_DATE + INTERVAL '1 day'
              AND CAST(s.status AS VARCHAR) = 'PAID'
              {sales_filter}
            GROUP BY si.product_id, p.name
            ORDER BY
                quantity_sold DESC,
                revenue DESC
            LIMIT 10
        """),
        params
    ).mappings().all()

    # --------------------------------------------------------
    # INVENTORY
    # --------------------------------------------------------

    inventory = db.execute(
        text(f"""
            SELECT
                COUNT(*) AS stock_records,
                COALESCE(
                    SUM(i.quantity), 0
                ) AS total_quantity,
                COUNT(*) FILTER (
                    WHERE i.quantity > 0
                      AND CAST(i.status AS VARCHAR)
                          = 'BLOCKED'
                ) AS blocked_batches,
                COUNT(*) FILTER (
                    WHERE i.quantity > 0
                      AND b.expiry_date < CURRENT_DATE
                ) AS expired_batches,
                COUNT(*) FILTER (
                    WHERE i.quantity - i.reserved_quantity
                          BETWEEN 1 AND 10
                      AND CAST(i.status AS VARCHAR)
                          IN ('AVAILABLE', 'LOW_STOCK')
                      AND (
                          b.expiry_date IS NULL
                          OR b.expiry_date > CURRENT_DATE
                      )
                ) AS low_stock_batches
            FROM inventory i
            JOIN batches b
                ON b.batch_id = i.batch_id
            WHERE 1 = 1
              {inventory_filter}
        """),
        params
    ).mappings().one()

    # --------------------------------------------------------
    # PURCHASE ORDERS
    # --------------------------------------------------------

    purchases = db.execute(
        text(f"""
            SELECT
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (
                    WHERE CAST(po.status AS VARCHAR)
                        IN ('ORDERED', 'PARTIALLY_RECEIVED')
                ) AS pending_orders,
                COALESCE(
                    SUM(po.total_amount), 0
                ) AS total_purchase_amount
            FROM purchase_orders po
            WHERE po.order_date >=
                CURRENT_DATE - (:days - 1)
              AND po.order_date <
                CURRENT_DATE + 1
              {purchase_filter}
        """),
        params
    ).mappings().one()

    # --------------------------------------------------------
    # COMPLETED WRITE-OFFS
    # --------------------------------------------------------

    write_offs = db.execute(
        text(f"""
            SELECT
                COUNT(*) AS completed_write_offs
            FROM write_offs w
            WHERE CAST(w.status AS VARCHAR)
                = 'COMPLETED'
              AND w.created_at >=
                CURRENT_DATE - (:days - 1)
              AND w.created_at <
                CURRENT_DATE + INTERVAL '1 day'
              {write_off_filter}
        """),
        params
    ).mappings().one()

    # --------------------------------------------------------
    # LOCATION COMPARISON
    # --------------------------------------------------------

    location_params = {"days": days}

    location_condition = ""

    if location_id is not None:
        location_params["location_id"] = location_id
        location_condition = """
            AND l.location_id = :location_id
        """

    locations = db.execute(
        text(f"""
            WITH sales_by_location AS (
                SELECT
                    s.location_id,
                    COUNT(*) AS sales_count,
                    COALESCE(
                        SUM(s.total_amount), 0
                    ) AS revenue
                FROM sales s
                WHERE s.sale_datetime >=
                    CURRENT_DATE - (:days - 1)
                  AND s.sale_datetime <
                    CURRENT_DATE + INTERVAL '1 day'
                  AND CAST(s.status AS VARCHAR) = 'PAID'
                GROUP BY s.location_id
            ),
            stock_by_location AS (
                SELECT
                    i.location_id,
                    COUNT(*) AS stock_records,
                    COALESCE(
                        SUM(i.quantity), 0
                    ) AS total_stock_quantity,
                    COUNT(*) FILTER (
                        WHERE i.quantity > 0
                          AND CAST(i.status AS VARCHAR)
                              = 'BLOCKED'
                    ) AS blocked_batches
                FROM inventory i
                GROUP BY i.location_id
            )
            SELECT
                l.location_id,
                l.name AS location_name,
                CAST(l.location_type AS VARCHAR)
                    AS location_type,
                COALESCE(s.sales_count, 0)
                    AS sales_count,
                COALESCE(s.revenue, 0)
                    AS revenue,
                COALESCE(st.stock_records, 0)
                    AS stock_records,
                COALESCE(st.total_stock_quantity, 0)
                    AS total_stock_quantity,
                COALESCE(st.blocked_batches, 0)
                    AS blocked_batches
            FROM locations l
            LEFT JOIN sales_by_location s
                ON s.location_id = l.location_id
            LEFT JOIN stock_by_location st
                ON st.location_id = l.location_id
            WHERE l.is_active = TRUE
              AND CAST(l.location_type AS VARCHAR)
                  IN ('PHARMACY', 'WAREHOUSE')
              {location_condition}
            ORDER BY revenue DESC, l.name
        """),
        location_params
    ).mappings().all()

    return {
        "period_days": days,
        "location_id": location_id,
        "location_name": location_name,
        "sales": dict(sales),
        "inventory": dict(inventory),
        "purchases": dict(purchases),
        "write_offs": dict(write_offs),
        "trend": [dict(row) for row in trend],
        "top_products": [
            dict(row) for row in top_products
        ],
        "locations": [
            dict(row) for row in locations
        ]
    }

# ============================================================
# 19. EMPLOYEES AND ROLES
# ============================================================

@app.get("/employees", tags=["Employees"])
def get_employees(
    search: str | None = Query(default=None),
    location_id: int | None = Query(default=None, ge=1),
    position_id: int | None = Query(default=None, ge=1),
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db)
):
    query = """
        SELECT
            e.employee_id,
            e.first_name,
            e.last_name,
            e.middle_name,
            e.phone,
            e.email,
            e.position_id,
            p.name AS position_name,
            e.department_id,
            d.name AS department_name,
            e.location_id,
            l.name AS location_name,
            e.hire_date,
            e.termination_date,
            CAST(e.employment_status AS VARCHAR)
                AS employment_status,
            e.is_active,
            ua.account_id,
            ua.username,
            COALESCE(ua.is_active, FALSE)
                AS account_is_active,
            COALESCE(
                ARRAY_AGG(r.name ORDER BY r.name)
                    FILTER (WHERE r.role_id IS NOT NULL),
                ARRAY[]::VARCHAR[]
            ) AS roles
        FROM employees e
        LEFT JOIN positions p
            ON p.position_id = e.position_id
        LEFT JOIN departments d
            ON d.department_id = e.department_id
        LEFT JOIN locations l
            ON l.location_id = e.location_id
        LEFT JOIN user_accounts ua
            ON ua.employee_id = e.employee_id
        LEFT JOIN account_roles ar
            ON ar.account_id = ua.account_id
        LEFT JOIN roles r
            ON r.role_id = ar.role_id
        WHERE 1 = 1
    """

    params = {}

    if search and search.strip():
        query += """
            AND (
                e.first_name ILIKE :search
                OR e.last_name ILIKE :search
                OR e.middle_name ILIKE :search
                OR e.email ILIKE :search
                OR ua.username ILIKE :search
            )
        """
        params["search"] = f"%{search.strip()}%"

    if location_id is not None:
        query += " AND e.location_id = :location_id"
        params["location_id"] = location_id

    if position_id is not None:
        query += " AND e.position_id = :position_id"
        params["position_id"] = position_id

    if active_only:
        query += " AND e.is_active = TRUE"

    query += """
        GROUP BY
            e.employee_id,
            e.first_name,
            e.last_name,
            e.middle_name,
            e.phone,
            e.email,
            e.position_id,
            p.name,
            e.department_id,
            d.name,
            e.location_id,
            l.name,
            e.hire_date,
            e.termination_date,
            e.employment_status,
            e.is_active,
            ua.account_id,
            ua.username,
            ua.is_active
        ORDER BY e.last_name, e.first_name, e.employee_id
    """

    rows = db.execute(
        text(query),
        params
    ).mappings().all()

    return {
        "count": len(rows),
        "employees": [dict(row) for row in rows]
    }


@app.get("/positions", tags=["Employees"])
def get_positions(
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT position_id, name, description
            FROM positions
            ORDER BY name
        """)
    ).mappings().all()

    return {
        "count": len(rows),
        "positions": [dict(row) for row in rows]
    }


@app.get("/roles", tags=["Employees"])
def get_roles(
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text("""
            SELECT role_id, name, description
            FROM roles
            ORDER BY role_id
        """)
    ).mappings().all()

    return {
        "count": len(rows),
        "roles": [dict(row) for row in rows]
    }

# ============================================================
# AUTHENTICATION — PHARMANET
# ============================================================

import os
import secrets
import hashlib
from datetime import timedelta

import bcrypt

from fastapi import (
    Request,
    Response,
    HTTPException,
    Depends,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import text


AUTH_COOKIE_NAME = "pharmanet_session"
AUTH_SESSION_DAYS = 7

# Для локального http://localhost:5173 — False.
# На HTTPS у production потрібно PHARMANET_SECURE_COOKIES=true.
AUTH_COOKIE_SECURE = (
    os.getenv("PHARMANET_SECURE_COOKIES", "false").lower()
    == "true"
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=1024)


def auth_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def load_auth_user(db, account_id: int):
    account = db.execute(
        text("""
            SELECT
                ua.account_id,
                ua.employee_id,
                ua.username,
                ua.is_active AS account_active,
                e.first_name,
                e.last_name,
                e.middle_name,
                e.position_id,
                p.name AS position_name,
                e.location_id,
                l.name AS location_name,
                e.is_active AS employee_active,
                e.employment_status::text
                    AS employment_status
            FROM user_accounts ua
            JOIN employees e
                ON e.employee_id = ua.employee_id
            LEFT JOIN positions p
                ON p.position_id = e.position_id
            LEFT JOIN locations l
                ON l.location_id = e.location_id
            WHERE ua.account_id = :account_id
        """),
        {"account_id": account_id},
    ).mappings().first()

    if account is None:
        return None

    if (
        account["account_active"] is not True
        or account["employee_active"] is not True
        or account["employment_status"] != "ACTIVE"
    ):
        return None

    role_rows = db.execute(
        text("""
            SELECT r.name
            FROM account_roles ar
            JOIN roles r ON r.role_id = ar.role_id
            WHERE ar.account_id = :account_id
            ORDER BY r.name
        """),
        {"account_id": account_id},
    ).scalars().all()

    return {
        "account_id": account["account_id"],
        "employee_id": account["employee_id"],
        "username": account["username"],
        "first_name": account["first_name"],
        "last_name": account["last_name"],
        "middle_name": account["middle_name"],
        "position_id": account["position_id"],
        "position_name": account["position_name"],
        "location_id": account["location_id"],
        "location_name": account["location_name"],
        "roles": list(role_rows),
    }


def get_current_user(
    request: Request,
    db=Depends(get_db),
):
    token = request.cookies.get(AUTH_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Необхідно увійти в систему",
        )

    session_row = db.execute(
        text("""
            SELECT account_id
            FROM auth_sessions
            WHERE token_hash = :token_hash
              AND revoked_at IS NULL
              AND expires_at > NOW()
        """),
        {"token_hash": auth_token_hash(token)},
    ).mappings().first()

    if session_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сесія недійсна або завершилась",
        )

    user = load_auth_user(
        db,
        session_row["account_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Обліковий запис неактивний",
        )

    return user


def require_roles(*allowed_roles):
    def dependency(user=Depends(get_current_user)):
        if not set(user["roles"]).intersection(
            allowed_roles
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостатньо прав доступу",
            )

        return user

    return dependency


@app.post("/auth/login", tags=["Authentication"])
def auth_login(
    credentials: LoginRequest,
    response: Response,
    db=Depends(get_db),
):
    username = credentials.username.strip()

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неправильний логін або пароль",
    )

    if not username:
        raise invalid_credentials

    account = db.execute(
        text("""
            SELECT
                account_id,
                password_hash
            FROM user_accounts
            WHERE username = :username
        """),
        {"username": username},
    ).mappings().first()

    # Той самий алгоритм перевірки для неіснуючих логінів,
    # щоб зменшити різницю в часі відповіді.
    dummy_hash = (
        b"$2b$12$C6UzMDM.H6dfI/f/IKcEe."
        b"O9R7GW7lfZTVDrSbCvNbRnbj6aEdPui"
    )

    stored_hash = (
        account["password_hash"].encode("utf-8")
        if account is not None
        else dummy_hash
    )

    try:
        password_valid = bcrypt.checkpw(
            credentials.password.encode("utf-8"),
            stored_hash,
        )
    except (ValueError, TypeError):
        password_valid = False

    if account is None or not password_valid:
        raise invalid_credentials

    user = load_auth_user(
        db,
        account["account_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Обліковий запис недоступний",
        )

    token = secrets.token_urlsafe(48)
    token_hash = auth_token_hash(token)
    duration = timedelta(days=AUTH_SESSION_DAYS)

    db.execute(
        text("""
            INSERT INTO auth_sessions (
                account_id,
                token_hash,
                expires_at
            )
            VALUES (
                :account_id,
                :token_hash,
                NOW() + INTERVAL '7 days'
            )
        """),
        {
            "account_id": user["account_id"],
            "token_hash": token_hash,
        },
    )

    db.execute(
        text("""
            UPDATE user_accounts
            SET last_login_at = NOW()
            WHERE account_id = :account_id
        """),
        {"account_id": user["account_id"]},
    )

    db.commit()

    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=int(duration.total_seconds()),
        path="/",
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite="lax",
    )

    return {
        "message": "Вхід успішний",
        "user": user,
    }


@app.get("/auth/me", tags=["Authentication"])
def auth_me(
    user=Depends(get_current_user),
):
    return user


@app.post("/auth/logout", tags=["Authentication"])
def auth_logout(
    request: Request,
    response: Response,
    db=Depends(get_db),
):
    token = request.cookies.get(AUTH_COOKIE_NAME)

    if token:
        db.execute(
            text("""
                UPDATE auth_sessions
                SET revoked_at = NOW()
                WHERE token_hash = :token_hash
                  AND revoked_at IS NULL
            """),
            {"token_hash": auth_token_hash(token)},
        )
        db.commit()

    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        secure=AUTH_COOKIE_SECURE,
        samesite="lax",
        httponly=True,
    )

    return {"message": "Вихід виконано"}

# ============================================================
# PHARMANET — GLOBAL API AUTHENTICATION
# STEP 10.8.1
# ============================================================

from fastapi import Request
from starlette.responses import JSONResponse
from sqlalchemy import text


PUBLIC_PATHS = {
    "/health",
    "/auth/login",
    "/auth/logout",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/docs/oauth2-redirect",
}


@app.middleware("http")
async def protect_business_api(
    request: Request,
    call_next,
):
    path = request.url.path

    # Allow preflight requests for CORS.
    if request.method == "OPTIONS":
        return await call_next(request)

    # Public endpoints.
    if path in PUBLIC_PATHS:
        return await call_next(request)

    # Validate session cookie.
    token = request.cookies.get(AUTH_COOKIE_NAME)

    if not token:
        return JSONResponse(
            status_code=401,
            content={
                "detail": "Необхідно увійти в систему"
            },
        )

    # Reuse existing SQLAlchemy connection dependency.
    db_generator = get_db()

    try:
        db = next(db_generator)

        session = db.execute(
            text("""
                SELECT
                    ua.account_id,
                    ua.employee_id
                FROM auth_sessions s

                JOIN user_accounts ua
                    ON ua.account_id = s.account_id

                JOIN employees e
                    ON e.employee_id = ua.employee_id

                WHERE s.token_hash = :token_hash
                  AND s.revoked_at IS NULL
                  AND s.expires_at > NOW()
                  AND ua.is_active = TRUE
                  AND e.is_active = TRUE
                  AND e.employment_status = 'ACTIVE'
                LIMIT 1
            """),
            {
                "token_hash": auth_token_hash(token)
            },
        ).mappings().first()

    finally:
        db_generator.close()

    if session is None:
        return JSONResponse(
            status_code=401,
            content={
                "detail": (
                    "Сесія недійсна або завершилася"
                )
            },
        )

    # RBAC: deny by default, including routes introduced in the future.
    method = request.method
    all_roles = {
        "PHARMACIST", "PHARMACY_MANAGER", "WAREHOUSE_WORKER",
        "PURCHASING_MANAGER", "NETWORK_MANAGER", "SYSTEM_ADMIN",
    }
    sales_roles = {"PHARMACIST", "PHARMACY_MANAGER", "SYSTEM_ADMIN"}
    purchasing_roles = {"PURCHASING_MANAGER", "NETWORK_MANAGER", "SYSTEM_ADMIN"}
    transfer_roles = {"WAREHOUSE_WORKER", "PHARMACY_MANAGER", "SYSTEM_ADMIN"}
    writeoff_roles = {
        "PHARMACIST", "PHARMACY_MANAGER", "WAREHOUSE_WORKER", "SYSTEM_ADMIN",
    }
    stock_control_roles = {"PHARMACY_MANAGER", "WAREHOUSE_WORKER", "SYSTEM_ADMIN"}
    staff_roles = {"NETWORK_MANAGER", "SYSTEM_ADMIN"}
    analytics_roles = {"PHARMACY_MANAGER", "NETWORK_MANAGER", "SYSTEM_ADMIN"}

    allowed_roles = set()

    if method == "GET" and path == "/auth/me":
        allowed_roles = all_roles
    elif method == "GET" and path in {"/", "/db-check"}:
        allowed_roles = {"SYSTEM_ADMIN"}
    elif method == "GET" and (
        path in {"/products", "/locations"}
        or re.fullmatch(r"/products/\d+", path)
    ):
        allowed_roles = all_roles
    elif method == "GET" and path in {"/inventory", "/inventory/expiry-alerts"}:
        allowed_roles = all_roles
    elif method == "POST" and re.fullmatch(r"/inventory/\d+/(block|unblock)", path):
        allowed_roles = stock_control_roles
    elif path == "/sales" and method in {"GET", "POST"}:
        allowed_roles = sales_roles
    elif method == "GET" and path == "/suppliers":
        allowed_roles = purchasing_roles
    elif path == "/purchase-orders" and method in {"GET", "POST"}:
        allowed_roles = purchasing_roles
    elif method == "GET" and re.fullmatch(r"/purchase-orders/\d+", path):
        allowed_roles = purchasing_roles
    elif method == "POST" and re.fullmatch(r"/purchase-orders/\d+/(submit|receive)", path):
        allowed_roles = purchasing_roles
    elif method == "GET" and path in {"/transfers", "/transfers/available-stock"}:
        allowed_roles = transfer_roles
    elif method == "GET" and re.fullmatch(r"/transfers/\d+", path):
        allowed_roles = transfer_roles
    elif method == "POST" and (
        path == "/transfers" or re.fullmatch(r"/transfers/\d+/confirm", path)
    ):
        allowed_roles = transfer_roles
    elif method == "GET" and path in {"/write-offs", "/write-offs/available-stock"}:
        allowed_roles = writeoff_roles
    elif method == "GET" and re.fullmatch(r"/write-offs/\d+", path):
        allowed_roles = writeoff_roles
    elif method == "POST" and (
        path == "/write-offs"
        or re.fullmatch(r"/write-offs/\d+/(approve|complete|cancel)", path)
    ):
        allowed_roles = writeoff_roles
    elif method == "GET" and path in {
        "/dashboard/summary", "/dashboard/sales-trend", "/dashboard/top-products",
        "/dashboard/locations", "/dashboard/report",
    }:
        allowed_roles = analytics_roles
    elif method == "GET" and path in {"/employees", "/positions", "/roles"}:
        allowed_roles = staff_roles

    # Never rely on roles sent by the browser.
    roles_generator = get_db()
    try:
        roles_db = next(roles_generator)
        current_roles = set(roles_db.execute(
            text("""
                SELECT r.name
                FROM account_roles ar
                JOIN roles r ON r.role_id = ar.role_id
                WHERE ar.account_id = :account_id
            """),
            {"account_id": session["account_id"]},
        ).scalars().all())
    finally:
        roles_generator.close()

    if not (current_roles & allowed_roles):
        return JSONResponse(
            status_code=403,
            content={"detail": "Недостатньо прав доступу"},
        )

    request.state.account_id = session["account_id"]
    request.state.employee_id = session["employee_id"]
    request.state.roles = list(current_roles)

    return await call_next(request)

