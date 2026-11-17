# syntax=docker/dockerfile:1
# Build context is the repository root.

FROM node:22-bookworm-slim AS admin
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace apps/admin --no-audit --no-fund
COPY apps/admin apps/admin
RUN npm run build --workspace apps/admin

FROM caddy:2-alpine
COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=admin /app/apps/admin/dist /srv
