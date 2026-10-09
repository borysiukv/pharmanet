
"""
PharmaNet — Render deployment.

Routes:
    /api/health  -> public Render health check
    /api/*       -> existing FastAPI backend
    /*           -> React/Vite frontend
"""

import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles

from app.main import app as api_app


# =====================================================
# MAIN APPLICATION — CREATE ONLY ONCE
# =====================================================

app = FastAPI(
    title="PharmaNet",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


# =====================================================
# PUBLIC HEALTH CHECK
# =====================================================

@app.get("/api/health", include_in_schema=False)
def render_health():
    return {
        "status": "ok",
        "service": "pharmanet",
    }


# =====================================================
# SAME-ORIGIN CHECK FOR WRITE REQUESTS
# =====================================================

@app.middleware("http")
async def same_origin_for_writes(
    request: Request,
    call_next,
):
    if (
        request.url.path.startswith("/api/")
        and request.method in {
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        }
    ):
        hostname = os.getenv(
            "RENDER_EXTERNAL_HOSTNAME",
            "",
        )

        if hostname:
            origin = request.headers.get("origin")
            parsed = urlsplit(origin or "")

            if (
                parsed.scheme != "https"
                or parsed.netloc != hostname
            ):
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": (
                            "Запит з іншого сайту заборонено"
                        )
                    },
                )

    return await call_next(request)


# =====================================================
# FASTAPI BACKEND
# =====================================================

# Keep this after the public health route and
# before mounting the React frontend.

app.mount("/api", api_app)


# =====================================================
# REACT FRONTEND
# =====================================================

FRONTEND_DIST = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "dist"
)

app.mount(
    "/",
    StaticFiles(
        directory=str(FRONTEND_DIST),
        html=True,
    ),
    name="frontend",
)

