"""Customer pickup reservation, staff list/cancel and quick sales catalog.

Requires database/03_reservation_allocations.sql. Customer contact data is not
exposed by public GET routes. Reservations are unpaid, expire after 30 minutes,
and block sale quantities through inventory.reserved_quantity.
"""
from datetime import timedelta
import re
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db

router = APIRouter()

class BookRequest(BaseModel):
    product_id: int = Field(gt=0)
    location_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=10)
    first_name: str = Field(min_length=2, max_length=50)
    last_name: str = Field(min_length=2, max_length=50)
    phone: str = Field(min_length=7, max_length=30)


def expire_old(db: Session):
    """Release stock for expired pickups; caller controls transaction."""
    expired = db.execute(text("""
        SELECT reservation_id FROM reservations
        WHERE status IN ('CREATED','CONFIRMED','READY')
          AND expiry_date <= CURRENT_TIMESTAMP
        ORDER BY reservation_id FOR UPDATE SKIP LOCKED
    """)).scalars().all()
    for reservation_id in expired:
        alloc = db.execute(text("""
            SELECT inventory_id, quantity FROM reservation_allocations
            WHERE reservation_id = :id ORDER BY inventory_id
        """), {"id": reservation_id}).mappings().all()
        for a in alloc:
            db.execute(text("""
                UPDATE inventory SET reserved_quantity = reserved_quantity - :qty,
                    updated_at = CURRENT_TIMESTAMP
                WHERE inventory_id = :id AND reserved_quantity >= :qty
            """), {"id": a['inventory_id'], "qty": a['quantity']})
        db.execute(text("""
            UPDATE reservations SET status = 'EXPIRED' WHERE reservation_id = :id
        """), {"id": reservation_id})


