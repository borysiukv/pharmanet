"""Disable seed users except six demo accounts; set strong random passwords.
Run once before sharing the site URL. Credentials are shown only in this terminal.
"""
import os
import secrets
import bcrypt
import psycopg2

allowed = ["sysadmin", "pharmacist01", "manager01", "warehouse01", "purchasing01", "network01"]
url = os.environ.get("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL is missing")

with psycopg2.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("UPDATE user_accounts SET is_active = FALSE")
        cur.execute("UPDATE auth_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL")
        print("NEW DEMO CREDENTIALS (store privately; never commit):", flush=True)
        for username in allowed:
            password = secrets.token_urlsafe(18)
            hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
            cur.execute("UPDATE user_accounts SET password_hash=%s, is_active=TRUE WHERE username=%s RETURNING account_id", (hashed, username))
            if cur.fetchone() is None:
                raise RuntimeError(f"Missing seeded demo account: {username}")
            print(f"{username}: {password}", flush=True)
print("Only six demo accounts enabled. Save credentials securely.")
