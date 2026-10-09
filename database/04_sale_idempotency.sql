
-- =====================================================
-- PHARMANET
-- SALE IDEMPOTENCY
-- Prevent accidental duplicate sales
-- =====================================================

CREATE TABLE IF NOT EXISTS sale_requests (
    request_key UUID PRIMARY KEY,

    sale_id INTEGER UNIQUE,

    request_hash VARCHAR(64) NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sale_requests_sale
        FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_requests_created_at
ON sale_requests(created_at);

COMMENT ON TABLE sale_requests IS
'Stores idempotency keys for sale requests';