@router.get('/sales/catalog', tags=['Sales'])
def sales_catalog(
    location_id: int = Query(gt=0),
    search: str = Query(default='', max_length=100),
    limit: int = Query(default=60, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """A single SQL query for current pharmacy prices and sellable stock."""
    try:
        expire_old(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    rows = db.execute(text("""
        SELECT p.product_id, p.name, p.barcode, p.sku,
               COALESCE(m.prescription_required,FALSE) AS prescription_required,
               pr.price,
               COALESCE(st.available, 0) AS available
        FROM products p
        LEFT JOIN medicines m ON m.product_id = p.product_id
        LEFT JOIN LATERAL (
            SELECT pp.price FROM product_prices pp
            WHERE pp.product_id = p.product_id AND pp.location_id = :loc
              AND pp.is_active = TRUE AND pp.valid_from <= CURRENT_DATE
              AND (pp.valid_to IS NULL OR pp.valid_to >= CURRENT_DATE)
            ORDER BY pp.valid_from DESC, pp.price_id DESC LIMIT 1
        ) pr ON TRUE
        LEFT JOIN LATERAL (
            SELECT SUM(GREATEST(i.quantity-i.reserved_quantity,0)) AS available
            FROM inventory i JOIN batches b ON b.batch_id = i.batch_id
            WHERE i.location_id = :loc AND b.product_id = p.product_id
              AND i.status = 'AVAILABLE'
              AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
        ) st ON TRUE
        WHERE p.is_active = TRUE
          AND (:term = '' OR p.name ILIKE :pattern OR p.barcode ILIKE :pattern OR p.sku ILIKE :pattern)
        ORDER BY CASE WHEN LOWER(p.name) LIKE LOWER(:prefix) THEN 0 ELSE 1 END,
                 p.name, p.product_id
        LIMIT :lim
    """), {'loc': location_id, 'term': search.strip(), 'pattern': f'%{search.strip()}%',
           'prefix': f'{search.strip()}%', 'lim': limit}).mappings().all()
    return {'products': [dict(r) for r in rows]}


@router.post('/public/reservations', tags=['Customer catalog'], status_code=201)
def create_reservation(data: BookRequest, db: Session = Depends(get_db)):
    phone = re.sub(r'[\s()\-]', '', data.phone.strip())
    if not re.fullmatch(r'\+?[0-9]{7,15}', phone):
        raise HTTPException(422, 'Укажіть коректний номер телефону')
    try:
        expire_old(db)
        pharmacy = db.execute(text("""
            SELECT location_id, name FROM locations
            WHERE location_id=:loc AND is_active=TRUE AND location_type='PHARMACY'
        """), {'loc':data.location_id}).mappings().first()
        if not pharmacy:
            raise HTTPException(404, 'Аптеку не знайдено')
        product = db.execute(text("""
            SELECT p.name, COALESCE(m.prescription_required,FALSE) AS rx
            FROM products p LEFT JOIN medicines m ON m.product_id=p.product_id
            WHERE p.product_id=:id AND p.is_active=TRUE
        """), {'id': data.product_id}).mappings().first()
        if not product:
            raise HTTPException(404, 'Товар недоступний')
        if product['rx']:
            raise HTTPException(400, 'Онлайн-бронювання рецептурних препаратів недоступне')
        price = db.execute(text("""
            SELECT price FROM product_prices
            WHERE product_id=:pid AND location_id=:loc AND is_active=TRUE
              AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE)
            ORDER BY valid_from DESC, price_id DESC LIMIT 1
        """), {'pid':data.product_id, 'loc':data.location_id}).scalar_one_or_none()
        if price is None:
            raise HTTPException(400, 'Для цього товару немає чинної ціни в аптеці')
        stock = db.execute(text("""
            SELECT i.inventory_id, i.quantity, i.reserved_quantity
            FROM inventory i JOIN batches b ON b.batch_id=i.batch_id
            WHERE i.location_id=:loc AND b.product_id=:pid AND i.status='AVAILABLE'
              AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE)
            ORDER BY b.expiry_date NULLS LAST, i.inventory_id FOR UPDATE OF i
        """), {'loc':data.location_id,'pid':data.product_id}).mappings().all()
        remaining = Decimal(data.quantity)
        allocations = []
        for row in stock:
            available = max(Decimal('0'), Decimal(row['quantity']) - Decimal(row['reserved_quantity']))
            take = min(remaining, available)
            if take:
                allocations.append((row['inventory_id'], take))
                remaining -= take
            if remaining == 0: break
        if remaining:
            raise HTTPException(409, 'Недостатньо вільного залишку. Виберіть меншу кількість або іншу аптеку.')
        active_for_phone = db.execute(text("""
            SELECT COUNT(*) FROM reservations r JOIN customers c ON c.customer_id=r.customer_id
            WHERE c.phone=:phone AND r.status IN ('CREATED','CONFIRMED','READY')
              AND r.expiry_date>CURRENT_TIMESTAMP
        """), {'phone':phone}).scalar_one()
        if active_for_phone >= 3:
            raise HTTPException(429, 'Не більше трьох активних бронювань на один номер')
        customer_id = db.execute(text("""
            INSERT INTO customers (first_name,last_name,phone,is_active)
            VALUES (:first,:last,:phone,TRUE)
            ON CONFLICT (phone) DO UPDATE SET phone=EXCLUDED.phone
            RETURNING customer_id
        """), {'first':data.first_name.strip(), 'last':data.last_name.strip(), 'phone':phone}).scalar_one()
        reservation = db.execute(text("""
            INSERT INTO reservations (customer_id,location_id,reservation_date,expiry_date,status)
            VALUES (:customer,:loc,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '30 minutes','CONFIRMED')
            RETURNING reservation_id, expiry_date
        """), {'customer':customer_id,'loc':data.location_id}).mappings().one()
        db.execute(text("""
            INSERT INTO reservation_items (reservation_id,product_id,quantity)
            VALUES (:id,:pid,:qty)
        """), {'id':reservation['reservation_id'],'pid':data.product_id,'qty':data.quantity})
        for inv_id, take in allocations:
            result = db.execute(text("""
                UPDATE inventory SET reserved_quantity=reserved_quantity+:qty,
                    updated_at=CURRENT_TIMESTAMP
                WHERE inventory_id=:id AND quantity-reserved_quantity>=:qty
                RETURNING inventory_id
            """), {'id':inv_id,'qty':take}).first()
            if result is None:
                raise HTTPException(409, 'Залишки змінилися, повторіть спробу')
            db.execute(text("""
                INSERT INTO reservation_allocations (reservation_id,inventory_id,quantity)
                VALUES (:rid,:inv,:qty)
            """), {'rid':reservation['reservation_id'],'inv':inv_id,'qty':take})
        db.commit()
        return {
            'reservation_id':reservation['reservation_id'],
            'location_name':pharmacy['name'], 'product_name':product['name'],
            'quantity':data.quantity, 'price':float(price),
            'expires_at':reservation['expiry_date'].isoformat(),
            'message':'Товар заброньовано на 30 хвилин. Оплата й видача відбуваються в аптеці.',
        }
    except Exception:
        db.rollback()
        raise


@router.get('/reservations', tags=['Reservations'])
def staff_reservations(request: Request, db: Session=Depends(get_db)):
    try:
        expire_old(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    admin = 'SYSTEM_ADMIN' in request.state.roles
    location_id = db.execute(text('SELECT location_id FROM employees WHERE employee_id=:eid'),
        {'eid':request.state.employee_id}).scalar_one_or_none()
    if not admin and not location_id:
        raise HTTPException(403, 'Немає прив’язки до аптеки')
    where = '' if admin else 'WHERE r.location_id=:location_id'
    params = {} if admin else {'location_id':location_id}
    rows = db.execute(text(f"""
        SELECT r.reservation_id, r.location_id, l.name AS location_name,
               c.first_name, c.last_name, c.phone,
               r.reservation_date, r.expiry_date, CAST(r.status AS VARCHAR) AS status,
               p.name AS product_name, ri.quantity
        FROM reservations r
        JOIN customers c ON c.customer_id=r.customer_id
        JOIN locations l ON l.location_id=r.location_id
        JOIN reservation_items ri ON ri.reservation_id=r.reservation_id
        JOIN products p ON p.product_id=ri.product_id
        {where}
        ORDER BY r.reservation_date DESC LIMIT 100
    """),params).mappings().all()
    return {'reservations':[dict(r) for r in rows]}


@router.post('/reservations/{reservation_id}/cancel', tags=['Reservations'])
def cancel_reservation(reservation_id:int, request: Request, db:Session=Depends(get_db)):
    try:
        row = db.execute(text("""
            SELECT reservation_id, location_id, CAST(status AS VARCHAR) AS status
            FROM reservations WHERE reservation_id=:id FOR UPDATE
        """),{'id':reservation_id}).mappings().first()
        if not row:
            raise HTTPException(404,'Бронювання не знайдено')
        roles=set(request.state.roles)
        if 'SYSTEM_ADMIN' not in roles:
            loc=db.execute(text('SELECT location_id FROM employees WHERE employee_id=:id'),
                {'id':request.state.employee_id}).scalar_one_or_none()
            if loc != row['location_id']:
                raise HTTPException(403,'Інша аптека')
        if row['status'] not in ('CREATED','CONFIRMED','READY'):
            raise HTTPException(409,'Це бронювання вже закрите')
        for a in db.execute(text('''
            SELECT inventory_id, quantity FROM reservation_allocations
            WHERE reservation_id=:id ORDER BY inventory_id
        '''),{'id':reservation_id}).mappings().all():
            db.execute(text('''
                UPDATE inventory SET reserved_quantity=reserved_quantity-:qty,
                    updated_at=CURRENT_TIMESTAMP
                WHERE inventory_id=:id AND reserved_quantity>=:qty
            '''),{'qty':a['quantity'],'id':a['inventory_id']})
        db.execute(text("UPDATE reservations SET status='CANCELLED' WHERE reservation_id=:id"),{'id':reservation_id})
        db.commit()
        return {'status':'CANCELLED','reservation_id':reservation_id}
    except Exception:
        db.rollback()
        raise
