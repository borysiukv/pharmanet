"""Render-only database adapter: Dockerfile installs as app/database.py.
Does not replace the developer's local database.py on Windows.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

url = os.environ.get("DATABASE_URL")
if not url:
    raise RuntimeError("DATABASE_URL must be set in Render")
if url.startswith("postgres://"):
    url = "postgresql://" + url[len("postgres://"):]
engine = create_engine(url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
