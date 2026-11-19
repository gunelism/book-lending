# syntax=docker/dockerfile:1
# Build context is the repository root (npm workspaces share one lockfile).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace apps/api --no-audit --no-fund

FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace apps/api

# ---- e2e test runner (docker compose --profile test run --rm api-test) ----
FROM build AS test
# Fonts are needed by sharp to render text in generated images.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
ENV NODE_ENV=test
CMD ["sh", "-c", "node dist/database/run-migrations.js && npx jest && npx jest --config ./test/jest-e2e.json --runInBand"]

# ---- production image ----
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace apps/api --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
# The image runs as the unprivileged "node" user: make the app readable (files) and enterable (folders)
# even when the checkout had owner-only permissions (e.g. 600 on a Mac). An explicit chmod, because
# COPY --chmod also changes the folders it creates on some BuildKit versions (a 644 folder can't be entered).
RUN chmod -R a+rX /app/package.json /app/package-lock.json /app/apps
WORKDIR /app/apps/api
# Never run as root.
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/seed/seed.js --if-empty && node dist/main.js"]
