# syntax=docker/dockerfile:1
# API (Express) — build com esbuild (→ dist/index.mjs), runtime Node 24.
# Imagem glibc (Debian "bookworm-slim"), NÃO alpine: o pnpm-workspace.yaml
# exclui os binários musl (rollup/lightningcss/@tailwindcss/oxide) e mantém
# apenas linux-x64 glibc. Em alpine o build/runtime quebraria.
#
# O renderizador de arte social usa Playwright (Chromium headless) para gerar
# as imagens 1080×N a partir do HTML do template. Por isso o Chromium é baixado
# no build (em /ms-playwright, caminho fixo) e copiado para o runtime, onde
# instalamos as dependências de SO + fontes de fallback/emoji.

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY . .
RUN pnpm install --frozen-lockfile
# Baixa o Chromium do Playwright para o caminho fixo (carregado p/ o runtime).
RUN pnpm --filter @workspace/api-server exec playwright install chromium
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
