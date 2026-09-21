# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# base: pinned pnpm via corepack (version must match `packageManager` in package.json), target platform
# build-base: the same, on the machine running the build. The build output (widget HTML, server JS, Storybook)
# is platform-independent, so the build stages run natively instead of under QEMU for the arm64 image.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

FROM --platform=$BUILDPLATFORM node:24-alpine AS build-base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: full install (dev deps included) for building. Only manifests are copied so the
# layer is reused across source edits. --ignore-scripts skips lefthook's git-hook install.
# ---------------------------------------------------------------------------
FROM build-base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# build: bundle the widget (vite, single HTML file), compile the server (tsc) and build the Storybook component
# gallery that the server serves at / (see src/server/http.ts)
# ---------------------------------------------------------------------------
FROM deps AS build
# Release builds pass the tag's version (release.yml); vite.config.ts bakes it into the widget, falling back to
# package.json when empty (local and CI builds).
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION
COPY tsconfig.json tsconfig.server.json vite.config.ts mcp-app.html ./
COPY .storybook ./.storybook
COPY src ./src
RUN pnpm build
RUN STORYBOOK_DISABLE_TELEMETRY=1 pnpm build-storybook

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
# Same version the widget was built with; the server reports it as its MCP serverInfo.version (empty = package.json).
ARG APP_VERSION=
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    PORT=8765
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/storybook-static ./storybook-static
COPY --chown=node:node package.json ./

USER node
EXPOSE 8765

# node:alpine ships no curl; probe /healthz with node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8765)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/main.js"]
