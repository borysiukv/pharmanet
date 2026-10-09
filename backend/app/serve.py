"""One-domain app: /api/* -> existing FastAPI, /* -> Vite bundle."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import FastAPI, Request
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from app.main import app as api_app

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware("http")
async def same_origin_for_writes(request: Request, call_next):
    # Browser writes must originate from this Render site. This is a demo
    # mitigation, not a full token-based CSRF design.
    if request.url.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        hostname = os.getenv("RENDER_EXTERNAL_HOSTNAME", "")
        if hostname:
            origin = request.headers.get("origin")
            parsed = urlsplit(origin or "")
            if parsed.scheme != "https" or parsed.netloc != hostname:
                return JSONResponse({"detail": "Запит з іншого сайту заборонено"}, status_code=403)
    return await call_next(request)

app.mount("/api", api_app)
app.mount("/", StaticFiles(directory=str(Path(__file__).resolve().parents[2] / "frontend" / "dist"), html=True), name="frontend")
