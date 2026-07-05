# syntax=docker/dockerfile:1
# API do Painel Central (Express) — build com esbuild (→ dist/index.mjs).
# Imagem glibc/x86_64 (não alpine), mesmo padrão do api-server do blog.

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app

# 1) Manifests primeiro (camada cacheável)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY artifacts/api-server/package.json     artifacts/api-server/
COPY artifacts/brasilia-agora/package.json artifacts/brasilia-agora/
COPY artifacts/central-hub/package.json    artifacts/central-hub/
COPY artifacts/central-web/package.json    artifacts/central-web/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json     lib/api-client-react/
COPY lib/api-spec/package.json             lib/api-spec/
COPY lib/api-zod/package.json              lib/api-zod/
COPY lib/central-db/package.json           lib/central-db/
COPY lib/db/package.json                   lib/db/
COPY lib/news-engine/package.json          lib/news-engine/
COPY lib/social-template/package.json      lib/social-template/
COPY scripts/package.json                  scripts/

RUN pnpm install --frozen-lockfile

# 2) Código + build
COPY . .
RUN pnpm --filter @workspace/central-hub run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8090
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/artifacts/central-hub
EXPOSE 8090
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
