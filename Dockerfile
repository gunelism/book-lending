# syntax=docker/dockerfile:1
# One-container image for platforms that run a single web service and terminate HTTPS themselves
# (Render, see render.yaml). The API serves the admin too (ADMIN_DIR), so no Caddy is needed.
# docker compose does NOT use this file: it builds apps/api/Dockerfile and docker/caddy/Dockerfile.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace apps/api --workspace apps/admin --no-audit --no-fund

FROM deps AS build
COPY apps/api apps/api
COPY apps/admin apps/admin
RUN npm run build --workspace apps/api && npm run build --workspace apps/admin

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# --chmod: the image runs as the unprivileged "node" user, so files must be world-readable even when
# the checkout has owner-only permissions (e.g. 600 on a Mac); otherwise npm can't read package.json.
COPY --chmod=644 package.json package-lock.json ./
COPY --chmod=644 apps/api/package.json apps/api/
COPY --chmod=644 apps/admin/package.json apps/admin/
RUN npm ci --workspace apps/api --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build --chmod=755 /app/apps/admin/dist /app/admin
ENV ADMIN_DIR=/app/admin
WORKDIR /app/apps/api
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
# Migrations, a first-start seed only if the database is empty, then the API (PORT comes from the platform).
CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/seed/seed.js --if-empty && node dist/main.js"]
