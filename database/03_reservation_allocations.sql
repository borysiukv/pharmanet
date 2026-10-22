-- Run once against the existing PharmaNet database (do not re-run 01_create_tables.sql).
-- Existing schema must contain reservations, reservation_items, inventory and the reservation_status_enum.
CREATE TABLE IF NOT EXISTS reservation_allocations (
    reservation_allocation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(reservation_id) ON DELETE CASCADE,
    inventory_id INTEGER NOT NULL REFERENCES inventory(inventory_id),
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    UNIQUE (reservation_id, inventory_id)
);
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON reservations(status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_reservation_allocations_inventory ON reservation_allocations(inventory_id);
