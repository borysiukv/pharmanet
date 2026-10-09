
# ==========================================
# STAGE 1 — BUILD REACT FRONTEND
# ==========================================

FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package*.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build


# ==========================================
# STAGE 2 — FASTAPI + REACT
# ==========================================

FROM python:3.12-slim AS app

WORKDIR /srv

COPY backend/requirements-render.txt /srv/backend/requirements-render.txt

RUN pip install --no-cache-dir -r /srv/backend/requirements-render.txt

COPY backend/ /srv/backend/

COPY --from=frontend-builder /app/dist /srv/frontend/dist

ENV PYTHONPATH=/srv/backend
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PHARMANET_SECURE_COOKIES=true

EXPOSE 10000

CMD ["sh", "-c", "uvicorn app.serve:app --app-dir /srv/backend --host 0.0.0.0 --port ${PORT:-10000}"]
