FROM node:22-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
RUN pip install --no-cache-dir -r /srv/backend/requirements-render.txt
FROM python:3.12-slim AS app
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements-render.txt /srv/requirements-render.txt
RUN pip install --no-cache-dir -r /srv/requirements-render.txt
COPY backend/app/ /srv/backend/app/
# The deployment-specific adapter uses Render's DATABASE_URL without changing your local database.py.
COPY backend/app/database_render.py /srv/backend/app/database.py
COPY backend/app/serve.py /srv/backend/app/serve.py
COPY --from=frontend-builder /build/frontend/dist/ /srv/frontend/dist/
ENV PYTHONPATH=/srv/backend
EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.serve:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"]
