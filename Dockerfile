# syntax=docker/dockerfile:1

# ---- build stage ----------------------------------------------------------
FROM node:26-bookworm-slim AS build
WORKDIR /app

# Toolchain for compiling better-sqlite3's native addon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Install deps, then approve native build scripts (better-sqlite3, esbuild)
# non-interactively so the SQLite addon is compiled.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile && pnpm approve-builds --all

COPY . .
RUN pnpm build
# Drop dev dependencies but keep the compiled native modules.
RUN pnpm prune --prod

# ---- runtime stage --------------------------------------------------------
FROM node:26-bookworm-slim AS runtime
WORKDIR /app

# Stamp the build commit (passed by CI as --build-arg GIT_SHA=<sha>); surfaced at
# GET /health so a deploy can be confirmed against the shipped commit.
ARG GIT_SHA=dev

ENV NODE_ENV=production \
    PORT=3000 \
    GIT_SHA=${GIT_SHA} \
    DATABASE_PATH=/data/artefactor.db \
    ARTEFACTOR_PAYLOAD_DIR=/data/payloads \
    CLIENT_DIR=/app/dist/client \
    MIGRATIONS_DIR=/app/migrations

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/infra/db/migrations ./migrations
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# SQLite DB file and artefact payloads must live on a persistent volume (Coolify).
VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
