# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# base: pinned pnpm via corepack (version must match `packageManager` in package.json)
# ---------------------------------------------------------------------------
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: full install (dev deps included) for building. Only manifests are copied so the
# layer is reused across source edits. --ignore-scripts skips lefthook's git-hook install.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# build: bundle the widget (vite, single HTML file) and compile the server (tsc)
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.server.json vite.config.ts mcp-app.html ./
COPY src ./src
RUN pnpm build

# ---------------------------------------------------------------------------
# prod-deps: production-only node_modules for the runtime image
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prod

# ---------------------------------------------------------------------------
# runtime: non-root, only what `node dist/server/main.js` needs
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    PORT=8765
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 8765

# node:alpine ships no curl; probe /healthz with node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8765)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/main.js"]
