"""One-time database bootstrap. Run locally with Render EXTERNAL database URL.
Do not run it against databases with real records.
"""
import argparse
import os
from pathlib import Path
import psycopg2

parser = argparse.ArgumentParser()
parser.add_argument("--yes", action="store_true", help="I confirm this is a NEW empty DEMO database")
args = parser.parse_args()
if not args.yes:
    parser.error("Pass --yes after checking DATABASE_URL points to a new empty demo database")
url = os.getenv("DATABASE_URL")
if not url:
    parser.error("DATABASE_URL env var is missing")
root = Path(__file__).resolve().parents[1]
with psycopg2.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.user_accounts')")
        if cur.fetchone()[0] is not None:
            raise SystemExit("Database already initialized; nothing changed")
        for filename in ("01_create_tables.sql", "02_seed_data.sql"):
            print("Applying", filename, flush=True)
            cur.execute((root / "database" / filename).read_text(encoding="utf-8-sig"))
        print("Creating sale_requests and auth_sessions...", flush=True)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sale_requests (
              request_key UUID PRIMARY KEY,
              request_hash VARCHAR(64) NOT NULL,
              sale_id INTEGER REFERENCES sales(sale_id),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
              session_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              account_id INTEGER NOT NULL REFERENCES user_accounts(account_id) ON DELETE CASCADE,
              token_hash CHAR(64) NOT NULL UNIQUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              expires_at TIMESTAMPTZ NOT NULL,
              revoked_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_account ON auth_sessions(account_id);
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
        """)
print("Demo schema and seed loaded. Rotate/remove default public demo passwords before publishing.")
