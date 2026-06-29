# syntax=docker/dockerfile:1
# API (Express) — build com esbuild (→ dist/index.mjs), runtime Node 24.
# Imagem glibc (Debian "bookworm-slim"), NÃO alpine: o pnpm-workspace.yaml
# exclui os binários musl (rollup/lightningcss/@tailwindcss/oxide) e mantém
# apenas linux-x64 glibc. Em alpine o build/runtime quebraria.
#
# O renderizador de arte social usa Playwright (Chromium headless) para gerar
# as imagens 1080×N a partir do HTML do template. O Chromium é baixado no build
# (em /ms-playwright) e copiado para o runtime, onde instalamos as dependências
# de SO + fontes de fallback.
#
# Cache de camadas: copiamos só os manifestos (package.json/lockfile) ANTES do
# `pnpm install` + `playwright install`. Assim, mudanças apenas de código não
# reinstalam dependências nem re-baixam o Chromium (~113 MB).

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1) Só os manifestos do workspace (camada cacheável).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY artifacts/api-server/package.json     artifacts/api-server/
COPY artifacts/brasilia-agora/package.json artifacts/brasilia-agora/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json     lib/api-client-react/
COPY lib/api-spec/package.json             lib/api-spec/
COPY lib/api-zod/package.json              lib/api-zod/
COPY lib/db/package.json                   lib/db/
COPY lib/social-template/package.json      lib/social-template/
COPY scripts/package.json                  scripts/

# 2) Dependências + Chromium (cacheado enquanto os manifestos não mudarem).
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server exec playwright install chromium

# 3) Código-fonte + build (só esta parte re-roda quando o código muda).
COPY . .
RUN pnpm --filter @workspace/api-server run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
# Copia o workspace já buildado (inclui node_modules com sharp/playwright e os
# pacotes externalizados pelo esbuild, resolvidos via symlinks do pnpm).
COPY --from=build /app /app
# Copia o binário do Chromium baixado no build.
COPY --from=build /ms-playwright /ms-playwright
# Dependências de SO do Chromium + fontes (fallback e emoji).
RUN apt-get update \
  && cd /app/artifacts/api-server \
  && npx --no-install playwright install-deps chromium \
  && apt-get install -y --no-install-recommends fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/artifacts/api-server
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
