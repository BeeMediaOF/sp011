# syntax=docker/dockerfile:1
# Frontend (React/Vite) — build estático (→ dist/public) e execução via
# `vite preview`, necessário para o prerender de Open Graph (preview de links
# no WhatsApp/Facebook). Imagem glibc/x86_64 (não alpine).

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app

# 1) Só os manifestos do workspace (camada cacheável). Mesmo padrão do
#    Dockerfile do api-server (107134a): com `COPY . .` antes do install, QUALQUER
#    mudança de código invalidava a camada e o monorepo inteiro era reinstalado a
#    cada build (61 s medidos na VPS em 2026-07-28).
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

# 2) Dependências (cacheado enquanto os manifestos não mudarem).
RUN pnpm install --frozen-lockfile

# 3) Código-fonte + build (só esta parte re-roda quando o código muda).
#    PORT e BASE_PATH são exigidos pelo vite.config.ts já no build.
COPY . .
RUN BASE_PATH=/ PORT=3000 API_URL=http://api:8080 \
    pnpm --filter @workspace/sbc-agora run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/
ENV API_URL=http://api:8080
# Fuso do Brasil para que as datas formatadas no SSR (servidor) batam com o
# cliente (pt-BR) e não gerem mismatch de hidratação.
ENV TZ=America/Sao_Paulo
RUN npm install -g pnpm@10.15.1
WORKDIR /app
# PRD-07: non-root (uid 1000). Serve estático via vite preview, sem volume.
# O dono vem embutido na própria cópia: um `RUN chown -R /app` depois toca todos
# os arquivos e, no overlayfs, DUPLICA o /app inteiro numa camada nova — media
# 650 s dos 827 s do build na VPS (2026-07-28) e inflava a imagem para 2,47 GB.
# `--link` cria a camada sem depender do estado do sistema de arquivos anterior:
# ela nao precisa ser rebaseada e pode ser construida em paralelo com o stage de
# build. O `--chown` vai NUMERICO por causa dele: sem depender da imagem base,
# nao ha /etc/passwd para resolver o nome "node" -- 1000:1000 e o mesmo uid do
# `USER node` abaixo.
COPY --from=build --link --chown=1000:1000 /app /app
WORKDIR /app/artifacts/brasilia-agora
EXPOSE 3000
USER node
# `serve` = vite preview --host 0.0.0.0 (lê PORT/BASE_PATH/API_URL do ambiente)
CMD ["pnpm", "run", "serve"]
